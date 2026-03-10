import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export const execAsync = promisify(exec);

/**
 * Create a mock ToolContext suitable for testing tool execute() functions.
 */
export function mockCtx(
  directory: string,
  worktree?: string,
  agent = "test-agent",
): any {
  return {
    sessionID: "test-session",
    messageID: "test-message",
    agent,
    directory,
    worktree: worktree ?? directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };
}

/**
 * Call the execute function on a ToolDefinition.
 * ToolDefinitions returned by tool() have { description, args, execute, schema }.
 */
export async function executeTool(
  toolDef: any,
  args: Record<string, any>,
  ctx: any,
): Promise<string> {
  return toolDef.execute(args, ctx);
}

/**
 * Create a temporary directory and return its path.
 * Caller is responsible for cleanup via `cleanupTmpDir`.
 */
export async function makeTmpDir(prefix = "blueprint-test-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Remove a temporary directory tree.
 */
export async function cleanupTmpDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Initialise a bare-minimum git repo with one commit.
 * Returns the repo path.
 */
export async function initGitRepo(parentDir: string, name = "testrepo"): Promise<string> {
  const repoDir = path.join(parentDir, name);
  await fs.mkdir(repoDir, { recursive: true });
  await execAsync("git init", { cwd: repoDir });
  await execAsync('git config user.email "test@test.com"', { cwd: repoDir });
  await execAsync('git config user.name "Test"', { cwd: repoDir });
  await fs.writeFile(path.join(repoDir, "README.md"), "# Test Repo\n");
  await execAsync("git add . && git commit -m 'initial commit'", {
    cwd: repoDir,
  });
  return repoDir;
}

/**
 * Write a minimal plan file for testing blueprint_progress.
 */
export function samplePlan(name = "test-plan"): string {
  return `# Plan: ${name}

## Source
Investigation: .blueprint/investigations/test.md

## Requirements
- R1: Add foo feature
- R2: Add tests for foo

## Architecture Decisions
- AD1: Use existing patterns — Rationale: Consistency

## Tasks

### Wave 1

#### Task W1-1: Implement foo module
- Workstream: ws1
- Files: src/foo.ts
- Requirement: R1
- Depends on: none
- Acceptance: foo() returns correct value
- [ ] Implemented
- [ ] Verified

#### Task W1-2: Add foo tests
- Workstream: ws1
- Files: src/foo.test.ts
- Requirement: R2
- Depends on: W1-1
- Acceptance: tests pass
- [ ] Implemented
- [ ] Verified

### Wave 2

#### Task W2-1: Wire foo into main
- Workstream: ws1
- Files: src/index.ts
- Requirement: R1
- Depends on: W1-1
- Acceptance: main imports and uses foo
- [ ] Implemented
- [ ] Verified

## Out of Scope
- Bar feature

## Risks
- None identified
`;
}
