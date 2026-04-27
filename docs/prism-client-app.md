# Prism.app

Prism.app is the native macOS client for the Prism product split. It starts as
a native pairing shell, then opens the standard Prism interface in a controlled
WebKit kiosk window after pairing with Prism Server.app.

## Current Slice

This first client milestone implements the minimum end-to-end hybrid loop:

1. Start Prism Server.app.
2. Generate a pairing code in the server window.
3. Open Prism.app.
4. Enter the server address and pairing code.
5. Store the returned session token and server metadata locally.
6. Open the paired server's standard Prism interface inside Prism.app.

This keeps the paid client app in control of pairing and native app ownership
while reusing the existing Prism web interface for the product surface.

## Local Build

From the repository root:

```bash
xcodebuild \
  -project "apps/client-mac/PrismClient.xcodeproj" \
  -scheme PrismClient \
  -configuration Debug \
  -derivedDataPath "apps/client-mac/DerivedData" \
  build
```

The Debug app is written to:

```text
apps/client-mac/DerivedData/Build/Products/Debug/Prism.app
```

## Pairing Data

Paired server state is stored at:

```text
~/Library/Application Support/PrismClient/paired-server.json
```

This file currently contains the paired server URL, bearer token, session
expiry, and display name. A future security pass should move the token into
Keychain before distribution.

## Kiosk Window

After pairing, Prism.app loads:

```text
<paired-server-web-origin>/
```

Pairing uses the API origin (default `http://127.0.0.1:8787`). The kiosk maps
that to the server's web origin (default `http://127.0.0.1:3000`) before loading
the authenticated app shell.

The WebKit shell seeds the paired session token into local storage before first
paint. The web app sends that token as a bearer token for API calls. When the
user logs out, the token is cleared and the normal login/register screen appears.
