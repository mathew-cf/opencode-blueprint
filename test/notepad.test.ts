import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createNotepadTools } from "../src/tools/notepad";
import { mockCtx, executeTool, makeTmpDir, cleanupTmpDir } from "./helpers";
import { NOTEPADS_DIR } from "../src/constants";

describe("notepad tools", () => {
  let tmpDir: string;
  const tools = createNotepadTools();

  beforeAll(async () => {
    tmpDir = await makeTmpDir();
  });

  afterAll(async () => {
    await cleanupTmpDir(tmpDir);
  });

  // ── blueprint_notepad_read ──

  test("read: returns empty for nonexistent notepad", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_notepad_read,
      { planName: "noplan" },
      ctx,
    );

    expect(result).toContain("Learnings");
    expect(result).toContain("(empty)");
    expect(result).toContain("Decisions");
    expect(result).toContain("Issues");
  });

  test("read: filters by type", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_notepad_read,
      { planName: "noplan", type: "learnings" },
      ctx,
    );

    expect(result).toContain("Learnings");
    expect(result).not.toContain("Decisions");
    expect(result).not.toContain("Issues");
  });

  // ── blueprint_notepad_write ──

  test("write: creates notepad directory and appends entry", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_notepad_write,
      {
        planName: "myplan",
        type: "learnings",
        content: "The codebase uses Result<T> pattern for error handling.",
        taskId: "W1-1",
      },
      ctx,
    );

    expect(result).toContain("Recorded learnings entry");
    expect(result).toContain("[W1-1]");
    expect(result).toContain("myplan");

    // Verify file exists and has content
    const filePath = path.join(tmpDir, NOTEPADS_DIR, "myplan", "learnings.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("W1-1");
    expect(content).toContain("Result<T>");
  });

  test("write: appends to existing notepad", async () => {
    const ctx = mockCtx(tmpDir);
    await executeTool(
      tools.blueprint_notepad_write,
      {
        planName: "myplan",
        type: "learnings",
        content: "Tests use vitest, not jest.",
        taskId: "W1-2",
      },
      ctx,
    );

    const filePath = path.join(tmpDir, NOTEPADS_DIR, "myplan", "learnings.md");
    const content = await fs.readFile(filePath, "utf-8");

    // Both entries should be present
    expect(content).toContain("Result<T>");
    expect(content).toContain("vitest");
    expect(content).toContain("W1-1");
    expect(content).toContain("W1-2");
  });

  test("write: different types go to different files", async () => {
    const ctx = mockCtx(tmpDir);
    await executeTool(
      tools.blueprint_notepad_write,
      {
        planName: "myplan",
        type: "decisions",
        content: "Chose to use factory pattern for consistency.",
      },
      ctx,
    );

    await executeTool(
      tools.blueprint_notepad_write,
      {
        planName: "myplan",
        type: "issues",
        content: "TypeScript strict mode flagged unused import.",
        taskId: "W1-1",
      },
      ctx,
    );

    const notepadDir = path.join(tmpDir, NOTEPADS_DIR, "myplan");
    const decisions = await fs.readFile(path.join(notepadDir, "decisions.md"), "utf-8");
    const issues = await fs.readFile(path.join(notepadDir, "issues.md"), "utf-8");

    expect(decisions).toContain("factory pattern");
    expect(decisions).not.toContain("unused import");
    expect(issues).toContain("unused import");
    expect(issues).not.toContain("factory pattern");
  });

  // ── read after write ──

  test("read: returns written content", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_notepad_read,
      { planName: "myplan" },
      ctx,
    );

    expect(result).toContain("Result<T>");
    expect(result).toContain("vitest");
    expect(result).toContain("factory pattern");
    expect(result).toContain("unused import");
  });

  test("read: type filter returns only that type", async () => {
    const ctx = mockCtx(tmpDir);
    const result = await executeTool(
      tools.blueprint_notepad_read,
      { planName: "myplan", type: "issues" },
      ctx,
    );

    expect(result).toContain("unused import");
    expect(result).not.toContain("factory pattern");
    expect(result).not.toContain("Result<T>");
  });
});
