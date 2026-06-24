/**
 * Coffee seat plate glyphs use a leading ASCII eye (`:` or `;` for angry).
 * Blinking swaps that character for non-collapsing whitespace so the face
 * reads as eyes closed without shifting the mouth.
 */
export function applyCoffeeSeatBlink(text: string, eyesOpen: boolean): string {
  if (eyesOpen || text.length === 0) return text;
  const eye = text[0];
  if (eye === ":" || eye === ";") {
    return `\u00a0${text.slice(1)}`;
  }
  return text;
}
