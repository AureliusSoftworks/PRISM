# Prism.app

Prism.app is the native macOS client for Prism. It starts as a native pairing
shell, then opens the standard Prism interface in a controlled WebKit kiosk
window after pairing with Prism Server.app.

Prism.app is the paid Mac client. Distribution and licensing follow the indie
model documented in [distribution-model.md](distribution-model.md): direct DMG
download from GitHub Releases, gated at pairing time by a license code issued
through Patreon (subscription) or a one-time-purchase store. There is no Mac
App Store path.

## Current Slice

This first client milestone implements the minimum end-to-end hybrid loop:

1. Start Prism Server.app.
2. Generate a pairing code in the server window.
3. Open Prism.app.
4. Enter the server address, pairing code, and license code.
5. Store the returned session token and server metadata locally.
6. Open the paired server's standard Prism interface inside Prism.app.

This keeps the paid client app in control of pairing and native app ownership
while reusing the existing Prism web interface for the product surface.

## License Code

Prism.app's first-run pairing screen accepts three inputs:

- **Server address** — the URL of the user's Prism Server.
- **Pairing code** — the short-lived code shown in the Prism Server.app
  window.
- **License code** — the user's purchased license (Patreon subscriber code or
  one-time-purchase code).

The license code travels with the pairing exchange so the server can verify
the client is entitled before issuing a session token. See
[distribution-model.md](distribution-model.md#anti-piracy-posture) for the
broader licensing posture (cross-platform single code, no aggressive DRM,
honest-user defaults).

The license-code generation and validation server is a follow-up; until it
ships, the pairing flow accepts any non-empty placeholder code so local
development and dogfooding aren't blocked.

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

## Release Distribution

Release builds of Prism.app ship as a Developer ID signed and notarized DMG
(`Prism-v<version>.dmg`) attached to the `client/v<version>` GitHub Release.
Users download the DMG, drag Prism.app to Applications, and pair it with their
Prism Server using a license code (see above).

The signing and notarization story mirrors the server side: see
[prism-server-app.md](prism-server-app.md) for the canonical Developer ID +
notarytool flow. The client-side specifics:

- **Bundle identifier:** `com.localai.prism-client`.
- **Entitlements:** standard Hardened Runtime; the client only needs
  outbound HTTP to the paired server (loopback or LAN), so no network server
  entitlements or special hardware access entitlements are required.
- **Notarization:** required for Gatekeeper to accept the DMG without
  user-side overrides. Use the same `xcrun notarytool` flow as the server
  app.
- **DMG packaging:** mirrors the server DMG (drag-to-Applications layout).

The CI workflow at `.github/workflows/build-client-mac.yml` builds, signs,
notarizes, and uploads `Prism-v<version>.dmg` to the `client/v<version>`
GitHub Release on `main`-only runs. It calls
`apps/client-mac/scripts/sign-and-notarize.sh` for the signing /
notarization / DMG-packaging step (a near-copy of the server script) and
adds a `stapler validate` + `spctl --assess` smoke check before uploading.
End-to-end verification on a clean Mac happens the first time the workflow
runs against a real release; see
[release-process.md](release-process.md#native-client-builds) for the
operator runbook.

The DMG layout is currently utilitarian (Prism.app + an `Applications`
symlink, no background image or positioned icons). Visual polish is a
tracked follow-up.

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
