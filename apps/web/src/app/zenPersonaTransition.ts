import type { ZenPersonaTransitionStyle } from "@localai/shared";

export type ZenPersonaTransitionMode = ZenPersonaTransitionStyle | "off";
export type ZenPersonaTransitionChoice = "random" | ZenPersonaTransitionMode;
export type ZenPersonaPresencePhase = "stable" | "departing" | "arriving";

export const ZEN_PERSONA_PRESENCE_DEPART_MS = 260;
export const ZEN_PERSONA_PRESENCE_ARRIVE_MS = 360;

export const ZEN_PERSONA_TRANSITION_CHOICES: readonly ZenPersonaTransitionChoice[] = [
  "random",
  "new-speaks",
  "previous-introduces",
  "off",
] as const;

export type ZenPersonaPresenceSnapshot = {
  visibleBotId: string | null;
  phase: ZenPersonaPresencePhase;
  targetBotId: string | null;
  waitingForIntroReveal: boolean;
};

export function resolveZenPersonaTransitionStyle(
  choice: ZenPersonaTransitionChoice,
  options: {
    fromBotId: string | null;
    toBotId: string | null;
    random?: () => number;
  }
): ZenPersonaTransitionMode {
  if (choice !== "random") {
    return choice;
  }

  const random = options.random ?? Math.random;
  const roll = random();
  if (roll < 1 / 3) return "new-speaks";
  if (roll < 2 / 3) return "previous-introduces";
  return "off";
}

export function resolveZenPersonaPresenceDurations(
  options: { reducedMotion?: boolean } = {}
): { departMs: number; arriveMs: number } {
  if (options.reducedMotion) {
    return { departMs: 0, arriveMs: 0 };
  }
  return {
    departMs: ZEN_PERSONA_PRESENCE_DEPART_MS,
    arriveMs: ZEN_PERSONA_PRESENCE_ARRIVE_MS,
  };
}

export function zenPersonaPresenceAfterPickerSelection(options: {
  fromBotId: string | null;
  toBotId: string | null;
  style: ZenPersonaTransitionMode;
}): ZenPersonaPresenceSnapshot {
  if (options.style === "off") {
    return {
      visibleBotId: options.toBotId,
      phase: "stable",
      targetBotId: options.toBotId,
      waitingForIntroReveal: false,
    };
  }

  if (options.style === "previous-introduces") {
    return {
      visibleBotId: options.fromBotId,
      phase: "stable",
      targetBotId: options.toBotId,
      waitingForIntroReveal: true,
    };
  }

  return {
    visibleBotId: options.fromBotId,
    phase: "departing",
    targetBotId: options.toBotId,
    waitingForIntroReveal: false,
  };
}

export function zenPersonaPresenceAfterArrival(
  botId: string | null
): ZenPersonaPresenceSnapshot {
  return {
    visibleBotId: botId,
    phase: "stable",
    targetBotId: botId,
    waitingForIntroReveal: false,
  };
}

export function zenPersonaPresenceAfterRestore(
  botId: string | null
): ZenPersonaPresenceSnapshot {
  return zenPersonaPresenceAfterArrival(botId);
}
