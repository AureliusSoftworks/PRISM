export const BOT_LIBRARY_GROUP_GLYPH_VERSION = 1 as const;

export interface BotLibraryGroupGlyphIdentity {
  version: typeof BOT_LIBRARY_GROUP_GLYPH_VERSION;
  seed: string;
}

export function normalizeBotLibraryGroupGlyphIdentity(
  value: unknown,
): BotLibraryGroupGlyphIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<BotLibraryGroupGlyphIdentity>;
  if (
    record.version !== BOT_LIBRARY_GROUP_GLYPH_VERSION ||
    typeof record.seed !== "string"
  ) {
    return null;
  }
  const seed = record.seed.trim().slice(0, 160);
  return seed ? { version: BOT_LIBRARY_GROUP_GLYPH_VERSION, seed } : null;
}
