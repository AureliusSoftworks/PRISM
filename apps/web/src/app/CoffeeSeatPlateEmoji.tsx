"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from "react";
import {
  BOT_FACE_BLINK_BAR_VALUES,
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_EYE_SPACING,
  DEFAULT_BOT_FACE_PAIRED_EYE_ROTATION_DEG,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  botFaceThinkingSpinnerDisabled,
  botFaceThinkingFramesEqual,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceBlinkOffsetX,
  normalizeBotFaceBlinkOffsetY,
  normalizeBotFaceBlinkRotationDeg,
  normalizeBotFaceBlinkScale,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeSpacing,
  normalizeBotFaceEyeMovement,
  botFaceEyeMovementIsActive,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceThinkingOffsetX,
  normalizeBotFaceThinkingOffsetY,
  normalizeBotFaceThinkingScale,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  normalizeBotFaceThinkingFrames,
  type BotFaceBlinkBar,
  type BotFaceEyeCount,
  type BotFaceEyeMovement,
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
  ZEN_LIVE_CUSTOM_MOUTH_SPIN_TURN_MS,
  type ZenLiveBotMouthShape,
} from "./zenLiveMouth.ts";
import { coffeeSeatGlyphOpticalOffset } from "./coffee-seat-glyph-optical-offset.ts";
import {
  coffeeSeatMouthRotationCssDeg,
  coffeeSeatScreenRelativeFeatureRotationDeg,
} from "./coffee-seat-plate.ts";
import {
  botFaceEyeMovementLiveIntervalMs,
  resolveBotFaceGazeFrame,
  type BotFaceAttentionState,
  type BotFaceGazeDirection,
} from "./botFaceEyeMovement.ts";
import { CrtPixelTextGlyph } from "./PhosphorPixelGlyph";

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

function updateCustomMouthMotionOrigins(
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
  const paddingInlineStart =
    Number.parseFloat(computed.paddingInlineStart) || 0;
  const paddingInlineEnd = Number.parseFloat(computed.paddingInlineEnd) || 0;
  const paddingBlockStart = Number.parseFloat(computed.paddingBlockStart) || 0;
  const paddingBlockEnd = Number.parseFloat(computed.paddingBlockEnd) || 0;
  const fontAscent =
    metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
  const fontDescent =
    metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;
  const contentWidth = Math.max(
    0,
    element.clientWidth - paddingInlineStart - paddingInlineEnd,
  );
  const contentHeight = Math.max(
    0,
    element.clientHeight - paddingBlockStart - paddingBlockEnd,
  );
  const textStartX =
    paddingInlineStart + Math.max(0, (contentWidth - metrics.width) / 2);
  const lineBoxTop =
    paddingBlockStart + Math.max(0, (contentHeight - resolvedLineHeight) / 2);
  const baselineY =
    lineBoxTop +
    (resolvedLineHeight - fontAscent - fontDescent) / 2 +
    fontAscent;
  const inkCenterX =
    textStartX +
    (-metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) / 2;
  const inkCenterY =
    baselineY +
    (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
  element.style.setProperty(
    "--bot-face-mouth-origin-x",
    `${inkCenterX}px`,
  );
  element.style.setProperty(
    "--bot-face-mouth-origin-y",
    `${inkCenterY}px`,
  );
  element.style.setProperty(
    "--bot-face-mouth-wobble-origin-x",
    `${inkCenterX}px`,
  );
  element.style.setProperty(
    "--bot-face-mouth-wobble-origin-y",
    `${inkCenterY}px`,
  );
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
  /** Quantizes the rendered font silhouette to the full-avatar phosphor grid. */
  pixelated?: boolean;
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
  faceEyeMovement?: BotFaceEyeMovement | null;
  eyeAttentionState?: BotFaceAttentionState;
  eyeTargetDirection?: BotFaceGazeDirection;
  eyeTimelineMs?: number | null;
  eyeStateStartedAtMs?: number | null;
  faceMouthFont?: BotFaceFontId | null;
  faceMouthCharacter?: string | null;
  faceMouthAnimation?: BotFaceGlyphAnimation | null;
  /** Retained for portable bot data; face weight adjustment is disabled. */
  faceFontWeight?: number | null;
  faceEyeScale?: number | null;
  faceEyeOffsetX?: number | null;
  faceEyeOffsetY?: number | null;
  faceEyeRotationDeg?: number | null;
  faceEyeCount?: BotFaceEyeCount | number | null;
  faceEyeSpacing?: number | null;
  faceMouthScale?: number | null;
  faceMouthOffsetX?: number | null;
  faceMouthOffsetY?: number | null;
  faceMouthRotationDeg?: number | null;
  faceBlinkBar?: BotFaceBlinkBar | null;
  faceBlinkScale?: number | null;
  faceBlinkOffsetX?: number | null;
  faceBlinkOffsetY?: number | null;
  faceBlinkRotationDeg?: number | null;
  faceThinkingFrames?: BotFaceThinkingFrames | string[] | null;
  faceThinkingScale?: number | null;
  faceThinkingOffsetX?: number | null;
  faceThinkingOffsetY?: number | null;
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
  pixelated = false,
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
  faceEyeMovement,
  eyeAttentionState = "idle",
  eyeTargetDirection = 0,
  eyeTimelineMs,
  eyeStateStartedAtMs,
  faceMouthFont,
  faceMouthCharacter,
  faceMouthAnimation,
  faceEyeScale,
  faceEyeOffsetX,
  faceEyeOffsetY,
  faceEyeRotationDeg,
  faceEyeCount,
  faceEyeSpacing,
  faceMouthScale,
  faceMouthOffsetX,
  faceMouthOffsetY,
  faceMouthRotationDeg,
  faceBlinkBar,
  faceBlinkScale,
  faceBlinkOffsetX,
  faceBlinkOffsetY,
  faceBlinkRotationDeg,
  faceThinkingFrames,
  faceThinkingScale,
  faceThinkingOffsetX,
  faceThinkingOffsetY,
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
  const normalizedFaceEyeSpacing =
    normalizeBotFaceEyeSpacing(faceEyeSpacing) ?? DEFAULT_BOT_FACE_EYE_SPACING;
  const normalizedFaceMouthCharacter =
    normalizeBotFaceMouthCharacter(faceMouthCharacter);
  const transientSipPucker =
    normalizedFaceMouthCharacter !== null &&
    COFFEE_SEAT_SIP_MOUTH_GLYPHS.has(normalizedFaceMouthCharacter) &&
    !Array.from(baseText).some((glyph) =>
      COFFEE_SEAT_SIP_MOUTH_GLYPHS.has(glyph),
    );
  const normalizedFaceMouthAnimation =
    normalizeBotFaceGlyphAnimation(faceMouthAnimation) ?? "none";
  // Default mouths clear the authored glyph while talking so the plate
  // viseme (or mini binary `:0`) can drive the mouth.
  // "static" keeps the authored custom glyph visible and unanimated while
  // talking for a stable presentation.
  const hasCustomMouth = normalizedFaceMouthCharacter !== null;
  const renderedFaceMouthCharacter =
    hasCustomMouth && isTalking && normalizedFaceMouthAnimation === "none"
      ? null
      : normalizedFaceMouthCharacter;
  const normalizedFaceBlinkBar =
    normalizeBotFaceBlinkBar(faceBlinkBar) ?? DEFAULT_BOT_FACE_BLINK_BAR;
  const customBlinkBarActive = !BOT_FACE_BLINK_BAR_VALUES.some(
    (blinkBar) => blinkBar === normalizedFaceBlinkBar,
  );
  const forcedBlinkPhase =
    forceBlinkPhase === "open" || forceBlinkPhase === "closed"
      ? forceBlinkPhase
      : null;
  const faceText = coffeeSeatFaceTextWithEyeCharacter(
    baseText,
    normalizedFaceEyeCharacter,
  );
  const baseTextGlyphs = Array.from(baseText);
  const renderedMouthGlyphForMotion =
    renderedFaceMouthCharacter ??
    Array.from(faceText).find(
      (_glyph, index) =>
        coffeeSeatEmojiPartForGlyph({
          baseText,
          baseGlyph: baseTextGlyphs[index],
          index,
        }) === "mouth",
    ) ??
    null;
  const faceBlinkDisabled = normalizedFaceBlinkBar === "none";
  const talkingPausesBlink = isTalking && !blinkWhileTalking;
  const blinkKey = `${enabled ? "enabled" : "disabled"}:${talkingPausesBlink ? "talking" : "idle"}:${faceMode}:${normalizedFaceBlinkBar}:${faceText}:${scheduleKey}`;
  const [blinkState, setBlinkState] = useState<CoffeeSeatPlateBlinkState>({
    phase: "open",
    key: blinkKey,
  });
  const [thinkingSpinnerFrameIndex, setThinkingSpinnerFrameIndex] = useState(0);
  const [liveEyeTimelineMs, setLiveEyeTimelineMs] = useState(0);
  const [displayGaze, setDisplayGaze] = useState({
    xPx: 0,
    yPx: 0,
    transitionMs: 0,
  });
  const [gazeSnapsOpen, setGazeSnapsOpen] = useState(false);
  const customMouthGlyphRef = useRef<HTMLSpanElement | null>(null);
  const previousBlinkPhaseRef = useRef<CoffeeSeatBlinkPhase>("open");
  const isTalkingRef = useRef(isTalking);
  const blinkPhase = blinkState.key === blinkKey ? blinkState.phase : "open";

  useEffect(() => {
    isTalkingRef.current = isTalking;
  }, [isTalking]);

  const normalizedEyeMovement =
    normalizeBotFaceEyeMovement(faceEyeMovement) ?? "still";
  const eyeMovementActive = botFaceEyeMovementIsActive(normalizedEyeMovement);
  useEffect(() => {
    if (
      !eyeMovementActive ||
      (eyeTimelineMs !== undefined && eyeTimelineMs !== null) ||
      !enabled ||
      thinkingSpinnerActive ||
      questionGlyphActive
    ) {
      setLiveEyeTimelineMs(0);
      return;
    }
    const startedAt = performance.now();
    setLiveEyeTimelineMs(0);
    const intervalMs = botFaceEyeMovementLiveIntervalMs(normalizedEyeMovement);
    const id = window.setInterval(() => {
      setLiveEyeTimelineMs(performance.now() - startedAt);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [
    enabled,
    eyeAttentionState,
    eyeMovementActive,
    eyeTargetDirection,
    eyeTimelineMs,
    normalizedEyeMovement,
    questionGlyphActive,
    scheduleKey,
    thinkingSpinnerActive,
  ]);

  useLayoutEffect(() => {
    const element = customMouthGlyphRef.current;
    if (
      !element ||
      !renderedMouthGlyphForMotion ||
      thinkingSpinnerActive ||
      questionGlyphActive
    ) {
      return;
    }
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      updateCustomMouthMotionOrigins(element, renderedMouthGlyphForMotion);
    };
    const frameId = window.requestAnimationFrame(measure);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [
    faceMouthFont,
    questionGlyphActive,
    renderedMouthGlyphForMotion,
    thinkingSpinnerActive,
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
  const eyeTimeline =
    typeof eyeTimelineMs === "number" && Number.isFinite(eyeTimelineMs)
      ? Math.max(0, eyeTimelineMs)
      : liveEyeTimelineMs;
  const resolvedGaze = useMemo(
    () =>
      eyeMovementActive &&
      enabled &&
      !thinkingSpinnerActive &&
      !questionGlyphActive
        ? resolveBotFaceGazeFrame({
            seed: scheduleKey,
            timelineMs: eyeTimeline,
            stateStartedAtMs:
              typeof eyeStateStartedAtMs === "number"
                ? eyeStateStartedAtMs
                : 0,
            state: eyeAttentionState,
            targetDirection: eyeTargetDirection,
            movement: normalizedEyeMovement,
          })
        : { xPx: 0, yPx: 0, transitionMs: 0 },
    [
      enabled,
      eyeAttentionState,
      eyeMovementActive,
      eyeStateStartedAtMs,
      eyeTargetDirection,
      eyeTimeline,
      normalizedEyeMovement,
      questionGlyphActive,
      scheduleKey,
      thinkingSpinnerActive,
    ],
  );
  useLayoutEffect(() => {
    onBlinkPhaseChange?.(displayBlinkPhase);
  }, [displayBlinkPhase, onBlinkPhaseChange]);
  useLayoutEffect(() => {
    if (displayBlinkPhase === "closed") {
      previousBlinkPhaseRef.current = "closed";
      return;
    }
    const reopened = previousBlinkPhaseRef.current === "closed";
    previousBlinkPhaseRef.current = "open";
    setDisplayGaze(resolvedGaze);
    if (!reopened) return;
    setGazeSnapsOpen(true);
    const frameId = window.requestAnimationFrame(() => {
      setGazeSnapsOpen(false);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [displayBlinkPhase, resolvedGaze]);
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
    thinkingSpinnerActive || questionGlyphActive
      ? undefined
      : (normalizeBotFaceEyeRotationDeg(faceEyeRotationDeg) ?? undefined);
  const normalizedFaceBlinkScale =
    thinkingSpinnerActive || questionGlyphActive || faceBlinkDisabled
      ? undefined
      : (normalizeBotFaceBlinkScale(faceBlinkScale) ?? undefined);
  const normalizedFaceBlinkOffsetX =
    thinkingSpinnerActive || questionGlyphActive || faceBlinkDisabled
      ? undefined
      : (normalizeBotFaceBlinkOffsetX(faceBlinkOffsetX) ?? undefined);
  const normalizedFaceBlinkOffsetY =
    thinkingSpinnerActive || questionGlyphActive || faceBlinkDisabled
      ? undefined
      : (normalizeBotFaceBlinkOffsetY(faceBlinkOffsetY) ?? undefined);
  const normalizedFaceBlinkRotationDeg =
    thinkingSpinnerActive || questionGlyphActive || faceBlinkDisabled
      ? undefined
      : (normalizeBotFaceBlinkRotationDeg(faceBlinkRotationDeg) ?? 0);
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
    thinkingSpinnerActive || questionGlyphActive
      ? undefined
      : (normalizeBotFaceMouthRotationDeg(faceMouthRotationDeg) ?? undefined);
  const normalizedFaceThinkingScale =
    normalizeBotFaceThinkingScale(faceThinkingScale) ?? undefined;
  const normalizedFaceThinkingOffsetX =
    normalizeBotFaceThinkingOffsetX(faceThinkingOffsetX) ?? undefined;
  const normalizedFaceThinkingOffsetY =
    normalizeBotFaceThinkingOffsetY(faceThinkingOffsetY) ?? undefined;
  const faceMouthRotationCssDeg = coffeeSeatMouthRotationCssDeg({
    authoredRotationDeg: normalizedFaceMouthRotationDeg ?? 0,
    faceRotationDeg: rotateDeg,
    configuredCustomMouth: normalizedFaceMouthCharacter !== null,
    renderedCustomMouth: renderedFaceMouthCharacter !== null,
    transientSipPucker,
  });
  const faceEyeRotationCssDeg =
    normalizedFaceEyeRotationDeg === undefined
      ? undefined
      : normalizedFaceEyeCharacter
        ? coffeeSeatScreenRelativeFeatureRotationDeg(
            normalizedFaceEyeRotationDeg,
            rotateDeg,
          )
        : normalizedFaceEyeRotationDeg;
  const faceBlinkRotationCssDeg =
    (normalizedFaceBlinkRotationDeg ?? 0) +
    (customBlinkBarActive && normalizedFaceEyeCount === 2
      ? DEFAULT_BOT_FACE_PAIRED_EYE_ROTATION_DEG
      : 0);
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
    !hasCustomMouth &&
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
      data-face-eye-movement={
        eyeMovementActive ? normalizedEyeMovement : undefined
      }
      data-face-eye-gaze-snap={gazeSnapsOpen ? "true" : undefined}
      data-voice-preset={voicePreset}
      data-face-custom={
        faceEyesFont ||
        normalizedFaceEyeCharacter ||
        faceMouthFont ||
        normalizedFaceMouthCharacter ||
        normalizedFaceEyeScale ||
        normalizedFaceEyeOffsetX ||
        normalizedFaceEyeOffsetY ||
        normalizedFaceEyeRotationDeg ||
        normalizedFaceBlinkScale ||
        normalizedFaceBlinkOffsetX ||
        normalizedFaceBlinkOffsetY ||
        normalizedFaceBlinkRotationDeg ||
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
      data-face-eye-spacing={
        normalizedFaceEyeCharacter && normalizedFaceEyeCount === 2
          ? normalizedFaceEyeSpacing
          : undefined
      }
      data-face-mouth-character={renderedFaceMouthCharacter ?? undefined}
      data-face-transient-pucker={transientSipPucker ? "true" : undefined}
      data-face-mouth-animation={
        renderedFaceMouthCharacter ? normalizedFaceMouthAnimation : undefined
      }
      data-talking={isTalking ? "true" : undefined}
      data-face-blink-bar={normalizedFaceBlinkBar}
      data-coffee-plate-mouth-open={mouthOpen ? "true" : undefined}
      data-coffee-plate-mouth-shape={isTalking ? streamedMouthShape : undefined}
      style={
        {
          ["--bot-face-eye-scale" as string]: normalizedFaceEyeScale,
          ["--bot-face-eye-spacing" as string]: `${normalizedFaceEyeSpacing}em`,
          ["--bot-face-gaze-x" as string]: `${displayGaze.xPx}px`,
          ["--bot-face-gaze-y" as string]: `${displayGaze.yPx}px`,
          ["--bot-face-gaze-transition-ms" as string]:
            `${displayGaze.transitionMs}ms`,
          ["--bot-face-eye-offset-x" as string]:
            faceEyeOffset === null ? undefined : `${faceEyeOffset.x}em`,
          ["--bot-face-eye-offset-y" as string]:
            faceEyeOffset === null ? undefined : `${faceEyeOffset.y}em`,
          ["--bot-face-eye-rotation" as string]:
            faceEyeRotationCssDeg === undefined
              ? undefined
              : `${faceEyeRotationCssDeg}deg`,
          ["--bot-face-blink-scale" as string]: normalizedFaceBlinkScale,
          ["--bot-face-blink-rotation" as string]:
            normalizedFaceBlinkRotationDeg === undefined
              ? undefined
              : `${faceBlinkRotationCssDeg}deg`,
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
          ["--bot-face-mouth-spin-turn-duration" as string]: `${ZEN_LIVE_CUSTOM_MOUTH_SPIN_TURN_MS}ms`,
          ["--bot-face-thinking-scale" as string]: normalizedFaceThinkingScale,
          ["--bot-face-thinking-offset-x" as string]:
            normalizedFaceThinkingOffsetX === undefined
              ? undefined
              : `${normalizedFaceThinkingOffsetX}em`,
          ["--bot-face-thinking-offset-y" as string]:
            normalizedFaceThinkingOffsetY === undefined
              ? undefined
              : `${normalizedFaceThinkingOffsetY}em`,
          transform: `translateX(${thinkingSpinnerActive || questionGlyphActive ? "0px" : "var(--coffee-plate-emoji-flip-anchor-x, 0px)"}) translateY(var(--coffee-plate-emoji-nudge-y, 0px)) rotate(${thinkingSpinnerActive || questionGlyphActive ? 0 : rotateDeg}deg) scale(var(--coffee-seat-emotion-face-scale, 1)) scaleY(${thinkingSpinnerActive || questionGlyphActive ? 1 : "var(--coffee-plate-emoji-face-scale-y, 1)"})`,
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
          <CrtPixelTextGlyph
            content={thinkingSpinnerGlyph}
            enabled={pixelated}
            rasterKey={faceMouthFont ?? "default"}
          />
        </span>
      ) : questionGlyphActive ? (
        <span
          data-coffee-plate-question-frame="true"
          data-coffee-plate-question-glyph="?"
          data-face-font={faceMouthFont ?? faceEyesFont ?? undefined}
        >
          <CrtPixelTextGlyph
            content="?"
            enabled={pixelated}
            rasterKey={faceMouthFont ?? faceEyesFont ?? "default"}
          />
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
            const renderCustomBlinkPair =
              part === "eyes" &&
              normalizedFaceEyeCharacter !== null &&
              normalizedFaceEyeCount === 2 &&
              displayBlinkPhase === "closed";
            const partFaceFont = part === "eyes" ? faceEyesFont : faceMouthFont;
            const opticalOffset = coffeeSeatGlyphOpticalOffset({
              part,
              glyph: renderedGlyph,
              voicePreset,
              rotateDeg,
              pairedEye: renderCustomEyePair || renderCustomBlinkPair,
              customGlyph:
                part === "mouth" && renderedFaceMouthCharacter !== null,
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
                {renderCustomEyePair || renderCustomBlinkPair ? (
                  <span data-custom-eye-pair="true">
                    <CrtPixelTextGlyph
                      data-custom-eye-pair-side="left"
                      content={renderedGlyph}
                      enabled={pixelated}
                      rasterKey={partFaceFont ?? "default"}
                    />
                    <CrtPixelTextGlyph
                      data-custom-eye-pair-side="right"
                      content={renderedGlyph}
                      enabled={pixelated}
                      rasterKey={partFaceFont ?? "default"}
                    />
                  </span>
                ) : (
                  <CrtPixelTextGlyph
                    ref={part === "mouth" ? customMouthGlyphRef : undefined}
                    content={renderedGlyph}
                    enabled={pixelated}
                    rasterKey={partFaceFont ?? "default"}
                  />
                )}
              </span>
            );
          });
        })()
      )}
    </span>
  );
}
