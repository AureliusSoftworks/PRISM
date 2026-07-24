import {
  crtSpeechMouthShapeFromVisibleTextProgress,
  zenLiveBotMouthShapeFromVisibleTextProgress,
  type ZenLiveBotMouthShape,
} from "./zenLiveMouth.ts";

export type CoffeeSeatEmojiMood =
  "happy" | "warm" | "neutral" | "sad" | "angry";

export const COFFEE_SEAT_ANGRY_BRACKET_GLYPH = ":[" as const;
export const COFFEE_SEAT_SIP_PLATE_GLYPH = {
  text: ":⁎",
  rotateDeg: 90,
} as const;
// Hold the pucker through most of the mug-up beat, then relax shortly before
// the cup begins its return at 76%.
export const COFFEE_SEAT_SIP_FACE_ACTIVE_PROGRESS = 0.68;
/** Hold each Coffee speaking mouth pose across a few revealed characters. */
export const COFFEE_SEAT_MOUTH_CHARACTERS_PER_PHASE = 3;
/** Bottish typewriter fallback holds poses closer to its audible syllables. */
export const COFFEE_SEAT_BOTTISH_MOUTH_CHARACTERS_PER_PHASE = 6;
const COFFEE_SEAT_SIP_MOUTH_OFFSET_EM = 0.48;
const COFFEE_SEAT_CENTER_SIP_MOUTH_OFFSET_EM = 0.36;
const COFFEE_SEAT_SIP_MOUTH_DROP_EM = 0.17;
const COFFEE_SEAT_CENTER_SIP_MOUTH_DROP_EM = 0.13;

export type CoffeeSeatSipPresentationReason =
  "explicit-sip" | "completed-sip-hold" | "cup-visual-sip" | "none";

export interface CoffeeSeatSipPresentation {
  active: boolean;
  reason: CoffeeSeatSipPresentationReason;
  glyph: typeof COFFEE_SEAT_SIP_PLATE_GLYPH | null;
  mouthOffsetX: string;
  mouthOffsetY: string;
}

export function coffeeSeatCustomMouthCharacterForSip(args: {
  mouthCharacter: string | null;
  coffeePuckerEnabled: boolean;
  sipActive: boolean;
}): string | null {
  if (
    args.sipActive &&
    args.coffeePuckerEnabled &&
    args.mouthCharacter !== null
  ) {
    return "⁎";
  }
  return args.mouthCharacter;
}

export function coffeeSeatScreenRelativeMouthRotationDeg(
  authoredRotationDeg: number,
  faceRotationDeg: number,
): number {
  const wrapped =
    ((((authoredRotationDeg - faceRotationDeg + 180) % 360) + 360) % 360) -
    180;
  return Object.is(wrapped, -0) ? 0 : Number(wrapped.toFixed(3));
}

export function coffeeSeatMouthShapeFromVisibleLength(
  visibleLength: number,
  speechSeedText: string,
  phonemeAware = false,
  charactersPerPhase = COFFEE_SEAT_MOUTH_CHARACTERS_PER_PHASE,
): ZenLiveBotMouthShape {
  if (phonemeAware) {
    return crtSpeechMouthShapeFromVisibleTextProgress({
      text: speechSeedText,
      visibleLength,
      charactersPerPhase: 1,
    });
  }
  return zenLiveBotMouthShapeFromVisibleTextProgress({
    text: speechSeedText,
    visibleLength,
    charactersPerPhase,
  });
}

function coffeeSeatTimedSipFaceActive(args: {
  ageMs: number;
  durationMs?: number | null;
}): boolean | null {
  const durationMs = args.durationMs;
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isFinite(args.ageMs) ||
    args.ageMs < 0
  ) {
    return null;
  }
  return args.ageMs <= durationMs * COFFEE_SEAT_SIP_FACE_ACTIVE_PROGRESS;
}

function coffeeSeatSipPresentationReason(args: {
  sipInProgress: boolean;
  completedSipAnimationAgeMs: number;
  completedSipAnimationDurationMs?: number | null;
  cupSipping?: boolean | null;
  seatIsFirmlySeated?: boolean | null;
  isSpeaking?: boolean | null;
}): CoffeeSeatSipPresentationReason {
  if (args.seatIsFirmlySeated === false || args.isSpeaking === true)
    return "none";
  const timedSipFaceActive = coffeeSeatTimedSipFaceActive({
    ageMs: args.completedSipAnimationAgeMs,
    durationMs: args.completedSipAnimationDurationMs,
  });
  // The live action can outlast its cup animation. Once we have animation
  // timing, let that clock release the pucker even if the action is still live.
  if (timedSipFaceActive === false) return "none";
  if (args.sipInProgress) return "explicit-sip";
  if (timedSipFaceActive === true) return "completed-sip-hold";
  if (args.cupSipping === true) return "cup-visual-sip";
  return "none";
}

export function coffeeSeatSipFaceActive(args: {
  sipInProgress: boolean;
  completedSipAnimationAgeMs: number;
  completedSipAnimationDurationMs?: number | null;
  cupSipping?: boolean | null;
  seatIsFirmlySeated?: boolean | null;
  isSpeaking?: boolean | null;
}): boolean {
  return coffeeSeatSipPresentationReason(args) !== "none";
}

export function coffeeSeatSipMouthOffsetY(args: {
  cupSide: "left" | "right";
  faceScaleY: string | number;
  seatHorizontalSide?: -1 | 0 | 1;
}): string {
  const sideSign = args.cupSide === "left" ? -1 : 1;
  const faceFlip =
    typeof args.faceScaleY === "number"
      ? args.faceScaleY < 0
      : String(args.faceScaleY).trim().startsWith("-");
  // The sip pucker is translated along the emoji's local Y axis; after the
  // parent face rotates 90deg, positive local Y moves toward screen-left.
  const faceFlipMultiplier =
    args.seatHorizontalSide === 0 ? 1 : faceFlip ? -1 : 1;
  const rimDirection = -sideSign * faceFlipMultiplier;
  const offsetEm =
    args.seatHorizontalSide === 0
      ? COFFEE_SEAT_CENTER_SIP_MOUTH_OFFSET_EM
      : COFFEE_SEAT_SIP_MOUTH_OFFSET_EM;
  return `${(offsetEm * rimDirection).toFixed(2)}em`;
}

export function coffeeSeatSipMouthOffsetX(args: {
  seatHorizontalSide?: -1 | 0 | 1;
}): string {
  // After the 90deg parent face rotation, positive local X reads as screen-down,
  // which puts the pucker closer to the lower cup rim.
  const dropEm =
    args.seatHorizontalSide === 0
      ? COFFEE_SEAT_CENTER_SIP_MOUTH_DROP_EM
      : COFFEE_SEAT_SIP_MOUTH_DROP_EM;
  return `${dropEm.toFixed(2)}em`;
}

export function resolveCoffeeSeatSipFacePresentation(args: {
  sipInProgress: boolean;
  completedSipAnimationAgeMs: number;
  completedSipAnimationDurationMs?: number | null;
  cupSipping?: boolean | null;
  seatIsFirmlySeated?: boolean | null;
  isSpeaking?: boolean | null;
  cupSide: "left" | "right";
  faceScaleY: string | number;
  seatHorizontalSide?: -1 | 0 | 1;
}): CoffeeSeatSipPresentation {
  const reason = coffeeSeatSipPresentationReason(args);
  const active = reason !== "none";
  return {
    active,
    reason,
    glyph: active ? COFFEE_SEAT_SIP_PLATE_GLYPH : null,
    mouthOffsetX: coffeeSeatSipMouthOffsetX({
      seatHorizontalSide: args.seatHorizontalSide,
    }),
    mouthOffsetY: coffeeSeatSipMouthOffsetY({
      cupSide: args.cupSide,
      faceScaleY: args.faceScaleY,
      seatHorizontalSide: args.seatHorizontalSide,
    }),
  };
}

function coffeeSeatOpenMouthGlyph(
  mouthShape: ZenLiveBotMouthShape,
): string | null {
  if (mouthShape === "speech-closed") return ":|";
  if (mouthShape === "dot") return ":.";
  if (mouthShape === "at") return ":@";
  if (mouthShape === "narrow") return ":o";
  if (mouthShape === "open-wide") return ":0";
  if (mouthShape === "open-small") return ":o";
  if (mouthShape === "open-round") return ":O";
  return null;
}

export function coffeeSeatPlateGlyph(
  emojiMood: CoffeeSeatEmojiMood,
  mouthShape: ZenLiveBotMouthShape = "closed",
): {
  text: string;
  rotateDeg: number;
} {
  switch (emojiMood) {
    case "happy":
      return {
        text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":)",
        rotateDeg: 90,
      };
    case "warm":
      return {
        text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":]",
        rotateDeg: 90,
      };
    case "neutral":
      return {
        text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":|",
        rotateDeg: 90,
      };
    case "sad":
      return {
        text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":(",
        rotateDeg: 90,
      };
    case "angry":
      return {
        text:
          coffeeSeatOpenMouthGlyph(mouthShape) ??
          COFFEE_SEAT_ANGRY_BRACKET_GLYPH,
        rotateDeg: 90,
      };
    default:
      return {
        text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":|",
        rotateDeg: 90,
      };
  }
}
