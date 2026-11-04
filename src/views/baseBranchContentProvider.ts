import * as vscode from "vscode";
import { gitShow } from "../git/gitCli";

export const BASE_BRANCH_SCHEME = "branch-diff";

export class BaseBranchContentProvider
  implements vscode.TextDocumentContentProvider
{
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private cwd = "";
  private baseRef = "main";

  setContext(cwd: string, baseRef: string): void {
    this.cwd = cwd;
    this.baseRef = baseRef;
    this.onDidChangeEmitter.fire(vscode.Uri.parse(`${BASE_BRANCH_SCHEME}:///`));
  }

  refresh(): void {
    this.onDidChangeEmitter.fire(vscode.Uri.parse(`${BASE_BRANCH_SCHEME}:///`));
  }

  makeUri(filePath: string, baseRef: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: BASE_BRANCH_SCHEME,
      authority: baseRef,
      path: `/${filePath}`,
    });
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const baseRef = uri.authority || this.baseRef;
    const filePath = uri.path.replace(/^\//, "");
    if (!this.cwd || !filePath) {
      return "";
    }
    const content = await gitShow(this.cwd, baseRef, filePath);
    return content ?? "";
  }
}
