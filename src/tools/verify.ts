import { tool } from "@opencode-ai/plugin";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const execAsync = promisify(exec);

/** Detect the package manager used in a directory. */
async function detectPackageManager(
  dir: string,
): Promise<"bun" | "pnpm" | "yarn" | "npm"> {
  try {
    await fs.access(path.join(dir, "bun.lockb"));
    return "bun";
  } catch {}
  try {
    await fs.access(path.join(dir, "bun.lock"));
    return "bun";
  } catch {}
  try {
    await fs.access(path.join(dir, "pnpm-lock.yaml"));
    return "pnpm";
  } catch {}
  try {
    await fs.access(path.join(dir, "yarn.lock"));
    return "yarn";
  } catch {}
  return "npm";
}

export function createVerifyTools() {
  return {
    blueprint_verify: tool({
      description:
        "Run verification checks (tests, typecheck, lint, build) in a directory. Auto-detects available scripts from package.json. Returns pass/fail with output for each check.",
      args: {
        directory: tool.schema
          .string()
          .describe("Absolute path to the directory to verify"),
        checks: tool.schema
          .array(tool.schema.enum(["tests", "typecheck", "lint", "build"]))
          .optional()
          .describe(
            "Which checks to run. Defaults to all available. Checks without a matching script are skipped.",
          ),
      },
      async execute(args) {
        const dir = args.directory;
        const requestedChecks = args.checks || [
          "tests",
          "typecheck",
          "lint",
          "build",
        ];
        const results: string[] = [];
        let allPassed = true;

        // Read package.json scripts
        let scripts: Record<string, string> = {};
        try {
          const raw = await fs.readFile(
            path.join(dir, "package.json"),
            "utf-8",
          );
          scripts = JSON.parse(raw).scripts || {};
        } catch {}

        const pm = await detectPackageManager(dir);
        const run = pm === "npm" ? "npm run" : `${pm} run`;
        const npx =
          pm === "bun"
            ? "bunx"
            : pm === "pnpm"
              ? "pnpx"
              : pm === "yarn"
                ? "yarn"
                : "npx";

        for (const check of requestedChecks) {
          let cmd: string | null = null;

          switch (check) {
            case "tests":
              if (scripts["test"]) cmd = `${run} test`;
              else if (scripts["test:unit"]) cmd = `${run} test:unit`;
              break;

            case "typecheck":
              if (scripts["typecheck"]) cmd = `${run} typecheck`;
              else if (scripts["type-check"]) cmd = `${run} type-check`;
              else {
                // Fall back to tsc if tsconfig exists
                try {
                  await fs.access(path.join(dir, "tsconfig.json"));
                  cmd = `${npx} tsc --noEmit`;
                } catch {}
              }
              break;

            case "lint":
              if (scripts["lint"]) cmd = `${run} lint`;
              break;

            case "build":
              if (scripts["build"]) cmd = `${run} build`;
              break;
          }

          if (!cmd) {
            results.push(`- ${check}: skipped (no script found)`);
            continue;
          }

          try {
            const { stdout, stderr } = await execAsync(cmd, {
              cwd: dir,
              timeout: 180_000,
              env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
            });
            const output = (stdout + (stderr ? `\n${stderr}` : "")).trim();
            const preview =
              output.length > 500
                ? output.slice(0, 500) + "\n… (truncated)"
                : output;
            results.push(`- ${check}: PASSED\n\`\`\`\n${preview}\n\`\`\``);
          } catch (err: any) {
            allPassed = false;
            const output = (
              (err.stdout || "") +
              "\n" +
              (err.stderr || "")
            ).trim();
            const preview =
              output.length > 800
                ? output.slice(0, 800) + "\n… (truncated)"
                : output;
            results.push(`- ${check}: FAILED\n\`\`\`\n${preview}\n\`\`\``);
          }
        }

        const status = allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED";
        return `## Verification: ${status}\n\n${results.join("\n\n")}`;
      },
    }),
  };
}
