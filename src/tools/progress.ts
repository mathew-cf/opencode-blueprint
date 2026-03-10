import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { PLANS_DIR } from "../constants";

export function createProgressTools() {
  return {
    blueprint_progress: tool({
      description:
        "Update plan checkboxes and/or get a completion summary. Use to mark tasks as implemented/verified, or call without a taskId to get current progress.",
      args: {
        planName: tool.schema.string().describe("Name of the plan"),
        taskId: tool.schema
          .string()
          .optional()
          .describe("Task ID to update (e.g., W1-1). Omit to just get status."),
        field: tool.schema
          .enum(["implemented", "verified"])
          .optional()
          .describe("Which checkbox to toggle. Required when taskId is set."),
        value: tool.schema
          .boolean()
          .optional()
          .describe("Check (true) or uncheck (false). Defaults to true."),
      },
      async execute(args, ctx) {
        const planPath = path.join(
          ctx.directory,
          PLANS_DIR,
          `${args.planName}.md`,
        );

        let content: string;
        try {
          content = await fs.readFile(planPath, "utf-8");
        } catch {
          return `Plan not found: ${args.planName}\nExpected path: ${planPath}`;
        }

        // ── Update checkbox if taskId + field provided ──
        if (args.taskId && args.field) {
          const checked = args.value !== false;
          const label =
            args.field === "implemented" ? "Implemented" : "Verified";

          // Find the task section, then find the checkbox within it
          const taskHeaderPattern = new RegExp(
            `#### Task ${escapeRegex(args.taskId)}:`,
          );
          const headerMatch = taskHeaderPattern.exec(content);

          if (!headerMatch) {
            return `Task ${args.taskId} not found in plan "${args.planName}".`;
          }

          // Search for the checkbox after the header
          const afterHeader = content.slice(headerMatch.index);
          const checkboxPattern = new RegExp(
            `- \\[[ x]\\] ${label}`,
          );
          const cbMatch = checkboxPattern.exec(afterHeader);

          if (!cbMatch) {
            return `Checkbox "${label}" not found for task ${args.taskId}.`;
          }

          const absoluteIndex = headerMatch.index + cbMatch.index;
          const oldCheckbox = cbMatch[0];
          const newCheckbox = checked
            ? `- [x] ${label}`
            : `- [ ] ${label}`;

          content =
            content.slice(0, absoluteIndex) +
            newCheckbox +
            content.slice(absoluteIndex + oldCheckbox.length);

          await fs.writeFile(planPath, content);
        }

        // ── Generate summary ──
        const implChecked = (content.match(/- \[x\] Implemented/g) || [])
          .length;
        const implTotal = (content.match(/- \[[ x]\] Implemented/g) || [])
          .length;
        const verChecked = (content.match(/- \[x\] Verified/g) || []).length;
        const verTotal = (content.match(/- \[[ x]\] Verified/g) || []).length;

        const lines: string[] = [
          `## Progress: ${args.planName}`,
          ``,
          `| Metric | Done | Total |`,
          `|--------|------|-------|`,
          `| Implemented | ${implChecked} | ${implTotal} |`,
          `| Verified | ${verChecked} | ${verTotal} |`,
        ];

        if (
          implTotal > 0 &&
          implChecked === implTotal &&
          verChecked === verTotal
        ) {
          lines.push("", "All tasks complete.");
        } else {
          // List incomplete tasks
          const taskPattern =
            /#### Task ([\w-]+):.*?\n[\s\S]*?(?=#### Task |### Wave |## |$)/g;
          const incomplete: string[] = [];

          let match: RegExpExecArray | null;
          while ((match = taskPattern.exec(content)) !== null) {
            const section = match[0];
            const taskId = match[1];
            const needsImpl = section.includes("- [ ] Implemented");
            const needsVer = section.includes("- [ ] Verified");
            if (needsImpl || needsVer) {
              const needs: string[] = [];
              if (needsImpl) needs.push("implement");
              if (needsVer) needs.push("verify");
              incomplete.push(`- ${taskId}: needs ${needs.join(", ")}`);
            }
          }

          if (incomplete.length > 0) {
            lines.push("", "### Remaining", ...incomplete);
          }
        }

        return lines.join("\n");
      },
    }),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
