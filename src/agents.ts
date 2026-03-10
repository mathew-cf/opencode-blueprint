import { plannerPrompt } from "./prompts/planner";
import { orchestratorPrompt } from "./prompts/orchestrator";
import { investigatorPrompt } from "./prompts/investigator";
import { reviewerPrompt } from "./prompts/reviewer";
import { workerPrompt } from "./prompts/worker";

/**
 * Register all Blueprint agents on the config object.
 * Called from the plugin's `config` hook.
 */
export function registerAgents(config: Record<string, any>): void {
  if (!config.agent) config.agent = {};

  // -- Primary agents (visible in agent switcher) --

  config.agent["planner"] = {
    model: "anthropic/claude-opus-4-6",
    temperature: 0.1,
    prompt: plannerPrompt,
    mode: "primary",
    color: "#3B82F6",
    description:
      "Investigate codebases and create structured implementation plans",
  };

  config.agent["orchestrator"] = {
    model: "anthropic/claude-sonnet-4-6",
    temperature: 0.1,
    prompt: orchestratorPrompt,
    mode: "primary",
    color: "#10B981",
    description:
      "Execute plans by delegating tasks to workers in isolated worktrees",
  };

  // -- Subagents (spawned via Task tool, not in switcher) --

  config.agent["investigator"] = {
    model: "anthropic/claude-sonnet-4-6",
    temperature: 0.1,
    prompt: investigatorPrompt,
    mode: "subagent",
    color: "#8B5CF6",
    description: "Deep codebase research and pattern discovery",
    tools: {
      write: false,
      edit: false,
    },
  };

  config.agent["reviewer"] = {
    model: "anthropic/claude-opus-4-6",
    temperature: 0.1,
    prompt: reviewerPrompt,
    mode: "subagent",
    color: "#F59E0B",
    description:
      "Review plans and code for gaps, scope creep, and quality issues",
    tools: {
      write: false,
      edit: false,
      bash: false,
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
