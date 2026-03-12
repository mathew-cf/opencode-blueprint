export const WORKSPACE_DIR = ".blueprint";
export const INVESTIGATIONS_DIR = `${WORKSPACE_DIR}/investigations`;
export const PLANS_DIR = `${WORKSPACE_DIR}/plans`;
export const NOTEPADS_DIR = `${WORKSPACE_DIR}/notepads`;
export const DRAFTS_DIR = `${WORKSPACE_DIR}/drafts`;
export const WORKTREES_DIR = `${WORKSPACE_DIR}/worktrees`;
export const WORKTREE_CHECKOUTS_DIR = `${WORKSPACE_DIR}/wt`;

/** Agents that are NOT allowed to write files outside .blueprint/ */
export const RESTRICTED_AGENTS = [
  "planner",
  "orchestrator",
  "investigator",
  "reviewer",
];

/** Tool name fragments that indicate a file-writing operation */
export const WRITE_TOOLS = ["write", "edit", "apply_patch", "multi_edit"];

/** Max retries for a failed worker task before escalating to user */
export const MAX_RETRIES = 3;

/** Max review cycles before presenting the plan to the user regardless */
export const MAX_REVIEW_CYCLES = 3;

/** Minimum lines in a delegation prompt — thin prompts produce failed tasks */
export const MIN_DELEGATION_LINES = 30;
