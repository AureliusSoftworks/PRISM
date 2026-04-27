# Prism Server.app

Prism Server.app is the native macOS Dock app for the Prism server runtime. It
wraps the existing Node API into a desktop app that can be signed, notarized,
and distributed as a DMG.

This app is the server half of the Apple-platform product split:

- **Prism Server.app** owns the local runtime, data, API, discovery, and client
  pairing.
- **Prism Client.app** is a separate future native client that discovers and
  pairs with Prism Server.

## Product Experience Target

Prism Server.app should feel like a normal Mac utility:

1. Download the DMG.
2. Drag `Prism Server.app` to Applications.
3. Open the app.
4. Click one clear setup action if local dependencies are missing.
5. End with the server running and ready for a Prism client app to pair.

The user should not need to know what Node, Qdrant, or a vector database is.
The app should present dependency state as product concepts:

- **Server Runtime** — Prism API, discovery, and pairing surface.
- **Memory Engine** — Qdrant-backed semantic memory storage/search.
- **Local AI Engine** — Ollama and the selected local model.

## App Identity

- **Prism Server.app icon**: white background with a black triangle. This should
  feel stable, infrastructural, and utility-like.
- **Prism Client.app icon**: the full rainbow Prism icon. This is the
  user-facing, expressive client identity.

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
Similarly, set `VENDOR_QDRANT=1` to download and lipo a universal `qdrant` into
the app resources (or place `apps/server-mac/Resources/qdrant` first). Without a
bundled or Homebrew `qdrant` binary, the Memory Engine cannot start a managed
sidecar until one is available.

## Runtime Layout

The Xcode build phase runs `apps/server-mac/scripts/build-runtime.sh`, which
stages:

- `apps/api/dist/`
- `apps/web/.next/standalone/` for internal troubleshooting builds only
- `apps/web/.next/static/` for internal troubleshooting builds only
- `apps/web/public/` when present, for internal troubleshooting builds only
- root `node_modules/`
- workspace package metadata needed by Node module resolution

At runtime, Qdrant is resolved in one of two modes: **Prism-managed** (spawn a
local sidecar) or **external** (an existing `/readyz` on your configured
`QDRANT_URL`—including a Qdrant already running on the default port). The app
launches one user-facing child Node process:

- API: `runtime/apps/api/dist/server.js`

The first-run window also exposes user-approved setup actions:

- **Start Memory Engine** starts the managed Qdrant sidecar when Prism owns it.
- **Download Model** runs `ollama pull <configured-model>` only after the user
  clicks the button and Ollama is reachable.

These actions use fixed process arguments, not shell command strings. Output is
logged under `~/Library/Logs/Prism/`.

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

## Managed First-Run Setup

The first launch target is not "detect and tell the user what to install." The
target is a managed setup flow:

- Detect whether Ollama is already installed and reachable.
- Detect whether the configured default model is already available in Ollama.
- Start or install Prism-managed Qdrant without requiring the user to understand
  Qdrant.
- Start the Prism API once required local services are ready.

### Ollama

Do not containerize Ollama or bundle a language model into the Prism Server DMG.
Ollama should run natively on macOS so it can use the platform's normal local
acceleration path.

First-run behavior:

- If Ollama is already installed and reachable, use it.
- If Ollama is missing, offer a clear "Install Ollama" action that opens or runs
  the official install path with user consent.
- If the default model is missing, offer a "Download default model" action with
  visible progress and disk-size expectations.

Future Settings behavior:

- Show installed/local model status in plain language.
- Offer a button to open the models location or model-management help.
- Never repull or reinstall a model that already exists.

### Qdrant

Qdrant should become a Prism-managed sidecar. Unlike Ollama, it is internal
infrastructure for Prism's memory engine and should not feel like a separate app
the user has to understand.

Target behavior:

- Prefer an app-managed Qdrant binary/sidecar over a Docker dependency.
- Store Qdrant data under:

```text
~/Library/Application Support/Prism/Qdrant/
```

- Start and stop Qdrant with Prism Server.app.
- If an existing Qdrant endpoint is configured and reachable, use it instead of
  starting the managed sidecar.

The dependency checker pings:

- Ollama: `http://127.0.0.1:11434/api/tags`
- Qdrant: `http://127.0.0.1:6333/readyz`

The UI should translate those checks into:

- `Local AI Engine: Ready / Needs Setup`
- `Memory Engine: Ready / Needs Setup`

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
