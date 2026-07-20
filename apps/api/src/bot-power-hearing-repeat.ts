import {
  activeBotPowersV1,
  normalizeVoiceDeliveryMood,
  type BotPowerEffectV1,
  type BotPowerStrength,
  type CoffeeBotSocialSnapshot,
  type VoiceDeliveryMood,
} from "@localai/shared";

export type BotPowerHearingRepeatEffect = Extract<
  BotPowerEffectV1,
  { type: "hearing_repeat" }
>;

const HEARING_REPEAT_STRENGTH_RANK: Record<BotPowerStrength, number> = {
  small: 1,
  medium: 2,
  large: 3,
};

export function strongestHearingRepeatEffect(
  effects: readonly BotPowerEffectV1[],
): BotPowerHearingRepeatEffect | null {
  return effects.reduce<BotPowerHearingRepeatEffect | null>((strongest, effect) => {
    if (effect.type !== "hearing_repeat") return strongest;
    if (
      !strongest ||
      HEARING_REPEAT_STRENGTH_RANK[effect.moodPenalty] >
        HEARING_REPEAT_STRENGTH_RANK[strongest.moodPenalty]
    ) {
      return effect;
    }
    return strongest;
  }, null);
}

export function hearingRepeatEffectFromPowers(
  powers: unknown,
): BotPowerHearingRepeatEffect | null {
  return strongestHearingRepeatEffect(
    activeBotPowersV1(powers).flatMap((power) => power.compiled?.effects ?? []),
  );
}

function hearingRepeatRequestText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\[[^\]]+\]\(prism-bot:\/\/[^)]+\)/giu, " ")
    .replace(/\*[^*\n]{1,120}\*/gu, " ")
    .replace(/[’]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/** Recognizes bounded, natural requests to repeat the immediately prior line. */
export function botPowerTextRequestsRepeat(value: unknown): boolean {
  const text = hearingRepeatRequestText(value);
  if (!text || text.length > 180) return false;
  if (
    [
      /\bwhat\s+did\s+you\s+(?:just\s+)?say\b/u,
      /\b(?:sorry[, ]+)?what\s+was\s+that\b/u,
      /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:repeat|say)\s+(?:that|it|what\s+you\s+(?:just\s+)?said)(?:\s+again)?\b/u,
      /\b(?:say|repeat)\s+that\s+again\b/u,
      /\bi\s+(?:did\s+not|didn't|could\s+not|couldn't)\s+(?:hear|catch|make\s+out)\s+(?:that|you|what\s+you\s+said)\b/u,
    ].some((pattern) => pattern.test(text))
  ) {
    return true;
  }
  return /(?:^|[,;:\u2014-]\s*)(?:pardon(?:\s+me)?|come\s+again)[?!.]*$/u.test(text);
}

function clampUnit(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function hearingRepeatMoodDelta(strength: BotPowerStrength): number {
  return strength === "small" ? 0.08 : strength === "large" ? 0.22 : 0.14;
}

/** Applies one stacking event cost to the bot forced to repeat in Coffee. */
export function applyCoffeeHearingRepeatMoodPenalty(args: {
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>;
  repeatingBotId: string;
  strength: BotPowerStrength;
}): Record<string, CoffeeBotSocialSnapshot> {
  const previous = args.socialByBotId[args.repeatingBotId];
  if (!previous) return args.socialByBotId;
  const delta = hearingRepeatMoodDelta(args.strength);
  return {
    ...args.socialByBotId,
    [args.repeatingBotId]: {
      disposition: clampUnit(previous.disposition - delta),
      valuesFriction: clampUnit(previous.valuesFriction + delta * 0.85),
      restraint: clampUnit(previous.restraint + delta * 0.35),
      engagement: clampUnit(previous.engagement - delta * 0.75),
      leavePressure: clampUnit(previous.leavePressure + delta * 0.5),
    },
  };
}

/** Signal has no persistent per-bot social state, so a repeat steps saved delivery mood down. */
export function lowerVoiceMoodForHearingRepeat(value: unknown): VoiceDeliveryMood {
  switch (normalizeVoiceDeliveryMood(value)) {
    case "joyful":
      return "warm";
    case "warm":
      return "neutral";
    case "neutral":
      return "guarded";
    case "guarded":
    case "strained":
      return "strained";
  }
}
