import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "@localai/config";
import {
  buildLanUrls,
  canEditNetworkAccess,
  isLoopbackAddress,
  lanAccessManagedByEnv,
  listLanIpv4Addresses,
  readPersistedLanAccess,
  resolveApiBindHost,
  resolveLanAccessEnabled,
  resolveWebPublicPort,
  writePersistedLanAccess,
} from "../network-config.ts";

function withEnv(
  overrides: Record<string, string | undefined>,
  run: () => void
): void {
  const keys = Object.keys(overrides);
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    run();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    apiPort: 18787,
    serverName: "Test Prism",
    lanAccessEnabled: false,
    discoveryEnabled: true,
    sessionCookieName: "localai_session",
    sessionTtlHours: 24,
    encryptionMasterKey: "test-secret",
    ollamaHost: "http://localhost:11434",
    ollamaModel: "llama3.2",
    ollamaInAppPullModel: "flux2-klein",
    ollamaAuxiliaryModel: "llama3.2",
    ollamaEmbeddingModel: "nomic-embed-text",
    qdrantUrl: "http://127.0.0.1:6333",
    comfyUiHost: "",
    ...overrides,
  };
}

describe("resolveApiBindHost", () => {
  it("binds loopback when LAN access is off", () => {
    withEnv({ API_HOST: undefined }, () => {
      assert.equal(resolveApiBindHost(false), "127.0.0.1");
    });
  });

  it("binds all interfaces when LAN access is on", () => {
    withEnv({ API_HOST: undefined }, () => {
      assert.equal(resolveApiBindHost(true), "0.0.0.0");
    });
  });

  it("honors an explicit API_HOST override", () => {
    withEnv({ API_HOST: "127.0.0.1" }, () => {
      assert.equal(resolveApiBindHost(true), "127.0.0.1");
    });
  });
});

describe("resolveLanAccessEnabled", () => {
  it("defaults to private when nothing is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-net-"));
    withEnv(
      { PRISM_LAN_ACCESS: undefined, DB_PATH: undefined, LOCALAI_DATA_DIR: dir },
      () => {
        assert.equal(resolveLanAccessEnabled(baseConfig()), false);
      }
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("lets explicit env win over the persisted file", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-net-"));
    withEnv(
      { PRISM_LAN_ACCESS: undefined, DB_PATH: undefined, LOCALAI_DATA_DIR: dir },
      () => {
        writePersistedLanAccess(true);
        assert.equal(readPersistedLanAccess(), true);
      }
    );
    withEnv(
      { PRISM_LAN_ACCESS: "off", DB_PATH: undefined, LOCALAI_DATA_DIR: dir },
      () => {
        assert.equal(lanAccessManagedByEnv(), true);
        // env explicit + config says false -> private despite the file saying true
        assert.equal(
          resolveLanAccessEnabled(baseConfig({ lanAccessEnabled: false })),
          false
        );
      }
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to the persisted file when env is unset", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-net-"));
    withEnv(
      { PRISM_LAN_ACCESS: undefined, DB_PATH: undefined, LOCALAI_DATA_DIR: dir },
      () => {
        writePersistedLanAccess(true);
        assert.equal(lanAccessManagedByEnv(), false);
        assert.equal(resolveLanAccessEnabled(baseConfig()), true);
      }
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("canEditNetworkAccess (host-only guard)", () => {
  it("rejects non-loopback peers", () => {
    assert.equal(
      canEditNetworkAccess({
        peerAddress: "192.168.1.50",
        webOrigin: undefined,
        managedByEnv: false,
      }),
      false
    );
  });

  it("ignores spoofed locality headers from a non-loopback peer", () => {
    // A LAN client connecting directly and claiming to be the local web proxy.
    assert.equal(
      canEditNetworkAccess({
        peerAddress: "192.168.1.50",
        webOrigin: "loopback",
        managedByEnv: false,
      }),
      false
    );
  });

  it("rejects requests laundered through a LAN-exposed web proxy", () => {
    assert.equal(
      canEditNetworkAccess({
        peerAddress: "127.0.0.1",
        webOrigin: "lan",
        managedByEnv: false,
      }),
      false
    );
  });

  it("allows a direct loopback host request", () => {
    assert.equal(
      canEditNetworkAccess({
        peerAddress: "127.0.0.1",
        webOrigin: undefined,
        managedByEnv: false,
      }),
      true
    );
  });

  it("allows a host request through a private (loopback) web proxy", () => {
    assert.equal(
      canEditNetworkAccess({
        peerAddress: "::ffff:127.0.0.1",
        webOrigin: "loopback",
        managedByEnv: false,
      }),
      true
    );
  });

  it("is read-only when LAN access is managed by the environment", () => {
    assert.equal(
      canEditNetworkAccess({
        peerAddress: "127.0.0.1",
        webOrigin: undefined,
        managedByEnv: true,
      }),
      false
    );
  });
});

describe("isLoopbackAddress", () => {
  it("recognizes IPv4 and IPv6 loopback forms", () => {
    assert.equal(isLoopbackAddress("127.0.0.1"), true);
    assert.equal(isLoopbackAddress("::1"), true);
    assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
    assert.equal(isLoopbackAddress("192.168.1.10"), false);
    assert.equal(isLoopbackAddress(undefined), false);
  });
});

describe("buildLanUrls / address + port helpers", () => {
  it("builds web and api URLs for each address", () => {
    assert.deepEqual(buildLanUrls(["192.168.1.20"], 18788, 18787), {
      web: ["http://192.168.1.20:18788"],
      api: ["http://192.168.1.20:18787"],
    });
  });

  it("returns only valid IPv4 strings for the host", () => {
    for (const address of listLanIpv4Addresses()) {
      assert.match(address, /^\d{1,3}(\.\d{1,3}){3}$/);
    }
  });

  it("defaults the web port to 18788", () => {
    withEnv({ PRISM_WEB_PORT: undefined, WEB_PORT: undefined }, () => {
      assert.equal(resolveWebPublicPort(), 18788);
    });
  });
});
