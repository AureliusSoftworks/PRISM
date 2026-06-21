import type { ZenPersonaTransitionStyle } from "@localai/shared";

export type ZenPersonaTransitionChoice = "auto" | ZenPersonaTransitionStyle;

export const ZEN_PERSONA_TRANSITION_CHOICES: readonly ZenPersonaTransitionChoice[] = [
  "auto",
  "new-speaks",
  "previous-introduces",
] as const;

export function resolveZenPersonaTransitionStyle(
  choice: ZenPersonaTransitionChoice,
  options: {
    fromBotId: string | null;
    toBotId: string | null;
    random?: () => number;
  }
): ZenPersonaTransitionStyle {
  if (choice === "new-speaks" || choice === "previous-introduces") {
    return choice;
  }

  const hasUsefulPreviousSpeaker =
    typeof options.fromBotId === "string" &&
    options.fromBotId.trim().length > 0 &&
    options.fromBotId !== options.toBotId;
  if (!hasUsefulPreviousSpeaker) return "new-speaks";

  const random = options.random ?? Math.random;
  return random() < 0.5 ? "new-speaks" : "previous-introduces";
}
