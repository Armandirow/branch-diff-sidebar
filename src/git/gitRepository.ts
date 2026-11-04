import * as vscode from "vscode";

/** Minimal typings for the built-in Git extension API. */
export interface GitExtensionAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
}

export interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    HEAD?: { name?: string; commit?: string };
    onDidChange: vscode.Event<void>;
  };
}

export async function getGitApi(): Promise<GitExtensionAPI | undefined> {
  const ext = vscode.extensions.getExtension<{ getAPI(version: number): GitExtensionAPI }>(
    "vscode.git",
  );
  if (!ext) {
    return undefined;
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  return ext.exports.getAPI(1);
}

export function pickRepository(
  api: GitExtensionAPI,
): GitRepository | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return api.repositories[0];
  }

  for (const folder of folders) {
    const match = api.repositories.find((repo) =>
      folder.uri.fsPath.startsWith(repo.rootUri.fsPath),
    );
    if (match) {
      return match;
    }
  }

  return api.repositories[0];
}

export function repoRootPath(repo: GitRepository): string {
  return repo.rootUri.fsPath;
}
