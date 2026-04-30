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
   ```

   Expected result: Next.js production build succeeds.

4. Build and launch the iPhone simulator app:

   ```bash
   ./scripts/prism ios
   ```

   Expected result: Xcode build succeeds and Prism launches in the simulator.

5. Verify final repo state:

   ```bash
   git status --short --branch
   ```

   Expected result: clean working tree on `main`.

### Decision Points

- If `dev` has uncommitted tracked changes: stop, commit or stash intentionally,
  then restart this runbook.
- If `git merge dev` reports conflicts: resolve conflicts on `main`, run the web
  and native builds again, then commit the merge if needed.
- If the web build fails: fix the web/API/shared issue first; do not run the
  native launch as a substitute for the failed production build.
- If `./scripts/prism ios` fails with an Xcode/SQLite/package database lock:
  wait 15 seconds and retry once; if it fails again, wait 30 seconds and retry
  once more before treating another build process as the likely blocker.
- If a physical iPhone build is desired instead of simulator, replace
  `./scripts/prism ios` with `./scripts/prism phone`.
- Do not push automatically. Push `main` only when the merge and builds have
  passed and the developer explicitly wants to publish it.

## iPhone Client

Default simulator: the booted local `iPhone 16 Pro`. Override with
`SIMULATOR_ID="Simulator UDID"` if needed.

```bash
SIMULATOR_ID="${SIMULATOR_ID:-29D05410-1ED7-4282-A174-92A2FDB70FCD}"; \
IOS_BUNDLE_ID="com.localai.prism-ios"; \
IOS_APP_PATH="apps/ios-client/DerivedData/Build/Products/Debug-iphonesimulator/Prism.app"; \
open -a Simulator; \
xcrun simctl boot "$SIMULATOR_ID" 2>/dev/null || true; \
xcrun simctl bootstatus "$SIMULATOR_ID" -b; \
xcrun simctl terminate "$SIMULATOR_ID" "$IOS_BUNDLE_ID" 2>/dev/null || true; \
xcodebuild \
  -project "apps/ios-client/PrismIOS.xcodeproj" \
  -scheme PrismIOS \
  -configuration Debug \
  -derivedDataPath "apps/ios-client/DerivedData" \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
  build && \
xcrun simctl install "$SIMULATOR_ID" "$IOS_APP_PATH" && \
xcrun simctl launch "$SIMULATOR_ID" "$IOS_BUNDLE_ID"
```

## iPhone Client on Physical Device

Defaults to the first paired physical iPhone reported by `xcrun devicectl`.
Override with `PHONE_DEVICE_ID="Device UDID"` if more than one device is
available.

```bash
prism phone
```

## Mac Client

```bash
osascript -e 'quit app id "com.localai.prism-client"' >/dev/null 2>&1 || true; \
sleep 1; \
xcodebuild \
  -project "apps/client-mac/PrismClient.xcodeproj" \
  -scheme PrismClient \
  -configuration Debug \
  -derivedDataPath "apps/client-mac/DerivedData" \
  build && \
open "apps/client-mac/DerivedData/Build/Products/Debug/Prism.app"
```

## Mac Server

```bash
osascript -e 'quit app id "com.localai.prism-server"' >/dev/null 2>&1 || true; \
sleep 1; \
xcodebuild \
  -project "apps/server-mac/PrismServer.xcodeproj" \
  -scheme PrismServer \
  -configuration Debug \
  -derivedDataPath "apps/server-mac/DerivedData" \
  build && \
open "apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app"
```

## Web Dev Server

Front-end iteration in the browser. Runs `next dev` on
[http://localhost:18788](http://localhost:18788) and stays attached to the
terminal — Ctrl+C stops it cleanly. Assumes the API is already running
elsewhere (typically via `prism mac-server`).

```bash
prism web
```

Equivalent to `npm run dev:web` from the repo root.

