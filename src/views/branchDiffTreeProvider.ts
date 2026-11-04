import * as vscode from "vscode";
import * as path from "node:path";
import type { ChangeSetResult, GitFileChange, PanelState } from "../git/types";
import type { ViewMode } from "../state/workspaceState";
import { BaseBranchContentProvider } from "./baseBranchContentProvider";
import {
  branchDiffTreeUri,
  fileTypeThemeIcon,
} from "./branchDiffDecorations";

export type TreeItemKind =
  | "message"
  | "directory"
  | "file";

export class BranchDiffTreeItem extends vscode.TreeItem {
  constructor(
    public readonly kind: TreeItemKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly fileChange?: GitFileChange,
    public readonly relativePath?: string,
  ) {
    super(label, collapsibleState);
    if (kind === "file" && fileChange) {
      this.contextValue = "branchDiffFile";
      this.resourceUri = branchDiffTreeUri(fileChange.path);
      this.iconPath = fileTypeThemeIcon(fileChange.path);
      this.command = {
        command: "branchDiff.openDiff",
        title: "Open Diff",
        arguments: [fileChange],
      };
    } else if (kind === "message") {
      this.iconPath = new vscode.ThemeIcon("info");
    } else if (kind === "directory") {
      this.iconPath = new vscode.ThemeIcon("folder");
    }
  }
}

interface DirectoryNode {
  name: string;
  fullPath: string;
  children: Map<string, DirectoryNode>;
  files: GitFileChange[];
}

export class BranchDiffTreeProvider
  implements vscode.TreeDataProvider<BranchDiffTreeItem>
{
  private readonly onDidChangeTreeDataEmitter =
    new vscode.EventEmitter<BranchDiffTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private panelState: PanelState = { kind: "no_repo", message: "No git repository" };
  private changeSet: ChangeSetResult | undefined;
  private viewMode: ViewMode = "tree";
  private directoryTree: DirectoryNode | undefined;
  private directoriesExpanded = true;
  /** Bumped on collapse/expand-all so the tree resets expansion state. */
  private layoutEpoch = 0;
  private badgeUpdater: (() => void) | undefined;

  constructor(
    private readonly contentProvider: BaseBranchContentProvider,
  ) {}

  setBadgeUpdater(fn: () => void): void {
    this.badgeUpdater = fn;
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
    this.badgeUpdater?.();
  }

  setPanelState(state: PanelState): void {
    this.panelState = state;
  }

  setChangeSet(result: ChangeSetResult | undefined, repoRoot: string): void {
    this.changeSet = result;
    this.directoryTree = result
      ? buildDirectoryTree(result.files)
      : undefined;
    if (result) {
      this.contentProvider.setContext(repoRoot, result.baseBranch);
    }
  }

  getFileChange(relativePath: string): GitFileChange | undefined {
    return this.changeSet?.files.find((f) => f.path === relativePath);
  }

  getChangeCount(): number {
    return this.changeSet?.files.length ?? 0;
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.refresh();
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  areDirectoriesExpanded(): boolean {
    return this.directoriesExpanded;
  }

  collapseAllDirectories(): void {
    if (this.viewMode !== "tree") {
      return;
    }
    this.directoriesExpanded = false;
    this.layoutEpoch++;
    this.refresh();
  }

  expandAllDirectories(): void {
    if (this.viewMode !== "tree") {
      return;
    }
    this.directoriesExpanded = true;
    this.layoutEpoch++;
    this.refresh();
  }

  getTreeItem(element: BranchDiffTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BranchDiffTreeItem): BranchDiffTreeItem[] {
    if (this.panelState.kind === "no_repo") {
      return [
        new BranchDiffTreeItem(
          "message",
          this.panelState.message,
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    if (this.panelState.kind === "error") {
      return [
        new BranchDiffTreeItem(
          "message",
          this.panelState.message,
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    if (!this.changeSet) {
      return [
        new BranchDiffTreeItem(
          "message",
          "Loading…",
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    if (this.changeSet.error) {
      return [
        new BranchDiffTreeItem(
          "message",
          this.changeSet.error,
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    const files = this.changeSet.files;
    if (files.length === 0) {
      const branchLabel = this.changeSet.currentBranch ?? "HEAD";
      return [
        new BranchDiffTreeItem(
          "message",
          `No changes vs ${this.changeSet.baseBranch} on ${branchLabel}`,
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    const dirState = this.directoriesExpanded
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed;

    if (!element) {
      if (this.viewMode === "flat") {
        return files.map((f) =>
          fileItem(f, path.basename(f.path), f.path),
        );
      }
      const root = this.directoryTree ?? buildDirectoryTree(files);
      return directoryChildren(root, dirState, this.layoutEpoch);
    }

    if (element.kind === "directory" && element.relativePath !== undefined) {
      const root = this.directoryTree ?? buildDirectoryTree(this.changeSet.files);
      const node = findDirectoryNode(root, element.relativePath);
      if (!node) {
        return [];
      }
      return directoryChildren(node, dirState, this.layoutEpoch);
    }

    return [];
  }
}

function fileItem(
  file: GitFileChange,
  label: string,
  relativePath: string,
): BranchDiffTreeItem {
  const item = new BranchDiffTreeItem(
    "file",
    label,
    vscode.TreeItemCollapsibleState.None,
    file,
    relativePath,
  );
  item.id = `branchDiff:file:${relativePath}`;
  return item;
}

function buildDirectoryTree(files: GitFileChange[]): DirectoryNode {
  const root: DirectoryNode = {
    name: "",
    fullPath: "",
    children: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.path.split("/");
    if (parts.length === 1) {
      root.files.push(file);
      continue;
    }
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const fullPath = parts.slice(0, i + 1).join("/");
      let child = current.children.get(part);
      if (!child) {
        child = {
          name: part,
          fullPath,
          children: new Map(),
          files: [],
        };
        current.children.set(part, child);
      }
      current = child;
    }
    current.files.push(file);
  }

  return root;
}

function findDirectoryNode(
  root: DirectoryNode,
  relativePath: string,
): DirectoryNode | undefined {
  if (relativePath === "") {
    return root;
  }
  const parts = relativePath.split("/");
  let current: DirectoryNode = root;
  for (const part of parts) {
    const next = current.children.get(part);
    if (!next) {
      return undefined;
    }
    current = next;
  }
  return current;
}

function directoryChildren(
  node: DirectoryNode,
  dirState: vscode.TreeItemCollapsibleState,
  layoutEpoch: number,
): BranchDiffTreeItem[] {
  const items: BranchDiffTreeItem[] = [];

  const sortedDirs = [...node.children.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const dir of sortedDirs) {
    const item = new BranchDiffTreeItem(
      "directory",
      dir.name,
      dirState,
      undefined,
      dir.fullPath,
    );
    item.id = `branchDiff:dir:${dir.fullPath}@${layoutEpoch}`;
    items.push(item);
  }

  const sortedFiles = [...node.files].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  for (const file of sortedFiles) {
    items.push(fileItem(file, path.basename(file.path), file.path));
  }

  return items;
}
