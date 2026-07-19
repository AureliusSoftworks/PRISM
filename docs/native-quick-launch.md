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
prism up
prism down
prism standalone
prism standalone-win 0.2.0
prism standalone-dev
prism reset
```

These commands call the repo-owned `scripts/prism` dispatcher. If needed, the
iPhone client still supports overriding the simulator or physical device:

```bash
SIMULATOR_ID="Simulator UDID" prism ios
PHONE_DEVICE_ID="Device UDID" prism phone
```

`prism up` and `prism standalone-dev` are the long-lived commands in this set:
- `prism` and `prism up` run the combined API + web dev flow and open the web
  page once it is ready.
- `prism down` stops the combined API + web dev flow.
- `prism standalone` opens the latest macOS desktop installer DMG (building one if needed).
- `prism standalone-win [version] [channel]` dispatches the desktop release workflow (`release-main.yml`) for Windows packaging and opens the `desktop/v<version>` release page. If `version` is omitted, the root `package.json` version is used.
- `prism standalone-dev` runs the desktop standalone dev flow.
- `prism reset` performs a local factory reset (prompts unless `--force`).

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

## Windows Server

The Windows server app is built and run on Windows only. From PowerShell at the
repository root:

```powershell
.\scripts\prism.ps1 windows-server
```

Factory reset from PowerShell:

```powershell
.\scripts\prism.ps1 reset
.\scripts\prism.ps1 reset --force
```

Release installer builds run on `windows-latest` via
`.github/workflows/release-server-windows.yml`. The workflow publishes the WPF
tray app, stages the Node/Qdrant runtime, packages it with Inno Setup, and
uploads `Prism-Server-Setup-v<version>-win-x64.exe` and the optional portable
`Prism-Server-v<version>-win-x64-portable.zip` to the server release.

## macOS Desktop App

The default local workflow builds the unified Tauri app with its embedded
runtime, installs it at `/Applications/PRISM.app`, and launches that installed
copy:

```bash
prism
```

For a non-system install location, set `PRISM_DESKTOP_INSTALL_DIR` to an
existing writable directory such as `$HOME/Applications`.

## Web Dev Server

Browser + API iteration in one command. Runs the combined dev launcher and
starts both API ([http://localhost:18787](http://localhost:18787)) and web
([http://localhost:18788](http://localhost:18788)) in one foreground session,
then opens the web page once it is ready. On macOS, the opener tries Codex
first and falls back to the default browser if needed.
Use Ctrl+C to stop the running foreground process, or run `prism down` from
another terminal to free both ports.

```bash
prism up
prism web
```

Equivalent to `npm run dev` from the repo root.

Useful overrides:

```bash
PRISM_OPEN_WEB=0 prism up
PRISM_OPEN_TARGET=browser prism up
PRISM_WEB_URL="http://localhost:18788/prism" prism up
PRISM_OPEN_URL_COMMAND='open -a "Codex" "$PRISM_OPEN_URL"' prism up
```

To stop existing local API + web listeners:

```bash
prism down
```

## Desktop Standalone Installer

Open the latest macOS Prism Desktop installer DMG. If none exists yet, the
command builds one first, then opens it.

```bash
prism standalone
```

## Desktop Standalone Dev

Desktop shell iteration with the embedded runtime staging flow. Runs the
standalone command and stays attached to the terminal.

```bash
prism standalone-dev
```

Equivalent to `npm run desktop` from the repo root.

## Shared Version Source

Use this command to update the release version in one shot:

```bash
npm run version:set -- --version 0.2.0 --build 11
```

What this updates automatically:
- root/workspace package versions
- web version label (`PRISM_APP_VERSION`)
- API/discovery server version (`PRISM_SERVER_VERSION`)
- iOS `MARKETING_VERSION` (and `CURRENT_PROJECT_VERSION` when `--build` is provided)
- desktop Cargo version and Windows server installer version

## Factory Reset

Use this when you want a clean local slate without reinstalling the app launcher.

```bash
prism reset
prism reset --force
```

What `prism reset` deletes:
- account and chat SQLite files (`localai.db`, `-wal`, `-shm`)
- generated image files
- local Qdrant storage folders
- local Prism runtime logs and cache folders

What it keeps intentionally:
- launcher configuration files (for example `.env`)
