---
name: release
description: Cut a PRISM release from dev to main. Use when the user invokes $release or /release, asks to prepare or cut a PRISM release, wants a changelog/version bump, merge dev to main, create a semver tag, push release branches/tags, or trigger the GitHub Actions release-main.yml binary build workflow.
---

# Release

Use this skill only in the PRISM repository. Treat it as a guarded release runbook: do reversible preparation first, then ask for explicit approval before merge, tag, push, or workflow-trigger steps.

## Safety Rules

- Verify the repo path is `/Users/jared/Developer/Web Apps/PRISM` before acting.
- Preserve unrelated local work. Inspect `git status --short` before edits and stage only release files.
- Release from `dev`. Do not cut a release from a feature branch.
- Never use `git add -A`, destructive resets, force pushes, or tag deletion unless Jared explicitly asks.
- Load credentials only through the normal local environment. If a command needs secrets, run it through `/Users/jared/.codex/bin/with-secrets <command>`.
- Ask for explicit approval before:
  - checking out or modifying `main`
  - merging `dev` into `main`
  - creating a release tag
  - pushing branches or tags
  - triggering GitHub Actions

## Workflow

### 1. Preflight

Run:

```bash
pwd
git status --short
git branch --show-current
git fetch --prune origin
git status --short
```

Confirm:

- working directory is PRISM
- current branch is `dev`
- release-scope diffs are clean or understood
- `dev` is up to date enough to release

If unrelated local changes exist, leave them alone. Only continue if they do not conflict with release files, or ask Jared how to handle the risk.

### 2. Determine Version

If the user passed a version, use it after checking that it is valid `X.Y.Z`.

If no version was passed:

- Read `CHANGELOG.md` and find the latest released `## [X.Y.Z]` section.
- Review commits since that release with `git log`.
- Choose the bump:
  - patch for fixes, polish, or small internal release repairs
  - minor for new user-facing features or behavior changes
  - no major bumps while PRISM is `0.x` unless Jared explicitly asks

### 3. Identify Release Notes

Find the commit where the latest changelog release was added, then review:

```bash
git log <last-changelog-commit>..HEAD --oneline
```

Group user-visible changes into:

- `Added` for new capabilities
- `Changed` for altered behavior
- `Fixed` for bugs, regressions, or crashes
- `Desktop` for desktop-app-only changes, using a `### Desktop` subsection inside the release block

Omit pure tooling, lint, CI, or internal cleanup unless it meaningfully affects developer experience.

### 4. Edit CHANGELOG

In `CHANGELOG.md`:

- Replace the `## [Unreleased]` body with `_Staging area - nothing queued for release yet._`
- Insert `## [X.Y.Z] - YYYY-MM-DD` immediately below Unreleased using today's local date.
- Match the existing style: concise bullets with bold lead phrases and 1-3 sentence explanations.

### 5. Stamp Versions

Run:

```bash
node scripts/set-version.mjs --version X.Y.Z
```

This should update package versions and the project version constants. Inspect the diff and keep only expected release/version files.

If the release includes meaningful user-facing or visual applet work, also update applet versions before committing:

- Review changed applet surfaces with `git diff --name-only <last-changelog-commit>..HEAD -- apps/web/src/app docs` and the release-note commit list.
- Bump each affected applet in `apps/web/src/app/appletVersions.ts`.
- Update `docs/applets.md` Current Applets and Changelog with today's local date.
- Keep `apps/web/src/app/appletVersions.test.ts` assertions in sync.

Treat applet visual work broadly: layout, animation, controls, routing, atmosphere, avatars, cups/table art, wallpaper/state presentation, or visible default-state changes should prompt an applet version check.

### 6. Verify And Commit On dev

Run targeted checks appropriate to the touched files. Prefer at least:

```bash
npm run typecheck
```

Then stage only release files, usually `CHANGELOG.md` plus files changed by `scripts/set-version.mjs`; include `docs/applets.md`, `apps/web/src/app/appletVersions.ts`, and `apps/web/src/app/appletVersions.test.ts` when applet versions changed.

Commit on `dev`:

```text
Add CHANGELOG entry and bump version to X.Y.Z

One-line summary of what the release covers.
```

Do not commit unrelated files.

### 7. Approval Gate: Merge, Tag, Push, Build

Before irreversible release operations, summarize:

- version
- current branch and commit
- files committed
- release notes summary
- planned commands

Ask Jared for explicit approval to proceed.

After approval:

```bash
git checkout main
git merge --no-ff dev -m "Release vX.Y.Z"
git tag vX.Y.Z
git checkout dev
git push origin main
git push origin dev
git push origin vX.Y.Z
gh workflow run release-main.yml --ref main --field version=X.Y.Z --field desktop_release_channel=github
```

If GitHub CLI needs credentials, wrap only that command with `/Users/jared/.codex/bin/with-secrets`.

### 8. Watch And Report

After triggering the workflow, find the run id with `gh run list` if needed, then watch it:

```bash
gh run watch <run-id>
```

Report:

- release version and tag
- pushed branches/tags
- workflow result
- release page: `https://github.com/AureliusSoftworks/PRISM/releases`

If the build workflow fails, do not delete the tag or revert the merge by default. Diagnose the failure, fix on `dev`, and re-run the workflow when appropriate.
