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
    apiPort: 8787,
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
    assert.equal(descriptor.options.port, 8787);
    assert.deepEqual(descriptor.options.txt, buildDiscoveryTxt());
  });
});

describe("startPrismDiscovery", () => {
  it("does not advertise when discovery is disabled", () => {
    let advertised = false;

    const stop = startPrismDiscovery(
      createConfig({ discoveryEnabled: false }),
      () => {
        advertised = true;
        return async () => {};
      }
    );

    assert.equal(stop, null);
    assert.equal(advertised, false);
  });

  it("passes the descriptor to the advertiser and returns its stop function", async () => {
    let advertisedName: string | null = null;
    let stopped = false;

    const stop = startPrismDiscovery(createConfig(), (options) => {
      advertisedName = options.name;
      return async () => {
        stopped = true;
      };
    });

    assert.equal(advertisedName, "Test Prism");
    assert.ok(stop);
    await stop();
    assert.equal(stopped, true);
  });
});
