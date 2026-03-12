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
import type { PlanMetadata } from "../src/types";

describe("worktree tools", () => {
  let tmpDir: string;
  let repoDir: string;
  const tools = createWorktreeTools();

  beforeAll(async () => {
    tmpDir = await makeTmpDir();
    repoDir = await initGitRepo(tmpDir);
  });

  afterAll(async () => {
    try {
      await execAsync("git worktree prune", { cwd: repoDir });
    } catch {}
    await cleanupTmpDir(tmpDir);
  });

  // ── plan worktree creation ──

  test("create: plan worktree (no workstream) creates isolated execution base", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_create,
      { planName: "p1" },
      ctx,
    );

    expect(result).toContain("Plan worktree created");
    expect(result).toContain("blueprint/p1");
    expect(result).toContain("blueprint_verify");

    // Verify plan worktree directory exists
    const planWtPath = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "p1");
    const stat = await fs.stat(planWtPath);
    expect(stat.isDirectory()).toBe(true);

    // Verify plan metadata
    const planMetaPath = path.join(repoDir, WORKTREES_DIR, "_plan_p1.json");
    const meta: PlanMetadata = JSON.parse(
      await fs.readFile(planMetaPath, "utf-8"),
    );
    expect(meta.planName).toBe("p1");
    expect(meta.baseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(meta.baseBranch).toBeDefined();
    expect(meta.planWorktreePath).toBe(planWtPath);
    expect(meta.planBranch).toBe("blueprint/p1/_plan");
    expect(meta.createdAt).toBeDefined();
  });

  test("create: plan worktree is idempotent", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_create,
      { planName: "p1" },
      ctx,
    );

    expect(result).toContain("Plan worktree already exists");
    expect(result).toContain("blueprint/p1");
  });

  // ── workstream worktree creation ──

  test("create: workstream without plan worktree returns error", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_create,
      { planName: "no-plan", workstream: "ws1" },
      ctx,
    );

    expect(result).toContain("Error: no plan worktree exists");
    expect(result).toContain("no-plan");
  });

  test("create: workstream worktree branches from plan branch", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_create,
      { planName: "p1", workstream: "ws1" },
      ctx,
    );

    expect(result).toContain("Worktree created");
    expect(result).toContain("ws1");
    expect(result).toContain("blueprint/p1/ws1");
    expect(result).toContain("Based on: blueprint/p1");

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

  test("list: shows plan worktrees and workstreams", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_list,
      {},
      ctx,
    );

    expect(result).toContain("Git Worktrees");
    expect(result).toContain("Blueprint Plans");
    expect(result).toContain("blueprint/p1");
    expect(result).toContain("Blueprint Workstreams");
    expect(result).toContain("ws1");
    expect(result).toContain("ws2");
    expect(result).toContain("active");
  });

  test("list: filter by plan name shows no results for nonexistent plan", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_list,
      { planName: "nonexistent" },
      ctx,
    );
    expect(result).toContain("Git Worktrees");
    expect(result).toContain("No Blueprint metadata found");
  });

  // ── blueprint_worktree_merge ──

  test("merge: merges workstream into plan worktree (not main checkout)", async () => {
    const ctx = mockCtx(repoDir);

    // Create a file in the workstream worktree
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
    expect(result).toContain("plan worktree");

    // File should be in the PLAN worktree, not the main checkout
    const planWtPath = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "p1");
    const content = await fs.readFile(
      path.join(planWtPath, "new-file.txt"),
      "utf-8",
    );
    expect(content).toBe("hello\n");

    // File should NOT be in main checkout yet (isolation!)
    try {
      await fs.stat(path.join(repoDir, "new-file.txt"));
      throw new Error("File should not exist in main checkout before finalize");
    } catch (err: any) {
      expect(err.code).toBe("ENOENT");
    }
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

  // ── plan metadata ──

  test("create: records plan metadata with all required fields", async () => {
    const planMetaPath = path.join(repoDir, WORKTREES_DIR, "_plan_p1.json");
    const raw = await fs.readFile(planMetaPath, "utf-8");
    const meta: PlanMetadata = JSON.parse(raw);

    expect(meta.planName).toBe("p1");
    expect(meta.baseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(meta.baseBranch).toBeDefined();
    expect(meta.planWorktreePath).toContain("p1");
    expect(meta.planBranch).toBe("blueprint/p1/_plan");
    expect(meta.createdAt).toBeDefined();
  });
});

describe("worktree finalize", () => {
  let tmpDir: string;
  let repoDir: string;
  const tools = createWorktreeTools();

  beforeAll(async () => {
    tmpDir = await makeTmpDir();
    repoDir = await initGitRepo(tmpDir);
  });

  afterAll(async () => {
    try {
      await execAsync("git worktree prune", { cwd: repoDir });
    } catch {}
    await cleanupTmpDir(tmpDir);
  });

  test("finalize: returns error when no plan metadata exists", async () => {
    const ctx = mockCtx(repoDir);
    const result = await executeTool(
      tools.blueprint_worktree_finalize,
      { planName: "nonexistent" },
      ctx,
    );
    expect(result).toContain("Error: no plan metadata found");
  });

  test("finalize: consolidates commits on plan branch and merges to base", async () => {
    const ctx = mockCtx(repoDir);

    // Record the starting SHA
    const { stdout: startSha } = await execAsync("git rev-parse HEAD", {
      cwd: repoDir,
    });

    // Step 0: Create plan worktree
    await executeTool(
      tools.blueprint_worktree_create,
      { planName: "fin1" },
      ctx,
    );

    // Create two workstreams
    await executeTool(
      tools.blueprint_worktree_create,
      { planName: "fin1", workstream: "ws1" },
      ctx,
    );
    await executeTool(
      tools.blueprint_worktree_create,
      { planName: "fin1", workstream: "ws2" },
      ctx,
    );

    // Make changes in ws1
    const wt1 = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "fin1-ws1");
    await fs.writeFile(path.join(wt1, "feature-a.txt"), "feature A\n");
    await execAsync("git add . && git commit -m 'add feature A'", {
      cwd: wt1,
    });

    // Make changes in ws2
    const wt2 = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "fin1-ws2");
    await fs.writeFile(path.join(wt2, "feature-b.txt"), "feature B\n");
    await execAsync("git add . && git commit -m 'add feature B'", {
      cwd: wt2,
    });

    // Merge both workstreams into plan branch
    await executeTool(
      tools.blueprint_worktree_merge,
      { planName: "fin1", workstream: "ws1" },
      ctx,
    );
    await executeTool(
      tools.blueprint_worktree_merge,
      { planName: "fin1", workstream: "ws2" },
      ctx,
    );

    // Verify files are in plan worktree before finalize
    const planWt = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "fin1");
    const contentA = await fs.readFile(
      path.join(planWt, "feature-a.txt"),
      "utf-8",
    );
    expect(contentA).toBe("feature A\n");

    // Finalize: consolidate + merge to base
    const result = await executeTool(
      tools.blueprint_worktree_finalize,
      { planName: "fin1", commitMessage: "feat: implement fin1 plan" },
      ctx,
    );

    expect(result).toContain("Consolidated commits into single commit");
    expect(result).toContain("feat: implement fin1 plan");
    expect(result).toContain("Merged blueprint/fin1/_plan into");

    // Both files should now exist in the main checkout (merged from plan branch)
    const mainContentA = await fs.readFile(
      path.join(repoDir, "feature-a.txt"),
      "utf-8",
    );
    expect(mainContentA).toBe("feature A\n");

    const mainContentB = await fs.readFile(
      path.join(repoDir, "feature-b.txt"),
      "utf-8",
    );
    expect(mainContentB).toBe("feature B\n");

    // There should be exactly one new commit on top of the start SHA
    // (the consolidated commit is a merge, so we check the log)
    const { stdout: log } = await execAsync(
      `git log --oneline ${startSha.trim()}..HEAD`,
      { cwd: repoDir },
    );
    const commits = log.trim().split("\n").filter(Boolean);
    // Could be 1 (fast-forward of the consolidated commit) or 2 (merge commit + consolidated)
    // The consolidated commit message should appear
    expect(log).toContain("feat: implement fin1 plan");
  });

  test("finalize: cleans up plan metadata file", async () => {
    const planMetaPath = path.join(
      repoDir,
      WORKTREES_DIR,
      "_plan_fin1.json",
    );
    try {
      await fs.stat(planMetaPath);
      throw new Error("Should not exist");
    } catch (err: any) {
      expect(err.code).toBe("ENOENT");
    }
  });

  test("finalize: worktree metadata shows removed status", async () => {
    const meta1Path = path.join(repoDir, WORKTREES_DIR, "fin1-ws1.json");
    const meta1 = JSON.parse(await fs.readFile(meta1Path, "utf-8"));
    expect(meta1.status).toBe("removed");

    const meta2Path = path.join(repoDir, WORKTREES_DIR, "fin1-ws2.json");
    const meta2 = JSON.parse(await fs.readFile(meta2Path, "utf-8"));
    expect(meta2.status).toBe("removed");
  });

  test("finalize: worktree directories are removed", async () => {
    const planWt = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "fin1");
    const wt1 = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "fin1-ws1");
    const wt2 = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "fin1-ws2");

    for (const wtPath of [planWt, wt1, wt2]) {
      try {
        await fs.stat(wtPath);
        throw new Error("Should not exist");
      } catch (err: any) {
        expect(err.code).toBe("ENOENT");
      }
    }
  });

  test("finalize: branches are deleted (including plan branch)", async () => {
    const { stdout } = await execAsync("git branch", { cwd: repoDir });
    expect(stdout).not.toContain("blueprint/fin1/ws1");
    expect(stdout).not.toContain("blueprint/fin1/ws2");
    expect(stdout).not.toContain("blueprint/fin1");
  });

  test("finalize: handles already-cleaned-up worktrees gracefully", async () => {
    const ctx = mockCtx(repoDir);

    // Create plan worktree, workstream, make change, merge, cleanup, then finalize
    await executeTool(
      tools.blueprint_worktree_create,
      { planName: "fin2" },
      ctx,
    );
    await executeTool(
      tools.blueprint_worktree_create,
      { planName: "fin2", workstream: "ws1" },
      ctx,
    );

    const wt = path.join(repoDir, WORKTREE_CHECKOUTS_DIR, "fin2-ws1");
    await fs.writeFile(path.join(wt, "file-c.txt"), "content\n");
    await execAsync("git add . && git commit -m 'add file C'", { cwd: wt });

    await executeTool(
      tools.blueprint_worktree_merge,
      { planName: "fin2", workstream: "ws1" },
      ctx,
    );
    await executeTool(
      tools.blueprint_worktree_cleanup,
      { planName: "fin2", workstream: "ws1" },
      ctx,
    );

    // Now finalize — workstream is already removed, should still consolidate + merge to base
    const result = await executeTool(
      tools.blueprint_worktree_finalize,
      { planName: "fin2" },
      ctx,
    );

    expect(result).toContain("Consolidated commits into single commit");
    expect(result).toContain("blueprint: fin2");

    // File should be in main checkout after finalize
    const content = await fs.readFile(
      path.join(repoDir, "file-c.txt"),
      "utf-8",
    );
    expect(content).toBe("content\n");
  });

  test("finalize: uses default commit message when none provided", async () => {
    // fin2 was just finalized with default message
    const { stdout: log } = await execAsync("git log --oneline -1", {
      cwd: repoDir,
    });
    expect(log).toContain("blueprint: fin2");
  });

  test("finalize: no-op when no commits since base", async () => {
    const ctx = mockCtx(repoDir);

    // Create plan worktree and workstream but don't make any changes
    await executeTool(
      tools.blueprint_worktree_create,
      { planName: "fin3" },
      ctx,
    );
    await executeTool(
      tools.blueprint_worktree_create,
      { planName: "fin3", workstream: "ws1" },
      ctx,
    );
    await executeTool(
      tools.blueprint_worktree_cleanup,
      { planName: "fin3", workstream: "ws1" },
      ctx,
    );

    const result = await executeTool(
      tools.blueprint_worktree_finalize,
      { planName: "fin3" },
      ctx,
    );

    expect(result).toContain("No new commits to consolidate");
  });
});
