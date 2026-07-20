import type {
  BotPowerEffectV1,
  CoffeeBotSocialSnapshot,
  CoffeePowerPlanV1,
} from "@localai/shared";

type CoffeeInterruptionEffect = Extract<
  BotPowerEffectV1,
  { type: "interruption" }
>;

export interface CoffeeAutomaticCutInCandidate {
  botId: string;
  social: CoffeeBotSocialSnapshot | undefined;
  powerEffect: CoffeeInterruptionEffect | null;
  chance: number;
}

function socialScore(social: CoffeeBotSocialSnapshot | undefined): number {
  return (
    (social?.engagement ?? 0.5) +
    (social?.valuesFriction ?? 0.25) +
    (1 - (social?.restraint ?? 0.5))
  );
}

function socialChanceAdjustment(
  social: CoffeeBotSocialSnapshot | undefined,
): number {
  return Math.max(
    -0.04,
    Math.min(
      0.08,
      ((social?.engagement ?? 0.5) - 0.5) * 0.08 +
        ((social?.valuesFriction ?? 0.25) - 0.25) * 0.08 +
        (0.5 - (social?.restraint ?? 0.5)) * 0.08,
    ),
  );
}

function strongestInterruptionEffectForTarget(
  plan: CoffeePowerPlanV1 | null,
  botId: string,
  interruptedBotId: string,
): CoffeeInterruptionEffect | null {
  const effects = (plan?.bots[botId]?.effects ?? []).filter(
    (effect): effect is CoffeeInterruptionEffect =>
      effect.type === "interruption" &&
      effect.targets.some(
        (target) =>
          target.kind === "all" ||
          (target.kind === "bot" && target.botId === interruptedBotId),
      ),
  );
  const strengthRank = { small: 1, medium: 2, large: 3 } as const;
  return effects.sort(
    (left, right) =>
      Number(right.frequency === "frequent") -
        Number(left.frequency === "frequent") ||
      strengthRank[right.strength] - strengthRank[left.strength],
  )[0] ?? null;
}

export function coffeeAutomaticCutInCandidateV1(args: {
  candidateBotIds: readonly string[];
  interruptedBotId: string;
  socialByBotId: Record<string, CoffeeBotSocialSnapshot> | undefined;
  powerPlan: CoffeePowerPlanV1 | null;
  crossTalk: "rare" | "normal" | "chatty" | "pileup";
}): CoffeeAutomaticCutInCandidate | null {
  const baseChance =
    args.crossTalk === "rare"
      ? 0
      : args.crossTalk === "normal"
        ? 0.05
        : args.crossTalk === "chatty"
          ? 0.12
          : 0.28;
  const candidates = args.candidateBotIds
    .map((botId) => ({
      botId,
      social: args.socialByBotId?.[botId],
      powerEffect: strongestInterruptionEffectForTarget(
        args.powerPlan,
        botId,
        args.interruptedBotId,
      ),
    }))
    .sort((left, right) => {
      if (Boolean(left.powerEffect) !== Boolean(right.powerEffect)) {
        return right.powerEffect ? 1 : -1;
      }
      if (left.powerEffect && right.powerEffect) {
        const frequencyDelta =
          Number(right.powerEffect.frequency === "frequent") -
          Number(left.powerEffect.frequency === "frequent");
        if (frequencyDelta !== 0) return frequencyDelta;
        const strengthRank = { small: 1, medium: 2, large: 3 } as const;
        const strengthDelta =
          strengthRank[right.powerEffect.strength] -
          strengthRank[left.powerEffect.strength];
        if (strengthDelta !== 0) return strengthDelta;
      }
      return socialScore(right.social) - socialScore(left.social);
    });
  const candidate = candidates[0];
  if (!candidate) return null;

  const socialAdjustment = socialChanceAdjustment(candidate.social);
  if (!candidate.powerEffect) {
    return {
      ...candidate,
      chance: Math.max(0, Math.min(0.42, baseChance + socialAdjustment)),
    };
  }
  const powerBase = candidate.powerEffect.frequency === "frequent" ? 0.68 : 0.3;
  const powerStrengthAdjustment =
    candidate.powerEffect.strength === "large"
      ? 0.12
      : candidate.powerEffect.strength === "small"
        ? -0.08
        : 0;
  return {
    ...candidate,
    chance: Math.max(
      0.12,
      Math.min(0.88, powerBase + powerStrengthAdjustment + socialAdjustment),
    ),
  };
}
