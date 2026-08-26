import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signalEpisodeImageIsVisible,
  signalEpisodeImageScale,
  signalPendingEpisodeImageCueIsAwaitingHostTurn,
  signalQueuedProducerCueIsServerOwned,
} from "./signalEpisodeImagePresentation.ts";

describe("Signal episode image presentation", () => {
  it("keeps a pre-show image cue queued across the guest turn before its host introduction", () => {
    const pendingCue = { kind: "present_image", imageId: "image-1" } as const;
    const pendingImage = { episodeId: "episode-1", imageId: "image-1" };

    assert.equal(
      signalPendingEpisodeImageCueIsAwaitingHostTurn({
        episodeId: "episode-1",
        pendingCue,
        pendingImage,
        imageContext: null,
      }),
      true,
    );
    assert.equal(
      signalPendingEpisodeImageCueIsAwaitingHostTurn({
        episodeId: "episode-1",
        pendingCue,
        pendingImage,
        imageContext: { imageId: "image-1" },
      }),
      false,
    );
  });

  it("does not carry a pending image cue into another episode", () => {
    assert.equal(
      signalPendingEpisodeImageCueIsAwaitingHostTurn({
        episodeId: "episode-2",
        pendingCue: { kind: "present_image", imageId: "image-1" },
        pendingImage: { episodeId: "episode-1", imageId: "image-1" },
        imageContext: null,
      }),
      false,
    );
  });

  it("sends queued image cues with their bytes while restoring ordinary cues from the server", () => {
    const imageCue = { kind: "present_image", imageId: "image-1" } as const;
    const hostCue = { kind: "refocus" } as const;

    assert.equal(
      signalQueuedProducerCueIsServerOwned({
        requestedCue: imageCue,
        queuedCue: imageCue,
      }),
      false,
    );
    assert.equal(
      signalQueuedProducerCueIsServerOwned({
        requestedCue: hostCue,
        queuedCue: hostCue,
      }),
      true,
    );
  });

  it("selects show-camera Item size for cutouts and Photo size for pictures", () => {
    const placement = { x: 50, y: 75, itemScale: 60, photoScale: 105 };
    assert.equal(signalEpisodeImageScale(placement, "item"), 60);
    assert.equal(signalEpisodeImageScale(placement, "picture"), 105);
  });

  it("shows message-linked image context during faithful replay without live speech state", () => {
    assert.equal(
      signalEpisodeImageIsVisible({
        hasImageContext: true,
        replay: true,
        activeMessageId: "guest-discussion",
        speakingMessageId: null,
      }),
      true,
    );
  });

  it("preserves live presentation gating until the linked message is speaking", () => {
    const base = {
      hasImageContext: true,
      replay: false,
      activeMessageId: "host-introduction",
    } as const;

    assert.equal(
      signalEpisodeImageIsVisible({ ...base, speakingMessageId: null }),
      false,
    );
    assert.equal(
      signalEpisodeImageIsVisible({
        ...base,
        speakingMessageId: "host-introduction",
      }),
      true,
    );
    assert.equal(
      signalEpisodeImageIsVisible({ ...base, speakingMessageId: "other" }),
      false,
    );
  });

  it("never presents an image without resolved lifecycle context", () => {
    assert.equal(
      signalEpisodeImageIsVisible({
        hasImageContext: false,
        replay: true,
        activeMessageId: "host-follow-up",
        speakingMessageId: null,
      }),
      false,
    );
  });
});
