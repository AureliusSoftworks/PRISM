import {
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
  BOTCAST_STUDIO_ATMOSPHERE_MIX_RELATIVE_MAX,
  type BotcastStudioAtmosphereMix,
} from "@localai/shared";
import {
  connectRoomAcoustics,
  type RoomAcousticsSend,
} from "./roomAcoustics.ts";
import {
  prismAudioContext,
  prismAudioOutputNode,
  prismLocalOnlyAudioOutputNode,
  replayAudioMasterCaptureActive,
} from "./replayAudioMasterCapture.ts";
import {
  decodeLiveVoicePcm,
  type LiveVoicePcm,
} from "./liveVoiceDecode.ts";
import { audioContextNeedsResume } from "./audioContextRecovery.ts";

export const DEFAULT_STUDIO_ATMOSPHERE_URL =
  "/audio/session-atmosphere/default-studio-room-loop.mp3";

export type SessionAtmosphereMix = Pick<
  BotcastStudioAtmosphereMix,
  "background" | "grain" | "foley"
>;

export type SessionAtmosphereBackgroundTone = "neutral" | "warm-low";

export const DEFAULT_SESSION_ATMOSPHERE_MIX: Readonly<SessionAtmosphereMix> = {
  background: 0.1,
  grain: 0.04,
  foley: 0.16,
};

export const DEFAULT_SIGNAL_ATMOSPHERE_MIX =
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX;

export const SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX =
  BOTCAST_STUDIO_ATMOSPHERE_MIX_RELATIVE_MAX;
export const SIGNAL_ATMOSPHERE_RELATIVE_MIX_STEP = 0.05;

export interface SessionAmbientFoleyProfile {
  minDelayMs: number;
  maxDelayMs: number;
  trim: number;
}

export const DEFAULT_SESSION_AMBIENT_FOLEY_PROFILE = {
  minDelayMs: 18_000,
  maxDelayMs: 42_000,
  trim: 1,
} as const satisfies SessionAmbientFoleyProfile;

export type SessionAmbientBotVocalizationKind =
  "throat-clear" | "mouth-sound" | "lip-smack" | "soft-sigh" | "soft-inhale";

export interface SessionAmbientBotVocalizationCue {
  kind: SessionAmbientBotVocalizationKind;
  url: string;
  durationMs: number;
  index: number;
  sequenceKey: string;
}

export const DEFAULT_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE = {
  minDelayMs: 34_000,
  maxDelayMs: 76_000,
  trim: 1,
} as const satisfies SessionAmbientFoleyProfile;

export const SIGNAL_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE = {
  ...DEFAULT_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE,
  trim: 0.32,
} as const satisfies SessionAmbientFoleyProfile;

export function signalSessionAtmosphereActive(args: {
  audioEnabled: boolean;
  hasSelectedShow: boolean;
  preRollActive: boolean;
  episodePresent: boolean;
  replayPlaying: boolean;
  studioLayoutEditorOpen: boolean;
}): boolean {
  return Boolean(
    args.audioEnabled &&
    args.hasSelectedShow &&
    !args.preRollActive &&
    (args.episodePresent || args.replayPlaying || args.studioLayoutEditorOpen),
  );
}

/**
 * Provider ambience can be tens of decibels quieter than the bundled loops.
 * A strong preamp feeding a hard compressor brings both into the same safe
 * room-tone envelope before the ordinary per-bus mix is applied.
 */
export const SESSION_ATMOSPHERE_LOOP_PRE_GAIN = 50;
export const SESSION_ATMOSPHERE_LOOP_COMPRESSOR = {
  threshold: -35,
  knee: 0,
  ratio: 20,
  attack: 0.003,
  release: 0.25,
} as const;
export const SESSION_ATMOSPHERE_BACKGROUND_TONE = {
  lowShelfFrequencyHz: 180,
  lowShelfGainDb: 3,
  highShelfFrequencyHz: 1_600,
  highShelfGainDb: -12,
} as const;
export const SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS = 1;
export const SESSION_ATMOSPHERE_LOOP_CROSSFADE_SECONDS = 0.75;

type SessionAtmosphereBus = keyof SessionAtmosphereMix;

const GENERAL_FOLEY_URLS = [
  "/audio/session-atmosphere/clothing-shuffle.mp3",
  "/audio/session-atmosphere/soft-foot-tap.mp3",
] as const;

const AMBIENT_BOT_VOCALIZATIONS = [
  {
    kind: "throat-clear",
    url: "/audio/session-atmosphere/throat-clear.mp3",
    durationMs: 1_228,
  },
  {
    kind: "mouth-sound",
    url: "/audio/session-atmosphere/faint-swallow.mp3",
    durationMs: 914,
  },
  {
    kind: "lip-smack",
    url: "/audio/session-atmosphere/lip-smack-01.mp3",
    durationMs: 731,
  },
  {
    kind: "soft-sigh",
    url: "/audio/session-atmosphere/soft-sigh-01.mp3",
    durationMs: 1_228,
  },
  {
    kind: "soft-inhale",
    url: "/audio/voice-presence/breath-deliberate-02-v2.mp3",
    durationMs: 920,
  },
] as const satisfies readonly Omit<
  SessionAmbientBotVocalizationCue,
  "index" | "sequenceKey"
>[];

export const SESSION_FOLEY_URLS = {
  coffeeSip: "/audio/session-atmosphere/coffee-sip.mp3",
  coffeeCupPlace: "/audio/session-atmosphere/coffee-cup-place.mp3",
} as const;

export type SessionAtmosphereCue = keyof typeof SESSION_FOLEY_URLS;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(seed: string): number {
  return stableHash(seed) / 0xffffffff;
}

export function sessionAmbientFoleyDelayMs(
  seed: string,
  index: number,
  profile: SessionAmbientFoleyProfile = DEFAULT_SESSION_AMBIENT_FOLEY_PROFILE,
): number {
  const minDelayMs = Math.max(1_000, Math.round(profile.minDelayMs));
  const maxDelayMs = Math.max(minDelayMs, Math.round(profile.maxDelayMs));
  return Math.round(
    minDelayMs +
      stableUnit(`${seed}:delay:${index}`) * (maxDelayMs - minDelayMs),
  );
}

export function sessionAmbientFoleyUrl(seed: string, index: number): string {
  return sessionAmbientFoleyUrlFrom(seed, index, GENERAL_FOLEY_URLS);
}

export function sessionAmbientFoleyUrlFrom(
  seed: string,
  index: number,
  urls: readonly string[],
): string {
  const eligible = urls.filter((url) => url.trim().length > 0);
  const candidates = eligible.length > 0 ? eligible : [...GENERAL_FOLEY_URLS];
  return candidates[stableHash(`${seed}:foley:${index}`) % candidates.length]!;
}

export function sessionAmbientBotVocalizationDelayMs(
  seed: string,
  index: number,
  profile: SessionAmbientFoleyProfile = DEFAULT_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE,
): number {
  return sessionAmbientFoleyDelayMs(`${seed}:bot-vocalization`, index, profile);
}

export function sessionAmbientBotVocalizationCue(
  seed: string,
  index: number,
): SessionAmbientBotVocalizationCue {
  const cue =
    AMBIENT_BOT_VOCALIZATIONS[
      stableHash(`${seed}:bot-vocalization:cue:${index}`) %
        AMBIENT_BOT_VOCALIZATIONS.length
    ]!;
  return sessionAmbientBotVocalizationCueForKind(seed, index, cue.kind);
}

export function sessionAmbientBotVocalizationCueForKind(
  seed: string,
  index: number,
  kind: SessionAmbientBotVocalizationKind,
): SessionAmbientBotVocalizationCue {
  const cue = AMBIENT_BOT_VOCALIZATIONS.find(
    (candidate) => candidate.kind === kind,
  );
  if (!cue) {
    throw new Error(`Unknown ambient bot vocalization kind: ${kind}`);
  }
  return {
    ...cue,
    index,
    sequenceKey: `${seed}:bot-vocalization:${index}:${cue.kind}`,
  };
}

export function sessionAmbientBotVocalizationTargetId(
  seed: string,
  index: number,
  candidateIds: readonly string[],
): string | null {
  const eligible = candidateIds.filter((id) => id.trim().length > 0);
  if (eligible.length === 0) return null;
  return eligible[
    stableHash(`${seed}:bot-vocalization:target:${index}`) % eligible.length
  ]!;
}

export interface SessionAtmosphereController {
  playCue(cue: SessionAtmosphereCue): void;
  preloadFoley(urls: readonly string[]): void;
  playFoley(
    url: string,
    options?: SessionAtmosphereFoleyPlaybackOptions,
  ): boolean;
  stopFoley(tag: string, fadeMs?: number): void;
  setMix(args: {
    volume: number;
    mix?: SessionAtmosphereMix;
    transitionMs?: number;
  }): void;
  /**
   * Soft-pause living presentation without tearing down loops. Ducks volume to
   * zero and defers ambient foley / bot vocalizations until resumed.
   */
  setPresentationSuspended(suspended: boolean, transitionMs?: number): void;
  stop(fadeMs?: number): void;
}

export interface SessionAtmosphereFoleyPlaybackOptions {
  trim?: number;
  playbackRate?: number;
  lowCutHz?: number;
  highCutHz?: number;
  stereoPan?: number;
  tag?: string;
}

interface SessionAtmosphereSourceLeveler {
  busGain: GainNode;
  disconnect(preserveRoomTail?: boolean): void;
}

interface SessionAtmosphereActiveSource {
  bus: SessionAtmosphereBus;
  trim: number;
  leveler: SessionAtmosphereSourceLeveler | null;
  tag?: string;
}

interface SessionAtmosphereActiveLoop extends SessionAtmosphereActiveSource {
  source: AudioBufferSourceNode;
  leveler: SessionAtmosphereSourceLeveler;
}

interface SessionAtmosphereActiveBufferSource
  extends SessionAtmosphereActiveSource {
  source: AudioBufferSourceNode;
  leveler: SessionAtmosphereSourceLeveler;
  released: boolean;
}

let sessionAtmosphereAudioContext: AudioContext | null = null;
const livePerformanceAudioPcmCache = new Map<
  string,
  Promise<LiveVoicePcm | null>
>();

function livePerformanceAudioPcm(url: string): Promise<LiveVoicePcm | null> {
  const normalizedUrl = url.trim();
  const cached = livePerformanceAudioPcmCache.get(normalizedUrl);
  if (cached) return cached;
  const pending =
    typeof fetch === "function"
      ? fetch(normalizedUrl, { cache: "force-cache", credentials: "include" })
          .then((response) =>
            response.ok ? response.arrayBuffer() : Promise.resolve(null),
          )
          .then((bytes) => (bytes ? decodeLiveVoicePcm(bytes) : null))
          .catch(() => null)
      : Promise.resolve(null);
  livePerformanceAudioPcmCache.set(normalizedUrl, pending);
  return pending;
}

function sessionAtmosphereContext(): AudioContext | null {
  if (
    !sessionAtmosphereAudioContext ||
    sessionAtmosphereAudioContext.state === "closed"
  ) {
    sessionAtmosphereAudioContext = prismAudioContext();
  }
  const context = sessionAtmosphereAudioContext;
  if (!context) return null;
  if (audioContextNeedsResume(context)) {
    void context.resume().catch(() => undefined);
  }
  return context;
}

function levelSessionAtmosphereNode(
  context: AudioContext,
  source: AudioNode,
  normalizeLoop: boolean,
  bus: SessionAtmosphereBus,
  backgroundTone: SessionAtmosphereBackgroundTone,
  roomAcoustics?: RoomAcousticsSend,
  oneShotOptions?: Pick<
    SessionAtmosphereFoleyPlaybackOptions,
    "lowCutHz" | "highCutHz" | "stereoPan"
  >,
  outputDestination: AudioNode = prismAudioOutputNode(context),
): SessionAtmosphereSourceLeveler {
  if (!normalizeLoop) {
    const busGain = context.createGain();
    const toneNodes: AudioNode[] = [];
    let toneOutput = source;
    if ((oneShotOptions?.lowCutHz ?? 0) > 0) {
      const lowCut = context.createBiquadFilter();
      lowCut.type = "highpass";
      lowCut.frequency.value = Math.max(20, oneShotOptions!.lowCutHz!);
      lowCut.Q.value = 0.7;
      toneOutput.connect(lowCut);
      toneOutput = lowCut;
      toneNodes.push(lowCut);
    }
    if ((oneShotOptions?.highCutHz ?? 0) > 0) {
      const highCut = context.createBiquadFilter();
      highCut.type = "lowpass";
      highCut.frequency.value = Math.max(
        (oneShotOptions?.lowCutHz ?? 20) + 100,
        oneShotOptions!.highCutHz!,
      );
      highCut.Q.value = 0.7;
      toneOutput.connect(highCut);
      toneOutput = highCut;
      toneNodes.push(highCut);
    }
    toneOutput.connect(busGain);
    const roomConnection = connectRoomAcoustics({
      context,
      input: busGain,
      destination: outputDestination,
      send: bus === "foley" ? roomAcoustics : null,
      stereoPan: oneShotOptions?.stereoPan,
    });
    return {
      busGain,
      disconnect(preserveRoomTail = false) {
        source.disconnect();
        for (const node of toneNodes) node.disconnect();
        if (preserveRoomTail) roomConnection.release();
        else roomConnection.disconnect();
      },
    };
  }
  const preGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const busGain = context.createGain();
  preGain.gain.value = SESSION_ATMOSPHERE_LOOP_PRE_GAIN;
  compressor.threshold.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.threshold;
  compressor.knee.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.knee;
  compressor.ratio.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.ratio;
  compressor.attack.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.attack;
  compressor.release.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.release;
  source.connect(preGain);
  preGain.connect(compressor);
  if (bus === "background" && backgroundTone === "warm-low") {
    const lowShelf = context.createBiquadFilter();
    const highShelf = context.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value =
      SESSION_ATMOSPHERE_BACKGROUND_TONE.lowShelfFrequencyHz;
    lowShelf.gain.value = SESSION_ATMOSPHERE_BACKGROUND_TONE.lowShelfGainDb;
    highShelf.type = "highshelf";
    highShelf.frequency.value =
      SESSION_ATMOSPHERE_BACKGROUND_TONE.highShelfFrequencyHz;
    highShelf.gain.value = SESSION_ATMOSPHERE_BACKGROUND_TONE.highShelfGainDb;
    compressor.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(busGain);
    const roomConnection = connectRoomAcoustics({
      context,
      input: busGain,
      destination: outputDestination,
      send: bus === "background" ? roomAcoustics : null,
    });
    return {
      busGain,
      disconnect() {
        source.disconnect();
        preGain.disconnect();
        compressor.disconnect();
        lowShelf.disconnect();
        highShelf.disconnect();
        roomConnection.disconnect();
      },
    };
  }
  compressor.connect(busGain);
  const roomConnection = connectRoomAcoustics({
    context,
    input: busGain,
    destination: outputDestination,
    send: bus === "background" ? roomAcoustics : null,
  });
  return {
    busGain,
    disconnect() {
      source.disconnect();
      preGain.disconnect();
      compressor.disconnect();
      roomConnection.disconnect();
    },
  };
}

function sessionAtmosphereOutputDestination(
  context: AudioContext,
  bus: SessionAtmosphereBus,
  backgroundRecordable: boolean,
  grainRecordable: boolean,
): AudioNode {
  if (
    (bus === "background" && !backgroundRecordable) ||
    (bus === "grain" && !grainRecordable)
  ) {
    return prismLocalOnlyAudioOutputNode(context);
  }
  return prismAudioOutputNode(context);
}

export function sessionAtmosphereLoopIsRecordable(
  bus: "background" | "grain",
  options: { backgroundRecordable: boolean; grainRecordable: boolean },
): boolean {
  return bus === "background"
    ? options.backgroundRecordable
    : options.grainRecordable;
}

function levelSessionAtmosphereSource(
  audio: HTMLAudioElement,
  normalizeLoop: boolean,
  bus: SessionAtmosphereBus,
  backgroundTone: SessionAtmosphereBackgroundTone,
  roomAcoustics?: RoomAcousticsSend,
  oneShotOptions?: Pick<
    SessionAtmosphereFoleyPlaybackOptions,
    "lowCutHz" | "highCutHz" | "stereoPan"
  >,
  backgroundRecordable = true,
  grainRecordable = true,
): SessionAtmosphereSourceLeveler | null {
  const context = sessionAtmosphereContext();
  if (!context) return null;
  try {
    return levelSessionAtmosphereNode(
      context,
      context.createMediaElementSource(audio),
      normalizeLoop,
      bus,
      backgroundTone,
      roomAcoustics,
      oneShotOptions,
      sessionAtmosphereOutputDestination(
        context,
        bus,
        backgroundRecordable,
        grainRecordable,
      ),
    );
  } catch {
    // Keep ordinary HTMLAudio playback as a compatibility fallback.
    return null;
  }
}

function clampAudioLevel(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampAtmosphereMixLevel(value: number): number {
  return Math.max(
    0,
    Math.min(
      SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX,
      Number.isFinite(value) ? value : 0,
    ),
  );
}

export function signalAtmosphereRelativeMixLevel(
  bus: SessionAtmosphereBus,
  mix: SessionAtmosphereMix,
): number {
  return clampAtmosphereMixLevel(mix[bus] / DEFAULT_SIGNAL_ATMOSPHERE_MIX[bus]);
}

export function signalAtmosphereMixLevelFromRelative(
  bus: SessionAtmosphereBus,
  relativeLevel: number,
): number {
  return Number(
    (
      DEFAULT_SIGNAL_ATMOSPHERE_MIX[bus] *
      clampAtmosphereMixLevel(relativeLevel)
    ).toFixed(6),
  );
}

export function sessionAtmosphereLoopEndTime(
  durationSeconds: number,
  endTrimSeconds = SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const trim = Math.max(
    0,
    Number.isFinite(endTrimSeconds) ? endTrimSeconds : 0,
  );
  return durationSeconds > trim + 1 ? durationSeconds - trim : durationSeconds;
}

export function createSeamlessSessionAtmosphereLoopBuffer(
  context: BaseAudioContext,
  decoded: AudioBuffer,
  endTrimSeconds = SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS,
  crossfadeSeconds = SESSION_ATMOSPHERE_LOOP_CROSSFADE_SECONDS,
  loopStartSeconds = 0,
  explicitLoopEndSeconds?: number,
): AudioBuffer {
  const sampleRate = decoded.sampleRate;
  const normalizedLoopStartSeconds = Math.max(
    0,
    Math.min(decoded.duration - 1, Number.isFinite(loopStartSeconds) ? loopStartSeconds : 0),
  );
  const loopStartFrame = Math.floor(normalizedLoopStartSeconds * sampleRate);
  const loopEndSeconds = typeof explicitLoopEndSeconds === "number" &&
      Number.isFinite(explicitLoopEndSeconds) && explicitLoopEndSeconds > normalizedLoopStartSeconds
    ? Math.min(decoded.duration, explicitLoopEndSeconds)
    : sessionAtmosphereLoopEndTime(decoded.duration, endTrimSeconds);
  const loopEndFrame = Math.max(
    loopStartFrame + 1,
    Math.min(decoded.length, Math.floor(loopEndSeconds * sampleRate)),
  );
  const regionFrames = Math.max(
    1,
    loopEndFrame - loopStartFrame,
  );
  const desiredCrossfadeFrames = Math.max(
    0,
    Math.round(
      (Number.isFinite(crossfadeSeconds) ? crossfadeSeconds : 0) * sampleRate,
    ),
  );
  const crossfadeFrames = Math.min(
    desiredCrossfadeFrames,
    Math.floor(regionFrames / 4),
  );
  const loopFrames =
    crossfadeFrames >= 2 ? regionFrames - crossfadeFrames : regionFrames;
  const output = context.createBuffer(
    decoded.numberOfChannels,
    loopFrames,
    sampleRate,
  );

  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const inputChannel = decoded.getChannelData(channel);
    const outputChannel = output.getChannelData(channel);
    if (crossfadeFrames < 2) {
      outputChannel.set(inputChannel.subarray(loopStartFrame, loopStartFrame + loopFrames));
      continue;
    }
    // Rotate the overlap to the start: the buffer's last and first samples
    // remain adjacent source samples, while its old tail dissolves into its head.
    for (let frame = 0; frame < crossfadeFrames; frame += 1) {
      const headMix = frame / (crossfadeFrames - 1);
      const tailGain = Math.cos(headMix * Math.PI / 2);
      const headGain = Math.sin(headMix * Math.PI / 2);
      outputChannel[frame] =
        inputChannel[loopStartFrame + loopFrames + frame]! * tailGain +
        inputChannel[loopStartFrame + frame]! * headGain;
    }
    outputChannel.set(
      inputChannel.subarray(loopStartFrame + crossfadeFrames, loopStartFrame + loopFrames),
      crossfadeFrames,
    );
  }

  return output;
}

function normalizeSessionAtmosphereMix(
  mix?: SessionAtmosphereMix,
): SessionAtmosphereMix {
  return {
    background: clampAtmosphereMixLevel(
      mix?.background ?? DEFAULT_SESSION_ATMOSPHERE_MIX.background,
    ),
    grain: clampAtmosphereMixLevel(
      mix?.grain ?? DEFAULT_SESSION_ATMOSPHERE_MIX.grain,
    ),
    foley: clampAtmosphereMixLevel(
      mix?.foley ?? DEFAULT_SESSION_ATMOSPHERE_MIX.foley,
    ),
  };
}

function sessionAtmosphereBusGain(args: {
  volume: number;
  mix?: SessionAtmosphereMix;
  bus: SessionAtmosphereBus;
  trim?: number;
}): number {
  const mix = normalizeSessionAtmosphereMix(args.mix);
  return (
    clampAudioLevel(args.volume) *
    mix[args.bus] *
    Math.max(0, Number.isFinite(args.trim) ? (args.trim ?? 1) : 1)
  );
}

export function sessionAtmosphereBusVolume(args: {
  volume: number;
  mix?: SessionAtmosphereMix;
  bus: SessionAtmosphereBus;
  trim?: number;
}): number {
  return clampAudioLevel(sessionAtmosphereBusGain(args));
}

export function startSessionAtmosphere(args: {
  seed: string;
  volume: number;
  backgroundUrl?: string | null;
  grainUrl?: string | null;
  mix?: SessionAtmosphereMix;
  /** Fade newly created loop beds up from silence over this interval. */
  startTransitionMs?: number;
  backgroundTone?: SessionAtmosphereBackgroundTone;
  /** When false, background beds stay on speakers only and skip the master tap. */
  backgroundRecordable?: boolean;
  /** When false, grain beds stay on speakers only and skip the master tap. */
  grainRecordable?: boolean;
  foleyRoomAcoustics?: RoomAcousticsSend;
  backgroundRoomAcoustics?: RoomAcousticsSend;
  allowMixBoost?: boolean;
  /** Keep live Coffee/Signal clips off HTMLMediaElement and renderer decode. */
  latencyCritical?: boolean;
  shouldDeferFoley?: () => boolean;
  shouldDeferBotVocalization?: () => boolean;
  ambientFoley?: boolean;
  ambientFoleyProfile?: SessionAmbientFoleyProfile;
  ambientFoleyUrls?: readonly string[];
  ambientBotVocalizations?: boolean;
  ambientBotVocalizationProfile?: SessionAmbientFoleyProfile;
  onAmbientBotVocalization?: (
    cue: SessionAmbientBotVocalizationCue,
  ) => boolean | "owned";
  onPlaybackError?: (error: unknown) => void;
}): SessionAtmosphereController {
  let volume = clampAudioLevel(args.volume);
  let mix = normalizeSessionAtmosphereMix(args.mix);
  let presentationSuspended = false;
  let restoredVolume = volume;
  let restoredMix = mix;
  const backgroundRecordable = args.backgroundRecordable !== false;
  const grainRecordable = args.grainRecordable !== false;
  const activeAudio = new Map<
    HTMLAudioElement,
    SessionAtmosphereActiveSource
  >();
  const activeLoops = new Set<SessionAtmosphereActiveLoop>();
  const activeBufferAudio = new Set<SessionAtmosphereActiveBufferSource>();
  const pendingLoopLoads = new Set<AbortController>();
  const preloadedFoley = new Map<string, HTMLAudioElement[]>();
  const htmlVolumeRampTimers = new Map<HTMLAudioElement, number>();
  const foleyTagVersions = new Map<string, number>();
  const latencyCritical =
    args.latencyCritical === true ||
    (typeof document !== "undefined" &&
      document.body?.dataset.prismLivePerformanceActive === "true");
  let stopped = false;
  let timer: number | null = null;
  let botVocalizationTimer: number | null = null;
  let foleyIndex = 0;
  let botVocalizationIndex = 0;
  const applyLiveMix = (transitionMs = 0): void => {
    for (const [audio, source] of activeAudio) {
      applySourceVolume(audio, source, transitionMs);
    }
    for (const source of activeLoops) {
      const gain = source.leveler.busGain.gain;
      const context = source.source.context;
      const target = sessionAtmosphereBusGain({
        volume,
        mix,
        bus: source.bus,
        trim: source.trim,
      });
      const transitionSeconds = Math.max(0, transitionMs) / 1_000;
      gain.cancelScheduledValues(context.currentTime);
      gain.setValueAtTime(gain.value, context.currentTime);
      if (transitionSeconds > 0) {
        gain.linearRampToValueAtTime(
          target,
          context.currentTime + transitionSeconds,
        );
      } else {
        gain.value = target;
      }
    }
    for (const source of activeBufferAudio) {
      const gain = source.leveler.busGain.gain;
      const context = source.source.context;
      const target = sessionAtmosphereBusGain({
        volume,
        mix,
        bus: source.bus,
        trim: source.trim,
      });
      const transitionSeconds = Math.max(0, transitionMs) / 1_000;
      gain.cancelScheduledValues(context.currentTime);
      gain.setValueAtTime(gain.value, context.currentTime);
      if (transitionSeconds > 0) {
        gain.linearRampToValueAtTime(
          target,
          context.currentTime + transitionSeconds,
        );
      } else {
        gain.value = target;
      }
    }
  };

  const presentationDeferred = (): boolean => presentationSuspended;

  const ambientFoleyProfile =
    args.ambientFoleyProfile ?? DEFAULT_SESSION_AMBIENT_FOLEY_PROFILE;
  const ambientBotVocalizationProfile =
    args.ambientBotVocalizationProfile ??
    DEFAULT_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE;

  const releaseAudio = (
    audio: HTMLAudioElement,
    preserveRoomTail = false,
  ): void => {
    const rampTimer = htmlVolumeRampTimers.get(audio);
    if (rampTimer !== undefined && typeof window !== "undefined") {
      window.clearInterval(rampTimer);
    }
    htmlVolumeRampTimers.delete(audio);
    const source = activeAudio.get(audio);
    source?.leveler?.disconnect(preserveRoomTail);
    activeAudio.delete(audio);
  };
  const releaseBufferAudio = (
    source: SessionAtmosphereActiveBufferSource,
    preserveRoomTail = false,
  ): void => {
    if (source.released) return;
    source.released = true;
    activeBufferAudio.delete(source);
    source.leveler.disconnect(preserveRoomTail);
  };

  const applySourceVolume = (
    audio: HTMLAudioElement,
    source: {
      bus: SessionAtmosphereBus;
      trim: number;
      leveler: SessionAtmosphereSourceLeveler | null;
    },
    transitionMs = 0,
    startAtSilence = false,
  ): void => {
    const target = sessionAtmosphereBusGain({
      volume,
      mix,
      bus: source.bus,
      trim: source.trim,
    });
    if (source.leveler) {
      audio.volume = 1;
      const gain = source.leveler.busGain.gain;
      const context = source.leveler.busGain.context;
      const transitionSeconds = Math.max(0, transitionMs) / 1_000;
      if (transitionSeconds > 0) {
        gain.cancelScheduledValues(context.currentTime);
        gain.setValueAtTime(startAtSilence ? 0 : gain.value, context.currentTime);
        gain.linearRampToValueAtTime(
          target,
          context.currentTime + transitionSeconds,
        );
      } else {
        gain.value = target;
      }
    } else {
      const previousTimer = htmlVolumeRampTimers.get(audio);
      if (previousTimer !== undefined && typeof window !== "undefined") {
        window.clearInterval(previousTimer);
      }
      htmlVolumeRampTimers.delete(audio);
      const transitionDuration = Math.max(0, transitionMs);
      if (transitionDuration > 0 && typeof window !== "undefined") {
        const initialLevel = startAtSilence ? 0 : audio.volume;
        if (startAtSilence) audio.volume = 0;
        const startedAt = Date.now();
        const rampTimer = window.setInterval(() => {
          const progress = Math.min(
            1,
            (Date.now() - startedAt) / transitionDuration,
          );
          audio.volume = clampAudioLevel(
            initialLevel + (target - initialLevel) * progress,
          );
          if (progress < 1) return;
          window.clearInterval(rampTimer);
          htmlVolumeRampTimers.delete(audio);
        }, 20);
        htmlVolumeRampTimers.set(audio, rampTimer);
      } else {
        audio.volume = clampAudioLevel(target);
      }
    }
  };

  const primeFoley = (url: string): void => {
    const normalizedUrl = url.trim();
    if (stopped || !normalizedUrl) return;
    if (latencyCritical) {
      void livePerformanceAudioPcm(normalizedUrl);
      return;
    }
    if (
      typeof Audio === "undefined" ||
      (preloadedFoley.get(normalizedUrl)?.length ?? 0) > 0
    ) {
      return;
    }
    const audio = new Audio(normalizedUrl);
    audio.preload = "auto";
    audio.load();
    preloadedFoley.set(normalizedUrl, [audio]);
  };

  const playLivePerformanceFoley = (
    url: string,
    bus: SessionAtmosphereBus,
    options: SessionAtmosphereFoleyPlaybackOptions,
  ): boolean => {
    const context = sessionAtmosphereContext();
    if (
      !context ||
      typeof context.createBuffer !== "function" ||
      typeof context.createBufferSource !== "function"
    ) {
      return false;
    }
    const trim = Math.max(0, options.trim ?? 1);
    const tag = options.tag?.trim() || undefined;
    const tagVersion = tag ? (foleyTagVersions.get(tag) ?? 0) : 0;
    void livePerformanceAudioPcm(url).then((pcm) => {
      if (
        stopped ||
        !pcm ||
        (tag && (foleyTagVersions.get(tag) ?? 0) !== tagVersion)
      ) {
        return;
      }
      let activeSource: SessionAtmosphereActiveBufferSource | null = null;
      try {
        const decoded = context.createBuffer(
          pcm.channels.length,
          pcm.frameCount,
          pcm.sampleRate,
        );
        for (
          let channelIndex = 0;
          channelIndex < pcm.channels.length;
          channelIndex += 1
        ) {
          decoded.copyToChannel(
            new Float32Array(pcm.channels[channelIndex]!),
            channelIndex,
          );
        }
        const source = context.createBufferSource();
        source.buffer = decoded;
        source.playbackRate.value = Math.max(
          0.85,
          Math.min(1.15, options.playbackRate ?? 1),
        );
        const leveler = levelSessionAtmosphereNode(
          context,
          source,
          false,
          bus,
          args.backgroundTone ?? "neutral",
          args.foleyRoomAcoustics,
          options,
          sessionAtmosphereOutputDestination(
            context,
            bus,
            backgroundRecordable,
            grainRecordable,
          ),
        );
        activeSource = {
          source,
          bus,
          trim,
          leveler,
          released: false,
          ...(tag ? { tag } : {}),
        };
        leveler.busGain.gain.value = sessionAtmosphereBusGain({
          volume,
          mix,
          bus,
          trim,
        });
        activeBufferAudio.add(activeSource);
        source.addEventListener(
          "ended",
          () => {
            if (!activeSource) return;
            releaseBufferAudio(activeSource, true);
            activeSource = null;
          },
          { once: true },
        );
        source.start();
      } catch (error) {
        if (activeSource) {
          releaseBufferAudio(activeSource);
        }
        args.onPlaybackError?.(error);
      }
    });
    return true;
  };

  const play = (
    url: string,
    bus: SessionAtmosphereBus,
    options: SessionAtmosphereFoleyPlaybackOptions & { loop?: boolean } = {},
  ): boolean => {
    if (stopped) return false;
    if (latencyCritical && options.loop !== true) {
      return playLivePerformanceFoley(url, bus, options);
    }
    if (typeof Audio === "undefined") return false;
    const trim = Math.max(0, options.trim ?? 1);
    const loop = options.loop === true;
    const queued = preloadedFoley.get(url);
    const audio = queued?.shift() ?? new Audio(url);
    if (queued && queued.length === 0) preloadedFoley.delete(url);
    if (queued) primeFoley(url);
    audio.preload = "auto";
    audio.loop = loop;
    audio.playbackRate = Math.max(
      0.85,
      Math.min(1.15, options.playbackRate ?? 1),
    );
    audio.preservesPitch = false;
    const source = {
      bus,
      trim,
      ...(options.tag ? { tag: options.tag } : {}),
      leveler: levelSessionAtmosphereSource(
        audio,
        loop,
        bus,
        args.backgroundTone ?? "neutral",
        loop && bus === "background"
          ? args.backgroundRoomAcoustics
          : args.foleyRoomAcoustics,
        options,
        backgroundRecordable,
        grainRecordable,
      ),
    } satisfies SessionAtmosphereActiveSource;
    const loopRecordable =
      bus === "foley" ||
      sessionAtmosphereLoopIsRecordable(bus, {
        backgroundRecordable,
        grainRecordable,
      });
    // Local-only loops may still use HTMLAudio fallback during capture.
    if (
      !source.leveler &&
      replayAudioMasterCaptureActive() &&
      loopRecordable
    ) {
      return false;
    }
    activeAudio.set(audio, source);
    applySourceVolume(
      audio,
      source,
      loop ? (args.startTransitionMs ?? 0) : 0,
      loop && (args.startTransitionMs ?? 0) > 0,
    );
    if (!loop) {
      audio.addEventListener("ended", () => releaseAudio(audio, true), {
        once: true,
      });
    }
    void audio.play().catch((error: unknown) => {
      releaseAudio(audio);
      args.onPlaybackError?.(error);
    });
    return true;
  };

  const playLoop = (
    url: string,
    bus: Extract<SessionAtmosphereBus, "background" | "grain">,
    trim = 1,
  ): void => {
    const context = sessionAtmosphereContext();
    if (
      !context ||
      typeof context.createBufferSource !== "function" ||
      typeof context.decodeAudioData !== "function" ||
      typeof fetch !== "function"
    ) {
      play(url, bus, { trim, loop: true });
      return;
    }

    const loadController = new AbortController();
    pendingLoopLoads.add(loadController);
    void (async () => {
      let activeLoop: SessionAtmosphereActiveLoop | null = null;
      try {
        const response = await fetch(url, {
          credentials: "include",
          signal: loadController.signal,
        });
        if (!response.ok) {
          throw new Error(
            `Unable to load atmosphere loop (${response.status})`,
          );
        }
        const decoded = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        if (stopped || loadController.signal.aborted) return;
        const source = context.createBufferSource();
        const loopStartMs = Number(response.headers?.get?.("x-prism-loop-start-ms"));
        const loopEndMs = Number(response.headers?.get?.("x-prism-loop-end-ms"));
        const loopCrossfadeMs = Number(response.headers?.get?.("x-prism-loop-crossfade-ms"));
        const hasValidatedLoop = Number.isFinite(loopStartMs) && loopStartMs >= 0 &&
          Number.isFinite(loopEndMs) && loopEndMs > loopStartMs &&
          Number.isFinite(loopCrossfadeMs) && loopCrossfadeMs > 0;
        source.buffer = createSeamlessSessionAtmosphereLoopBuffer(
          context,
          decoded,
          hasValidatedLoop ? 0 : SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS,
          hasValidatedLoop ? loopCrossfadeMs / 1_000 : SESSION_ATMOSPHERE_LOOP_CROSSFADE_SECONDS,
          hasValidatedLoop ? loopStartMs / 1_000 : 0,
          hasValidatedLoop ? loopEndMs / 1_000 : undefined,
        );
        source.loop = true;
        source.loopStart = 0;
        source.loopEnd = source.buffer.duration;
        activeLoop = {
          source,
          bus,
          trim,
          leveler: levelSessionAtmosphereNode(
            context,
            source,
            true,
            bus,
            args.backgroundTone ?? "neutral",
            args.backgroundRoomAcoustics,
            undefined,
            sessionAtmosphereOutputDestination(
              context,
              bus,
              backgroundRecordable,
              grainRecordable,
            ),
          ),
        };
        const target = sessionAtmosphereBusGain({ volume, mix, bus, trim });
        const gain = activeLoop.leveler.busGain.gain;
        const transitionSeconds =
          Math.max(0, args.startTransitionMs ?? 0) / 1_000;
        if (transitionSeconds > 0) {
          gain.value = 0;
          gain.setValueAtTime(0, context.currentTime);
          gain.linearRampToValueAtTime(
            target,
            context.currentTime + transitionSeconds,
          );
        } else {
          gain.value = target;
        }
        activeLoops.add(activeLoop);
        source.start();
      } catch {
        if (activeLoop) {
          activeLoops.delete(activeLoop);
          activeLoop.leveler?.disconnect();
        }
        if (!stopped && !loadController.signal.aborted) {
          play(url, bus, { trim, loop: true });
        }
      } finally {
        pendingLoopLoads.delete(loadController);
      }
    })();
  };

  if (args.backgroundUrl) playLoop(args.backgroundUrl, "background");
  if (args.grainUrl) playLoop(args.grainUrl, "grain");

  const scheduleFoley = (): void => {
    if (stopped || typeof window === "undefined") return;
    const index = foleyIndex;
    timer = window.setTimeout(
      () => {
        timer = null;
        if (stopped) return;
        if (args.shouldDeferFoley?.() || presentationDeferred()) {
          timer = window.setTimeout(scheduleFoley, 4_000);
          return;
        }
        play(
          sessionAmbientFoleyUrlFrom(
            args.seed,
            index,
            args.ambientFoleyUrls ?? GENERAL_FOLEY_URLS,
          ),
          "foley",
          {
            trim: Math.max(0, ambientFoleyProfile.trim),
            tag: "ambient-foley",
          },
        );
        foleyIndex += 1;
        scheduleFoley();
      },
      sessionAmbientFoleyDelayMs(args.seed, index, ambientFoleyProfile),
    );
  };
  if (args.ambientFoley !== false) scheduleFoley();

  const scheduleBotVocalization = (): void => {
    if (stopped || typeof window === "undefined") return;
    const index = botVocalizationIndex;
    botVocalizationTimer = window.setTimeout(
      () => {
        botVocalizationTimer = null;
        if (stopped) return;
        if (
          presentationDeferred() ||
          (args.shouldDeferBotVocalization ?? args.shouldDeferFoley)?.()
        ) {
          botVocalizationTimer = window.setTimeout(
            scheduleBotVocalization,
            4_000,
          );
          return;
        }
        const cue = sessionAmbientBotVocalizationCue(args.seed, index);
        let accepted: boolean | "owned" = false;
        try {
          accepted = args.onAmbientBotVocalization?.(cue) ?? false;
        } catch {
          accepted = false;
        }
        if (accepted === true) {
          play(cue.url, "foley", {
            trim: Math.max(0, ambientBotVocalizationProfile.trim),
            tag: "ambient-bot-vocalization",
          });
        } else if (accepted === "owned") {
          // Caller owns playback (e.g. Debate ElevenLabs vocal Foley).
        }
        botVocalizationIndex += 1;
        scheduleBotVocalization();
      },
      sessionAmbientBotVocalizationDelayMs(
        args.seed,
        index,
        ambientBotVocalizationProfile,
      ),
    );
  };
  if (args.ambientBotVocalizations === true) scheduleBotVocalization();

  return {
    playCue(cue) {
      if (presentationSuspended) return;
      play(SESSION_FOLEY_URLS[cue], "foley", {
        trim: cue === "coffeeSip" ? 0.625 : 1.0625,
      });
    },
    preloadFoley(urls) {
      for (const url of new Set(urls)) primeFoley(url);
    },
    playFoley(url, options = {}) {
      if (presentationSuspended) return false;
      return play(url, "foley", options);
    },
    stopFoley(tag, fadeMs = 180) {
      const normalizedTag = tag.trim();
      if (!normalizedTag) return;
      foleyTagVersions.set(
        normalizedTag,
        (foleyTagVersions.get(normalizedTag) ?? 0) + 1,
      );
      for (const [audio, source] of [...activeAudio]) {
        if (source.tag !== normalizedTag) continue;
        const initialLevel = source.leveler
          ? source.leveler.busGain.gain.value
          : audio.volume;
        if (audio.paused || fadeMs <= 0 || typeof window === "undefined") {
          audio.pause();
          releaseAudio(audio, true);
          continue;
        }
        const startedAt = Date.now();
        const timer = window.setInterval(() => {
          const progress = Math.min(1, (Date.now() - startedAt) / fadeMs);
          const level = initialLevel * (1 - progress);
          if (source.leveler) source.leveler.busGain.gain.value = level;
          else audio.volume = clampAudioLevel(level);
          if (progress < 1) return;
          window.clearInterval(timer);
          audio.pause();
          releaseAudio(audio, true);
        }, 20);
      }
      for (const source of [...activeBufferAudio]) {
        if (source.tag !== normalizedTag) continue;
        const context = source.source.context;
        const gain = source.leveler.busGain.gain;
        gain.cancelScheduledValues(context.currentTime);
        gain.setValueAtTime(gain.value, context.currentTime);
        if (fadeMs > 0) {
          const endTime = context.currentTime + fadeMs / 1_000;
          gain.linearRampToValueAtTime(0, endTime);
          try {
            source.source.stop(endTime);
          } catch {
            releaseBufferAudio(source, true);
          }
        } else {
          try {
            source.source.stop();
          } catch {
            // The source already ended between the snapshot and this call.
          }
          releaseBufferAudio(source, true);
        }
      }
    },
    setMix(next) {
      if (presentationSuspended) {
        restoredVolume = clampAudioLevel(next.volume);
        restoredMix = normalizeSessionAtmosphereMix(next.mix);
        return;
      }
      volume = clampAudioLevel(next.volume);
      mix = normalizeSessionAtmosphereMix(next.mix);
      restoredVolume = volume;
      restoredMix = mix;
      applyLiveMix(next.transitionMs ?? 0);
    },
    setPresentationSuspended(suspended, transitionMs = 220) {
      if (stopped || presentationSuspended === suspended) return;
      presentationSuspended = suspended;
      if (suspended) {
        restoredVolume = volume;
        restoredMix = mix;
        volume = 0;
        applyLiveMix(transitionMs);
        return;
      }
      volume = restoredVolume;
      mix = restoredMix;
      applyLiveMix(transitionMs);
    },
    stop(fadeMs = 180) {
      if (stopped) return;
      stopped = true;
      if (timer !== null && typeof window !== "undefined") {
        window.clearTimeout(timer);
      }
      if (botVocalizationTimer !== null && typeof window !== "undefined") {
        window.clearTimeout(botVocalizationTimer);
      }
      timer = null;
      botVocalizationTimer = null;
      for (const loadController of pendingLoopLoads) {
        loadController.abort();
      }
      pendingLoopLoads.clear();
      for (const queue of preloadedFoley.values()) {
        for (const audio of queue) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
      }
      preloadedFoley.clear();
      const finalizeStop = (): void => {
        for (const source of activeLoops) {
          try {
            source.source.stop();
          } catch {
            // A source that failed during startup is already silent.
          }
          source.leveler?.disconnect();
        }
        activeLoops.clear();
        for (const source of activeBufferAudio) {
          try {
            source.source.stop();
          } catch {
            // A one-shot that already ended is already silent.
          }
          releaseBufferAudio(source);
        }
        for (const audio of [...activeAudio.keys()]) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
          releaseAudio(audio);
        }
      };
      const fadeDuration = Math.max(0, fadeMs);
      const browserFadeAvailable =
        typeof window !== "undefined" &&
        typeof window.setTimeout === "function" &&
        [...activeLoops, ...activeBufferAudio].every(
          (source) => Boolean(source.source.context),
        ) &&
        [...activeAudio.values()].every(
          (source) => source.leveler
            ? Boolean(source.leveler.busGain.context)
            : typeof window.setInterval === "function",
        );
      if (
        fadeDuration > 0 &&
        browserFadeAvailable &&
        (activeLoops.size > 0 ||
          activeBufferAudio.size > 0 ||
          activeAudio.size > 0)
      ) {
        volume = 0;
        applyLiveMix(fadeDuration);
        window.setTimeout(finalizeStop, fadeDuration);
      } else {
        finalizeStop();
      }
    },
  };
}

export function coffeeCupFoleyCueForTransition(
  previous: boolean | undefined,
  sipping: boolean,
  placementCueMode: "transition" | "animation-end" = "transition",
): SessionAtmosphereCue | null {
  if (previous === undefined || previous === sipping) return null;
  if (!sipping && placementCueMode === "animation-end") return null;
  return sipping ? "coffeeSip" : "coffeeCupPlace";
}

export function attachCoffeeCupFoley(
  root: HTMLElement,
  controller: SessionAtmosphereController,
  onCue?: (cue: SessionAtmosphereCue, cup: HTMLElement) => void,
): () => void {
  const sippingByCup = new WeakMap<HTMLElement, boolean>();
  const cupSelector = "[data-cup-frame]";
  const animationOwnedPlacementSelector =
    '[data-cup-placement-foley="animation-end"]';

  const placementCueModeForCup = (
    cup: HTMLElement,
  ): "transition" | "animation-end" =>
    cup.closest(animationOwnedPlacementSelector)
      ? "animation-end"
      : "transition";

  const inspectCup = (cup: HTMLElement, announce: boolean): void => {
    const sipping = cup.dataset.cupSipping === "true";
    const previous = sippingByCup.get(cup);
    sippingByCup.set(cup, sipping);
    if (!announce) return;
    const cue = coffeeCupFoleyCueForTransition(
      previous,
      sipping,
      placementCueModeForCup(cup),
    );
    if (cue) {
      controller.playCue(cue);
      onCue?.(cue, cup);
    }
  };
  const inspectRemovedCup = (cup: HTMLElement): void => {
    const previous = sippingByCup.get(cup);
    sippingByCup.set(cup, false);
    const cue = coffeeCupFoleyCueForTransition(
      previous,
      false,
      placementCueModeForCup(cup),
    );
    if (cue) {
      controller.playCue(cue);
      onCue?.(cue, cup);
    }
  };

  const announceAnimatedCupPlacement = (event: AnimationEvent): void => {
    if (!(event.target instanceof HTMLElement)) return;
    const mug = event.target;
    if (
      !mug.matches(animationOwnedPlacementSelector) ||
      mug.dataset.sipping !== "true"
    ) {
      return;
    }
    const cup = mug.querySelector<HTMLElement>(cupSelector);
    if (!cup) return;
    controller.playCue("coffeeCupPlace");
    onCue?.("coffeeCupPlace", cup);
  };

  root
    .querySelectorAll<HTMLElement>(cupSelector)
    .forEach((cup) => inspectCup(cup, false));
  root.addEventListener("animationend", announceAnimatedCupPlacement, true);
  if (typeof MutationObserver === "undefined") {
    return () =>
      root.removeEventListener(
        "animationend",
        announceAnimatedCupPlacement,
        true,
      );
  }
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.target instanceof HTMLElement
      ) {
        inspectCup(mutation.target, true);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(cupSelector)) inspectCup(node, false);
        node
          .querySelectorAll<HTMLElement>(cupSelector)
          .forEach((cup) => inspectCup(cup, false));
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(cupSelector)) inspectRemovedCup(node);
        node
          .querySelectorAll<HTMLElement>(cupSelector)
          .forEach(inspectRemovedCup);
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-cup-sipping"],
  });
  return () => {
    observer.disconnect();
    root.removeEventListener(
      "animationend",
      announceAnimatedCupPlacement,
      true,
    );
  };
}
