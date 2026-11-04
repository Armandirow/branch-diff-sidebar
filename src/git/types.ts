export type GitChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked";

export interface GitFileChange {
  path: string;
  status: GitChangeStatus;
  /** True if the path differs in the branch range (base...HEAD). */
  onBranch: boolean;
  /** True if working tree / index differs from base tip. */
  inWorkingTree: boolean;
}

export interface ChangeSetResult {
  files: GitFileChange[];
  baseBranch: string;
  currentBranch: string | undefined;
  error?: string;
}

export type PanelState =
  | { kind: "ok" }
  | { kind: "no_repo"; message: string }
  | { kind: "error"; message: string };
