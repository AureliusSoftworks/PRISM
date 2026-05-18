# Prism Desktop Runtime Layout

The shared staging script for desktop packaging is:

```bash
node scripts/stage-desktop-runtime.mjs --output-dir runtime
```

It stages:

- API runtime (`apps/api/dist/server.js`)
- Next standalone web runtime (`apps/web/.next/standalone/apps/web/server.js`)
- workspace runtime dependencies (`@localai/config`, `@localai/shared`, `dnssd-advertise`)
- platform Qdrant binary (`qdrant/qdrant` on macOS/Linux, `qdrant/qdrant.exe` on Windows)
- `runtime-layout.json` manifest with default ports and OS data/log paths

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
