import assert from "node:assert/strict";
import test from "node:test";
import {
  SLATE_DEVELOPER_EVENT_DISCLOSURE,
  SLATE_REVIEW_EXPORT_FORMAT,
  isSlateReviewExportV1,
  type SlateDeveloperEvent,
} from "./slateReviewExport.ts";

test("Slate developer events expose bounded operational provenance", () => {
  const event = {
    schemaVersion: 1,
    disclosure: SLATE_DEVELOPER_EVENT_DISCLOSURE,
    id: "event-1",
    sequence: 1,
    projectId: "project-1",
    sectionId: "section-1",
    sectionRevision: 8,
    stage: "preflight",
    kind: "continuity_hard_conflict",
    summary: "Generation paused before the prose call.",
    detail: {
      outcome: "blocked",
      concernIds: ["concern-1"],
      explicitRationale: "Mara has not learned the bell's name.",
    },
    sourceIds: ["source-7"],
    operationId: "operation-4",
    clarificationId: "clarification-2",
    provider: null,
    model: null,
    continuityGeneration: 3,
    createdAt: "2026-07-29T12:00:00.000Z",
  } satisfies SlateDeveloperEvent;

  assert.equal(event.disclosure, "operational_provenance_only");
  assert.equal(event.stage, "preflight");
  assert.equal(Object.hasOwn(event, "chainOfThought"), false);
});

test("Slate Review V1 requires the canonical format and explicit sections", () => {
  const section = {
    section: {
      id: "section-1",
      title: "The Bell",
      kind: "scene",
      ordinal: 0,
      revision: 8,
      documentHash: "a".repeat(64),
      proseHash: "b".repeat(64),
    },
    acceptedProse: "The bell rang twice.",
    sources: [],
    operations: [],
    clarifications: [],
    developerEvents: [],
    storyBible: {
      characters: [],
      arcs: [],
      threads: [],
      timeline: [],
      causalEdges: [],
      relationships: [],
      knowledge: [],
      world: [],
      concerns: [],
    },
    mirror: {
      profileVersionId: null,
      projectOverlayId: null,
      povOverlayId: null,
      voiceCard: null,
      sourceFingerprint: null,
    },
    momentum: null,
  };
  const envelope = {
    format: SLATE_REVIEW_EXPORT_FORMAT,
    exportedAt: "2026-07-29T12:00:00.000Z",
    project: {
      id: "project-1",
      title: "The Bell",
      proseMode: "online",
      continuityVersion: "0.0",
      activeGeneration: 3,
      mirrorProfileVersionId: null,
      codeRevision: null,
    },
    sections: [section],
  };

  assert.equal(isSlateReviewExportV1(envelope), true);
  assert.equal(isSlateReviewExportV1({ ...envelope, sections: [] }), false);
  assert.equal(
    isSlateReviewExportV1({ ...envelope, format: "prism-slate-review-v2" }),
    false,
  );
  assert.equal(
    isSlateReviewExportV1({
      ...envelope,
      sections: [
        {
          ...section,
          operations: [{ id: "legacy-operation", directionIntent: {} }],
        },
      ],
    }),
    false,
  );
  assert.equal(
    isSlateReviewExportV1({
      ...envelope,
      sections: [
        {
          ...section,
          clarifications: [
            {
              id: "legacy-question",
              customVibe: { value: "quiet dread" },
            },
          ],
        },
      ],
    }),
    false,
  );
});
