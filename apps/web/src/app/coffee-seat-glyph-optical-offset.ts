import type { BotVoicePreset } from "@localai/shared";

export type CoffeeSeatGlyphOpticalOffset = {
  id: "warm-bracket" | "warm-broken-bar" | "paired-eye";
  x: number;
  y: number;
};

export function coffeeSeatGlyphOpticalOffset(args: {
  part: "eyes" | "mouth";
  glyph: string;
  voicePreset: BotVoicePreset;
  rotateDeg: number;
  pairedEye?: boolean;
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
    args.voicePreset === "warm" &&
    args.part === "mouth" &&
    args.glyph === "]"
  ) {
    correction = { id: "warm-bracket", screenX: 0.055 };
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
