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

  it("builds one deterministic, layered MIDI-like plan per show seed", () => {
    const first = buildSignalSynthIdentPlan("show-a:host-a");
    const again = buildSignalSynthIdentPlan("show-a:host-a");
    const other = buildSignalSynthIdentPlan("show-b:host-a");
    assert.deepEqual(first, again);
    assert.notDeepEqual(first, other);
    assert.equal(first.durationMs, SIGNAL_SYNTH_IDENT_DURATION_MS);
    assert.ok(first.notes.length >= 12);
    assert.ok(first.notes.some((note) => note.waveform === "soft-square"));
    assert.ok(first.notes.some((note) => note.waveform === "triangle"));
  });

  it("renders an ordinary mono PCM wave without a live AudioContext", () => {
    const bytes = encodeSignalSynthIdentWave(
      buildSignalSynthIdentPlan("show-a:host-a"),
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
