import { INVESTIGATIONS_DIR, PLANS_DIR } from "./constants";

// ---------------------------------------------------------------------------
// Investigation report — used by blueprinter prompt as the target format
// ---------------------------------------------------------------------------
export const INVESTIGATION_REPORT_FORMAT = `\
# Investigation: {name}

## Intent
{what is being investigated and why}

## Codebase Structure
<!-- directory layout, key modules, entry points — with file paths -->

## Relevant Patterns & Conventions
<!-- naming, error handling, logging, imports/exports — with examples -->

## Test Infrastructure
<!-- framework, patterns, helpers, file locations — with file paths -->

## Similar Implementations
<!-- existing code doing something similar, with file paths and snippets -->

## Dependencies & Constraints
<!-- external packages, internal shared modules, API boundaries -->

## Risks & Open Questions
<!-- potential issues, things that need user clarification -->
`;

// ---------------------------------------------------------------------------
// Plan document — used by blueprinter prompt as the target format
// ---------------------------------------------------------------------------
export const PLAN_FORMAT = `\
# Plan: {name}

## Source
Investigation: ${INVESTIGATIONS_DIR}/{investigation-name}.md

## Requirements
- R1: {requirement}
- R2: {requirement}

## Architecture Decisions
- AD1: {decision} — Rationale: {why}

## Tasks

### Wave 1
<!-- Tasks in the same wave can run in parallel across workstreams.
     Tasks in the same workstream within a wave run sequentially.
     Tasks touching the same files MUST share a workstream. -->

#### Task W1-1: {description}
- Workstream: ws1
- Files: {list of files to modify/create}
- Requirement: R1
- Depends on: none
- Acceptance: {specific, verifiable criteria}
- [ ] Implemented
- [ ] Verified

### Wave 2
<!-- Waves run sequentially. Wave 2 starts after all Wave 1 tasks are merged. -->

## Out of Scope
- {explicit exclusions}

## Risks
- {risk} → Mitigation: {approach}
`;

// ---------------------------------------------------------------------------
// Delegation prompt — used by blueprinter to instruct worker subagents
// ---------------------------------------------------------------------------
export const DELEGATION_FORMAT = `\
## TASK
{Specific description of what to implement}

## WORKSPACE
Your working directory is: {absolute worktree path}
ALL file operations must use absolute paths within this directory.
ALL bash commands must set workdir to this path.

## CONTEXT
{Relevant notepad entries from .blueprint/notepads/{planName}/}
{Relevant sections from the investigation report}

## CURRENT FILE CONTENTS
<!-- If no files are pre-loaded, omit this section entirely. -->

### {file path}
\`\`\`{lang}
{contents}
\`\`\`

## CONVENTIONS
{Code patterns and conventions from the investigation report}

## ACCEPTANCE CRITERIA
{Exact acceptance criteria from the plan}

## MUST DO
- {specific requirement 1}
- {specific requirement 2}
- Update or create tests for your changes
- Follow existing code conventions

## MUST NOT
- Modify files outside your workspace
- Implement anything beyond this single task
- Leave TODOs or stub implementations
`;

// ---------------------------------------------------------------------------
// Helpers for creating initial files
// ---------------------------------------------------------------------------

export function investigationReportTemplate(
  name: string,
  intent: string,
): string {
  return INVESTIGATION_REPORT_FORMAT.replace("{name}", name).replace(
    "{what is being investigated and why}",
    intent,
  );
}

export function planTemplate(
  name: string,
  investigationName: string,
): string {
  return PLAN_FORMAT.replace("{name}", name).replace(
    "{investigation-name}",
    investigationName,
  );
}
