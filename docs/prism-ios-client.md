# Prism iOS Client

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
