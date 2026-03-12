import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { DRAFTS_DIR, PLANS_DIR } from "../constants";

export function createPlanTools() {
  return {
    blueprint_plan_finalize: tool({
      description:
        "Move a plan from drafts to plans. Reads the draft from .blueprint/drafts/{planName}.md, writes it to .blueprint/plans/{planName}.md, and deletes the draft. Call this after the user approves the plan.",
      args: {
        planName: tool.schema
          .string()
          .describe("Name of the plan (without .md extension)"),
      },
      async execute(args, ctx) {
        const draftPath = path.join(
          ctx.directory,
          DRAFTS_DIR,
          `${args.planName}.md`,
        );
        const planPath = path.join(
          ctx.directory,
          PLANS_DIR,
          `${args.planName}.md`,
        );

        // Read the draft
        let content: string;
        try {
          content = await fs.readFile(draftPath, "utf-8");
        } catch {
          return `Draft not found: ${args.planName}\nExpected path: ${draftPath}`;
        }

        // Ensure plans directory exists
        await fs.mkdir(path.dirname(planPath), { recursive: true });

        // Write to plans
        await fs.writeFile(planPath, content);

        // Delete the draft
        await fs.rm(draftPath);

        return `Plan finalized: ${args.planName}\n  From: ${DRAFTS_DIR}/${args.planName}.md\n  To:   ${PLANS_DIR}/${args.planName}.md\n\nThe plan is now ready for execution.`;
      },
    }),
  };
}
