import { PLANS_DIR } from "./constants";

/**
 * Register Blueprint slash commands on the config object.
 * Called from the plugin's `config` hook.
 */
export function registerCommands(config: Record<string, any>): void {
  if (!config.command) config.command = {};

  config.command["plan"] = {
    description: "Start a Blueprint planning session",
    agent: "blueprinter",
    template: `\
Start a Blueprint planning session — Phases 1, 2, and 3 only.

The user wants to plan the following:
$ARGUMENTS

Run Phase 1 (Investigation), Phase 2 (Plan), and Phase 3 (Review) in full. \
Do NOT proceed to Phase 4 (Execution). STOP after Phase 3 is complete.

Once the plan has been reviewed and saved, inform the user that planning is \
complete and they can run \`/execute\` (or \`/blueprint\`) to proceed with execution.`,
  };

  config.command["execute"] = {
    description: "Execute a Blueprint plan",
    agent: "blueprinter",
    template: `\
Execute a Blueprint plan — Phase 4 only.

Plan requested: $ARGUMENTS

Skip Phases 1, 2, and 3 entirely. Go directly to Phase 4 (Execution).

If a plan name was provided above, load it from \`${PLANS_DIR}/\`.
If no plan name was provided, list all available plans in \`${PLANS_DIR}/\` and \
ask the user which one to execute.

Once the plan is loaded, execute it via worker agents: dispatch waves in parallel, \
verify each task, and merge all completed workstreams.`,
  };

  config.command["blueprint"] = {
    description:
      "Run the full Blueprint lifecycle from ticket to merged code",
    agent: "blueprinter",
    template: `\
Run the full Blueprint end-to-end lifecycle.

Ticket or request: $ARGUMENTS

If $ARGUMENTS is a ticket ID (e.g. PROJ-123) or a ticket URL, use it \
as the source of requirements for this lifecycle run.

If no argument was provided, fall back to the current git branch name to infer \
the ticket ID (branch names typically follow the pattern \`PROJ-123-short-description\`).

Begin Phase 1 immediately: fetch the ticket details and gather all requirements. \
Then proceed through the full Blueprint lifecycle: investigate the codebase, produce \
an implementation plan, execute the plan via worker agents, verify each task, and \
merge all completed workstreams.`,
  };
}
