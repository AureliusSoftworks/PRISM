# Prism Server.app

Prism Server.app is the native macOS menu-bar launcher for the Prism server
runtime. It wraps the existing Node API and Next.js standalone web UI into a
desktop app that can be signed, notarized, and distributed as a DMG.

This app is the server half of the Apple-platform product split:

- **Prism Server.app** owns the local runtime, data, API, discovery, and web
  dashboard.
- **Prism Client.app** is a separate future native client that discovers and
  pairs with Prism Server.

## Local Build

From the repository root:

```bash
xcodebuild \
  -project "apps/server-mac/PrismServer.xcodeproj" \
  -scheme PrismServer \
  -configuration Debug \
  -derivedDataPath "apps/server-mac/DerivedData" \
  build
```

The Debug app is written to:

```text
apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app
```

By default, local Debug builds use system Node from `PATH`. Release builds can
vendor a universal Node binary by setting `VENDOR_NODE=1` before `xcodebuild`.

## Runtime Layout

The Xcode build phase runs `apps/server-mac/scripts/build-runtime.sh`, which
stages:

- `apps/api/dist/`
- `apps/web/.next/standalone/`
- `apps/web/.next/static/`
- `apps/web/public/` when present
- root `node_modules/`
- workspace package metadata needed by Node module resolution

The app launches two child Node processes:

- API: `runtime/apps/api/dist/server.js`
- Web: `runtime/apps/web/.next/standalone/apps/web/server.js`

Logs are written to:

```text
~/Library/Logs/Prism/
```

Data/config are written to:

```text
~/Library/Application Support/Prism/
```

The app sets `LOCALAI_DATA_DIR` so SQLite data lands under Application Support
when launched by Prism Server.app. Existing local development still uses the
current default unless `DB_PATH` or `LOCALAI_DATA_DIR` is set.

## External Dependencies

Prism Server.app does not bundle Ollama or Qdrant. On first launch, the Setup
window guides users to install and start them:

```bash
brew install ollama
brew install qdrant/tap/qdrant
```

The dependency checker pings:

- Ollama: `http://127.0.0.1:11434/api/tags`
- Qdrant: `http://127.0.0.1:6333/readyz`

## Signing And Notarization

Required GitHub Secrets:

- `DEVELOPER_ID_APPLICATION`
- `APPLE_TEAM_ID`
- `APPLE_DEVELOPER_ID_CERT_BASE64`
- `APPLE_DEVELOPER_ID_CERT_PASSWORD`
- `APPLE_NOTARYTOOL_APPLE_ID`
- `APPLE_NOTARYTOOL_APP_SPECIFIC_PASSWORD`

Manual signing from the repo root:

```bash
apps/server-mac/scripts/sign-and-notarize.sh \
  "apps/server-mac/DerivedData/Build/Products/Release/Prism Server.app" \
  "0.2.0"
```

The script signs nested executable resources, signs the app bundle, creates a
DMG, submits it to Apple notarization, staples the ticket, and writes:

```text
apps/server-mac/dist/Prism-Server-v<version>.dmg
```

## GitHub Release Lane

`.github/workflows/release-server-mac.yml` builds, signs, notarizes, and uploads
the DMG to the existing `server/v<version>` GitHub Release.

Run order:

1. Merge `dev` into `main`.
2. Run `.github/workflows/release-main.yml` to create draft release lanes.
3. Run `.github/workflows/release-server-mac.yml` with the same version.
4. Review the draft `Prism Server v<version>` release assets.
5. Publish manually only after the production readiness gate passes.
