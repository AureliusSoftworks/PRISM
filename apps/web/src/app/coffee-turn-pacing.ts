import type { CoffeeSessionSettings } from "@localai/shared";

/**
 * Debate parity (`DEBATE_PARTICIPATION_CLOCK_RATE = 1/8`): a composing player
 * slows the autonomous table to one-eighth speed instead of freezing it, so
 * bots still act but reliably yield the floor to a message in progress.
 */
export const COFFEE_PLAYER_COMPOSING_DELAY_MULTIPLIER = 8;

export function coffeePlayerComposingDelayMultiplier(
  rhythmState: string,
): number {
  return rhythmState === "playerComposing"
    ? COFFEE_PLAYER_COMPOSING_DELAY_MULTIPLIER
    : 1;
}

const COFFEE_REPLY_DELAY_MIN_MS = 12_000;
const COFFEE_REPLY_DELAY_MAX_MS = 28_000;
const COFFEE_REPLY_DELAY_FAST_MIN_MS = 650;
const COFFEE_REPLY_DELAY_FAST_MAX_MS = 2_600;
/** Small gap for max-speed pileup so the UI can paint and accept End clicks. */
const COFFEE_PILEUP_MAX_SPEED_GAP_MS = 320;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Delay before requesting the next autonomous Coffee turn.
 *
 * A max-speed, zero-breathing-room pileup already pays model and voice
 * preparation latency, so a long artificial pause makes interruptions feel
 * like orderly turn-taking. Keep only a short paint/input gap so End clicks
 * and seat updates can land between beats.
 */
export function coffeeAutonomousTurnDelayMs(
  settings: CoffeeSessionSettings,
  delayMultiplier = 1,
  random: () => number = Math.random,
): number {
  const speed = clampUnit(settings.responseDelayBias / 100);
  const room = clampUnit(settings.breathingRoom / 100);
  const multiplier = Number.isFinite(delayMultiplier)
    ? Math.max(0, delayMultiplier)
    : 1;

  if (
    settings.crossTalk === "pileup" &&
    settings.responseDelayBias >= 95 &&
    settings.breathingRoom <= 5
  ) {
    return COFFEE_PILEUP_MAX_SPEED_GAP_MS;
  }

  const minMs = Math.round(
    COFFEE_REPLY_DELAY_MIN_MS +
      (COFFEE_REPLY_DELAY_FAST_MIN_MS - COFFEE_REPLY_DELAY_MIN_MS) * speed,
  );
  const maxMs = Math.round(
    COFFEE_REPLY_DELAY_MAX_MS +
      (COFFEE_REPLY_DELAY_FAST_MAX_MS - COFFEE_REPLY_DELAY_MAX_MS) * speed,
  );
  const range = Math.max(0, maxMs - minMs);
  const sample = () => clampUnit(random());
  const delayUnit =
    settings.crossTalk === "pileup"
      ? Math.min(sample(), sample(), sample())
      : settings.crossTalk === "chatty"
        ? Math.min(sample(), sample())
        : Math.max(sample(), sample());
  let delayMs = minMs + Math.floor(delayUnit * range);
  const crossScale =
    settings.crossTalk === "pileup"
      ? 0.52
      : settings.crossTalk === "chatty"
        ? 0.72
        : settings.crossTalk === "rare"
          ? 1.12
          : 1;
  const roomScale = 0.82 + room * 0.55;
  delayMs = Math.round(delayMs * crossScale * roomScale * multiplier);

  const floorMs =
    settings.crossTalk === "chatty" && settings.responseDelayBias >= 95
      ? 450
      : minMs;
  return Math.max(floorMs, Math.min(Math.round(maxMs * 1.35), delayMs));
}
