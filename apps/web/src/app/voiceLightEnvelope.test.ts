import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bindBotVoiceLightTarget,
  botVoiceLightTarget,
  createVoiceLightMeter,
  normalizedVoiceLightLevel,
  publishBotVoiceLightLevel,
  resetBotVoiceLightLevelsForTests,
  smoothVoiceLightLevel,
} from "./voiceLightEnvelope.ts";

describe("voice-conducted bot light envelope", () => {
  it("normalizes silence to zero and clamps loud audio", () => {
    assert.equal(normalizedVoiceLightLevel(new Float32Array(128)), 0);
    assert.ok(
      normalizedVoiceLightLevel(Float32Array.from({ length: 128 }, () => 1)) <=
        1,
    );
  });

  it("keeps sustained vowel energy primary while giving transients a modest lift", () => {
    const sustained = Float32Array.from(
      { length: 128 },
      (_, index) => Math.sin(index / 4) * 0.08,
    );
    const transient = sustained.slice();
    transient[64] = 0.5;
    const sustainedLevel = normalizedVoiceLightLevel(sustained);
    const transientLevel = normalizedVoiceLightLevel(transient);
    assert.ok(sustainedLevel > 0.12);
    assert.ok(transientLevel > sustainedLevel);
    assert.ok(transientLevel - sustainedLevel < 0.25);
  });

  it("attacks faster than it releases", () => {
    const attacked = smoothVoiceLightLevel({
      previous: 0,
      target: 1,
      elapsedMs: 45,
    });
    const released = smoothVoiceLightLevel({
      previous: 1,
      target: 0,
      elapsedMs: 45,
    });
    assert.ok(attacked > 0.6);
    assert.ok(released > 0.8);
    assert.ok(
      smoothVoiceLightLevel({ previous: 5, target: -5, elapsedMs: 1_000 }) <
        0.02,
    );
  });

  it("keeps simultaneous performance targets isolated", () => {
    resetBotVoiceLightLevelsForTests();
    const valuesA: string[] = [];
    const valuesB: string[] = [];
    const makeElement = (values: string[]) => ({
      dataset: {} as DOMStringMap,
      style: {
        setProperty: (_name: string, value: string) => {
          values.push(value);
        },
      } as unknown as CSSStyleDeclaration,
    });
    const targetA = botVoiceLightTarget("coffee", "session", "bot-a");
    const targetB = botVoiceLightTarget("coffee", "session", "bot-b");
    const unbindA = bindBotVoiceLightTarget(makeElement(valuesA), targetA);
    const unbindB = bindBotVoiceLightTarget(makeElement(valuesB), targetB);
    publishBotVoiceLightLevel(targetA, 0.7);
    publishBotVoiceLightLevel(targetB, 0.2);
    assert.equal(valuesA.at(-1), "0.700");
    assert.equal(valuesB.at(-1), "0.200");
    unbindA();
    unbindB();
  });

  it("publishes smoothed audio and resets cancellation to zero", () => {
    const originalRequest = Object.getOwnPropertyDescriptor(
      globalThis,
      "requestAnimationFrame",
    );
    const originalCancel = Object.getOwnPropertyDescriptor(
      globalThis,
      "cancelAnimationFrame",
    );
    let frame: FrameRequestCallback | null = null;
    const levels: number[] = [];
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0.1),
    } as unknown as AnalyserNode;
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      },
    });
    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      configurable: true,
      value: () => {
        frame = null;
      },
    });
    try {
      const meter = createVoiceLightMeter(
        { createAnalyser: () => analyser } as unknown as AudioContext,
        (level) => levels.push(level),
      );
      const sample = frame as FrameRequestCallback | null;
      assert.ok(sample);
      sample(34);
      assert.ok((levels.at(-1) ?? 0) > 0);
      meter.stop();
      assert.equal(levels.at(-1), 0);
      assert.equal(frame, null);
    } finally {
      if (originalRequest) {
        Object.defineProperty(globalThis, "requestAnimationFrame", originalRequest);
      } else {
        Reflect.deleteProperty(globalThis, "requestAnimationFrame");
      }
      if (originalCancel) {
        Object.defineProperty(globalThis, "cancelAnimationFrame", originalCancel);
      } else {
        Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
      }
    }
  });
});
