import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import {
  detectAndPersistSlateContinuityConcerns,
  detectAndPersistSlateContinuityConcernsInTransaction,
} from "../slate-continuity-concerns.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

const NOW = "2026-07-16T18:00:00.000Z";
const VERSIONS = JSON.stringify({
  continuity: "0.0",
  schema: 1,
  extraction: 1,
  reconciliation: 1,
  contextCompilation: 1,
  recap: 1,
  atmosphere: 1,
});

interface Workspace {
  userId: string;
  seriesId: string;
  projectId: string;
  sections: string[];
}

interface SourceFixture {
  id: string;
  sectionId: string;
  revision: number;
  content: string;
  anchorsJson: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function seedWorkspace(db: DatabaseSync, suffix: string): Workspace {
  const userId = `concern-user-${suffix}`;
  const seriesId = `concern-series-${suffix}`;
  const projectId = `concern-project-${suffix}`;
  const sections = [0, 1, 2, 3].map(
    (ordinal) => `concern-section-${suffix}-${ordinal}`,
  );
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?)`,
  ).run(userId, `${suffix}@concerns.test`, suffix, NOW, NOW);
  db.prepare(
    `INSERT INTO slate_series
      (id, user_id, title, description, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?)`,
  ).run(seriesId, userId, `Series ${suffix}`, NOW, NOW);
  db.prepare(
    `INSERT INTO slate_projects
      (id, user_id, series_id, title, spark, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'A continuity test.', ?, ?)`,
  ).run(projectId, userId, seriesId, `Book ${suffix}`, NOW, NOW);
  const insertSection = db.prepare(
    `INSERT INTO slate_sections
      (id, project_id, series_id, user_id, kind, ordinal, title, prose,
       status, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'scene', ?, ?, ?, ?, ?, ?, ?)`,
  );
  sections.forEach((id, ordinal) => {
    const prose = ordinal < 3 ? `Drafted section ${ordinal + 1}.` : "";
    insertSection.run(
      id,
      projectId,
      seriesId,
      userId,
      ordinal,
      `Scene ${ordinal + 1}`,
      prose,
      prose ? "drafted" : "planned",
      sha256(prose),
      NOW,
      NOW,
    );
  });
  return { userId, seriesId, projectId, sections };
}

function insertSource(
  db: DatabaseSync,
  workspace: Workspace,
  input: {
    id: string;
    sectionIndex: number;
    revision: number;
    content: string;
  },
): SourceFixture {
  const sectionId = workspace.sections[input.sectionIndex]!;
  const anchor = {
    sourceId: input.id,
    sectionId,
    sectionRevision: input.revision,
    start: 0,
    end: input.content.length,
    quoteHash: sha256(input.content),
  };
  db.prepare(
    `INSERT INTO slate_continuity_sources
      (id, user_id, series_id, project_id, section_id, scope_kind, kind,
       source_revision, content, content_hash, authority,
       producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'section', 'human_edit', ?, ?, ?, 'human', ?, ?)`,
  ).run(
    input.id,
    workspace.userId,
    workspace.seriesId,
    workspace.projectId,
    sectionId,
    input.revision,
    input.content,
    sha256(input.content),
    VERSIONS,
    NOW,
  );
  return {
    id: input.id,
    sectionId,
    revision: input.revision,
    content: input.content,
    anchorsJson: JSON.stringify([anchor]),
  };
}

function insertEntity(
  db: DatabaseSync,
  workspace: Workspace,
  source: SourceFixture,
  id: string,
  kind: string,
  name: string,
): void {
  db.prepare(
    `INSERT INTO slate_continuity_entities
      (id, user_id, series_id, kind, canonical_name, description, locked,
       anchors_json, source_id, producer_versions_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', 0, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workspace.userId,
    workspace.seriesId,
    kind,
    name,
    source.anchorsJson,
    source.id,
    VERSIONS,
    NOW,
    NOW,
  );
}

function insertClaim(
  db: DatabaseSync,
  workspace: Workspace,
  source: SourceFixture,
  input: {
    id: string;
    subjectId: string;
    predicate: string;
    value: string;
    status?: string;
    confidence?: number;
    anchorsJson?: string;
  },
): void {
  db.prepare(
    `INSERT INTO slate_continuity_claims
      (id, user_id, series_id, project_id, section_id, scope_kind,
       subject_entity_id, predicate, value, epistemic_status, confidence,
       anchors_json, source_id, producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'section', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    workspace.userId,
    workspace.seriesId,
    workspace.projectId,
    source.sectionId,
    input.subjectId,
    input.predicate,
    input.value,
    input.status ?? "fact",
    input.confidence ?? 1,
    input.anchorsJson ?? source.anchorsJson,
    source.id,
    VERSIONS,
    NOW,
  );
}

function insertEvent(
  db: DatabaseSync,
  workspace: Workspace,
  source: SourceFixture,
  input: {
    id: string;
    title: string;
    chronologyKey: string | null;
    participantIds: string[];
    locationId: string | null;
    anchorsJson?: string;
  },
): void {
  db.prepare(
    `INSERT INTO slate_continuity_events
      (id, user_id, series_id, project_id, section_id, scope_kind, title,
       description, chronology_key, participant_entity_ids_json,
       location_entity_id, anchors_json, source_id,
       producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'section', ?, '', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    workspace.userId,
    workspace.seriesId,
    workspace.projectId,
    source.sectionId,
    input.title,
    input.chronologyKey,
    JSON.stringify(input.participantIds),
    input.locationId,
    input.anchorsJson ?? source.anchorsJson,
    source.id,
    VERSIONS,
    NOW,
  );
}

function insertRelationship(
  db: DatabaseSync,
  workspace: Workspace,
  source: SourceFixture,
  input: {
    id: string;
    fromId: string;
    toId: string;
    kind: string;
    state: string;
    epistemicStatus?: string;
    anchorsJson?: string;
  },
): void {
  db.prepare(
    `INSERT INTO slate_continuity_relationships
      (id, user_id, series_id, from_entity_id, to_entity_id, kind, state,
       epistemic_status, anchors_json, source_id,
       producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    workspace.userId,
    workspace.seriesId,
    input.fromId,
    input.toId,
    input.kind,
    input.state,
    input.epistemicStatus ?? "fact",
    input.anchorsJson ?? source.anchorsJson,
    source.id,
    VERSIONS,
    NOW,
  );
}

function insertThread(
  db: DatabaseSync,
  workspace: Workspace,
  source: SourceFixture,
  input: {
    id: string;
    label: string;
    status: string;
    dueSectionId: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO slate_continuity_threads
      (id, user_id, series_id, project_id, section_id, scope_kind, label,
       status, due_section_id, anchors_json, source_id,
       producer_versions_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'book', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    workspace.userId,
    workspace.seriesId,
    workspace.projectId,
    source.sectionId,
    input.label,
    input.status,
    input.dueSectionId,
    source.anchorsJson,
    source.id,
    VERSIONS,
    NOW,
    NOW,
  );
}

function concernRows(db: DatabaseSync, userId: string, projectId: string) {
  return db
    .prepare(
      `SELECT id, kind, status, anchors_json, claim_ids_json, resolved_at
         FROM slate_continuity_concerns
        WHERE user_id = ? AND project_id = ?
        ORDER BY kind ASC, id ASC`,
    )
    .all(userId, projectId) as Array<{
    id: string;
    kind: string;
    status: string;
    anchors_json: string;
    claim_ids_json: string;
    resolved_at: string | null;
  }>;
}

function assertExactStoredAnchors(db: DatabaseSync, rows: ReturnType<typeof concernRows>): void {
  for (const row of rows) {
    const anchors = JSON.parse(row.anchors_json) as Array<{
      sourceId: string;
      start: number;
      end: number;
      quoteHash: string;
    }>;
    assert.ok(anchors.length > 0, `${row.kind} should retain exact evidence`);
    for (const anchor of anchors) {
      const source = db
        .prepare("SELECT content FROM slate_continuity_sources WHERE id = ?")
        .get(anchor.sourceId) as { content: string };
      assert.equal(
        anchor.quoteHash,
        sha256(source.content.slice(anchor.start, anchor.end)),
      );
    }
  }
}

describe("deterministic Slate Continuity concerns", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => closeTestDatabase(db));

  it("detects only exact fact, same-stage state, and single-valued world-rule conflicts", () => {
    const workspace = seedWorkspace(db, "facts");
    const sources = [
      insertSource(db, workspace, { id: "facts-state-open", sectionIndex: 0, revision: 1, content: "The vault is open." }),
      insertSource(db, workspace, { id: "facts-state-sealed", sectionIndex: 0, revision: 2, content: "The vault is sealed." }),
      insertSource(db, workspace, { id: "facts-rule-memory", sectionIndex: 0, revision: 3, content: "Moon travel costs one memory." }),
      insertSource(db, workspace, { id: "facts-rule-year", sectionIndex: 1, revision: 1, content: "Moon travel costs one year." }),
      insertSource(db, workspace, { id: "facts-birth-115", sectionIndex: 0, revision: 4, content: "Elara was born in 115." }),
      insertSource(db, workspace, { id: "facts-birth-116", sectionIndex: 1, revision: 2, content: "Elara was born in 116." }),
      insertSource(db, workspace, { id: "facts-lamp-lit", sectionIndex: 0, revision: 5, content: "The lamp is lit." }),
      insertSource(db, workspace, { id: "facts-lamp-dark", sectionIndex: 1, revision: 3, content: "Later, the lamp is dark." }),
      insertSource(db, workspace, { id: "facts-belief", sectionIndex: 0, revision: 6, content: "Elara believes the vault is broken." }),
      insertSource(db, workspace, { id: "facts-rumor", sectionIndex: 0, revision: 7, content: "Rumor says the vault is gone." }),
      insertSource(db, workspace, { id: "facts-mystery", sectionIndex: 0, revision: 8, content: "No one knows whether the vault is real." }),
      insertSource(db, workspace, { id: "facts-ambiguity", sectionIndex: 0, revision: 9, content: "The vault may be a dream." }),
      insertSource(db, workspace, { id: "facts-likes-tea", sectionIndex: 0, revision: 10, content: "Elara likes tea." }),
      insertSource(db, workspace, { id: "facts-likes-coffee", sectionIndex: 0, revision: 11, content: "Elara likes coffee." }),
      insertSource(db, workspace, { id: "facts-invalid-a", sectionIndex: 0, revision: 12, content: "Niko was born in 210." }),
      insertSource(db, workspace, { id: "facts-invalid-b", sectionIndex: 0, revision: 13, content: "Niko was born in 211." }),
    ];
    const [stateOpen, stateSealed, ruleMemory, ruleYear, birth115, birth116, lampLit, lampDark, belief, rumor, mystery, ambiguity, likesTea, likesCoffee, invalidA, invalidB] = sources;
    insertEntity(db, workspace, stateOpen!, "facts-vault", "object", "The Vault");
    insertEntity(db, workspace, ruleMemory!, "facts-rule", "world_rule", "Moon Travel Cost");
    insertEntity(db, workspace, birth115!, "facts-elara", "character", "Elara");
    insertEntity(db, workspace, lampLit!, "facts-lamp", "object", "The Lamp");
    insertEntity(db, workspace, invalidA!, "facts-niko", "character", "Niko");

    insertClaim(db, workspace, stateOpen!, { id: "claim-state-open", subjectId: "facts-vault", predicate: "state", value: "open" });
    insertClaim(db, workspace, stateSealed!, { id: "claim-state-sealed", subjectId: "facts-vault", predicate: "state", value: "sealed" });
    insertClaim(db, workspace, ruleMemory!, { id: "claim-rule-memory", subjectId: "facts-rule", predicate: "cost", value: "one memory" });
    insertClaim(db, workspace, ruleYear!, { id: "claim-rule-year", subjectId: "facts-rule", predicate: "cost", value: "one year" });
    insertClaim(db, workspace, birth115!, { id: "claim-birth-115", subjectId: "facts-elara", predicate: "birth date", value: "115" });
    insertClaim(db, workspace, birth116!, { id: "claim-birth-116", subjectId: "facts-elara", predicate: "birth date", value: "116" });
    insertClaim(db, workspace, lampLit!, { id: "claim-lamp-lit", subjectId: "facts-lamp", predicate: "state", value: "lit" });
    insertClaim(db, workspace, lampDark!, { id: "claim-lamp-dark", subjectId: "facts-lamp", predicate: "state", value: "dark" });
    insertClaim(db, workspace, belief!, { id: "claim-belief", subjectId: "facts-vault", predicate: "state", value: "broken", status: "belief" });
    insertClaim(db, workspace, rumor!, { id: "claim-rumor", subjectId: "facts-vault", predicate: "state", value: "gone", status: "rumor" });
    insertClaim(db, workspace, mystery!, { id: "claim-mystery", subjectId: "facts-vault", predicate: "state", value: "unknown", status: "mystery" });
    insertClaim(db, workspace, ambiguity!, { id: "claim-ambiguity", subjectId: "facts-vault", predicate: "state", value: "dream", status: "ambiguity" });
    insertClaim(db, workspace, likesTea!, { id: "claim-likes-tea", subjectId: "facts-elara", predicate: "likes", value: "tea" });
    insertClaim(db, workspace, likesCoffee!, { id: "claim-likes-coffee", subjectId: "facts-elara", predicate: "likes", value: "coffee" });
    insertClaim(db, workspace, invalidA!, { id: "claim-invalid-a", subjectId: "facts-niko", predicate: "birth_date", value: "210" });
    insertClaim(db, workspace, invalidB!, { id: "claim-invalid-b", subjectId: "facts-niko", predicate: "birth_date", value: "211", anchorsJson: JSON.stringify([{ ...JSON.parse(invalidB!.anchorsJson)[0], quoteHash: "invalid" }]) });

    const first = detectAndPersistSlateContinuityConcerns(
      db,
      workspace.userId,
      workspace.projectId,
      { currentSectionId: workspace.sections[1], now: new Date(NOW) },
    );
    const rows = concernRows(db, workspace.userId, workspace.projectId);

    assert.equal(first.detected, 3);
    assert.equal(first.inserted, 3);
    assert.deepEqual(
      rows.map((row) => row.kind),
      ["factual_contradiction", "state_conflict", "world_rule_conflict"],
    );
    assertExactStoredAnchors(db, rows);
    const allClaimIds = rows.flatMap(
      (row) => JSON.parse(row.claim_ids_json) as string[],
    );
    assert.ok(!allClaimIds.includes("claim-belief"));
    assert.ok(!allClaimIds.includes("claim-rumor"));
    assert.ok(!allClaimIds.includes("claim-mystery"));
    assert.ok(!allClaimIds.includes("claim-ambiguity"));
    assert.ok(!allClaimIds.includes("claim-invalid-b"));

    const byKind = new Map(rows.map((row) => [row.kind, row]));
    db.prepare("UPDATE slate_continuity_concerns SET status = 'intentional' WHERE id = ?").run(byKind.get("state_conflict")!.id);
    db.prepare("UPDATE slate_continuity_concerns SET status = 'deferred' WHERE id = ?").run(byKind.get("world_rule_conflict")!.id);
    db.prepare("UPDATE slate_continuity_concerns SET status = 'resolved', resolved_at = ? WHERE id = ?").run("2026-07-16T19:00:00.000Z", byKind.get("factual_contradiction")!.id);

    const second = detectAndPersistSlateContinuityConcerns(
      db,
      workspace.userId,
      workspace.projectId,
      { currentSectionId: workspace.sections[1], now: new Date("2026-07-16T20:00:00.000Z") },
    );
    const rerun = concernRows(db, workspace.userId, workspace.projectId);
    assert.equal(second.inserted, 0);
    assert.equal(second.updated, 3);
    assert.equal(second.preservedWriterState, 3);
    assert.deepEqual(second.concernIds, first.concernIds);
    assert.deepEqual(
      rerun.map((row) => [row.kind, row.status]),
      [
        ["factual_contradiction", "resolved"],
        ["state_conflict", "intentional"],
        ["world_rule_conflict", "deferred"],
      ],
    );
    assert.equal(
      rerun.find((row) => row.kind === "factual_contradiction")?.resolved_at,
      "2026-07-16T19:00:00.000Z",
    );
  });

  it("flags only exact same-time character location impossibilities", () => {
    const workspace = seedWorkspace(db, "timeline");
    const base = insertSource(db, workspace, { id: "timeline-base", sectionIndex: 0, revision: 1, content: "Elara crossed the map." });
    insertEntity(db, workspace, base, "timeline-elara", "character", "Elara");
    insertEntity(db, workspace, base, "timeline-niko", "character", "Niko");
    insertEntity(db, workspace, base, "timeline-raven", "object", "The Raven");
    insertEntity(db, workspace, base, "timeline-harbor", "location", "Harbor");
    insertEntity(db, workspace, base, "timeline-tower", "location", "Tower");

    const harbor = insertSource(db, workspace, { id: "timeline-harbor-source", sectionIndex: 0, revision: 2, content: "At noon, Elara waits in the harbor." });
    const tower = insertSource(db, workspace, { id: "timeline-tower-source", sectionIndex: 1, revision: 1, content: "At noon, Elara stands in the tower." });
    const later = insertSource(db, workspace, { id: "timeline-later-source", sectionIndex: 1, revision: 2, content: "At dusk, Elara reaches the tower." });
    const caseDifference = insertSource(db, workspace, { id: "timeline-case-source", sectionIndex: 1, revision: 3, content: "At Noon, Elara visits the tower." });
    const objectEvent = insertSource(db, workspace, { id: "timeline-object-source", sectionIndex: 1, revision: 4, content: "The raven appears in the tower." });
    const nikoValid = insertSource(db, workspace, { id: "timeline-niko-valid", sectionIndex: 0, revision: 3, content: "Niko waits in the harbor." });
    const nikoInvalid = insertSource(db, workspace, { id: "timeline-niko-invalid", sectionIndex: 1, revision: 5, content: "Niko waits in the tower." });

    insertEvent(db, workspace, harbor, { id: "event-harbor", title: "Harbor noon", chronologyKey: "day-3:noon", participantIds: ["timeline-elara"], locationId: "timeline-harbor" });
    insertEvent(db, workspace, tower, { id: "event-tower", title: "Tower noon", chronologyKey: "day-3:noon", participantIds: ["timeline-elara"], locationId: "timeline-tower" });
    insertEvent(db, workspace, later, { id: "event-later", title: "Tower dusk", chronologyKey: "day-3:dusk", participantIds: ["timeline-elara"], locationId: "timeline-tower" });
    insertEvent(db, workspace, caseDifference, { id: "event-case", title: "Tower Noon", chronologyKey: "day-3:Noon", participantIds: ["timeline-elara"], locationId: "timeline-tower" });
    insertEvent(db, workspace, objectEvent, { id: "event-object", title: "Raven noon", chronologyKey: "day-3:noon", participantIds: ["timeline-raven"], locationId: "timeline-tower" });
    insertEvent(db, workspace, nikoValid, { id: "event-niko-valid", title: "Niko harbor", chronologyKey: "day-3:noon", participantIds: ["timeline-niko"], locationId: "timeline-harbor" });
    insertEvent(db, workspace, nikoInvalid, { id: "event-niko-invalid", title: "Niko tower", chronologyKey: "day-3:noon", participantIds: ["timeline-niko"], locationId: "timeline-tower", anchorsJson: JSON.stringify([{ ...JSON.parse(nikoInvalid.anchorsJson)[0], start: 999 }]) });

    const result = detectAndPersistSlateContinuityConcerns(
      db,
      workspace.userId,
      workspace.projectId,
      { currentSectionId: workspace.sections[1] },
    );
    const rows = concernRows(db, workspace.userId, workspace.projectId);

    assert.equal(result.detected, 1);
    assert.equal(rows[0]?.kind, "timeline_impossibility");
    assert.equal((JSON.parse(rows[0]!.anchors_json) as unknown[]).length, 2);
    assertExactStoredAnchors(db, rows);
  });

  it("detects only exact same-stage settled relationship conflicts", () => {
    const workspace = seedWorkspace(db, "relationships");
    const base = insertSource(db, workspace, { id: "relationship-base", sectionIndex: 0, revision: 1, content: "Elara and Niko entered the council chamber." });
    insertEntity(db, workspace, base, "relationship-elara", "character", "Elara");
    insertEntity(db, workspace, base, "relationship-niko", "character", "Niko");
    insertEntity(db, workspace, base, "relationship-council", "group", "River Council");

    const allied = insertSource(db, workspace, { id: "relationship-allied", sectionIndex: 0, revision: 2, content: "Elara and Niko are allied." });
    const hostile = insertSource(db, workspace, { id: "relationship-hostile", sectionIndex: 0, revision: 3, content: "Elara and Niko are hostile." });
    insertRelationship(db, workspace, allied, { id: "relationship-fact-allied", fromId: "relationship-elara", toId: "relationship-niko", kind: "allegiance", state: "allied" });
    insertRelationship(db, workspace, hostile, { id: "relationship-fact-hostile", fromId: "relationship-elara", toId: "relationship-niko", kind: "allegiance", state: "hostile" });

    const councilFact = insertSource(db, workspace, { id: "relationship-council-fact", sectionIndex: 0, revision: 4, content: "Elara supports the River Council." });
    const councilBelief = insertSource(db, workspace, { id: "relationship-council-belief", sectionIndex: 0, revision: 5, content: "Niko believes Elara opposes the River Council." });
    const councilRumor = insertSource(db, workspace, { id: "relationship-council-rumor", sectionIndex: 0, revision: 6, content: "Rumor says Elara opposes the River Council." });
    const councilMystery = insertSource(db, workspace, { id: "relationship-council-mystery", sectionIndex: 0, revision: 7, content: "No one knows where Elara stands with the River Council." });
    const councilAmbiguity = insertSource(db, workspace, { id: "relationship-council-ambiguity", sectionIndex: 0, revision: 8, content: "Elara may oppose the River Council." });
    const councilUncertainFact = insertSource(db, workspace, { id: "relationship-council-uncertain", sectionIndex: 0, revision: 9, content: "Elara is perhaps hostile to the River Council." });
    const councilInvalid = insertSource(db, workspace, { id: "relationship-council-invalid", sectionIndex: 0, revision: 10, content: "Elara opposes the River Council." });
    insertRelationship(db, workspace, councilFact, { id: "relationship-council-settled", fromId: "relationship-elara", toId: "relationship-council", kind: "alignment", state: "supportive" });
    insertRelationship(db, workspace, councilBelief, { id: "relationship-council-belief-row", fromId: "relationship-elara", toId: "relationship-council", kind: "alignment", state: "hostile", epistemicStatus: "belief" });
    insertRelationship(db, workspace, councilRumor, { id: "relationship-council-rumor-row", fromId: "relationship-elara", toId: "relationship-council", kind: "alignment", state: "hostile", epistemicStatus: "rumor" });
    insertRelationship(db, workspace, councilMystery, { id: "relationship-council-mystery-row", fromId: "relationship-elara", toId: "relationship-council", kind: "alignment", state: "unknown", epistemicStatus: "mystery" });
    insertRelationship(db, workspace, councilAmbiguity, { id: "relationship-council-ambiguity-row", fromId: "relationship-elara", toId: "relationship-council", kind: "alignment", state: "uncertain", epistemicStatus: "ambiguity" });
    insertRelationship(db, workspace, councilUncertainFact, { id: "relationship-council-uncertain-row", fromId: "relationship-elara", toId: "relationship-council", kind: "alignment", state: "perhaps hostile" });
    insertRelationship(db, workspace, councilInvalid, { id: "relationship-council-invalid-row", fromId: "relationship-elara", toId: "relationship-council", kind: "alignment", state: "hostile", anchorsJson: JSON.stringify([{ ...JSON.parse(councilInvalid.anchorsJson)[0], quoteHash: "invalid" }]) });

    const earlier = insertSource(db, workspace, { id: "relationship-evolution-a", sectionIndex: 0, revision: 11, content: "Niko trusts Elara." });
    const later = insertSource(db, workspace, { id: "relationship-evolution-b", sectionIndex: 1, revision: 1, content: "Later, Niko distrusts Elara." });
    insertRelationship(db, workspace, earlier, { id: "relationship-evolution-trust", fromId: "relationship-niko", toId: "relationship-elara", kind: "trust", state: "trusted" });
    insertRelationship(db, workspace, later, { id: "relationship-evolution-distrust", fromId: "relationship-niko", toId: "relationship-elara", kind: "trust", state: "distrusted" });

    const result = detectAndPersistSlateContinuityConcerns(
      db,
      workspace.userId,
      workspace.projectId,
      { currentSectionId: workspace.sections[1] },
    );
    const relationships = concernRows(
      db,
      workspace.userId,
      workspace.projectId,
    ).filter((row) => row.kind === "relationship_conflict");

    assert.equal(result.detected, 1);
    assert.equal(relationships.length, 1);
    assert.equal(
      (JSON.parse(relationships[0]!.anchors_json) as unknown[]).length,
      2,
    );
    assertExactStoredAnchors(db, relationships);
  });

  it("finds explicit knowledge-before-learning leaks and only threads due at the current stage", () => {
    const workspace = seedWorkspace(db, "stage");
    const factSource = insertSource(db, workspace, { id: "stage-fact", sectionIndex: 0, revision: 1, content: "The sigil opens the western gate." });
    const knowsSource = insertSource(db, workspace, { id: "stage-knows", sectionIndex: 0, revision: 2, content: "Iris knows what the sigil opens." });
    const learnsSource = insertSource(db, workspace, { id: "stage-learns", sectionIndex: 2, revision: 1, content: "Iris learns that the sigil opens the western gate." });
    const afterSource = insertSource(db, workspace, { id: "stage-after", sectionIndex: 3, revision: 1, content: "Afterward, Iris remembers the western gate." });
    const rumorSource = insertSource(db, workspace, { id: "stage-rumor", sectionIndex: 0, revision: 3, content: "Rumor says the eastern gate opens too." });
    const dueSource = insertSource(db, workspace, { id: "stage-due", sectionIndex: 0, revision: 4, content: "Who forged the sigil?" });
    const futureSource = insertSource(db, workspace, { id: "stage-future", sectionIndex: 0, revision: 5, content: "Where did the lost key go?" });
    const intentionalSource = insertSource(db, workspace, { id: "stage-intentional", sectionIndex: 0, revision: 6, content: "The founder remains unnamed." });

    insertEntity(db, workspace, factSource, "stage-iris", "character", "Iris");
    insertEntity(db, workspace, factSource, "stage-sigil", "object", "The Sigil");
    insertEntity(db, workspace, factSource, "stage-gate", "location", "Western Gate");
    insertClaim(db, workspace, factSource, { id: "stage-fact-claim", subjectId: "stage-sigil", predicate: "opens", value: "the western gate" });
    insertClaim(db, workspace, rumorSource, { id: "stage-rumor-claim", subjectId: "stage-sigil", predicate: "opens", value: "the eastern gate", status: "rumor" });
    insertEvent(db, workspace, learnsSource, { id: "stage-learning-event", title: "Iris learns the sigil's purpose", chronologyKey: "book-1:scene-3", participantIds: ["stage-iris"], locationId: "stage-gate" });

    const insertKnowledge = db.prepare(
      `INSERT INTO slate_continuity_knowledge
        (id, user_id, series_id, character_entity_id, claim_id,
         learned_event_id, status, anchors_json, source_id,
         producer_versions_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertKnowledge.run("knowledge-too-early", workspace.userId, workspace.seriesId, "stage-iris", "stage-fact-claim", "stage-learning-event", "knows", knowsSource.anchorsJson, knowsSource.id, VERSIONS, NOW);
    insertKnowledge.run("knowledge-belief", workspace.userId, workspace.seriesId, "stage-iris", "stage-fact-claim", "stage-learning-event", "believes", knowsSource.anchorsJson, knowsSource.id, VERSIONS, NOW);
    insertKnowledge.run("knowledge-after", workspace.userId, workspace.seriesId, "stage-iris", "stage-fact-claim", "stage-learning-event", "knows", afterSource.anchorsJson, afterSource.id, VERSIONS, NOW);
    insertKnowledge.run("knowledge-rumor", workspace.userId, workspace.seriesId, "stage-iris", "stage-rumor-claim", "stage-learning-event", "knows", knowsSource.anchorsJson, knowsSource.id, VERSIONS, NOW);

    insertThread(db, workspace, dueSource, { id: "thread-due", label: "Who forged the sigil?", status: "open", dueSectionId: workspace.sections[1]! });
    insertThread(db, workspace, futureSource, { id: "thread-future", label: "Find the lost key", status: "open", dueSectionId: workspace.sections[2]! });
    insertThread(db, workspace, intentionalSource, { id: "thread-intentional", label: "Name the founder", status: "intentional", dueSectionId: workspace.sections[1]! });

    const atSecond = detectAndPersistSlateContinuityConcerns(
      db,
      workspace.userId,
      workspace.projectId,
      { currentSectionId: workspace.sections[1] },
    );
    const secondRows = concernRows(db, workspace.userId, workspace.projectId);
    assert.equal(atSecond.detected, 2);
    assert.deepEqual(
      secondRows.map((row) => row.kind),
      ["due_thread", "knowledge_leak"],
    );
    assertExactStoredAnchors(db, secondRows);

    const atThird = detectAndPersistSlateContinuityConcerns(
      db,
      workspace.userId,
      workspace.projectId,
      { currentSectionId: workspace.sections[2] },
    );
    assert.equal(atThird.detected, 3);
    assert.equal(
      concernRows(db, workspace.userId, workspace.projectId).filter(
        (row) => row.kind === "due_thread",
      ).length,
      2,
    );
  });

  it("surfaces explicitly planned, act, and book due milestones while leaving ordinary open threads quiet", () => {
    const actWorkspace = seedWorkspace(db, "milestone-act");
    db.prepare(
      "UPDATE slate_sections SET kind = 'act', title = 'Act One Close' WHERE id = ? AND user_id = ?",
    ).run(actWorkspace.sections[1], actWorkspace.userId);
    const plannedSource = insertSource(db, actWorkspace, { id: "milestone-planned-source", sectionIndex: 0, revision: 1, content: "Reveal who stole the map." });
    const actSource = insertSource(db, actWorkspace, { id: "milestone-act-source", sectionIndex: 0, revision: 2, content: "Pay off the ferryman's promise." });
    const explicitDueSource = insertSource(db, actWorkspace, { id: "milestone-explicit-due-source", sectionIndex: 0, revision: 3, content: "Revisit the broken oath." });
    const quietSource = insertSource(db, actWorkspace, { id: "milestone-quiet-source", sectionIndex: 0, revision: 4, content: "The old lighthouse remains unexplained." });
    insertThread(db, actWorkspace, plannedSource, { id: "thread-planned", label: "Reveal the map thief", status: "open", dueSectionId: actWorkspace.sections[0]! });
    insertThread(db, actWorkspace, actSource, { id: "thread-act-plan", label: "Pay off the ferryman's promise", status: "open", dueSectionId: actWorkspace.sections[1]! });
    insertThread(db, actWorkspace, explicitDueSource, { id: "thread-act-explicit", label: "Revisit the broken oath", status: "due", dueSectionId: null });
    insertThread(db, actWorkspace, quietSource, { id: "thread-open-quiet", label: "Explain the old lighthouse", status: "open", dueSectionId: null });

    const ordinary = detectAndPersistSlateContinuityConcerns(
      db,
      actWorkspace.userId,
      actWorkspace.projectId,
      { currentSectionId: actWorkspace.sections[0] },
    );
    assert.equal(ordinary.detected, 1);
    const atAct = detectAndPersistSlateContinuityConcerns(
      db,
      actWorkspace.userId,
      actWorkspace.projectId,
      { currentSectionId: actWorkspace.sections[1] },
    );
    assert.equal(atAct.detected, 3);
    const actDueRows = db
      .prepare(
        `SELECT summary, explanation FROM slate_continuity_concerns
          WHERE user_id = ? AND project_id = ? AND kind = 'due_thread'
          ORDER BY summary ASC`,
      )
      .all(actWorkspace.userId, actWorkspace.projectId) as Array<{
      summary: string;
      explanation: string;
    }>;
    assert.equal(actDueRows.length, 3);
    assert.ok(
      actDueRows.some((row) => /planned act milestone/i.test(row.explanation)),
    );
    assert.ok(
      actDueRows.some((row) => /at the act milestone/i.test(row.explanation)),
    );
    assert.ok(
      actDueRows.every((row) => !row.summary.includes("old lighthouse")),
    );

    const bookWorkspace = seedWorkspace(db, "milestone-book");
    const bookDueSource = insertSource(db, bookWorkspace, { id: "milestone-book-due", sectionIndex: 0, revision: 1, content: "Settle the succession before the book closes." });
    const bookOpenSource = insertSource(db, bookWorkspace, { id: "milestone-book-open", sectionIndex: 0, revision: 2, content: "A distant comet remains unexplained." });
    insertThread(db, bookWorkspace, bookDueSource, { id: "thread-book-due", label: "Settle the succession", status: "due", dueSectionId: null });
    insertThread(db, bookWorkspace, bookOpenSource, { id: "thread-book-open", label: "Explain the distant comet", status: "open", dueSectionId: null });

    const beforeBookEnd = detectAndPersistSlateContinuityConcerns(
      db,
      bookWorkspace.userId,
      bookWorkspace.projectId,
      { currentSectionId: bookWorkspace.sections[2] },
    );
    assert.equal(beforeBookEnd.detected, 0);
    const atBookEnd = detectAndPersistSlateContinuityConcerns(
      db,
      bookWorkspace.userId,
      bookWorkspace.projectId,
      { currentSectionId: bookWorkspace.sections[3] },
    );
    assert.equal(atBookEnd.detected, 1);
    const bookRows = db
      .prepare(
        `SELECT summary, explanation FROM slate_continuity_concerns
          WHERE user_id = ? AND project_id = ? AND kind = 'due_thread'`,
      )
      .all(bookWorkspace.userId, bookWorkspace.projectId) as Array<{
      summary: string;
      explanation: string;
    }>;
    assert.equal(bookRows.length, 1);
    assert.match(bookRows[0]!.explanation, /book milestone/i);
    assert.ok(!bookRows[0]!.summary.includes("distant comet"));
  });

  it("scopes every read/write by tenant and exposes a rollback-safe in-transaction hook", () => {
    const first = seedWorkspace(db, "tenant-a");
    const second = seedWorkspace(db, "tenant-b");
    const sourceA = insertSource(db, first, { id: "tenant-a-source", sectionIndex: 0, revision: 1, content: "Ari was born in 10." });
    insertEntity(db, first, sourceA, "tenant-a-ari", "character", "Ari");
    insertClaim(db, first, sourceA, { id: "tenant-a-claim", subjectId: "tenant-a-ari", predicate: "birth_date", value: "10" });

    const sourceB1 = insertSource(db, second, { id: "tenant-b-source-1", sectionIndex: 0, revision: 1, content: "Bea was born in 20." });
    const sourceB2 = insertSource(db, second, { id: "tenant-b-source-2", sectionIndex: 1, revision: 1, content: "Bea was born in 21." });
    insertEntity(db, second, sourceB1, "tenant-b-bea", "character", "Bea");
    insertClaim(db, second, sourceB1, { id: "tenant-b-claim-1", subjectId: "tenant-b-bea", predicate: "birth_date", value: "20" });
    insertClaim(db, second, sourceB2, { id: "tenant-b-claim-2", subjectId: "tenant-b-bea", predicate: "birth_date", value: "21" });

    const firstResult = detectAndPersistSlateContinuityConcerns(
      db,
      first.userId,
      first.projectId,
      { currentSectionId: first.sections[1] },
    );
    assert.equal(firstResult.detected, 0);
    assert.equal(concernRows(db, second.userId, second.projectId).length, 0);
    assert.throws(
      () =>
        detectAndPersistSlateContinuityConcerns(
          db,
          first.userId,
          second.projectId,
        ),
      /not found/i,
    );

    db.exec("BEGIN IMMEDIATE TRANSACTION");
    const staged = detectAndPersistSlateContinuityConcernsInTransaction(
      db,
      second.userId,
      second.projectId,
      { currentSectionId: second.sections[1] },
    );
    assert.equal(staged.inserted, 1);
    db.exec("ROLLBACK");
    assert.equal(concernRows(db, second.userId, second.projectId).length, 0);

    const committed = detectAndPersistSlateContinuityConcerns(
      db,
      second.userId,
      second.projectId,
      { currentSectionId: second.sections[1] },
    );
    assert.equal(committed.inserted, 1);
    assert.equal(concernRows(db, second.userId, second.projectId).length, 1);
    assert.equal(concernRows(db, first.userId, first.projectId).length, 0);
  });
});
