---
name: 📝 commit
description: Analyze local changes and organize them into focused commits
invokable: true
---

# /commit — Smart Commit Organizer

You analyze uncommitted changes, group them by logical relevance, and create focused commits when allowed by the user’s invocation.

This is written for Continue prompts, not Cursor commands. Do not use `AskQuestion` or any Cursor-only approval tools. Use normal chat for plan previews and approvals.

## Arguments

- `-f` / `--force`: skip human confirmation after displaying the full plan. Still run safety audits before each commit.
- `-p` / `--push`: after all commits succeed, run `git push` for the current branch.

Arguments can be combined, for example:

```text
/commit -f -p
```

## Workflow

### 0. Parse arguments

Detect `-f` / `--force` and `-p` / `--push` from the user’s invocation.

### 1. Analyze changes

Inspect:

```bash
git status
git diff
```

Also inspect staged changes if present:

```bash
git diff --cached
git status --short
```

### 2. Group changes

Cluster by logical relationship, not just file proximity:

- Feature/system, such as tutorial flow or purchase UI.
- Files that work together.
- Change type: bugfix, feature, refactor, config, docs, style, perf, chore.
- Config/JSON changes that support a feature should usually be committed with that feature.

Keep commits atomic and independently meaningful. Preserve chronological sense where possible: foundations before features.

### 3. Show the commit plan

Before running any `git add` or `git commit`, display the full plan in chat.

Each proposed commit must show:

- Purpose.
- Exact files.
- Proposed conventional commit message.
- Order.
- Whether `--force` waives confirmation.
- Whether `--push` will push after all commits succeed.

Example:

```md
## Smart Commit Plan

### Commit 1/3
Purpose: Improve session intro flow for new players
Files:
- SessionIntroManager.swift
- MapManager.swift
- LuigiMilestoneManager.swift
Message:
feat(tutorial): improve session intro flow

### Commit 2/3
Purpose: Add holster indicator when level completes
Files:
- LevelManager.swift
Message:
feat(level): add completion holster indicator

### Commit 3/3
Purpose: Update documentation
Files:
- README.md
Message:
docs: update feature notes

Approval: required before execution.
Push: not requested.
```

### 4. Approval behavior

- **Normal mode**: stop after showing the plan and ask the user to reply with `approve`, `modify`, or `cancel`. Do not commit until approval is explicit.
- **Force mode (`-f`)**: display the plan, state that confirmation is waived, then proceed to staged-ignore audits and commits.

If the user requests changes to grouping/messages in normal mode, redisplay the updated full plan and ask for approval again.

### 5. Staged ignore audit before every commit

After staging a group and before running `git commit`, run:

```bash
git diff --cached --name-only
git status --short --ignored
```

For suspicious staged paths, check ignore rules even if already staged:

```bash
git check-ignore --no-index -v -- <staged-path>
```

Treat these as high-risk unless explicitly justified in the plan:

- Secrets/env: `.env*`, credentials, keys, tokens, local config.
- Dependencies/caches: `node_modules/`, `.next/`, `.turbo/`, `.cache/`, DerivedData, package-manager caches.
- Build/test output: `dist/`, `build/`, coverage, logs, temp files.
- OS/editor state: `.DS_Store`, `*.xcuserstate`, workspace user state, local IDE metadata.
- Generated binaries/media not intentionally part of the change.

If a risky path is staged:

1. Stop before committing.
2. Explain the risky path and why it is risky.
3. Unstage only the risky path if it is not intended.
4. Propose a `.gitignore` update when needed.
5. Re-run the audit.
6. In normal mode, request approval again if the plan changed.
7. In force mode, do not proceed until the risk is cleared or explicitly resolved in chat.

### 6. Execute commits

For each group:

```bash
git add <files for this commit>
git diff --cached --name-only
git status --short --ignored
# Run git check-ignore --no-index -v -- <staged-path> for suspicious paths.
git commit -m "type(scope): short description"
```

Wait for each commit command to fully finish, including hooks, before reporting success/failure or continuing.

### 7. Push behavior

Only push if `-p` / `--push` was supplied.

After all commits succeed:

```bash
git push
```

If no upstream tracking branch exists:

- Prefer `git push -u origin <current-branch>` when `origin` exists and the branch name is known.
- Otherwise stop and report the missing upstream clearly.

Never map `-f` to `git push --force`. Force-push only if the user explicitly asks for force-with-lease or force-push in chat.

### 8. Final report

Use concise output:

```md
## Commit Result
- ✅ Commit 1: <hash> <message>
- ✅ Commit 2: <hash> <message>
- ✅ Push: <result or not requested>

## Notes
- <any remaining risk or recommended test>
```

## Commit message format

Use conventional commit style:

```text
type(scope): short description

- Optional detail bullet
- Optional detail bullet
```

Allowed types: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`, `perf`, `test`.

## Safety rules

- Do not run `git add` or `git commit` before the full plan is displayed.
- Do not push unless `-p` / `--push` was supplied.
- Recommend testing before committing when changes affect runtime behavior; in `-f` mode this is advisory unless the workspace rules require tests.
- If grouping is uncertain in normal mode, ask in chat. In `-f` mode, proceed with best-effort grouping and briefly state assumptions.
- If any required audit item fails, stop and fix or ask for explicit direction.
