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
  const lockFiles = [
    { file: "bun.lockb", pm: "bun" as const },
    { file: "bun.lock", pm: "bun" as const },
    { file: "pnpm-lock.yaml", pm: "pnpm" as const },
    { file: "yarn.lock", pm: "yarn" as const },
  ];

  const results = await Promise.allSettled(
    lockFiles.map(({ file }) => fs.access(path.join(dir, file))),
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      return lockFiles[i].pm;
    }
  }

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

        // Resolve commands for all requested checks (sequential — just switch logic + one possible fs.access)
        const checkCommands: Array<{ check: string; cmd: string | null }> = [];
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

          checkCommands.push({ check, cmd });
        }

        // Run all non-null commands concurrently via Promise.allSettled
        const execResults = await Promise.allSettled(
          checkCommands.map(({ cmd }) => {
            if (cmd === null) {
              return Promise.resolve(null);
            }
            return execAsync(cmd, {
              cwd: dir,
              timeout: 180_000,
              env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
            });
          }),
        );

        // Collect results in original requested order
        const results: string[] = [];
        let allPassed = true;

        for (let i = 0; i < checkCommands.length; i++) {
          const { check } = checkCommands[i];
          const settled = execResults[i];

          if (settled.status === "fulfilled" && settled.value === null) {
            results.push(`- ${check}: skipped (no script found)`);
            continue;
          }

          if (settled.status === "fulfilled") {
            const { stdout, stderr } = settled.value as {
              stdout: string;
              stderr: string;
            };
            const output = (stdout + (stderr ? `\n${stderr}` : "")).trim();
            const preview =
              output.length > 500
                ? output.slice(0, 500) + "\n… (truncated)"
                : output;
            results.push(`- ${check}: PASSED\n\`\`\`\n${preview}\n\`\`\``);
          } else {
            allPassed = false;
            const err = settled.reason as any;
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
