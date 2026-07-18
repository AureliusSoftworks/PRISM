import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_SESSION_ATMOSPHERE_MIX,
  DEFAULT_SIGNAL_ATMOSPHERE_MIX,
  DEFAULT_STUDIO_ATMOSPHERE_URL,
  SESSION_ATMOSPHERE_LOOP_COMPRESSOR,
  SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS,
  SESSION_ATMOSPHERE_LOOP_PRE_GAIN,
  SESSION_FOLEY_URLS,
  SIGNAL_STUDIO_GRAIN_URL,
  sessionAmbientFoleyDelayMs,
  sessionAmbientFoleyUrl,
  sessionAtmosphereBusVolume,
  sessionAtmosphereLoopEndTime,
  startSessionAtmosphere,
} from "./session-atmosphere-audio.ts";

test("Signal mix favors room presence and audible Foley over static", () => {
  assert.deepEqual(DEFAULT_SIGNAL_ATMOSPHERE_MIX, {
    background: 0.14,
    grain: 0.03,
    foley: 0.6,
  });
  assert.ok(
    DEFAULT_SIGNAL_ATMOSPHERE_MIX.background >
      DEFAULT_SESSION_ATMOSPHERE_MIX.background,
  );
  assert.ok(
    DEFAULT_SIGNAL_ATMOSPHERE_MIX.grain <
      DEFAULT_SESSION_ATMOSPHERE_MIX.grain,
  );
  assert.ok(DEFAULT_SIGNAL_ATMOSPHERE_MIX.foley > 0.4);
});

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
    removeEventListener(): void {}
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

test("atmosphere loops rewind before generated audio's cutoff tail", () => {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const instances: FakeAudio[] = [];
  class FakeAudio {
    readonly src: string;
    duration = 30;
    currentTime = 0;
    preload = "";
    loop = false;
    volume = 1;
    private listeners = new Map<string, () => void>();

    constructor(src: string) {
      this.src = src;
      instances.push(this);
    }
    addEventListener(name: string, listener: () => void): void {
      this.listeners.set(name, listener);
    }
    removeEventListener(name: string): void {
      this.listeners.delete(name);
    }
    emit(name: string): void {
      this.listeners.get(name)?.();
    }
    play(): Promise<void> {
      return Promise.resolve();
    }
    pause(): void {}
    removeAttribute(): void {}
    load(): void {}
  }
  Object.defineProperty(globalThis, "Audio", {
    configurable: true,
    value: FakeAudio,
  });
  try {
    const controller = startSessionAtmosphere({
      seed: "trimmed-loop",
      volume: 1,
      backgroundUrl: "/room.mp3",
      grainUrl: "/grain.mp3",
      ambientFoley: false,
    });
    assert.equal(
      sessionAtmosphereLoopEndTime(30),
      30 - SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS,
    );
    assert.equal(instances.length, 2);
    for (const audio of instances) {
      audio.currentTime = 28.9;
      audio.emit("timeupdate");
      assert.equal(audio.currentTime, 28.9);
      audio.currentTime = 29.05;
      audio.emit("timeupdate");
      assert.equal(audio.currentTime, 0);
    }
    controller.stop();
  } finally {
    if (originalAudio) {
      Object.defineProperty(globalThis, "Audio", originalAudio);
    } else {
      Reflect.deleteProperty(globalThis, "Audio");
    }
  }
});

test("loop leveler recovers very quiet ambience before applying the mix bus", () => {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const gains: Array<{ gain: { value: number } }> = [];
  const compressors: Array<{
    threshold: { value: number };
    knee: { value: number };
    ratio: { value: number };
    attack: { value: number };
    release: { value: number };
  }> = [];
  class FakeNode {
    connect(): FakeNode {
      return this;
    }
    disconnect(): void {}
  }
  class FakeGainNode extends FakeNode {
    gain = { value: 1 };
    constructor() {
      super();
      gains.push(this);
    }
  }
  class FakeCompressorNode extends FakeNode {
    threshold = { value: 0 };
    knee = { value: 0 };
    ratio = { value: 0 };
    attack = { value: 0 };
    release = { value: 0 };
    constructor() {
      super();
      compressors.push(this);
    }
  }
  class FakeAudioContext {
    state = "running";
    destination = new FakeNode();
    createMediaElementSource(): FakeNode {
      return new FakeNode();
    }
    createGain(): FakeGainNode {
      return new FakeGainNode();
    }
    createDynamicsCompressor(): FakeCompressorNode {
      return new FakeCompressorNode();
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
  }
  class FakeAudio {
    preload = "";
    loop = false;
    volume = 0;
    pause(): void {}
    removeAttribute(): void {}
    load(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
    play(): Promise<void> {
      return Promise.resolve();
    }
  }
  Object.defineProperty(globalThis, "Audio", {
    configurable: true,
    value: FakeAudio,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  try {
    const controller = startSessionAtmosphere({
      seed: "quiet-provider-loop",
      volume: 1,
      backgroundUrl: "/quiet.mp3",
      ambientFoley: false,
    });
    assert.equal(gains.length, 2);
    assert.equal(gains[0]?.gain.value, SESSION_ATMOSPHERE_LOOP_PRE_GAIN);
    assert.equal(
      gains[1]?.gain.value,
      DEFAULT_SESSION_ATMOSPHERE_MIX.background,
    );
    assert.equal(
      compressors[0]?.threshold.value,
      SESSION_ATMOSPHERE_LOOP_COMPRESSOR.threshold,
    );
    assert.equal(
      compressors[0]?.knee.value,
      SESSION_ATMOSPHERE_LOOP_COMPRESSOR.knee,
    );
    assert.equal(
      compressors[0]?.ratio.value,
      SESSION_ATMOSPHERE_LOOP_COMPRESSOR.ratio,
    );
    assert.equal(
      compressors[0]?.attack.value,
      SESSION_ATMOSPHERE_LOOP_COMPRESSOR.attack,
    );
    assert.equal(
      compressors[0]?.release.value,
      SESSION_ATMOSPHERE_LOOP_COMPRESSOR.release,
    );

    controller.setMix({
      volume: 0.5,
      mix: { background: 0.2, grain: 0, foley: 0 },
    });
    assert.equal(gains[0]?.gain.value, SESSION_ATMOSPHERE_LOOP_PRE_GAIN);
    assert.equal(gains[1]?.gain.value, 0.1);
    controller.stop();
  } finally {
    if (originalAudio) {
      Object.defineProperty(globalThis, "Audio", originalAudio);
    } else {
      Reflect.deleteProperty(globalThis, "Audio");
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
