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
