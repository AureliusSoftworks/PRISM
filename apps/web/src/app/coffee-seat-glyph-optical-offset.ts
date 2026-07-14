import type { BotVoicePreset } from "@localai/shared";

export type CoffeeSeatGlyphOpticalOffset = {
  id: "warm-bracket" | "warm-broken-bar";
  x: number;
  y: number;
};

export function coffeeSeatGlyphOpticalOffset(args: {
  part: "eyes" | "mouth";
  glyph: string;
  voicePreset: BotVoicePreset;
  rotateDeg: number;
}): CoffeeSeatGlyphOpticalOffset | null {
  const correction =
    args.voicePreset === "warm" && args.part === "mouth" && args.glyph === "]"
      ? { id: "warm-bracket" as const, screenX: 0.055 }
      : args.voicePreset === "warm" &&
          args.part === "eyes" &&
          args.glyph === "¦"
        ? { id: "warm-broken-bar" as const, screenX: 0.035 }
        : null;
  if (!correction) return null;

  const radians = (args.rotateDeg * Math.PI) / 180;
  return {
    id: correction.id,
    x: Number((correction.screenX * Math.cos(radians)).toFixed(3)),
    y: Number((-correction.screenX * Math.sin(radians)).toFixed(3)),
  };
}
