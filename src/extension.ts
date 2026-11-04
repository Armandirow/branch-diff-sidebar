import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  getGitApi,
  pickRepository,
  repoRootPath,
  type GitRepository,
} from "./git/gitRepository";
import { buildChangeSet, resolveBaseBranch } from "./git/changeSet";
import { gitLocalBranches } from "./git/gitCli";
import type { GitFileChange } from "./git/types";
import {
  getDefaultBaseBranchFromConfig,
  getStoredBaseBranch,
  getViewMode,
  setStoredBaseBranch,
  toggleViewMode,
} from "./state/workspaceState";
import {
  BaseBranchContentProvider,
  BASE_BRANCH_SCHEME,
} from "./views/baseBranchContentProvider";
import { BranchDiffDecorationProvider } from "./views/branchDiffDecorations";
import {
  BranchDiffTreeItem,
  BranchDiffTreeProvider,
} from "./views/branchDiffTreeProvider";
import { EmptyTreeProvider } from "./views/emptyTreeProvider";

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let treeProvider: BranchDiffTreeProvider;
let contentProvider: BaseBranchContentProvider;
let decorationProvider: BranchDiffDecorationProvider;
let changesTreeView: vscode.TreeView<BranchDiffTreeItem>;
let baseBranch = "main";
let repoRoot = "";
let repoSub: vscode.Disposable | undefined;
let saveSub: vscode.Disposable | undefined;
let gitApiSub: vscode.Disposable | undefined;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  contentProvider = new BaseBranchContentProvider();
  decorationProvider = new BranchDiffDecorationProvider();
  treeProvider = new BranchDiffTreeProvider(contentProvider);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      BASE_BRANCH_SCHEME,
      contentProvider,
    ),
    vscode.window.registerFileDecorationProvider(decorationProvider),
    (changesTreeView = vscode.window.createTreeView("branchDiff.changes", {
      treeDataProvider: treeProvider,
      showCollapseAll: false,
    })),
    vscode.window.createTreeView("branchDiff._layout", {
      treeDataProvider: new EmptyTreeProvider(),
      showCollapseAll: false,
    }),
    vscode.commands.registerCommand("branchDiff.refresh", () => {
      void refreshChangeSet(context);
    }),
    vscode.commands.registerCommand("branchDiff.selectBase", () => {
      void selectBaseBranch(context);
    }),
    vscode.commands.registerCommand("branchDiff.toggleViewMode", () => {
      const mode = toggleViewMode(context);
      treeProvider.setViewMode(mode);
      void syncViewContext();
      void vscode.window.showInformationMessage(
        `Branch Diff: ${mode === "tree" ? "Tree" : "List"} view`,
      );
    }),
    vscode.commands.registerCommand("branchDiff.toggleExpandAll", () => {
      treeProvider.collapseAllDirectories();
      void syncViewContext();
    }),
    vscode.commands.registerCommand("branchDiff.expandAll", () => {
      treeProvider.expandAllDirectories();
      void syncViewContext();
    }),
    vscode.commands.registerCommand(
      "branchDiff.openDiff",
      (change: GitFileChange) => {
        void openDiff(change);
      },
    ),
    vscode.commands.registerCommand(
      "branchDiff.openFile",
      (item: BranchDiffTreeItem | GitFileChange | undefined) => {
        const change = resolveFileChange(item);
        if (change) {
          void openFile(change);
        }
      },
    ),
  );

  treeProvider.setViewMode(getViewMode(context));
  treeProvider.setBadgeUpdater(scheduleChangesBadgeUpdate);
  changesTreeView.onDidChangeVisibility((e) => {
    if (e.visible) {
      scheduleChangesBadgeUpdate();
    }
  });
  void syncViewContext();

  const api = await getGitApi();
  if (api) {
    gitApiSub = vscode.Disposable.from(
      api.onDidOpenRepository(() => void bindRepo(context)),
      api.onDidCloseRepository(() => void bindRepo(context)),
    );
    context.subscriptions.push(gitApiSub);
  }

  saveSub = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (repoRoot && doc.uri.fsPath.startsWith(repoRoot)) {
      scheduleRefresh(context);
    }
  });
  context.subscriptions.push(saveSub);

  await bindRepo(context);
}

export function deactivate(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  repoSub?.dispose();
}

async function bindRepo(context: vscode.ExtensionContext): Promise<void> {
  repoSub?.dispose();
  repoSub = undefined;

  const api = await getGitApi();
  if (!api) {
    treeProvider.setPanelState({
      kind: "no_repo",
      message: "Git extension is not available.",
    });
    treeProvider.setChangeSet(undefined, "");
    decorationProvider.update([]);
    scheduleChangesBadgeUpdate();
    treeProvider.refresh();
    return;
  }

  const repo = pickRepository(api);
  if (!repo) {
    treeProvider.setPanelState({
      kind: "no_repo",
      message: "The folder currently open doesn't have a git repository.",
    });
    treeProvider.setChangeSet(undefined, "");
    decorationProvider.update([]);
    scheduleChangesBadgeUpdate();
    treeProvider.refresh();
    return;
  }

  repoRoot = repoRootPath(repo);
  treeProvider.setPanelState({ kind: "ok" });

  repoSub = repo.state.onDidChange(() => scheduleRefresh(context));

  await refreshChangeSet(context, repo);
}

function scheduleRefresh(context: vscode.ExtensionContext): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  refreshTimer = setTimeout(() => {
    void refreshChangeSet(context);
  }, 300);
}

async function refreshChangeSet(
  context: vscode.ExtensionContext,
  repo?: GitRepository,
): Promise<void> {
  const api = await getGitApi();
  const activeRepo = repo ?? (api ? pickRepository(api) : undefined);
  if (!activeRepo) {
    return;
  }

  repoRoot = repoRootPath(activeRepo);
  const configDefault = getDefaultBaseBranchFromConfig();
  const stored = getStoredBaseBranch(context);

  if (!stored) {
    const resolved = await resolveBaseBranch(
      repoRoot,
      undefined,
      configDefault,
    );
    if (resolved) {
      baseBranch = resolved;
      await setStoredBaseBranch(context, resolved);
    }
  } else {
    baseBranch = stored;
    if (!(await resolveBaseBranch(repoRoot, stored, configDefault))) {
      baseBranch =
        (await resolveBaseBranch(repoRoot, undefined, configDefault)) ??
        configDefault;
    }
  }

  const result = await buildChangeSet(repoRoot, baseBranch);
  treeProvider.setChangeSet(result, repoRoot);
  contentProvider.setContext(repoRoot, result.baseBranch);
  decorationProvider.update(result.files);
  treeProvider.refresh();
  scheduleChangesBadgeUpdate();
}

function scheduleChangesBadgeUpdate(): void {
  updateChangesBadge();
  queueMicrotask(updateChangesBadge);
}

function updateChangesBadge(): void {
  if (!changesTreeView) {
    return;
  }
  const count = treeProvider.getChangeCount();
  changesTreeView.title = "Changes";
  changesTreeView.badge =
    count > 0
      ? {
          value: count,
          tooltip: `${count} changed file${count === 1 ? "" : "s"}`,
        }
      : undefined;
}

function resolveFileChange(
  arg: BranchDiffTreeItem | GitFileChange | undefined,
): GitFileChange | undefined {
  if (!arg || typeof arg !== "object") {
    return undefined;
  }
  if ("fileChange" in arg && arg.fileChange) {
    return arg.fileChange;
  }
  if ("path" in arg && "status" in arg) {
    return arg as GitFileChange;
  }
  if ("relativePath" in arg && typeof arg.relativePath === "string") {
    return treeProvider.getFileChange(arg.relativePath);
  }
  return undefined;
}

async function syncViewContext(): Promise<void> {
  await vscode.commands.executeCommand(
    "setContext",
    "branchDiff.viewModeTree",
    treeProvider.getViewMode() === "tree",
  );
  await vscode.commands.executeCommand(
    "setContext",
    "branchDiff.directoriesExpanded",
    treeProvider.areDirectoriesExpanded(),
  );
}

async function selectBaseBranch(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (!repoRoot) {
    void vscode.window.showWarningMessage("No git repository open.");
    return;
  }

  const branches = await gitLocalBranches(repoRoot);
  const current = baseBranch;
  const picked = await vscode.window.showQuickPick(
    branches.sort((a, b) => a.localeCompare(b)),
    {
      placeHolder: `Base branch (current: ${current})`,
      title: "Select base branch",
    },
  );
  if (!picked) {
    return;
  }

  baseBranch = picked;
  await setStoredBaseBranch(context, picked);
  await refreshChangeSet(context);
}

async function openFile(change: GitFileChange): Promise<void> {
  if (!repoRoot) {
    return;
  }

  const fsPath = path.join(repoRoot, change.path);
  if (fs.existsSync(fsPath)) {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(fsPath),
    );
    await vscode.window.showTextDocument(doc, { preview: true });
    return;
  }

  const baseUri = contentProvider.makeUri(change.path, baseBranch);
  const doc = await vscode.workspace.openTextDocument(baseUri);
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function openDiff(change: GitFileChange): Promise<void> {
  if (!repoRoot) {
    return;
  }

  const baseRef = baseBranch;
  const leftUri = contentProvider.makeUri(change.path, baseRef);
  const rightFsPath = path.join(repoRoot, change.path);

  let rightUri: vscode.Uri;
  if (change.status === "deleted" && !fs.existsSync(rightFsPath)) {
    rightUri = leftUri.with({ scheme: "untitled", path: `/deleted-${change.path}` });
    const doc = await vscode.workspace.openTextDocument(rightUri);
    await vscode.window.showTextDocument(doc, { preview: true });
    return;
  }

  if (fs.existsSync(rightFsPath)) {
    rightUri = vscode.Uri.file(rightFsPath);
  } else {
    rightUri = vscode.Uri.parse(
      `${BASE_BRANCH_SCHEME}-empty:///${change.path}`,
    );
  }

  const title = `${change.path} (${baseRef} ↔ working tree)`;
  await vscode.commands.executeCommand(
    "vscode.diff",
    leftUri,
    rightUri,
    title,
    { preview: true },
  );
}
