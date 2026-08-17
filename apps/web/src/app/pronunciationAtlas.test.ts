import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCAL_VOICE_SPEECHPRINT_CAPABILITIES } from "@localai/shared";

import {
  PRONUNCIATION_ATLAS_ANCHORS,
  PRONUNCIATION_ATLAS_LENSES,
  nudgePronunciationAtlasSelection,
  nudgePronunciationAtlasSelectionInLens,
  normalizePronunciationAtlasSelection,
  projectPronunciationAtlasPointIntoLens,
  pronunciationAtlasAnchorForSelection,
  pronunciationAtlasLensContainsPoint,
  pronunciationAtlasLensesWithin,
  pronunciationAtlasLensForId,
  pronunciationAtlasPointForCoordinates,
  pronunciationAtlasPointFromLensProjection,
  pronunciationAtlasNaturalSelection,
  pronunciationAtlasNearbyCandidates,
  pronunciationAtlasPointForSelection,
  pronunciationAtlasSelectionAtPoint,
  pronunciationAtlasLocationText,
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
  it("uses one full-frame equirectangular projection for pins and hit testing", () => {
    assert.deepEqual(pronunciationAtlasPointForCoordinates(-180, 90), {
      x: 0,
      y: 0,
    });
    assert.deepEqual(pronunciationAtlasPointForCoordinates(0, 0), {
      x: 0.5,
      y: 0.5,
    });
    assert.deepEqual(pronunciationAtlasPointForCoordinates(180, -90), {
      x: 1,
      y: 1,
    });
  });

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
    assert.ok(
      PRONUNCIATION_ATLAS_ANCHORS.every(
        (anchor) => anchor.accentDefinitionId.length > 0,
      ),
    );
  });

  it("places representative anchors on their real projected regions", () => {
    const expectedPoints = {
      "base-en-US": { x: 0.226, y: 0.279 },
      "base-en-GB": { x: 0.493, y: 0.199 },
      "influence-brazilian-portuguese-influenced-english": {
        x: 0.367,
        y: 0.588,
      },
      "influence-japanese-influenced-english": { x: 0.888, y: 0.302 },
      "influence-italian-influenced-english": { x: 0.535, y: 0.267 },
      "influence-australian-english": { x: 0.914, y: 0.696 },
      "influence-canadian-english": { x: 0.29, y: 0.248 },
      "influence-new-york-english": { x: 0.294, y: 0.274 },
      "influence-southern-us-english": { x: 0.266, y: 0.313 },
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
    assert.equal(
      selected.accentDefinitionId,
      "japanese-influenced-english",
    );
    assert.deepEqual(selected.point, {
      x: japanese.point.x - 0.01,
      y: japanese.point.y + 0.01,
    });
  });

  it("keeps a freely dropped pin instead of snapping it to the chosen accent", () => {
    const dropped = { x: 0.28731, y: 0.29842 };
    const selected = pronunciationAtlasSelectionAtPoint(dropped, britishFrench);
    assert.deepEqual(pronunciationAtlasPointForSelection(selected), dropped);
    assert.notDeepEqual(
      pronunciationAtlasPointForSelection(selected),
      pronunciationAtlasAnchorForSelection(selected).point,
    );
  });

  it("clamps persisted pin geometry to the map", () => {
    const normalized = normalizePronunciationAtlasSelection({
      ...britishFrench,
      point: { x: -0.2, y: 1.4 },
    });
    assert.deepEqual(normalized.point, { x: 0, y: 1 });
  });

  it("resolves representative world regions to broadly local accents", () => {
    const expectations = [
      [{ x: 0.225, y: 0.392 }, "mexican-spanish-influenced-english"],
      [{ x: 0.294, y: 0.474 }, "latin-american-spanish-influenced-english"],
      [{ x: 0.528, y: 0.296 }, "north-african-arabic-influenced-english"],
      [{ x: 0.509, y: 0.464 }, "nigerian-english"],
      [{ x: 0.602, y: 0.507 }, "east-african-english"],
      [{ x: 0.578, y: 0.646 }, "south-african-english"],
      [{ x: 0.75, y: 0.368 }, "bengali-influenced-english"],
      [{ x: 0.779, y: 0.424 }, "thai-influenced-english"],
      [{ x: 0.836, y: 0.419 }, "filipino-english"],
      [{ x: 0.788, y: 0.493 }, "singapore-english"],
      [{ x: 0.996, y: 0.601 }, "pacific-island-english"],
    ] as const;

    for (const [point, expectedInfluence] of expectations) {
      assert.equal(
        pronunciationAtlasSelectionAtPoint(point, britishFrench).influence,
        expectedInfluence,
      );
    }
  });

  it("resolves New York and the Southern U.S. as distinct American regions", () => {
    for (const influence of [
      "new-york-english",
      "southern-us-english",
    ] as const) {
      const anchor = PRONUNCIATION_ATLAS_ANCHORS.find(
        (candidate) => candidate.influence === influence,
      );
      assert.ok(anchor);
      assert.equal(
        pronunciationAtlasSelectionAtPoint(anchor.point, britishFrench)
          .influence,
        influence,
      );
    }
  });

  it("pins the selected foundation instead of following the voice source", () => {
    const american = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.pronunciationBase === "en-US",
    );
    assert.ok(american);
    const selected = pronunciationAtlasSelectionAtPoint(
      american.point,
      britishFrench,
    );
    assert.equal(selected.pronunciationBase, "en-US");
    assert.equal(selected.influence, "none");
    assert.equal(selected.accentDefinitionId, "american-english");
    assert.equal(
      pronunciationAtlasLocationText(selected),
      "American · Balanced",
    );
  });

  it("freezes a legacy automatic foundation when any map point is chosen", () => {
    const french = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.influence === "french-influenced-english",
    );
    assert.ok(french);
    const selected = pronunciationAtlasSelectionAtPoint(french.point, {
      pronunciationBase: "follow-voice",
      sourceLocale: "en-GB",
      influence: "none",
      strength: "balanced",
    });
    assert.equal(selected.pronunciationBase, "en-GB");
    assert.equal(selected.influence, "french-influenced-english");
    assert.equal(
      selected.accentDefinitionId,
      "french-influenced-english",
    );
  });

  it("supports deterministic continuous keyboard travel", () => {
    const natural = pronunciationAtlasNaturalSelection("en-US");
    const origin = pronunciationAtlasPointForSelection(natural);
    const right = nudgePronunciationAtlasSelection(natural, "right");
    assert.deepEqual(right.point, { x: origin.x + 0.01, y: origin.y });
    assert.deepEqual(nudgePronunciationAtlasSelection(natural, "right"), right);
  });

  it("summarizes the chosen place without pronunciation jargon", () => {
    assert.equal(
      pronunciationAtlasLocationText({
        ...britishFrench,
        influence: "latin-american-spanish-influenced-english",
      }),
      "Latin American Spanish · Balanced",
    );
  });

  it("offers explicit nearby choices in dense map regions", () => {
    const ireland = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.influence === "irish-english",
    );
    assert.ok(ireland);
    const candidates = pronunciationAtlasNearbyCandidates(
      { ...britishFrench, point: ireland.point },
      6,
    );
    assert.equal(candidates[0]?.label, "Irish");
    assert.ok(candidates.some(({ label }) => label === "Scottish"));
    assert.ok(candidates.some(({ label }) => label === "British"));
  });

  it("exposes the co-located London constellation without inferring a variant", () => {
    const london = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.accentDefinitionId === "modern-rp-english",
    );
    assert.ok(london);
    const dropped = pronunciationAtlasSelectionAtPoint(london.point, {
      ...britishFrench,
      accentDefinitionId: null,
      influence: "none",
    });
    assert.equal(dropped.accentDefinitionId, "modern-rp-english");
    const candidates = pronunciationAtlasNearbyCandidates(dropped);
    for (const id of [
      "modern-rp-english",
      "cockney-english",
      "estuary-english",
      "multicultural-london-english",
      "essex-english",
    ]) {
      assert.ok(
        candidates.some(
          ({ selection }) => selection.accentDefinitionId === id,
        ),
        id,
      );
    }
  });

  it("keeps every nearby local-variant choice on the exact global pin", () => {
    const london = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.accentDefinitionId === "modern-rp-english",
    );
    assert.ok(london);
    const cockney = pronunciationAtlasNearbyCandidates(
      { ...britishFrench, point: london.point },
    ).find(
      ({ selection }) => selection.accentDefinitionId === "cockney-english",
    );
    assert.ok(cockney);
    assert.deepEqual(cockney.selection.point, london.point);
  });

  it("commits a nearby choice to its authored anchor", () => {
    const france = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.influence === "french-influenced-english",
    );
    assert.ok(france);
    const candidates = pronunciationAtlasNearbyCandidates(
      { ...britishFrench, point: france.point },
      16,
    );
    const german = candidates.find(({ label }) => label === "German");
    assert.ok(german);
    assert.equal(german.selection.influence, "german-influenced-english");
    assert.equal(
      german.selection.accentDefinitionId,
      "german-influenced-english",
    );
    assert.deepEqual(
      german.selection.point,
      PRONUNCIATION_ATLAS_ANCHORS.find(
        (anchor) => anchor.influence === "german-influenced-english",
      )?.point,
    );
  });

  it("clears the provider-neutral definition for Original", () => {
    assert.equal(
      pronunciationAtlasNaturalSelection("en-US").accentDefinitionId,
      null,
    );
  });

  it("keeps every lens a square window inside the unit map, world first", () => {
    assert.equal(PRONUNCIATION_ATLAS_LENSES[0]?.id, "world");
    assert.deepEqual(
      { ...PRONUNCIATION_ATLAS_LENSES[0] },
      { id: "world", label: "World", x: 0, y: 0, size: 1 },
    );
    assert.equal(
      new Set(PRONUNCIATION_ATLAS_LENSES.map((lens) => lens.id)).size,
      PRONUNCIATION_ATLAS_LENSES.length,
    );
    for (const lens of PRONUNCIATION_ATLAS_LENSES) {
      assert.ok(lens.label.trim().length > 0, lens.id);
      assert.ok(lens.size > 0 && lens.size <= 1, lens.id);
      assert.ok(lens.x >= 0 && lens.x + lens.size <= 1 + 1e-9, lens.id);
      assert.ok(lens.y >= 0 && lens.y + lens.size <= 1 + 1e-9, lens.id);
    }
    assert.equal(pronunciationAtlasLensForId("nowhere").id, "world");
  });

  it("separates every crowded anchor pair through at least one lens", () => {
    // The elbow-room contract: any two distinct anchor locations closer than
    // 24px on a 640x320 world pad must be at least 24px apart inside some
    // lens containing both. Same-point variant groups (London) are excluded:
    // they are deliberately co-located and chosen by name, never by zoom.
    // Same-metro pairs — real places only miles apart, like New York and
    // Newark — accept a lower 8px floor: the Northeast US lens frames the
    // whole region instead of zooming 90x into one harbor, and the Nearby
    // chips disambiguate those neighbors by name.
    const PAD_W = 640;
    const PAD_H = 320;
    const MIN_SEP = 24;
    const SAME_METRO_MIN_SEP = 8;
    const SAME_METRO_WORLD_SEP = 1;
    const locations = new Map<string, { x: number; y: number }>();
    for (const anchor of PRONUNCIATION_ATLAS_ANCHORS) {
      const key = `${anchor.point.x.toFixed(6)}:${anchor.point.y.toFixed(6)}`;
      if (!locations.has(key)) locations.set(key, anchor.point);
    }
    const points = [...locations.values()];
    const separation = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      size = 1,
    ): number =>
      Math.hypot(
        ((a.x - b.x) / size) * PAD_W,
        ((a.y - b.y) / size) * PAD_H,
      );
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const worldSeparation = separation(points[i]!, points[j]!);
        if (worldSeparation >= MIN_SEP) continue;
        const required =
          worldSeparation < SAME_METRO_WORLD_SEP
            ? SAME_METRO_MIN_SEP
            : MIN_SEP;
        assert.ok(
          PRONUNCIATION_ATLAS_LENSES.some(
            (lens) =>
              lens.size < 1 &&
              pronunciationAtlasLensContainsPoint(points[i]!, lens) &&
              pronunciationAtlasLensContainsPoint(points[j]!, lens) &&
              separation(points[i]!, points[j]!, lens.size) >= required,
          ),
          `no lens separates ${JSON.stringify(points[i])} and ${JSON.stringify(points[j])}`,
        );
      }
    }
  });

  it("projects between lens and map space losslessly and keeps pins global", () => {
    const northeast = pronunciationAtlasLensForId("us-northeast");
    assert.ok(northeast.size < 0.05);
    for (const anchor of PRONUNCIATION_ATLAS_ANCHORS) {
      const projected = projectPronunciationAtlasPointIntoLens(
        anchor.point,
        northeast,
      );
      const restored = pronunciationAtlasPointFromLensProjection(
        projected,
        northeast,
      );
      if (pronunciationAtlasLensContainsPoint(anchor.point, northeast)) {
        assert.ok(Math.abs(restored.x - anchor.point.x) < 1e-9);
        assert.ok(Math.abs(restored.y - anchor.point.y) < 1e-9);
        assert.ok(projected.x >= 0 && projected.x <= 1);
        assert.ok(projected.y >= 0 && projected.y <= 1);
      }
    }
    // The Northeast frame spans Boston through the New York metro.
    const inside = PRONUNCIATION_ATLAS_ANCHORS.filter((anchor) =>
      pronunciationAtlasLensContainsPoint(anchor.point, northeast),
    ).map((anchor) => anchor.accentDefinitionId);
    assert.deepEqual(
      [...new Set(inside)].sort(),
      [
        "eastern-new-england-english",
        "new-jersey-english",
        "new-york-english",
      ],
    );
    // A committed selection through the lens stores global coordinates.
    const padCenter = { x: 0.5, y: 0.5 };
    const global = pronunciationAtlasPointFromLensProjection(
      padCenter,
      northeast,
    );
    const selected = pronunciationAtlasSelectionAtPoint(global, britishFrench);
    assert.deepEqual(selected.point, global);
    assert.ok(pronunciationAtlasLensContainsPoint(selected.point!, northeast));
  });

  it("marks deeper lens footprints only where a lens fully contains them", () => {
    const withinIds = (id: string): string[] =>
      pronunciationAtlasLensesWithin(pronunciationAtlasLensForId(id)).map(
        (lens) => lens.id,
      );
    // The world never paints permanent footprints — eight rectangles over
    // the full map would be clutter; hover previews cover discovery there.
    assert.deepEqual(withinIds("world"), []);
    assert.deepEqual(withinIds("north-america"), ["us-east", "us-northeast"]);
    assert.deepEqual(withinIds("us-east"), ["us-northeast"]);
    assert.deepEqual(withinIds("europe"), ["isles"]);
    assert.deepEqual(withinIds("us-northeast"), []);
  });

  it("scales keyboard travel to the lens and keeps world travel legacy-exact", () => {
    const world = pronunciationAtlasLensForId("world");
    const origin = pronunciationAtlasNaturalSelection("en-US");
    assert.deepEqual(
      nudgePronunciationAtlasSelectionInLens(origin, "right", 1, world),
      nudgePronunciationAtlasSelection(origin, "right", 1),
    );
    const northeast = pronunciationAtlasLensForId("us-northeast");
    const start = pronunciationAtlasSelectionAtPoint(
      { x: northeast.x + northeast.size / 2, y: northeast.y + northeast.size / 2 },
      britishFrench,
    );
    const nudged = nudgePronunciationAtlasSelectionInLens(
      start,
      "right",
      1,
      northeast,
    );
    const travelled =
      pronunciationAtlasPointForSelection(nudged).x -
      pronunciationAtlasPointForSelection(start).x;
    assert.ok(Math.abs(travelled - 0.01 * northeast.size) < 1e-9);
  });
});
