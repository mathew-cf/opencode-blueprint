import * as path from "node:path";
import { WORKSPACE_DIR, RESTRICTED_AGENTS, WRITE_TOOLS } from "./constants";

/**
 * Session → agent name tracking.
 * Populated by the chat.message hook so guardrails can identify the active agent.
 */
const sessionAgentMap = new Map<string, string>();

// ── chat.message hook ────────────────────────────────────────────────────────

export function createChatMessageHook() {
  return async (
    input: {
      sessionID: string;
      agent?: string;
      model?: { providerID: string; modelID: string };
      messageID?: string;
    },
    _output: unknown,
  ): Promise<void> => {
    if (input.agent) {
      sessionAgentMap.set(input.sessionID, input.agent);
    }
  };
}

// ── tool.execute.before hook (guardrails) ────────────────────────────────────

export function createGuardrailHook(projectDirectory: string) {
  return async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: any },
  ): Promise<void> => {
    const agent = sessionAgentMap.get(input.sessionID);
    if (!agent || !RESTRICTED_AGENTS.includes(agent)) return;

    // Only intercept file-writing tools
    const isWriteTool = WRITE_TOOLS.some((t) => input.tool.includes(t));
    if (!isWriteTool) return;

    const filePath: string | undefined =
      output.args?.filePath || output.args?.path;
    if (!filePath) return;

    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(projectDirectory, filePath);
    const workspacePath = path.resolve(projectDirectory, WORKSPACE_DIR);

    if (!resolved.startsWith(workspacePath + path.sep) && resolved !== workspacePath) {
      throw new Error(
        `[Blueprint] Agent "${agent}" cannot write files outside ${WORKSPACE_DIR}/. ` +
          `Attempted: ${filePath}\n` +
          `Only worker subagents may modify source files. ` +
          `Use the blueprinter to delegate implementation work.`,
      );
    }
  };
}

// ── event hook (lifecycle) ───────────────────────────────────────────────────

export function createEventHook() {
  return async ({ event }: { event: { type: string; properties: any } }): Promise<void> => {
    // Clean up session tracking when sessions are deleted
    if (event.type === "session.deleted") {
      sessionAgentMap.delete(event.properties?.sessionID);
    }
  };
}
