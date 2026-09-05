import { normalizeBotIdentityColor, resolveBotAccentColor } from "./color.ts";

export const CHAT_ATMOSPHERE_IMAGE_PURPOSE = "chat_atmosphere" as const;

/** Keep at most this many calendar days of Chat atmosphere assets per bot. */
export const CHAT_ATMOSPHERE_RETENTION_DAYS = 3;

export type ChatAtmospherePromptArgs = {
  botName: string;
  botSystemPrompt?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  variationSeed?: string | null;
};

/**
 * Server-owned Chat atmosphere prompt. Uses bot identity only — never
 * conversation transcript — so daily generation stays distinct from Zen.
 */
export function composeChatAtmospherePrompt(
  args: ChatAtmospherePromptArgs,
): string {
  const name = args.botName.trim() || "a companion";
  const persona = (args.botSystemPrompt ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 280);
  const seed = (args.variationSeed ?? "").trim().slice(0, 80) || "daily-light";
  const primary = normalizeBotIdentityColor(args.primaryColor);
  const accent = primary
    ? resolveBotAccentColor(primary, args.accentColor)
    : null;
  return [
    `Create a beautiful cinematic background atmosphere for chatting with ${name} in a private creative AI workspace called PRISM.`,
    persona
      ? `Evoke the companion's presence without depicting them: ${persona}`
      : "Evoke a calm, inviting presence without depicting any character.",
    primary && accent
      ? `Use primary ${primary} as the majority palette and resolved Atmosphere accent ${accent} as restrained edge light or spatial counterbalance. Treat both as flexible lighting cues: persona, setting, materials, and mood may temper them, and do not default to a literal two-color gradient.`
      : "Let persona, setting, materials, and mood determine a restrained palette.",
    "ultrawide desktop composition, 16:9 landscape, immersive but quiet, sophisticated production design, premium concept art, subtle depth and texture",
    "keep the central and lower interface zones visually quiet and readable, place detail toward the outer edges, dark enough for pale UI overlays",
    "no people, no characters, no robots, no faces, no text, no letters, no logos, no interface elements, no frames, no mockup devices",
    `Variation seed: ${seed}.`,
  ].join(" ");
}

export function chatAtmosphereUtcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function chatAtmosphereRetentionCutoffIso(
  now: Date = new Date(),
  retentionDays: number = CHAT_ATMOSPHERE_RETENTION_DAYS,
): string {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(1, retentionDays));
  return cutoff.toISOString();
}
