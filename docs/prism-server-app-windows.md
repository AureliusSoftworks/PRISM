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
- Managed Qdrant sidecar, unless an external configured Qdrant endpoint is already reachable

## First-Run Setup

The setup window checks:

- Qdrant `/readyz` at the configured `QDRANT_URL`
- Ollama `/api/tags` at the configured `OLLAMA_HOST`
- The configured default Ollama model

Ollama is not bundled and is not chain-installed by the wizard. The app detects it on first run and can run `ollama pull <configured-model>` after the user clicks the download action.

## Firewall Notes

The app runs per-user and does not require admin during install. Native Prism clients need LAN reachability to the API port (`18787` by default). Windows Defender Firewall may prompt on first launch.

If pairing fails because the API port is blocked, run PowerShell as Administrator:

```powershell
New-NetFirewallRule -DisplayName "Prism Server API" -Direction Inbound -Protocol TCP -LocalPort 18787 -Action Allow -Profile Private,Domain
```

The bundled web dashboard is not the user-facing flow and is not exposed from the tray menu.

## Uninstall

Users uninstall through normal Windows entry points:

- Settings -> Apps -> Installed apps -> Prism Server -> Uninstall
- Control Panel -> Programs and Features -> Prism Server -> Uninstall
- Start Menu search -> Prism Server -> Uninstall

Uninstall always removes:

- `%LOCALAPPDATA%\Programs\Prism Server\`
- Start Menu shortcut
- Desktop shortcut, if created
- Auto-start registry entry
- Apps & Features registration

Uninstall leaves `%LOCALAPPDATA%\Prism\` in place by default so reinstalling preserves accounts, chats, memory, config, and logs. The uninstall wizard offers a default-off checkbox to also delete Prism data and logs for a complete local wipe.

Ollama and Ollama models are never removed by Prism Server's uninstaller.

## Local Build

For repeated installer smoke tests on Windows, run the batch wrapper from the repository root:

```bat
apps\server-windows\scripts\test-installer.bat 0.2.0
```

It installs Node dependencies, runs the .NET tests, publishes `Prism Server.exe`, stages the runtime with bundled Node and Qdrant, builds the Inno Setup installer, then asks whether to launch it.

The equivalent manual commands are:

```powershell
dotnet publish apps/server-windows/src/PrismServer.csproj `
  -c Release `
  -r win-x64 `
  --self-contained true `
  /p:PublishSingleFile=true

pwsh apps/server-windows/scripts/build-runtime.ps1 `
  -OutputDir "apps/server-windows/src/bin/Release/net8.0-windows/win-x64/publish/runtime" `
  -VendorNode `
  -VendorQdrant

pwsh apps/server-windows/scripts/build-installer.ps1 -Version 0.2.0
```

The installer is written to:

```text
apps/server-windows/dist/Prism-Server-Setup-v0.2.0-win-x64.exe
```

## GitHub Release Lane

`.github/workflows/release-server-windows.yml` builds, optionally Authenticode-signs, packages with Inno Setup, and uploads the installer to the existing `server/v<version>` GitHub Release.

Required signing secrets when available:

- `WINDOWS_SIGNING_CERT_BASE64`
- `WINDOWS_SIGNING_CERT_PASSWORD`

If these secrets are absent, the workflow emits an unsigned installer and logs a SmartScreen warning.
