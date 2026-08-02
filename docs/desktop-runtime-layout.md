# Prism Desktop Runtime Layout

The shared staging script for desktop packaging is:

```bash
node scripts/stage-desktop-runtime.mjs --output-dir runtime --distribution steam
```

Steam-safe staging is the default for `npm run desktop:stage-runtime` and all
desktop packaging commands. It copies only Marketplace bots named in
`steam-marketplace-allowlist.json`, writes `STEAM_CONTENT_REPORT.md`, and fails
if a public bot is not explicitly approved or any extra `.bot` bundle reaches
the staged public directory.

Local desktop development keeps the full branch-locked Marketplace shelf:

```bash
npm run desktop:stage-runtime:dev
```

The bare `prism` launcher and `npm run desktop:build:mac-app` use this
development staging path. Installer and Steam packaging commands continue to
use the fail-closed Steam path.

The allowlist is a packaging enforcement boundary, not a substitute for the
shipping asset-rights ledger or legal review.

It stages:

- API runtime (`apps/api/dist/server.js`)
- Next standalone web runtime (`apps/web/.next/standalone/apps/web/server.js`)
- workspace runtime packages (`@localai/config`, `@localai/shared`) plus the API production dependency closure from `package-lock.json`
- platform Qdrant binary (`qdrant/qdrant` on macOS/Linux, `qdrant/qdrant.exe` on Windows)
- `runtime-layout.json` manifest with default ports and OS data/log paths
- Steam-only Marketplace allowlist and human-readable content report for
  release staging

## Runtime Defaults

- API port: `18787`
- Web port: `18788`

## Data and Logs (default conventions)

- macOS
  - Data: `~/Library/Application Support/Prism`
  - Logs: `~/Library/Logs/Prism`
- Windows
  - Data: `%LOCALAPPDATA%\Prism`
  - Logs: `%LOCALAPPDATA%\Prism\Logs`
- Linux
  - Data: `~/.local/share/prism`
  - Logs: `~/.local/state/prism/logs`
