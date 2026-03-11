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
      description:
        "Create a git worktree for an isolated workstream. Returns the absolute path to the new worktree directory.",
      args: {
        planName: tool.schema
          .string()
          .describe("Name of the plan this workstream belongs to"),
        workstream: tool.schema
          .string()
          .describe("Workstream identifier (e.g., ws1, ws2)"),
        baseBranch: tool.schema
          .string()
          .optional()
          .describe("Branch to base the worktree on. Defaults to current HEAD."),
      },
      async execute(args, ctx) {
        const repoRoot = ctx.worktree;
        const wtPath = worktreePath(repoRoot, args.planName, args.workstream);
        const branch = branchName(args.planName, args.workstream);

        try {
          const baseRef = args.baseBranch || "HEAD";

          // Record the base SHA for this plan if not already recorded
          const existingPlanMeta = await readPlanMetadata(repoRoot, args.planName);
          if (!existingPlanMeta) {
            const { stdout: sha } = await execAsync("git rev-parse HEAD", { cwd: repoRoot });
            await writePlanMetadata(repoRoot, {
              planName: args.planName,
              baseSha: sha.trim(),
              createdAt: new Date().toISOString(),
            });
          }

          await execAsync(
            `git worktree add "${wtPath}" -b "${branch}" ${baseRef}`,
            { cwd: repoRoot },
          );

          // Persist metadata
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
        "Merge a workstream branch back into the current branch. Run this after all tasks in a workstream pass verification.",
      args: {
        planName: tool.schema.string().describe("Name of the plan"),
        workstream: tool.schema
          .string()
          .describe("Workstream identifier to merge"),
        targetBranch: tool.schema
          .string()
          .optional()
          .describe(
            "Branch to merge into. Defaults to the current branch of the main checkout.",
          ),
      },
      async execute(args, ctx) {
        const repoRoot = ctx.worktree;
        const branch = branchName(args.planName, args.workstream);

        try {
          const { stdout: currentBranch } = await execAsync(
            "git branch --show-current",
            { cwd: repoRoot },
          );
          const target = args.targetBranch || currentBranch.trim();

          // Ensure we're on the target
          await execAsync(`git checkout "${target}"`, { cwd: repoRoot });

          // Merge
          const { stdout } = await execAsync(
            `git merge "${branch}" --no-edit`,
            { cwd: repoRoot },
          );

          // Update metadata
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

          return `Merged ${branch} into ${target}:\n${stdout}`;
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

          // Read Blueprint metadata
          const dir = metadataDir(repoRoot);
          const metadata: any[] = [];
          try {
            const files = await fs.readdir(dir);
            for (const file of files) {
              if (!file.endsWith(".json")) continue;
              // Skip plan-level metadata files
              if (file.startsWith("_plan_")) continue;
              if (args.planName && !file.startsWith(args.planName)) continue;
              const raw = await fs.readFile(path.join(dir, file), "utf-8");
              metadata.push(JSON.parse(raw));
            }
          } catch {
            // No metadata directory yet
          }

          let result = `## Git Worktrees\n\`\`\`\n${stdout}\`\`\`\n`;

          if (metadata.length > 0) {
            result += `\n## Blueprint Workstreams\n`;
            for (const m of metadata) {
              result += `- **${m.planName}/${m.workstream}** (${m.status}): \`${m.path}\` [${m.branch}]\n`;
            }
          } else {
            result += "\nNo Blueprint workstream metadata found.\n";
          }

          return result;
        } catch (err: any) {
          return `Error listing worktrees: ${err.message}`;
        }
      },
    }),

    blueprint_worktree_finalize: tool({
      description:
        "Finalize a plan: prune all remaining worktrees for the plan and consolidate all commits since the plan started into a single commit.",
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
          // 1. Read plan metadata to get the base SHA
          const planMeta = await readPlanMetadata(repoRoot, args.planName);
          if (!planMeta) {
            return `Error: no plan metadata found for "${args.planName}". Was blueprint_worktree_create ever called for this plan?`;
          }

          // 2. Prune all worktrees belonging to this plan
          const dir = metadataDir(repoRoot);
          let files: string[] = [];
          try {
            files = await fs.readdir(dir);
          } catch {
            // No metadata directory
          }

          for (const file of files) {
            if (!file.endsWith(".json") || file.startsWith("_plan_")) continue;
            if (!file.startsWith(`${args.planName}-`)) continue;

            const raw = await fs.readFile(path.join(dir, file), "utf-8");
            const meta = JSON.parse(raw);
            if (meta.status === "removed") continue;

            const wtPath = meta.path;
            const branch = meta.branch;

            // Remove worktree
            try {
              await execAsync(`git worktree remove "${wtPath}" --force`, {
                cwd: repoRoot,
              });
              results.push(`Removed worktree: ${wtPath}`);
            } catch {
              try {
                await execAsync("git worktree prune", { cwd: repoRoot });
                results.push(`Pruned stale worktree: ${wtPath}`);
              } catch {}
            }

            // Delete branch
            try {
              await execAsync(`git branch -D "${branch}"`, { cwd: repoRoot });
              results.push(`Deleted branch: ${branch}`);
            } catch {}

            // Update metadata
            meta.status = "removed";
            meta.removedAt = new Date().toISOString();
            await fs.writeFile(path.join(dir, file), JSON.stringify(meta, null, 2));
          }

          // Run a final worktree prune to clean up any stale refs
          try {
            await execAsync("git worktree prune", { cwd: repoRoot });
          } catch {}

          // 3. Consolidate commits into a single commit
          const { stdout: currentSha } = await execAsync("git rev-parse HEAD", {
            cwd: repoRoot,
          });

          if (currentSha.trim() === planMeta.baseSha) {
            results.push("No new commits to consolidate.");
          } else {
            // Check that there are actual changes between base and HEAD
            const { stdout: diffStat } = await execAsync(
              `git diff --stat "${planMeta.baseSha}" HEAD`,
              { cwd: repoRoot },
            );

            if (!diffStat.trim()) {
              results.push("No file changes to consolidate.");
            } else {
              const message =
                args.commitMessage || `blueprint: ${args.planName}`;

              // Soft-reset to the base SHA (keeps all changes staged)
              await execAsync(`git reset --soft "${planMeta.baseSha}"`, {
                cwd: repoRoot,
              });

              // Create a single consolidated commit
              await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
                cwd: repoRoot,
              });

              const { stdout: newSha } = await execAsync(
                "git rev-parse --short HEAD",
                { cwd: repoRoot },
              );

              results.push(
                `Consolidated commits into single commit: ${newSha.trim()} "${message}"`,
              );
            }
          }

          // 4. Clean up plan metadata file
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
