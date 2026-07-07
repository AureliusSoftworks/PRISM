/**
 * Coffee seat plate glyphs use a leading colon-style eye. Keep legacy `;` and
 * `>` strings blink-safe for older face snapshots.
 * Blinking swaps that character for a half-eye or non-collapsing whitespace so
 * the face reads as blinking without shifting the mouth.
 */
export type CoffeeSeatBlinkPhase = "open" | "half" | "closed";

export const COFFEE_SEAT_BLINK_HALF_EYE = "|";

function normalizeCoffeeSeatBlinkPhase(
  phaseOrEyesOpen: CoffeeSeatBlinkPhase | boolean
): CoffeeSeatBlinkPhase {
  if (phaseOrEyesOpen === true) return "open";
  if (phaseOrEyesOpen === false) return "closed";
  return phaseOrEyesOpen;
}

export function applyCoffeeSeatBlink(
  text: string,
  phaseOrEyesOpen: CoffeeSeatBlinkPhase | boolean
): string {
  const phase = normalizeCoffeeSeatBlinkPhase(phaseOrEyesOpen);
  if (phase === "open" || text.length === 0) return text;
  const eye = text[0];
  if (eye === ":" || eye === ";" || eye === ">" || eye === "\u02d0") {
    if (phase === "half") {
      return `${COFFEE_SEAT_BLINK_HALF_EYE}${text.slice(1)}`;
    }
    return `\u00a0${text.slice(1)}`;
  }
  return text;
}
