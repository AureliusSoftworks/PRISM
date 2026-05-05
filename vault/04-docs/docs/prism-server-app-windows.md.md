---
title: "docs/prism-server-app-windows.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/prism-server-app-windows.md"
status: "active"
---

# docs/prism-server-app-windows.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/web/.next/standalone/apps/web/server.js]]

## Referenced by
- [[04-docs/README.md]]
- [[06-releases/v0.1.0]]

## Source path
- `docs/prism-server-app-windows.md`

## Body preview
```markdown
# Prism Server for Windows

Prism Server for Windows is the native tray-app wrapper for the Prism server runtime. It mirrors the macOS Prism Server.app experience while using a normal Windows installer wizard and per-user install location.

## Product Experience Target

1. Download `Prism-Server-Setup-v<version>-win-x64.exe` from the Prism Server GitHub Release.
2. Click through the installer wizard.
3. Keep the default per-user install path under `%LOCALAPPDATA%\Programs\Prism Server`.
4. Leave "Start Prism Server when I sign in" checked unless you want to launch manually.
5. Launch Prism Server from the final page or Start Menu.
6. Use the tray icon to open Setup, check logs, start/stop/restart, or quit.

The app presents dependencies as product concepts, matching the Mac server:

- **Server Runtime** - Prism API, discovery, and pairing surface.
- **Memory Engine** - Qdrant-backed semantic memory storage/search.
- **Local AI Engine** - Ollama and the selected local model.

## Install Layout

Installed app payload:

```text
%LOCALAPPDATA%\Programs\Prism Server\
```

Runtime data and logs:

```text
%LOCALAPPDATA%\Prism\
%LOCALAPPDATA%\Prism\Logs\
%LOCALAPPDATA%\Prism\Qdrant\storage\
```

The Windows shell writes its own startup/crash log before any child process starts:

```text
%LOCALAPPDATA%\Prism\Logs\windows-app.log
```

The Logs window includes `windows-app.log`, `api.log`, `web.log`, and `qdrant.log`. If the app crashes during launch, inspect `windows-app.log` first.

The installer adds:

- Start Menu shortcut: `Prism Server`
- Optional Desktop shortcut
- Optional auto-start registry entry at `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\PrismServer`
- Standard Apps & Features uninstall entry

## Runtime Layout

The installed directory contains:

- `Prism Server.exe` - WPF tray app and process supervisor
- `runtime/` - staged Node API + Next.js standalone web runtime
- `node/node.exe` - bundled Node runtime for release builds
- `qdrant/qdrant.exe` - bundled managed Memory Engine sidecar

At runtime the app launches:

- API: `runtime/apps/api/dist/server.js`
- Web: `runtime/apps/web/.next/standalone/apps/web/server.js`
- Managed Qdrant sidecar, unless

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
