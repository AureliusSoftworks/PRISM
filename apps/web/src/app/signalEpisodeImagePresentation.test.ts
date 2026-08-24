import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signalEpisodeImageIsVisible,
  signalEpisodeImageScale,
} from "./signalEpisodeImagePresentation.ts";

describe("Signal episode image presentation", () => {
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
