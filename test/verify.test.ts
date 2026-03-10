import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createVerifyTools } from "../src/tools/verify";
import { mockCtx, executeTool, makeTmpDir, cleanupTmpDir } from "./helpers";

describe("verify tool", () => {
  let tmpDir: string;
  const tools = createVerifyTools();

  beforeAll(async () => {
    tmpDir = await makeTmpDir();
  });

  afterAll(async () => {
    await cleanupTmpDir(tmpDir);
  });

  test("skips checks when no package.json exists", async () => {
    const emptyDir = path.join(tmpDir, "empty");
    await fs.mkdir(emptyDir);
    const ctx = mockCtx(emptyDir);

    const result = await executeTool(
      tools.blueprint_verify,
      { directory: emptyDir },
      ctx,
    );

    expect(result).toContain("ALL CHECKS PASSED");
    expect(result).toContain("skipped");
  });

  test("skips checks when scripts are absent", async () => {
    const noScripts = path.join(tmpDir, "no-scripts");
    await fs.mkdir(noScripts);
    await fs.writeFile(
      path.join(noScripts, "package.json"),
      JSON.stringify({ name: "test", scripts: {} }),
    );
    const ctx = mockCtx(noScripts);

    const result = await executeTool(
      tools.blueprint_verify,
      { directory: noScripts, checks: ["tests", "lint", "build"] },
      ctx,
    );

    expect(result).toContain("ALL CHECKS PASSED");
    expect(result).toContain("tests: skipped");
    expect(result).toContain("lint: skipped");
    expect(result).toContain("build: skipped");
  });

  test("reports PASSED for a succeeding test script", async () => {
    const passDir = path.join(tmpDir, "pass-project");
    await fs.mkdir(passDir);
    await fs.writeFile(
      path.join(passDir, "package.json"),
      JSON.stringify({
        name: "test",
        scripts: { test: "echo 'all tests passed'" },
      }),
    );
    const ctx = mockCtx(passDir);

    const result = await executeTool(
      tools.blueprint_verify,
      { directory: passDir, checks: ["tests"] },
      ctx,
    );

    expect(result).toContain("ALL CHECKS PASSED");
    expect(result).toContain("tests: PASSED");
    expect(result).toContain("all tests passed");
  });

  test("reports FAILED for a failing test script", async () => {
    const failDir = path.join(tmpDir, "fail-project");
    await fs.mkdir(failDir);
    await fs.writeFile(
      path.join(failDir, "package.json"),
      JSON.stringify({
        name: "test",
        scripts: { test: "echo 'test failure' && exit 1" },
      }),
    );
    const ctx = mockCtx(failDir);

    const result = await executeTool(
      tools.blueprint_verify,
      { directory: failDir, checks: ["tests"] },
      ctx,
    );

    expect(result).toContain("SOME CHECKS FAILED");
    expect(result).toContain("tests: FAILED");
  });

  test("runs specific check subset", async () => {
    const projDir = path.join(tmpDir, "subset-project");
    await fs.mkdir(projDir);
    await fs.writeFile(
      path.join(projDir, "package.json"),
      JSON.stringify({
        name: "test",
        scripts: {
          test: "echo ok",
          lint: "echo lint-ok",
          build: "echo build-ok",
        },
      }),
    );
    const ctx = mockCtx(projDir);

    const result = await executeTool(
      tools.blueprint_verify,
      { directory: projDir, checks: ["lint", "build"] },
      ctx,
    );

    expect(result).toContain("ALL CHECKS PASSED");
    expect(result).toContain("lint: PASSED");
    expect(result).toContain("build: PASSED");
    // Should not run tests since not requested
    expect(result).not.toContain("tests:");
  });

  test("detects tsc for typecheck when no script but tsconfig exists", async () => {
    const tsDir = path.join(tmpDir, "ts-project");
    await fs.mkdir(tsDir);
    await fs.writeFile(
      path.join(tsDir, "package.json"),
      JSON.stringify({ name: "test", scripts: {} }),
    );
    await fs.writeFile(
      path.join(tsDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true } }),
    );
    const ctx = mockCtx(tsDir);

    // This will likely fail because there are no .ts files, but it should
    // at least attempt tsc (not skip it)
    const result = await executeTool(
      tools.blueprint_verify,
      { directory: tsDir, checks: ["typecheck"] },
      ctx,
    );

    // Either PASSED (no files to check) or FAILED (tsc not found) — but not skipped
    expect(result).not.toContain("typecheck: skipped");
  });

  test("mixed results: some pass, some fail", async () => {
    const mixedDir = path.join(tmpDir, "mixed-project");
    await fs.mkdir(mixedDir);
    await fs.writeFile(
      path.join(mixedDir, "package.json"),
      JSON.stringify({
        name: "test",
        scripts: {
          test: "echo ok",
          lint: "echo 'lint error' && exit 1",
        },
      }),
    );
    const ctx = mockCtx(mixedDir);

    const result = await executeTool(
      tools.blueprint_verify,
      { directory: mixedDir, checks: ["tests", "lint"] },
      ctx,
    );

    expect(result).toContain("SOME CHECKS FAILED");
    expect(result).toContain("tests: PASSED");
    expect(result).toContain("lint: FAILED");
  });
});
