"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionAmbientBotVocalizationCue } from "./session-atmosphere-audio.ts";
import type { ZenLiveBotMouthShape } from "./zenLiveMouth.ts";

/** Ambient foley holds the CRT “oh” vowel (`open-small` → `:o`) while sounding. */
const AMBIENT_BOT_VOCALIZATION_MOUTH_FRAMES = {
  "throat-clear": [
    "speech-closed",
    "narrow",
    "open-small",
    "open-small",
    "open-small",
    "narrow",
    "speech-closed",
  ],
  "mouth-sound": [
    "speech-closed",
    "open-small",
    "open-small",
    "dot",
    "speech-closed",
  ],
  "lip-smack": [
    "speech-closed",
    "dot",
    "open-small",
    "open-small",
    "speech-closed",
  ],
  "soft-sigh": [
    "speech-closed",
    "narrow",
    "open-small",
    "open-small",
    "open-small",
    "speech-closed",
  ],
  "soft-inhale": [
    "speech-closed",
    "narrow",
    "open-small",
    "open-small",
    "speech-closed",
  ],
} as const satisfies Record<
  SessionAmbientBotVocalizationCue["kind"],
  readonly ZenLiveBotMouthShape[]
>;

export interface ActiveAmbientBotVocalization {
  targetId: string;
  cue: SessionAmbientBotVocalizationCue;
  startedAtMs: number;
  elapsedMs: number;
}

export function ambientBotVocalizationMouthShapeAtElapsedMs(
  cue: Pick<SessionAmbientBotVocalizationCue, "durationMs" | "kind">,
  elapsedMs: number,
): ZenLiveBotMouthShape {
  if (elapsedMs < 0 || elapsedMs >= cue.durationMs) return "closed";
  const frames = AMBIENT_BOT_VOCALIZATION_MOUTH_FRAMES[cue.kind];
  const progress = Math.max(0, Math.min(0.999, elapsedMs / cue.durationMs));
  return frames[Math.floor(progress * frames.length)] ?? "speech-closed";
}

export function useAmbientBotVocalization(): {
  active: ActiveAmbientBotVocalization | null;
  start: (targetId: string, cue: SessionAmbientBotVocalizationCue) => void;
  stop: () => void;
  mouthShapeForTarget: (targetId: string) => ZenLiveBotMouthShape;
} {
  const [active, setActive] = useState<ActiveAmbientBotVocalization | null>(
    null,
  );

  const start = useCallback(
    (targetId: string, cue: SessionAmbientBotVocalizationCue): void => {
      setActive({ targetId, cue, startedAtMs: Date.now(), elapsedMs: 0 });
    },
    [],
  );
  const stop = useCallback((): void => setActive(null), []);

  useEffect(() => {
    if (!active) return;
    const sequenceKey = active.cue.sequenceKey;
    const startedAtMs = active.startedAtMs;
    const tick = (): void => {
      const elapsedMs = Date.now() - startedAtMs;
      setActive((current) => {
        if (current?.cue.sequenceKey !== sequenceKey) return current;
        return elapsedMs >= current.cue.durationMs
          ? null
          : { ...current, elapsedMs };
      });
    };
    const intervalId = window.setInterval(tick, 120);
    const timeoutId = window.setTimeout(tick, active.cue.durationMs + 20);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [active?.cue.sequenceKey, active?.startedAtMs]);

  const mouthShapeForTarget = useCallback(
    (targetId: string): ZenLiveBotMouthShape =>
      active?.targetId === targetId
        ? ambientBotVocalizationMouthShapeAtElapsedMs(
            active.cue,
            active.elapsedMs,
          )
        : "closed",
    [active],
  );

  return { active, start, stop, mouthShapeForTarget };
}
