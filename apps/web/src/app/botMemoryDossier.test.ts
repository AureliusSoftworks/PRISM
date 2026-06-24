import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botMemoryCategoryLabel,
  botMemoryDossierSessionOpinion,
  botMemoryDossierStatItems,
  botMemorySourceLabel,
  botMemoryTierLabel,
  resolveBotMemoryDossierSectionCounts,
  type BotMemoryDossierCounts,
  type BotMemoryDossierPayload,
} from "./botMemoryDossier.ts";

describe("bot memory dossier helpers", () => {
  it("groups memory lanes into review-friendly section counts", () => {
    const counts = resolveBotMemoryDossierSectionCounts(
      [
        { source: "direct", tier: "short_term" },
        { source: "inferred", tier: "short_term" },
        { source: "compiled", tier: "long_term" },
      ],
      [{ source: "about_you", tier: "long_term" }]
    );

    assert.deepEqual(counts, {
      shortTerm: 2,
      longTerm: 1,
      assumptions: 2,
      protectedAboutYou: 1,
    });
  });

  it("builds stable stat labels from backend counts", () => {
    const backendCounts: BotMemoryDossierCounts = {
      total: 4,
      visible: 3,
      protectedAboutYou: 1,
      bySource: { direct: 1, inferred: 1, compiled: 1, about_you: 1 },
      byTier: { short_term: 2, long_term: 2 },
      byCategory: { general: 1, user: 2, bot_relation: 1 },
    };
    const sectionCounts = {
      shortTerm: 2,
      longTerm: 1,
      assumptions: 2,
      protectedAboutYou: 1,
    };

    assert.deepEqual(botMemoryDossierStatItems(backendCounts, sectionCounts), [
      { id: "short", label: "Short", value: 2 },
      { id: "protected", label: "Protected", value: 1 },
      { id: "about-you", label: "About you", value: 1 },
      { id: "assumptions", label: "Assumptions", value: 2 },
      { id: "total", label: "Total", value: 4 },
    ]);
  });

  it("uses clear user-facing labels for source, tier, and category", () => {
    assert.equal(botMemorySourceLabel("direct"), "Remembered");
    assert.equal(botMemorySourceLabel("inferred"), "Assumption");
    assert.equal(botMemorySourceLabel("compiled"), "Pattern");
    assert.equal(botMemorySourceLabel("about_you"), "About you");
    assert.equal(botMemoryTierLabel("long_term"), "Protected");
    assert.equal(botMemoryTierLabel("short_term"), "Short-term");
    assert.equal(botMemoryCategoryLabel("bot_relation"), "Relationship");
  });

  it("shows current connection only for the opened bot", () => {
    const dossier: BotMemoryDossierPayload<unknown, { score: number }, unknown> = {
      botId: "bot-1",
      memories: [],
      aboutYouMemories: [],
      botOpinion: null,
      sessionOpinion: { score: 71 },
      botStatusSummary: null,
      counts: {
        total: 0,
        visible: 0,
        protectedAboutYou: 0,
        bySource: { direct: 0, inferred: 0, compiled: 0, about_you: 0 },
        byTier: { short_term: 0, long_term: 0 },
        byCategory: { general: 0, user: 0, bot_relation: 0 },
      },
    };

    assert.deepEqual(botMemoryDossierSessionOpinion(dossier, "bot-1"), { score: 71 });
    assert.equal(botMemoryDossierSessionOpinion(dossier, "bot-2"), null);
    assert.equal(botMemoryDossierSessionOpinion(null, "bot-1"), null);
  });
});
