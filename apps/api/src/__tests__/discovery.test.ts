import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcess, spawn } from "node:child_process";
import type { AppConfig } from "@localai/config";
import {
  buildDiscoveryServiceDescriptor,
  buildDiscoveryTxt,
  startPrismDiscovery,
} from "../discovery.ts";
import { PRISM_API_VERSION, PRISM_SERVER_VERSION } from "../health.ts";

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    apiPort: 18787,
    serverName: "Test Prism",
    lanAccessEnabled: true,
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
      api: String(PRISM_API_VERSION),
      version: PRISM_SERVER_VERSION,
      pairing: "disabled",
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

  it("does not advertise in local-only mode (LAN access off)", () => {
    let advertised = false;

    const stop = startPrismDiscovery(
      createConfig({ lanAccessEnabled: false }),
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

  it("uses macOS native DNS-SD in Desktop instead of processing multicast on the API event loop", async () => {
    let jsAdvertised = false;
    let command = "";
    let parameters: readonly string[] = [];
    const child = new EventEmitter() as ChildProcess;
    Object.defineProperty(child, "exitCode", {
      configurable: true,
      get: () => null,
    });
    child.kill = (() => {
      queueMicrotask(() => child.emit("exit", 0, "SIGTERM"));
      return true;
    }) as ChildProcess["kill"];
    const spawnNative = ((nextCommand: string, nextParameters: readonly string[]) => {
      command = nextCommand;
      parameters = nextParameters;
      return child;
    }) as typeof spawn;

    const stop = startPrismDiscovery(
      createConfig(),
      () => {
        jsAdvertised = true;
        return async () => {};
      },
      {
        platform: "darwin",
        desktopMode: true,
        nativeDnsSdAvailable: true,
        spawnNative,
      },
    );

    assert.equal(jsAdvertised, false);
    assert.equal(command, "/usr/bin/dns-sd");
    assert.deepEqual(parameters.slice(0, 5), [
      "-R",
      "Test Prism",
      "_prism._tcp",
      "local.",
      "18787",
    ]);
    assert.ok(parameters.includes(`api=${PRISM_API_VERSION}`));
    assert.ok(parameters.includes(`version=${PRISM_SERVER_VERSION}`));
    assert.ok(stop);
    await stop();
  });
});
