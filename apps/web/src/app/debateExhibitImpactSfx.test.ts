import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEBATE_EXHIBIT_IMPACT_URLS,
  debateExhibitImpactForExhibit,
  resolveDebateExhibitImpactMaterial,
} from "./debateExhibitImpactSfx.ts";

describe("debateExhibitImpactSfx", () => {
  it("maps exhibit nouns and adjectives to material hits", () => {
    assert.equal(
      resolveDebateExhibitImpactMaterial({
        adjective: "Rusty",
        object: "spoon",
      }),
      "metal",
    );
    assert.equal(
      resolveDebateExhibitImpactMaterial({
        adjective: "Wooden",
        object: "briefcase",
      }),
      "cardboard",
    );
    assert.equal(
      resolveDebateExhibitImpactMaterial({
        adjective: "Frozen",
        object: "marble",
      }),
      "stone",
    );
    assert.equal(
      resolveDebateExhibitImpactMaterial({
        adjective: "Velvet",
        object: "glove",
      }),
      "fabric",
    );
    assert.equal(
      resolveDebateExhibitImpactMaterial({
        adjective: "Cracked",
        object: "teacup",
      }),
      "ceramic",
    );
    assert.equal(
      resolveDebateExhibitImpactMaterial({ title: "Broken mirror shard" }),
      "glass",
    );
    assert.equal(
      resolveDebateExhibitImpactMaterial({ title: "Mysterious relic" }),
      "wood",
    );
  });

  it("exposes packet-add and table-place event tags with public urls", () => {
    const seal = debateExhibitImpactForExhibit(
      { adjective: "Brass", object: "key" },
      "packet_add",
    );
    assert.equal(seal.material, "metal");
    assert.equal(seal.url, DEBATE_EXHIBIT_IMPACT_URLS.metal);
    assert.ok(seal.events.includes("evidence_packet_add"));

    const place = debateExhibitImpactForExhibit(
      { adjective: "Polished", object: "mug" },
      "table_place",
    );
    assert.equal(place.material, "ceramic");
    assert.ok(place.events.includes("evidence_table_place"));
    assert.ok(place.trim > seal.trim);
  });

  it("ships every material sample under public audio", () => {
    for (const url of Object.values(DEBATE_EXHIBIT_IMPACT_URLS)) {
      const absolute = fileURLToPath(
        new URL(`../../public${url}`, import.meta.url),
      );
      assert.equal(existsSync(absolute), true, url);
    }
  });
});
