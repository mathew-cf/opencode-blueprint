import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createWorktreeTools } from "../src/tools/worktree";
import {
  mockCtx,
  executeTool,
  makeTmpDir,
  cleanupTmpDir,
  initGitRepo,
  execAsync,
} from "./helpers";
import { WORKTREES_DIR, WORKTREE_CHECKOUTS_DIR } from "../src/constants";

describe("worktree tools", () => {
  let tmpDir: string;
  let repoDir: string;
  const tools = createWorktreeTools();

  beforeAll(async () => {
    tmpDir = await makeTmpDir();
    repoDir = await initGitRepo(tmpDir);
  });

  afterAll(async () => {
    // Prune worktrees before removing tmpdir
    try {
      await execAsync("git worktree prune", { cwd: repoDir });
    } catch {}
    await cleanupTmpDir(tmpDir);
  });

  // ── blueprint_worktree_create ──

  test("create: creates a worktree and returns its path", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_create,
      { planName: "p1", workstream: "ws1" },
      ctx,
    );

    expect(result).toContain("Worktree created");
    expect(result).toContain("ws1");
    expect(result).toContain("blueprint/p1/ws1");

    // Verify directory exists
    const wtPath = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "p1-ws1");
    const stat = await fs.stat(wtPath);
    expect(stat.isDirectory()).toBe(true);

    // Verify metadata file
    const metaPath = path.join(repoDir, WORKTREES_DIR, "p1-ws1.json");
    const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
    expect(meta.status).toBe("active");
    expect(meta.branch).toBe("blueprint/p1/ws1");
    expect(meta.workstream).toBe("ws1");
  });

  test("create: second workstream in same plan", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_create,
      { planName: "p1", workstream: "ws2" },
      ctx,
    );
    expect(result).toContain("Worktree created");

    const wtPath = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "p1-ws2");
    const stat = await fs.stat(wtPath);
    expect(stat.isDirectory()).toBe(true);
  });

  test("create: duplicate worktree returns error", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_create,
      { planName: "p1", workstream: "ws1" },
      ctx,
    );
    expect(result).toContain("Error");
  });

  // ── blueprint_worktree_list ──

  test("list: shows active worktrees", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_list,
      {},
      ctx,
    );

    expect(result).toContain("Git Worktrees");
    expect(result).toContain("Blueprint Workstreams");
    expect(result).toContain("ws1");
    expect(result).toContain("ws2");
    expect(result).toContain("active");
  });

  test("list: filter by plan name", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_list,
      { planName: "nonexistent" },
      ctx,
    );
    // Should still show git worktrees but no blueprint metadata for this plan
    expect(result).toContain("Git Worktrees");
    expect(result).toContain("No Blueprint workstream metadata found");
    expect(result).not.toContain("Blueprint Workstreams");
  });

  // ── blueprint_worktree_merge ──

  test("merge: merges workstream branch into current branch", async () => {
    const ctx = mockCtx(repoDir);

    // Create a file in the worktree to have something to merge
    const wtPath = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "p1-ws2");
    await fs.writeFile(path.join(wtPath, "new-file.txt"), "hello\n");
    await execAsync("git add . && git commit -m 'add new file'", {
      cwd: wtPath,
    });

    const result = await executeTool(
      tools.blueprint_worktree_merge,
      { planName: "p1", workstream: "ws2" },
      ctx,
    );

    expect(result).toContain("Merged");

    // Verify file is now in main repo
    const content = await fs.readFile(
      path.join(repoDir, "new-file.txt"),
      "utf-8",
    );
    expect(content).toBe("hello\n");
  });

  // ── blueprint_worktree_cleanup ──

  test("cleanup: removes worktree and branch", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_cleanup,
      { planName: "p1", workstream: "ws2" },
      ctx,
    );

    expect(result).toContain("Removed worktree");
    expect(result).toContain("Deleted branch");

    // Verify directory is gone
    try {
      await fs.stat(path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "p1-ws2"));
      throw new Error("Should not exist");
    } catch (err: any) {
      expect(err.code).toBe("ENOENT");
    }
  });

  test("cleanup: metadata updated to removed", async () => {
    const metaPath = path.join(repoDir, WORKTREES_DIR, "p1-ws2.json");
    const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
    expect(meta.status).toBe("removed");
  });

  test("cleanup: keeps branch when deleteBranch=false", async () => {
    const ctx = mockCtx(repoDir);
    // Clean up the remaining ws1 without deleting branch
    const result = await executeTool(
      tools.blueprint_worktree_cleanup,
      { planName: "p1", workstream: "ws1", deleteBranch: false },
      ctx,
    );

    expect(result).toContain("Removed worktree");
    expect(result).not.toContain("Deleted branch");

    // Branch should still exist
    const { stdout } = await execAsync("git branch", { cwd: repoDir });
    expect(stdout).toContain("blueprint/p1/ws1");
  });
});
