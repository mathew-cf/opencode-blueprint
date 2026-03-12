export type IntentType =
  | "feature"
  | "bugfix"
  | "refactor"
  | "migration"
  | "research";

export interface WorktreeMetadata {
  path: string;
  branch: string;
  workstream: string;
  planName: string;
  status: "active" | "merged" | "removed";
  createdAt: string;
}

export interface PlanMetadata {
  planName: string;
  baseSha: string;
  /** The branch the plan was started from (merge target after finalization) */
  baseBranch: string;
  /** Absolute path to the plan-level worktree (orchestrator's isolated execution base) */
  planWorktreePath: string;
  /** Branch name for the plan worktree: blueprint/{planName} */
  planBranch: string;
  createdAt: string;
}

export interface ProgressSummary {
  planName: string;
  implementedChecked: number;
  implementedTotal: number;
  verifiedChecked: number;
  verifiedTotal: number;
  incompleteTasks: string[];
  complete: boolean;
}

export interface VerifyResult {
  check: string;
  passed: boolean;
  output: string;
}
