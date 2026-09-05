import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KOKORO_STREAM_EDGE_PAD_MS,
  KOKORO_STREAM_MAX_TRIM_MS,
  pcmWaveAudibleBounds,
  trimPcmWaveChunkJoinSilence,
} from "../local-voice-wave.ts";

type TestWaveFormat = "float32" | "pcm16";

function testWave(
  samples: readonly number[],
  format: TestWaveFormat,
  sampleRate = 1_000,
): Buffer {
  const float = format === "float32";
  const bytesPerSample = float ? 4 : 2;
  const dataBytes = samples.length * bytesPerSample;
  const wave = Buffer.alloc(44 + dataBytes);
  wave.write("RIFF", 0, "ascii");
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVE", 8, "ascii");
  wave.write("fmt ", 12, "ascii");
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(float ? 3 : 1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * bytesPerSample, 28);
  wave.writeUInt16LE(bytesPerSample, 32);
  wave.writeUInt16LE(bytesPerSample * 8, 34);
  wave.write("data", 36, "ascii");
  wave.writeUInt32LE(dataBytes, 40);
  samples.forEach((sample, index) => {
    const offset = 44 + index * bytesPerSample;
    if (float) {
      wave.writeFloatLE(sample, offset);
    } else {
      wave.writeInt16LE(
        Math.max(-0x8000, Math.min(0x7fff, Math.round(sample * 0x7fff))),
        offset,
      );
    }
  });
  return wave;
}

function waveSamples(wave: Buffer, format: TestWaveFormat): number[] {
  const bytesPerSample = format === "float32" ? 4 : 2;
  const dataBytes = wave.readUInt32LE(40);
  return Array.from({ length: dataBytes / bytesPerSample }, (_, index) => {
    const offset = 44 + index * bytesPerSample;
    return format === "float32"
      ? wave.readFloatLE(offset)
      : wave.readInt16LE(offset) / 0x7fff;
  });
}

function paddedSpeechSamples(): number[] {
  return [
    ...Array<number>(80).fill(0),
    ...Array<number>(20).fill(0.004),
    ...Array<number>(60).fill(0.25),
    ...Array<number>(20).fill(0.004),
    ...Array<number>(100).fill(0),
  ];
}

for (const format of ["pcm16", "float32"] as const) {
  describe(`${format} local voice WAV join trimming`, () => {
    it("retains a safety pad and quiet phoneme edges without clipping", () => {
      const originalSamples = paddedSpeechSamples();
      const original = testWave(originalSamples, format);
      const trimmed = trimPcmWaveChunkJoinSilence(original, {
        trimLeading: true,
        trimTrailing: true,
      });
      const samples = waveSamples(trimmed, format);

      assert.notEqual(trimmed, original);
      assert.equal(samples.length, 140);
      assert.equal(
        samples.length,
        trimmed.readUInt32LE(40) / (format === "float32" ? 4 : 2),
      );
      assert.equal(trimmed.readUInt32LE(4), trimmed.length - 8);
      assert.equal(KOKORO_STREAM_EDGE_PAD_MS, 40);
      // The sub-threshold attack/release at source frames 80-99 / 160-179
      // remains byte-for-byte inside the retained 40 ms safety envelope.
      const tolerance = format === "float32" ? 1e-7 : 1 / 0x7fff;
      assert.ok(Math.abs(samples[20]! - 0.004) <= tolerance);
      assert.ok(Math.abs(samples[39]! - 0.004) <= tolerance);
      assert.ok(Math.abs(samples[100]! - 0.004) <= tolerance);
      assert.ok(Math.abs(samples[119]! - 0.004) <= tolerance);
      assert.equal(samples[19], 0);
      assert.equal(samples[120], 0);
    });

    it("preserves the first leading edge and final trailing edge", () => {
      const original = testWave(paddedSpeechSamples(), format);
      const first = trimPcmWaveChunkJoinSilence(original, {
        trimLeading: false,
        trimTrailing: true,
      });
      const last = trimPcmWaveChunkJoinSilence(original, {
        trimLeading: true,
        trimTrailing: false,
      });

      assert.deepEqual(
        waveSamples(first, format).slice(0, 100),
        waveSamples(original, format).slice(0, 100),
      );
      assert.deepEqual(
        waveSamples(last, format).slice(-120),
        waveSamples(original, format).slice(-120),
      );
      assert.equal(waveSamples(first, format).length, 200);
      assert.equal(waveSamples(last, format).length, 220);
    });
  });
}

describe("local voice WAV join trimming safety", () => {
  it("caps removal from unexpectedly long silent edges", () => {
    const original = testWave(
      [
        ...Array<number>(1_000).fill(0),
        ...Array<number>(100).fill(0.25),
        ...Array<number>(1_000).fill(0),
      ],
      "float32",
    );
    const trimmed = trimPcmWaveChunkJoinSilence(original, {
      trimLeading: true,
      trimTrailing: true,
    });
    assert.equal(KOKORO_STREAM_MAX_TRIM_MS, 600);
    assert.equal(waveSamples(trimmed, "float32").length, 900);
  });

  it("makes the intended 180/80 ms waits the restrained total joins", () => {
    const source = testWave(paddedSpeechSamples(), "float32");
    const previous = trimPcmWaveChunkJoinSilence(source, {
      trimLeading: false,
      trimTrailing: true,
    });
    const next = trimPcmWaveChunkJoinSilence(source, {
      trimLeading: true,
      trimTrailing: false,
    });
    const previousBounds = pcmWaveAudibleBounds(previous)!;
    const nextBounds = pcmWaveAudibleBounds(next)!;
    const trailingMs =
      (previousBounds.frameCount - previousBounds.lastVoicedFrame - 1) /
      previousBounds.sampleRate * 1_000;
    const leadingMs = nextBounds.firstVoicedFrame /
      nextBounds.sampleRate * 1_000;

    assert.equal(trailingMs, 40);
    assert.equal(leadingMs, 40);
    assert.equal(trailingMs + 180 + leadingMs, 260);
    assert.equal(trailingMs + 80 + leadingMs, 160);
  });

  it("fails open for malformed, unsupported, invalid, and silent WAVs", () => {
    const malformed = Buffer.from("not a wave");
    assert.equal(
      trimPcmWaveChunkJoinSilence(malformed, {
        trimLeading: true,
        trimTrailing: true,
      }),
      malformed,
    );

    const unsupported = testWave(paddedSpeechSamples(), "pcm16");
    unsupported.writeUInt16LE(6, 20);
    assert.equal(
      trimPcmWaveChunkJoinSilence(unsupported, {
        trimLeading: true,
        trimTrailing: true,
      }),
      unsupported,
    );

    const invalidFloat = testWave(paddedSpeechSamples(), "float32");
    invalidFloat.writeFloatLE(Number.NaN, 44 + 120 * 4);
    assert.equal(
      trimPcmWaveChunkJoinSilence(invalidFloat, {
        trimLeading: true,
        trimTrailing: true,
      }),
      invalidFloat,
    );

    const silent = testWave(Array<number>(1_000).fill(0), "pcm16");
    assert.equal(
      trimPcmWaveChunkJoinSilence(silent, {
        trimLeading: true,
        trimTrailing: true,
      }),
      silent,
    );
  });
});
