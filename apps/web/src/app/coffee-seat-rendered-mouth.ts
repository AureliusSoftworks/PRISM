/** Exact glyph written to the mouth span and phosphor text layer. */
export function coffeeSeatRenderedMouthGlyph(args: {
  baseGlyph: string;
  customSpeechGlyph?: string | null;
  renderedFaceMouthCharacter?: string | null;
}): string {
  return (
    args.customSpeechGlyph ??
    args.renderedFaceMouthCharacter ??
    args.baseGlyph
  );
}
