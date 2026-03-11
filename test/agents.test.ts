import { describe, test, expect } from "bun:test";
import { registerAgents } from "../src/agents";

describe("agent registration", () => {
  test("registers all 5 agents on empty config", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(Object.keys(config.agent)).toHaveLength(5);
    expect(config.agent).toHaveProperty("planner");
    expect(config.agent).toHaveProperty("orchestrator");
    expect(config.agent).toHaveProperty("investigator");
    expect(config.agent).toHaveProperty("reviewer");
    expect(config.agent).toHaveProperty("worker");
  });

  test("primary agents have mode=primary", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.planner.mode).toBe("primary");
    expect(config.agent.orchestrator.mode).toBe("primary");
  });

  test("subagents have mode=subagent", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.investigator.mode).toBe("subagent");
    expect(config.agent.reviewer.mode).toBe("subagent");
    expect(config.agent.worker.mode).toBe("subagent");
  });

  test("all agents have model, temperature, prompt, color, description", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    for (const name of Object.keys(config.agent)) {
      const agent = config.agent[name];
      expect(agent.model).toBeString();
      expect(agent.model.length).toBeGreaterThan(0);
      expect(agent.temperature).toBe(0.1);
      expect(agent.prompt).toBeString();
      expect(agent.prompt.length).toBeGreaterThan(50);
      expect(agent.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(agent.description).toBeString();
    }
  });

  test("investigator has write and edit disabled", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.investigator.tools).toEqual({
      write: false,
      edit: false,
    });
  });

  test("reviewer has write, edit, and bash disabled", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.reviewer.tools).toEqual({
      write: false,
      edit: false,
      bash: false,
    });
  });

  test("worker has no agent-level tool restrictions", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.worker.tools).toBeUndefined();
  });

  // ── blueprint tool scoping ──

  test("blueprint tools are globally disabled", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.tools).toBeDefined();
    expect(config.tools["blueprint_*"]).toBe(false);
  });

  test("orchestrator re-enables blueprint tools", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.orchestrator.tools).toBeDefined();
    expect(config.agent.orchestrator.tools["blueprint_*"]).toBe(true);
  });

  test("non-orchestrator blueprint agents do not re-enable blueprint tools", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    // planner, investigator, reviewer, worker should NOT have blueprint_* enabled
    for (const name of ["planner", "investigator", "reviewer", "worker"]) {
      const tools = config.agent[name].tools;
      if (tools) {
        expect(tools["blueprint_*"]).not.toBe(true);
      }
    }
  });

  test("global blueprint disable preserves existing tools config", () => {
    const config: Record<string, any> = {
      tools: { my_custom_tool: true },
    };
    registerAgents(config);

    expect(config.tools.my_custom_tool).toBe(true);
    expect(config.tools["blueprint_*"]).toBe(false);
  });

  test("preserves existing agents in config", () => {
    const config: Record<string, any> = {
      agent: {
        "my-custom-agent": { mode: "primary", prompt: "hello" },
      },
    };
    registerAgents(config);

    expect(config.agent).toHaveProperty("my-custom-agent");
    expect(config.agent).toHaveProperty("planner");
    expect(Object.keys(config.agent)).toHaveLength(6);
  });

  test("planner prompt references .blueprint paths", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.planner.prompt).toContain(".blueprint/");
    expect(config.agent.planner.prompt).toContain("investigations");
    expect(config.agent.planner.prompt).toContain("plans");
  });

  test("orchestrator prompt references blueprint tools", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.orchestrator.prompt).toContain("blueprint_worktree_create");
    expect(config.agent.orchestrator.prompt).toContain("blueprint_verify");
    expect(config.agent.orchestrator.prompt).toContain("Notepad Convention");
    expect(config.agent.orchestrator.prompt).toContain("blueprint_progress");
  });

  test("planner uses opus model", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.planner.model).toContain("opus");
  });

  test("orchestrator uses sonnet model", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.orchestrator.model).toContain("sonnet");
  });
});
