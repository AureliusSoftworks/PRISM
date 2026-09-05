import type {
  SignalStudioIncidentBeatV1,
  SignalStudioIncidentEventV1,
} from "@localai/shared";
import {
  replayAudioMasterCaptureActive,
  routeAudioElementToPrismOutput,
} from "./replayAudioMasterCapture.ts";
import { scheduleRealtimeVoiceDuck } from "./voiceEffects.ts";

interface SignalStudioIncidentAudio {
  currentTime: number;
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

type SignalStudioIncidentAudioFactory = (
  src: string,
) => SignalStudioIncidentAudio;

const INCIDENT_FOLEY_AUDIO: Record<
  Extract<SignalStudioIncidentBeatV1, { kind: "foley" }>["cue"],
  { src: string; playbackRate: number }
> = {
  chair_shift: {
    src: "/audio/debate/courtroom-chair-shift.mp3",
    playbackRate: 1,
  },
  paper_shuffle: {
    src: "/audio/debate/courtroom-paper-shuffle.mp3",
    playbackRate: 1.04,
  },
  glass_clink: {
    src: "/audio/prism-companion/glass-tap-03.mp3",
    playbackRate: 0.98,
  },
  headphone_rustle: {
    src: "/audio/debate/desk-paper-pickup-01.mp3",
    playbackRate: 0.82,
  },
  shared_laughter: {
    src: "/audio/signal/soundboard/laughter.mp3",
    playbackRate: 1,
  },
};

export interface SignalStudioIncidentPlaybackPlanV1 {
  foley: Array<{
    cue: Extract<SignalStudioIncidentBeatV1, { kind: "foley" }>["cue"];
    delayMs: number;
    gain: number;
  }>;
  primaryGain: {
    delayMs: number;
    holdMs: number;
    gain: number;
    resumeFadeMs: number;
  } | null;
}

export interface SignalStudioIncidentCaptionV1 {
  text: string;
  actorBotId: string;
  kind: "incident" | "dialogue";
}

export function signalStudioIncidentCaptionAtProgressV1(args: {
  incident: SignalStudioIncidentEventV1;
  progress: number;
}): SignalStudioIncidentCaptionV1 | null {
  const progress = Math.max(0, Math.min(1, args.progress));
  if (
    progress < args.incident.startProgress ||
    progress > args.incident.endProgress
  ) return null;
  const dialogue = args.incident.beats
    .filter(
      (beat): beat is Extract<
        SignalStudioIncidentBeatV1,
        { kind: "dialogue" }
      > => beat.kind === "dialogue" && beat.atProgress <= progress,
    )
    .at(-1);
  if (dialogue && progress <= Math.min(1, dialogue.atProgress + 0.1)) {
    return {
      text: dialogue.text,
      actorBotId: dialogue.actorBotId,
      kind: "dialogue",
    };
  }
  // Foley, gain changes, and physical actions belong to the performed stage,
  // not the speaker-labelled dialogue caption. Keep only genuinely spoken
  // incident interjections on the CC surface.
  return null;
}

/** One saved timeline feeds live capture and faithful replay reconstruction. */
export function signalStudioIncidentPlaybackPlanV1(args: {
  incident: SignalStudioIncidentEventV1;
  durationMs: number;
  elapsedMs?: number;
}): SignalStudioIncidentPlaybackPlanV1 {
  const durationMs = Math.max(1, args.durationMs);
  const elapsedMs = Math.max(0, args.elapsedMs ?? 0);
  const delayAt = (progress: number): number =>
    Math.max(0, Math.round(progress * durationMs - elapsedMs));
  const foley = args.incident.beats.flatMap((beat) =>
    beat.kind === "foley"
      ? [{ cue: beat.cue, delayMs: delayAt(beat.atProgress), gain: beat.gain }]
      : []
  );
  const primaryGainBeats = args.incident.beats.filter(
    (beat): beat is Extract<SignalStudioIncidentBeatV1, { kind: "gain" }> =>
      beat.kind === "gain" && beat.bus === "primary",
  );
  const lowered = primaryGainBeats.find((beat) => beat.gain < 1) ?? null;
  const restored = lowered
    ? primaryGainBeats.find(
        (beat) => beat.atProgress > lowered.atProgress && beat.gain === 1,
      ) ?? null
    : null;
  return {
    foley,
    primaryGain: lowered && restored
      ? {
          delayMs: delayAt(lowered.atProgress),
          holdMs: Math.max(
            1,
            Math.round((restored.atProgress - lowered.atProgress) * durationMs),
          ),
          gain: lowered.gain,
          resumeFadeMs: restored.rampMs,
        }
      : null,
  };
}

/**
 * Plays only bundled local Foley and routes it through PRISM output so a live
 * Signal capture owns the exact sound. Faithful replay then uses the saved
 * master and must not layer this procedural cue a second time.
 */
export function playSignalStudioIncidentAudio(
  incident: SignalStudioIncidentEventV1,
  options: {
    createAudio?: SignalStudioIncidentAudioFactory;
    durationMs?: number;
    elapsedMs?: number;
    scheduleGain?: typeof scheduleRealtimeVoiceDuck;
    schedule?: (callback: () => void, delayMs: number) => unknown;
  } = {},
): boolean {
  if (!incident.audible) return false;
  const plan = signalStudioIncidentPlaybackPlanV1({
    incident,
    durationMs: options.durationMs ?? 1_000,
    elapsedMs: options.elapsedMs,
  });
  const gainScheduled = plan.primaryGain
    ? (options.scheduleGain ?? scheduleRealtimeVoiceDuck)({
        channel: "primary",
        delayMs: plan.primaryGain.delayMs,
        holdMs: plan.primaryGain.holdMs,
        resumeFadeMs: plan.primaryGain.resumeFadeMs,
        duckGain: plan.primaryGain.gain,
      })
    : false;
  if (plan.foley.length === 0) return gainScheduled;
  const createAudio = options.createAudio ?? ((src: string) => new Audio(src));
  let foleyScheduled = false;
  const schedule = options.schedule ?? ((callback, delayMs) =>
    globalThis.setTimeout(callback, delayMs));
  for (const cue of plan.foley) {
    const play = (): void => {
      const audioPlan = INCIDENT_FOLEY_AUDIO[cue.cue];
      const audio = createAudio(audioPlan.src);
      let cleanup: (() => void) | null = null;
      if (!options.createAudio) {
        cleanup = routeAudioElementToPrismOutput(
          audio as unknown as HTMLMediaElement,
        );
        if (!cleanup && replayAudioMasterCaptureActive()) return;
      }
      audio.preload = "auto";
      audio.volume = cue.gain;
      audio.playbackRate = audioPlan.playbackRate;
      if ("preservesPitch" in audio) audio.preservesPitch = true;
      const release = (): void => {
        cleanup?.();
        cleanup = null;
        audio.pause();
        audio.currentTime = 0;
      };
      audio.addEventListener("ended", release, { once: true });
      audio.addEventListener("error", release, { once: true });
      void audio.play().catch(release);
    };
    if (cue.delayMs > 0) schedule(play, cue.delayMs);
    else play();
    foleyScheduled = true;
  };
  return gainScheduled || foleyScheduled;
}
