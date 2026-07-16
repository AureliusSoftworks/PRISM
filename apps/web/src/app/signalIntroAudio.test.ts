import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
  SIGNAL_SYNTH_IDENT_DURATION_MS,
  SIGNAL_SYNTH_OUTRO_DURATION_MS,
  buildSignalSynthIdentPlan,
  buildSignalSynthOutroPlan,
  encodeSignalSynthIdentWave,
} from "./signalIntroAudio.ts";

describe("Signal Synth ident", () => {
  it("gives episode playback a short preload lead-in", () => {
    assert.equal(SIGNAL_EPISODE_INTRO_LEAD_IN_MS, 180);
  });

  it("pins commanding and playful recipes to different emotional directions", () => {
    const commanding = buildSignalSynthIdentPlan({
      temperament: "commanding",
      seed: "show-a:host-a",
    });
    const commandingAgain = buildSignalSynthIdentPlan({
      temperament: "commanding",
      seed: "show-a:host-a",
    });
    const playful = buildSignalSynthIdentPlan({
      temperament: "playful",
      seed: "show-a:host-a",
    });
    assert.deepEqual(commanding, commandingAgain);
    assert.notDeepEqual(commanding, playful);
    assert.equal(commanding.durationMs, SIGNAL_SYNTH_IDENT_DURATION_MS);
    assert.equal(commanding.tempoBpm, 92);
    assert.equal(commanding.register, "low");
    assert.equal(commanding.contour, "descending");
    assert.equal(commanding.ending, "hard");
    assert.equal(playful.tempoBpm, 118);
    assert.equal(playful.register, "middle-high");
    assert.equal(playful.contour, "bouncing");
    assert.equal(playful.ending, "lift");
    assert.ok(
      Math.max(...commanding.notes.map((note) => note.midi)) <
        Math.max(...playful.notes.map((note) => note.midi)),
    );
    assert.ok(commanding.notes.some((note) => note.waveform === "soft-square"));
    assert.ok(playful.notes.some((note) => note.lowpassHz === 3_650));
  });

  it("renders an ordinary mono PCM wave without a live AudioContext", () => {
    const bytes = encodeSignalSynthIdentWave(
      buildSignalSynthIdentPlan({
        temperament: "neutral",
        seed: "show-a:host-a",
      }),
      8_000,
    );
    const view = new DataView(bytes);
    const textAt = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(bytes, offset, length));
    assert.equal(textAt(0, 4), "RIFF");
    assert.equal(textAt(8, 4), "WAVE");
    assert.equal(view.getUint16(20, true), 1);
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(24, true), 8_000);
    assert.ok(bytes.byteLength > 44);
  });

  it("builds a shorter deterministic resolving outro", () => {
    const first = buildSignalSynthOutroPlan("show-a:episode-a");
    const again = buildSignalSynthOutroPlan("show-a:episode-a");
    const other = buildSignalSynthOutroPlan("show-a:episode-b");
    assert.deepEqual(first, again);
    assert.notDeepEqual(first, other);
    assert.equal(first.durationMs, SIGNAL_SYNTH_OUTRO_DURATION_MS);
    assert.ok(first.durationMs < SIGNAL_SYNTH_IDENT_DURATION_MS);
    assert.ok(first.notes.length >= 6);
    assert.ok(first.notes.some((note) => note.releaseMs >= 500));
  });
});
