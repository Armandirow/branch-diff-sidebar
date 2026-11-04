import * as vscode from "vscode";
import * as path from "node:path";
import { statusLetter } from "../git/gitCli";
import type { GitChangeStatus, GitFileChange } from "../git/types";

/** Tree-only URIs so decorations never leak to Explorer / SCM. */
export const BRANCH_DIFF_TREE_SCHEME = "branch-diff-tree";

export function branchDiffTreeUri(relativePath: string): vscode.Uri {
  const segments = relativePath.split("/").map(encodeURIComponent);
  return vscode.Uri.from({
    scheme: BRANCH_DIFF_TREE_SCHEME,
    path: `/${segments.join("/")}`,
  });
}

export function relativePathFromBranchDiffTreeUri(
  uri: vscode.Uri,
): string | undefined {
  if (uri.scheme !== BRANCH_DIFF_TREE_SCHEME) {
    return undefined;
  }
  const parts = uri.path.split("/").filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.map(decodeURIComponent).join("/");
}

export function fileTypeThemeIcon(relativePath: string): vscode.ThemeIcon {
  const ext = path.extname(relativePath).slice(1).toLowerCase();
  if (!ext) {
    return new vscode.ThemeIcon("default-file");
  }
  return new vscode.ThemeIcon(`file-type-${ext}`);
}

export function statusThemeColor(
  status: GitChangeStatus,
): vscode.ThemeColor {
  switch (status) {
    case "added":
      return new vscode.ThemeColor("gitDecoration.addedResourceForeground");
    case "untracked":
      return new vscode.ThemeColor("gitDecoration.untrackedResourceForeground");
    case "deleted":
      return new vscode.ThemeColor("gitDecoration.deletedResourceForeground");
    case "renamed":
      return new vscode.ThemeColor("gitDecoration.modifiedResourceForeground");
    case "copied":
      return new vscode.ThemeColor("gitDecoration.addedResourceForeground");
    default:
      return new vscode.ThemeColor("gitDecoration.modifiedResourceForeground");
  }
}

function statusTooltip(status: GitChangeStatus): string {
  switch (status) {
    case "added":
      return "Added";
    case "untracked":
      return "Untracked";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    default:
      return "Modified";
  }
}

export class BranchDiffDecorationProvider
  implements vscode.FileDecorationProvider
{
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<vscode.Uri | undefined>();
  readonly onDidChangeFileDecorations = this.onDidChangeEmitter.event;

  private readonly filesByRelativePath = new Map<string, GitFileChange>();

  update(files: GitFileChange[]): void {
    this.filesByRelativePath.clear();
    for (const file of files) {
      this.filesByRelativePath.set(file.path, file);
    }
    this.onDidChangeEmitter.fire(undefined);
  }

  provideFileDecoration(
    uri: vscode.Uri,
  ): vscode.FileDecoration | undefined {
    const relativePath = relativePathFromBranchDiffTreeUri(uri);
    if (!relativePath) {
      return undefined;
    }
    const change = this.filesByRelativePath.get(relativePath);
    if (!change) {
      return undefined;
    }
    return {
      badge: statusLetter(change.status),
      color: statusThemeColor(change.status),
      tooltip: statusTooltip(change.status),
      propagate: false,
    };
  }
}
