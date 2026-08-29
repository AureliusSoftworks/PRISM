import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signalEpisodeRetryDraft } from "./signalEpisodeRetry.ts";

const episode = {
  id: "episode-1",
  guestBotId: "guest-1",
  topic: "When does useful advice become control?",
  producerBrief: "Find the exact decision the guest lost.",
  guestBrief: "You already suspect the advice was never neutral.",
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
        guestBrief: episode.guestBrief,
        modelId: "model-1",
        durationMinutes: 8,
        image: null,
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
    assert.equal(retry.guestBrief, episode.guestBrief);
    assert.equal(retry.durationMinutes, 8);
    assert.equal(retry.modelId, "");
    assert.equal(retry.modelUnavailable, false);
    assert.equal(retry.modeChanged, true);
  });

  it("keeps legacy episodes retryable without a guest briefing", () => {
    const retry = signalEpisodeRetryDraft({
      episode: { ...episode, guestBrief: undefined },
      availableGuestIds: ["guest-1"],
      availableModelIds: ["model-1"],
      currentResponseMode: "local",
    });

    assert.equal(retry.guestBrief, "");
  });

  it("keeps Auto in the picker when the frozen routing snapshot used Auto", () => {
    const retry = signalEpisodeRetryDraft({
      episode: {
        ...episode,
        responseMode: "online",
        events: [
          {
            id: "routing-1",
            episodeId: "ep-1",
            sequence: 1,
            kind: "routing",
            payload: {
              v: 1,
              lane: "online",
              modelSelectionKind: "auto",
              candidateAllowlist: [],
              fallbackChain: [],
              policyVersion: 1,
            },
            occurredAt: "2026-08-04T00:00:00.000Z",
          },
        ],
      },
      availableGuestIds: ["guest-1"],
      availableModelIds: ["model-1"],
      currentResponseMode: "online",
    });

    assert.equal(retry.modelId, "");
    assert.equal(retry.modelUnavailable, false);
    assert.equal(retry.modeChanged, false);
  });

  it("restores only the booking-owned archival proxy and its editable title", () => {
    const retry = signalEpisodeRetryDraft({
      episode: {
        ...episode,
        events: [
          {
            id: "image-context-1",
            episodeId: episode.id,
            sequence: 1,
            kind: "image_context",
            payload: {
              v: 1,
              imageId: "image-1",
              kind: "picture",
              name: "The red notebook",
              mimeType: "image/jpeg",
              provider: "local",
              model: "llava",
              replayEmoji: "📕",
              replayProxyId: "proxy-1",
              savedAssetId: null,
              phase: "dismissed",
              hostIntroductionMessageId: null,
              guestDiscussionMessageId: null,
              hostFollowUpMessageId: null,
            },
            occurredAt: "2026-08-29T00:00:00.000Z",
          },
        ],
      },
      availableGuestIds: ["guest-1"],
      availableModelIds: ["model-1"],
      currentResponseMode: "local",
      retryMetadata: {
        image: {
          imageId: "image-1",
          reason: "Introduce it as a private gift.",
        },
      },
    });

    assert.deepEqual(retry.image, {
      sourceEpisodeId: episode.id,
      imageId: "image-1",
      descriptor: {
        kind: "picture",
        name: "The red notebook",
        mimeType: "image/jpeg",
      },
      replayEmoji: "📕",
      reason: "Introduce it as a private gift.",
    });
  });

  it("restores a legacy proxy with an editable blank Reason", () => {
    const retry = signalEpisodeRetryDraft({
      episode: {
        ...episode,
        events: [
          {
            id: "legacy-proxy-context",
            episodeId: episode.id,
            sequence: 1,
            kind: "image_context",
            payload: {
              v: 1,
              imageId: "legacy-proxy-image",
              kind: "picture",
              name: "Legacy photograph",
              mimeType: "image/jpeg",
              provider: "local",
              model: "llava",
              replayEmoji: "🖼️",
              replayProxyId: "legacy-proxy",
              savedAssetId: null,
              phase: "dismissed",
              hostIntroductionMessageId: null,
              guestDiscussionMessageId: null,
              hostFollowUpMessageId: null,
            },
            occurredAt: "2026-08-29T00:00:00.000Z",
          },
        ],
      },
      availableGuestIds: ["guest-1"],
      availableModelIds: ["model-1"],
      currentResponseMode: "local",
      retryMetadata: {
        image: { imageId: "legacy-proxy-image", reason: "" },
      },
    });

    assert.equal(retry.image?.reason, "");
    assert.equal(retry.guestBrief, episode.guestBrief);
    assert.equal(retry.topic, episode.topic);
  });

  it("leaves legacy image records without an archival proxy unchanged", () => {
    const retry = signalEpisodeRetryDraft({
      episode: {
        ...episode,
        events: [
          {
            id: "legacy-image-context-1",
            episodeId: episode.id,
            sequence: 1,
            kind: "image_context",
            payload: {
              v: 1,
              imageId: "legacy-image-1",
              kind: "item",
              name: "Old key",
              mimeType: "image/png",
              provider: "local",
              model: "llava",
              replayEmoji: "🗝️",
              savedAssetId: null,
              phase: "dismissed",
              hostIntroductionMessageId: null,
              guestDiscussionMessageId: null,
              hostFollowUpMessageId: null,
            },
            occurredAt: "2026-08-29T00:00:00.000Z",
          },
        ],
      },
      availableGuestIds: ["guest-1"],
      availableModelIds: ["model-1"],
      currentResponseMode: "local",
    });

    assert.equal(retry.image, null);
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
