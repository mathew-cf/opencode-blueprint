import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createProgressTools } from "../src/tools/progress";
import { mockCtx, executeTool, makeTmpDir, cleanupTmpDir, samplePlan } from "./helpers";
import { PLANS_DIR } from "../src/constants";

describe("progress tool", () => {
  let tmpDir: string;
  const tools = createProgressTools();

  beforeAll(async () => {
    tmpDir = await makeTmpDir();
    // Write sample plan
    const planDir = path.join(tmpDir, PLANS_DIR);
    await fs.mkdir(planDir, { recursive: true });
    await fs.writeFile(path.join(planDir, "test-plan.md"), samplePlan());
  });

  afterAll(async () => {
    await cleanupTmpDir(tmpDir);
  });

  // ── Read-only summary ──

  test("summary: shows all tasks as incomplete initially", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_progress,
      { planName: "test-plan" },
      ctx,
    );

    expect(result).toContain("Progress: test-plan");
    expect(result).toContain("| Implemented | 0 | 3 |");
    expect(result).toContain("| Verified | 0 | 3 |");
    expect(result).toContain("W1-1");
    expect(result).toContain("W1-2");
    expect(result).toContain("W2-1");
  });

  test("summary: nonexistent plan returns error", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_progress,
      { planName: "nonexistent" },
      ctx,
    );
    expect(result).toContain("Plan not found");
  });

  // ── Checkbox updates ──

  test("update: marks task as implemented", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_progress,
      { planName: "test-plan", taskId: "W1-1", field: "implemented" },
      ctx,
    );

    expect(result).toContain("| Implemented | 1 | 3 |");

    // Verify file was modified
    const planPath = path.join(tmpDir, PLANS_DIR, "test-plan.md");
    const content = await fs.readFile(planPath, "utf-8");
    // W1-1 should have [x] Implemented
    const w1Section = content.slice(
      content.indexOf("#### Task W1-1"),
      content.indexOf("#### Task W1-2"),
    );
    expect(w1Section).toContain("- [x] Implemented");
    expect(w1Section).toContain("- [ ] Verified");
  });

  test("update: marks task as verified", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_progress,
      { planName: "test-plan", taskId: "W1-1", field: "verified" },
      ctx,
    );

    expect(result).toContain("| Verified | 1 | 3 |");
  });

  test("update: marks multiple tasks", async () => {
    const ctx = mockCtx(tmpDir);

    // Mark W1-2 as implemented + verified
    await executeTool(
      tools.blueprint_progress,
      { planName: "test-plan", taskId: "W1-2", field: "implemented" },
      ctx,
    );
    await executeTool(
      tools.blueprint_progress,
      { planName: "test-plan", taskId: "W1-2", field: "verified" },
      ctx,
    );

    const result = await executeTool(
      tools.blueprint_progress,
      { planName: "test-plan" },
      ctx,
    );

    expect(result).toContain("| Implemented | 2 | 3 |");
    expect(result).toContain("| Verified | 2 | 3 |");
    // Only W2-1 should remain
    expect(result).toContain("W2-1");
    expect(result).not.toContain("W1-1: needs");
    expect(result).not.toContain("W1-2: needs");
  });

  test("update: can uncheck a checkbox", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_progress,
      {
        planName: "test-plan",
        taskId: "W1-1",
        field: "implemented",
        value: false,
      },
      ctx,
    );

    expect(result).toContain("| Implemented | 1 | 3 |");
  });

  test("update: all complete shows completion message", async () => {
    const ctx = mockCtx(tmpDir);

    // Complete everything
    for (const [taskId, field] of [
      ["W1-1", "implemented"],
      ["W1-1", "verified"],
      ["W2-1", "implemented"],
      ["W2-1", "verified"],
    ] as const) {
      await executeTool(
        tools.blueprint_progress,
        { planName: "test-plan", taskId, field },
        ctx,
      );
    }

    const result = await executeTool(
      tools.blueprint_progress,
      { planName: "test-plan" },
      ctx,
    );

    expect(result).toContain("| Implemented | 3 | 3 |");
    expect(result).toContain("| Verified | 3 | 3 |");
    expect(result).toContain("All tasks complete");
  });

  test("update: nonexistent task returns error", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_progress,
      { planName: "test-plan", taskId: "W99-1", field: "implemented" },
      ctx,
    );
    expect(result).toContain("not found");
  });
});
