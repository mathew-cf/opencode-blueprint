# Blueprint Plugin — Performance Improvements

## Root Causes

**Not enough parallelism**: The planner has weak guidance on workstream count — it defaults to grouping by "logical area" rather than maximizing independent execution. A 6-task plan might end up with 2 workstreams when 5 would be valid.

**Workers slow per-task**: Workers spend the first 5–15 tool calls on file discovery and reading before writing a single line. The orchestrator already has the file list from the plan and could pre-load them.

**Sequential workstream dispatch**: The orchestrator prompt says tasks in a wave "CAN" be parallel but doesn't enforce it. More critically, when workstream ws1's task A finishes and passes verification, the orchestrator waits for ALL other workstreams before dispatching ws1's task B — even when B has no dependency on them.

---

## Lessons from Claude Code Plugins

**`code-review` plugin**: Uses a strict fan-out → gather at every phase. Key insight: dispatching multiple agents in one message is critical — agents that "can" be parallel often aren't unless the prompt explicitly mandates it with "do this in a single message."

**`feature-dev` plugin**: Phase 2 explicitly says "Launch 2–3 code-explorer agents in parallel" and names the agent types. The specificity matters — vague instructions produce sequential behavior.

**`pr-review-toolkit`**: Specialized per-concern agents outperform one catch-all agent on both latency and quality. Applied here: plan reviewers.

**What's absent in Claude Code** (and Blueprint doesn't have either): **context pre-loading**. Neither system pre-feeds file contents to implementing agents. Workers universally discover files themselves. This is a novel optimization opportunity.

---

## Proposed Changes

### 1. Planner: critical path minimization (`src/prompts/planner.ts`)

**Current**: "assign tasks to workstreams; tasks touching the same files MUST share a workstream"

**Add**:
- Every task that can have its own workstream MUST get one — don't bundle independent tasks to "simplify"
- After decomposing tasks, identify the critical path (longest chain of sequential dependencies) and explicitly minimize it
- Task sizing: 1–3 files, single logical concern; if a task would touch >3 files or mix unrelated concerns, split it
- New explicit step: before finalizing the plan, list the critical path and verify it's as short as possible

**Impact**: Directly increases the number of workers running concurrently per wave.

---

### 2. Delegation format: pre-load file contents (`src/templates.ts` + `src/prompts/orchestrator.ts`)

**Current `DELEGATION_FORMAT`**: TASK, WORKSPACE, CONTEXT (notepad/investigation), CONVENTIONS, ACCEPTANCE CRITERIA, MUST DO/NOT

**Add a `## CURRENT FILE CONTENTS` section**:

```
## CURRENT FILE CONTENTS
{For each file listed in the task, read it from the plan worktree and include here}
### src/foo/bar.ts
\`\`\`ts
{contents}
\`\`\`
```

**Orchestrator prompt addition**: "Before delegating, read each file listed in the task's `Files:` field from the plan worktree using Bash, and include under `## CURRENT FILE CONTENTS`. Workers that receive pre-loaded files skip the file-reading step."

**Worker prompt addition**: "If `## CURRENT FILE CONTENTS` is present in your task, use those contents directly — do not re-read those files. Only use Read/Glob/Grep if you need files NOT listed in your task."

**Impact**: Eliminates 5–15 tool calls from the start of each worker. The orchestrator reads files once and copies them to all workers in the same wave that need them.

---

### 3. Orchestrator: enforce aggressive parallel dispatch (`src/prompts/orchestrator.ts`)

Two specific changes to the Wave execution section:

**a) Wave start dispatch**: Change "Tasks in different workstreams CAN be delegated in parallel" → "You MUST dispatch the first task of EVERY workstream in a single message at wave start. Do not dispatch workstream-by-workstream."

**b) Intra-wave workstream continuation**: Add — "When a task in workstream X passes verification, immediately dispatch the next task in workstream X without waiting for other workstreams to complete. Workstreams are independent; they don't need to stay synchronized. The wave-end merge waits for all workstreams; individual workstreams do not wait for each other."

This unlocks a parallelism pattern the current prompt doesn't support: ws1 can be at task 3 while ws2 is still at task 1.

---

### 4. Parallel reviewer agents (`src/prompts/planner.ts` + `src/prompts/reviewer.ts`)

**Current**: Single reviewer with 9 checks. One failure triggers a full revision cycle.

**Change**: Split into two agents dispatched in parallel:
- **Reviewer A (completeness)**: requirements coverage, acceptance criteria completeness, missing test updates, scope creep, out-of-scope section
- **Reviewer B (structure)**: task atomicity (≤3 files), dependency ordering errors, file conflicts between parallel workstreams

Planner synthesizes both outputs before deciding whether to revise. The reviewer prompt gets split into two distinct personalities with clear scope boundaries.

**Why this helps execution**: A structural error in the plan (wrong wave assignment, missing dependency) causes runtime failures. Reviewer B specifically catching those prevents mid-execution escalations.

---

### 5. Parallel `blueprint_verify` checks (`src/tools/verify.ts`)

Not the primary bottleneck, but a clean improvement:
- Tests, typecheck, and lint run with `Promise.allSettled` concurrently
- Build runs after (may need compiled output from typecheck in some stacks)
- `detectPackageManager` runs all `fs.access` checks in parallel
- `blueprint_worktree_list` and `blueprint_worktree_finalize` use `Promise.all` / `Promise.allSettled` for file reads and workstream cleanup

---

## Priority Order

| # | Change | Impact | Type |
|---|--------|--------|------|
| 1 | Orchestrator: intra-wave workstream continuation | High | Prompt |
| 2 | Orchestrator: mandated parallel dispatch | High | Prompt |
| 3 | Delegation: file pre-loading | High | Template + Prompt |
| 4 | Planner: critical path minimization | High | Prompt |
| 5 | Parallel reviewer agents | Medium | Prompt |
| 6 | Parallel `blueprint_verify` | Low–Medium | Code |

---

## Out of Scope

- Worker model changes (Sonnet stays)
- Investigator model changes (Sonnet stays)
- Dynamic wave rebalancing / work-stealing between workstreams
- Speculative pre-execution of next wave
