const BOT_POWER_REFRACT_CONTEXT_MAX_LENGTH = 800;
const BOT_GENERATOR_BRIEF_REFRACT_CONTEXT_MAX_LENGTH = 1_000;

function compact(value: string, limit: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, limit).trim();
}

export function botPowerRefractTargetId(ownerKey: string): string {
  return `avatar-studio-power-prompt-${encodeURIComponent(ownerKey)}`;
}

export function buildBotGeneratorBriefRefractContext(input: {
  brief: string;
}): string {
  const brief = compact(input.brief, 800) || "No brief text yet.";
  const core =
    brief && brief !== "No brief text yet."
      ? `Current Character brief: ${brief}.`
      : "Character brief is blank.";
  return compact(
    `Focused Avatar Studio bot generator brief context. ${core} Preserve this seed as the primary intent and style anchor for generation.`,
    BOT_GENERATOR_BRIEF_REFRACT_CONTEXT_MAX_LENGTH,
  );
}

export function buildBotPowerRefractDraftContext(input: {
  botId: string | null;
  botName: string;
  profileContext: string;
  powers: readonly { name: string; intent: string }[];
}): string {
  const name = compact(input.botName, 120) || "Unnamed new bot";
  const owner = input.botId?.trim() || "unsaved new bot draft";
  const existingPowers = input.powers
    .map((power) => compact(power.intent || power.name, 120))
    .filter(Boolean)
    .join(" | ");
  const lines = [
    `Focused Avatar Studio bot draft identity: ${name}.`,
    `Focused bot draft owner: ${owner}.`,
    existingPowers
      ? `Current Power context: ${compact(existingPowers, 220)}.`
      : "Current Power context: This draft has no existing Powers.",
    `Current draft personality and profile: ${compact(input.profileContext, 420) || "No profile details yet."}`,
    "Generate one Power premise specifically for this focused bot draft; do not borrow another bot or the placeholder example.",
  ];
  return compact(lines.join("\n"), BOT_POWER_REFRACT_CONTEXT_MAX_LENGTH);
}

export function buildBotPowerRefractRequestTarget(input: {
  botId: string | null;
  botName: string;
  context: string;
  maxLength: number;
}) {
  return {
    kind: "prism.input.text" as const,
    surface: {
      surfaceId: "avatar-studio" as const,
      ...(input.botId ? { botIds: [input.botId] } : {}),
    },
    label: `${compact(input.botName, 120) || "New bot"} Power`,
    context: compact(input.context, BOT_POWER_REFRACT_CONTEXT_MAX_LENGTH),
    multiline: true,
    maxLength: input.maxLength,
  };
}

export function buildBotGeneratorRefractRequestTarget(input: {
  context: string;
  maxLength: number;
}) {
  return {
    kind: "prism.input.text" as const,
    surface: {
      surfaceId: "avatar-studio" as const,
    },
    label: "Character brief",
    context: compact(input.context, BOT_GENERATOR_BRIEF_REFRACT_CONTEXT_MAX_LENGTH),
    multiline: true,
    maxLength: input.maxLength,
  };
}
