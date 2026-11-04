import type { GitChangeStatus, ChangeSetResult, GitFileChange } from "./types";
import {
  gitDiffNameStatus,
  gitCurrentBranch,
  gitRevParseVerify,
  gitLocalBranches,
  runGitOptional,
} from "./gitCli";

function mergeStatus(
  a: GitChangeStatus | undefined,
  b: GitChangeStatus | undefined,
): GitChangeStatus {
  if (!a) {
    return b ?? "modified";
  }
  if (!b) {
    return a;
  }
  if (a === b) {
    return a;
  }
  if (a === "deleted" || b === "deleted") {
    return "modified";
  }
  return "modified";
}

export async function resolveBaseBranch(
  cwd: string,
  stored: string | undefined,
  configDefault: string,
): Promise<string | undefined> {
  const candidates = [
    ...(stored ? [stored] : []),
    configDefault,
    configDefault === "main" ? "master" : "main",
  ];
  const seen = new Set<string>();
  for (const name of candidates) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    if (await gitRevParseVerify(cwd, name)) {
      return name;
    }
  }
  const branches = await gitLocalBranches(cwd);
  const current = await gitCurrentBranch(cwd);
  const fallback = branches.find((b) => b !== current);
  return fallback;
}

export async function buildChangeSet(
  cwd: string,
  baseBranch: string,
): Promise<ChangeSetResult> {
  const currentBranch = await gitCurrentBranch(cwd);

  if (!(await gitRevParseVerify(cwd, baseBranch))) {
    return {
      files: [],
      baseBranch,
      currentBranch,
      error: `Base branch "${baseBranch}" was not found.`,
    };
  }

  const branchRange = `${baseBranch}...HEAD`;
  const branchMap = await gitDiffNameStatus(cwd, branchRange);
  const wtMap = await gitDiffNameStatus(cwd, baseBranch);

  const untrackedOut = await runGitOptional(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  if (untrackedOut) {
    for (const path of untrackedOut.split("\n")) {
      const p = path.trim().replace(/\\/g, "/");
      if (!p) {
        continue;
      }
      if (!wtMap.has(p)) {
        wtMap.set(p, "untracked");
      }
    }
  }

  const allPaths = new Set<string>([
    ...branchMap.keys(),
    ...wtMap.keys(),
  ]);

  const files: GitFileChange[] = [];
  for (const path of allPaths) {
    const onBranch = branchMap.has(path);
    const inWorkingTree = wtMap.has(path);
    const status = mergeStatus(branchMap.get(path), wtMap.get(path));
    files.push({ path, status, onBranch, inWorkingTree });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    baseBranch,
    currentBranch,
  };
}
