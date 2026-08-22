import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { liveAvatarShouldShowThinking } from "./liveAvatarWorkPresentation.ts";

describe("live avatar work presentation", () => {
  it("shows thinking for model generation and voice synthesis", () => {
    assert.equal(
      liveAvatarShouldShowThinking({
        generating: true,
        synthesizing: false,
        speaking: false,
        playbackRecording: false,
      }),
      true,
    );
    assert.equal(
      liveAvatarShouldShowThinking({
        generating: false,
        synthesizing: true,
        speaking: false,
        playbackRecording: false,
      }),
      true,
    );
  });

  it("hands the face to speech and never invents work during playback", () => {
    assert.equal(
      liveAvatarShouldShowThinking({
        generating: true,
        synthesizing: true,
        speaking: true,
        playbackRecording: false,
      }),
      false,
    );
    assert.equal(
      liveAvatarShouldShowThinking({
        generating: true,
        synthesizing: true,
        speaking: false,
        playbackRecording: true,
      }),
      false,
    );
  });
});
