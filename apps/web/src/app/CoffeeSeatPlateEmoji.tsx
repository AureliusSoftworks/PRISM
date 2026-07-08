"use client";

import { useEffect, useState, type CSSProperties, type JSX } from "react";
import {
  normalizeBotFaceEyeCharacter,
  type BotFaceFontId,
  type BotVoicePreset,
} from "@localai/shared";
import {
  applyCoffeeSeatBlink,
  type CoffeeSeatBlinkPhase,
} from "./coffee-seat-plate-blink.ts";

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

function normalizeFaceFontWeight(weight: number | null | undefined): number | undefined {
  if (typeof weight !== "number" || !Number.isFinite(weight)) return undefined;
  return Math.max(300, Math.min(800, weight));
}

function faceWeightStrokeForWeight(weight: number | undefined): string | undefined {
  if (weight === undefined) return undefined;
  const t = Math.max(0, Math.min(1, (weight - 300) / 500));
  return `${(t * 0.056).toFixed(3)}em`;
}

function coffeeSeatEmojiPartForGlyph(args: {
  baseText: string;
  baseGlyph: string | undefined;
  index: number;
}): "eyes" | "mouth" {
  if (Array.from(args.baseText).some((glyph) => COFFEE_SEAT_SIP_MOUTH_GLYPHS.has(glyph))) {
    return args.baseGlyph !== undefined && COFFEE_SEAT_SIP_MOUTH_GLYPHS.has(args.baseGlyph)
      ? "mouth"
      : "eyes";
  }
  return args.index === 0 ? "eyes" : "mouth";
}

function coffeeSeatFaceTextWithEyeCharacter(
  baseText: string,
  eyeCharacter: string | null
): string {
  if (!eyeCharacter) return baseText;
  const [baseEye] = Array.from(baseText);
  if (!baseEye) return eyeCharacter;
  return `${eyeCharacter}${baseText.slice(baseEye.length)}`;
}

export type CoffeeSeatPlateEmojiProps = {
  /** When false, eyes stay open and timers are cleared (preview / not joined). */
  enabled: boolean;
  /** While this seat is doing table typewriter speech, no blink timers run. */
  isTalking: boolean;
  /** Allows editor/previews to keep eye blinks independent of mouth motion. */
  blinkWhileTalking?: boolean;
  /** Used only to de-sync blink timers between seats. */
  scheduleKey: string;
  /** Replaces the face while this seat is waiting for visible table text. */
  showThinkingSpinner?: boolean;
  /** Replaces the two-part face with a single question-mark glyph. */
  showQuestionMark?: boolean;
  baseText: string;
  rotateDeg: number;
  voicePreset: BotVoicePreset;
  faceEyesFont?: BotFaceFontId | null;
  faceEyeCharacter?: string | null;
  faceMouthFont?: BotFaceFontId | null;
  faceFontWeight?: number | null;
  className: string;
};

type CoffeeSeatPlateBlinkState = {
  phase: CoffeeSeatBlinkPhase;
  key: string;
};

const COFFEE_SEAT_BLINK_HALF_FRAME_MS = 46;
const COFFEE_SEAT_THINKING_SPINNER_FRAME_MS = 142;
const COFFEE_SEAT_THINKING_SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;
const COFFEE_SEAT_SIP_MOUTH_GLYPHS = new Set(["*", "⁎"]);

function coffeeSeatClosedBlinkHoldMs(): number {
  return randomBetween(58, 92);
}

/**
 * Renders the vertical plate emoticon with a timer-driven blink independent of
 * typewriter mouth animation and Prism mood.
 */
export function CoffeeSeatPlateEmoji({
  enabled,
  isTalking,
  blinkWhileTalking = false,
  scheduleKey,
  showThinkingSpinner = false,
  showQuestionMark = false,
  baseText,
  rotateDeg,
  voicePreset,
  faceEyesFont,
  faceEyeCharacter,
  faceMouthFont,
  faceFontWeight,
  className,
}: CoffeeSeatPlateEmojiProps): JSX.Element {
  const thinkingSpinnerActive = enabled && showThinkingSpinner && !isTalking;
  const questionGlyphActive = !thinkingSpinnerActive && showQuestionMark;
  const faceMode = thinkingSpinnerActive
    ? "thinking"
    : questionGlyphActive
      ? "question"
      : "face";
  const normalizedFaceEyeCharacter = normalizeBotFaceEyeCharacter(faceEyeCharacter);
  const faceText = coffeeSeatFaceTextWithEyeCharacter(
    baseText,
    normalizedFaceEyeCharacter
  );
  const talkingPausesBlink = isTalking && !blinkWhileTalking;
  const blinkKey = `${enabled ? "enabled" : "disabled"}:${talkingPausesBlink ? "talking" : "idle"}:${faceMode}:${faceText}:${scheduleKey}`;
  const [blinkState, setBlinkState] = useState<CoffeeSeatPlateBlinkState>({
    phase: "open",
    key: blinkKey,
  });
  const [thinkingSpinnerFrameIndex, setThinkingSpinnerFrameIndex] = useState(0);
  const blinkPhase = blinkState.key === blinkKey ? blinkState.phase : "open";

  useEffect(() => {
    setBlinkState({ phase: "open", key: blinkKey });

    if (!enabled || talkingPausesBlink || thinkingSpinnerActive || questionGlyphActive) {
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
        setBlinkState({ phase: "half", key: blinkKey });
        arm(() => {
          if (cancelled) return;
          setBlinkState({ phase: "closed", key: blinkKey });
          arm(() => {
            if (cancelled) return;
            setBlinkState({ phase: "half", key: blinkKey });
            arm(() => {
              if (cancelled) return;
              setBlinkState({ phase: "open", key: blinkKey });
              armNextBlink();
            }, COFFEE_SEAT_BLINK_HALF_FRAME_MS);
          }, coffeeSeatClosedBlinkHoldMs());
        }, COFFEE_SEAT_BLINK_HALF_FRAME_MS);
      }, randomBetween(1500, 4000));
    };

    arm(armNextBlink, startJitter);

    return () => {
      cancelled = true;
      clearAll();
    };
  }, [
    blinkKey,
    enabled,
    questionGlyphActive,
    scheduleKey,
    thinkingSpinnerActive,
    talkingPausesBlink,
  ]);

  useEffect(() => {
    if (!thinkingSpinnerActive) {
      return;
    }

    const id = setInterval(() => {
      setThinkingSpinnerFrameIndex(
        (index) => (index + 1) % COFFEE_SEAT_THINKING_SPINNER_FRAMES.length
      );
    }, COFFEE_SEAT_THINKING_SPINNER_FRAME_MS);

    return () => {
      clearInterval(id);
    };
  }, [thinkingSpinnerActive]);

  const displayBlinkPhase: CoffeeSeatBlinkPhase =
    !enabled || talkingPausesBlink || thinkingSpinnerActive || questionGlyphActive
      ? "open"
      : blinkPhase;
  const displayText = applyCoffeeSeatBlink(faceText, displayBlinkPhase, {
    eyeCharacter: normalizedFaceEyeCharacter,
  });
  const glyphParts = Array.from(displayText);
  const baseGlyphParts = Array.from(baseText);
  const normalizedFaceWeight = thinkingSpinnerActive
    ? undefined
    : normalizeFaceFontWeight(faceFontWeight);
  const mouthOpen =
    !thinkingSpinnerActive &&
    !questionGlyphActive &&
    (/[0oO]/.test(baseText) ||
      Array.from(baseText).some((glyph) => COFFEE_SEAT_SIP_MOUTH_GLYPHS.has(glyph)));
  const thinkingSpinnerGlyph =
    COFFEE_SEAT_THINKING_SPINNER_FRAMES[
      thinkingSpinnerFrameIndex % COFFEE_SEAT_THINKING_SPINNER_FRAMES.length
    ];

  return (
    <span
      className={className}
      data-coffee-plate-emoji-glyphs={
        thinkingSpinnerActive || questionGlyphActive ? 1 : glyphParts.length
      }
      data-coffee-plate-thinking-spinner={thinkingSpinnerActive ? "true" : undefined}
      data-coffee-plate-question-glyph={questionGlyphActive ? "true" : undefined}
      data-coffee-plate-emoji-eyes-open={
        displayBlinkPhase === "closed" ? "false" : "true"
      }
      data-coffee-plate-emoji-blink-phase={displayBlinkPhase}
      data-voice-preset={voicePreset}
      data-face-custom={
        faceEyesFont || normalizedFaceEyeCharacter || faceMouthFont || faceFontWeight
          ? "true"
          : undefined
      }
      data-face-eye-character={normalizedFaceEyeCharacter ?? undefined}
      data-coffee-plate-mouth-open={mouthOpen ? "true" : undefined}
      style={{
        ["--bot-face-font-weight" as string]: normalizedFaceWeight,
        ["--bot-face-weight-stroke" as string]: faceWeightStrokeForWeight(normalizedFaceWeight),
        transform: `translateX(${thinkingSpinnerActive || questionGlyphActive ? "0px" : "var(--coffee-plate-emoji-flip-anchor-x, 0px)"}) translateY(var(--coffee-plate-emoji-nudge-y)) rotate(${thinkingSpinnerActive || questionGlyphActive ? 0 : rotateDeg}deg) scale(var(--coffee-seat-emotion-face-scale, 1)) scaleY(${thinkingSpinnerActive || questionGlyphActive ? 1 : "var(--coffee-plate-emoji-face-scale-y, 1)"})`,
      } as CSSProperties}
      aria-hidden="true"
    >
      {thinkingSpinnerActive ? (
        <span
          data-coffee-plate-thinking-frame="true"
          data-coffee-plate-thinking-frame-index={thinkingSpinnerFrameIndex}
          data-coffee-plate-thinking-glyph={thinkingSpinnerGlyph}
          data-face-font={faceMouthFont ?? undefined}
        >
          {thinkingSpinnerGlyph}
        </span>
      ) : questionGlyphActive ? (
        <span
          data-coffee-plate-question-frame="true"
          data-coffee-plate-question-glyph="?"
          data-face-font={faceMouthFont ?? faceEyesFont ?? undefined}
        >
          ?
        </span>
      ) : (
        glyphParts.map((glyph, index) => {
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
              data-face-font={
                part === "eyes" ? faceEyesFont ?? undefined : faceMouthFont ?? undefined
              }
            >
              {glyph}
            </span>
          );
        })
      )}
    </span>
  );
}
