/**
 * Coffee seat plate glyphs use a leading colon-style eye. Keep legacy `;` and
 * `>` strings blink-safe for older face snapshots.
 * Blinking swaps that character for a half-eye or non-collapsing whitespace so
 * the face reads as blinking without shifting the mouth.
 */
import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  normalizeBotFaceBlinkBar,
  type BotFaceBlinkBar,
} from "@localai/shared";

export type CoffeeSeatBlinkPhase = "open" | "half" | "closed";

export const COFFEE_SEAT_BLINK_HALF_EYE = DEFAULT_BOT_FACE_BLINK_BAR;

export interface CoffeeSeatBlinkOptions {
  eyeCharacter?: string | null;
  blinkBar?: BotFaceBlinkBar | null;
}

function normalizeCoffeeSeatBlinkPhase(
  phaseOrEyesOpen: CoffeeSeatBlinkPhase | boolean
): CoffeeSeatBlinkPhase {
  if (phaseOrEyesOpen === true) return "open";
  if (phaseOrEyesOpen === false) return "closed";
  return phaseOrEyesOpen;
}

export function applyCoffeeSeatBlink(
  text: string,
  phaseOrEyesOpen: CoffeeSeatBlinkPhase | boolean,
  options: CoffeeSeatBlinkOptions = {}
): string {
  const phase = normalizeCoffeeSeatBlinkPhase(phaseOrEyesOpen);
  const blinkBar =
    normalizeBotFaceBlinkBar(options.blinkBar) ?? DEFAULT_BOT_FACE_BLINK_BAR;
  if (blinkBar === "none") return text;
  if (phase === "open" || text.length === 0) return text;
  const [eye] = Array.from(text);
  if (!eye) return text;
  const [customEye] =
    typeof options.eyeCharacter === "string"
      ? Array.from(options.eyeCharacter.trim())
      : [];
  if (
    eye === ":" ||
    eye === ";" ||
    eye === ">" ||
    eye === "\u02d0" ||
    (customEye !== undefined && eye === customEye)
  ) {
    const rest = text.slice(eye.length);
    if (phase === "half") {
      return `${blinkBar}${rest}`;
    }
    return `\u00a0${rest}`;
  }
  return text;
}
