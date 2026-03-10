import { describe, test, expect } from "bun:test";
import { registerCommands } from "../src/commands";

describe("command registration", () => {
  test("registers /plan and /execute commands on empty config", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(Object.keys(config.command)).toHaveLength(2);
    expect(config.command).toHaveProperty("plan");
    expect(config.command).toHaveProperty("execute");
  });

  test("/plan targets the planner agent", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.plan.agent).toBe("planner");
  });

  test("/execute targets the orchestrator agent", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.execute.agent).toBe("orchestrator");
  });

  test("both commands have description and template", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    for (const name of ["plan", "execute"]) {
      const cmd = config.command[name];
      expect(cmd.description).toBeString();
      expect(cmd.description.length).toBeGreaterThan(0);
      expect(cmd.template).toBeString();
      expect(cmd.template.length).toBeGreaterThan(0);
    }
  });

  test("templates include $ARGUMENTS placeholder", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.plan.template).toContain("$ARGUMENTS");
    expect(config.command.execute.template).toContain("$ARGUMENTS");
  });

  test("/execute template references .blueprint/plans/", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.execute.template).toContain(".blueprint/plans/");
  });

  test("preserves existing commands in config", () => {
    const config: Record<string, any> = {
      command: {
        "my-custom-cmd": { template: "hello", description: "test" },
      },
    };
    registerCommands(config);

    expect(config.command).toHaveProperty("my-custom-cmd");
    expect(config.command).toHaveProperty("plan");
    expect(config.command).toHaveProperty("execute");
    expect(Object.keys(config.command)).toHaveLength(3);
  });
});
