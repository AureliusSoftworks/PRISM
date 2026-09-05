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

interface ActiveDebateIdent {
  audio: HTMLAudioElement;
  outputCleanup: (() => void) | null;
  resolve: () => void;
  stopPromise: Promise<void> | null;
  timeoutId: number | null;
}

let activeIdent: ActiveDebateIdent | null = null;
let requestedPlaybackId = 0;
const preparedIdentAudio = new Map<DebateIdentKind, HTMLAudioElement>();
const identPreloadPromises = new Map<DebateIdentKind, Promise<void>>();

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

/**
 * Warms and decodes a title cue before its card is declared ready. The same
 * element is consumed by playback so a local cache hit cannot still leave a
 * perceptible decode gap between the gallery preload and its music.
 */
export async function preloadDebateIdentAudio(
  kind: DebateIdentKind,
): Promise<void> {
  if (typeof Audio === "undefined" || typeof window === "undefined") return;
  const existing = preparedIdentAudio.get(kind);
  if (existing && existing.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }
  const pending = identPreloadPromises.get(kind);
  if (pending) {
    await pending;
    return;
  }
  const cue = DEBATE_IDENT_AUDIO[kind];
  const audio = existing ?? new Audio(cue.url);
  audio.preload = "auto";
  preparedIdentAudio.set(kind, audio);
  const promise = new Promise<void>((resolve) => {
    let settled = false;
    const finish = (keepPrepared: boolean): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      audio.removeEventListener("loadeddata", handleReady);
      audio.removeEventListener("canplaythrough", handleReady);
      audio.removeEventListener("error", handleError);
      if (!keepPrepared && preparedIdentAudio.get(kind) === audio) {
        preparedIdentAudio.delete(kind);
      }
      resolve();
    };
    const handleReady = (): void => finish(true);
    const handleError = (): void => finish(false);
    const timeoutId = window.setTimeout(
      () => finish(audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA),
      2_500,
    );
    audio.addEventListener("loadeddata", handleReady, { once: true });
    audio.addEventListener("canplaythrough", handleReady, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    audio.load();
  }).finally(() => {
    identPreloadPromises.delete(kind);
  });
  identPreloadPromises.set(kind, promise);
  await promise;
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
    const audio = preparedIdentAudio.get(args.kind) ?? new Audio(cue.url);
    preparedIdentAudio.delete(args.kind);
    audio.preload = "auto";
    audio.currentTime = 0;
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
