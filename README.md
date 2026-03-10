# @mathew-cf/opencode-blueprint v0.1.0

A structured development workflow plugin for [OpenCode](https://opencode.ai) that guides AI agents through investigation, planning, and parallel implementation with git worktree isolation.

## Why

LLM agents writing code tend to fail in predictable ways: they skip research, produce incomplete plans, mix concerns across tasks, and lose context between steps. Blueprint addresses this by enforcing a phased workflow with separation of concerns between agents, and persistent state that carries knowledge forward.

## How It Works

Blueprint adds five specialised agents and eight tools to OpenCode. The agents form a pipeline:

```
User request
    |
    v
[Planner] ---- spawns ----> [Investigator] (x3-5, parallel)
    |                               |
    |  <-- investigation report ----+
    |
    |  interview loop with user
    |
    |---- spawns ----> [Reviewer] (checks plan for gaps)
    |                       |
    v  <-- feedback --------+
  Approved plan
    |
    v
[Orchestrator] ---- spawns ----> [Worker] (per task, in worktrees)
    |                                  |
    |  <-- code changes ---------------+
    |
    |  4-phase verification (review, tests, QA, gate)
    |
    v
  Merged result
```

### Agents

| Agent | Mode | Role |
|-------|------|------|
| **Planner** | primary | Investigates the codebase, interviews the user, produces a structured implementation plan |
| **Orchestrator** | primary | Executes plans by creating git worktrees, delegating tasks to workers, and verifying results |
| **Investigator** | subagent | Deep codebase research — directory structure, patterns, conventions, dependencies |
| **Reviewer** | subagent | Reviews plans and code for gaps, scope creep, and missing requirements |
| **Worker** | subagent | Implements a single atomic task in an isolated git worktree |

Primary agents appear in the OpenCode agent switcher. Subagents are spawned via the Task tool and are not directly selectable.

### Guardrails

Only **worker** agents can write source code. The planner, orchestrator, investigator, and reviewer are restricted to writing files inside `.blueprint/` only. This is enforced at the tool level via a `tool.execute.before` hook.

### Tools

| Tool | Purpose |
|------|---------|
| `blueprint_worktree_create` | Create an isolated git worktree for a workstream |
| `blueprint_worktree_merge` | Merge a workstream branch back to the base branch |
| `blueprint_worktree_cleanup` | Remove a worktree and optionally delete its branch |
| `blueprint_worktree_list` | List active worktrees with Blueprint metadata |
| `blueprint_notepad_read` | Read accumulated context (learnings, decisions, issues) |
| `blueprint_notepad_write` | Record learnings, decisions, or issues for future tasks |
| `blueprint_progress` | Update plan checkboxes and get completion status |
| `blueprint_verify` | Run tests, typecheck, and lint in a directory |

### Workspace

All plugin state lives in `.blueprint/` within your project directory:

```
.blueprint/
  investigations/   # Codebase research reports
  plans/            # Approved implementation plans
  drafts/           # Work-in-progress plan drafts
  notepads/         # Accumulated context (learnings, decisions, issues)
  worktrees/        # Worktree metadata (JSON)
```

## Installation

```bash
npm install @mathew-cf/opencode-blueprint@0.1.2
```

Then add it to your OpenCode configuration (`opencode.jsonc`):

```jsonc
{
  "plugin": {
    "blueprint": {
      "module": "@mathew-cf/opencode-blueprint"
    }
  }
}
```

## Usage

### Planning

1. Switch to the **planner** agent in OpenCode.
2. Describe what you want to build or change.
3. The planner will spawn investigators to research the codebase, then ask you focused questions.
4. After your requirements are clear, it produces a structured plan with atomic tasks, waves, and workstreams.
5. A reviewer checks the plan for gaps before it's presented for your approval.

### Execution

1. Switch to the **orchestrator** agent.
2. Tell it which plan to execute (e.g., "execute the auth-refactor plan").
3. The orchestrator creates git worktrees, delegates tasks to workers, and runs 4-phase verification on each result.
4. After all waves are complete, it runs a final verification and reports status.

### Verification Phases

Every completed task goes through four gates before being accepted:

1. **Code Review** — the orchestrator reads the diff and checks for stubs, hallucinated imports, scope creep, and convention violations.
2. **Automated Checks** — `blueprint_verify` runs available test/typecheck/lint scripts.
3. **Manual QA** — for UI, API, or CLI changes, the orchestrator describes what to test.
4. **Gate Decision** — all phases pass or the task is retried (up to 3 times).

## Development

```bash
bun install
bun run typecheck    # Type check
bun test             # Run tests (67 tests across 7 files)
bun run build        # Bundle to dist/
```

See [AGENTS.md](AGENTS.md) for coding conventions and contribution guidelines.

## Acknowledgments

The investigation-planning-orchestration workflow is inspired by the [Prometheus and Atlas agents](https://github.com/code-yeongyu/oh-my-openagent) from [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) by [@code-yeongyu](https://github.com/code-yeongyu), licensed under the [Sustainable Use License v1.0](https://github.com/code-yeongyu/oh-my-openagent/blob/main/LICENSE.md). No code was copied; the architectural pattern of separating investigation, planning, and execution into distinct agent roles was used as a design reference. All implementation in this repository is original.

Built on the [OpenCode plugin SDK](https://opencode.ai/docs/plugins) (`@opencode-ai/plugin`), licensed under the [MIT License](https://github.com/anomalyco/opencode/blob/main/LICENSE).

## License

Apache-2.0 — see [LICENSE](LICENSE).
