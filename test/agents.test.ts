import { describe, test, expect } from "bun:test";
import { registerAgents } from "../src/agents";

describe("agent registration", () => {
  test("registers all 6 agents on empty config", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(Object.keys(config.agent)).toHaveLength(6);
    expect(config.agent).toHaveProperty("planner");
    expect(config.agent).toHaveProperty("orchestrator");
    expect(config.agent).toHaveProperty("investigator");
    expect(config.agent).toHaveProperty("reviewer-completeness");
    expect(config.agent).toHaveProperty("reviewer-structure");
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
    expect(config.agent["reviewer-completeness"].mode).toBe("subagent");
    expect(config.agent["reviewer-structure"].mode).toBe("subagent");
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

  test("investigator is read-only (edit denied)", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.investigator.permission).toEqual({
      edit: "deny",
    });
  });

  test("reviewer-completeness is read-only with no bash", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent["reviewer-completeness"].permission).toEqual({
      edit: "deny",
      bash: "deny",
    });
  });

  test("reviewer-structure is read-only with no bash", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent["reviewer-structure"].permission).toEqual({
      edit: "deny",
      bash: "deny",
    });
  });

  test("worker has no agent-level permission restrictions", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.worker.permission).toBeUndefined();
  });

  // ── blueprint tool scoping ──

  test("blueprint tools are globally disabled", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.permission).toBeDefined();
    expect(config.permission["blueprint_*"]).toBe("deny");
  });

  test("orchestrator re-enables blueprint tools", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.orchestrator.permission).toBeDefined();
    expect(config.agent.orchestrator.permission["blueprint_*"]).toBe("allow");
  });

  test("non-orchestrator agents do not re-enable blueprint tools", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    for (const name of ["planner", "investigator", "reviewer-completeness", "reviewer-structure", "worker"]) {
      const perm = config.agent[name].permission;
      if (perm) {
        expect(perm["blueprint_*"]).not.toBe("allow");
      }
    }
  });

  test("planner has blueprint_plan_finalize enabled", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent.planner.permission).toBeDefined();
    expect(config.agent.planner.permission.blueprint_plan_finalize).toBe("allow");
  });

  test("global blueprint disable preserves existing permission config", () => {
    const config: Record<string, any> = {
      permission: { my_custom_tool: "ask" },
    };
    registerAgents(config);

    expect(config.permission.my_custom_tool).toBe("ask");
    expect(config.permission["blueprint_*"]).toBe("deny");
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
    expect(Object.keys(config.agent)).toHaveLength(7);
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

  test("reviewer-completeness uses opus model", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent["reviewer-completeness"].model).toContain("opus");
  });

  test("reviewer-structure uses sonnet model", () => {
    const config: Record<string, any> = {};
    registerAgents(config);

    expect(config.agent["reviewer-structure"].model).toContain("sonnet");
  });
});
