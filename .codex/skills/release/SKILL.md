---
name: release
description: Cut a PRISM release from dev to main. A bare $release or /release commits and pushes the intended work, prepares version notes, merges dev into main through a release PR, tags and pushes the release, triggers the release workflow, and watches it through completion. Draft-only preparation must be requested explicitly.
---

# Release

Use this skill only in the PRISM repository. Treat a bare `$release` or `/release` as an end-to-end release runbook: prepare and push `dev`, merge it into `main` through a release PR, create and push the release tag, trigger the release workflow, and watch the result. Do not pause for another approval between those normal release stages.

Only stop at the PR when Jared explicitly asks to `prepare`, `draft`, or `open a draft` release.

## Safety Rules

- Verify the repo path is `/Users/jared/Developer/Web Apps/PRISM` before acting.
- Preserve unrelated local work. Inspect `git status --short` before edits and stage only release files.
- Release from `dev`. If the intended release work is on another branch, land it through a prerequisite PR into `dev`; do not cut the release directly from the feature branch.
- Never use `git add -A`, destructive resets, force pushes, or tag deletion unless Jared explicitly asks.
- Load credentials only through the normal local environment. If a command needs secrets, run it through `/Users/jared/.codex/bin/with-secrets <command>`.
- A bare `$release` or `/release` is standing authorization to:
  - commit the intended current work and release metadata
  - push the current branch and merge a prerequisite PR into `dev` when needed
  - push `dev` and open or update the `dev` to `main` release PR
  - mark the release PR ready and merge `dev` into `main`
  - create and push the release tag
  - trigger the release workflow and watch it through completion
- Do not ask for separate approval for those normal release actions.
- An explicitly requested draft-only release authorizes preparation, commits, pushes, and a draft PR, but not the merge, tag, or release workflow.
- Never bypass required checks, force a push, overwrite or delete an existing tag, discard unrelated work, or resolve a meaningful merge conflict by guessing. Diagnose and repair ordinary release blockers on `dev`; stop only when completion requires a meaningful product decision, destructive action, or check bypass.

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
- current branch is `dev`, or identify the prerequisite branch-to-`dev` PR needed before release prep
- release-scope diffs are clean or understood
- `dev` is up to date enough to release

If unrelated local changes exist, leave them alone. Only continue if they do not conflict with release files, or ask Jared how to handle the risk.

If the intended work is on another branch, commit and push only that intended work, then create or update its PR into `dev` without asking for separate approval. For a bare release, merge that prerequisite PR once its required checks pass, then resume from `dev`. For a draft-only request, stop before the prerequisite merge unless Jared explicitly authorized it.

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

### 7. Push dev And Open The Release PR

Push the prepared `dev` branch:

```bash
git push origin dev
```

Check whether an open `dev` to `main` PR already exists. Reuse and update it when appropriate; otherwise create a new PR. Use `--draft` only for an explicitly requested draft-only release:

```bash
gh pr list --base main --head dev --state open
gh pr create --base main --head dev --title "Release vX.Y.Z" --body "..."
```

The PR body should summarize the version, release notes, and verification. Confirm its live state with `gh pr view`.

For a draft-only release, confirm `isDraft` is true and stop for Jared's handoff. For a bare release, mark an existing draft ready, wait for required checks, and repair ordinary failures on `dev` rather than bypassing them. Then merge with the repository's normal merge-commit strategy and verify the PR reports `MERGED`:

```bash
gh pr ready <pr-number>
gh pr merge <pr-number> --merge
gh pr view <pr-number>
```

### 8. Tag, Push, And Trigger The Release

After the release PR merges, fetch the remote state and verify that `origin/main` contains the released `dev` head. Confirm that neither the local nor remote release tag already exists before creating it; never move an existing tag.

Tag the merged `main` commit without switching away from a dirty `dev` worktree:

```bash
git fetch --prune origin
git merge-base --is-ancestor <released-dev-sha> origin/main
git tag vX.Y.Z origin/main
git push origin vX.Y.Z
gh workflow run release-main.yml --ref main --field version=X.Y.Z --field desktop_release_channel=github
```

This avoids disturbing unrelated local changes while still tagging the exact merged `main` commit. If GitHub CLI needs credentials, wrap only that command with `/Users/jared/.codex/bin/with-secrets`.

### 9. Watch And Report

After triggering the workflow, find the new run id with `gh run list`, verify that its head branch/ref and version match this release, then watch it:

```bash
gh run watch <run-id>
```

Report:

- release version and tag
- pushed branches/tags
- workflow result
- release page: `https://github.com/AureliusSoftworks/PRISM/releases`

If the build workflow fails, do not delete the tag or revert the merge by default. Diagnose the failure, fix on `dev`, merge the repair into `main`, and re-run the workflow when appropriate. Continue until the release completes or a non-bypassable blocker requires Jared's decision.
