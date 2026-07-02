"use client";

import { useEffect, useState, type CSSProperties, type JSX } from "react";
import type { BotFaceFontId, BotVoicePreset } from "@localai/shared";
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

function faceInflateScaleForWeight(weight: number | null | undefined): number | undefined {
  if (typeof weight !== "number" || !Number.isFinite(weight)) return undefined;
  const clamped = Math.max(300, Math.min(900, weight));
  return 0.92 + ((clamped - 300) / 600) * 0.18;
}

function coffeeSeatEmojiPartForGlyph(args: {
  baseText: string;
  baseGlyph: string | undefined;
  index: number;
}): "eyes" | "mouth" {
  if (args.baseText.includes("*")) {
    return args.baseGlyph === "*" ? "mouth" : "eyes";
  }
  return args.index === 0 ? "eyes" : "mouth";
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
  faceEyesFont?: BotFaceFontId | null;
  faceMouthFont?: BotFaceFontId | null;
  faceFontWeight?: number | null;
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
  faceEyesFont,
  faceMouthFont,
  faceFontWeight,
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
  const baseGlyphParts = Array.from(baseText);
  const faceInflateScale = faceInflateScaleForWeight(faceFontWeight);

  return (
    <span
      className={className}
      data-coffee-plate-emoji-glyphs={glyphParts.length}
      data-coffee-plate-emoji-eyes-open={
        displayEyesOpen ? "true" : "false"
      }
      data-voice-preset={voicePreset}
      data-face-custom={
        faceEyesFont || faceMouthFont || faceFontWeight ? "true" : undefined
      }
      style={{
        ["--bot-face-font-weight" as string]: faceFontWeight ?? undefined,
        ["--bot-face-inflate-scale" as string]: faceInflateScale,
        transform: `translateY(var(--coffee-plate-emoji-nudge-y)) rotate(${rotateDeg}deg) scale(var(--coffee-seat-emotion-face-scale, 1)) scale(var(--bot-face-inflate-scale, 1)) scaleY(var(--coffee-plate-emoji-face-scale-y, 1))`,
      } as CSSProperties}
      aria-hidden="true"
    >
      {glyphParts.map((glyph, index) => (
        (() => {
          const part = coffeeSeatEmojiPartForGlyph({
            baseText,
            baseGlyph: baseGlyphParts[index],
            index,
          });
          return (
            <span
              key={`${part}-${index}`}
              data-coffee-plate-emoji-glyph={glyph}
              data-coffee-plate-emoji-part={part}
              data-face-font={part === "eyes" ? faceEyesFont ?? undefined : faceMouthFont ?? undefined}
            >
              {glyph}
            </span>
          );
        })()
      ))}
    </span>
  );
}
