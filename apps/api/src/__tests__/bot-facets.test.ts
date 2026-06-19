import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { LlmProvider } from "../providers.ts";
import {
  deriveDeterministicBotSemanticFacets,
  effectiveBotSemanticFacets,
  hashBotSemanticFacetSource,
  inferBotSemanticFacets,
  mergeBotSemanticFacets,
  normalizeBotSemanticFacets,
  refreshBotSemanticFacets,
} from "../bot-facets.ts";

describe("bot semantic facets", () => {
  it("normalizes valid facet JSON and drops generic values", () => {
    const facets = normalizeBotSemanticFacets({
      version: 1,
      canonAnchors: ["  Hogwarts  ", "coffee"],
      domains: ["wizarding school"],
      values: ["courage"],
      tensions: ["rules versus courage"],
      namingTokens: ["wand"],
      starterSeeds: ["When rules protect people"],
    });

    assert.deepEqual(facets?.canonAnchors, ["Hogwarts"]);
    assert.equal(facets?.domains[0], "wizarding school");
    assert.equal(facets?.starterSeeds[0], "When rules protect people");
  });

  it("rejects stale stored facets and returns deterministic fallback", () => {
    const freshHash = hashBotSemanticFacetSource({
      name: "Harry Potter",
      systemPrompt: "Young wizard from Gryffindor.",
    });
    const result = effectiveBotSemanticFacets({
      name: "Harry Potter",
      systemPrompt: "Young wizard from Gryffindor.",
      semanticFacets: JSON.stringify({
        version: 1,
        canonAnchors: ["Stale"],
        domains: [],
        values: [],
        tensions: [],
        namingTokens: [],
        starterSeeds: [],
      }),
      semanticFacetsSourceHash: `${freshHash}-old`,
    });

    assert.equal(result.needsRefresh, true);
    assert.ok(result.facets.canonAnchors.includes("Hogwarts"));
    assert.ok(!result.facets.canonAnchors.includes("Stale"));
  });

  it("derives Harry Potter and McGonagall canon facets deterministically", () => {
    const facets = deriveDeterministicBotSemanticFacets({
      name: "Professor McGonnigal",
      systemPrompt: "Strict Hogwarts professor of Transfiguration and head of Gryffindor.",
    });

    assert.ok(facets.canonAnchors.includes("Hogwarts"));
    assert.ok(facets.canonAnchors.includes("Gryffindor"));
    assert.ok(facets.canonAnchors.includes("Transfiguration"));
    assert.ok(facets.starterSeeds.includes("When rules protect people"));
  });

  it("derives SpongeBob character-specific facets before broad fallback seeds", () => {
    const facets = deriveDeterministicBotSemanticFacets({
      name: "Squidward Tentacles",
      systemPrompt: "Krusty Krab cashier in Bikini Bottom who cares about clarinet and quiet.",
    });

    assert.ok(facets.canonAnchors.includes("Squidward Tentacles"));
    assert.ok(facets.canonAnchors.includes("Bikini Bottom"));
    assert.ok(facets.namingTokens.includes("clarinet"));
    assert.deepEqual(facets.starterSeeds.slice(0, 2), [
      "Art versus customer service",
      "The dignity of quiet",
    ]);
  });

  it("merges LLM facets with deterministic fallback facets", async () => {
    const provider: Pick<LlmProvider, "generateResponse"> = {
      async generateResponse(): Promise<string> {
        return JSON.stringify({
          version: 1,
          canonAnchors: ["Minerva McGonagall"],
          domains: ["school discipline"],
          values: ["fairness"],
          tensions: ["mercy versus standards"],
          namingTokens: ["house points"],
          starterSeeds: ["When standards bend"],
        });
      },
    };

    const facets = await inferBotSemanticFacets({
      provider: provider as LlmProvider,
      name: "Professor McGonagall",
      systemPrompt: "Hogwarts professor of Transfiguration and head of Gryffindor.",
    });

    assert.ok(facets.canonAnchors.includes("Hogwarts"));
    assert.ok(facets.canonAnchors.includes("Minerva McGonagall"));
    assert.ok(facets.starterSeeds.includes("When standards bend"));
  });

  it("persists refreshed facets with the current source hash", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE bots (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        system_prompt TEXT NOT NULL DEFAULT '',
        semantic_facets TEXT,
        semantic_facets_source_hash TEXT,
        semantic_facets_updated_at TEXT
      );
    `);
    db.prepare("INSERT INTO bots (id, user_id, name, system_prompt) VALUES (?, ?, ?, ?)")
      .run("bot-1", "user-1", "Harry Potter", "Young wizard from Gryffindor.");
    const provider: Pick<LlmProvider, "generateResponse"> = {
      async generateResponse(): Promise<string> {
        return JSON.stringify({
          version: 1,
          canonAnchors: ["The Boy Who Lived"],
          domains: [],
          values: [],
          tensions: [],
          namingTokens: [],
          starterSeeds: ["The burden of being chosen"],
        });
      },
    };

    await refreshBotSemanticFacets({
      db,
      userId: "user-1",
      botId: "bot-1",
      provider: provider as LlmProvider,
    });

    const row = db.prepare("SELECT semantic_facets, semantic_facets_source_hash FROM bots WHERE id = ?")
      .get("bot-1") as { semantic_facets: string | null; semantic_facets_source_hash: string | null };
    assert.ok(row.semantic_facets);
    assert.equal(
      row.semantic_facets_source_hash,
      hashBotSemanticFacetSource({
        name: "Harry Potter",
        systemPrompt: "Young wizard from Gryffindor.",
      })
    );
    const stored = normalizeBotSemanticFacets(JSON.parse(row.semantic_facets!));
    assert.ok(stored?.canonAnchors.includes("The Boy Who Lived"));
    db.close();
  });

  it("merges facet arrays without duplicate strings", () => {
    const merged = mergeBotSemanticFacets(
      {
        version: 1,
        canonAnchors: ["Hogwarts"],
        domains: [],
        values: [],
        tensions: [],
        namingTokens: [],
        starterSeeds: [],
      },
      {
        version: 1,
        canonAnchors: ["hogwarts", "Gryffindor"],
        domains: [],
        values: [],
        tensions: [],
        namingTokens: [],
        starterSeeds: [],
      }
    );

    assert.deepEqual(merged.canonAnchors, ["Hogwarts", "Gryffindor"]);
  });
});
