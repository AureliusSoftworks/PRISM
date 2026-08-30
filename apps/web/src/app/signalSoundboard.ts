import {
  botcastSoundboardCueFromEvent,
  type BotcastReplayEvent,
  type BotcastSoundboardCueKind,
} from "@localai/shared";
import {
  prismAudioContext,
  prismAudioOutputNode,
} from "./replayAudioMasterCapture.ts";
import { releaseAudibleAudioElement } from "./audibleAudioRelease.ts";
import {
  connectRoomAcoustics,
  SIGNAL_STUDIO_SOUNDBOARD_ROOM_SEND,
} from "./roomAcoustics.ts";

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
  /** Fixed at the category level. Performances, never DSP, provide variation. */
  trim: number;
}

export const SIGNAL_SOUNDBOARD_CUES: readonly SignalSoundboardCueDefinition[] = [
  { kind: "applause", label: "Applause", glyph: "👏", sources: ["/audio/signal/soundboard/applause.mp3"] },
  { kind: "laughter", label: "Laughter", glyph: "◡", sources: ["/audio/signal/soundboard/laughter.mp3"] },
  { kind: "gasp", label: "Gasp", glyph: "!", sources: ["/audio/signal/soundboard/gasp.mp3"] },
  { kind: "rimshot", label: "Rimshot", glyph: "🥁", sources: ["/audio/signal/soundboard/rimshot.mp3"] },
] as const;

/** Add reviewed same-source performances to a cue later; do not fake variation with DSP. */
export const SIGNAL_SOUNDBOARD_CATEGORY_TRIMS: Readonly<Record<BotcastSoundboardCueKind, number>> = {
  applause: 0.16,
  laughter: 0.19,
  gasp: 0.13,
  rimshot: 0.11,
};

/** A persistent, post-trim audience group that is tapped by the replay master. */
export const SIGNAL_SOUNDBOARD_GROUP_BUS = {
  highPassHz: 130,
  lowPassHz: 3_600,
  compressor: { threshold: -20, knee: 12, ratio: 4, attack: 0.008, release: 0.18 },
  roomSend: SIGNAL_STUDIO_SOUNDBOARD_ROOM_SEND,
} as const;

interface SignalSoundboardAudio {
  currentTime: number;
  paused: boolean;
  preload: string;
  volume: number;
  addEventListener(type: "ended" | "error", listener: () => void, options?: { once?: boolean }): void;
  pause(): void;
  play(): Promise<void>;
}

type SignalSoundboardAudioFactory = (src: string) => SignalSoundboardAudio;

export interface SignalSoundboardPlaybackOptions {
  variantIndex?: number;
  createAudio?: SignalSoundboardAudioFactory;
}

type SignalSoundboardGroupBus = { context: AudioContext; input: GainNode; dispose(): void };

let activeGroupBus: SignalSoundboardGroupBus | null = null;
const activeSoundboardAudio = new Set<SignalSoundboardAudio>();
const soundboardAudioOutputCleanup = new WeakMap<SignalSoundboardAudio, () => void>();

function cueDefinition(kind: BotcastSoundboardCueKind): SignalSoundboardCueDefinition | null {
  return SIGNAL_SOUNDBOARD_CUES.find((cue) => cue.kind === kind) ?? null;
}

function normalizedVariantIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  const integer = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ((integer % count) + count) % count;
}

function sharedSoundboardGroupBus(): SignalSoundboardGroupBus | null {
  const context = prismAudioContext();
  if (!context) return null;
  if (activeGroupBus?.context === context && context.state !== "closed") return activeGroupBus;
  activeGroupBus?.dispose();

  const input = context.createGain();
  const highPass = context.createBiquadFilter();
  const lowPass = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const group = context.createGain();
  highPass.type = "highpass";
  highPass.frequency.value = SIGNAL_SOUNDBOARD_GROUP_BUS.highPassHz;
  highPass.Q.value = 0.7;
  lowPass.type = "lowpass";
  lowPass.frequency.value = SIGNAL_SOUNDBOARD_GROUP_BUS.lowPassHz;
  lowPass.Q.value = 0.7;
  compressor.threshold.value = SIGNAL_SOUNDBOARD_GROUP_BUS.compressor.threshold;
  compressor.knee.value = SIGNAL_SOUNDBOARD_GROUP_BUS.compressor.knee;
  compressor.ratio.value = SIGNAL_SOUNDBOARD_GROUP_BUS.compressor.ratio;
  compressor.attack.value = SIGNAL_SOUNDBOARD_GROUP_BUS.compressor.attack;
  compressor.release.value = SIGNAL_SOUNDBOARD_GROUP_BUS.compressor.release;
  input.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(compressor);
  compressor.connect(group);
  const room = connectRoomAcoustics({
    context,
    input: group,
    destination: prismAudioOutputNode(context),
    send: SIGNAL_SOUNDBOARD_GROUP_BUS.roomSend,
  });
  const bus: SignalSoundboardGroupBus = {
    context,
    input,
    dispose() {
      room.disconnect();
      for (const node of [input, highPass, lowPass, compressor, group]) {
        try { node.disconnect(); } catch { /* capture teardown may have released it */ }
      }
    },
  };
  activeGroupBus = bus;
  return bus;
}

function routeSoundboardAudioToGroup(audio: SignalSoundboardAudio): (() => void) | null {
  const group = sharedSoundboardGroupBus();
  if (!group) return null;
  try {
    const source = group.context.createMediaElementSource(audio as unknown as HTMLMediaElement);
    source.connect(group.input);
    return () => {
      try { source.disconnect(); } catch { /* completed during teardown */ }
    };
  } catch {
    return null;
  }
}

export function signalSoundboardPlaybackPlan(kind: BotcastSoundboardCueKind, variantIndex = 0): SignalSoundboardPlaybackPlan | null {
  const cue = cueDefinition(kind);
  if (!cue || cue.sources.length === 0) return null;
  const normalizedIndex = normalizedVariantIndex(variantIndex, cue.sources.length);
  return { kind, variantIndex: normalizedIndex, src: cue.sources[normalizedIndex]!, trim: SIGNAL_SOUNDBOARD_CATEGORY_TRIMS[kind] };
}

export function signalSoundboardNextVariantIndex(events: readonly BotcastReplayEvent[], kind: BotcastSoundboardCueKind): number {
  const count = events.reduce((total, event) => total + (botcastSoundboardCueFromEvent(event)?.kind === kind ? 1 : 0), 0);
  return normalizedVariantIndex(count, cueDefinition(kind)?.sources.length ?? 1);
}

function releaseSoundboardAudio(audio: SignalSoundboardAudio): void {
  activeSoundboardAudio.delete(audio);
  soundboardAudioOutputCleanup.get(audio)?.();
  soundboardAudioOutputCleanup.delete(audio);
  audio.pause();
  audio.currentTime = 0;
}

export function playSignalSoundboardCue(kind: BotcastSoundboardCueKind, options: SignalSoundboardPlaybackOptions = {}): boolean {
  const plan = signalSoundboardPlaybackPlan(kind, options.variantIndex);
  if (!plan) return false;
  const createAudio = options.createAudio ?? ((src: string) => new Audio(src));
  const audio = createAudio(plan.src);
  if (!options.createAudio) {
    const cleanup = routeSoundboardAudioToGroup(audio);
    if (cleanup) soundboardAudioOutputCleanup.set(audio, cleanup);
    else return false;
  }
  audio.preload = "auto";
  audio.volume = plan.trim;
  activeSoundboardAudio.add(audio);
  const release = (): void => releaseSoundboardAudio(audio);
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  void audio.play().catch(release);
  return true;
}

/** Short release fade for pause, seek, or teardown; audible cues otherwise finish. */
export function stopSignalSoundboardAudio(fadeMs = 180): void {
  for (const audio of [...activeSoundboardAudio]) {
    activeSoundboardAudio.delete(audio);
    const cleanup = soundboardAudioOutputCleanup.get(audio);
    soundboardAudioOutputCleanup.delete(audio);
    void releaseAudibleAudioElement(audio as unknown as HTMLMediaElement, { durationMs: fadeMs, resetTime: true, onReleased: cleanup ?? undefined });
  }
}

function savedVariantIndex(event: BotcastReplayEvent, sourceCount: number): number | null {
  const raw = Number(event.payload.variantIndex);
  return Number.isInteger(raw) && raw >= 0 ? normalizedVariantIndex(raw, sourceCount) : null;
}

export function signalSoundboardEventsBetween(args: { events: readonly BotcastReplayEvent[]; previousElapsedMs: number; elapsedMs: number }): Array<{ eventId: string; kind: BotcastSoundboardCueKind; atMs: number; variantIndex: number }> {
  if (args.elapsedMs < args.previousElapsedMs) return [];
  const seenByKind = new Map<BotcastSoundboardCueKind, number>();
  return args.events.flatMap((event) => {
    const cue = botcastSoundboardCueFromEvent(event);
    if (!cue) return [];
    const sourceCount = cueDefinition(cue.kind)?.sources.length ?? 1;
    const variantIndex = savedVariantIndex(event, sourceCount) ?? normalizedVariantIndex(seenByKind.get(cue.kind) ?? 0, sourceCount);
    seenByKind.set(cue.kind, variantIndex + 1);
    if (cue.atMs <= args.previousElapsedMs || cue.atMs > args.elapsedMs) return [];
    return [{ eventId: event.id, ...cue, variantIndex }];
  });
}
