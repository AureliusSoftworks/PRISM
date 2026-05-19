import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "@localai/config";
import { PRISM_API_VERSION, PRISM_SERVER_VERSION, buildHealthResponse } from "../health.ts";

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
    assert.equal(health.serverVersion, PRISM_SERVER_VERSION);
    assert.equal(health.apiVersion, PRISM_API_VERSION);
    assert.equal(health.pairingEnabled, false);
    assert.equal(health.serverName, "Test Prism");
    assert.deepEqual(health.services, {
      sqlite: "ready",
      qdrant: "configured",
      ollama: "configured",
      openai: "configured",
    });

    const serialized = JSON.stringify(health);
    assert.equal(serialized.includes("do-not-leak"), false);
    assert.equal(serialized.includes("secret-openai-key"), false);
  });
});
