import { describe, test, expect } from "bun:test";
import BlueprintPlugin from "../src/index";

describe("plugin entry point", () => {
  // Create a minimal mock of PluginInput
  const mockInput: any = {
    client: {},
    project: { id: "test" },
    directory: "/test/project",
    worktree: "/test/project",
    serverUrl: new URL("http://localhost:3000"),
    $: {} as any,
  };

  test("returns hooks object with expected keys", async () => {
    const hooks = await BlueprintPlugin(mockInput);

    expect(hooks).toHaveProperty("tool");
    expect(hooks).toHaveProperty("config");
    expect(hooks).toHaveProperty(["chat.message"]);
    expect(hooks).toHaveProperty(["tool.execute.before"]);
    expect(hooks).toHaveProperty("event");
  });

  test("registers all 8 tools", async () => {
    const hooks = await BlueprintPlugin(mockInput);
    const toolNames = Object.keys(hooks.tool!);

    expect(toolNames).toContain("blueprint_worktree_create");
    expect(toolNames).toContain("blueprint_worktree_merge");
    expect(toolNames).toContain("blueprint_worktree_cleanup");
    expect(toolNames).toContain("blueprint_worktree_list");
    expect(toolNames).toContain("blueprint_notepad_read");
    expect(toolNames).toContain("blueprint_notepad_write");
    expect(toolNames).toContain("blueprint_progress");
    expect(toolNames).toContain("blueprint_verify");
    expect(toolNames).toHaveLength(8);
  });

  test("all tools have description and execute", async () => {
    const hooks = await BlueprintPlugin(mockInput);

    for (const [name, def] of Object.entries(hooks.tool!)) {
      const tool = def as any;
      expect(tool.description).toBeString();
      expect(tool.description.length).toBeGreaterThan(10);
      expect(typeof tool.execute).toBe("function");
    }
  });

  test("config hook registers agents", async () => {
    const hooks = await BlueprintPlugin(mockInput);
    const config: Record<string, any> = {};

    await hooks.config!(config);

    expect(config.agent).toBeDefined();
    expect(Object.keys(config.agent)).toHaveLength(5);
    expect(config.agent.planner.mode).toBe("primary");
    expect(config.agent.orchestrator.mode).toBe("primary");
    expect(config.agent.worker.mode).toBe("subagent");
  });

  test("config hook registers commands", async () => {
    const hooks = await BlueprintPlugin(mockInput);
    const config: Record<string, any> = {};

    await hooks.config!(config);

    expect(config.command).toBeDefined();
    expect(config.command).toHaveProperty("plan");
    expect(config.command).toHaveProperty("execute");
    expect(config.command.plan.agent).toBe("planner");
    expect(config.command.execute.agent).toBe("orchestrator");
  });

  test("chat.message hook is a function", async () => {
    const hooks = await BlueprintPlugin(mockInput);
    expect(typeof hooks["chat.message"]).toBe("function");
  });

  test("tool.execute.before hook is a function", async () => {
    const hooks = await BlueprintPlugin(mockInput);
    expect(typeof hooks["tool.execute.before"]).toBe("function");
  });

  test("event hook is a function", async () => {
    const hooks = await BlueprintPlugin(mockInput);
    expect(typeof hooks.event).toBe("function");
  });
});
