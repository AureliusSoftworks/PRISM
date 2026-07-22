import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_SESSION_ATMOSPHERE_MIX,
  DEFAULT_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE,
  DEFAULT_SESSION_AMBIENT_FOLEY_PROFILE,
  DEFAULT_SIGNAL_ATMOSPHERE_MIX,
  DEFAULT_STUDIO_ATMOSPHERE_URL,
  SESSION_ATMOSPHERE_BACKGROUND_TONE,
  SESSION_ATMOSPHERE_LOOP_CROSSFADE_SECONDS,
  SESSION_ATMOSPHERE_LOOP_COMPRESSOR,
  SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS,
  SESSION_ATMOSPHERE_LOOP_PRE_GAIN,
  SESSION_FOLEY_URLS,
  coffeeCupFoleyCueForTransition,
  SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX,
  createSeamlessSessionAtmosphereLoopBuffer,
  sessionAmbientBotVocalizationCue,
  sessionAmbientBotVocalizationDelayMs,
  sessionAmbientBotVocalizationTargetId,
  sessionAmbientFoleyDelayMs,
  sessionAmbientFoleyUrl,
  sessionAtmosphereBusVolume,
  sessionAtmosphereLoopEndTime,
  signalAtmosphereMixLevelFromRelative,
  signalAtmosphereRelativeMixLevel,
  signalSessionAtmosphereActive,
  startSessionAtmosphere,
} from "./session-atmosphere-audio.ts";

test("Signal keeps its atmosphere alive through a completed episode's outro", () => {
  const base = {
    audioEnabled: true,
    hasSelectedShow: true,
    preRollActive: false,
    episodePresent: false,
    replayPlaying: false,
    studioLayoutEditorOpen: false,
  };

  assert.equal(signalSessionAtmosphereActive(base), false);
  assert.equal(
    signalSessionAtmosphereActive({ ...base, episodePresent: true }),
    true,
  );
  assert.equal(
    signalSessionAtmosphereActive({
      ...base,
      episodePresent: true,
      preRollActive: true,
    }),
    false,
  );
  assert.equal(
    signalSessionAtmosphereActive({ ...base, replayPlaying: true }),
    true,
  );
  assert.equal(
    signalSessionAtmosphereActive({ ...base, studioLayoutEditorOpen: true }),
    true,
  );
});

test("Signal mix removes static while keeping atmosphere and tactile Foley separate", () => {
  assert.deepEqual(DEFAULT_SIGNAL_ATMOSPHERE_MIX, {
    background: 0.16,
    grain: 0,
    foley: 1,
    filmGrain: 1,
  });
  assert.ok(
    DEFAULT_SIGNAL_ATMOSPHERE_MIX.background >
      DEFAULT_SESSION_ATMOSPHERE_MIX.background,
  );
  assert.equal(DEFAULT_SIGNAL_ATMOSPHERE_MIX.grain, 0);
  assert.equal(DEFAULT_SIGNAL_ATMOSPHERE_MIX.foley, 1);
});

test("Signal presents its approved mix as centered 100% unity", () => {
  for (const bus of ["background", "foley"] as const) {
    assert.equal(
      signalAtmosphereRelativeMixLevel(bus, {
        ...DEFAULT_SIGNAL_ATMOSPHERE_MIX,
      }),
      1,
    );
    assert.equal(
      signalAtmosphereMixLevelFromRelative(
        bus,
        SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX,
      ),
      DEFAULT_SIGNAL_ATMOSPHERE_MIX[bus] * 2,
    );
  }
  assert.equal(
    signalAtmosphereMixLevelFromRelative(
      "grain",
      SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX,
    ),
    0,
  );
});

test("session atmosphere foley is deterministic and tactfully spaced", () => {
  assert.equal(
    sessionAmbientFoleyDelayMs("session-a", 2),
    sessionAmbientFoleyDelayMs("session-a", 2),
  );
  assert.ok(sessionAmbientFoleyDelayMs("session-a", 2) >= 18_000);
  assert.ok(sessionAmbientFoleyDelayMs("session-a", 2) <= 42_000);
  assert.deepEqual(DEFAULT_SESSION_AMBIENT_FOLEY_PROFILE, {
    minDelayMs: 18_000,
    maxDelayMs: 42_000,
    trim: 1,
  });
  assert.match(
    sessionAmbientFoleyUrl("session-a", 2),
    /^\/audio\/session-atmosphere\//u,
  );
});

test("ambient bot vocalizations are sparse bundled recordings with deterministic targets", () => {
  assert.deepEqual(DEFAULT_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE, {
    minDelayMs: 34_000,
    maxDelayMs: 76_000,
    trim: 1,
  });
  assert.equal(
    sessionAmbientBotVocalizationDelayMs("session-a", 2),
    sessionAmbientBotVocalizationDelayMs("session-a", 2),
  );
  assert.ok(
    sessionAmbientBotVocalizationDelayMs("session-a", 2) >= 34_000,
  );
  assert.ok(
    sessionAmbientBotVocalizationDelayMs("session-a", 2) <= 76_000,
  );
  assert.equal(
    sessionAmbientBotVocalizationTargetId("session-a", 2, ["", "a", "b"]),
    sessionAmbientBotVocalizationTargetId("session-a", 2, ["", "a", "b"]),
  );
  assert.equal(
    sessionAmbientBotVocalizationTargetId("session-a", 2, []),
    null,
  );

  const kinds = new Set<string>();
  for (let index = 0; index < 200; index += 1) {
    const cue = sessionAmbientBotVocalizationCue("session-a", index);
    kinds.add(cue.kind);
    assert.match(cue.url, /^\/audio\/(?:session-atmosphere|voice-presence)\//u);
    assert.ok(cue.durationMs >= 700 && cue.durationMs <= 1_300);
    assert.ok(
      statSync(new URL(`../../public${cue.url}`, import.meta.url)).size > 1_000,
      `${cue.url} should be bundled`,
    );
  }
  assert.deepEqual(
    kinds,
    new Set([
      "throat-clear",
      "mouth-sound",
      "lip-smack",
      "soft-sigh",
      "soft-inhale",
    ]),
  );
});

test("ambient bot vocalizations use the local Foley lane without a voice profile", () => {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  const instances: Array<{ src: string; volume: number }> = [];
  class FakeAudio {
    readonly src: string;
    preload = "";
    loop = false;
    volume = 1;
    constructor(src: string) {
      this.src = src;
      instances.push(this);
    }
    addEventListener(): void {}
    removeEventListener(): void {}
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
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout(callback: () => void, delayMs: number): number {
        scheduled.push({ callback, delayMs });
        return scheduled.length;
      },
      clearTimeout(): void {},
    },
  });
  try {
    const seenKinds: string[] = [];
    const controller = startSessionAtmosphere({
      seed: "local-vocalization",
      volume: 1,
      mix: { background: 0, grain: 0, foley: 0.5 },
      ambientFoley: false,
      ambientBotVocalizations: true,
      ambientBotVocalizationProfile: {
        minDelayMs: 1_000,
        maxDelayMs: 1_000,
        trim: 0.4,
      },
      shouldDeferFoley: () => true,
      shouldDeferBotVocalization: () => false,
      onAmbientBotVocalization(cue) {
        seenKinds.push(cue.kind);
        return true;
      },
    });
    assert.equal(scheduled.length, 1);
    scheduled[0]!.callback();
    assert.equal(seenKinds.length, 1);
    assert.equal(instances.length, 1);
    assert.match(
      instances[0]?.src ?? "",
      /^\/audio\/(?:session-atmosphere|voice-presence)\//u,
    );
    assert.equal(instances[0]?.volume, 0.2);
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

test("Signal can disable generic ambient Foley while preserving synchronized cues", () => {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  const instances: Array<{ src: string; volume: number }> = [];
  class FakeAudio {
    readonly src: string;
    preload = "";
    loop = false;
    volume = 1;
    constructor(src: string) {
      this.src = src;
      instances.push(this);
    }
    addEventListener(): void {}
    removeEventListener(): void {}
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
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout(callback: () => void, delayMs: number): number {
        scheduled.push({ callback, delayMs });
        return scheduled.length;
      },
      clearTimeout(): void {},
    },
  });
  try {
    const controller = startSessionAtmosphere({
      seed: "signal-foley",
      volume: 1,
      mix: { background: 0, grain: 0, foley: 0.5 },
      ambientFoley: false,
    });
    assert.equal(scheduled.length, 0);
    controller.playCue("coffeeSip");
    assert.equal(instances.length, 1);
    assert.match(instances[0]?.src ?? "", /coffee-sip\.mp3$/u);
    assert.equal(instances[0]?.volume, 0.625);
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

test("session atmosphere exposes bundled studio and cup-synced foley assets", () => {
  assert.equal(
    DEFAULT_STUDIO_ATMOSPHERE_URL,
    "/audio/session-atmosphere/default-studio-room-loop.mp3",
  );
  assert.match(SESSION_FOLEY_URLS.coffeeSip, /coffee-sip\.mp3$/u);
  assert.match(SESSION_FOLEY_URLS.coffeeCupPlace, /coffee-cup-place\.mp3$/u);
  for (const url of [
    DEFAULT_STUDIO_ATMOSPHERE_URL,
    SESSION_FOLEY_URLS.coffeeSip,
    SESSION_FOLEY_URLS.coffeeCupPlace,
  ]) {
    const file = new URL(`../../public${url}`, import.meta.url);
    assert.ok(statSync(file).size > 1_000, `${url} should be bundled`);
  }
});

test("cup foley emits exactly once for each sip and return transition", () => {
  assert.equal(coffeeCupFoleyCueForTransition(undefined, false), null);
  assert.equal(coffeeCupFoleyCueForTransition(false, false), null);
  assert.equal(coffeeCupFoleyCueForTransition(false, true), "coffeeSip");
  assert.equal(coffeeCupFoleyCueForTransition(true, true), null);
  assert.equal(
    coffeeCupFoleyCueForTransition(true, false),
    "coffeeCupPlace",
  );
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

test("atmosphere loops crossfade into a periodic, sample-continuous buffer", () => {
  class FakeAudioBuffer {
    readonly duration: number;
    readonly length: number;
    readonly numberOfChannels: number;
    readonly sampleRate: number;
    private readonly channels: Float32Array[];

    constructor(numberOfChannels: number, length: number, sampleRate: number) {
      this.duration = length / sampleRate;
      this.length = length;
      this.numberOfChannels = numberOfChannels;
      this.sampleRate = sampleRate;
      this.channels = Array.from(
        { length: numberOfChannels },
        () => new Float32Array(length),
      );
    }

    getChannelData(channel: number): Float32Array {
      return this.channels[channel]!;
    }
  }

  const sampleRate = 8;
  const decoded = new FakeAudioBuffer(1, 32, sampleRate);
  decoded.getChannelData(0).set(
    Float32Array.from({ length: decoded.length }, (_, index) => index),
  );
  const context = {
    createBuffer(numberOfChannels: number, length: number, rate: number) {
      return new FakeAudioBuffer(numberOfChannels, length, rate);
    },
  } as unknown as BaseAudioContext;
  const loop = createSeamlessSessionAtmosphereLoopBuffer(
    context,
    decoded as unknown as AudioBuffer,
    0.5,
    0.5,
  );
  const channel = loop.getChannelData(0);

  assert.equal(
    sessionAtmosphereLoopEndTime(30),
    30 - SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS,
  );
  assert.equal(SESSION_ATMOSPHERE_LOOP_CROSSFADE_SECONDS, 0.75);
  assert.equal(loop.length, 24);
  assert.equal(loop.duration, 3);
  assert.equal(channel.at(-1), 23);
  assert.equal(channel[0], 24);
  assert.equal(channel[3], 3);
  assert.equal(channel[4], 4);
  assert.equal(channel[0]! - channel.at(-1)!, 1);
});

test("supported browsers play decoded atmosphere on sample-accurate loop sources", async () => {
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const sources: FakeBufferSource[] = [];
  const contexts: FakeAudioContext[] = [];
  const fetched: string[] = [];

  class FakeAudioBuffer {
    readonly duration: number;
    readonly length: number;
    readonly numberOfChannels = 1;
    readonly sampleRate: number;
    readonly channels: Float32Array[];
    constructor(length: number, sampleRate: number) {
      this.length = length;
      this.sampleRate = sampleRate;
      this.duration = length / sampleRate;
      this.channels = [new Float32Array(length)];
    }
    getChannelData(channel: number): Float32Array {
      return this.channels[channel]!;
    }
  }
  class FakeNode {
    connect(): FakeNode {
      return this;
    }
    disconnect(): void {}
  }
  class FakeGainNode extends FakeNode {
    gain = {
      value: 1,
      setValueAtTime: (value: number): void => {
        this.gain.value = value;
      },
    };
  }
  class FakeCompressorNode extends FakeNode {
    threshold = { value: 0 };
    knee = { value: 0 };
    ratio = { value: 0 };
    attack = { value: 0 };
    release = { value: 0 };
  }
  class FakeBufferSource extends FakeNode {
    buffer: FakeAudioBuffer | null = null;
    loop = false;
    loopStart = -1;
    loopEnd = -1;
    started = false;
    stopped = false;
    readonly context: FakeAudioContext;
    constructor(context: FakeAudioContext) {
      super();
      this.context = context;
      sources.push(this);
    }
    start(): void {
      this.started = true;
    }
    stop(): void {
      this.stopped = true;
    }
  }
  class FakeAudioContext {
    state: AudioContextState = "running";
    currentTime = 0;
    destination = new FakeNode();
    constructor() {
      contexts.push(this);
    }
    createBuffer(
      _numberOfChannels: number,
      length: number,
      sampleRate: number,
    ): FakeAudioBuffer {
      return new FakeAudioBuffer(length, sampleRate);
    }
    createBufferSource(): FakeBufferSource {
      return new FakeBufferSource(this);
    }
    createGain(): FakeGainNode {
      return new FakeGainNode();
    }
    createDynamicsCompressor(): FakeCompressorNode {
      return new FakeCompressorNode();
    }
    decodeAudioData(): Promise<FakeAudioBuffer> {
      return Promise.resolve(new FakeAudioBuffer(32, 8));
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
  }

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (url: string) => {
      fetched.push(url);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  let controller: ReturnType<typeof startSessionAtmosphere> | null = null;
  try {
    controller = startSessionAtmosphere({
      seed: "seamless-loop",
      volume: 1,
      backgroundUrl: "/room.mp3",
      grainUrl: "/grain.mp3",
      ambientFoley: false,
    });
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));

    assert.deepEqual(fetched, ["/room.mp3", "/grain.mp3"]);
    assert.equal(sources.length, 2);
    assert.ok(sources.every((source) => source.started));
    assert.ok(sources.every((source) => source.loop));
    assert.ok(sources.every((source) => source.loopStart === 0));
    assert.ok(sources.every((source) => source.loopEnd === 2.25));

    controller.stop();
    assert.ok(sources.every((source) => source.stopped));
  } finally {
    controller?.stop();
    for (const context of contexts) context.state = "closed";
    if (originalFetch) {
      Object.defineProperty(globalThis, "fetch", originalFetch);
    } else {
      Reflect.deleteProperty(globalThis, "fetch");
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
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
  const filters: Array<{
    type: BiquadFilterType;
    frequency: { value: number };
    gain: { value: number };
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
  class FakeBiquadFilterNode extends FakeNode {
    type: BiquadFilterType = "lowpass";
    frequency = { value: 350 };
    gain = { value: 0 };
    constructor() {
      super();
      filters.push(this);
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
    createBiquadFilter(): FakeBiquadFilterNode {
      return new FakeBiquadFilterNode();
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
      backgroundTone: "warm-low",
      allowMixBoost: true,
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
    assert.deepEqual(
      filters.map((filter) => ({
        type: filter.type,
        frequency: filter.frequency.value,
        gain: filter.gain.value,
      })),
      [
        {
          type: "lowshelf",
          frequency: SESSION_ATMOSPHERE_BACKGROUND_TONE.lowShelfFrequencyHz,
          gain: SESSION_ATMOSPHERE_BACKGROUND_TONE.lowShelfGainDb,
        },
        {
          type: "highshelf",
          frequency: SESSION_ATMOSPHERE_BACKGROUND_TONE.highShelfFrequencyHz,
          gain: SESSION_ATMOSPHERE_BACKGROUND_TONE.highShelfGainDb,
        },
      ],
    );

    controller.playCue("coffeeCupPlace");
    assert.equal(gains.length, 3);
    assert.equal(
      gains[2]?.gain.value,
      DEFAULT_SESSION_ATMOSPHERE_MIX.foley * 1.0625,
    );

    controller.setMix({
      volume: 0.5,
      mix: { background: 0.2, grain: 0, foley: 2 },
    });
    assert.equal(gains[0]?.gain.value, SESSION_ATMOSPHERE_LOOP_PRE_GAIN);
    assert.equal(gains[1]?.gain.value, 0.1);
    assert.equal(gains[2]?.gain.value, 1.0625);
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
