import { PLANS_DIR } from "./constants";

/**
 * Register Blueprint slash commands on the config object.
 * Called from the plugin's `config` hook.
 */
export function registerCommands(config: Record<string, any>): void {
  if (!config.command) config.command = {};

  config.command["plan"] = {
    description: "Start a Blueprint planning session",
    agent: "planner",
    template: `\
Start a new Blueprint planning session.

The user wants to plan the following:
$ARGUMENTS

Begin Phase 1 (Investigation) immediately. Spawn investigator subagents to \
research the codebase in parallel, then proceed through the full planning workflow.`,
  };

  config.command["execute"] = {
    description: "Execute a Blueprint plan",
    agent: "orchestrator",
    template: `\
Execute a Blueprint plan.

Plan requested: $ARGUMENTS

If a plan name was provided above, load it from \`${PLANS_DIR}/\`.
If no plan name was provided, list all available plans in \`${PLANS_DIR}/\` and \
ask the user which one to execute.

Once the plan is loaded, follow the standard orchestration workflow: \
load the plan and its linked investigation, execute waves, verify each task, \
and merge completed workstreams.`,
  };
}
