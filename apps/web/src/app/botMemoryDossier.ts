export type BotMemoryDossierSource = "direct" | "inferred" | "compiled" | "about_you";
export type BotMemoryDossierTier = "short_term" | "long_term";
export type BotMemoryDossierCategory = "general" | "user" | "bot_relation";

export interface BotMemoryDossierCounts {
  total: number;
  visible: number;
  protectedAboutYou: number;
  bySource: Record<BotMemoryDossierSource, number>;
  byTier: Record<BotMemoryDossierTier, number>;
  byCategory: Record<BotMemoryDossierCategory, number>;
}

export interface BotMemoryDossierMemoryLike {
  source?: BotMemoryDossierSource;
  tier?: BotMemoryDossierTier;
}

export interface BotMemoryDossierPayload<TMemory, TSessionOpinion, TBotOpinion> {
  botId: string;
  memories: TMemory[];
  aboutYouMemories: TMemory[];
  botOpinion: TBotOpinion | null;
  sessionOpinion: TSessionOpinion | null;
  botStatusSummary: string | null;
  counts: BotMemoryDossierCounts;
}

export interface BotMemoryDossierSectionCounts {
  shortTerm: number;
  longTerm: number;
  assumptions: number;
  protectedAboutYou: number;
}

export function botMemorySourceLabel(source: BotMemoryDossierSource | undefined): string {
  if (source === "inferred") return "Assumption";
  if (source === "compiled") return "Pattern";
  if (source === "about_you") return "About you";
  return "Remembered";
}

export function botMemoryTierLabel(tier: BotMemoryDossierTier | undefined): string {
  return tier === "long_term" ? "Protected" : "Short-term";
}

export function botMemoryCategoryLabel(category: BotMemoryDossierCategory | undefined): string {
  if (category === "user") return "About you";
  if (category === "bot_relation") return "Relationship";
  return "General";
}

export function resolveBotMemoryDossierSectionCounts(
  memories: BotMemoryDossierMemoryLike[],
  aboutYouMemories: BotMemoryDossierMemoryLike[]
): BotMemoryDossierSectionCounts {
  return {
    shortTerm: memories.filter((memory) => memory.tier !== "long_term").length,
    longTerm: memories.filter((memory) => memory.tier === "long_term").length,
    assumptions: memories.filter(
      (memory) => memory.source === "inferred" || memory.source === "compiled"
    ).length,
    protectedAboutYou: aboutYouMemories.length,
  };
}

export function botMemoryDossierStatItems(
  counts: BotMemoryDossierCounts,
  sectionCounts: BotMemoryDossierSectionCounts
): Array<{ id: string; label: string; value: number }> {
  return [
    { id: "short", label: "Short", value: sectionCounts.shortTerm },
    { id: "protected", label: "Protected", value: sectionCounts.longTerm },
    { id: "about-you", label: "About you", value: sectionCounts.protectedAboutYou },
    { id: "assumptions", label: "Assumptions", value: sectionCounts.assumptions },
    { id: "total", label: "Total", value: counts.total },
  ];
}

export function botMemoryDossierSessionOpinion<TMemory, TSessionOpinion, TBotOpinion>(
  dossier: BotMemoryDossierPayload<TMemory, TSessionOpinion, TBotOpinion> | null,
  botId: string | null | undefined
): TSessionOpinion | null {
  if (!dossier || !botId || dossier.botId !== botId) return null;
  return dossier.sessionOpinion ?? null;
}
