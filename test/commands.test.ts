import { describe, test, expect } from "bun:test";
import { registerCommands } from "../src/commands";

describe("command registration", () => {
  test("registers /plan, /execute, and /blueprint commands on empty config", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(Object.keys(config.command)).toHaveLength(3);
    expect(config.command).toHaveProperty("plan");
    expect(config.command).toHaveProperty("execute");
    expect(config.command).toHaveProperty("blueprint");
  });

  test("/plan targets the blueprinter agent", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.plan.agent).toBe("blueprinter");
  });

  test("/execute targets the blueprinter agent", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.execute.agent).toBe("blueprinter");
  });

  test("/plan template contains phase-bounding instruction", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.plan.template).toContain("Do NOT proceed to Phase 4");
    expect(config.command.plan.template).toContain("STOP after Phase 3");
  });

  test("/execute template contains phase-skip instruction", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.execute.template).toContain("Skip Phases 1, 2, and 3 entirely");
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
    expect(config.command).toHaveProperty("blueprint");
    expect(Object.keys(config.command)).toHaveLength(4);
  });

  test("/blueprint targets the blueprinter agent", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.blueprint.agent).toBe("blueprinter");
  });

  test("/blueprint template includes $ARGUMENTS", () => {
    const config: Record<string, any> = {};
    registerCommands(config);

    expect(config.command.blueprint.template).toContain("$ARGUMENTS");
  });
});
