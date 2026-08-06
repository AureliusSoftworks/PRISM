"use client";

import {
  replayAudioMasterCaptureActive,
  routeAudioElementToPrismOutput,
} from "./replayAudioMasterCapture.ts";

export type DebateIdentKind = "intro" | "outro";

export const DEBATE_IDENT_AUDIO = {
  intro: {
    url: "/audio/debate/living-chamber-intro.mp3",
    durationMs: 7_053,
  },
  outro: {
    url: "/audio/debate/living-chamber-outro.mp3",
    durationMs: 4_545,
  },
} as const satisfies Record<
  DebateIdentKind,
  { url: string; durationMs: number }
>;

export const DEBATE_IDENT_OUTRO_LEAD_MS = 420;
export const DEBATE_IDENT_STOP_FADE_MS = 320;

/** Quiet chamber settle after the intro card before the first spoken beat. */
export const DEBATE_OPENING_CHAMBER_FADE_MS = 5_000;

interface ActiveDebateIdent {
  audio: HTMLAudioElement;
  outputCleanup: (() => void) | null;
  resolve: () => void;
  stopPromise: Promise<void> | null;
  timeoutId: number | null;
}

let activeIdent: ActiveDebateIdent | null = null;
let requestedPlaybackId = 0;

function clampAudioLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function debateIdentFadeVolume(
  initialVolume: number,
  progress: number,
): number {
  const normalizedProgress = clampAudioLevel(progress);
  return (
    clampAudioLevel(initialVolume) *
    Math.cos((normalizedProgress * Math.PI) / 2)
  );
}

function finishDebateIdent(entry: ActiveDebateIdent): void {
  if (entry.timeoutId !== null && typeof window !== "undefined") {
    window.clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
  entry.outputCleanup?.();
  entry.outputCleanup = null;
  entry.audio.pause();
  if (activeIdent === entry) activeIdent = null;
  entry.resolve();
}

async function stopActiveDebateIdent(
  fadeMs = DEBATE_IDENT_STOP_FADE_MS,
): Promise<void> {
  const entry = activeIdent;
  if (!entry) return;
  if (entry.stopPromise) {
    await entry.stopPromise;
    return;
  }
  const durationMs = Math.max(0, fadeMs);
  if (entry.audio.paused || durationMs <= 0 || typeof window === "undefined") {
    finishDebateIdent(entry);
    return;
  }
  const initialVolume = entry.audio.volume;
  const startedAt = Date.now();
  entry.stopPromise = new Promise<void>((resolve) => {
    const intervalId = window.setInterval(() => {
      if (activeIdent !== entry) {
        window.clearInterval(intervalId);
        resolve();
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      entry.audio.volume = debateIdentFadeVolume(initialVolume, progress);
      if (progress < 1) return;
      window.clearInterval(intervalId);
      finishDebateIdent(entry);
      resolve();
    }, 20);
  });
  await entry.stopPromise;
}

export async function stopDebateIdentAudio(
  fadeMs = DEBATE_IDENT_STOP_FADE_MS,
): Promise<void> {
  requestedPlaybackId += 1;
  await stopActiveDebateIdent(fadeMs);
}

export function setDebateIdentAudioVolume(volume: number): void {
  if (!activeIdent || activeIdent.stopPromise) return;
  activeIdent.audio.volume = clampAudioLevel(volume);
}

export async function playDebateIdentAudio(args: {
  kind: DebateIdentKind;
  enabled: boolean;
  volume: number;
}): Promise<void> {
  const playbackId = requestedPlaybackId + 1;
  requestedPlaybackId = playbackId;
  await stopActiveDebateIdent();
  if (requestedPlaybackId !== playbackId) return;

  const cue = DEBATE_IDENT_AUDIO[args.kind];
  if (
    !args.enabled ||
    args.volume <= 0 ||
    typeof Audio === "undefined" ||
    typeof window === "undefined"
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    const audio = new Audio(cue.url);
    audio.preload = "auto";
    audio.volume = clampAudioLevel(args.volume);
    const entry: ActiveDebateIdent = {
      audio,
      outputCleanup: routeAudioElementToPrismOutput(audio),
      resolve,
      stopPromise: null,
      timeoutId: null,
    };
    if (!entry.outputCleanup && replayAudioMasterCaptureActive()) {
      resolve();
      return;
    }
    activeIdent = entry;
    const finish = (): void => {
      if (activeIdent !== entry) return;
      finishDebateIdent(entry);
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    audio.load();
    void audio.play().catch(finish);
    entry.timeoutId = window.setTimeout(finish, cue.durationMs + 1_500);
  });
}
