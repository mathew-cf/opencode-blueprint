# AGENTS.md — Blueprint Plugin

Conventions for AI agents working on the `@mathew-cf/opencode-blueprint` codebase.

## Quick Reference

| Command            | Purpose                          |
| ------------------ | -------------------------------- |
| `bun test`         | Run all tests (bun:test)         |
| `bun run build`    | Bundle to `dist/` (bun build)    |
| `bun run typecheck`| TypeScript check (`tsc --noEmit`)|

Run all three before committing: `bun run typecheck && bun test && bun run build`

## Directory Structure

```
src/
  index.ts            # Plugin entry — wires tools, hooks, config
  types.ts            # Shared interfaces (WorktreeMetadata, NotepadEntry, etc.)
  constants.ts        # WORKSPACE_DIR, RESTRICTED_AGENTS, limits
  agents.ts           # registerAgents() — registers 6 agents via config hook
  hooks.ts            # Guardrail hook, session tracking, lifecycle cleanup
  templates.ts        # Markdown templates for investigation, plan, delegation (incl. file pre-loading)
  prompts/
    planner.ts        # Planner agent system prompt (critical-path minimization, dual-reviewer dispatch)
    orchestrator.ts   # Orchestrator agent system prompt (parallel dispatch, intra-wave continuation, file pre-loading)
    investigator.ts   # Investigator subagent prompt
    reviewer.ts       # Reviewer-completeness subagent prompt (requirements, coverage, quality)
    reviewer-structure.ts  # Reviewer-structure subagent prompt (atomicity, dependencies, conflicts)
    worker.ts         # Worker subagent prompt (supports pre-loaded file contents)
  tools/
    worktree.ts       # blueprint_worktree_{create,merge,cleanup,list}
    notepad.ts        # blueprint_notepad_{read,write}
    progress.ts       # blueprint_progress
    verify.ts         # blueprint_verify
test/
  helpers.ts          # Shared test utilities (mockCtx, temp dirs, git setup)
  worktree.test.ts    # Integration tests with real git repos
  notepad.test.ts     # File I/O, filtering, append
  progress.test.ts    # Checkbox manipulation, summary
  verify.test.ts      # Script detection, pass/fail
  hooks.test.ts       # Guardrails, session tracking, lifecycle
  agents.test.ts      # Agent registration, modes, restrictions
  plugin.test.ts      # Plugin shape, tool count, hooks
scripts/
  sync-version.ts     # Syncs version from package.json into README.md
```

## Architecture

This is an [OpenCode plugin](https://opencode.ai/docs/plugins) built on `@opencode-ai/plugin`.

**Plugin entry** (`src/index.ts`) exports a default `Plugin` function that returns:
- `tool` — 8 custom tools (worktree management, notepad, progress, verify)
- `config` — registers 6 agents (2 primary, 4 subagents)
- `chat.message` — tracks which agent owns each session
- `tool.execute.before` — enforces write boundaries per agent
- `event` — cleans up session state on deletion

**Agent architecture:**
- `planner` and `orchestrator` are `mode: "primary"` (visible in agent switcher)
- `investigator`, `reviewer-completeness`, `reviewer-structure`, `worker` are `mode: "subagent"` (spawned via Task tool)
- Restricted agents (planner, orchestrator, investigator, reviewer-completeness, reviewer-structure) cannot write files outside `.blueprint/` — enforced by the guardrail hook
- Only `worker` agents can modify source code
- The planner dispatches both reviewers in parallel; `reviewer-completeness` (Opus) checks requirements coverage and quality, `reviewer-structure` (Sonnet) checks task atomicity, dependencies, and file conflicts

**Workspace:** All plugin state lives in `.blueprint/` within the project directory:
- `.blueprint/investigations/` — investigation reports
- `.blueprint/plans/` — implementation plans
- `.blueprint/notepads/` — accumulated context (learnings, decisions, issues)
- `.blueprint/drafts/` — work-in-progress plan drafts
- `.blueprint/worktrees/` — worktree metadata JSON files

## Coding Conventions

- **Runtime**: Bun (build, test, and scripts)
- **Build**: `bun build src/index.ts --outdir dist --target node` — single-file bundle
- **Imports**: Use `node:` prefix for Node.js builtins (`node:path`, `node:fs/promises`)
- **Tool definitions**: Use `tool()` from `@opencode-ai/plugin` with Zod-style `tool.schema` for args
- **Async**: All tool execute functions are async. Use `promisify(exec)` for shell commands.
- **Error handling**: Tool execute functions should catch errors and return error strings (not throw)
- **Types**: Define interfaces in `types.ts`, constants in `constants.ts`
- **Prompts**: Each agent prompt is a template literal in its own file under `src/prompts/`. Prompts reference constants and templates via interpolation.
- **Tests**: Use `bun:test` (`describe`, `test`, `expect`). Integration tests in `test/worktree.test.ts` create real git repos in temp directories.

## Test Patterns

- `test/helpers.ts` provides `mockCtx(dir)` which returns a minimal context object with `worktree` set to the given directory
- `executeTool(toolDef, args, ctx)` helper calls `toolDef.execute(args, ctx)` and returns the string result
- `initGitRepo(dir)` creates a real git repo with an initial commit (required for worktree tests)
- `makeTmpDir()` creates a temp directory under the OS temp dir with a `blueprint-test-` prefix
- Worktree tests need real git repos — they are integration tests, not mocks
- `toHaveProperty` with dotted keys (e.g., `"chat.message"`) requires array form `["chat.message"]` in bun:test

## Adding New Tools

1. Create a new file in `src/tools/` exporting a `createXxxTools()` function
2. Each tool uses `tool({ description, args, execute })` from the SDK
3. Prefix tool names with `blueprint_`
4. Add the new tools to the spread in `src/index.ts`
5. Write tests in `test/xxx.test.ts`

## Adding or Modifying Agents

1. Agent prompts live in `src/prompts/`
2. Registration happens in `src/agents.ts` — add to the `registerAgents()` function
3. If the agent should NOT write source files, add its name to `RESTRICTED_AGENTS` in `constants.ts`
4. Subagents use `mode: "subagent"`, primary agents use `mode: "primary"`
