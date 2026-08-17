import type { BotPowerV1 } from "@localai/shared";

export function botPowerRuleLabelForDisplay(value: string): string {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ");
  if (!normalized) return "Power effect";
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

export function botPowerBehaviorDetailsForDisplay(
  power: BotPowerV1,
  botName: string,
): { selfCue: string; observerCue: string } {
  if (power.compiled?.effects.some((effect) => effect.type === "cursed_tongue")) {
    const subject = botName.trim() || "This bot";
    return {
      selfCue: `${subject} means to speak normally; the curse changes what others hear.`,
      observerCue:
        "Every spoken sentence lands with one to four strong, non-slur curse words.",
    };
  }
  if (
    power.compiled?.effects.some(
      (effect) =>
        effect.type === "false_name" &&
        effect.pool === "given_plus_random_surname",
    )
  ) {
    const subject = botName.trim() || "This bot";
    return {
      selfCue: `${subject} keeps their given name and receives a new last name each session.`,
      observerCue: "Others hear the session full name and can still use the given name.",
    };
  }
  return {
    selfCue: power.compiled?.selfCue ?? "",
    observerCue: power.compiled?.observerCue ?? "",
  };
}
