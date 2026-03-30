import { blueprinterPrompt } from "./prompts/blueprinter";
import { investigatorPrompt } from "./prompts/investigator";
import { reviewerCompletenessPrompt } from "./prompts/reviewer";
import { reviewerStructurePrompt } from "./prompts/reviewer-structure";
import { workerPrompt } from "./prompts/worker";

/**
 * Register all Blueprint agents on the config object.
 * Called from the plugin's `config` hook.
 */
export function registerAgents(config: Record<string, any>): void {
  if (!config.agent) config.agent = {};

  // Disable blueprint_* tools globally so they don't consume context for
  // non-blueprint agents.  Only the blueprinter re-enables them below.
  if (!config.permission) config.permission = {};
  config.permission["blueprint_*"] = "deny";

  // -- Primary agents (visible in agent switcher) --

  config.agent["blueprinter"] = {
    model: "anthropic/claude-opus-4-6",
    temperature: 0.1,
    prompt: blueprinterPrompt,
    mode: "primary",
    color: "#F97316",
    description:
      "Run the full Blueprint lifecycle from ticket to merged code",
    // Blueprinter needs all blueprint tools for the full lifecycle.
    // Guardrail hook prevents writes outside .blueprint/.
    permission: {
      "blueprint_*": "allow",
    },
  };

  // -- Subagents (spawned via Task tool, not in switcher) --

  config.agent["investigator"] = {
    model: "anthropic/claude-sonnet-4-6",
    temperature: 0.1,
    prompt: investigatorPrompt,
    mode: "subagent",
    color: "#8B5CF6",
    description: "Deep codebase research and pattern discovery",
    // Read-only: no file writes needed.
    permission: {
      edit: "deny",
    },
  };

  config.agent["reviewer-completeness"] = {
    model: "anthropic/claude-opus-4-6",
    temperature: 0.1,
    prompt: reviewerCompletenessPrompt,
    mode: "subagent",
    color: "#F59E0B",
    description:
      "Review plans and code for requirements completeness and quality gaps",
    // Read-only, no shell: reviews only need to read files and reason.
    permission: {
      edit: "deny",
      bash: "deny",
    },
  };

  config.agent["reviewer-structure"] = {
    model: "anthropic/claude-sonnet-4-6",
    temperature: 0.1,
    prompt: reviewerStructurePrompt,
    mode: "subagent",
    color: "#14B8A6",
    description:
      "Review plans for task atomicity, dependency ordering, and parallelism conflicts",
    // Read-only, no shell: reviews only need to read files and reason.
    permission: {
      edit: "deny",
      bash: "deny",
    },
  };

  config.agent["worker"] = {
    model: "anthropic/claude-sonnet-4-6",
    temperature: 0.1,
    prompt: workerPrompt,
    mode: "subagent",
    color: "#EC4899",
    description: "Implement a single atomic task in an isolated worktree",
  };
}
