import { describe, test, expect, beforeEach } from "bun:test";
import {
  createChatMessageHook,
  createGuardrailHook,
  createEventHook,
} from "../src/hooks";
import { WORKSPACE_DIR } from "../src/constants";

describe("hooks", () => {
  // We need fresh hooks per test group to reset the internal sessionAgentMap
  // Since the map is module-level, we work around it by registering sessions
  // in each test.

  const projectDir = "/projects/myapp";

  describe("chat.message hook", () => {
    test("tracks agent for session", async () => {
      const hook = createChatMessageHook();
      await hook(
        { sessionID: "s1", agent: "blueprinter", messageID: "m1" },
        {} as any,
      );

      // Verify by using guardrail hook (it reads from the same map)
      const guardrail = createGuardrailHook(projectDir);
      // This should throw because blueprinter can't write outside .blueprint
      await expect(
        guardrail(
          { tool: "write", sessionID: "s1", callID: "c1" },
          { args: { filePath: "/projects/myapp/src/foo.ts" } },
        ),
      ).rejects.toThrow("[Blueprint]");
    });

    test("ignores messages without agent field", async () => {
      const hook = createChatMessageHook();
      // No agent field — should not crash or track
      await hook({ sessionID: "s-noagent", messageID: "m1" }, {} as any);

      const guardrail = createGuardrailHook(projectDir);
      // Unknown session → no restriction → should NOT throw
      await guardrail(
        { tool: "write", sessionID: "s-noagent", callID: "c1" },
        { args: { filePath: "/projects/myapp/src/foo.ts" } },
      );
    });
  });

  describe("guardrail hook", () => {
    const chatHook = createChatMessageHook();
    const guardrail = createGuardrailHook(projectDir);

    // Helper: register a session's agent
    async function registerAgent(sessionID: string, agent: string) {
      await chatHook({ sessionID, agent, messageID: "m" }, {} as any);
    }

    // ── Restricted agents ──

    test("blocks investigator from writing source files", async () => {
      await registerAgent("s-inv", "investigator");
      await expect(
        guardrail(
          { tool: "write", sessionID: "s-inv", callID: "c1" },
          { args: { filePath: "package.json" } },
        ),
      ).rejects.toThrow("investigator");
    });

    test("blocks reviewer-completeness from writing source files", async () => {
      await registerAgent("s-rev-c", "reviewer-completeness");
      await expect(
        guardrail(
          { tool: "edit", sessionID: "s-rev-c", callID: "c1" },
          { args: { filePath: "src/thing.ts" } },
        ),
      ).rejects.toThrow("reviewer-completeness");
    });

    test("blocks reviewer-structure from writing source files", async () => {
      await registerAgent("s-rev-s", "reviewer-structure");
      await expect(
        guardrail(
          { tool: "edit", sessionID: "s-rev-s", callID: "c1" },
          { args: { filePath: "src/thing.ts" } },
        ),
      ).rejects.toThrow("reviewer-structure");
    });

    test("blocks blueprinter from writing source files", async () => {
      await registerAgent("s-blueprinter", "blueprinter");
      await expect(
        guardrail(
          { tool: "write", sessionID: "s-blueprinter", callID: "c1" },
          { args: { filePath: "src/main.ts" } },
        ),
      ).rejects.toThrow("blueprinter");
    });

    // ── Allowed: workspace directory ──

    test("allows blueprinter to write inside .blueprint/", async () => {
      await registerAgent("s-blueprinter2", "blueprinter");
      await guardrail(
        { tool: "write", sessionID: "s-blueprinter2", callID: "c1" },
        { args: { filePath: `${WORKSPACE_DIR}/plans/myplan.md` } },
      );
    });

    // ── Unrestricted agents ──

    test("allows worker to write anywhere", async () => {
      await registerAgent("s-worker", "worker");
      // Worker is NOT in RESTRICTED_AGENTS → should not throw
      await guardrail(
        { tool: "write", sessionID: "s-worker", callID: "c1" },
        { args: { filePath: "/some/worktree/src/main.ts" } },
      );
    });

    test("allows unknown agent to write anywhere", async () => {
      await registerAgent("s-unknown", "some-custom-agent");
      await guardrail(
        { tool: "write", sessionID: "s-unknown", callID: "c1" },
        { args: { filePath: "src/anything.ts" } },
      );
    });

    // ── Non-write tools are ignored ──

    test("ignores read tools for restricted agents", async () => {
      await registerAgent("s-blueprinter3", "blueprinter");
      await guardrail(
        { tool: "read", sessionID: "s-blueprinter3", callID: "c1" },
        { args: { filePath: "src/main.ts" } },
      );
    });

    test("ignores grep tool", async () => {
      await registerAgent("s-blueprinter4", "blueprinter");
      await guardrail(
        { tool: "grep", sessionID: "s-blueprinter4", callID: "c1" },
        { args: { pattern: "foo", path: "src/" } },
      );
    });

    test("catches edit tool for restricted agents", async () => {
      await registerAgent("s-inv2", "investigator");
      await expect(
        guardrail(
          { tool: "edit", sessionID: "s-inv2", callID: "c1" },
          { args: { filePath: "src/config.ts" } },
        ),
      ).rejects.toThrow("[Blueprint]");
    });

    // ── Edge cases ──

    test("no-ops when tool args lack filePath", async () => {
      await registerAgent("s-blueprinter5", "blueprinter");
      // No filePath/path in args → guardrail can't check → should not throw
      await guardrail(
        { tool: "write", sessionID: "s-blueprinter5", callID: "c1" },
        { args: { content: "hello" } },
      );
    });

    test("handles absolute path inside workspace", async () => {
      await registerAgent("s-blueprinter6", "blueprinter");
      await guardrail(
        { tool: "write", sessionID: "s-blueprinter6", callID: "c1" },
        {
          args: {
            filePath: `${projectDir}/${WORKSPACE_DIR}/investigations/report.md`,
          },
        },
      );
    });
  });

  describe("event hook", () => {
    test("cleans up session tracking on session.deleted", async () => {
      const chatHook = createChatMessageHook();
      const guardrail = createGuardrailHook(projectDir);
      const eventHook = createEventHook();

      // Register a session
      await chatHook(
        { sessionID: "s-delete-me", agent: "blueprinter", messageID: "m" },
        {} as any,
      );

      // Confirm it's tracked (should throw)
      await expect(
        guardrail(
          { tool: "write", sessionID: "s-delete-me", callID: "c1" },
          { args: { filePath: "src/foo.ts" } },
        ),
      ).rejects.toThrow();

      // Delete event
      await eventHook({
        event: { type: "session.deleted", properties: { sessionID: "s-delete-me" } },
      });

      // Now the session is unknown → no restriction
      await guardrail(
        { tool: "write", sessionID: "s-delete-me", callID: "c1" },
        { args: { filePath: "src/foo.ts" } },
      );
    });

    test("ignores non-delete events", async () => {
      const eventHook = createEventHook();
      // Should not throw
      await eventHook({
        event: { type: "session.idle", properties: { sessionID: "s-idle" } },
      });
    });
  });
});
