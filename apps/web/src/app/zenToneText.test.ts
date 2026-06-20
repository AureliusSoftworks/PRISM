import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveZenLineDisplayPlacements,
  resolveZenMessageDisplayPlacement,
  resolveZenToneSpaceFromAnnoyance,
  resolveZenWordEffect,
} from "./zenToneText.ts";

describe("resolveZenToneSpaceFromAnnoyance", () => {
  it("keeps baseline annoyance at the closest spacing", () => {
    assert.equal(resolveZenToneSpaceFromAnnoyance(0), 0);
    assert.equal(resolveZenToneSpaceFromAnnoyance(0.12), 0);
  });

  it("opens spacing as annoyance rises", () => {
    assert.equal(resolveZenToneSpaceFromAnnoyance(0.82), 1);
    assert.equal(resolveZenToneSpaceFromAnnoyance(1), 1);
    assert.equal(resolveZenToneSpaceFromAnnoyance(0.47), 0.5);
  });
});

describe("resolveZenLineDisplayPlacements", () => {
  it("automatically centers the final line of a short ellipsis setup", () => {
    const placements = resolveZenLineDisplayPlacements({
      content: "...\n\n...What?",
      hasFencedCodeBlock: false,
    });
    assert.deepEqual(placements, [
      { index: 0, x: 0.5, y: 0.24, align: "center", source: "automatic" },
      { index: 2, x: 0.5, y: 0.5, align: "center", source: "automatic" },
    ]);
  });

  it("does not place long prose or code blocks automatically", () => {
    assert.deepEqual(
      resolveZenLineDisplayPlacements({
        content: "...\n\nThis is a longer ordinary paragraph with too many words to stage dramatically.",
        hasFencedCodeBlock: false,
      }),
      []
    );
    assert.deepEqual(
      resolveZenLineDisplayPlacements({
        content: "...\n\n...What?",
        hasFencedCodeBlock: true,
      }),
      []
    );
  });

  it("uses explicit metadata placements before automatic inference", () => {
    const placements = resolveZenLineDisplayPlacements({
      content: "...\n\n...What?",
      hasFencedCodeBlock: false,
      zenDisplay: {
        v: 1,
        lines: [{ index: 2, x: 0.25, y: 0.7, align: "end" }],
      },
    });
    assert.deepEqual(placements, [
      { index: 2, x: 0.25, y: 0.7, align: "end", source: "metadata" },
    ]);
  });
});

describe("resolveZenMessageDisplayPlacement", () => {
  it("normalizes incomplete message placement with centered defaults", () => {
    assert.deepEqual(
      resolveZenMessageDisplayPlacement({
        v: 1,
        placement: { y: 0.66 },
      }),
      { x: 0.5, y: 0.66, align: "center", source: "metadata" }
    );
  });
});

describe("resolveZenWordEffect", () => {
  it("classifies exclamation emphasis and affirmative motion", () => {
    assert.equal(resolveZenWordEffect("Wait!"), "emphasis");
    assert.equal(resolveZenWordEffect("yes"), "affirm");
    assert.equal(resolveZenWordEffect("Yeah,"), "affirm");
  });

  it("does not treat partial yes-like words as affirmations", () => {
    assert.equal(resolveZenWordEffect("yesterday"), null);
    assert.equal(resolveZenWordEffect("yes-ish"), null);
  });
});
