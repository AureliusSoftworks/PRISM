import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEBATE_IDENT_AUDIO,
  DEBATE_IDENT_OUTRO_LEAD_MS,
  DEBATE_IDENT_STOP_FADE_MS,
  debateIdentFadeVolume,
} from "./debateIdentAudio.ts";

describe("Debate Living Chamber ident", () => {
  it("ships a matched intro and outro in the Debate audio catalog", () => {
    for (const cue of Object.values(DEBATE_IDENT_AUDIO)) {
      const asset = fileURLToPath(
        new URL(`../../public${cue.url}`, import.meta.url),
      );
      assert.equal(existsSync(asset), true);
      const bytes = readFileSync(asset);
      assert.ok(bytes.byteLength > 80_000);
      assert.equal(bytes.toString("ascii", 0, 3), "ID3");
    }
    assert.equal(DEBATE_IDENT_AUDIO.intro.durationMs, 7_053);
    assert.equal(DEBATE_IDENT_AUDIO.outro.durationMs, 4_545);
  });

  it("leaves a short verdict breath and releases interruptions smoothly", () => {
    assert.equal(DEBATE_IDENT_OUTRO_LEAD_MS, 420);
    assert.equal(DEBATE_IDENT_STOP_FADE_MS, 320);
    assert.equal(debateIdentFadeVolume(0.8, 0), 0.8);
    assert.ok(debateIdentFadeVolume(0.8, 0.5) < 0.8);
    assert.ok(debateIdentFadeVolume(0.8, 0.5) > 0);
    assert.ok(debateIdentFadeVolume(0.8, 1) < 1e-10);
  });

  it("routes the ident through PRISM output without the Debate room send", () => {
    const source = readFileSync(
      new URL("./debateIdentAudio.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /routeAudioElementToPrismOutput\(audio\)/u);
    assert.doesNotMatch(source, /RoomAcoustics|roomAcoustics/u);
  });
});
