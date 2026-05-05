---
title: "docs/prism-client-app.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/prism-client-app.md"
status: "active"
---

# docs/prism-client-app.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[04-docs/README.md]]

## Source path
- `docs/prism-client-app.md`

## Body preview
```markdown
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

Pairing uses the API origin (default `http://127.0.0.1:18787`). The kiosk maps
that to the server's web origin (default `http://127.0.0.1:18788`) before loading
the authenticated app shell. Legacy paired servers using API `:8787` still map to
web `:3000`.

The WebKit shell supplies the paired native-client access token as a
`prism_client_access` cookie before first paint. This token unlocks the hosted
web shell only; users still register or log in with the normal PRISM auth flow.

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
