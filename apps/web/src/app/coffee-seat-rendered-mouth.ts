import type { ZenLiveBotMouthShape } from "./zenLiveMouth.ts";

/** Exact glyph written to the mouth span and phosphor text layer. */
export function coffeeSeatRenderedMouthGlyph(args: {
  baseGlyph: string;
  customSpeechGlyph?: string | null;
  renderedFaceMouthCharacter?: string | null;
  effectiveTalking?: boolean;
  mouthShape?: ZenLiveBotMouthShape | null;
}): string {
  // Keep `closed` as a semantic speech rest, but do not flash the bot's idle
  // expression (for example, a large smile) inside an active utterance.
  const defaultClosedSpeechGlyph =
    args.effectiveTalking &&
    args.mouthShape === "closed" &&
    (args.renderedFaceMouthCharacter === null ||
      args.renderedFaceMouthCharacter === undefined)
      ? "|"
      : null;

  return (
    args.customSpeechGlyph ??
    defaultClosedSpeechGlyph ??
    args.renderedFaceMouthCharacter ??
    args.baseGlyph
  );
}
