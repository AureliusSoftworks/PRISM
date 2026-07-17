import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_SESSION_ATMOSPHERE_MIX,
  DEFAULT_STUDIO_ATMOSPHERE_URL,
  SESSION_FOLEY_URLS,
  SIGNAL_STUDIO_GRAIN_URL,
  sessionAmbientFoleyDelayMs,
  sessionAmbientFoleyUrl,
  sessionAtmosphereBusVolume,
  startSessionAtmosphere,
} from "./session-atmosphere-audio.ts";

test("session atmosphere foley is deterministic and tactfully spaced", () => {
  assert.equal(
    sessionAmbientFoleyDelayMs("session-a", 2),
    sessionAmbientFoleyDelayMs("session-a", 2),
  );
  assert.ok(sessionAmbientFoleyDelayMs("session-a", 2) >= 18_000);
  assert.ok(sessionAmbientFoleyDelayMs("session-a", 2) <= 42_000);
  assert.match(
    sessionAmbientFoleyUrl("session-a", 2),
    /^\/audio\/session-atmosphere\//u,
  );
});

test("session atmosphere exposes bundled studio and cup-synced foley assets", () => {
  assert.equal(
    DEFAULT_STUDIO_ATMOSPHERE_URL,
    "/audio/session-atmosphere/default-studio-room-loop.mp3",
  );
  assert.match(SESSION_FOLEY_URLS.coffeeSip, /coffee-sip\.mp3$/u);
  assert.match(SESSION_FOLEY_URLS.coffeeCupPlace, /coffee-cup-place\.mp3$/u);
  assert.match(SIGNAL_STUDIO_GRAIN_URL, /studio-mix-grain-loop\.mp3$/u);
  for (const url of [
    DEFAULT_STUDIO_ATMOSPHERE_URL,
    SIGNAL_STUDIO_GRAIN_URL,
    SESSION_FOLEY_URLS.coffeeSip,
    SESSION_FOLEY_URLS.coffeeCupPlace,
  ]) {
    const file = new URL(`../../public${url}`, import.meta.url);
    assert.ok(statSync(file).size > 1_000, `${url} should be bundled`);
  }
});

test("session atmosphere buses keep their own calibrated and clamped gains", () => {
  assert.equal(
    sessionAtmosphereBusVolume({ volume: 0.5, bus: "background" }),
    DEFAULT_SESSION_ATMOSPHERE_MIX.background * 0.5,
  );
  assert.equal(
    sessionAtmosphereBusVolume({ volume: 1, bus: "grain" }),
    DEFAULT_SESSION_ATMOSPHERE_MIX.grain,
  );
  assert.equal(
    sessionAtmosphereBusVolume({
      volume: 1,
      bus: "foley",
      trim: 1.25,
    }),
    DEFAULT_SESSION_ATMOSPHERE_MIX.foley * 1.25,
  );
  assert.equal(
    sessionAtmosphereBusVolume({
      volume: 2,
      mix: { background: 2, grain: -1, foley: Number.NaN },
      bus: "background",
    }),
    1,
  );
  assert.equal(
    sessionAtmosphereBusVolume({
      volume: 1,
      mix: { background: 0.1, grain: -1, foley: Number.NaN },
      bus: "grain",
    }),
    0,
  );
});

test("live mix changes retune independent loops without restarting them", () => {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const instances: Array<{
    src: string;
    volume: number;
    paused: boolean;
  }> = [];
  class FakeAudio {
    readonly src: string;
    preload = "";
    loop = false;
    volume = 1;
    paused = false;

    constructor(src: string) {
      this.src = src;
      instances.push(this);
    }

    addEventListener(): void {}
    play(): Promise<void> {
      return Promise.resolve();
    }
    pause(): void {
      this.paused = true;
    }
    removeAttribute(): void {}
    load(): void {}
  }
  Object.defineProperty(globalThis, "Audio", {
    configurable: true,
    value: FakeAudio,
  });
  try {
    const controller = startSessionAtmosphere({
      seed: "signal-mix",
      volume: 1,
      backgroundUrl: "/room.mp3",
      grainUrl: "/grain.mp3",
    });
    assert.equal(instances.length, 2);
    assert.deepEqual(
      instances.map(({ src, volume }) => [src, volume]),
      [
        ["/room.mp3", 0.1],
        ["/grain.mp3", 0.04],
      ],
    );

    controller.setMix({
      volume: 0.5,
      mix: { background: 0.2, grain: 0.1, foley: 0.3 },
    });
    assert.equal(instances.length, 2);
    assert.deepEqual(
      instances.map(({ volume }) => volume),
      [0.1, 0.05],
    );

    controller.stop();
    assert.ok(instances.every(({ paused }) => paused));
  } finally {
    if (originalAudio) {
      Object.defineProperty(globalThis, "Audio", originalAudio);
    } else {
      Reflect.deleteProperty(globalThis, "Audio");
    }
  }
});
