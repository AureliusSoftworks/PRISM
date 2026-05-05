---
title: "docs/native-quick-launch.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/native-quick-launch.md"
status: "active"
---

# docs/native-quick-launch.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[06-releases/v0.1.0]]

## Source path
- `docs/native-quick-launch.md`

## Body preview
```markdown
# Native Quick Launch Commands

Use these commands from the repository root after changing one of the native
apps. Each command closes the running app, rebuilds Debug, and launches the
fresh build.

## Console Shortcuts

After your shell has the `prism` helper function loaded, you can run:

```bash
prism ios
prism phone
prism mac-client
prism mac-server
prism web
```

These commands call the repo-owned `scripts/prism` dispatcher. If needed, the
iPhone client still supports overriding the simulator or physical device:

```bash
SIMULATOR_ID="Simulator UDID" prism ios
PHONE_DEVICE_ID="Device UDID" prism phone
```

`prism web` is the only command that runs a long-lived dev server rather than
a build-and-launch — see [Web Dev Server](#web-dev-server) below.

## GitHub Actions release shortcuts (/🏗️)

Shipping **Prism Server** builds to GitHub Releases is documented in
[release-process.md](release-process.md) (operator checklist, workflow names, and
artifact filenames). Use that doc as the source of truth after native changes;
this file focuses on **local** Debug rebuild-and-launch commands.

## Merge Main + Build Runbook

Use this when local `dev` work has already been committed and tested, and you
want to merge it into `main`, verify the web production bundle, then launch the
iPhone simulator build.

### One-Line Happy Path

Run from the repository root:

```bash
git switch main && \
git merge dev && \
npm run build -w apps/web && \
./scripts/prism ios && \
git status --short --branch
```

Expected result:

- `git merge dev` fast-forwards or creates a clean merge into `main`.
- `npm run build -w apps/web` completes successfully.
- `./scripts/prism ios` builds, installs, and launches the simulator app.
- Final status shows `main` clean, usually ahead of `origin/main` until pushed.

### Step-By-Step Version

1. Confirm `dev` is clean before switching branches:

   ```bash
   git status --short --branch
   ```

   Expected result: no tracked file changes.

2. Switch to `main` and merge `dev`:

   ```bash
   git switch main
   git merge dev
   ```

   Expected result: merge completes without conflicts.

3. Build the web app:

   ```bash
   npm run build -w apps/web

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
