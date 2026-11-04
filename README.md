# Branch Diff

VS Code / Cursor extension: activity-bar sidebar showing files that differ between your current branch and a selectable base branch (default `main`), including uncommitted changes.

## Features

- Compare **current branch vs base** using PR-style `base...HEAD` for committed changes
- Includes **uncommitted** edits (working tree vs base tip)
- Open **diff editor**: base branch (left) vs working tree (right)
- **Tree / list** toggle in the view toolbar
- **Local branch picker**; remembers base branch per workspace
- Read-only review (no staging from this view)

## Requirements

- [Git](https://git-scm.com/) on your `PATH`
- Built-in **Git** extension (`vscode.git`)

## Usage

1. Open a git repository.
2. Click the **Branch Diff** icon in the activity bar.
3. Use the branch icon in the title bar to change the base branch (default `main`).
4. Click a file to open the diff.

## Development

```bash
npm install
npm run compile
```

Press **F5** in VS Code or Cursor to launch an Extension Development Host.

## Publishing

CI publishes to **Open VSX** and the **Visual Studio Marketplace** on tags matching `v*`.

Repository secrets:

- `VSCE_PAT` — Marketplace personal access token
- `OVSX_PAT` — Open VSX personal access token

Local package:

```bash
npm run package
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `branchDiff.defaultBaseBranch` | `main` | Base branch when none is stored for the workspace |

## License

MIT
