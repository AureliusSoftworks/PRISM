# Prism Desktop (Tauri scaffold)

This app is the unified desktop shell scaffold for Prism.

## What it does today

- Starts Prism API runtime (`apps/api/dist/server.js`)
- Starts Prism web runtime (`apps/web/.next/standalone/apps/web/server.js`)
- Starts bundled Qdrant sidecar (`runtime/qdrant/qdrant`) for memory engine
- Waits until web port `18788` is reachable
- Opens a desktop window pointed at `http://127.0.0.1:18788`

## Prerequisites (current scaffold)

From repo root:

```bash
npm run build
```

Then run:

```bash
npm run dev -w apps/desktop
```

You can override runtime root for packaged/manual scenarios:

```bash
PRISM_DESKTOP_RUNTIME_ROOT=/absolute/path/to/runtime-root npm run dev -w apps/desktop
```
