import { tool } from "@opencode-ai/plugin";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { WORKSPACE_DIR, WORKTREES_DIR, WORKTREE_CHECKOUTS_DIR } from "../constants";

const execAsync = promisify(exec);

function metadataDir(repoRoot: string): string {
  return path.join(repoRoot, WORKTREES_DIR);
}

function metadataPath(repoRoot: string, planName: string, workstream: string): string {
  return path.join(metadataDir(repoRoot), `${planName}-${workstream}.json`);
}

function worktreePath(repoRoot: string, planName: string, workstream: string): string {
  return path.join(repoRoot, WORKTREE_CHECKOUTS_DIR, `${planName}-${workstream}`);
}

function branchName(planName: string, workstream: string): string {
  return `blueprint/${planName}/${workstream}`;
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
  };
}
