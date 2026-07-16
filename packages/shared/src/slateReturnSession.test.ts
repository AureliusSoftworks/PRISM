import assert from "node:assert/strict";
import test from "node:test";
import {
  SLATE_RETURN_SESSION_SCHEMA_VERSION,
  type SlateReturnSessionListResponse,
  type SlateReturnSessionResponse,
  type SlateReturnSessionSynopsis,
} from "./slate.ts";

function synopsis(): SlateReturnSessionSynopsis {
  return {
    schemaVersion: SLATE_RETURN_SESSION_SCHEMA_VERSION,
    producerVersions: {
      continuity: "0.0",
      schema: 1,
      extraction: 1,
      reconciliation: 1,
      contextCompilation: 1,
      recap: 1,
      atmosphere: 1,
    },
    sourceFingerprint: "a".repeat(64),
    generatedAt: "2026-07-16T12:00:00.000Z",
    projectId: "project-1",
    seriesId: "series-1",
    title: "The Winter Archive",
    premise: "A city records every broken promise.",
    storySoFar: "Mara returned and found seven winters missing from the ledger.",
    draftedProgress: "2 of 3 planned sections drafted · 1,200 words.",
    trajectory: "Next: Beneath the River.",
    mostRecentSection: {
      id: "section-2",
      title: "The Missing Ledger",
      summary: "The archive reveals a deliberate gap.",
      direction: "Keep the discovery quiet.",
      kind: "scene",
      status: "drafted",
      ordinal: 1,
      wordCount: 640,
    },
    nextPlannedSection: {
      id: "section-3",
      title: "Beneath the River",
      summary: "Mara follows the erased promise below the ice.",
      direction: "Let the river feel watchful.",
      kind: "scene",
      status: "planned",
      ordinal: 2,
      wordCount: 0,
    },
    threads: {
      open: [
        {
          id: "thread-1",
          label: "Why did the drowned bell ring?",
          status: "open",
          dueSectionId: null,
        },
      ],
      due: [],
    },
    counts: {
      sectionCount: 3,
      draftedSectionCount: 2,
      plannedSectionCount: 1,
      wordCount: 1_200,
      openThreadCount: 1,
      dueThreadCount: 0,
      openConcernCount: 0,
      canonRiskCount: 0,
      pendingRevisionCount: 0,
      entityCount: 4,
      characterCount: 2,
      claimCount: 8,
      eventCount: 3,
    },
    continuity: {
      activeVersion: "0.0",
      targetVersion: "0.0",
      activeGeneration: 1,
      upgradeStatus: "current",
      lastSuccessfulAt: "2026-07-16T11:59:00.000Z",
    },
    nextCard: {
      kind: "draft_section",
      priority: 4,
      title: "Draft Beneath the River",
      body: "Let the river feel watchful.",
      actionLabel: "Draft next",
      target: { kind: "section", id: "section-3" },
    },
  };
}

test("Slate return-session responses expose one versioned next card", () => {
  const session = {
    id: "session-1",
    projectId: "project-1",
    sourceFingerprint: "a".repeat(64),
    synopsis: synopsis(),
    createdAt: "2026-07-16T12:00:00.000Z",
    reused: false,
    isCurrent: true,
  };
  const response = { ok: true, session } satisfies SlateReturnSessionResponse;
  const list = { ok: true, sessions: [session] } satisfies SlateReturnSessionListResponse;

  assert.equal(SLATE_RETURN_SESSION_SCHEMA_VERSION, 1);
  assert.equal(response.session.synopsis.schemaVersion, 1);
  assert.equal(Array.isArray(response.session.synopsis.nextCard), false);
  assert.equal(response.session.synopsis.nextCard.kind, "draft_section");
  assert.deepEqual(list.sessions, [session]);
});
