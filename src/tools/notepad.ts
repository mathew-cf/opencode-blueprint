import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { NOTEPADS_DIR } from "../constants";

export function createNotepadTools() {
  return {
    blueprint_notepad_read: tool({
      description:
        "Read notepad entries for a plan. Returns accumulated learnings, decisions, and issues recorded during implementation — essential context for worker delegations.",
      args: {
        planName: tool.schema.string().describe("Name of the plan"),
        type: tool.schema
          .enum(["learnings", "decisions", "issues", "all"])
          .optional()
          .describe("Type of entries to read. Defaults to all."),
      },
      async execute(args, ctx) {
        const notepadDir = path.join(ctx.directory, NOTEPADS_DIR, args.planName);
        const types =
          !args.type || args.type === "all"
            ? (["learnings", "decisions", "issues"] as const)
            : ([args.type] as const);

        const sections: string[] = [];

        for (const t of types) {
          const filePath = path.join(notepadDir, `${t}.md`);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            const trimmed = content.trim();
            if (trimmed) {
              sections.push(
                `## ${t.charAt(0).toUpperCase() + t.slice(1)}\n${trimmed}`,
              );
            } else {
              sections.push(
                `## ${t.charAt(0).toUpperCase() + t.slice(1)}\n(empty)`,
              );
            }
          } catch {
            sections.push(
              `## ${t.charAt(0).toUpperCase() + t.slice(1)}\n(empty)`,
            );
          }
        }

        return sections.join("\n\n");
      },
    }),

    blueprint_notepad_write: tool({
      description:
        "Append an entry to the shared notepad for cross-agent knowledge transfer. Use after every completed task to record what was learned.",
      args: {
        planName: tool.schema.string().describe("Name of the plan"),
        type: tool.schema
          .enum(["learnings", "decisions", "issues"])
          .describe(
            "Type of entry: learnings (discoveries), decisions (choices made), issues (problems hit)",
          ),
        content: tool.schema.string().describe("Content to append"),
        taskId: tool.schema
          .string()
          .optional()
          .describe("Task ID this entry relates to (e.g., W1-1)"),
      },
      async execute(args, ctx) {
        const notepadDir = path.join(ctx.directory, NOTEPADS_DIR, args.planName);
        await fs.mkdir(notepadDir, { recursive: true });

        const filePath = path.join(notepadDir, `${args.type}.md`);
        const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
        const taskRef = args.taskId ? ` [${args.taskId}]` : "";
        const entry = `\n### ${timestamp}${taskRef}\n\n${args.content}\n`;

        await fs.appendFile(filePath, entry);

        return `Recorded ${args.type} entry${taskRef} for plan "${args.planName}".`;
      },
    }),
  };
}
