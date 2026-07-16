import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { currentContinuityProducerVersions } from "@localai/shared";
import {
  getNextSlateContinuityConcern,
  inferSlateConcernResolutionKind,
  linkSlateConcernRevisionProposal,
  resolveSlateContinuityConcern,
  settleSlateConcernRevision,
  slateRevisionRequestForContinuityConcern,
} from "../slate-continuity-reconciliation.ts";
import {
  listSlateProjectSections,
  saveSlateProjectSection,
} from "../slate-continuity.ts";
import { createSlateProject, updateSlateProject } from "../slate.ts";
import { closeTestDatabase, createTestDatabase } from "../test-support.ts";

const NOW = "2026-07-16T20:00:00.000Z";

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function seedUser(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@reconciliation.test`, id, NOW, NOW);
}

function seedProject(db: DatabaseSync, userId: string, suffix: string) {
  const created = createSlateProject(db, userId, {
    title: `The Glass Road ${suffix}`,
    spark: "A courier follows a road that remembers every traveler.",
  });
  updateSlateProject(db, userId, created.id, {
    structure: [
      {
        id: `scene-${suffix}`,
        kind: "scene",
        title: "The Crossing",
        summary: "Mara reaches the northern gate.",
        direction: "Keep the arrival tense.",
        status: "planned",
        locked: false,
      },
    ],
  });
  const section = listSlateProjectSections(db, userId, created.id)[0]!;
  const prose = "Mara arrived at the northern gate before sunset.";
  const saved = saveSlateProjectSection(db, userId, created.id, section.id, {
    expectedRevision: section.revision,
    mutationId: `save-${suffix}`,
    prose,
    status: "drafted",
  });
  const source = db
    .prepare(
      `SELECT id, source_revision FROM slate_continuity_sources
        WHERE user_id = ? AND project_id = ? AND section_id = ?
        ORDER BY source_revision DESC LIMIT 1`,
    )
    .get(userId, created.id, section.id) as { id: string; source_revision: number };
  const series = db
    .prepare("SELECT series_id FROM slate_projects WHERE id = ? AND user_id = ?")
    .get(created.id, userId) as { series_id: string };
  return {
    projectId: created.id,
    seriesId: series.series_id,
    sectionId: section.id,
    sectionRevision: saved.revision,
    sourceId: source.id,
    prose,
  };
}

function insertConcern(
  db: DatabaseSync,
  fixture: ReturnType<typeof seedProject>,
  userId: string,
  input: {
    id: string;
    severity?: "note" | "important" | "critical";
    kind?: string;
    recommended?: string;
    claimIds?: string[];
  },
): void {
  const anchor = {
    sourceId: fixture.sourceId,
    sectionId: fixture.sectionId,
    sectionRevision: fixture.sectionRevision,
    start: 0,
    end: fixture.prose.length,
    quoteHash: hash(fixture.prose),
  };
  db.prepare(
    `INSERT INTO slate_continuity_concerns
      (id, user_id, series_id, project_id, section_id, scope_kind, kind,
       severity, status, summary, explanation, claim_ids_json, anchors_json,
       recommended_resolution, producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'section', ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    userId,
    fixture.seriesId,
    fixture.projectId,
    fixture.sectionId,
    input.kind ?? "factual_contradiction",
    input.severity ?? "important",
    "The gate direction conflicts with settled canon.",
    "Two exact passages place the same gate in different directions.",
    JSON.stringify(input.claimIds ?? []),
    JSON.stringify([anchor]),
    input.recommended ?? "update_canon",
    JSON.stringify(currentContinuityProducerVersions()),
    NOW,
  );
}

function insertClaim(
  db: DatabaseSync,
  fixture: ReturnType<typeof seedProject>,
  userId: string,
  id: string,
): void {
  const anchor = {
    sourceId: fixture.sourceId,
    sectionId: fixture.sectionId,
    sectionRevision: fixture.sectionRevision,
    start: 0,
    end: fixture.prose.length,
    quoteHash: hash(fixture.prose),
  };
  db.prepare(
    `INSERT INTO slate_continuity_claims
      (id, user_id, series_id, project_id, section_id, scope_kind,
       subject_entity_id, predicate, object_entity_id, value, epistemic_status,
       perspective_entity_id, confidence, anchors_json, source_id,
       producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'section', NULL, 'gate_direction', NULL, 'north',
             'fact', NULL, 1, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    fixture.seriesId,
    fixture.projectId,
    fixture.sectionId,
    JSON.stringify([anchor]),
    fixture.sourceId,
    JSON.stringify(currentContinuityProducerVersions()),
    NOW,
  );
}

describe("Slate guided Continuity reconciliation", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "writer-a");
    seedUser(db, "writer-b");
  });

  afterEach(() => closeTestDatabase(db));

  it("returns only the highest-priority exact source-linked concern and stays tenant scoped", () => {
    const fixture = seedProject(db, "writer-a", "priority");
    insertConcern(db, fixture, "writer-a", { id: "note", severity: "note" });
    insertConcern(db, fixture, "writer-a", { id: "critical", severity: "critical" });

    const concern = getNextSlateContinuityConcern(db, "writer-a", fixture.projectId);
    assert.equal(concern?.id, "critical");
    assert.equal(concern?.passages.length, 1);
    assert.equal(concern?.passages[0]?.quote, fixture.prose);
    assert.equal(concern?.passages[0]?.sectionTitle, "The Crossing");
    assert.equal(concern?.suggestedAction.kind, "update_canon");
    assert.throws(
      () => getNextSlateContinuityConcern(db, "writer-b", fixture.projectId),
      /not found/i,
    );
  });

  it("records writer canon as a private source, queues indexing, and persists resolution", () => {
    const fixture = seedProject(db, "writer-a", "canon");
    const claimId = "gate-direction-fact";
    insertClaim(db, fixture, "writer-a", claimId);
    insertConcern(db, fixture, "writer-a", {
      id: "canon-concern",
      claimIds: [claimId],
    });

    const applied = resolveSlateContinuityConcern(
      db,
      "writer-a",
      fixture.projectId,
      "canon-concern",
      { direction: "The gate is canonically north; the other mention is mistaken." },
    );
    assert.equal(applied, "update_canon");
    const concern = db
      .prepare("SELECT status, resolution_json FROM slate_continuity_concerns WHERE id = ?")
      .get("canon-concern") as { status: string; resolution_json: string };
    assert.equal(concern.status, "resolved");
    assert.match(concern.resolution_json, /update_canon/);
    const source = db
      .prepare(
        `SELECT authority, kind, content FROM slate_continuity_sources
          WHERE user_id = ? AND project_id = ? AND kind = 'review_direction'`,
      )
      .get("writer-a", fixture.projectId) as { authority: string; kind: string; content: string };
    assert.equal(source.authority, "human");
    assert.match(source.content, /canonically north/);
    const queued = db
      .prepare(
        `SELECT COUNT(*) AS count FROM slate_continuity_jobs
          WHERE user_id = ? AND project_id = ? AND kind = 'extract_source'`,
      )
      .get("writer-a", fixture.projectId) as { count: number };
    assert.ok(queued.count >= 1);
    const replacement = db
      .prepare(
        `SELECT epistemic_status FROM slate_continuity_claims
          WHERE supersedes_claim_id = ? AND user_id = ?`,
      )
      .get(claimId, "writer-a") as { epistemic_status: string };
    assert.equal(replacement.epistemic_status, "superseded");
    assert.equal(getNextSlateContinuityConcern(db, "writer-a", fixture.projectId), null);
  });

  it("translates plain writer direction into belief, rumor, mystery, and ambiguity states", () => {
    assert.equal(inferSlateConcernResolutionKind("This is only a rumor.", "update_canon"), "mark_rumor");
    assert.equal(inferSlateConcernResolutionKind("Mara believes it.", "update_canon"), "mark_belief");
    assert.equal(inferSlateConcernResolutionKind("Keep this mystery unrevealed.", "update_canon"), "mark_mystery");
    assert.equal(inferSlateConcernResolutionKind("It is intentionally ambiguous.", "update_canon"), "preserve_ambiguity");

    const fixture = seedProject(db, "writer-a", "rumor");
    insertClaim(db, fixture, "writer-a", "rumor-claim");
    insertConcern(db, fixture, "writer-a", {
      id: "rumor-concern",
      claimIds: ["rumor-claim"],
    });
    const applied = resolveSlateContinuityConcern(
      db,
      "writer-a",
      fixture.projectId,
      "rumor-concern",
      { direction: "This is tavern rumor, not settled truth." },
    );
    assert.equal(applied, "mark_rumor");
    const replacement = db
      .prepare(
        "SELECT epistemic_status FROM slate_continuity_claims WHERE supersedes_claim_id = ?",
      )
      .get("rumor-claim") as { epistemic_status: string };
    assert.equal(replacement.epistemic_status, "rumor");
  });

  it("maps an exact concern passage to a previewable selection and reopens after rejection", () => {
    const fixture = seedProject(db, "writer-a", "revision");
    insertConcern(db, fixture, "writer-a", {
      id: "revision-concern",
      kind: "timeline_impossibility",
      recommended: "revise_prose",
    });
    const prepared = slateRevisionRequestForContinuityConcern(
      db,
      "writer-a",
      fixture.projectId,
      "revision-concern",
      "Move the arrival to after sunset.",
    );
    assert.equal(prepared.request.scope, "selection");
    assert.equal(prepared.request.action, "rewrite");
    assert.ok((prepared.request.selectionEnd ?? 0) > (prepared.request.selectionStart ?? 0));
    assert.match(prepared.request.direction ?? "", /after sunset/);

    db.prepare(
      `INSERT INTO slate_revisions
        (id, project_id, user_id, action, scope, selection_start, selection_end,
         direction, original_text, proposed_text, status, provider, model, created_at)
       VALUES ('revision-preview', ?, ?, 'rewrite', 'selection', ?, ?, ?, ?, ?,
               'pending', 'local', 'llama3.2', ?)`,
    ).run(
      fixture.projectId,
      "writer-a",
      prepared.request.selectionStart,
      prepared.request.selectionEnd,
      prepared.request.direction,
      fixture.prose,
      "Mara arrived after sunset.",
      NOW,
    );
    linkSlateConcernRevisionProposal(
      db,
      "writer-a",
      fixture.projectId,
      "revision-concern",
      "revision-preview",
      prepared.direction,
    );
    assert.equal(getNextSlateContinuityConcern(db, "writer-a", fixture.projectId), null);

    settleSlateConcernRevision(
      db,
      "writer-a",
      fixture.projectId,
      "revision-preview",
      "rejected",
    );
    assert.equal(getNextSlateContinuityConcern(db, "writer-a", fixture.projectId)?.id, "revision-concern");

    db.prepare("UPDATE slate_revisions SET status = 'pending' WHERE id = 'revision-preview'").run();
    linkSlateConcernRevisionProposal(
      db,
      "writer-a",
      fixture.projectId,
      "revision-concern",
      "revision-preview",
      prepared.direction,
    );
    settleSlateConcernRevision(
      db,
      "writer-a",
      fixture.projectId,
      "revision-preview",
      "accepted",
    );
    const settled = db
      .prepare("SELECT status, resolved_at FROM slate_continuity_concerns WHERE id = ?")
      .get("revision-concern") as { status: string; resolved_at: string | null };
    assert.equal(settled.status, "resolved");
    assert.ok(settled.resolved_at);
  });
});
