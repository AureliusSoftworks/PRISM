import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  requestVoicePreviewWithBackendRecovery,
  voicePreviewResponseNeedsBackendRecovery,
} from "./voicePreviewBackendRecovery.ts";

function backendUnavailableResponse(): Response {
  return Response.json(
    {
      ok: false,
      code: "backend_unavailable",
      error: "Prism is waiting for its local API.",
      retryable: true,
    },
    { status: 503 },
  );
}

describe("voice preview backend recovery", () => {
  it("recognizes only the structured retryable backend outage", async () => {
    assert.equal(
      await voicePreviewResponseNeedsBackendRecovery(
        backendUnavailableResponse(),
      ),
      true,
    );
    assert.equal(
      await voicePreviewResponseNeedsBackendRecovery(
        Response.json(
          { error: "ElevenLabs rejected the voice." },
          { status: 502 },
        ),
      ),
      false,
    );
  });

  it("retries once after the shared backend recovery succeeds", async () => {
    let requests = 0;
    let recoveries = 0;
    const response = await requestVoicePreviewWithBackendRecovery({
      request: async () => {
        requests += 1;
        return requests === 1
          ? backendUnavailableResponse()
          : new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      },
      recoverBackend: async () => {
        recoveries += 1;
      },
    });

    assert.equal(response.status, 200);
    assert.equal(requests, 2);
    assert.equal(recoveries, 1);
  });

  it("returns the original readable outage when recovery is not ready", async () => {
    let requests = 0;
    const response = await requestVoicePreviewWithBackendRecovery({
      request: async () => {
        requests += 1;
        return backendUnavailableResponse();
      },
      recoverBackend: async () => {
        throw new Error("still starting");
      },
    });

    assert.equal(response.status, 503);
    assert.equal(requests, 1);
    assert.equal(
      ((await response.json()) as { code?: string }).code,
      "backend_unavailable",
    );
  });
});
