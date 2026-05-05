---
title: "apps/api/src/health.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/health.ts"
status: "active"
---

# apps/api/src/health.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/__tests__/health.test.ts]]
- [[02-apps/api/src/discovery.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/health.ts`

## Import references
- `node:sqlite`
- `@localai/config`

## Source preview
```text
import type { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "@localai/config";

export const PRISM_API_VERSION = 1;
export const PRISM_SERVER_VERSION = "0.1.0";

export type ServiceState = "ready" | "configured" | "not_configured" | "error";

export interface HealthResponse extends Record<string, unknown> {
  ok: boolean;
  uptime: number;
  appName: "Prism Server";
  serverVersion: string;
  apiVersion: number;
  pairingEnabled: boolean;
  serverName: string;
  services: {
    sqlite: ServiceState;
    qdrant: ServiceState;
    ollama: ServiceState;
    openai: ServiceState;
  };
}

export type BuildHealthOptions = {
  /**
   * When true, skip HTTP probes (used in unit tests). Otherwise `/readyz` and Ollama tags are probed to match the Mac app.
   */
  skipNetworkChecks?: boolean;
};

function checkSqlite(db: DatabaseSync): ServiceState {
  try {
    db.prepare("SELECT 1").get();
    return "ready";
  } catch {
    return "error";
  }
}

async function checkUrlOk(url: URL, timeoutMs = 2000): Promise<"ready" | "error"> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? "ready" : "error";
  } catch {
    clearTimeout(timer);
    return "error";
  }
}

/**
 *

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
