import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_VOICE_PITCH_CORRECTION,
  analyzePrismPitchCorrection,
  voicePitchCorrectionCentsAt,
} from "./voicePitchCorrection.ts";

const SAMPLE_RATE = 48_000;

function sineWave(
  frequencyHz: number,
  durationSeconds = 1,
  amplitude = 0.35,
): Float32Array {
  return Float32Array.from(
    { length: Math.round(SAMPLE_RATE * durationSeconds) },
    (_, index) => amplitude * Math.sin(2 * Math.PI * frequencyHz * index / SAMPLE_RATE),
  );
}

function averageCorrection(
  points: ReturnType<typeof analyzePrismPitchCorrection>,
  afterSeconds = 0.25,
): number {
  const settled = points.filter((point) => point.atSeconds >= afterSeconds);
  return settled.reduce((sum, point) => sum + point.correctionCents, 0) /
    Math.max(1, settled.length);
}

describe("Prism pitch correction", () => {
  it("leaves an in-tune voiced carrier effectively neutral", () => {
    const points = analyzePrismPitchCorrection({
      samples: sineWave(440),
      sampleRate: SAMPLE_RATE,
    });

    assert.ok(points.length > 10);
    assert.ok(Math.abs(averageCorrection(points)) < 1);
  });

  it("gently pulls voiced audio toward the nearest chromatic note", () => {
    const slightlySharpA = 440 * 2 ** (32 / 1_200);
    const points = analyzePrismPitchCorrection({
      samples: sineWave(slightlySharpA),
      sampleRate: SAMPLE_RATE,
    });
    const correction = averageCorrection(points);

    assert.ok(correction < -5, `expected downward correction, received ${correction}`);
    assert.ok(correction > -12, `expected a restrained correction, received ${correction}`);
  });

  it("honors the configured correction ceiling", () => {
    const sharpA = 440 * 2 ** (35 / 1_200);
    const points = analyzePrismPitchCorrection({
      samples: sineWave(sharpA),
      sampleRate: SAMPLE_RATE,
      plan: {
        ...PRISM_VOICE_PITCH_CORRECTION,
        strength: 1,
        maxCorrectionCents: 8,
      },
    });

    assert.ok(
      points.every((point) => Math.abs(point.correctionCents) <= 8.001),
    );
  });

  it("corrects the audible pitch after profile pitch and lilt offsets", () => {
    const points = analyzePrismPitchCorrection({
      samples: sineWave(440),
      sampleRate: SAMPLE_RATE,
      pitchOffsetCentsAt: () => 32,
    });

    const correction = averageCorrection(points);
    assert.ok(correction < -5, `expected offset-aware correction, received ${correction}`);
    assert.ok(correction > -12, `expected a restrained correction, received ${correction}`);
  });

  it("skips silence and releases correction toward neutral between voiced spans", () => {
    const silence = new Float32Array(Math.round(SAMPLE_RATE * 0.4));
    const voiced = sineWave(440 * 2 ** (32 / 1_200), 0.5);
    const samples = new Float32Array(silence.length + voiced.length + silence.length);
    samples.set(voiced, silence.length);

    assert.deepEqual(
      analyzePrismPitchCorrection({
        samples: new Float32Array(SAMPLE_RATE),
        sampleRate: SAMPLE_RATE,
      }),
      [],
    );

    const points = analyzePrismPitchCorrection({ samples, sampleRate: SAMPLE_RATE });
    assert.ok(Math.abs(voicePitchCorrectionCentsAt(points, 0.7)) > 3);
    assert.ok(Math.abs(voicePitchCorrectionCentsAt(points, 1.15)) < 0.5);
  });

  it("does not mistake unvoiced noise for a tuneable pitch", () => {
    let state = 17;
    const noise = Float32Array.from({ length: SAMPLE_RATE }, () => {
      state = (Math.imul(state, 48_271) % 0x7fffffff) || 1;
      return (state / 0x7fffffff * 2 - 1) * 0.2;
    });

    assert.deepEqual(
      analyzePrismPitchCorrection({ samples: noise, sampleRate: SAMPLE_RATE }),
      [],
    );
  });

  it("maps source analysis time onto paced playback time", () => {
    const points = analyzePrismPitchCorrection({
      samples: sineWave(440 * 2 ** (32 / 1_200)),
      sampleRate: SAMPLE_RATE,
      playbackRate: 2,
      maxPlaybackDurationSeconds: 0.3,
    });

    assert.ok(points.length > 2);
    assert.ok((points.at(-1)?.atSeconds ?? 1) <= 0.3);
  });

  it("interpolates correction between scheduled analysis points", () => {
    const points = [
      { atSeconds: 0, correctionCents: 0 },
      { atSeconds: 0.1, correctionCents: -10 },
    ];
    assert.equal(voicePitchCorrectionCentsAt(points, 0.05), -5);
    assert.equal(voicePitchCorrectionCentsAt(points, 0.2), -10);
  });
});
