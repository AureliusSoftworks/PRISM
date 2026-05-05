---
title: "apps/api/src/__tests__/health.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/health.test.ts"
status: "active"
---

# apps/api/src/__tests__/health.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/health.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/health.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `node:sqlite`
- `@localai/config`
- `../health.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "@localai/config";
import { buildHealthResponse } from "../health.ts";

const config: AppConfig = {
  apiPort: 18787,
  serverName: "Test Prism",
  sessionCookieName: "localai_session",
  sessionTtlHours: 24,
  encryptionMasterKey: "do-not-leak",
  ollamaHost: "http://localhost:11434",
  ollamaModel: "llama3.2",
  openAiApiKey: "secret-openai-key",
  qdrantUrl: "http://localhost:6333",
};

describe("buildHealthResponse", () => {
  it("includes mobile readiness metadata without leaking secrets", async () => {
    const db = new DatabaseSync(":memory:");
    const health = await buildHealthResponse(db, config, 12.5, {
      skipNetworkChecks: true,
    });

    assert.equal(health.ok, true);
    assert.equal(health.uptime, 12.5);
    assert.equal(health.appName, "Prism Server");
    assert.equal(health.serverVersion, "0.1.0");
    assert.equal(health.apiVersion, 1);
    assert.equal(health.pairingEnabled, true);
    assert.equal(health.serverName, "Test Prism");
    assert.deepEqual(health.services, {
      sqlite: "ready",
      qdrant: "configured",
      ollama: "configured",
      openai: "configured",
    });

    const serialized = JSON.stringify(health);
    assert.equal(serialized.includes("do-not-leak"), false);

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
