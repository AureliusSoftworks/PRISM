import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { DebateSessionListItemV1 } from "@localai/shared";
import { groupDebateArchiveSessions } from "./debateArchiveCaseFamilies.ts";

function archiveRun(args: {
  id: string;
  status: DebateSessionListItemV1["status"];
  updatedAt: string;
  familyId?: string;
  ordinal?: number;
  version?: 1 | 2;
}): DebateSessionListItemV1 {
  return {
    id: args.id,
    format: "whodunnit",
    status: args.status,
    phase: args.status === "completed" ? "verdict" : "opening",
    title: "The Turnabout at Violet Hour",
    motion: "A frozen fictional case",
    moderatorTitle: "Judge",
    setupPresetId: "custom",
    formality: "structured",
    juryEnabled: true,
    playerRole: "spectator",
    winnerSideId: null,
    updatedAt: args.updatedAt,
    completedAt: args.status === "completed" ? args.updatedAt : null,
    activeDurationMs: args.status === "completed" ? 12_000 : null,
    exhibitCount: 3,
    mysteryVersion: args.version ?? 2,
    mysteryCaseFamilyId: args.familyId,
    mysteryRunOrdinal: args.ordinal,
  };
}

describe("Whodunnit V2 Archive families", () => {
  it("groups immutable runs newest-first and promotes the one open run", () => {
    const run1 = archiveRun({
      id: "run-1",
      status: "completed",
      updatedAt: "2026-08-24T10:00:00.000Z",
      familyId: "case-family",
      ordinal: 1,
    });
    const run2 = archiveRun({
      id: "run-2",
      status: "waiting_for_player",
      updatedAt: "2026-08-25T10:00:00.000Z",
      familyId: "case-family",
      ordinal: 2,
    });
    const legacy = archiveRun({
      id: "legacy-v1",
      status: "completed",
      updatedAt: "2026-08-23T10:00:00.000Z",
      version: 1,
    });

    const groups = groupDebateArchiveSessions([legacy, run1, run2]);
    assert.equal(groups.length, 2);
    const family = groups.find((group) => group.isMysteryCaseFamily)!;
    assert.equal(family.key, "mystery-v2:case-family");
    assert.deepEqual(family.runs.map((run) => run.id), ["run-2", "run-1"]);
    assert.equal(family.openRun?.id, "run-2");
    assert.equal(family.latestCompletedRun?.id, "run-1");
    assert.equal(family.representative.id, "run-2");
    assert.equal(groups[0]?.key, family.key, "families sort by their most recently updated run");
  });

  it("keeps siblings together when one completed run is removed", () => {
    const remaining = archiveRun({
      id: "run-2",
      status: "completed",
      updatedAt: "2026-08-25T10:00:00.000Z",
      familyId: "case-family",
      ordinal: 2,
    });
    const [family] = groupDebateArchiveSessions([remaining]);
    assert.ok(family?.isMysteryCaseFamily);
    assert.deepEqual(family?.runs.map((run) => run.id), ["run-2"]);
    assert.equal(family?.representative.id, "run-2");
    assert.equal(family?.openRun, null);
  });

  it("exposes nested Run actions and the same-mystery confirmation accessibly", () => {
    const source = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
    assert.ok(source.includes('aria-label={`Open Run ${ordinal} of ${session.title}`}'));
    assert.ok(source.includes('aria-label={`Remove Run ${ordinal} of ${session.title}`}'));
    assert.match(source, /role="dialog"[\s\S]*aria-modal="true"[\s\S]*debate-mystery-play-again-title/u);
    assert.match(source, /mysteryPlayAgainConfirmButtonRef\.current\?\.focus\(\)/u);
    assert.match(source, /event\.key !== "Escape"[\s\S]*setPendingMysteryPlayAgain\(null\)/u);
    assert.match(source, /culprit, evidence, dialogue, voices, cast, Powers, and settings stay identical/u);
    assert.match(source, /No active time recorded/u);
  });
});
