import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_TERRITORY_CATALOG,
  randomDebateTerritory,
} from "./debateTerritoryRandomizer.ts";

describe("Debate Territory randomizer", () => {
  it("selects across the full curated catalog", () => {
    assert.equal(
      randomDebateTerritory("A custom territory", () => 0),
      DEBATE_TERRITORY_CATALOG[0],
    );
    assert.equal(
      randomDebateTerritory("A custom territory", () => 0.999_999),
      DEBATE_TERRITORY_CATALOG.at(-1),
    );
  });

  it("does not immediately repeat a catalog territory", () => {
    assert.equal(
      randomDebateTerritory(DEBATE_TERRITORY_CATALOG[0], () => 0),
      DEBATE_TERRITORY_CATALOG[1],
    );
    assert.notEqual(
      randomDebateTerritory(
        `  ${DEBATE_TERRITORY_CATALOG[12].toUpperCase()}  `,
        () => 0.4,
      ),
      DEBATE_TERRITORY_CATALOG[12],
    );
  });

  it("handles invalid random values safely", () => {
    assert.equal(
      randomDebateTerritory("", () => Number.NaN),
      DEBATE_TERRITORY_CATALOG[0],
    );
    assert.equal(
      randomDebateTerritory("", () => -1),
      DEBATE_TERRITORY_CATALOG[0],
    );
  });
});
