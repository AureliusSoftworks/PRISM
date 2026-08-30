import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { signalReplayCaptionText } from "./signalLiveCaptions.ts";

describe("Signal replay captions", () => {
  it("reconstructs the heard transcript from the replay media clock", () => {
    const text = "The archived broadcast has visible captions again.";
    const message = { content: text };

    const midway = signalReplayCaptionText({
      text,
      message,
      elapsedMs: 2_000,
      durationMs: 4_000,
      playing: true,
    });
    assert.ok(midway.length > 0);
    assert.ok(midway.length < text.length);
    assert.equal(text.startsWith(midway), true);
    assert.equal(
      signalReplayCaptionText({
        text,
        message,
        elapsedMs: 4_000,
        durationMs: 4_000,
        playing: true,
      }),
      text,
    );
    assert.equal(
      signalReplayCaptionText({
        text,
        message,
        elapsedMs: 2_000,
        durationMs: 4_000,
        playing: false,
      }),
      "",
    );
  });

  it("keeps replay captions on the public silence and timed-Mute projection", () => {
    assert.equal(
      signalReplayCaptionText({
        text: "...",
        message: {
          content: "...",
          socialSilence: {
            v: 1,
            name: "socialSilence",
            provenance: "social",
            mode: "signal",
            seed: "signal-social-silence:episode-1:guest-1:2",
            volleyTurn: 1,
            holdMs: 900,
          },
        },
        elapsedMs: 450,
        durationMs: 900,
        playing: true,
      }),
      "...",
    );

    const muteMessage = {
      content: ".............. *14 seconds pass without an audible word.*",
      mutePerformance: {
        v: 1 as const,
        name: "mutePerformance" as const,
        durationMs: 14_000,
        periodCount: 14,
        interrupted: false,
        elapsedCue: "*14 seconds pass without an audible word.*",
        reactionBeats: [],
      },
    };
    assert.equal(
      signalReplayCaptionText({
        text: muteMessage.content,
        message: muteMessage,
        elapsedMs: 1_999,
        durationMs: 14_000,
        playing: true,
      }),
      "..",
    );
  });

  it("wires recorded beat text and the captured presentation clock into the replay stage", () => {
    const source = readFileSync(
      new URL("./BotcastExperience.tsx", import.meta.url),
      "utf8",
    );

    assert.match(
      source,
      /args\.replay[\s\S]{0,500}signalReplayCaptionText\(\{[\s\S]{0,240}replayFaithfulBeat\?\.text[\s\S]{0,240}signalVoicePerformanceTranscriptText\(args\.activeMessage\)[\s\S]{0,240}replayCapturedPresentationElapsedMs - replayMessageStartMs/u,
    );
  });
});
