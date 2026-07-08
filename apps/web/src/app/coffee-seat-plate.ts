import type { ZenLiveBotMouthShape } from "./zenLiveMouth";

export type CoffeeSeatEmojiMood = "happy" | "warm" | "neutral" | "sad" | "angry";

export const COFFEE_SEAT_ANGRY_BRACKET_GLYPH = "\u02d0[" as const;
export const COFFEE_SEAT_SIP_PLATE_GLYPH = { text: ":⁎", rotateDeg: 90 } as const;
export const COFFEE_SEAT_SIP_FACE_ACTIVE_PROGRESS = 0.78;
const COFFEE_SEAT_SIP_MOUTH_OFFSET_EM = 0.48;
const COFFEE_SEAT_CENTER_SIP_MOUTH_OFFSET_EM = 0.36;
const COFFEE_SEAT_SIP_MOUTH_DROP_EM = 0.17;
const COFFEE_SEAT_CENTER_SIP_MOUTH_DROP_EM = 0.13;

export type CoffeeSeatSipPresentationReason =
  | "explicit-sip"
  | "completed-sip-hold"
  | "cup-visual-sip"
  | "none";

export interface CoffeeSeatSipPresentation {
  active: boolean;
  reason: CoffeeSeatSipPresentationReason;
  glyph: typeof COFFEE_SEAT_SIP_PLATE_GLYPH | null;
  mouthOffsetX: string;
  mouthOffsetY: string;
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
  if (args.seatIsFirmlySeated === false || args.isSpeaking === true) return "none";
  if (args.sipInProgress) return "explicit-sip";
  const timedSipFaceActive = coffeeSeatTimedSipFaceActive({
    ageMs: args.completedSipAnimationAgeMs,
    durationMs: args.completedSipAnimationDurationMs,
  });
  if (timedSipFaceActive === true) return "completed-sip-hold";
  if (timedSipFaceActive === false) return "none";
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
  const faceFlipMultiplier = args.seatHorizontalSide === 0 ? 1 : faceFlip ? -1 : 1;
  const rimDirection = -sideSign * faceFlipMultiplier;
  const offsetEm = args.seatHorizontalSide === 0
    ? COFFEE_SEAT_CENTER_SIP_MOUTH_OFFSET_EM
    : COFFEE_SEAT_SIP_MOUTH_OFFSET_EM;
  return `${(offsetEm * rimDirection).toFixed(2)}em`;
}

export function coffeeSeatSipMouthOffsetX(args: {
  seatHorizontalSide?: -1 | 0 | 1;
}): string {
  // After the 90deg parent face rotation, positive local X reads as screen-down,
  // which puts the pucker closer to the lower cup rim.
  const dropEm = args.seatHorizontalSide === 0
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

function coffeeSeatOpenMouthGlyph(mouthShape: ZenLiveBotMouthShape): string | null {
  if (mouthShape === "open-wide") return ":0";
  if (mouthShape === "open-small") return ":o";
  if (mouthShape === "open-round") return ":O";
  return null;
}

export function coffeeSeatPlateGlyph(
  emojiMood: CoffeeSeatEmojiMood,
  mouthShape: ZenLiveBotMouthShape = "closed"
): {
  text: string;
  rotateDeg: number;
} {
  switch (emojiMood) {
    case "happy":
      return { text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":)", rotateDeg: 90 };
    case "warm":
      return { text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":]", rotateDeg: 90 };
    case "neutral":
      return { text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":|", rotateDeg: 90 };
    case "sad":
      return { text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":(", rotateDeg: 90 };
    case "angry":
      return {
        text: coffeeSeatOpenMouthGlyph(mouthShape) ?? COFFEE_SEAT_ANGRY_BRACKET_GLYPH,
        rotateDeg: 90,
      };
    default:
      return { text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":|", rotateDeg: 90 };
  }
}
