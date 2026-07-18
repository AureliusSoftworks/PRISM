import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signalEpisodeRetryDraft } from "./signalEpisodeRetry.ts";

const episode = {
  guestBotId: "guest-1",
  topic: "When does useful advice become control?",
  producerBrief: "Find the exact decision the guest lost.",
  model: "model-1",
  responseMode: "local" as const,
  durationMinutes: 8 as const,
};

describe("Signal episode retry setup", () => {
  it("restores every retryable setup field when the guest and model still exist", () => {
    assert.deepEqual(
      signalEpisodeRetryDraft({
        episode,
        availableGuestIds: ["guest-1", "guest-2"],
        availableModelIds: ["model-1"],
        currentResponseMode: "local",
      }),
      {
        guestId: "guest-1",
        topic: episode.topic,
        producerBrief: episode.producerBrief,
        modelId: "model-1",
        durationMinutes: 8,
        guestAvailable: true,
        modelUnavailable: false,
        modeChanged: false,
      },
    );
  });

  it("keeps current AUTO routing while restoring the episode prompt and duration", () => {
    const retry = signalEpisodeRetryDraft({
      episode,
      availableGuestIds: ["guest-1"],
      availableModelIds: ["model-1"],
      currentResponseMode: "auto",
    });

    assert.equal(retry.guestId, "guest-1");
    assert.equal(retry.topic, episode.topic);
    assert.equal(retry.producerBrief, episode.producerBrief);
    assert.equal(retry.durationMinutes, 8);
    assert.equal(retry.modelId, "");
    assert.equal(retry.modelUnavailable, false);
    assert.equal(retry.modeChanged, true);
  });

  it("clears unavailable identities instead of silently retrying with different ones", () => {
    const retry = signalEpisodeRetryDraft({
      episode,
      availableGuestIds: ["guest-2"],
      availableModelIds: ["model-2"],
      currentResponseMode: "local",
    });

    assert.equal(retry.guestId, "");
    assert.equal(retry.modelId, "");
    assert.equal(retry.guestAvailable, false);
    assert.equal(retry.modelUnavailable, true);
  });
});
