import { tool } from "@opencode-ai/plugin";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { WORKSPACE_DIR, WORKTREES_DIR, WORKTREE_CHECKOUTS_DIR } from "../constants";
import type { PlanMetadata } from "../types";

const execAsync = promisify(exec);

function metadataDir(repoRoot: string): string {
  return path.join(repoRoot, WORKTREES_DIR);
}

function metadataPath(repoRoot: string, planName: string, workstream: string): string {
  return path.join(metadataDir(repoRoot), `${planName}-${workstream}.json`);
}

function planMetadataPath(repoRoot: string, planName: string): string {
  return path.join(metadataDir(repoRoot), `_plan_${planName}.json`);
}

function worktreePath(repoRoot: string, planName: string, workstream: string): string {
  return path.join(repoRoot, WORKTREE_CHECKOUTS_DIR, `${planName}-${workstream}`);
}

function planWorktreeCheckoutPath(repoRoot: string, planName: string): string {
  return path.join(repoRoot, WORKTREE_CHECKOUTS_DIR, planName);
}

function planBranchName(planName: string): string {
  return `blueprint/${planName}/_plan`;
}

function branchName(planName: string, workstream: string): string {
  return `blueprint/${planName}/${workstream}`;
}

async function readPlanMetadata(repoRoot: string, planName: string): Promise<PlanMetadata | null> {
  try {
    const raw = await fs.readFile(planMetadataPath(repoRoot, planName), "utf-8");
    return JSON.parse(raw) as PlanMetadata;
  } catch {
    return null;
  }
}

async function writePlanMetadata(repoRoot: string, meta: PlanMetadata): Promise<void> {
  const dir = metadataDir(repoRoot);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(planMetadataPath(repoRoot, meta.planName), JSON.stringify(meta, null, 2));
}

export function createWorktreeTools() {
  return {
    blueprint_worktree_create: tool({
      description: [
        "Create a git worktree for an isolated workstream. Returns the absolute path to the new worktree directory.",
        "",
        "When called WITHOUT a workstream, creates a plan-level worktree that acts as the",
        "orchestrator's isolated execution base. All workstream merges target this worktree.",
        "Idempotent: returns the existing path if the plan worktree already exists.",
        "",
        "When called WITH a workstream, creates a workstream worktree branched from the",
        "plan branch. The plan worktree must already exist.",
      ].join("\n"),
      args: {
        planName: tool.schema
          .string()
          .describe("Name of the plan this workstream belongs to"),
        workstream: tool.schema
          .string()
          .optional()
          .describe(
            "Workstream identifier (e.g., ws1, ws2). Omit to create the plan-level worktree.",
          ),
        baseBranch: tool.schema
          .string()
          .optional()
          .describe(
            "Branch to base the worktree on. For plan worktrees, defaults to current HEAD. " +
            "For workstream worktrees, defaults to the plan branch.",
          ),
      },
      async execute(args, ctx) {
        const repoRoot = ctx.worktree;

        try {
          // ── Plan worktree creation (no workstream) ───────────────────────
          if (!args.workstream) {
            const existingPlanMeta = await readPlanMetadata(repoRoot, args.planName);

            // Idempotent: if plan worktree already exists, return its path
            if (existingPlanMeta) {
              return [
                `Plan worktree already exists.`,
                `  Plan worktree path: ${existingPlanMeta.planWorktreePath}`,
                `  Plan branch: ${existingPlanMeta.planBranch}`,
                `  Base branch: ${existingPlanMeta.baseBranch}`,
                ``,
                `Use this plan worktree path for \`blueprint_verify\` and code review commands.`,
              ].join("\n");
            }

            const planWtPath = planWorktreeCheckoutPath(repoRoot, args.planName);
            const planBranch = planBranchName(args.planName);
            const baseRef = args.baseBranch || "HEAD";

            // Record current state (both reads are independent — run concurrently)
            const [{ stdout: sha }, { stdout: currentBranchRaw }] = await Promise.all([
              execAsync("git rev-parse HEAD", { cwd: repoRoot }),
              execAsync("git branch --show-current", { cwd: repoRoot }),
            ]);
            // Detached HEAD fallback: use the SHA itself
            const currentBranch = currentBranchRaw.trim() || sha.trim();

            // Create the plan-level worktree
            await execAsync(
              `git worktree add "${planWtPath}" -b "${planBranch}" ${baseRef}`,
              { cwd: repoRoot },
            );

            // Persist plan metadata
            await writePlanMetadata(repoRoot, {
              planName: args.planName,
              baseSha: sha.trim(),
              baseBranch: currentBranch,
              planWorktreePath: planWtPath,
              planBranch,
              createdAt: new Date().toISOString(),
            });

            return [
              `Plan worktree created (isolated execution base).`,
              `  Plan worktree path: ${planWtPath}`,
              `  Plan branch: ${planBranch}`,
              `  Base branch: ${currentBranch}`,
              `  Base SHA: ${sha.trim()}`,
              ``,
              `Use this plan worktree path for \`blueprint_verify\` and code review commands.`,
              `All workstream merges will target this worktree automatically.`,
            ].join("\n");
          }

          // ── Workstream worktree creation ─────────────────────────────────
          const planMeta = await readPlanMetadata(repoRoot, args.planName);
          if (!planMeta) {
            return [
              `Error: no plan worktree exists for "${args.planName}".`,
              `Call blueprint_worktree_create with only planName (no workstream) first`,
              `to create the plan-level worktree.`,
            ].join("\n");
          }

          const wtPath = worktreePath(repoRoot, args.planName, args.workstream);
          const branch = branchName(args.planName, args.workstream);

          // Default base to the plan branch so workstreams branch from the plan
          const baseRef = args.baseBranch || planMeta.planBranch;

          await execAsync(
            `git worktree add "${wtPath}" -b "${branch}" "${baseRef}"`,
            { cwd: repoRoot },
          );

          // Persist workstream metadata
          const dir = metadataDir(repoRoot);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(
            metadataPath(repoRoot, args.planName, args.workstream),
            JSON.stringify(
              {
                path: wtPath,
                branch,
                workstream: args.workstream,
                planName: args.planName,
                status: "active",
                createdAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          );

          return [
            `Worktree created successfully.`,
            `  Path: ${wtPath}`,
            `  Branch: ${branch}`,
            `  Workstream: ${args.workstream}`,
            `  Based on: ${baseRef}`,
            ``,
            `Instruct worker subagents to use this absolute path for all file operations.`,
          ].join("\n");
        } catch (err: any) {
          return `Error creating worktree: ${err.message}`;
        }
      },
    }),

    blueprint_worktree_merge: tool({
      description:
        "Merge a workstream branch back into the plan branch. " +
        "Runs in the plan worktree (not the main checkout) for concurrency safety. " +
        "Run this after all tasks in a workstream pass verification.",
      args: {
        planName: tool.schema.string().describe("Name of the plan"),
        workstream: tool.schema
          .string()
          .describe("Workstream identifier to merge"),
        targetBranch: tool.schema
          .string()
          .optional()
          .describe(
            "Branch to merge into. Defaults to the plan branch.",
          ),
      },
      async execute(args, ctx) {
        const repoRoot = ctx.worktree;
        const branch = branchName(args.planName, args.workstream);

        try {
          // Resolve the plan worktree — merge happens there, not in the main checkout
          const planMeta = await readPlanMetadata(repoRoot, args.planName);
          const mergeDir = planMeta?.planWorktreePath || repoRoot;
          const target = args.targetBranch || planMeta?.planBranch;

          let mergeTarget: string;
          if (!target) {
            const { stdout: currentBranch } = await execAsync(
              "git branch --show-current",
              { cwd: mergeDir },
            );
            // fallback: merge into whatever branch the merge dir is on
            mergeTarget = currentBranch.trim();
          } else {
            mergeTarget = target;
          }

          // Ensure we're on the target branch in the plan worktree
          await execAsync(`git checkout "${mergeTarget}"`, { cwd: mergeDir });

          // Merge
          const { stdout } = await execAsync(
            `git merge "${branch}" --no-edit`,
            { cwd: mergeDir },
          );

          // Update workstream metadata
          try {
            const mp = metadataPath(repoRoot, args.planName, args.workstream);
            const raw = await fs.readFile(mp, "utf-8");
            const meta = JSON.parse(raw);
            meta.status = "merged";
            meta.mergedAt = new Date().toISOString();
            await fs.writeFile(mp, JSON.stringify(meta, null, 2));
          } catch {
            // metadata file may not exist — non-fatal
          }

          return [
            `Merged ${branch} into ${mergeTarget}:`,
            stdout,
            planMeta ? `(merged in plan worktree: ${mergeDir})` : "",
          ]
            .filter(Boolean)
            .join("\n");
        } catch (err: any) {
          if (err.message?.includes("CONFLICT")) {
            return (
              `Merge conflict detected merging ${branch}.\n` +
              `Manual resolution required:\n${err.stderr || err.message}`
            );
          }
          return `Error merging: ${err.message}`;
        }
      },
    }),

    blueprint_worktree_cleanup: tool({
      description:
        "Remove a worktree and optionally delete its branch. Use after merging or when abandoning a workstream.",
      args: {
        planName: tool.schema.string().describe("Name of the plan"),
        workstream: tool.schema.string().describe("Workstream identifier"),
        deleteBranch: tool.schema
          .boolean()
          .optional()
          .describe("Also delete the branch. Defaults to true."),
      },
      async execute(args, ctx) {
        const repoRoot = ctx.worktree;
        const wtPath = worktreePath(repoRoot, args.planName, args.workstream);
        const branch = branchName(args.planName, args.workstream);
        const results: string[] = [];

        try {
          await execAsync(`git worktree remove "${wtPath}" --force`, {
            cwd: repoRoot,
          });
          results.push(`Removed worktree: ${wtPath}`);
        } catch (err: any) {
          results.push(`Warning removing worktree: ${err.message}`);
          // Try pruning stale refs
          try {
            await execAsync("git worktree prune", { cwd: repoRoot });
            results.push("Pruned stale worktree references.");
          } catch {}
        }

        if (args.deleteBranch !== false) {
          try {
            await execAsync(`git branch -D "${branch}"`, { cwd: repoRoot });
            results.push(`Deleted branch: ${branch}`);
          } catch (err: any) {
            results.push(`Warning deleting branch: ${err.message}`);
          }
        }

        // Update metadata
        try {
          const mp = metadataPath(repoRoot, args.planName, args.workstream);
          const raw = await fs.readFile(mp, "utf-8");
          const meta = JSON.parse(raw);
          meta.status = "removed";
          meta.removedAt = new Date().toISOString();
          await fs.writeFile(mp, JSON.stringify(meta, null, 2));
        } catch {}

        return results.join("\n");
      },
    }),

    blueprint_worktree_list: tool({
      description:
        "List all git worktrees for this repository, including Blueprint metadata (plan, workstream, status).",
      args: {
        planName: tool.schema
          .string()
          .optional()
          .describe("Filter by plan name"),
      },
      async execute(args, ctx) {
        const repoRoot = ctx.worktree;

        try {
          const { stdout } = await execAsync("git worktree list", {
            cwd: repoRoot,
          });

          // Read plan-level metadata
          const dir = metadataDir(repoRoot);
          const planMetas: PlanMetadata[] = [];
          const workstreamMetas: any[] = [];

          try {
            const files = await fs.readdir(dir);

            // Filter files first, then read all matching files in parallel
            const planFiles = files.filter(
              (f) =>
                f.endsWith(".json") &&
                f.startsWith("_plan_") &&
                (!args.planName || f.includes(args.planName)),
            );
            const workstreamFiles = files.filter(
              (f) =>
                f.endsWith(".json") &&
                !f.startsWith("_plan_") &&
                (!args.planName || f.startsWith(args.planName)),
            );

            const [planRaws, workstreamRaws] = await Promise.all([
              Promise.all(planFiles.map((f) => fs.readFile(path.join(dir, f), "utf-8"))),
              Promise.all(workstreamFiles.map((f) => fs.readFile(path.join(dir, f), "utf-8"))),
            ]);

            for (const raw of planRaws) planMetas.push(JSON.parse(raw));
            for (const raw of workstreamRaws) workstreamMetas.push(JSON.parse(raw));
          } catch {
            // No metadata directory yet
          }

          let result = `## Git Worktrees\n\`\`\`\n${stdout}\`\`\`\n`;

          if (planMetas.length > 0) {
            result += `\n## Blueprint Plans\n`;
            for (const p of planMetas) {
              result += `- **${p.planName}** (plan worktree): \`${p.planWorktreePath}\` [${p.planBranch}] base: ${p.baseBranch}\n`;
            }
          }

          if (workstreamMetas.length > 0) {
            result += `\n## Blueprint Workstreams\n`;
            for (const m of workstreamMetas) {
              result += `- **${m.planName}/${m.workstream}** (${m.status}): \`${m.path}\` [${m.branch}]\n`;
            }
          }

          if (planMetas.length === 0 && workstreamMetas.length === 0) {
            result += "\nNo Blueprint metadata found.\n";
          }

          return result;
        } catch (err: any) {
          return `Error listing worktrees: ${err.message}`;
        }
      },
    }),

    blueprint_worktree_finalize: tool({
      description: [
        "Finalize a plan: prune all remaining worktrees for the plan,",
        "consolidate all commits on the plan branch into a single commit,",
        "merge the plan branch back into the original base branch, and",
        "clean up the plan worktree.",
      ].join(" "),
      args: {
        planName: tool.schema
          .string()
          .describe("Name of the plan to finalize"),
        commitMessage: tool.schema
          .string()
          .optional()
          .describe(
            "Commit message for the consolidated commit. Defaults to 'blueprint: <planName>'.",
          ),
      },
      async execute(args, ctx) {
        const repoRoot = ctx.worktree;
        const results: string[] = [];

        try {
          // 1. Read plan metadata
          const planMeta = await readPlanMetadata(repoRoot, args.planName);
          if (!planMeta) {
            return `Error: no plan metadata found for "${args.planName}". Was blueprint_worktree_create ever called for this plan?`;
          }

          const planWtPath = planMeta.planWorktreePath;
          const planBranch = planMeta.planBranch;
          const baseBranch = planMeta.baseBranch;

          // 2. Prune all workstream worktrees belonging to this plan
          const dir = metadataDir(repoRoot);
          let files: string[] = [];
          try {
            files = await fs.readdir(dir);
          } catch {
            // No metadata directory
          }

          // Filter workstream files for this plan, then clean up all in parallel
          const workstreamCleanupFiles = files.filter(
            (f) =>
              f.endsWith(".json") &&
              !f.startsWith("_plan_") &&
              f.startsWith(`${args.planName}-`),
          );

          const cleanupSettled = await Promise.allSettled(
            workstreamCleanupFiles.map(async (file) => {
              const wsResults: string[] = [];

              const raw = await fs.readFile(path.join(dir, file), "utf-8");
              const meta = JSON.parse(raw);
              if (meta.status === "removed") return wsResults;

              const wtPath = meta.path;
              const branch = meta.branch;

              // Remove worktree
              try {
                await execAsync(`git worktree remove "${wtPath}" --force`, {
                  cwd: repoRoot,
                });
                wsResults.push(`Removed worktree: ${wtPath}`);
              } catch {
                try {
                  await execAsync("git worktree prune", { cwd: repoRoot });
                  wsResults.push(`Pruned stale worktree: ${wtPath}`);
                } catch {}
              }

              // Delete branch
              try {
                await execAsync(`git branch -D "${branch}"`, { cwd: repoRoot });
                wsResults.push(`Deleted branch: ${branch}`);
              } catch {}

              // Update metadata
              meta.status = "removed";
              meta.removedAt = new Date().toISOString();
              await fs.writeFile(path.join(dir, file), JSON.stringify(meta, null, 2));

              return wsResults;
            }),
          );

          // Collect results from all workstreams (including failures)
          for (const settled of cleanupSettled) {
            if (settled.status === "fulfilled") {
              results.push(...settled.value);
            } else {
              results.push(`Warning cleaning up workstream: ${settled.reason?.message ?? settled.reason}`);
            }
          }

          // Run a final worktree prune
          try {
            await execAsync("git worktree prune", { cwd: repoRoot });
          } catch {}

          // 3. Consolidate commits on the plan branch (in the plan worktree)
          const { stdout: planHeadSha } = await execAsync("git rev-parse HEAD", {
            cwd: planWtPath,
          });

          if (planHeadSha.trim() === planMeta.baseSha) {
            results.push("No new commits to consolidate on plan branch.");
          } else {
            const { stdout: diffStat } = await execAsync(
              `git diff --stat "${planMeta.baseSha}" HEAD`,
              { cwd: planWtPath },
            );

            if (!diffStat.trim()) {
              results.push("No file changes to consolidate.");
            } else {
              const message =
                args.commitMessage || `blueprint: ${args.planName}`;

              // Soft-reset to the base SHA (keeps all changes staged)
              await execAsync(`git reset --soft "${planMeta.baseSha}"`, {
                cwd: planWtPath,
              });

              // Create a single consolidated commit
              await execAsync(
                `git commit -m "${message.replace(/"/g, '\\"')}"`,
                { cwd: planWtPath },
              );

              const { stdout: newSha } = await execAsync(
                "git rev-parse --short HEAD",
                { cwd: planWtPath },
              );

              results.push(
                `Consolidated commits into single commit: ${newSha.trim()} "${message}"`,
              );
            }
          }

          // 4. Merge the plan branch into the original base branch (in main checkout)
          try {
            // Ensure we're on the base branch
            await execAsync(`git checkout "${baseBranch}"`, { cwd: repoRoot });

            const { stdout: mergeOutput } = await execAsync(
              `git merge "${planBranch}" --no-edit`,
              { cwd: repoRoot },
            );

            results.push(`Merged ${planBranch} into ${baseBranch}:\n${mergeOutput.trim()}`);
          } catch (err: any) {
            if (err.message?.includes("CONFLICT")) {
              results.push(
                `Merge conflict merging ${planBranch} into ${baseBranch}.\n` +
                `Manual resolution required:\n${err.stderr || err.message}`,
              );
              // Don't proceed with cleanup on conflict
              return results.join("\n");
            }
            results.push(`Warning merging plan branch to base: ${err.message}`);
          }

          // 5. Remove the plan worktree and delete the plan branch
          try {
            await execAsync(`git worktree remove "${planWtPath}" --force`, {
              cwd: repoRoot,
            });
            results.push(`Removed plan worktree: ${planWtPath}`);
          } catch {
            try {
              await execAsync("git worktree prune", { cwd: repoRoot });
              results.push(`Pruned plan worktree: ${planWtPath}`);
            } catch {}
          }

          try {
            await execAsync(`git branch -D "${planBranch}"`, { cwd: repoRoot });
            results.push(`Deleted plan branch: ${planBranch}`);
          } catch {}

          // 6. Clean up plan metadata file
          try {
            await fs.unlink(planMetadataPath(repoRoot, args.planName));
          } catch {}

          return results.length > 0
            ? results.join("\n")
            : "Plan finalized (nothing to clean up).";
        } catch (err: any) {
          return `Error finalizing plan: ${err.message}`;
        }
      },
    }),
  };
}
