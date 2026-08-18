/**
 * Procedural café-table foley and murmur ambience for Coffee Mode.
 *
 * The scheduling core is pure and string-seeded so a given table produces an
 * identical cue stream in tests and across sessions; WebAudio synthesis stays
 * behind a thin play seam. No audio assets and no fetches — every cue is
 * synthesized locally and routed through {@link prismAudioOutputNode} so
 * faithful audio masters and the shared master volume hear the same room.
 * Scheduling uses AudioContext currentTime and setTimeout only — no
 * frame-driven or per-frame work; Coffee's 60fps budget stays untouched.
 */

import {
  prismAudioContext,
  prismAudioOutputNode,
} from "./replayAudioMasterCapture.ts";

export type CoffeeFoleyTableEvent =
  | "turnStart"
  | "turnEnd"
  | "sip"
  | "arrival"
  | "departure"
  | "crosstalk"
  | "playerTyping"
  | "idleLullTick";

export type CoffeeFoleyCueKind =
  | "cup_clink"
  | "ceramic_set_down"
  | "chair_shift"
  | "cloth_rustle"
  | "spoon_stir"
  | "saucer_slide"
  | "murmur_swell";

export interface CoffeeFoleyCueDecision {
  kind: CoffeeFoleyCueKind;
  /** Offset from the event's nowMs to the audible start. */
  delayMs: number;
  /** Pre-duck linear gain, jitter already applied. */
  gain: number;
  durationMs: number;
}

export interface CoffeeFoleySchedulerState {
  rngCursor: number;
  lastOneShotFiredAtMs: number | null;
  /** Unit sample drawn at the previous fire; fixes the next sparse interval. */
  oneShotIntervalUnit: number;
  oneShotBusyUntilMs: number;
  lastMurmurFiredAtMs: number | null;
  murmurIntervalUnit: number;
  murmurBusyUntilMs: number;
  speechOnsetAtMs: number | null;
  lastActivityAtMs: number | null;
}

/** No cue may land inside the first beat of a bot's speech onset. */
export const COFFEE_FOLEY_SPEECH_ONSET_GUARD_MS = 300;
export const COFFEE_FOLEY_MIN_ACTIVE_INTERVAL_MS = 6_000;
export const COFFEE_FOLEY_MAX_ACTIVE_INTERVAL_MS = 20_000;
export const COFFEE_FOLEY_MIN_IDLE_INTERVAL_MS = 14_000;
export const COFFEE_FOLEY_MAX_IDLE_INTERVAL_MS = 32_000;
/** Murmur swells surface only after the table has been quiet this long. */
export const COFFEE_FOLEY_MURMUR_MIN_IDLE_GAP_MS = 9_000;
export const COFFEE_FOLEY_MURMUR_MIN_INTERVAL_MS = 18_000;
export const COFFEE_FOLEY_MURMUR_MAX_INTERVAL_MS = 36_000;
export const COFFEE_FOLEY_MURMUR_BASE_DURATION_MS = 3_200;
export const COFFEE_FOLEY_MURMUR_DURATION_JITTER_MS = 1_200;
export const COFFEE_FOLEY_MURMUR_MAX_DELAY_MS = 400;
/** Dip applied to the whole foley bus while any voice line plays. */
export const COFFEE_FOLEY_SPEECH_DUCK_DB = -8;
/** Felt, not noticed — callers may tie this to the atmosphere volume. */
export const COFFEE_FOLEY_DEFAULT_MASTER_GAIN = 0.55;

export interface CoffeeFoleyEventPolicy {
  kinds: readonly CoffeeFoleyCueKind[];
  probability: number;
  delayMsRange: readonly [number, number];
}

export const COFFEE_FOLEY_CUE_POLICY = {
  turnStart: {
    kinds: ["cup_clink", "cloth_rustle"],
    probability: 0.35,
    delayMsRange: [450, 1_400],
  },
  turnEnd: {
    kinds: ["ceramic_set_down", "saucer_slide", "spoon_stir"],
    probability: 0.55,
    delayMsRange: [250, 900],
  },
  sip: {
    kinds: ["ceramic_set_down", "cup_clink"],
    probability: 0.7,
    delayMsRange: [350, 850],
  },
  arrival: {
    kinds: ["chair_shift"],
    probability: 1,
    delayMsRange: [150, 600],
  },
  departure: {
    kinds: ["chair_shift", "cloth_rustle"],
    probability: 1,
    delayMsRange: [200, 700],
  },
  crosstalk: {
    kinds: ["cloth_rustle", "cup_clink"],
    probability: 0.25,
    delayMsRange: [300, 1_100],
  },
  playerTyping: {
    kinds: ["cloth_rustle"],
    probability: 0.15,
    delayMsRange: [400, 1_600],
  },
} as const satisfies Record<
  Exclude<CoffeeFoleyTableEvent, "idleLullTick">,
  CoffeeFoleyEventPolicy
>;

/** Background patrons keep faint life during lulls without crowding the table. */
export const COFFEE_FOLEY_IDLE_CUE_POLICY = {
  kinds: ["cup_clink", "ceramic_set_down", "chair_shift"],
  probability: 0.3,
  delayMsRange: [200, 1_200],
} as const satisfies CoffeeFoleyEventPolicy;

export const COFFEE_FOLEY_CUE_GAIN = {
  cup_clink: 0.1,
  ceramic_set_down: 0.12,
  chair_shift: 0.09,
  cloth_rustle: 0.06,
  spoon_stir: 0.08,
  saucer_slide: 0.07,
  murmur_swell: 0.05,
} as const satisfies Record<CoffeeFoleyCueKind, number>;

export const COFFEE_FOLEY_CUE_DURATION_MS = {
  cup_clink: 140,
  ceramic_set_down: 200,
  chair_shift: 280,
  cloth_rustle: 220,
  spoon_stir: 320,
  saucer_slide: 300,
  murmur_swell: COFFEE_FOLEY_MURMUR_BASE_DURATION_MS,
} as const satisfies Record<CoffeeFoleyCueKind, number>;

function coffeeFoleyHash(value: string): number {
  let hash = 2166136261;
  for (let offset = 0; offset < value.length; offset += 1) {
    hash ^= value.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Seed-stable unit sample in [0, 1]; index selects the stream position. The
 * fnv hash alone correlates across neighboring indices, so an avalanche
 * finalizer decorrelates the stream before it gates probabilities.
 */
export function coffeeFoleyUnit(seed: string, index: number): number {
  let hash = coffeeFoleyHash(`${seed}:${index}`);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffffffff;
}

export function createCoffeeFoleySchedulerState(
  seed: string,
): CoffeeFoleySchedulerState {
  return {
    rngCursor: 2,
    lastOneShotFiredAtMs: null,
    oneShotIntervalUnit: coffeeFoleyUnit(seed, 0),
    oneShotBusyUntilMs: 0,
    lastMurmurFiredAtMs: null,
    murmurIntervalUnit: coffeeFoleyUnit(seed, 1),
    murmurBusyUntilMs: 0,
    speechOnsetAtMs: null,
    lastActivityAtMs: null,
  };
}

/** Foley and murmur dip while any voice line plays; restored when it ends. */
export function coffeeFoleyDuckedGain(
  gain: number,
  foregroundSpeechActive: boolean,
): number {
  const base = Math.max(0, Number.isFinite(gain) ? gain : 0);
  if (!foregroundSpeechActive) return base;
  return base * 10 ** (COFFEE_FOLEY_SPEECH_DUCK_DB / 20);
}

function coffeeFoleyLerp(
  range: readonly [number, number],
  unit: number,
): number {
  return range[0] + (range[1] - range[0]) * unit;
}

/**
 * Pure scheduling core. One table event in, at most one cue decision out.
 * Density gates: a one-shot roughly every 6–20s while the table is active,
 * every 14–32s during lulls; murmur swells only after a longer idle gap and
 * never overlapping. A cue never lands inside the speech-onset guard, and at
 * most one foley one-shot is audible at any instant.
 */
export function coffeeFoleyCueForEvent(args: {
  event: CoffeeFoleyTableEvent;
  nowMs: number;
  seed: string;
  state: CoffeeFoleySchedulerState;
}): { cue: CoffeeFoleyCueDecision | null; state: CoffeeFoleySchedulerState } {
  const { event, nowMs, seed } = args;
  const state: CoffeeFoleySchedulerState = { ...args.state };
  let cursor = state.rngCursor;
  const nextUnit = (): number => coffeeFoleyUnit(seed, cursor++);
  const finish = (
    cue: CoffeeFoleyCueDecision | null,
  ): { cue: CoffeeFoleyCueDecision | null; state: CoffeeFoleySchedulerState } => {
    state.rngCursor = cursor;
    return { cue, state };
  };

  const idleGapMs =
    state.lastActivityAtMs === null
      ? Number.POSITIVE_INFINITY
      : nowMs - state.lastActivityAtMs;
  if (event === "turnStart") state.speechOnsetAtMs = nowMs;
  if (event !== "idleLullTick") state.lastActivityAtMs = nowMs;

  const guardDelay = (delayMs: number): number => {
    if (state.speechOnsetAtMs === null) return delayMs;
    const guardEndsAtMs =
      state.speechOnsetAtMs + COFFEE_FOLEY_SPEECH_ONSET_GUARD_MS;
    return nowMs + delayMs < guardEndsAtMs ? guardEndsAtMs - nowMs : delayMs;
  };

  if (
    event === "idleLullTick" &&
    idleGapMs >= COFFEE_FOLEY_MURMUR_MIN_IDLE_GAP_MS
  ) {
    const eligibleAtMs =
      state.lastMurmurFiredAtMs === null
        ? 0
        : state.lastMurmurFiredAtMs +
          coffeeFoleyLerp(
            [
              COFFEE_FOLEY_MURMUR_MIN_INTERVAL_MS,
              COFFEE_FOLEY_MURMUR_MAX_INTERVAL_MS,
            ],
            state.murmurIntervalUnit,
          );
    if (nowMs >= eligibleAtMs && nowMs >= state.murmurBusyUntilMs) {
      const delayMs = guardDelay(
        Math.round(nextUnit() * COFFEE_FOLEY_MURMUR_MAX_DELAY_MS),
      );
      const durationMs = Math.round(
        COFFEE_FOLEY_MURMUR_BASE_DURATION_MS +
          nextUnit() * COFFEE_FOLEY_MURMUR_DURATION_JITTER_MS,
      );
      const gain = COFFEE_FOLEY_CUE_GAIN.murmur_swell * (0.8 + nextUnit() * 0.4);
      state.lastMurmurFiredAtMs = nowMs + delayMs;
      state.murmurIntervalUnit = nextUnit();
      state.murmurBusyUntilMs = nowMs + delayMs + durationMs;
      return finish({ kind: "murmur_swell", delayMs, gain, durationMs });
    }
  }

  const policy =
    event === "idleLullTick"
      ? COFFEE_FOLEY_IDLE_CUE_POLICY
      : COFFEE_FOLEY_CUE_POLICY[event];
  const intervalRange: readonly [number, number] =
    event === "idleLullTick"
      ? [COFFEE_FOLEY_MIN_IDLE_INTERVAL_MS, COFFEE_FOLEY_MAX_IDLE_INTERVAL_MS]
      : [
          COFFEE_FOLEY_MIN_ACTIVE_INTERVAL_MS,
          COFFEE_FOLEY_MAX_ACTIVE_INTERVAL_MS,
        ];
  const eligibleAtMs =
    state.lastOneShotFiredAtMs === null
      ? 0
      : state.lastOneShotFiredAtMs +
        coffeeFoleyLerp(intervalRange, state.oneShotIntervalUnit);
  if (nowMs < eligibleAtMs) return finish(null);
  if (nextUnit() >= policy.probability) return finish(null);
  const kind =
    policy.kinds[
      Math.floor(nextUnit() * policy.kinds.length) % policy.kinds.length
    ]!;
  const delayMs = guardDelay(
    Math.round(coffeeFoleyLerp(policy.delayMsRange, nextUnit())),
  );
  const fireAtMs = nowMs + delayMs;
  // Hard cap: at most one foley one-shot audible at any instant.
  if (fireAtMs < state.oneShotBusyUntilMs) return finish(null);
  const durationMs = COFFEE_FOLEY_CUE_DURATION_MS[kind];
  const gain = COFFEE_FOLEY_CUE_GAIN[kind] * (0.8 + nextUnit() * 0.4);
  state.lastOneShotFiredAtMs = fireAtMs;
  state.oneShotIntervalUnit = nextUnit();
  state.oneShotBusyUntilMs = fireAtMs + durationMs;
  return finish({ kind, delayMs, gain, durationMs });
}

export interface CoffeeFoleyCuePlayback {
  kind: CoffeeFoleyCueKind;
  gain: number;
  durationMs: number;
  /** Deterministic noise seed for this cue instance. */
  noiseSeed: number;
}

export interface CoffeeFoleyEngine {
  handleTableEvent(event: CoffeeFoleyTableEvent): void;
  /** Dips foley/murmur by {@link COFFEE_FOLEY_SPEECH_DUCK_DB} while active. */
  setForegroundSpeechActive(active: boolean): void;
  setMasterGain(gain: number): void;
  dispose(): void;
}

const COFFEE_FOLEY_GAIN_RAMP_SECONDS = 0.06;
const COFFEE_FOLEY_CUE_CLEANUP_SLACK_MS = 160;

interface CoffeeFoleyBus {
  context: AudioContext;
  duck: GainNode;
  master: GainNode;
}

function coffeeFoleyNowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function clampCoffeeFoleyGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Live foley engine. Feed table events; the seeded core decides cues and the
 * WebAudio layer voices them on the shared PRISM output. SSR- and node-safe:
 * without an AudioContext every cue is a silent no-op.
 */
export function createCoffeeFoleyEngine(options: {
  seed: string;
  masterGain?: number;
  /** Test seam — replaces WebAudio synthesis; scheduling stays identical. */
  playCue?: (cue: CoffeeFoleyCuePlayback) => void;
  now?: () => number;
}): CoffeeFoleyEngine {
  const seed = options.seed;
  const now = options.now ?? coffeeFoleyNowMs;
  let state = createCoffeeFoleySchedulerState(seed);
  let masterGainValue = clampCoffeeFoleyGain(
    options.masterGain ?? COFFEE_FOLEY_DEFAULT_MASTER_GAIN,
  );
  let speechActive = false;
  let cueSerial = 0;
  let disposed = false;
  let bus: CoffeeFoleyBus | null = null;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const ensureBus = (): CoffeeFoleyBus | null => {
    if (bus && bus.context.state !== "closed") return bus;
    const context = prismAudioContext();
    if (!context) return null;
    const master = context.createGain();
    master.gain.value = masterGainValue;
    const duck = context.createGain();
    duck.gain.value = coffeeFoleyDuckedGain(1, speechActive);
    duck.connect(master);
    master.connect(prismAudioOutputNode(context));
    bus = { context, duck, master };
    return bus;
  };

  const schedule = (delayMs: number, run: () => void): void => {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (!disposed) run();
    }, Math.max(0, Math.round(delayMs)));
    pendingTimers.add(timer);
  };

  const play = (cue: CoffeeFoleyCuePlayback): void => {
    if (options.playCue) {
      options.playCue(cue);
      return;
    }
    const activeBus = ensureBus();
    if (!activeBus) return;
    if (activeBus.context.state === "suspended") {
      void activeBus.context.resume().catch(() => undefined);
    }
    const cleanup = synthesizeCoffeeFoleyCue(
      activeBus.context,
      activeBus.duck,
      cue,
    );
    if (cleanup) {
      schedule(cue.durationMs + COFFEE_FOLEY_CUE_CLEANUP_SLACK_MS, cleanup);
    }
  };

  return {
    handleTableEvent(event) {
      if (disposed) return;
      const result = coffeeFoleyCueForEvent({ event, nowMs: now(), seed, state });
      state = result.state;
      const cue = result.cue;
      if (!cue) return;
      const noiseSeed = coffeeFoleyHash(`${seed}:cue:${cueSerial++}`);
      schedule(cue.delayMs, () =>
        play({
          kind: cue.kind,
          gain: cue.gain,
          durationMs: cue.durationMs,
          noiseSeed,
        }),
      );
    },
    setForegroundSpeechActive(active) {
      speechActive = active === true;
      if (!bus) return;
      const at = bus.context.currentTime;
      bus.duck.gain.cancelScheduledValues(at);
      bus.duck.gain.setTargetAtTime(
        coffeeFoleyDuckedGain(1, speechActive),
        at,
        COFFEE_FOLEY_GAIN_RAMP_SECONDS,
      );
    },
    setMasterGain(gain) {
      masterGainValue = clampCoffeeFoleyGain(gain);
      if (!bus) return;
      const at = bus.context.currentTime;
      bus.master.gain.cancelScheduledValues(at);
      bus.master.gain.setTargetAtTime(
        masterGainValue,
        at,
        COFFEE_FOLEY_GAIN_RAMP_SECONDS,
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const timer of pendingTimers) clearTimeout(timer);
      pendingTimers.clear();
      if (bus) {
        try {
          bus.duck.disconnect();
          bus.master.disconnect();
        } catch {
          // The shared context already released these nodes.
        }
        bus = null;
      }
    },
  };
}

function coffeeFoleyNoiseBuffer(
  context: AudioContext,
  durationSeconds: number,
  noiseSeed: number,
): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    Math.max(1, Math.ceil(context.sampleRate * durationSeconds)),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let noiseState = (0x9e3779b9 ^ noiseSeed) >>> 0;
  for (let index = 0; index < samples.length; index += 1) {
    noiseState = (Math.imul(noiseState, 1_664_525) + 1_013_904_223) >>> 0;
    samples[index] = (noiseState / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

/** Short sine/triangle partial with a fast ceramic-style decay. */
function startFoleyPartial(
  context: AudioContext,
  destination: AudioNode,
  options: {
    type: OscillatorType;
    frequency: number;
    peak: number;
    startAt: number;
    decaySeconds: number;
  },
): void {
  const peak = Math.max(0.000_2, options.peak);
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = options.type;
  oscillator.frequency.value = options.frequency;
  envelope.gain.setValueAtTime(0, options.startAt);
  envelope.gain.linearRampToValueAtTime(peak, options.startAt + 0.004);
  envelope.gain.exponentialRampToValueAtTime(
    0.000_1,
    options.startAt + options.decaySeconds,
  );
  envelope.gain.linearRampToValueAtTime(
    0,
    options.startAt + options.decaySeconds + 0.01,
  );
  oscillator.connect(envelope);
  envelope.connect(destination);
  oscillator.start(options.startAt);
  oscillator.stop(options.startAt + options.decaySeconds + 0.02);
}

interface FoleyNoiseFilterConfig {
  type: BiquadFilterType;
  frequency: number;
  Q: number;
  frequencyRampTo?: number;
}

/** Seeded noise burst through biquad filters with a linear envelope. */
function startFoleyNoise(
  context: AudioContext,
  destination: AudioNode,
  options: {
    noiseSeed: number;
    startAt: number;
    durationSeconds: number;
    peak: number;
    attackSeconds: number;
    filters: readonly FoleyNoiseFilterConfig[];
  },
): void {
  const source = context.createBufferSource();
  source.buffer = coffeeFoleyNoiseBuffer(
    context,
    options.durationSeconds,
    options.noiseSeed,
  );
  const envelope = context.createGain();
  const endAt = options.startAt + options.durationSeconds;
  const attackEndsAt = Math.min(
    endAt - 0.01,
    options.startAt + Math.max(0.005, options.attackSeconds),
  );
  envelope.gain.setValueAtTime(0, options.startAt);
  envelope.gain.linearRampToValueAtTime(
    Math.max(0.000_2, options.peak),
    attackEndsAt,
  );
  envelope.gain.linearRampToValueAtTime(0, endAt);
  let head: AudioNode = source;
  for (const config of options.filters) {
    const filter = context.createBiquadFilter();
    filter.type = config.type;
    filter.frequency.value = config.frequency;
    filter.Q.value = config.Q;
    if (config.frequencyRampTo !== undefined) {
      filter.frequency.setValueAtTime(config.frequency, options.startAt);
      filter.frequency.linearRampToValueAtTime(config.frequencyRampTo, endAt);
    }
    head.connect(filter);
    head = filter;
  }
  head.connect(envelope);
  envelope.connect(destination);
  source.start(options.startAt);
  source.stop(endAt + 0.02);
}

/**
 * Voices one decided cue at context.currentTime. Returns a cleanup that
 * releases the cue's subgraph after its scheduled tail.
 */
function synthesizeCoffeeFoleyCue(
  context: AudioContext,
  destination: AudioNode,
  cue: CoffeeFoleyCuePlayback,
): (() => void) | null {
  const startAt = context.currentTime;
  const durationSeconds = cue.durationMs / 1_000;
  const output = context.createGain();
  output.gain.value = 1;
  const detune = 0.97 + ((cue.noiseSeed % 1_000) / 1_000) * 0.06;
  try {
    output.connect(destination);
    switch (cue.kind) {
      case "cup_clink":
        startFoleyPartial(context, output, {
          type: "sine",
          frequency: 2_480 * detune,
          peak: cue.gain,
          startAt,
          decaySeconds: 0.09,
        });
        startFoleyPartial(context, output, {
          type: "sine",
          frequency: 3_620 * detune,
          peak: cue.gain * 0.55,
          startAt,
          decaySeconds: 0.07,
        });
        startFoleyPartial(context, output, {
          type: "sine",
          frequency: 5_160 * detune,
          peak: cue.gain * 0.3,
          startAt,
          decaySeconds: 0.05,
        });
        break;
      case "ceramic_set_down":
        startFoleyPartial(context, output, {
          type: "triangle",
          frequency: 165 * detune,
          peak: cue.gain,
          startAt,
          decaySeconds: 0.09,
        });
        startFoleyPartial(context, output, {
          type: "sine",
          frequency: 2_740 * detune,
          peak: cue.gain * 0.3,
          startAt: startAt + 0.008,
          decaySeconds: 0.05,
        });
        break;
      case "spoon_stir":
        for (let ting = 0; ting < 3; ting += 1) {
          startFoleyPartial(context, output, {
            type: "triangle",
            frequency: (3_560 + ting * 140) * detune,
            peak: cue.gain * (ting === 1 ? 0.7 : 1),
            startAt: startAt + ting * 0.11,
            decaySeconds: 0.045,
          });
        }
        break;
      case "chair_shift":
        startFoleyNoise(context, output, {
          noiseSeed: cue.noiseSeed,
          startAt,
          durationSeconds,
          peak: cue.gain,
          attackSeconds: 0.03,
          filters: [{ type: "lowpass", frequency: 420, Q: 0.7 }],
        });
        break;
      case "cloth_rustle":
        startFoleyNoise(context, output, {
          noiseSeed: cue.noiseSeed,
          startAt,
          durationSeconds,
          peak: cue.gain,
          attackSeconds: 0.04,
          filters: [{ type: "bandpass", frequency: 1_600, Q: 0.8 }],
        });
        break;
      case "saucer_slide":
        startFoleyNoise(context, output, {
          noiseSeed: cue.noiseSeed,
          startAt,
          durationSeconds,
          peak: cue.gain,
          attackSeconds: 0.05,
          filters: [
            { type: "bandpass", frequency: 700, Q: 1.1, frequencyRampTo: 1_500 },
          ],
        });
        break;
      case "murmur_swell":
        startFoleyNoise(context, output, {
          noiseSeed: cue.noiseSeed,
          startAt,
          durationSeconds,
          peak: cue.gain,
          attackSeconds: durationSeconds * 0.45,
          filters: [
            { type: "bandpass", frequency: 460, Q: 0.6 },
            { type: "lowpass", frequency: 1_200, Q: 0.4 },
          ],
        });
        break;
    }
  } catch {
    try {
      output.disconnect();
    } catch {
      // The shared context already released the node.
    }
    return null;
  }
  return () => {
    try {
      output.disconnect();
    } catch {
      // The shared context already released the node.
    }
  };
}
