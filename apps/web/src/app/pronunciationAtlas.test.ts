import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCAL_VOICE_SPEECHPRINT_CAPABILITIES } from "@localai/shared";

import {
  PRONUNCIATION_ATLAS_ANCHORS,
  nudgePronunciationAtlasSelection,
  pronunciationAtlasAnchorForSelection,
  pronunciationAtlasNaturalSelection,
  pronunciationAtlasSelectionAtPoint,
  pronunciationAtlasValueText,
  type PronunciationAtlasSelection,
} from "./pronunciationAtlasModel.ts";

const britishFrench: PronunciationAtlasSelection = {
  pronunciationBase: "en-GB",
  sourceLocale: "en-US",
  influence: "french-influenced-english",
  strength: "balanced",
};

describe("Pronunciation Atlas", () => {
  it("places every qualified Speechprint on the projection", () => {
    const mapped = new Set(
      PRONUNCIATION_ATLAS_ANCHORS.flatMap((anchor) =>
        anchor.influence ? [anchor.influence] : [],
      ),
    );
    assert.deepEqual(
      mapped,
      new Set(LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.map(({ id }) => id)),
    );
  });

  it("places representative anchors on their real projected regions", () => {
    const expectedPoints = {
      "base-en-US": { x: 0.226, y: 0.279 },
      "base-en-GB": { x: 0.5, y: 0.214 },
      "influence-brazilian-portuguese-influenced-english": {
        x: 0.367,
        y: 0.588,
      },
      "influence-japanese-influenced-english": { x: 0.888, y: 0.302 },
      "influence-italian-influenced-english": { x: 0.535, y: 0.267 },
      "influence-australian-english": { x: 0.914, y: 0.696 },
      "influence-canadian-english": { x: 0.29, y: 0.248 },
    } as const;

    for (const [id, expected] of Object.entries(expectedPoints)) {
      const anchor = PRONUNCIATION_ATLAS_ANCHORS.find(
        (candidate) => candidate.id === id,
      );
      assert.ok(anchor);
      assert.ok(Math.abs(anchor.point.x - expected.x) < 0.002);
      assert.ok(Math.abs(anchor.point.y - expected.y) < 0.002);
    }
  });

  it("keeps American and British foundations independent from influence", () => {
    assert.equal(
      pronunciationAtlasValueText(britishFrench),
      "British foundation, French-influenced English, Balanced",
    );
    assert.equal(
      pronunciationAtlasAnchorForSelection(britishFrench).influence,
      "french-influenced-english",
    );
  });

  it("resolves a map point to the nearest qualified anchor", () => {
    const japanese = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.influence === "japanese-influenced-english",
    );
    assert.ok(japanese);
    const selected = pronunciationAtlasSelectionAtPoint(
      { x: japanese.point.x - 0.01, y: japanese.point.y + 0.01 },
      britishFrench,
    );
    assert.equal(selected.pronunciationBase, "en-GB");
    assert.equal(selected.influence, "japanese-influenced-english");
  });

  it("returns to the genuine source when its base beacon is selected", () => {
    const american = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.base === "en-US",
    );
    assert.ok(american);
    const selected = pronunciationAtlasSelectionAtPoint(
      american.point,
      britishFrench,
    );
    assert.equal(selected.pronunciationBase, "follow-voice");
    assert.equal(selected.influence, "none");
  });

  it("supports deterministic directional keyboard travel", () => {
    const natural = pronunciationAtlasNaturalSelection("en-US");
    const right = nudgePronunciationAtlasSelection(natural, "right");
    assert.notEqual(right.influence, natural.influence);
    assert.deepEqual(nudgePronunciationAtlasSelection(natural, "right"), right);
  });
});
