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
  debateVoiceCompletionFallbackDurationMs,
  signalLiveCaptionText,
  signalSilentCaptionRevealDurationMs,
  signalVoiceCompletionFallbackDurationMs,
} from "./signalLiveCaptions.ts";

describe("Signal delayed live captions", () => {
  it("paces an Abe-sized silent fallback like readable speech", () => {
    const text =
      "That is my plain answer: equal citizenship is not a reward for obedience, but a right belonging to persons under the law. I arrived at it late, yet I mean it without qualification.";

    assert.equal(signalSilentCaptionRevealDurationMs(text), 13_200);
    assert.equal(
      signalSilentCaptionRevealDurationMs("A very short line."),
      2_000,
    );
    assert.equal(
      signalSilentCaptionRevealDurationMs("word ".repeat(100)),
      20_000,
    );
  });

  it("floors English completion watchdogs with spoken word pace", () => {
    const text =
      "This is The Unspent Hello, and I'm Forgetful Freddie—pleased to find myself here. My guest is Jared, and Jared, you have the peculiar advantage of knowing exactly where this conversation begins. When a stranger offers you a fresh introduction, what makes it feel like recognition instead of performance?";
    const wordCount = text.trim().split(/\s+/u).length;
    const fallback = signalVoiceCompletionFallbackDurationMs(text);
    assert.ok(fallback >= wordCount * 400);
    assert.ok(fallback > text.length * 34);
    assert.equal(signalVoiceCompletionFallbackDurationMs(""), 1_200);
    assert.equal(
      debateVoiceCompletionFallbackDurationMs(text),
      signalVoiceCompletionFallbackDurationMs(text),
    );
  });

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

  it("shows provenance-marked social silence but hides Power silence", () => {
    const reveal = updateBotcastSpeechReveal(
      startBotcastSpeechReveal({ text: "...", durationMs: 900 }),
      SIGNAL_LIVE_CAPTION_DELAY_MS,
    );
    assert.equal(
      signalLiveCaptionText(reveal, {
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
      }),
      "...",
    );
    assert.equal(signalLiveCaptionText(reveal, { content: "..." }), "");
  });
});
