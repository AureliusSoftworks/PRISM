# Prism Desktop App Build and Packaging

Prism Desktop is the unified desktop distribution target. It embeds the local
runtime and launches the Prism UI in a desktop shell.

## Scaffold Location

- Desktop shell app: `apps/desktop`
- Shared runtime staging: `scripts/stage-desktop-runtime.mjs`

## Local Development

From repo root:

```bash
npm run desktop:dev
```

This stages runtime artifacts into `runtime/` and starts Tauri in dev mode.

## Windows Packaging Requirements

Windows desktop packaging requires:

- Node 22
- Rust toolchain (`rustc`, `cargo`)
- MSVC build tools available on the host
- `qdrant.exe` available from either:
  - `PRISM_QDRANT_WINDOWS_PATH`, or
  - `apps/server-windows/src/Resources/qdrant/qdrant.exe`, or
  - `apps/server-windows/Resources/qdrant.exe`

## Packaging Commands

From repo root:

```bash
bash scripts/package-desktop-macos.sh 0.2.0
bash scripts/package-desktop-linux.sh 0.2.0
pwsh scripts/package-desktop-windows.ps1 -Version 0.2.0
```

Output directory:

```text
dist-desktop/
```

Expected Windows artifact names:

- `Prism-Desktop-Setup-v<version>-win-x64.exe`
- `Prism-Desktop-Setup-v<version>-win-x64.msi` (optional)

Expected Steam depot artifact names:

- `Prism-Desktop-v<version>-steam-macos.zip` (`PRISM.app` at archive root)
- `Prism-Desktop-v<version>-steam-win-x64.zip` (`prism_desktop.exe` at archive root)
- `Prism-Desktop-v<version>-linux-x64.AppImage`

## CI Release Entry

Desktop release automation is:

- `.github/workflows/release-main.yml` (entrypoint)
- `.github/workflows/release-desktop-all.yml` (desktop matrix)

## Optional Signing/Notarization Hooks

The packaging scripts support optional hooks via environment variables:

- `PRISM_DESKTOP_MAC_SIGN_SCRIPT`
- `PRISM_DESKTOP_WINDOWS_SIGN_SCRIPT`
- `PRISM_DESKTOP_LINUX_SIGN_SCRIPT`

Each hook receives:

1. Artifact path
2. Version string

Use these hooks to wire in platform-specific signing/notarization in CI without
hard-coding secrets or cert paths in this repository.
