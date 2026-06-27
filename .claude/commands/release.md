# /release

Cut a new Prism release: write the CHANGELOG, stamp the version, merge `dev` → `main`, tag, push, and trigger the binary build workflow on GitHub Actions. Optionally accepts a version argument (e.g. `/release 0.5.0`); if omitted, determine the next version automatically.

## Process

### 1. Determine the version

If a version was passed as an argument, use it. Otherwise:

- Read `CHANGELOG.md` to find the most recent `## [X.Y.Z]` release section.
- Run `git log` to review commits on `dev` since that CHANGELOG entry was written.
- Decide the bump: patch (`0.4.x`) for fixes/polish only; minor (`0.x.0`) for any new user-facing feature or behaviour change. This project does not use major bumps while in `0.x`.

### 2. Identify what changed

Run `git log <last-changelog-commit>..HEAD --oneline` to enumerate every commit since the last CHANGELOG entry was written. Group them into:

- **Added** — new capabilities visible to users
- **Changed** — altered behaviour of existing features
- **Fixed** — bug fixes, regressions, crashes
- **Desktop** — desktop-app-specific additions or fixes (use a `### Desktop` sub-section inside the release block if there are desktop-only items)

Omit pure tooling/CI/lint commits unless they affect the developer experience meaningfully.

### 3. Write the CHANGELOG entry

Edit `CHANGELOG.md`: replace the `## [Unreleased]` body with `_Staging area — nothing queued for release yet._` and insert a new `## [X.Y.Z] - YYYY-MM-DD` section immediately below it (today's date). Match the existing prose style: bullet points, bold lead phrase, 1–3 sentence explanation per item.

### 4. Stamp the version

```
node scripts/set-version.mjs --version X.Y.Z
```

This updates all `package.json` files, `prismAppVersion.ts`, `health.ts`, `Cargo.toml`, and `PrismServer.csproj` in one pass.

### 5. Commit on `dev`

Stage only the files changed by steps 3 and 4 (CHANGELOG + version files). Never use `git add -A`. Commit message:

```
Add CHANGELOG entry and bump version to X.Y.Z

One-line summary of what the release covers.
```

### 6. Merge to `main` and tag

```
git checkout main
git merge --no-ff dev -m "Release vX.Y.Z"
git tag vX.Y.Z
git checkout dev
```

### 7. Push everything

```
git push origin main
git push origin dev
git push origin vX.Y.Z
```

### 8. Trigger the binary build

```
gh workflow run release-main.yml --ref main --field version=X.Y.Z --field desktop_release_channel=github
```

### 9. Watch and report

Run `gh run watch <run-id>` in the background. When it completes, report the outcome and link to the draft release at `https://github.com/AureliusSoftworks/PRISM/releases`.

## Notes

- Always release from `dev`; never cut a release from a feature branch.
- The workflow enforces `main`-only builds — the merge must happen before triggering CI.
- If the build workflow fails, do not delete the tag or revert the merge. Diagnose the failure, fix on `dev`, and re-run the workflow with `gh workflow run`.
- Lint warnings (unused vars, deprecated Node.js actions) do not block release; only exit-code failures do.
