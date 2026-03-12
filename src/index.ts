import type { Plugin } from "@opencode-ai/plugin";
import * as path from "node:path";
import { registerAgents } from "./agents";
import { registerCommands } from "./commands";
import { createWorktreeTools } from "./tools/worktree";
import { createProgressTools } from "./tools/progress";
import { createVerifyTools } from "./tools/verify";
import { createPlanTools } from "./tools/plan";
import {
  createChatMessageHook,
  createGuardrailHook,
  createEventHook,
} from "./hooks";

const BlueprintPlugin: Plugin = async (input) => {
  const { directory } = input;

  // Compose tools from all modules
  const tools = {
    ...createWorktreeTools(),
    ...createProgressTools(),
    ...createVerifyTools(),
    ...createPlanTools(),
  };

  return {
    // -- Custom tools --
    tool: tools,

    // -- Agent & command registration --
    config: async (config: Record<string, any>) => {
      registerAgents(config);
      registerCommands(config);
    },

    // -- Track which agent owns each session (needed for guardrails) --
    "chat.message": createChatMessageHook(),

    // -- Enforce write boundaries per agent --
    "tool.execute.before": createGuardrailHook(directory),

    // -- Session lifecycle cleanup --
    event: createEventHook(),
  };
};

export default BlueprintPlugin;
