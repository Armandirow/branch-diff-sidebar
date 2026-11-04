import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitChangeStatus } from "./types";

const execFileAsync = promisify(execFile);

export async function runGit(
  cwd: string,
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf8",
  });
  return stdout.trimEnd();
}

export async function runGitOptional(
  cwd: string,
  args: string[],
): Promise<string | undefined> {
  try {
    return await runGit(cwd, args);
  } catch {
    return undefined;
  }
}

export function parseNameStatusLine(
  line: string,
): { status: GitChangeStatus; path: string } | undefined {
  if (!line.trim()) {
    return undefined;
  }
  const tab = line.indexOf("\t");
  if (tab === -1) {
    return undefined;
  }
  const rawStatus = line.slice(0, tab);
  let pathPart = line.slice(tab + 1);

  const statusChar = rawStatus.charAt(0);
  let status: GitChangeStatus;
  switch (statusChar) {
    case "A":
      status = "added";
      break;
    case "M":
      status = "modified";
      break;
    case "D":
      status = "deleted";
      break;
    case "R":
      status = "renamed";
      break;
    case "C":
      status = "copied";
      break;
    default:
      status = "modified";
  }

  if (status === "renamed" || status === "copied") {
    const parts = pathPart.split("\t");
    pathPart = parts[parts.length - 1] ?? pathPart;
  }

  return { status, path: pathPart.replace(/\\/g, "/") };
}

export async function gitDiffNameStatus(
  cwd: string,
  range: string,
): Promise<Map<string, GitChangeStatus>> {
  const out = await runGitOptional(cwd, [
    "diff",
    "--name-status",
    range,
  ]);
  const map = new Map<string, GitChangeStatus>();
  if (!out) {
    return map;
  }
  for (const line of out.split("\n")) {
    const parsed = parseNameStatusLine(line);
    if (parsed) {
      map.set(parsed.path, parsed.status);
    }
  }
  return map;
}

export async function gitShow(
  cwd: string,
  ref: string,
  filePath: string,
): Promise<string | undefined> {
  return runGitOptional(cwd, ["show", `${ref}:${filePath}`]);
}

export async function gitRevParseVerify(
  cwd: string,
  ref: string,
): Promise<boolean> {
  const result = await runGitOptional(cwd, ["rev-parse", "--verify", ref]);
  return result !== undefined;
}

export async function gitCurrentBranch(
  cwd: string,
): Promise<string | undefined> {
  const name = await runGitOptional(cwd, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  if (!name || name === "HEAD") {
    return undefined;
  }
  return name;
}

export async function gitLocalBranches(cwd: string): Promise<string[]> {
  const out = await runGitOptional(cwd, ["branch", "--format=%(refname:short)"]);
  if (!out) {
    return [];
  }
  return out
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);
}

export function statusLetter(status: GitChangeStatus): string {
  switch (status) {
    case "added":
    case "untracked":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    default:
      return "M";
  }
}
