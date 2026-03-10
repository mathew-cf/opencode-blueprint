import type { Plugin } from "@opencode-ai/plugin";
import * as path from "node:path";
import { registerAgents } from "./agents";
import { createWorktreeTools } from "./tools/worktree";
import { createNotepadTools } from "./tools/notepad";
import { createProgressTools } from "./tools/progress";
import { createVerifyTools } from "./tools/verify";
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
    ...createNotepadTools(),
    ...createProgressTools(),
    ...createVerifyTools(),
  };

  return {
    // -- Custom tools --
    tool: tools,

    // -- Agent registration --
    config: async (config: Record<string, any>) => {
      registerAgents(config);
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
