import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAppConfig, normalizeComfyUiHost, normalizeQdrantUrl } from "./index.ts";

function withEnv(values: Record<string, string | undefined>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("configuration normalization", () => {
  it("normalizes local service URLs for fetch", () => {
    assert.equal(normalizeQdrantUrl("0.0.0.0:6333/"), "http://127.0.0.1:6333");
    assert.equal(normalizeComfyUiHost("comfy.local:8188/"), "http://comfy.local:8188");
    assert.equal(normalizeComfyUiHost(""), "");
  });

  it("falls back safely for malformed service URLs", () => {
    assert.equal(normalizeQdrantUrl("http://[not-a-host"), "http://127.0.0.1:6333");
    assert.equal(normalizeComfyUiHost("http://[not-a-host"), "");
  });

  it("builds a deterministic local-first config from environment", () => {
    withEnv(
      {
        API_PORT: "19877",
        ENCRYPTION_MASTER_KEY: "test-master-key",
        OLLAMA_HOST: "localhost:11434/",
        QDRANT_URL: "127.0.0.1:6333/",
        PRISM_LAN_ACCESS: "true",
      },
      () => {
        const config = getAppConfig();
        assert.equal(config.apiPort, 19877);
        assert.equal(config.encryptionMasterKey, "test-master-key");
        assert.equal(config.ollamaHost, "http://localhost:11434");
        assert.equal(config.qdrantUrl, "http://127.0.0.1:6333");
        assert.equal(config.lanAccessEnabled, true);
      }
    );
  });

  it("keeps invalid boolean and host environment values on safe defaults", () => {
    withEnv(
      {
        ENCRYPTION_MASTER_KEY: undefined,
        OLLAMA_HOST: "http://[not-a-host",
        QDRANT_URL: "http://[not-a-host",
        COMFYUI_HOST: "http://[not-a-host",
        PRISM_LAN_ACCESS: "maybe",
        PRISM_DISCOVERY_ENABLED: "maybe",
      },
      () => {
        const config = getAppConfig();
        assert.equal(config.encryptionMasterKey, "local-dev-master-key-change-me");
        assert.equal(config.ollamaHost, "http://localhost:11434");
        assert.equal(config.qdrantUrl, "http://127.0.0.1:6333");
        assert.equal(config.comfyUiHost, "");
        assert.equal(config.lanAccessEnabled, false);
        assert.equal(config.discoveryEnabled, true);
      }
    );
  });

  it("never permits a public or credential-bearing Ollama host", () => {
    for (const unsafeHost of [
      "https://ollama.public.example:11434",
      "https://account-canary:secret@192.168.1.20:11434",
      "ftp://127.0.0.1:11434",
    ]) {
      withEnv({ OLLAMA_HOST: unsafeHost }, () => {
        assert.equal(getAppConfig().ollamaHost, "http://localhost:11434");
      });
    }
  });

  it("allows Ollama only on loopback or a private LAN", () => {
    for (const privateHost of [
      "http://127.0.0.1:11434",
      "http://192.168.1.20:11434",
      "https://ollama.local:11434",
      "http://[::1]:11434",
    ]) {
      withEnv({ OLLAMA_HOST: privateHost }, () => {
        assert.equal(getAppConfig().ollamaHost, privateHost);
      });
    }
  });

  it("prefers the canonical Brave Search environment key", () => {
    withEnv(
      {
        BRAVE_SEARCH_API_KEY: "brave-canonical",
        BRAVE_API_KEY: "legacy-value",
      },
      () => {
        assert.equal(getAppConfig().braveSearchApiKey, "brave-canonical");
      }
    );
    withEnv(
      {
        BRAVE_SEARCH_API_KEY: undefined,
        BRAVE_API_KEY: "legacy-value",
      },
      () => {
        assert.equal(getAppConfig().braveSearchApiKey, "legacy-value");
      }
    );
  });

  it("reads the optional server Ollama Cloud bearer credential", () => {
    withEnv({ OLLAMA_API_KEY: "ollama-server-test-key" }, () => {
      assert.equal(getAppConfig().ollamaApiKey, "ollama-server-test-key");
    });
  });
});
