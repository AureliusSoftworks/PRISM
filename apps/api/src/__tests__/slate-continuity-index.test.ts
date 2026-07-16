import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ContinuityContextBudgetError,
  buildContinuityTextIndex,
  compileContinuityContextBrief,
  estimateContinuityTokens,
  extractDeterministicContinuityCandidates,
  hashContinuityText,
  planContinuitySourceIndex,
  type ContinuityContextCandidate,
  type ContinuityTextSource,
} from "../slate-continuity-index.ts";

function source(content: string, revision = 3, sourceId = "source-3"): ContinuityTextSource {
  return {
    sourceId,
    sectionId: "scene-7",
    sectionRevision: revision,
    content,
  };
}

describe("Slate deterministic Continuity indexing", () => {
  it("creates repeatable exact paragraph and sentence anchors", () => {
    const content =
      "  Dr. Mara Vale crossed the hall. She stopped at 3.14 p.m.\r\n\r\nThe bell rang twice!  ";
    const first = buildContinuityTextIndex(source(content));
    const second = buildContinuityTextIndex(source(content));

    assert.deepEqual(first, second);
    assert.equal(first.contentHash, hashContinuityText(content));
    assert.deepEqual(
      first.paragraphs.map((paragraph) => paragraph.text),
      ["Dr. Mara Vale crossed the hall. She stopped at 3.14 p.m.", "The bell rang twice!"],
    );
    assert.deepEqual(
      first.sentences.map((sentence) => sentence.text),
      ["Dr. Mara Vale crossed the hall.", "She stopped at 3.14 p.m.", "The bell rang twice!"],
    );
    for (const anchor of [...first.paragraphs, ...first.sentences]) {
      assert.equal(content.slice(anchor.start, anchor.end), anchor.text);
      assert.equal(anchor.quoteHash, hashContinuityText(anchor.text));
      assert.equal(anchor.sourceId, "source-3");
      assert.equal(anchor.sectionRevision, 3);
    }
  });

  it("skips identical work, reanchors identical prose, and isolates changed paragraphs", () => {
    const initial = planContinuitySourceIndex(source("Alpha remains.\n\nBeta changes."));
    assert.equal(initial.action, "extract");
    assert.equal(initial.changedParagraphs.length, 2);

    const retry = planContinuitySourceIndex(
      source("Alpha remains.\n\nBeta changes."),
      initial.checkpoint,
    );
    assert.equal(retry.action, "skip");
    assert.equal(retry.changedParagraphs.length, 0);

    const reanchored = planContinuitySourceIndex(
      source("Alpha remains.\n\nBeta changes.", 4, "source-4"),
      initial.checkpoint,
    );
    assert.equal(reanchored.action, "reanchor");
    assert.equal(reanchored.changedParagraphs.length, 0);
    assert.equal(reanchored.retainedParagraphCount, 2);

    const edited = planContinuitySourceIndex(
      source("New opening.\n\nAlpha remains.\n\nBeta resolves.", 4, "source-4"),
      initial.checkpoint,
    );
    assert.equal(edited.action, "extract");
    assert.deepEqual(
      edited.changedParagraphs.map((paragraph) => paragraph.text),
      ["New opening.", "Beta resolves."],
    );
    assert.equal(edited.retainedParagraphCount, 1);
    assert.deepEqual(edited.removedParagraphHashes, [hashContinuityText("Beta changes.")]);
  });

  it("extracts conservative entity, alias, and exact claim candidates without a model", () => {
    const content = [
      "Mara Vale, known as the Ash Regent, entered Northwatch.",
      "Mara Vale rules Northwatch.",
      "The Ash Regent believes the crown is cursed.",
      "Northwatch stands beyond the river.",
    ].join(" ");
    const candidates = extractDeterministicContinuityCandidates(source(content));
    const mara = candidates.entities.find((entity) => entity.normalizedName === "mara vale");
    const northwatch = candidates.entities.find(
      (entity) => entity.normalizedName === "northwatch",
    );

    assert.ok(mara);
    assert.deepEqual(mara.aliases, ["the Ash Regent"]);
    assert.equal(mara.kind, "character");
    assert.ok(mara.anchors.length >= 3);
    assert.equal(northwatch?.kind, "location");
    assert.equal(
      candidates.entities.some((entity) =>
        entity.normalizedName === "the ash regent" || entity.normalizedName === "ash regent"
      ),
      false,
    );

    assert.deepEqual(
      candidates.claims.map((claim) => ({
        subject: claim.subjectName,
        predicate: claim.predicate,
        object: claim.objectName,
        status: claim.epistemicStatus,
        perspective: claim.perspectiveNormalizedName,
      })),
      [
        {
          subject: "Mara Vale",
          predicate: "rule",
          object: "Northwatch",
          status: "fact",
          perspective: null,
        },
        {
          subject: "Mara Vale",
          predicate: "believes",
          object: null,
          status: "belief",
          perspective: "mara vale",
        },
        {
          subject: "Northwatch",
          predicate: "state",
          object: null,
          status: "fact",
          perspective: null,
        },
      ],
    );
    for (const claim of candidates.claims) {
      const anchor = claim.anchors[0]!;
      assert.equal(anchor.quoteHash, hashContinuityText(content.slice(anchor.start, anchor.end)));
      assert.equal(claim.confidence, 0.98);
    }

    assert.deepEqual(
      candidates,
      extractDeterministicContinuityCandidates(source(content)),
    );
  });
});

describe("Slate bounded Continuity context", () => {
  const required: ContinuityContextCandidate[] = [
    {
      id: "focus",
      kind: "focused_section",
      text: "Mara reaches the sealed archive.",
    },
    {
      id: "lock",
      kind: "locked_instruction",
      text: "Do not reveal who forged the crown.",
    },
    {
      id: "direction",
      kind: "writer_direction",
      text: "Keep the discovery intimate and tense.",
    },
  ];

  it("orders exact constraints first and stays within the estimated token budget", () => {
    const candidates: ContinuityContextCandidate[] = [
      { id: "entity-far", kind: "entity", text: "A".repeat(600), relevance: 1 },
      { id: "claim-low", kind: "claim", text: "The archive is beneath Northwatch.", relevance: 0.2 },
      { id: "thread", kind: "due_thread", text: "The missing key is due in this scene.", relevance: 0.8 },
      { id: "claim-high", kind: "claim", text: "Mara cannot read the old script.", relevance: 0.9 },
      { id: "adjacent", kind: "adjacent_section", sectionId: "scene-6", text: "The prior scene ended at dusk.", distance: 1 },
      ...[...required].reverse(),
    ];
    const minimum = compileContinuityContextBrief({
      projectId: "book-1",
      sectionId: "scene-7",
      sectionRevision: 3,
      candidates: required,
      tokenBudget: 200,
    });
    const budget = minimum.tokenEstimate + 45;
    const compiled = compileContinuityContextBrief({
      projectId: "book-1",
      sectionId: "scene-7",
      sectionRevision: 3,
      candidates,
      tokenBudget: budget,
    });

    assert.ok(compiled.tokenEstimate <= budget);
    assert.equal(compiled.tokenEstimate, estimateContinuityTokens(compiled.renderedBrief));
    assert.deepEqual(compiled.selectedCandidateIds.slice(0, 3), ["lock", "direction", "focus"]);
    assert.ok(compiled.selectedCandidateIds.includes("thread"));
    assert.ok(compiled.selectedCandidateIds.indexOf("claim-high") < compiled.selectedCandidateIds.indexOf("claim-low"));
    assert.ok(compiled.omittedCandidateIds.includes("entity-far"));
    assert.deepEqual(compiled.lockedInstructions, ["Do not reveal who forged the crown."]);
    assert.ok(compiled.sourceFingerprint.length > 32);

    const shuffled = compileContinuityContextBrief({
      projectId: "book-1",
      sectionId: "scene-7",
      sectionRevision: 3,
      candidates: [...candidates].reverse(),
      tokenBudget: budget,
    });
    assert.deepEqual(compiled, shuffled);
  });

  it("fails explicitly instead of silently dropping authoritative constraints", () => {
    assert.throws(
      () =>
        compileContinuityContextBrief({
          projectId: "book-1",
          sectionId: "scene-7",
          sectionRevision: 3,
          candidates: required,
          tokenBudget: 5,
        }),
      (error: unknown) =>
        error instanceof ContinuityContextBudgetError &&
        error.requiredTokenEstimate > error.tokenBudget,
    );
  });
});
