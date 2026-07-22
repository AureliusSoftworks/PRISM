import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismBackendUnavailableError } from "./backendUnavailable.ts";
import { requestBabbleWithProceduralFallback } from "./babbleVoiceRecovery.ts";

describe("Babble voice recovery", () => {
  it("hands backend outages to procedural Bottish instead of going silent", async () => {
    const clip = await requestBabbleWithProceduralFallback({
      request: async () => {
        throw new PrismBackendUnavailableError(
          "Prism is waiting for its local API.",
        );
      },
    });

    assert.equal(clip, null);
  });

  it("recovers from a disconnected transport but preserves ordinary voice errors", async () => {
    const disconnected = new TypeError("Failed to fetch");
    assert.equal(
      await requestBabbleWithProceduralFallback({
        request: async () => {
          throw disconnected;
        },
        isTransportFailure: (error) => error === disconnected,
      }),
      null,
    );

    await assert.rejects(
      requestBabbleWithProceduralFallback({
        request: async () => {
          throw new Error("Voice profile is invalid.");
        },
      }),
      /Voice profile is invalid/,
    );
  });

  it("honors callers that require real Babble with no procedural fallback", async () => {
    await assert.rejects(
      requestBabbleWithProceduralFallback({
        request: async () => {
          throw new PrismBackendUnavailableError("Backend unavailable");
        },
        allowFallback: false,
      }),
      /Backend unavailable/,
    );
  });
});
