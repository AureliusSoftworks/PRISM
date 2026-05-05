---
title: "apps/api/src/__tests__/discovery.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/discovery.test.ts"
status: "active"
---

# apps/api/src/__tests__/discovery.test.ts

## AI Summary
<!-- kb:summary:start -->
This note is crucial in PRISM because it ensures that the discovery service correctly advertises itself on the API port, allowing clients to find and connect to the server. This validation helps ensure that the discovery feature functions as intended, enabling seamless communication between clients and servers in the system.
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/discovery.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/discovery.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `@localai/config`
- `../discovery.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AppConfig } from "@localai/config";
import {
  buildDiscoveryServiceDescriptor,
  buildDiscoveryTxt,
  startPrismDiscovery,
} from "../discovery.ts";

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    apiPort: 18787,
    serverName: "Test Prism",
    discoveryEnabled: true,
    sessionCookieName: "localai_session",
    sessionTtlHours: 24,
    encryptionMasterKey: "test-secret",
    ollamaHost: "http://localhost:11434",
    ollamaModel: "llama3.2",
    openAiApiKey: undefined,
    qdrantUrl: "http://localhost:6333",
    ...overrides,
  };
}

describe("buildDiscoveryTxt", () => {
  it("matches the mobile discovery contract", () => {
    assert.deepEqual(buildDiscoveryTxt(), {
      api: "1",
      version: "0.1.0",
      pairing: "required",
      tls: "optional",
    });
  });
});

describe("buildDiscoveryServiceDescriptor", () => {
  it("advertises Prism Server as _prism._tcp on the API port", () => {
    const descriptor = buildDiscoveryServiceDescriptor(createConfig());

    assert.equal(descriptor.serviceType, "_prism._tcp");
    assert.equal(descriptor.options.name, "Test Prism");
    assert.equal(descriptor.options.type, "prism");
    assert.equal(descriptor.options.protocol, "tcp");
    assert.equal(descriptor.options.port, 18787);
    asse

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
