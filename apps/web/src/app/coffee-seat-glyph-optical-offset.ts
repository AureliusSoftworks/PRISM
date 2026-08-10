import type { BotVoicePreset } from "@localai/shared";

export type CoffeeSeatGlyphOpticalOffset = {
  id: "idle-mood-mouth-slot" | "warm-broken-bar" | "paired-eye";
  x: number;
  y: number;
};

const COFFEE_SEAT_IDLE_MOOD_MOUTH_GLYPHS = new Set([
  ")",
  "]",
  "|",
  "[",
  "(",
]);

export function coffeeSeatGlyphOpticalOffset(args: {
  part: "eyes" | "mouth";
  glyph: string;
  voicePreset: BotVoicePreset;
  rotateDeg: number;
  pairedEye?: boolean;
  customGlyph?: boolean;
}): CoffeeSeatGlyphOpticalOffset | null {
  let correction: {
    id: CoffeeSeatGlyphOpticalOffset["id"];
    screenX: number;
  } | null = null;

  // A cloned pair shares the same leftward optical bias across glyphs and fonts.
  // Establish its neutral position relative to the mouth before authored gaze
  // offsets are added by the face renderer.
  if (args.pairedEye === true && args.part === "eyes") {
    correction = { id: "paired-eye", screenX: -0.13 };
  }

  if (
    correction === null &&
    args.customGlyph !== true &&
    args.part === "mouth" &&
    COFFEE_SEAT_IDLE_MOOD_MOUTH_GLYPHS.has(args.glyph)
  ) {
    // Avatar Details authors Speech ink against the neutral | mouth. Keep all
    // five resting mood silhouettes in that exact optical slot so changing
    // mood never moves the mouth underneath persistent ink.
    correction = { id: "idle-mood-mouth-slot", screenX: -0.055 };
  } else if (
    correction === null &&
    args.voicePreset === "warm" &&
    args.part === "eyes" &&
    args.glyph === "¦"
  ) {
    correction = { id: "warm-broken-bar", screenX: 0.035 };
  }
  if (!correction) return null;

  const radians = (args.rotateDeg * Math.PI) / 180;
  const x = Number((correction.screenX * Math.cos(radians)).toFixed(3));
  const y = Number((-correction.screenX * Math.sin(radians)).toFixed(3));
  return {
    id: correction.id,
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  };
}
