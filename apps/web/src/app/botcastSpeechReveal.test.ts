import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botcastSpeechRevealIsVoicing,
  botcastSpeechRevealVisibleText,
  finishBotcastSpeechReveal,
  prepareBotcastSpeechReveal,
  startBotcastSpeechReveal,
  updateBotcastSpeechReveal,
} from "./botcastSpeechReveal.ts";

describe("Signal transcript speech reveal", () => {
  it("reveals nothing while synthesized audio prepares", () => {
    const state = prepareBotcastSpeechReveal("Already generated, not yet spoken.");
    assert.equal(state.phase, "preparing");
    assert.equal(state.progress, 0);
    assert.equal(botcastSpeechRevealVisibleText(state), "");
  });

  it("uses character end marks so words appear only after they finish", () => {
    const text = "Hi there";
    const characters = Array.from(text);
    const state = startBotcastSpeechReveal({
      text,
      durationMs: 1_000,
      alignment: {
        characters,
        characterStartTimesSeconds: [0, 0.1, 0.2, 0.25, 0.5, 0.6, 0.7, 0.8],
        characterEndTimesSeconds: [0.1, 0.2, 0.25, 0.3, 0.6, 0.7, 0.8, 0.9],
      },
    });

    assert.equal(state.tokens[0]?.completionAtMs, 200);
    assert.equal(state.tokens[1]?.completionAtMs, 900);
    assert.deepEqual(state.alignment?.characters, characters);
    assert.equal(botcastSpeechRevealVisibleText(state), "");
    assert.equal(botcastSpeechRevealVisibleText(updateBotcastSpeechReveal(state, 199)), "");
    assert.equal(botcastSpeechRevealVisibleText(updateBotcastSpeechReveal(state, 200)), "Hi ");
    assert.equal(botcastSpeechRevealVisibleText(updateBotcastSpeechReveal(state, 899)), "Hi ");
    assert.equal(botcastSpeechRevealVisibleText(updateBotcastSpeechReveal(state, 900)), text);
  });

  it("rests the avatar through provider-timed phrase pauses", () => {
    const text = "Hi. There";
    const state = startBotcastSpeechReveal({
      text,
      durationMs: 1_000,
      alignment: {
        characters: Array.from(text),
        characterStartTimesSeconds: [0, 0.08, 0.16, 0.35, 0.58, 0.66, 0.74, 0.82, 0.9],
        characterEndTimesSeconds: [0.08, 0.16, 0.35, 0.58, 0.66, 0.74, 0.82, 0.9, 1],
      },
    });

    assert.equal(botcastSpeechRevealIsVoicing(updateBotcastSpeechReveal(state, 100)), true);
    assert.equal(botcastSpeechRevealIsVoicing(updateBotcastSpeechReveal(state, 400)), false);
    assert.equal(botcastSpeechRevealIsVoicing(updateBotcastSpeechReveal(state, 620)), true);
  });

  it("falls back to weighted cumulative completion times for invalid alignment", () => {
    const state = startBotcastSpeechReveal({
      text: "A considerably-longer word.",
      durationMs: 1_200,
      alignment: {
        characters: ["m", "i", "s", "m", "a", "t", "c", "h"],
        characterStartTimesSeconds: [0, 0.1],
        characterEndTimesSeconds: [0.1, 0.2],
      },
    });

    assert.equal(state.tokens.length, 3);
    assert.equal(state.alignment, null);
    assert.equal((state.tokens[0]?.completionAtMs ?? 0) > 0, true);
    assert.equal(
      (state.tokens[1]?.completionAtMs ?? 0) > (state.tokens[0]?.completionAtMs ?? 0),
      true
    );
    assert.equal(state.tokens[2]?.completionAtMs, 1_200);
    assert.equal(botcastSpeechRevealVisibleText(state), "");
  });

  it("retains valid spoken alignment when the visible transcript has formatting", () => {
    const state = startBotcastSpeechReveal({
      text: "*Hi*",
      durationMs: 400,
      alignment: {
        characters: ["H", "i"],
        characterStartTimesSeconds: [0, 0.2],
        characterEndTimesSeconds: [0.2, 0.4],
      },
    });

    assert.equal(state.alignment?.characters.join(""), "Hi");
    assert.equal(state.tokens.at(-1)?.completionAtMs, 400);
  });

  it("updates progress from the audio clock and finishes to the exact text", () => {
    const text = "One two.";
    const state = startBotcastSpeechReveal({ text, durationMs: 800 });
    const halfway = updateBotcastSpeechReveal(state, 400);
    assert.equal(halfway.elapsedMs, 400);
    assert.equal(halfway.progress, 0.5);
    const finished = finishBotcastSpeechReveal(halfway);
    assert.equal(finished.phase, "ended");
    assert.equal(finished.progress, 1);
    assert.equal(botcastSpeechRevealVisibleText(finished), text);
  });

  it("preserves Unicode and irregular whitespace in every visible prefix", () => {
    const text = "  Héllo 👋🏽\n世界!  ";
    const characters = Array.from(text);
    const starts = characters.map((_, index) => index * 0.05);
    const ends = characters.map((_, index) => (index + 1) * 0.05);
    const state = startBotcastSpeechReveal({
      text,
      durationMs: ends.at(-1)! * 1_000,
      alignment: {
        characters,
        characterStartTimesSeconds: starts,
        characterEndTimesSeconds: ends,
      },
    });

    const firstCompletion = state.tokens[0]?.completionAtMs ?? 0;
    assert.equal(botcastSpeechRevealVisibleText(updateBotcastSpeechReveal(state, 0)), "");
    assert.equal(
      botcastSpeechRevealVisibleText(updateBotcastSpeechReveal(state, firstCompletion)),
      "  Héllo "
    );
    assert.equal(botcastSpeechRevealVisibleText(finishBotcastSpeechReveal(state)), text);
  });

  it("holds whitespace-only text until the playback finishes", () => {
    const text = " \n\t ";
    const state = startBotcastSpeechReveal({ text, durationMs: 250 });
    assert.equal(botcastSpeechRevealVisibleText(updateBotcastSpeechReveal(state, 250)), "");
    assert.equal(botcastSpeechRevealVisibleText(finishBotcastSpeechReveal(state)), text);
  });
});
