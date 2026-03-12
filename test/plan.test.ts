import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createPlanTools } from "../src/tools/plan";
import { mockCtx, executeTool, makeTmpDir, cleanupTmpDir, samplePlan } from "./helpers";
import { DRAFTS_DIR, PLANS_DIR } from "../src/constants";

describe("plan finalize tool", () => {
  let tmpDir: string;
  const tools = createPlanTools();

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    // Create drafts directory with a sample plan
    const draftsDir = path.join(tmpDir, DRAFTS_DIR);
    await fs.mkdir(draftsDir, { recursive: true });
    await fs.writeFile(path.join(draftsDir, "test-plan.md"), samplePlan());
  });

  afterAll(async () => {
    // Clean up last tmpDir (beforeEach creates a new one each time)
    if (tmpDir) await cleanupTmpDir(tmpDir);
  });

  test("moves draft to plans directory", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_plan_finalize,
      { planName: "test-plan" },
      ctx,
    );

    expect(result).toContain("Plan finalized: test-plan");

    // Plan file should exist
    const planPath = path.join(tmpDir, PLANS_DIR, "test-plan.md");
    const content = await fs.readFile(planPath, "utf-8");
    expect(content).toContain("# Plan: test-plan");

    // Draft should be deleted
    const draftPath = path.join(tmpDir, DRAFTS_DIR, "test-plan.md");
    expect(async () => fs.access(draftPath)).toThrow();
  });

  test("preserves draft content exactly", async () => {
    const ctx = mockCtx(tmpDir);
    const draftPath = path.join(tmpDir, DRAFTS_DIR, "test-plan.md");
    const originalContent = await fs.readFile(draftPath, "utf-8");

    await executeTool(
      tools.blueprint_plan_finalize,
      { planName: "test-plan" },
      ctx,
    );

    const planPath = path.join(tmpDir, PLANS_DIR, "test-plan.md");
    const finalContent = await fs.readFile(planPath, "utf-8");
    expect(finalContent).toBe(originalContent);
  });

  test("creates plans directory if it does not exist", async () => {
    const ctx = mockCtx(tmpDir);
    // Plans dir doesn't exist yet (only drafts was created in beforeEach)
    const plansDir = path.join(tmpDir, PLANS_DIR);
    expect(async () => fs.access(plansDir)).toThrow();

    await executeTool(
      tools.blueprint_plan_finalize,
      { planName: "test-plan" },
      ctx,
    );

    // Should have been created
    const stat = await fs.stat(plansDir);
    expect(stat.isDirectory()).toBe(true);
  });

  test("returns error when draft does not exist", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_plan_finalize,
      { planName: "nonexistent" },
      ctx,
    );

    expect(result).toContain("Draft not found: nonexistent");
  });
});
