"use client";

import { useEffect, useState, type JSX } from "react";
import type { BotVoicePreset } from "@localai/shared";
import { applyCoffeeSeatBlink } from "./coffee-seat-plate-blink.ts";

function randomBetween(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function scheduleKeyDigest(key: string): number {
  let n = 0;
  for (let i = 0; i < key.length; i += 1) {
    n += key.charCodeAt(i);
  }
  return n;
}

export type CoffeeSeatPlateEmojiProps = {
  /** When false, eyes stay open and timers are cleared (preview / not joined). */
  enabled: boolean;
  /** While this seat is doing table typewriter speech, no blink timers run. */
  isTalking: boolean;
  /** Used only to de-sync blink timers between seats. */
  scheduleKey: string;
  baseText: string;
  rotateDeg: number;
  voicePreset: BotVoicePreset;
  className: string;
};

type CoffeeSeatPlateBlinkState = {
  eyesOpen: boolean;
  key: string;
};

/**
 * Renders the vertical plate emoticon with a timer-driven blink independent of
 * typewriter mouth animation and Prism mood.
 */
export function CoffeeSeatPlateEmoji({
  enabled,
  isTalking,
  scheduleKey,
  baseText,
  rotateDeg,
  voicePreset,
  className,
}: CoffeeSeatPlateEmojiProps): JSX.Element {
  const blinkKey = `${enabled ? "enabled" : "disabled"}:${isTalking ? "talking" : "idle"}:${baseText}:${scheduleKey}`;
  const [blinkState, setBlinkState] = useState<CoffeeSeatPlateBlinkState>({
    eyesOpen: true,
    key: blinkKey,
  });
  const eyesOpen = blinkState.key === blinkKey ? blinkState.eyesOpen : true;

  useEffect(() => {
    if (!enabled || isTalking) {
      return;
    }

    let cancelled = false;
    const handles: ReturnType<typeof setTimeout>[] = [];

    const arm = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      handles.push(id);
      return id;
    };

    const clearAll = () => {
      for (const id of handles) {
        clearTimeout(id);
      }
      handles.length = 0;
    };

    const digest = scheduleKeyDigest(scheduleKey);
    const startJitter = digest % 1200;

    const armNextBlink = () => {
      arm(() => {
        if (cancelled) return;
        setBlinkState({ eyesOpen: false, key: blinkKey });
        arm(() => {
          if (cancelled) return;
          setBlinkState({ eyesOpen: true, key: blinkKey });
          armNextBlink();
        }, randomBetween(80, 140));
      }, randomBetween(1500, 4000));
    };

    arm(armNextBlink, startJitter);

    return () => {
      cancelled = true;
      clearAll();
    };
  }, [blinkKey, enabled, isTalking, scheduleKey]);

  const displayEyesOpen = !enabled || isTalking || eyesOpen;
  const displayText = applyCoffeeSeatBlink(baseText, displayEyesOpen);
  const glyphParts = Array.from(displayText);

  return (
    <span
      className={className}
      data-coffee-plate-emoji-glyphs={glyphParts.length}
      data-coffee-plate-emoji-eyes-open={
        glyphParts[0]?.trim() ? "true" : "false"
      }
      data-voice-preset={voicePreset}
      style={{
        transform: `translateY(var(--coffee-plate-emoji-nudge-y)) rotate(${rotateDeg}deg) scale(var(--coffee-seat-emotion-face-scale, 1)) scaleY(var(--coffee-plate-emoji-face-scale-y, 1))`,
      }}
      aria-hidden="true"
    >
      {glyphParts.map((glyph, index) => (
        <span
          key={index === 0 ? "eyes" : "mouth"}
          data-coffee-plate-emoji-glyph={glyph}
          data-coffee-plate-emoji-part={index === 0 ? "eyes" : "mouth"}
        >
          {glyph}
        </span>
      ))}
    </span>
  );
}
