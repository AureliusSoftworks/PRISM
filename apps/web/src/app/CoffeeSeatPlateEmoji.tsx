"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from "react";
import {
  BOT_FACE_BLINK_BAR_VALUES,
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_PAIRED_EYE_ROTATION_DEG,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  botFaceThinkingSpinnerDisabled,
  botFaceThinkingFramesEqual,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceBlinkOffsetX,
  normalizeBotFaceBlinkOffsetY,
  normalizeBotFaceBlinkScale,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  normalizeBotFaceThinkingFrames,
  type BotFaceBlinkBar,
  type BotFaceEyeCount,
  type BotFaceFontId,
  type BotFaceGlyphAnimation,
  type BotFaceThinkingFrames,
  type BotVoicePreset,
} from "@localai/shared";
import {
  applyCoffeeSeatBlink,
  type CoffeeSeatBlinkPhase,
} from "./coffee-seat-plate-blink.ts";
import {
  ZEN_LIVE_MOUTH_PHASE_MS,
  type ZenLiveBotMouthShape,
} from "./zenLiveMouth.ts";
import { coffeeSeatGlyphOpticalOffset } from "./coffee-seat-glyph-optical-offset.ts";

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

function normalizeFaceFontWeight(
  weight: number | null | undefined,
): number | undefined {
  if (typeof weight !== "number" || !Number.isFinite(weight)) return undefined;
  return Math.max(300, Math.min(800, weight));
}

function faceWeightStrokeForWeight(
  weight: number | undefined,
): string | undefined {
  if (weight === undefined) return undefined;
  const t = Math.max(0, Math.min(1, (weight - 300) / 500));
  return `${(t * 0.032).toFixed(3)}em`;
}

function faceWeightGlowRadiusScaleForWeight(
  weight: number | undefined,
): string | undefined {
  if (weight === undefined) return undefined;
  if (weight <= 500) {
    const t = Math.max(0, Math.min(1, (weight - 300) / 200));
    return (0.56 + t * 0.44).toFixed(3);
  }
  const t = Math.max(0, Math.min(1, (weight - 500) / 300));
  return (1 + t * 0.36).toFixed(3);
}

function faceWeightGlowStrengthScaleForWeight(
  weight: number | undefined,
): string | undefined {
  if (weight === undefined) return undefined;
  if (weight <= 500) {
    const t = Math.max(0, Math.min(1, (weight - 300) / 200));
    return (0.36 + t * 0.64).toFixed(3);
  }
  const t = Math.max(0, Math.min(1, (weight - 500) / 300));
  return (1 + t * 0.34).toFixed(3);
}

function faceWeightGlowStrokeForWeight(
  weight: number | undefined,
): string | undefined {
  if (weight === undefined) return undefined;
  const t = Math.max(0, Math.min(1, (weight - 300) / 500));
  return `${(0.004 + t * 0.026).toFixed(3)}em`;
}

function rotatedFaceOffset(
  x: number | undefined,
  y: number | undefined,
  rotateDeg: number,
): { x: number; y: number } | null {
  if (x === undefined && y === undefined) return null;
  const radians = (rotateDeg * Math.PI) / 180;
  const authoredX = x ?? 0;
  const authoredY = y ?? 0;
  return {
    x: Number(
      (authoredX * Math.cos(radians) + authoredY * Math.sin(radians)).toFixed(
        3,
      ),
    ),
    y: Number(
      (authoredY * Math.cos(radians) - authoredX * Math.sin(radians)).toFixed(
        3,
      ),
    ),
  };
}

function screenRelativeFacePartRotationDeg(
  valueDeg: number,
  rotateDeg: number,
): number {
  const wrapped = ((((valueDeg - rotateDeg + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : Number(wrapped.toFixed(3));
}

function coffeeSeatEmojiPartForGlyph(args: {
  baseText: string;
  baseGlyph: string | undefined;
  index: number;
}): "eyes" | "mouth" {
  if (
    Array.from(args.baseText).some((glyph) =>
      COFFEE_SEAT_SIP_MOUTH_GLYPHS.has(glyph),
    )
  ) {
    return args.baseGlyph !== undefined &&
      COFFEE_SEAT_SIP_MOUTH_GLYPHS.has(args.baseGlyph)
      ? "mouth"
      : "eyes";
  }
  return args.index === 0 ? "eyes" : "mouth";
}

function coffeeSeatFaceTextWithEyeCharacter(
  baseText: string,
  eyeCharacter: string | null,
): string {
  if (!eyeCharacter) return baseText;
  const [baseEye] = Array.from(baseText);
  if (!baseEye) return eyeCharacter;
  return `${eyeCharacter}${baseText.slice(baseEye.length)}`;
}

function updateCustomMouthSpinOrigin(
  element: HTMLElement,
  glyph: string,
): void {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return;
  const computed = window.getComputedStyle(element);
  context.font = [
    computed.fontStyle,
    computed.fontWeight,
    computed.fontSize,
    computed.fontFamily,
  ].join(" ");
  const metrics = context.measureText(glyph);
  const fontSize = Number.parseFloat(computed.fontSize);
  const lineHeight = Number.parseFloat(computed.lineHeight);
  const resolvedLineHeight = Number.isFinite(lineHeight)
    ? lineHeight
    : fontSize;
  const fontAscent =
    metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
  const fontDescent =
    metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;
  const baselineY =
    (resolvedLineHeight - fontAscent - fontDescent) / 2 + fontAscent;
  const inkCenterX =
    (-metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) / 2;
  const inkCenterY =
    baselineY +
    (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
  element.style.setProperty(
    "--bot-face-mouth-spin-origin-x",
    `${inkCenterX}px`,
  );
  element.style.setProperty(
    "--bot-face-mouth-spin-origin-y",
    `${inkCenterY}px`,
  );
}

export type CoffeeSeatPlateEmojiProps = {
  /** When false, eyes stay open and timers are cleared (preview / not joined). */
  enabled: boolean;
  /** While this seat is doing table typewriter speech, no blink timers run. */
  isTalking: boolean;
  /** Full streamed-text viseme used to animate authored custom mouth glyphs. */
  mouthShape?: ZenLiveBotMouthShape | null;
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
  faceMouthCharacter?: string | null;
  faceMouthAnimation?: BotFaceGlyphAnimation | null;
  faceFontWeight?: number | null;
  faceEyeScale?: number | null;
  faceEyeOffsetX?: number | null;
  faceEyeOffsetY?: number | null;
  faceEyeRotationDeg?: number | null;
  faceEyeCount?: BotFaceEyeCount | number | null;
  faceMouthScale?: number | null;
  faceMouthOffsetX?: number | null;
  faceMouthOffsetY?: number | null;
  faceMouthRotationDeg?: number | null;
  faceBlinkBar?: BotFaceBlinkBar | null;
  faceBlinkScale?: number | null;
  faceBlinkOffsetX?: number | null;
  faceBlinkOffsetY?: number | null;
  faceThinkingFrames?: BotFaceThinkingFrames | string[] | null;
  forceBlinkPhase?: CoffeeSeatBlinkPhase | null;
  /** Reports the final displayed phase so adjacent persistent ink can follow it. */
  onBlinkPhaseChange?: (phase: CoffeeSeatBlinkPhase) => void;
  className: string;
};

type CoffeeSeatPlateBlinkState = {
  phase: CoffeeSeatBlinkPhase;
  key: string;
};

const COFFEE_SEAT_THINKING_SPINNER_FRAME_MS = 142;
const COFFEE_SEAT_SIP_MOUTH_GLYPHS = new Set(["*", "⁎"]);
const COFFEE_SEAT_TALKING_BLINK_GAP_MULTIPLIER = 1.35;
const CUSTOM_MOUTH_SPIN_PHASES_PER_TURN = 4;
const CUSTOM_MOUTH_SPIN_TURN_MS =
  ZEN_LIVE_MOUTH_PHASE_MS * CUSTOM_MOUTH_SPIN_PHASES_PER_TURN;

function coffeeSeatClosedBlinkHoldMs(): number {
  return randomBetween(112, 178);
}

function coffeeSeatBlinkGapMs(talking = false): number {
  const gapMs = randomBetween(1500, 4000);
  return talking
    ? gapMs * COFFEE_SEAT_TALKING_BLINK_GAP_MULTIPLIER
    : gapMs;
}

function coffeeSeatExtraBlinkGapMs(): number {
  return randomBetween(118, 260);
}

function coffeeSeatExtraBlinkCount(talking = false): number {
  const roll = Math.random();
  if (talking) {
    if (roll < 0.03) return 2;
    if (roll < 0.14) return 1;
    return 0;
  }
  if (roll < 0.05) return 2;
  if (roll < 0.22) return 1;
  return 0;
}

/**
 * Renders the vertical plate emoticon with a timer-driven blink independent of
 * typewriter mouth animation and Prism mood.
 */
export function CoffeeSeatPlateEmoji({
  enabled,
  isTalking,
  mouthShape,
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
  faceMouthCharacter,
  faceMouthAnimation,
  faceFontWeight,
  faceEyeScale,
  faceEyeOffsetX,
  faceEyeOffsetY,
  faceEyeRotationDeg,
  faceEyeCount,
  faceMouthScale,
  faceMouthOffsetX,
  faceMouthOffsetY,
  faceMouthRotationDeg,
  faceBlinkBar,
  faceBlinkScale,
  faceBlinkOffsetX,
  faceBlinkOffsetY,
  faceThinkingFrames,
  forceBlinkPhase,
  onBlinkPhaseChange,
  className,
}: CoffeeSeatPlateEmojiProps): JSX.Element {
  const normalizedThinkingFrames =
    normalizeBotFaceThinkingFrames(faceThinkingFrames) ??
    DEFAULT_BOT_FACE_THINKING_FRAMES;
  const thinkingSpinnerActive =
    enabled &&
    showThinkingSpinner &&
    !isTalking &&
    !botFaceThinkingSpinnerDisabled(normalizedThinkingFrames);
  const questionGlyphActive = !thinkingSpinnerActive && showQuestionMark;
  const faceMode = thinkingSpinnerActive
    ? "thinking"
    : questionGlyphActive
      ? "question"
      : "face";
  const normalizedFaceEyeCharacter =
    normalizeBotFaceEyeCharacter(faceEyeCharacter);
  const normalizedFaceEyeCount = normalizedFaceEyeCharacter
    ? (normalizeBotFaceEyeCount(faceEyeCount) ?? 1)
    : 1;
  const normalizedFaceMouthCharacter =
    normalizeBotFaceMouthCharacter(faceMouthCharacter);
  const normalizedFaceMouthAnimation =
    normalizeBotFaceGlyphAnimation(faceMouthAnimation) ?? "none";
  // Default means the authored glyph is the resting mouth while speech uses
  // the same |/∙/@/o/0/O viseme sequence as every standard bot mouth. Alternate
  // effects keep the custom glyph visible and reinterpret those speech beats.
  const renderedFaceMouthCharacter =
    isTalking && normalizedFaceMouthAnimation === "none"
      ? null
      : normalizedFaceMouthCharacter;
  const normalizedFaceBlinkBar =
    normalizeBotFaceBlinkBar(faceBlinkBar) ?? DEFAULT_BOT_FACE_BLINK_BAR;
  const customBlinkBarActive = !BOT_FACE_BLINK_BAR_VALUES.some(
    (blinkBar) => blinkBar === normalizedFaceBlinkBar,
  );
  const faceBlinkRotationCssDeg =
    customBlinkBarActive && normalizedFaceEyeCount === 2
      ? DEFAULT_BOT_FACE_PAIRED_EYE_ROTATION_DEG
      : 0;
  const forcedBlinkPhase =
    forceBlinkPhase === "open" || forceBlinkPhase === "closed"
      ? forceBlinkPhase
      : null;
  const faceText = coffeeSeatFaceTextWithEyeCharacter(
    baseText,
    normalizedFaceEyeCharacter,
  );
  const faceBlinkDisabled = normalizedFaceBlinkBar === "none";
  const talkingPausesBlink = isTalking && !blinkWhileTalking;
  const blinkKey = `${enabled ? "enabled" : "disabled"}:${talkingPausesBlink ? "talking" : "idle"}:${faceMode}:${normalizedFaceBlinkBar}:${faceText}:${scheduleKey}`;
  const [blinkState, setBlinkState] = useState<CoffeeSeatPlateBlinkState>({
    phase: "open",
    key: blinkKey,
  });
  const [thinkingSpinnerFrameIndex, setThinkingSpinnerFrameIndex] = useState(0);
  const customMouthGlyphRef = useRef<HTMLSpanElement | null>(null);
  const isTalkingRef = useRef(isTalking);
  const blinkPhase = blinkState.key === blinkKey ? blinkState.phase : "open";

  useEffect(() => {
    isTalkingRef.current = isTalking;
  }, [isTalking]);

  useLayoutEffect(() => {
    const element = customMouthGlyphRef.current;
    if (
      !element ||
      !renderedFaceMouthCharacter ||
      normalizedFaceMouthAnimation !== "spin"
    ) {
      return;
    }
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      updateCustomMouthSpinOrigin(element, renderedFaceMouthCharacter);
    };
    const frameId = window.requestAnimationFrame(measure);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [
    faceFontWeight,
    faceMouthFont,
    normalizedFaceMouthAnimation,
    renderedFaceMouthCharacter,
  ]);

  useEffect(() => {
    setBlinkState({ phase: "open", key: blinkKey });

    if (
      !enabled ||
      faceBlinkDisabled ||
      talkingPausesBlink ||
      forcedBlinkPhase !== null ||
      thinkingSpinnerActive ||
      questionGlyphActive
    ) {
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

    const armBlink = (delayMs: number, remainingExtraBlinks: number) => {
      arm(() => {
        if (cancelled) return;
        setBlinkState({ phase: "closed", key: blinkKey });
        arm(() => {
          if (cancelled) return;
          setBlinkState({ phase: "open", key: blinkKey });
          if (remainingExtraBlinks > 0) {
            armBlink(coffeeSeatExtraBlinkGapMs(), remainingExtraBlinks - 1);
            return;
          }
          armNextBlink();
        }, coffeeSeatClosedBlinkHoldMs());
      }, delayMs);
    };

    const armNextBlink = () => {
      const talking = blinkWhileTalking && isTalkingRef.current;
      armBlink(
        coffeeSeatBlinkGapMs(talking),
        coffeeSeatExtraBlinkCount(talking),
      );
    };

    arm(armNextBlink, startJitter);

    return () => {
      cancelled = true;
      clearAll();
    };
  }, [
    blinkWhileTalking,
    blinkKey,
    enabled,
    faceBlinkDisabled,
    forcedBlinkPhase,
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
        (index) => (index + 1) % normalizedThinkingFrames.length,
      );
    }, COFFEE_SEAT_THINKING_SPINNER_FRAME_MS);

    return () => {
      clearInterval(id);
    };
  }, [normalizedThinkingFrames.length, thinkingSpinnerActive]);

  const displayBlinkPhase: CoffeeSeatBlinkPhase =
    !enabled ||
    faceBlinkDisabled ||
    talkingPausesBlink ||
    thinkingSpinnerActive ||
    questionGlyphActive
      ? "open"
      : (forcedBlinkPhase ?? blinkPhase);
  useLayoutEffect(() => {
    onBlinkPhaseChange?.(displayBlinkPhase);
  }, [displayBlinkPhase, onBlinkPhaseChange]);
  const displayText = applyCoffeeSeatBlink(faceText, displayBlinkPhase, {
    eyeCharacter: normalizedFaceEyeCharacter,
    blinkBar: normalizedFaceBlinkBar,
  });
  const glyphParts = Array.from(displayText);
  const baseGlyphParts = Array.from(baseText);
  const displayGlyphCount =
    thinkingSpinnerActive || questionGlyphActive
      ? 1
      : renderedFaceMouthCharacter
        ? Math.max(
            1,
            glyphParts.filter((glyph, index) => {
              const part = coffeeSeatEmojiPartForGlyph({
                baseText,
                baseGlyph: baseGlyphParts[index],
                index,
              });
              return part !== "mouth";
            }).length + 1,
          )
        : glyphParts.length;
  const normalizedFaceWeight = thinkingSpinnerActive
    ? undefined
    : normalizeFaceFontWeight(faceFontWeight);
  const normalizedFaceEyeScale =
    thinkingSpinnerActive || questionGlyphActive
      ? undefined
      : (normalizeBotFaceEyeScale(faceEyeScale) ?? undefined);
  const normalizedFaceEyeOffsetX =
    thinkingSpinnerActive || questionGlyphActive
      ? undefined
      : (normalizeBotFaceEyeOffsetX(faceEyeOffsetX) ?? undefined);
  const normalizedFaceEyeOffsetY =
    thinkingSpinnerActive || questionGlyphActive
      ? undefined
      : (normalizeBotFaceEyeOffsetY(faceEyeOffsetY) ?? undefined);
  const normalizedFaceEyeRotationDeg =
    thinkingSpinnerActive || questionGlyphActive || !normalizedFaceEyeCharacter
      ? undefined
      : (normalizeBotFaceEyeRotationDeg(faceEyeRotationDeg) ?? undefined);
  const normalizedFaceBlinkScale =
    thinkingSpinnerActive || questionGlyphActive || !customBlinkBarActive
      ? undefined
      : (normalizeBotFaceBlinkScale(faceBlinkScale) ?? undefined);
  const normalizedFaceBlinkOffsetX =
    thinkingSpinnerActive || questionGlyphActive || !customBlinkBarActive
      ? undefined
      : (normalizeBotFaceBlinkOffsetX(faceBlinkOffsetX) ?? undefined);
  const normalizedFaceBlinkOffsetY =
    thinkingSpinnerActive || questionGlyphActive || !customBlinkBarActive
      ? undefined
      : (normalizeBotFaceBlinkOffsetY(faceBlinkOffsetY) ?? undefined);
  const normalizedFaceMouthScale =
    thinkingSpinnerActive || questionGlyphActive
      ? undefined
      : (normalizeBotFaceMouthScale(faceMouthScale) ?? undefined);
  const normalizedFaceMouthOffsetX =
    thinkingSpinnerActive || questionGlyphActive
      ? undefined
      : (normalizeBotFaceMouthOffsetX(faceMouthOffsetX) ?? undefined);
  const normalizedFaceMouthOffsetY =
    thinkingSpinnerActive || questionGlyphActive
      ? undefined
      : (normalizeBotFaceMouthOffsetY(faceMouthOffsetY) ?? undefined);
  const normalizedFaceMouthRotationDeg =
    thinkingSpinnerActive || questionGlyphActive || !renderedFaceMouthCharacter
      ? undefined
      : (normalizeBotFaceMouthRotationDeg(faceMouthRotationDeg) ?? undefined);
  const faceMouthRotationCssDeg =
    normalizedFaceMouthRotationDeg === undefined
      ? undefined
      : screenRelativeFacePartRotationDeg(
          normalizedFaceMouthRotationDeg,
          rotateDeg,
        );
  const faceEyeRotationCssDeg =
    normalizedFaceEyeRotationDeg === undefined
      ? undefined
      : normalizedFaceEyeRotationDeg;
  const faceEyeOffset = rotatedFaceOffset(
    normalizedFaceEyeOffsetX,
    normalizedFaceEyeOffsetY,
    rotateDeg,
  );
  const faceBlinkOffset = rotatedFaceOffset(
    normalizedFaceBlinkOffsetX,
    normalizedFaceBlinkOffsetY,
    rotateDeg,
  );
  const faceMouthOffset = rotatedFaceOffset(
    normalizedFaceMouthOffsetX,
    normalizedFaceMouthOffsetY,
    rotateDeg,
  );
  const inferredMouthOpen =
    !thinkingSpinnerActive &&
    !questionGlyphActive &&
    (/[0oOI]/.test(baseText) ||
      Array.from(baseText).some((glyph) =>
        COFFEE_SEAT_SIP_MOUTH_GLYPHS.has(glyph),
      ));
  const streamedMouthShape =
    mouthShape ?? (inferredMouthOpen ? "open-wide" : "closed");
  const mouthOpen =
    isTalking &&
    streamedMouthShape !== "closed" &&
    streamedMouthShape !== "speech-closed" &&
    streamedMouthShape !== "narrow" &&
    streamedMouthShape !== "dot";
  const thinkingSpinnerGlyph =
    normalizedThinkingFrames[
      thinkingSpinnerFrameIndex % normalizedThinkingFrames.length
    ];

  return (
    <span
      className={className}
      data-coffee-plate-emoji-glyphs={displayGlyphCount}
      data-coffee-plate-thinking-spinner={
        thinkingSpinnerActive ? "true" : undefined
      }
      data-coffee-plate-question-glyph={
        questionGlyphActive ? "true" : undefined
      }
      data-coffee-plate-emoji-eyes-open={
        displayBlinkPhase === "closed" ? "false" : "true"
      }
      data-coffee-plate-emoji-blink-phase={displayBlinkPhase}
      data-voice-preset={voicePreset}
      data-face-custom={
        faceEyesFont ||
        normalizedFaceEyeCharacter ||
        faceMouthFont ||
        normalizedFaceMouthCharacter ||
        faceFontWeight ||
        normalizedFaceEyeScale ||
        normalizedFaceEyeOffsetX ||
        normalizedFaceEyeOffsetY ||
        normalizedFaceEyeRotationDeg ||
        normalizedFaceBlinkScale ||
        normalizedFaceBlinkOffsetX ||
        normalizedFaceBlinkOffsetY ||
        normalizedFaceMouthScale ||
        normalizedFaceMouthOffsetX ||
        normalizedFaceMouthOffsetY ||
        normalizedFaceMouthRotationDeg ||
        normalizedFaceBlinkBar !== DEFAULT_BOT_FACE_BLINK_BAR ||
        !botFaceThinkingFramesEqual(
          normalizedThinkingFrames,
          DEFAULT_BOT_FACE_THINKING_FRAMES,
        )
          ? "true"
          : undefined
      }
      data-face-eye-character={normalizedFaceEyeCharacter ?? undefined}
      data-face-eye-count={
        normalizedFaceEyeCharacter ? normalizedFaceEyeCount : undefined
      }
      data-face-mouth-character={renderedFaceMouthCharacter ?? undefined}
      data-face-mouth-animation={
        renderedFaceMouthCharacter ? normalizedFaceMouthAnimation : undefined
      }
      data-talking={isTalking ? "true" : undefined}
      data-face-blink-bar={normalizedFaceBlinkBar}
      data-coffee-plate-mouth-open={mouthOpen ? "true" : undefined}
      data-coffee-plate-mouth-shape={isTalking ? streamedMouthShape : undefined}
      style={
        {
          ["--bot-face-font-weight" as string]: normalizedFaceWeight,
          ["--bot-face-weight-stroke" as string]:
            faceWeightStrokeForWeight(normalizedFaceWeight),
          ["--bot-face-weight-glow-radius-scale" as string]:
            faceWeightGlowRadiusScaleForWeight(normalizedFaceWeight),
          ["--bot-face-weight-glow-strength-scale" as string]:
            faceWeightGlowStrengthScaleForWeight(normalizedFaceWeight),
          ["--bot-face-weight-glow-stroke" as string]:
            faceWeightGlowStrokeForWeight(normalizedFaceWeight),
          ["--bot-face-eye-scale" as string]: normalizedFaceEyeScale,
          ["--bot-face-eye-offset-x" as string]:
            faceEyeOffset === null ? undefined : `${faceEyeOffset.x}em`,
          ["--bot-face-eye-offset-y" as string]:
            faceEyeOffset === null ? undefined : `${faceEyeOffset.y}em`,
          ["--bot-face-eye-rotation" as string]:
            faceEyeRotationCssDeg === undefined
              ? undefined
              : `${faceEyeRotationCssDeg}deg`,
          ["--bot-face-blink-scale" as string]: normalizedFaceBlinkScale,
          ["--bot-face-blink-rotation" as string]: `${faceBlinkRotationCssDeg}deg`,
          ["--bot-face-blink-offset-x" as string]:
            faceBlinkOffset === null ? undefined : `${faceBlinkOffset.x}em`,
          ["--bot-face-blink-offset-y" as string]:
            faceBlinkOffset === null ? undefined : `${faceBlinkOffset.y}em`,
          ["--bot-face-mouth-scale" as string]: normalizedFaceMouthScale,
          ["--bot-face-mouth-offset-x" as string]:
            faceMouthOffset === null ? undefined : `${faceMouthOffset.x}em`,
          ["--bot-face-mouth-offset-y" as string]:
            faceMouthOffset === null ? undefined : `${faceMouthOffset.y}em`,
          ["--bot-face-mouth-rotation" as string]:
            faceMouthRotationCssDeg === undefined
              ? undefined
              : `${faceMouthRotationCssDeg}deg`,
          ["--bot-face-mouth-spin-turn-duration" as string]: `${CUSTOM_MOUTH_SPIN_TURN_MS}ms`,
          transform: `translateX(${thinkingSpinnerActive || questionGlyphActive ? "0px" : "var(--coffee-plate-emoji-flip-anchor-x, 0px)"}) translateY(var(--coffee-plate-emoji-nudge-y)) rotate(${thinkingSpinnerActive || questionGlyphActive ? 0 : rotateDeg}deg) scale(var(--coffee-seat-emotion-face-scale, 1)) scaleY(${thinkingSpinnerActive || questionGlyphActive ? 1 : "var(--coffee-plate-emoji-face-scale-y, 1)"})`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {thinkingSpinnerActive ? (
        <span
          data-coffee-plate-thinking-frame="true"
          data-coffee-plate-thinking-frame-index={thinkingSpinnerFrameIndex}
          data-coffee-plate-thinking-glyph={thinkingSpinnerGlyph}
          data-face-font={faceMouthFont ?? undefined}
        >
          <span
            data-crt-glyph-layer="true"
            data-crt-glyph-content={thinkingSpinnerGlyph}
          >
            {thinkingSpinnerGlyph}
          </span>
        </span>
      ) : questionGlyphActive ? (
        <span
          data-coffee-plate-question-frame="true"
          data-coffee-plate-question-glyph="?"
          data-face-font={faceMouthFont ?? faceEyesFont ?? undefined}
        >
          <span data-crt-glyph-layer="true" data-crt-glyph-content="?">
            ?
          </span>
        </span>
      ) : (
        (() => {
          let customMouthRendered = false;
          return glyphParts.map((glyph, index) => {
            const part = coffeeSeatEmojiPartForGlyph({
              baseText,
              baseGlyph: baseGlyphParts[index],
              index,
            });
            if (part === "mouth" && renderedFaceMouthCharacter) {
              if (customMouthRendered) return null;
              customMouthRendered = true;
            }
            const renderedGlyph =
              part === "mouth" && renderedFaceMouthCharacter
                ? renderedFaceMouthCharacter
                : glyph;
            const renderCustomEyePair =
              part === "eyes" &&
              normalizedFaceEyeCharacter !== null &&
              normalizedFaceEyeCount === 2 &&
              displayBlinkPhase !== "closed";
            const partFaceFont = part === "eyes" ? faceEyesFont : faceMouthFont;
            const opticalOffset = coffeeSeatGlyphOpticalOffset({
              part,
              glyph: renderedGlyph,
              voicePreset,
              rotateDeg,
              pairedEye: renderCustomEyePair,
            });
            return (
              <span
                key={`${part}-${index}`}
                data-coffee-plate-emoji-glyph={renderedGlyph}
                data-coffee-plate-emoji-part={part}
                data-coffee-plate-emoji-blink-glyph={
                  displayBlinkPhase === "closed" && part === "eyes"
                    ? "true"
                    : undefined
                }
                data-face-font={partFaceFont ?? undefined}
                data-coffee-plate-optical-shift={opticalOffset?.id}
                style={
                  opticalOffset
                    ? ({
                        "--bot-face-optical-offset-x": `${opticalOffset.x}em`,
                        "--bot-face-optical-offset-y": `${opticalOffset.y}em`,
                      } as CSSProperties)
                    : undefined
                }
              >
                {renderCustomEyePair ? (
                  <span data-custom-eye-pair="true">
                    <span
                      data-custom-eye-pair-side="left"
                      data-crt-glyph-layer="true"
                      data-crt-glyph-content={renderedGlyph}
                    >
                      {renderedGlyph}
                    </span>
                    <span
                      data-custom-eye-pair-side="right"
                      data-crt-glyph-layer="true"
                      data-crt-glyph-content={renderedGlyph}
                    >
                      {renderedGlyph}
                    </span>
                  </span>
                ) : (
                  <span
                    ref={
                      part === "mouth" && renderedFaceMouthCharacter
                        ? customMouthGlyphRef
                        : undefined
                    }
                    data-crt-glyph-layer="true"
                    data-crt-glyph-content={renderedGlyph}
                  >
                    {renderedGlyph}
                  </span>
                )}
              </span>
            );
          });
        })()
      )}
    </span>
  );
}
