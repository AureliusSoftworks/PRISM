import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  finishBotcastSpeechReveal,
  prepareBotcastSpeechReveal,
  startBotcastSpeechReveal,
  updateBotcastSpeechReveal,
} from "./botcastSpeechReveal.ts";
import {
  SIGNAL_LIVE_CAPTION_DELAY_MS,
  signalLiveCaptionText,
} from "./signalLiveCaptions.ts";

describe("Signal delayed live captions", () => {
  it("starts with only the words spoken by the end of the initial delay", () => {
    const text = "One two.";
    const reveal = startBotcastSpeechReveal({
      text,
      durationMs: 1_000,
      alignment: {
        characters: Array.from(text),
        characterStartTimesSeconds: [0, 0.08, 0.16, 0.24, 0.3, 0.55, 0.65, 0.75],
        characterEndTimesSeconds: [0.08, 0.16, 0.24, 0.3, 0.55, 0.65, 0.75, 0.9],
      },
    });

    assert.equal(
      signalLiveCaptionText(
        updateBotcastSpeechReveal(
          reveal,
          SIGNAL_LIVE_CAPTION_DELAY_MS - 1,
        ),
      ),
      "",
    );
    assert.equal(
      signalLiveCaptionText(
        updateBotcastSpeechReveal(
          reveal,
          SIGNAL_LIVE_CAPTION_DELAY_MS,
        ),
      ),
      "One",
    );
  });

  it("streams progressively spoken transcript prefixes instead of the full line", () => {
    const text = "Héllo 👋🏽 world.";
    const reveal = startBotcastSpeechReveal({ text, durationMs: 3_000 });

    const early = signalLiveCaptionText(
      updateBotcastSpeechReveal(reveal, 1_000),
    );
    const later = signalLiveCaptionText(
      updateBotcastSpeechReveal(reveal, 2_000),
    );

    assert.equal(early.length > 0, true);
    assert.equal(early.length < later.length, true);
    assert.equal(later.length < text.length, true);
    assert.equal(text.startsWith(early), true);
    assert.equal(text.startsWith(later), true);
  });

  it("clears before playback, at turn end, and when no line is active", () => {
    const preparing = prepareBotcastSpeechReveal("Not started.");
    const playing = startBotcastSpeechReveal({
      text: "Finished.",
      durationMs: 800,
    });

    assert.equal(signalLiveCaptionText(null), "");
    assert.equal(signalLiveCaptionText(preparing), "");
    assert.equal(
      signalLiveCaptionText(finishBotcastSpeechReveal(playing)),
      "",
    );
  });

  it("hides the live overlay while closed captions are disabled", () => {
    const reveal = updateBotcastSpeechReveal(
      startBotcastSpeechReveal({
        text: "Caption this line.",
        durationMs: 1_000,
      }),
      700,
    );

    assert.notEqual(signalLiveCaptionText(reveal), "");
    assert.equal(signalLiveCaptionText(reveal, false), "");
  });
});
