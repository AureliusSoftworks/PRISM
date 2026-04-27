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
```

These commands call the repo-owned `scripts/prism` dispatcher. If needed, the
iPhone client still supports overriding the simulator or physical device:

```bash
SIMULATOR_ID="Simulator UDID" prism ios
PHONE_DEVICE_ID="Device UDID" prism phone
```

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

