import * as vscode from "vscode";

export type ViewMode = "tree" | "flat";

const BASE_BRANCH_KEY = "branchDiff.baseBranch";
const VIEW_MODE_KEY = "branchDiff.viewMode";

export function getStoredBaseBranch(
  context: vscode.ExtensionContext,
): string | undefined {
  return context.workspaceState.get<string>(BASE_BRANCH_KEY);
}

export function setStoredBaseBranch(
  context: vscode.ExtensionContext,
  branch: string,
): Thenable<void> {
  return context.workspaceState.update(BASE_BRANCH_KEY, branch);
}

export function getViewMode(context: vscode.ExtensionContext): ViewMode {
  return context.workspaceState.get<ViewMode>(VIEW_MODE_KEY) ?? "tree";
}

export function setViewMode(
  context: vscode.ExtensionContext,
  mode: ViewMode,
): Thenable<void> {
  return context.workspaceState.update(VIEW_MODE_KEY, mode);
}

export function toggleViewMode(context: vscode.ExtensionContext): ViewMode {
  const next: ViewMode = getViewMode(context) === "tree" ? "flat" : "tree";
  void setViewMode(context, next);
  return next;
}

export function getDefaultBaseBranchFromConfig(): string {
  return vscode.workspace
    .getConfiguration("branchDiff")
    .get<string>("defaultBaseBranch", "main");
}
