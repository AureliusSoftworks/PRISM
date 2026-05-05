---
title: "docs/prism-server-app.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/prism-server-app.md"
status: "active"
---

# docs/prism-server-app.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/web/.next/standalone/apps/web/server.js]]

## Referenced by
- [[04-docs/README.md]]
- [[04-docs/docs/app-store-distribution.md]]
- [[04-docs/docs/release-process.md]]

## Source path
- `docs/prism-server-app.md`

## Body preview
```markdown
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

The Xcode build phase runs `apps/server

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
