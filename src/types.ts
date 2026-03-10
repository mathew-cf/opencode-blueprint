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

export interface NotepadEntry {
  type: "learnings" | "decisions" | "issues";
  content: string;
  taskId?: string;
  timestamp: string;
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
