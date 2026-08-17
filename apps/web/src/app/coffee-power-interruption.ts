import type {
  BotPowerEffectV1,
  CoffeeBotSocialSnapshot,
  CoffeeInterruptionEvent,
  CoffeePowerPlanV1,
  DirectionalIrritationDeliveryPlanV1,
  ListenerReactionPlanV1,
} from "@localai/shared";

type CoffeeInterruptionEffect = Extract<
  BotPowerEffectV1,
  { type: "interruption" }
>;

export interface CoffeeAutomaticCutInCandidate {
  botId: string;
  social: CoffeeBotSocialSnapshot | undefined;
  powerEffect: CoffeeInterruptionEffect | null;
  directlyAddressed: boolean;
  chance: number;
}

export interface CoffeeAutomaticCutInPreparedPlanV1 {
  candidate: CoffeeAutomaticCutInCandidate;
  leadPlan: ListenerReactionPlanV1;
  triggerProgress: number;
  minimumVisibleWords: number;
  mustInterruptDuringTurn: boolean;
  unconditionalInterruption: boolean;
}

export interface CoffeeAutomaticCutInPreparedPlanCacheV1 {
  cacheKey: string;
  plan: CoffeeAutomaticCutInPreparedPlanV1 | null;
}

/**
 * Cheap roster fingerprint so typewriter ticks can reuse a cut-in plan until
 * the speaking opportunity, addressed bot, or seated candidates change.
 */
export function coffeeAutomaticCutInPreparedPlanCacheKeyV1(args: {
  opportunityKey: string;
  interruptedBotId: string;
  directlyAddressedBotId: string | null;
  crossTalk: "rare" | "normal" | "chatty" | "pileup";
  candidateBotIds: readonly string[];
  powerPlanRevision: string;
}): string {
  const candidateIds = [...args.candidateBotIds].sort().join(",");
  return [
    args.opportunityKey,
    args.interruptedBotId,
    args.directlyAddressedBotId ?? "",
    args.crossTalk,
    args.powerPlanRevision,
    candidateIds,
  ].join(":");
}

/** Count interruption effects per bot without serializing the whole power plan. */
export function coffeeAutomaticCutInPowerPlanRevisionV1(
  plan: CoffeePowerPlanV1 | null | undefined,
): string {
  if (!plan?.bots) return "";
  return Object.values(plan.bots)
    .map((bot) => {
      const interruptionCount = (bot.effects ?? []).filter(
        (effect) => effect.type === "interruption",
      ).length;
      const obfuscationCount = (bot.effects ?? []).filter(
        (effect) => effect.type === "speech_obfuscation",
      ).length;
      return `${bot.botId}:${interruptionCount}:${obfuscationCount}`;
    })
    .sort()
    .join("|");
}

/**
 * Remember a prepared automatic cut-in plan for one cache key. A null miss is
 * stored so empty rosters do not rebuild every typewriter tick, but a later
 * arrival changes the key and can still produce a cut-in.
 */
export function rememberCoffeeAutomaticCutInPreparedPlanV1(
  cache: { current: CoffeeAutomaticCutInPreparedPlanCacheV1 | null },
  cacheKey: string,
  build: () => CoffeeAutomaticCutInPreparedPlanV1 | null,
): CoffeeAutomaticCutInPreparedPlanV1 | null {
  if (cache.current?.cacheKey === cacheKey) {
    return cache.current.plan;
  }
  const plan = build();
  cache.current = { cacheKey, plan };
  return plan;
}

/** Play only the interrupter's lead-in until the server decides the floor. */
export function coffeeInterrupterLeadPlanV1(
  plan: ListenerReactionPlanV1,
): ListenerReactionPlanV1 {
  return {
    ...plan,
    interruptedSpeakerCue: undefined,
    publicInterruptedSpeakerCue: undefined,
    interruptedSpeakerCueSpeechEffect: undefined,
    interruptedSpeakerCuePlayback: undefined,
  };
}

/** After a cut-in, the next generated line belongs to whoever won the floor. */
export function coffeeInterruptionContinueSpeakerBotIdV1(args: {
  floorOutcome: CoffeeInterruptionEvent["floorOutcome"] | undefined;
  interruptedBotId: string;
  interrupterBotId: string;
}): string {
  return args.floorOutcome === "reclaim"
    ? args.interruptedBotId
    : args.interrupterBotId;
}

/** Build the yielding tail only when the server authoritatively chose yield. */
export function coffeeAuthoritativeYieldTailPlanV1(
  leadPlan: ListenerReactionPlanV1,
  interruption: CoffeeInterruptionEvent,
): ListenerReactionPlanV1 | null {
  if (
    interruption.floorOutcome !== "yield" ||
    !(
      interruption.publicInterruptedSpeakerCue ||
      interruption.interruptedSpeakerCue
    )
  ) {
    return null;
  }
  return {
    ...leadPlan,
    floorOutcome: "yield",
    spokenCue: undefined,
    publicSpokenCue: undefined,
    spokenCueSpeechEffect: undefined,
    vocalFoley: undefined,
    interruptedSpeakerCue: undefined,
    ...(interruption.publicInterruptedSpeakerCue
      ? {
          publicInterruptedSpeakerCue:
            interruption.publicInterruptedSpeakerCue,
          interruptedSpeakerCueSpeechEffect:
            "speech_obfuscation" as const,
        }
      : {
          interruptedSpeakerCue: interruption.interruptedSpeakerCue,
          publicInterruptedSpeakerCue: undefined,
          interruptedSpeakerCueSpeechEffect: undefined,
        }),
    interruptedSpeakerCuePlayback: "crosstalk",
  };
}

/**
 * Find irritation delivery attached to the pause carrier for a live yield
 * retort. Prefers the interrupted bot's cutoff delivery over rebuff rows.
 */
export function coffeeDirectionalIrritationDeliveryForPlan(
  conversation:
    | {
        messages?: Array<{
          coffeeInterruption?: CoffeeInterruptionEvent | null;
          coffeeReplayEvents?: Array<{
            kind?: string;
            botId?: string;
            delivery?: DirectionalIrritationDeliveryPlanV1;
          }> | null;
        }> | null;
      }
    | null
    | undefined,
  plan: Pick<ListenerReactionPlanV1, "messageId" | "speakerBotId">,
): DirectionalIrritationDeliveryPlanV1 | null {
  const messages = conversation?.messages;
  if (!messages?.length) return null;
  const pauseMessage = [...messages].reverse().find(
    (message) =>
      message.coffeeInterruption?.interruptedMessageId === plan.messageId ||
      message.coffeeInterruption?.interruptedBotId === plan.speakerBotId,
  );
  const events = pauseMessage?.coffeeReplayEvents ?? [];
  for (const event of events) {
    if (
      event.kind === "directionalIrritation" &&
      event.botId === plan.speakerBotId &&
      event.delivery
    ) {
      return event.delivery;
    }
  }
  return null;
}

export function coffeeInterruptionTriggerProgressV1(
  certainty: CoffeeInterruptionEffect["certainty"],
  stableUnit: number,
): number {
  if (certainty !== "always") return 0.35;
  const bounded = Math.max(0, Math.min(1, stableUnit));
  return 0.08 + bounded * 0.8;
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
      Number(right.certainty === "always") -
        Number(left.certainty === "always") ||
      Number(right.frequency === "frequent") -
        Number(left.frequency === "frequent") ||
      strengthRank[right.strength] - strengthRank[left.strength],
  )[0] ?? null;
}

export function coffeeAutomaticCutInCandidateV1(args: {
  candidateBotIds: readonly string[];
  interruptedBotId: string;
  directlyAddressedBotId?: string | null;
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
      directlyAddressed: botId === args.directlyAddressedBotId,
      powerEffect: strongestInterruptionEffectForTarget(
        args.powerPlan,
        botId,
        args.interruptedBotId,
      ),
    }))
    .sort((left, right) => {
      if (left.directlyAddressed !== right.directlyAddressed) {
        return right.directlyAddressed ? 1 : -1;
      }
      if (Boolean(left.powerEffect) !== Boolean(right.powerEffect)) {
        return right.powerEffect ? 1 : -1;
      }
      if (left.powerEffect && right.powerEffect) {
        const certaintyDelta =
          Number(right.powerEffect.certainty === "always") -
          Number(left.powerEffect.certainty === "always");
        if (certaintyDelta !== 0) return certaintyDelta;
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
  if (
    candidate.powerEffect.certainty === "always" &&
    candidate.directlyAddressed
  ) {
    return { ...candidate, chance: 1 };
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
