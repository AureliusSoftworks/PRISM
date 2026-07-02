import type { ZenLiveBotMouthShape } from "./zenLiveMouth";

export type CoffeeSeatEmojiMood = "happy" | "warm" | "neutral" | "sad" | "angry";

export const COFFEE_SEAT_SIP_PLATE_GLYPH = { text: ":*", rotateDeg: 90 } as const;
export const COFFEE_SEAT_SIP_FACE_ACTIVE_PROGRESS = 0.78;
const COFFEE_SEAT_SIP_MOUTH_OFFSET_EM = 0.48;
const COFFEE_SEAT_CENTER_SIP_MOUTH_OFFSET_EM = 0.36;
const COFFEE_SEAT_SIP_MOUTH_LIFT_EM = -0.17;
const COFFEE_SEAT_CENTER_SIP_MOUTH_LIFT_EM = -0.13;

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

export function coffeeSeatSipFaceActive(args: {
  sipInProgress: boolean;
  completedSipAnimationAgeMs: number;
  completedSipAnimationDurationMs?: number | null;
  cupSipping?: boolean | null;
}): boolean {
  if (args.sipInProgress) return true;
  const timedSipFaceActive = coffeeSeatTimedSipFaceActive({
    ageMs: args.completedSipAnimationAgeMs,
    durationMs: args.completedSipAnimationDurationMs,
  });
  if (timedSipFaceActive != null) {
    return timedSipFaceActive;
  }
  if (args.cupSipping === true) return true;
  return false;
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
  // The sip star is translated along the emoji's local Y axis; after the
  // parent face rotates 90deg, positive local Y moves toward screen-left.
  const rimDirection = -sideSign * (faceFlip ? -1 : 1);
  const offsetEm = args.seatHorizontalSide === 0
    ? COFFEE_SEAT_CENTER_SIP_MOUTH_OFFSET_EM
    : COFFEE_SEAT_SIP_MOUTH_OFFSET_EM;
  return `${(offsetEm * rimDirection).toFixed(2)}em`;
}

export function coffeeSeatSipMouthOffsetX(args: {
  seatHorizontalSide?: -1 | 0 | 1;
}): string {
  const liftEm = args.seatHorizontalSide === 0
    ? COFFEE_SEAT_CENTER_SIP_MOUTH_LIFT_EM
    : COFFEE_SEAT_SIP_MOUTH_LIFT_EM;
  return `${liftEm.toFixed(2)}em`;
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
      return { text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":[", rotateDeg: 90 };
    default:
      return { text: coffeeSeatOpenMouthGlyph(mouthShape) ?? ":|", rotateDeg: 90 };
  }
}
