import {
  botcastSoundboardCueFromEvent,
  type BotcastReplayEvent,
  type BotcastSoundboardCueKind,
} from "@localai/shared";
import type {
  SessionAtmosphereController,
  SessionAtmosphereFoleyPlaybackOptions,
} from "./session-atmosphere-audio.ts";

export interface SignalSoundboardCueDefinition {
  kind: BotcastSoundboardCueKind;
  label: string;
  glyph: string;
  sources: readonly string[];
}

export interface SignalSoundboardPlaybackPlan {
  kind: BotcastSoundboardCueKind;
  variantIndex: number;
  src: string;
  trim: number;
  playbackRate: number;
  lowCutHz: number;
  highCutHz: number;
  stereoPan: number;
}

type SignalSoundboardVariation = Required<
  Pick<
    SessionAtmosphereFoleyPlaybackOptions,
    "trim" | "playbackRate" | "lowCutHz" | "highCutHz" | "stereoPan"
  >
>;

export const SIGNAL_SOUNDBOARD_CUES: readonly SignalSoundboardCueDefinition[] = [
  {
    kind: "applause",
    label: "Applause",
    glyph: "👏",
    sources: ["/audio/signal/soundboard/applause.mp3"],
  },
  {
    kind: "laughter",
    label: "Laughter",
    glyph: "◡",
    sources: ["/audio/signal/soundboard/laughter.mp3"],
  },
  {
    kind: "gasp",
    label: "Gasp",
    glyph: "!",
    sources: ["/audio/signal/soundboard/gasp.mp3"],
  },
  {
    kind: "rimshot",
    label: "Rimshot",
    glyph: "🥁",
    sources: ["/audio/signal/soundboard/rimshot.mp3"],
  },
] as const;

/**
 * Four restrained room-mix treatments keep repeated cues from sounding like
 * the same dry sample pasted over the studio. Distinct recorded takes can be
 * added to each cue's sources after a listening pass without changing replay.
 */
const SIGNAL_SOUNDBOARD_VARIATIONS: Record<
  BotcastSoundboardCueKind,
  readonly SignalSoundboardVariation[]
> = {
  applause: [
    { trim: 0.16, playbackRate: 0.97, lowCutHz: 130, highCutHz: 3_500, stereoPan: -0.07 },
    { trim: 0.14, playbackRate: 1.02, lowCutHz: 150, highCutHz: 3_900, stereoPan: 0.06 },
    { trim: 0.17, playbackRate: 0.985, lowCutHz: 120, highCutHz: 3_300, stereoPan: 0.03 },
    { trim: 0.15, playbackRate: 1.035, lowCutHz: 160, highCutHz: 4_100, stereoPan: -0.03 },
  ],
  laughter: [
    { trim: 0.2, playbackRate: 0.965, lowCutHz: 145, highCutHz: 3_600, stereoPan: 0.07 },
    { trim: 0.18, playbackRate: 1.025, lowCutHz: 175, highCutHz: 4_000, stereoPan: -0.06 },
    { trim: 0.21, playbackRate: 0.985, lowCutHz: 130, highCutHz: 3_400, stereoPan: -0.02 },
    { trim: 0.19, playbackRate: 1.04, lowCutHz: 185, highCutHz: 4_200, stereoPan: 0.03 },
  ],
  gasp: [
    { trim: 0.14, playbackRate: 0.97, lowCutHz: 170, highCutHz: 3_300, stereoPan: -0.05 },
    { trim: 0.12, playbackRate: 1.03, lowCutHz: 210, highCutHz: 3_700, stereoPan: 0.06 },
    { trim: 0.15, playbackRate: 0.985, lowCutHz: 155, highCutHz: 3_100, stereoPan: 0.02 },
    { trim: 0.13, playbackRate: 1.045, lowCutHz: 225, highCutHz: 3_900, stereoPan: -0.02 },
  ],
  rimshot: [
    { trim: 0.12, playbackRate: 0.97, lowCutHz: 125, highCutHz: 3_000, stereoPan: 0.05 },
    { trim: 0.1, playbackRate: 1.03, lowCutHz: 155, highCutHz: 3_400, stereoPan: -0.05 },
    { trim: 0.13, playbackRate: 0.985, lowCutHz: 115, highCutHz: 2_850, stereoPan: -0.02 },
    { trim: 0.11, playbackRate: 1.045, lowCutHz: 170, highCutHz: 3_600, stereoPan: 0.03 },
  ],
};

interface SignalSoundboardAudio {
  currentTime: number;
  paused: boolean;
  playbackRate: number;
  preservesPitch?: boolean;
  preload: string;
  volume: number;
  addEventListener(
    type: "ended" | "error",
    listener: () => void,
    options?: { once?: boolean },
  ): void;
  pause(): void;
  play(): Promise<void>;
}

type SignalSoundboardAudioFactory = (src: string) => SignalSoundboardAudio;
type SignalSoundboardStudioController = Pick<
  SessionAtmosphereController,
  "playFoley" | "stopFoley"
>;

export interface SignalSoundboardPlaybackOptions {
  variantIndex?: number;
  studioController?: SignalSoundboardStudioController | null;
  createAudio?: SignalSoundboardAudioFactory;
}

const SIGNAL_SOUNDBOARD_FOLEY_TAG = "signal-soundboard";
const activeSoundboardAudio = new Set<SignalSoundboardAudio>();

function cueDefinition(
  kind: BotcastSoundboardCueKind,
): SignalSoundboardCueDefinition | null {
  return SIGNAL_SOUNDBOARD_CUES.find((cue) => cue.kind === kind) ?? null;
}

function normalizedVariantIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  const integer = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ((integer % count) + count) % count;
}

export function signalSoundboardPlaybackPlan(
  kind: BotcastSoundboardCueKind,
  variantIndex = 0,
): SignalSoundboardPlaybackPlan | null {
  const cue = cueDefinition(kind);
  const variations = SIGNAL_SOUNDBOARD_VARIATIONS[kind];
  if (!cue || cue.sources.length === 0 || variations.length === 0) return null;
  const normalizedIndex = normalizedVariantIndex(
    variantIndex,
    Math.max(cue.sources.length, variations.length),
  );
  const variation = variations[normalizedIndex % variations.length]!;
  return {
    kind,
    variantIndex: normalizedIndex,
    src: cue.sources[normalizedIndex % cue.sources.length]!,
    ...variation,
  };
}

export function signalSoundboardNextVariantIndex(
  events: readonly BotcastReplayEvent[],
  kind: BotcastSoundboardCueKind,
): number {
  const count = events.reduce((total, event) => {
    const cue = botcastSoundboardCueFromEvent(event);
    return total + (cue?.kind === kind ? 1 : 0);
  }, 0);
  return normalizedVariantIndex(
    count,
    SIGNAL_SOUNDBOARD_VARIATIONS[kind].length,
  );
}

function releaseSoundboardAudio(audio: SignalSoundboardAudio): void {
  activeSoundboardAudio.delete(audio);
  audio.pause();
  audio.currentTime = 0;
}

export function playSignalSoundboardCue(
  kind: BotcastSoundboardCueKind,
  options: SignalSoundboardPlaybackOptions = {},
): boolean {
  const plan = signalSoundboardPlaybackPlan(kind, options.variantIndex);
  if (!plan) return false;
  if (
    options.studioController?.playFoley(plan.src, {
      trim: plan.trim,
      playbackRate: plan.playbackRate,
      lowCutHz: plan.lowCutHz,
      highCutHz: plan.highCutHz,
      stereoPan: plan.stereoPan,
      tag: SIGNAL_SOUNDBOARD_FOLEY_TAG,
    })
  ) {
    return true;
  }
  const createAudio = options.createAudio ?? ((src: string) => new Audio(src));
  const audio = createAudio(plan.src);
  audio.preload = "auto";
  audio.volume = plan.trim;
  audio.playbackRate = plan.playbackRate;
  if ("preservesPitch" in audio) audio.preservesPitch = false;
  activeSoundboardAudio.add(audio);
  const release = (): void => releaseSoundboardAudio(audio);
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  void audio.play().catch(release);
  return true;
}

/** Short release fade for pause, seek, or teardown; audible cues otherwise finish. */
export function stopSignalSoundboardAudio(
  fadeMs = 180,
  studioController?: SignalSoundboardStudioController | null,
): void {
  studioController?.stopFoley(SIGNAL_SOUNDBOARD_FOLEY_TAG, fadeMs);
  for (const audio of [...activeSoundboardAudio]) {
    if (audio.paused || fadeMs <= 0) {
      releaseSoundboardAudio(audio);
      continue;
    }
    const initialVolume = audio.volume;
    const startedAt = Date.now();
    const timer = globalThis.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / fadeMs);
      audio.volume = initialVolume * (1 - progress);
      if (progress < 1) return;
      globalThis.clearInterval(timer);
      releaseSoundboardAudio(audio);
    }, 20);
  }
}

export function signalSoundboardEventsBetween(args: {
  events: readonly BotcastReplayEvent[];
  previousElapsedMs: number;
  elapsedMs: number;
}): Array<{
  eventId: string;
  kind: BotcastSoundboardCueKind;
  atMs: number;
  variantIndex: number;
}> {
  if (args.elapsedMs < args.previousElapsedMs) return [];
  const seenByKind = new Map<BotcastSoundboardCueKind, number>();
  return args.events.flatMap((event) => {
    const cue = botcastSoundboardCueFromEvent(event);
    if (!cue) return [];
    const variantIndex = normalizedVariantIndex(
      seenByKind.get(cue.kind) ?? 0,
      SIGNAL_SOUNDBOARD_VARIATIONS[cue.kind].length,
    );
    seenByKind.set(cue.kind, variantIndex + 1);
    if (cue.atMs <= args.previousElapsedMs || cue.atMs > args.elapsedMs) {
      return [];
    }
    return [{ eventId: event.id, ...cue, variantIndex }];
  });
}
