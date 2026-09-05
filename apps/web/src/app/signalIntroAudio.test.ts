import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildSignalMusicProfile } from "@localai/shared";
import {
  SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
  SIGNAL_INTRO_STOP_FADE_MS,
  SIGNAL_SYNTH_IDENT_DURATION_MS,
  SIGNAL_SYNTH_OUTRO_DURATION_MS,
  buildSignalSynthIdentPlan,
  buildSignalSynthOutroPlan,
  encodeSignalSynthIdentWave,
  playSignalIntroAudio,
  releaseSignalIntroAudio,
} from "./signalIntroAudio.ts";

describe("Signal Synth ident", () => {
  it("releases audible idents through the shared equal-power stop fade", () => {
    assert.equal(SIGNAL_INTRO_STOP_FADE_MS, 320);
    const source = readFileSync(
      new URL("signalIntroAudio.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /export function releaseSignalIntroAudio\([\s\S]{0,1400}releaseAudibleAudioElement\(audio,[\s\S]{0,160}onReleased: finish/u);
    assert.match(source, /export function stopSignalIntroAudio\(\): void \{\s*releaseSignalIntroAudio\(\);/u);
    assert.match(source, /export function teardownSignalIntroAudioImmediately\(\): void \{\s*releaseSignalIntroAudio\(0\);/u);
  });
  const profile = (
    temperament: Parameters<typeof buildSignalMusicProfile>[0]["temperament"],
    seed: string,
    identity: Partial<
      Pick<
        Parameters<typeof buildSignalMusicProfile>[0],
        "premise" | "hostingStyle" | "studioIdentity"
      >
    > = {},
  ) => buildSignalMusicProfile({ temperament, seed, ...identity });

  it("gives episode playback a short preload lead-in", () => {
    assert.equal(SIGNAL_EPISODE_INTRO_LEAD_IN_MS, 180);
  });

  it("detaches replacement tails and releases every generated URL", async () => {
    const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const audios: Array<{ paused: boolean; volume: number; pauses: number; listeners: Map<string, () => void> }> = [];
    const revoked: string[] = [];
    let urlSequence = 0;
    class FakeAudio {
      paused = true;
      volume = 1;
      pauses = 0;
      preload = "";
      src = "";
      readonly listeners = new Map<string, () => void>();
      constructor() { audios.push(this); }
      addEventListener(type: string, listener: () => void): void { this.listeners.set(type, listener); }
      load(): void {}
      pause(): void { this.paused = true; this.pauses += 1; }
      play(): Promise<void> { this.paused = false; return Promise.resolve(); }
    }
    try {
      Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          setTimeout: (callback: () => void, delayMs: number) => {
            const timer = globalThis.setTimeout(callback, delayMs);
            timer.unref?.();
            return timer;
          },
          clearTimeout: globalThis.clearTimeout,
        },
      });
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: () => `blob:signal-${++urlSequence}`,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: (url: string) => revoked.push(url),
      });
      const introAudio = {
        source: "local" as const,
        audioUrl: null,
        durationMs: SIGNAL_SYNTH_IDENT_DURATION_MS,
        outdentAudioUrl: null,
        outdentDurationMs: 0,
        revision: 0,
        model: null,
        undoAvailable: false,
      };
      const first = playSignalIntroAudio({
        profile: profile("neutral", "release-a"),
        seed: "release-a",
        introAudio,
        enabled: true,
        volume: 0.6,
      });
      await Promise.resolve();
      const second = playSignalIntroAudio({
        profile: profile("neutral", "release-b"),
        seed: "release-b",
        introAudio,
        enabled: true,
        volume: 0.6,
      });
      await Promise.resolve();
      releaseSignalIntroAudio(20);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 360));
      await Promise.all([first.finished, second.finished]);
      assert.equal(audios.length, 2);
      assert.ok(audios.every((audio) => audio.pauses === 1));
      assert.deepEqual(revoked.sort(), ["blob:signal-1", "blob:signal-2"]);
    } finally {
      releaseSignalIntroAudio(0);
      if (originalAudio) Object.defineProperty(globalThis, "Audio", originalAudio);
      else Reflect.deleteProperty(globalThis, "Audio");
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
      if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate);
      if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
    }
  });

  it("waits for the shared mixer before routing an ident, while keeping capture silent on routing failure", () => {
    const source = readFileSync(
      new URL("signalIntroAudio.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      source,
      /const mixerReady = await resumePrismAudioContext\(\);[\s\S]{0,220}activeOutputCleanup = mixerReady[\s\S]{0,280}!activeOutputCleanup && replayAudioMasterCaptureActive\(\)/u,
    );
  });

  it("pins commanding and playful recipes to different emotional directions", () => {
    const commanding = buildSignalSynthIdentPlan({
      profile: profile("commanding", "show-a:host-a"),
      seed: "show-a:host-a",
    });
    const commandingAgain = buildSignalSynthIdentPlan({
      profile: profile("commanding", "show-a:host-a"),
      seed: "show-a:host-a",
    });
    const playful = buildSignalSynthIdentPlan({
      profile: profile("playful", "show-a:host-a"),
      seed: "show-a:host-a",
    });
    assert.deepEqual(commanding, commandingAgain);
    assert.notDeepEqual(commanding, playful);
    assert.equal(commanding.durationMs, SIGNAL_SYNTH_IDENT_DURATION_MS);
    assert.equal(commanding.tempoBpm, 92);
    assert.equal(commanding.register, "low");
    assert.equal(commanding.contour, "descending");
    assert.equal(commanding.ending, "hard");
    assert.equal(playful.tempoBpm, 124);
    assert.equal(playful.register, "middle-high");
    assert.equal(playful.contour, "bouncing");
    assert.equal(playful.ending, "lift");
    assert.ok(
      Math.max(...commanding.notes.map((note) => note.midi)) <
        Math.max(...playful.notes.map((note) => note.midi)),
    );
    assert.ok(commanding.notes.some((note) => note.waveform === "soft-square"));
    assert.ok(playful.notes.some((note) => note.lowpassHz > 3_650));
  });

  it("turns cinematic, magical, and nautical profiles into different local phrases", () => {
    const cinematic = buildSignalSynthIdentPlan({
      profile: profile("commanding", "show-cinematic", {
        studioIdentity: "An imperial armoured fortress built for battle.",
      }),
      seed: "show-cinematic",
    });
    const nautical = buildSignalSynthIdentPlan({
      profile: profile("playful", "show-nautical", {
        studioIdentity: "A pineapple room undersea among coral and nautical tools.",
      }),
      seed: "show-nautical",
    });
    const magical = buildSignalSynthIdentPlan({
      profile: profile("adventurous", "show-magical", {
        studioIdentity: "An enchanted castle study with wands, potions, and owls.",
      }),
      seed: "show-magical",
    });
    assert.equal(cinematic.palette, "cinematic");
    assert.equal(magical.palette, "magical");
    assert.equal(nautical.palette, "nautical");
    assert.ok(
      Math.max(...cinematic.notes.map((note) => note.midi)) <
        Math.max(...nautical.notes.map((note) => note.midi)),
    );
    assert.ok(
      Math.max(...nautical.notes.map((note) => note.attackMs)) <
        Math.max(...cinematic.notes.map((note) => note.attackMs)),
    );
    assert.notDeepEqual(
      cinematic.notes.map((note) => note.startMs),
      magical.notes.map((note) => note.startMs),
    );
    assert.notDeepEqual(
      magical.notes.map((note) => note.startMs),
      nautical.notes.map((note) => note.startMs),
    );
  });

  it("gives same-profile shows distinct deterministic harmonic fingerprints", () => {
    const first = buildSignalSynthIdentPlan({
      profile: profile("neutral", "show-a"),
      seed: "show-a:identity-a",
    });
    const second = buildSignalSynthIdentPlan({
      profile: profile("neutral", "show-a"),
      seed: "show-a:identity-b",
    });
    const firstAgain = buildSignalSynthIdentPlan({
      profile: profile("neutral", "show-a"),
      seed: "show-a:identity-a",
    });
    assert.deepEqual(first, firstAgain);
    assert.notDeepEqual(
      first.notes.map((note) => [note.midi, note.startMs]),
      second.notes.map((note) => [note.midi, note.startMs]),
    );
  });

  it("selects bounded phrase grammars, instruments, and production textures by seed", () => {
    const sharedProfile = profile("neutral", "signal-variation-profile", {
      studioIdentity: "A midnight broadcast observatory with instruments and a small audience.",
    });
    const plans = Array.from({ length: 32 }, (_, index) =>
      buildSignalSynthIdentPlan({
        profile: sharedProfile,
        seed: `signal-variation-${index}`,
      }),
    );
    const first = plans[0]!;
    assert.deepEqual(
      first,
      buildSignalSynthIdentPlan({ profile: sharedProfile, seed: "signal-variation-0" }),
    );
    assert.ok(new Set(plans.map((plan) => plan.phraseGrammar)).size >= 3);
    assert.ok(new Set(plans.map((plan) => plan.melodyInstrument)).size >= 3);
    assert.ok(new Set(plans.map((plan) => plan.productionTexture)).size >= 3);
    assert.ok(
      new Set(plans.map((plan) => plan.notes.map((note) => note.startMs).join(","))).size >= 3,
      "seeded grammars should change the rhythmic form",
    );
    assert.ok(
      new Set(plans.map((plan) => `${plan.phraseGrammar}:${plan.melodyInstrument}:${plan.productionTexture}`)).size >= 8,
      "seeds should select materially different sound DNA",
    );
    for (const plan of plans) {
      assert.equal(plan.durationMs, SIGNAL_SYNTH_IDENT_DURATION_MS);
      for (const note of plan.notes) {
        assert.ok(note.startMs >= 0 && note.startMs < plan.durationMs);
        assert.ok(note.durationMs > 0 && note.durationMs <= plan.durationMs);
        assert.ok(note.midi >= 24 && note.midi <= 96);
        assert.ok(note.attackMs >= 0 && note.releaseMs >= 0);
        assert.ok(note.lowpassHz >= 400 && note.lowpassHz <= 6_000);
      }
    }
  });

  it("renders an ordinary mono PCM wave without a live AudioContext", () => {
    const plan = buildSignalSynthIdentPlan({
      profile: profile("neutral", "show-a:host-a"),
      seed: "show-a:host-a",
    });
    const bytes = encodeSignalSynthIdentWave(plan, 8_000);
    const sameBytes = encodeSignalSynthIdentWave(plan, 8_000);
    const differentBytes = encodeSignalSynthIdentWave(
      buildSignalSynthIdentPlan({
        profile: profile("neutral", "show-a:host-a"),
        seed: "show-a:host-b",
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
    assert.equal(view.getUint32(40, true), bytes.byteLength - 44);
    assert.equal(bytes.byteLength, 44 + SIGNAL_SYNTH_IDENT_DURATION_MS * 16);
    assert.ok(bytes.byteLength > 44);
    assert.deepEqual(new Uint8Array(bytes), new Uint8Array(sameBytes));
    assert.notDeepEqual(new Uint8Array(bytes), new Uint8Array(differentBytes));
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
