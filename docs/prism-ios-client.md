# Prism iOS Client

> **Status: Deprecated.** Under the indie distribution model documented in
> [distribution-model.md](distribution-model.md), the iPhone experience is
> delivered as a Progressive Web App (PWA) served by Prism Server, not as a
> native App Store binary. The Xcode project at `apps/ios-client/` is retained
> for archive and historical reference only; it is no longer the shipping
> path. The PWA approach is described first below; the original native-client
> design notes follow under "Archived: Native iOS Client" at the bottom of
> this file.

## iOS Delivery via PWA

The iPhone client today is the same web shell that desktop browsers see,
served by Prism Server, with PWA metadata that lets iOS users install it as a
home-screen app. There is no App Store listing, no TestFlight, no native
binary download.

### User flow

1. User installs and starts Prism Server on Mac, Windows, or Linux.
2. User opens the server URL on their iPhone in **Safari** (Add to Home Screen
   only works from Safari, not Chrome or Firefox on iOS).
3. User completes the standard pairing flow in the browser: enters the
   pairing code shown by the server.
4. Once paired, the user taps the Safari Share sheet and selects
   **"Add to Home Screen"**. iOS adds a springboard icon for Prism.
5. Tapping the home-screen icon launches Prism in a chromeless, fullscreen,
   kiosk-style window — no Safari address bar, no tab strip. Visually
   indistinguishable from a native app for everyday use.

The pairing token is stored by the server and authenticated through the
`prism_client_access` cookie (the same local session gate the Mac client uses),
so the home-screen launcher resumes the paired session without re-pairing.

### Web manifest requirements

The web app needs a `manifest.json` (or `manifest.webmanifest`) declaring the
home-screen install metadata:

```json
{
  "name": "Prism",
  "short_name": "Prism",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/prism-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/prism-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`display: "standalone"` is what gives the home-screen launch its kiosk feel
(no Safari chrome). `display: "fullscreen"` is also supported on iOS but hides
the iOS status bar; `standalone` is the better default unless the app is
explicitly designed to take over the whole screen.

### Apple-specific meta tags

Apple ignores parts of the standard manifest and reads its own legacy meta
tags. The web shell's `<head>` should include both, so the manifest covers
Android/Chromium browsers and the meta tags cover iOS Safari:

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Prism">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/prism-180.png">
```

- `apple-mobile-web-app-capable=yes` is the legacy switch that makes Safari
  treat the site as a home-screen-installable app.
- `apple-mobile-web-app-status-bar-style` controls the iOS status bar tint
  when the PWA is launched from the home screen. `black-translucent` lets the
  Prism background extend behind the status bar.
- `apple-mobile-web-app-title` sets the home-screen icon label (otherwise iOS
  uses the document `<title>`, which can be longer than ideal).
- `apple-touch-icon` (`180x180` PNG, no transparency) is the icon iOS shows on
  the home screen. Without it, iOS falls back to a screenshot of the page,
  which looks unfinished.

### Support in the PWA flow

The PWA flow does not include payment, support, or purchase steps. Optional
$5/month Patreon support remains outside the runtime and must not affect local
pairing, session access, or feature availability.

### What this replaces

Compared to the deprecated native iOS client, the PWA approach gives up:

- Bonjour/mDNS server discovery (browser sandbox can't do this; users enter
  the server URL by hand or follow a deep link from Prism Server's setup
  flow).
- Native Local Network permission UX (irrelevant — the browser handles
  network calls under its own permission model).
- Face ID / Touch ID app lock (out of scope today; can be added later via
  WebAuthn if needed).
- Keychain-backed token storage (the server-side pairing cookie replaces
  this).

In return, it gains: zero App Store overhead, no TestFlight 90-day expiry,
instant updates (the PWA loads whatever the server is serving), and one less
native codebase to maintain.

## Archived: Native iOS Client

> Everything below this line describes the **deprecated** native iOS Xcode
> project at `apps/ios-client/`. It is kept for archive only. The iPhone
> shipping path is the PWA above. The native project may be deleted in a
> future cleanup pass.

Prism iOS is the iPhone-first hybrid client for Prism. It owns the native
onboarding, pairing, Local Network posture, and secure device session, then
opens the existing mobile-friendly Prism web interface in a `WKWebView`.

## Current Slice

This milestone implements:

- SwiftUI first-run shell for manual server URL and pairing-code entry.
- `GET /api/health` validation before pairing.
- `POST /api/pairing/exchange` exchange with Prism Server.
- Keychain-backed bearer-token storage.
- Local paired-server metadata storage.
- WebKit kiosk that maps API origin `:18787` to web origin `:18788` while preserving legacy `:8787` to `:3000` compatibility.

No server runtime runs on iOS.

## Local Build

From the repository root:

```bash
xcodebuild \
  -project "apps/ios-client/PrismIOS.xcodeproj" \
  -scheme PrismIOS \
  -configuration Debug \
  -derivedDataPath "apps/ios-client/DerivedData" \
  -sdk iphonesimulator \
  build
```

## Runtime Flow

1. User starts Prism Server.app on Mac.
2. User generates a pairing code.
3. User opens Prism iOS and enters the server API URL plus code.
4. Prism iOS validates `/api/health`.
5. Prism iOS exchanges the pairing code for a bearer session plus a separate native-client access token.
6. Tokens are stored in Keychain; paired-server metadata is stored in app support.
7. The app opens the paired server web surface in `WKWebView` and supplies only the native-client access token as the web-gate credential.
8. The user still registers or logs in through the normal PRISM auth screen; pairing does not log them into the web app.

## App Store Posture

This is a hybrid client, not a pure web wrapper:

- Pairing is native.
- Local Network permission copy is native.
- Session ownership is native and Keychain-backed.
- The web surface is loaded only after native-client access is established with a user-owned Prism Server.

Future App Store work should add Bonjour discovery, QR scanning, Face ID/Touch ID
app lock, and a small native settings surface.
