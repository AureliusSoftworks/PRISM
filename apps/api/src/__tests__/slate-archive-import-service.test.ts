import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { currentContinuityProducerVersions } from "@localai/shared";
import {
  createSlateProjectArchive,
  importSlateProjectArchiveAsCopy,
  previewSlateProjectArchiveImport,
} from "../slate-archive-import-service.ts";
import {
  decodeSlateArchiveZip,
  encodeSlateArchiveZip,
} from "../slate-archive-zip.ts";
import {
  createSlateSeries,
  listSlateProjectSections,
  saveSlateProjectSection,
} from "../slate-continuity.ts";
import { rollbackSlateContinuityGeneration } from "../slate-continuity-upgrades.ts";
import { createSlateProject, updateSlateProject } from "../slate.ts";
import { canonicalSlateJson } from "../slate-author-safety.ts";
import { closeTestDatabase, createTestDatabase } from "../test-support.ts";

function seedUser(db: DatabaseSync, id: string): void {
  const now = "2026-07-16T00:00:00.000Z";
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt, wrapped_user_key,
        wrapped_user_key_iv, wrapped_user_key_tag, openai_key_ciphertext,
        created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?, ?)`,
  ).run(id, `${id}@example.test`, id, `secret-for-${id}`, now, now);
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function tableCount(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return Number(row.count);
}

function seedPortableProject(db: DatabaseSync, userId: string) {
  const series = createSlateSeries(db, userId, {
    title: "The Winter Crown Cycle",
    description: "An intergenerational fantasy cycle.",
  });
  const project = createSlateProject(db, userId, {
    title: "The Snow Gate",
    titleOrigin: "spark",
    spark: "A courier returns with {the promise no one remembers}.",
    sparkWildcards: {
      v: 1,
      template: "A courier returns with {relic}.",
      resolvedPrompt: "A courier returns with {the promise no one remembers}.",
      wildcardReplacements: [{
        key: "relic",
        value: "the promise no one remembers",
        source: "model",
      }],
    },
    seriesId: series.id,
  });
  updateSlateProject(db, userId, project.id, {
    premise: "Mara must decide whether an old promise still binds her city.",
    voice: "Lyrical but precise.",
    phase: "refine",
    proseMode: "auto",
    proseProvider: "openai",
    proseModel: "gpt-5-mini",
    deliberationConfig: {
      lux: {
        provider: "openai",
        model: "gpt-5-mini",
        directive: "Protect the sincerity of Mara's return.",
      },
      umbra: {
        provider: "local",
        model: "qwen3:8b",
        directive: "Make every welcome conceal a concrete cost.",
      },
    },
    structure: [
      {
        id: "scene-arrival",
        kind: "scene",
        title: "The Arrival",
        summary: "Mara reaches the winter city.",
        direction: "Let the welcome feel almost sincere.",
        status: "planned",
        locked: false,
      },
      {
        id: "scene-promise",
        kind: "scene",
        title: "The Promise",
        summary: "The gate names what Mara owes.",
        direction: "Reveal the cost without explaining the magic.",
        status: "planned",
        locked: false,
      },
    ],
  });
  const sections = listSlateProjectSections(db, userId, project.id);
  const arrival = sections[0]!;
  const promise = sections[1]!;
  saveSlateProjectSection(db, userId, project.id, arrival.id, {
    expectedRevision: arrival.revision,
    mutationId: "arrival-draft",
    prose: "Snow moved sideways across the gate when Mara came home.",
    status: "drafted",
  });
  saveSlateProjectSection(db, userId, project.id, promise.id, {
    expectedRevision: promise.revision,
    mutationId: "promise-draft",
    prose: "The gate spoke her childhood name, and every lock opened.",
    status: "drafted",
  });
  db.prepare(
    "UPDATE slate_sections SET parent_section_id = ? WHERE id = ? AND user_id = ?",
  ).run(arrival.id, promise.id, userId);

  const source = db.prepare(
    `SELECT id, source_revision FROM slate_continuity_sources
      WHERE user_id = ? AND project_id = ? AND section_id = ?
      ORDER BY source_revision DESC LIMIT 1`,
  ).get(userId, project.id, arrival.id) as { id: string; source_revision: number };
  const now = "2026-07-16T02:00:00.000Z";
  const anchor = JSON.stringify([{
    sourceId: source.id,
    sectionId: arrival.id,
    sectionRevision: source.source_revision,
    start: 0,
    end: 4,
    quoteHash: hash("Snow"),
  }]);
  const versions = JSON.stringify({ framework: "0.1" });
  db.prepare(
    `INSERT INTO slate_revisions
      (id, project_id, user_id, action, scope, structure_item_id,
       selection_start, selection_end, direction, original_text, proposed_text,
       status, provider, model, created_at, resolved_at)
     VALUES ('revision-portable', ?, ?, 'rewrite', 'selection', 'scene-arrival',
             0, 4, 'Make the opening colder.', 'Snow', 'Ice', 'pending',
             'local', 'llama3.2', ?, NULL)`,
  ).run(project.id, userId, now);
  db.prepare(
    `INSERT INTO slate_versions
      (id, project_id, user_id, reason, structure_json, manuscript, created_at)
     SELECT 'version-portable', id, user_id, 'Before a substantial rewrite',
            structure_json, manuscript, ?
       FROM slate_projects WHERE id = ? AND user_id = ?`,
  ).run(now, project.id, userId);
  db.prepare(
    `INSERT INTO slate_continuity_entities
      (id, user_id, series_id, kind, canonical_name, description, locked,
       anchors_json, source_id, producer_versions_json, created_at, updated_at)
     VALUES ('entity-mara', ?, ?, 'character', 'Mara', 'A courier.', 1,
             ?, ?, ?, ?, ?),
            ('entity-gate', ?, ?, 'location', 'Snow Gate', 'A speaking gate.', 0,
             ?, ?, ?, ?, ?)`,
  ).run(
    userId, series.id, anchor, source.id, versions, now, now,
    userId, series.id, anchor, source.id, versions, now, now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_aliases
      (id, user_id, series_id, entity_id, alias, normalized_alias, source_id, created_at)
     VALUES ('alias-mara', ?, ?, 'entity-mara', 'The courier', 'the courier', ?, ?)`,
  ).run(userId, series.id, source.id, now);
  db.prepare(
    `INSERT INTO slate_continuity_claims
      (id, user_id, series_id, project_id, section_id, scope_kind,
       subject_entity_id, predicate, object_entity_id, value, epistemic_status,
       perspective_entity_id, confidence, anchors_json, source_id,
       supersedes_claim_id, producer_versions_json, created_at)
     VALUES ('claim-gate-knows', ?, ?, ?, ?, 'section', 'entity-gate', 'knows_name',
             'entity-mara', '', 'narrated_fact', NULL, 0.98, ?, ?, NULL, ?, ?)`,
  ).run(userId, series.id, project.id, arrival.id, anchor, source.id, versions, now);
  db.prepare(
    `INSERT INTO slate_continuity_events
      (id, user_id, series_id, project_id, section_id, scope_kind, title,
       description, chronology_key, participant_entity_ids_json,
       location_entity_id, anchors_json, source_id, producer_versions_json, created_at)
     VALUES ('event-arrival', ?, ?, ?, ?, 'section', 'Mara returns',
             'The gate recognizes Mara.', 'book-1:scene-1', ?, 'entity-gate',
             ?, ?, ?, ?)`,
  ).run(
    userId,
    series.id,
    project.id,
    arrival.id,
    JSON.stringify(["entity-mara", "entity-gate"]),
    anchor,
    source.id,
    versions,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_relationships
      (id, user_id, series_id, from_entity_id, to_entity_id, kind, state,
       epistemic_status, anchors_json, source_id, producer_versions_json, created_at)
     VALUES ('relationship-gate-mara', ?, ?, 'entity-gate', 'entity-mara',
             'recognizes', 'awakened', 'narrated_fact', ?, ?, ?, ?)`,
  ).run(userId, series.id, anchor, source.id, versions, now);
  db.prepare(
    `INSERT INTO slate_continuity_knowledge
      (id, user_id, series_id, character_entity_id, claim_id, learned_event_id,
       status, anchors_json, source_id, producer_versions_json, created_at)
     VALUES ('knowledge-mara-gate', ?, ?, 'entity-mara', 'claim-gate-knows',
             'event-arrival', 'known', ?, ?, ?, ?)`,
  ).run(userId, series.id, anchor, source.id, versions, now);
  db.prepare(
    `INSERT INTO slate_continuity_threads
      (id, user_id, series_id, project_id, section_id, scope_kind, label, status,
       due_section_id, anchors_json, source_id, producer_versions_json, created_at, updated_at)
     VALUES ('thread-old-promise', ?, ?, ?, ?, 'section', 'Why the gate remembers Mara',
             'open', ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId, series.id, project.id, arrival.id, promise.id, anchor, source.id, versions, now, now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_concerns
      (id, user_id, series_id, project_id, section_id, scope_kind, kind, severity,
       status, summary, explanation, claim_ids_json, anchors_json,
       recommended_resolution, resolution_json, producer_versions_json,
       created_at, resolved_at)
     VALUES ('concern-name', ?, ?, ?, ?, 'section', 'ambiguity', 'note', 'deferred',
             'The gate knows too much.', 'Decide whether this is intentional.', ?, ?,
             'preserve_ambiguity', ?, ?, ?, NULL)`,
  ).run(
    userId,
    series.id,
    project.id,
    arrival.id,
    JSON.stringify(["claim-gate-knows"]),
    anchor,
    JSON.stringify({
      version: 1,
      kind: "preserve_ambiguity",
      direction: "Keep this unexplained for now.",
      sourceId: source.id,
      revisionId: "revision-portable",
      recordedAt: now,
    }),
    versions,
    now,
  );
  return { series, project, arrival, promise, source };
}

function seedSiblingBookWithCrossBookReference(
  db: DatabaseSync,
  userId: string,
  seeded: ReturnType<typeof seedPortableProject>,
) {
  const sibling = createSlateProject(db, userId, {
    title: "The Ember Throne",
    spark: "A lost queen returns from the archive.",
    seriesId: seeded.series.id,
  });
  updateSlateProject(db, userId, sibling.id, {
    structure: [{
      id: "scene-sibling-secret",
      kind: "scene",
      title: "The Hidden Coronation",
      summary: "The lost queen claims the ember crown.",
      direction: "Keep this book private from project-only backups.",
      status: "planned",
      locked: false,
    }],
  });
  const siblingSection = listSlateProjectSections(db, userId, sibling.id)[0]!;
  saveSlateProjectSection(db, userId, sibling.id, siblingSection.id, {
    expectedRevision: siblingSection.revision,
    mutationId: "sibling-private-prose",
    prose: "SIBLING_PROSE_SECRET: Ysra hid the ember crown beneath the drowned observatory.",
    status: "drafted",
  });
  const siblingSource = db.prepare(
    `SELECT id, source_revision FROM slate_continuity_sources
      WHERE user_id = ? AND project_id = ? AND section_id = ?
      ORDER BY source_revision DESC LIMIT 1`,
  ).get(userId, sibling.id, siblingSection.id) as { id: string; source_revision: number };
  const now = "2026-07-16T02:30:00.000Z";
  const siblingAnchor = JSON.stringify([{
    sourceId: siblingSource.id,
    sectionId: siblingSection.id,
    sectionRevision: siblingSource.source_revision,
    start: 0,
    end: 20,
    quoteHash: hash("SIBLING_PROSE_SECRET"),
  }]);
  const siblingVersions = JSON.stringify({ framework: "SIBLING_PRODUCER_SECRET" });
  db.prepare(
    `INSERT INTO slate_continuity_entities
      (id, user_id, series_id, kind, canonical_name, description, locked,
       anchors_json, source_id, producer_versions_json, created_at, updated_at)
     VALUES ('entity-sibling-ysra', ?, ?, 'character', 'Ysra',
             'SIBLING_DERIVED_ENTITY_SECRET', 1, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    seeded.series.id,
    siblingAnchor,
    siblingSource.id,
    siblingVersions,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_aliases
      (id, user_id, series_id, entity_id, alias, normalized_alias, source_id, created_at)
     VALUES ('alias-sibling-secret', ?, ?, 'entity-sibling-ysra',
             'SIBLING_ALIAS_SECRET', 'sibling alias secret', ?, ?)`,
  ).run(userId, seeded.series.id, siblingSource.id, now);
  db.prepare(
    `INSERT INTO slate_continuity_claims
      (id, user_id, series_id, project_id, section_id, scope_kind,
       subject_entity_id, predicate, object_entity_id, value, epistemic_status,
       perspective_entity_id, confidence, anchors_json, source_id,
       supersedes_claim_id, producer_versions_json, created_at)
     VALUES ('claim-sibling-secret', ?, ?, ?, ?, 'section', 'entity-sibling-ysra',
             'hid', NULL, 'SIBLING_CLAIM_SECRET', 'narrated_fact', NULL, 0.99,
             ?, ?, NULL, ?, ?)`,
  ).run(
    userId,
    seeded.series.id,
    sibling.id,
    siblingSection.id,
    siblingAnchor,
    siblingSource.id,
    siblingVersions,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_events
      (id, user_id, series_id, project_id, section_id, scope_kind, title,
       description, chronology_key, participant_entity_ids_json,
       location_entity_id, anchors_json, source_id, producer_versions_json, created_at)
     VALUES ('event-sibling-secret', ?, ?, ?, ?, 'section', 'SIBLING_EVENT_SECRET',
             'A private event from the sibling book.', 'book-2:secret', ?, NULL,
             ?, ?, ?, ?)`,
  ).run(
    userId,
    seeded.series.id,
    sibling.id,
    siblingSection.id,
    JSON.stringify(["entity-sibling-ysra"]),
    siblingAnchor,
    siblingSource.id,
    siblingVersions,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_relationships
      (id, user_id, series_id, from_entity_id, to_entity_id, kind, state,
       epistemic_status, anchors_json, source_id, producer_versions_json, created_at)
     VALUES ('relationship-sibling-secret', ?, ?, 'entity-sibling-ysra', 'entity-mara',
             'precedes', 'SIBLING_RELATIONSHIP_SECRET', 'narrated_fact', ?, ?, ?, ?)`,
  ).run(userId, seeded.series.id, siblingAnchor, siblingSource.id, siblingVersions, now);
  db.prepare(
    `INSERT INTO slate_continuity_knowledge
      (id, user_id, series_id, character_entity_id, claim_id, learned_event_id,
       status, anchors_json, source_id, producer_versions_json, created_at)
     VALUES ('knowledge-sibling-secret', ?, ?, 'entity-sibling-ysra',
             'claim-sibling-secret', 'event-sibling-secret', 'SIBLING_KNOWLEDGE_SECRET',
             ?, ?, ?, ?)`,
  ).run(userId, seeded.series.id, siblingAnchor, siblingSource.id, siblingVersions, now);
  db.prepare(
    `INSERT INTO slate_continuity_threads
      (id, user_id, series_id, project_id, section_id, scope_kind, label, status,
       due_section_id, anchors_json, source_id, producer_versions_json, created_at, updated_at)
     VALUES ('thread-sibling-secret', ?, ?, ?, ?, 'section', 'SIBLING_THREAD_SECRET',
             'open', NULL, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    seeded.series.id,
    sibling.id,
    siblingSection.id,
    siblingAnchor,
    siblingSource.id,
    siblingVersions,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_concerns
      (id, user_id, series_id, project_id, section_id, scope_kind, kind, severity,
       status, summary, explanation, claim_ids_json, anchors_json,
       recommended_resolution, resolution_json, producer_versions_json,
       created_at, resolved_at)
     VALUES ('concern-sibling-secret', ?, ?, ?, ?, 'section', 'conflict', 'important',
             'open', 'SIBLING_CONCERN_SECRET', 'Private sibling-book concern.', ?, ?,
             NULL, NULL, ?, ?, NULL)`,
  ).run(
    userId,
    seeded.series.id,
    sibling.id,
    siblingSection.id,
    JSON.stringify(["claim-sibling-secret"]),
    siblingAnchor,
    siblingVersions,
    now,
  );

  const currentAnchor = JSON.stringify([{
    sourceId: seeded.source.id,
    sectionId: seeded.arrival.id,
    sectionRevision: seeded.source.source_revision,
    start: 0,
    end: 4,
    quoteHash: hash("Snow"),
  }]);
  db.prepare(
    `INSERT INTO slate_continuity_claims
      (id, user_id, series_id, project_id, section_id, scope_kind,
       subject_entity_id, predicate, object_entity_id, value, epistemic_status,
       perspective_entity_id, confidence, anchors_json, source_id,
       supersedes_claim_id, producer_versions_json, created_at)
     VALUES ('claim-project-cross-book-reference', ?, ?, ?, ?, 'section', 'entity-mara',
             'remembers', 'entity-sibling-ysra', 'The prior queen is named here.',
             'narrated_fact', NULL, 0.95, ?, ?, NULL, ?, ?)`,
  ).run(
    userId,
    seeded.series.id,
    seeded.project.id,
    seeded.arrival.id,
    currentAnchor,
    seeded.source.id,
    JSON.stringify({ framework: "project-owned" }),
    now,
  );
  return { sibling, siblingSection, siblingSource };
}

describe("Slate .slate archive import service", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "author-a");
    seedUser(db, "author-b");
  });

  afterEach(() => closeTestDatabase(db));

  it("previews without mutation and reports a tenant-scoped copy", () => {
    const seeded = seedPortableProject(db, "author-a");
    const archive = createSlateProjectArchive(
      db,
      "author-a",
      seeded.project.id,
      new Date("2026-07-16T03:00:00.000Z"),
    );
    const beforeProjects = tableCount(db, "slate_projects");
    const beforeSeries = tableCount(db, "slate_series");

    const ownerPreview = previewSlateProjectArchiveImport(db, "author-a", archive.payload);
    const otherPreview = previewSlateProjectArchiveImport(db, "author-b", archive.payload);

    assert.equal(ownerPreview.title, "The Snow Gate");
    assert.equal(ownerPreview.seriesTitle, "The Winter Crown Cycle");
    assert.equal(ownerPreview.willCreateCopy, true);
    assert.equal(ownerPreview.sourceProjectExistsForCurrentUser, true);
    assert.equal(otherPreview.sourceProjectExistsForCurrentUser, false);
    assert.equal(ownerPreview.counts.sections, 2);
    assert.equal(ownerPreview.counts.continuityConcerns, 1);
    assert.equal(tableCount(db, "slate_projects"), beforeProjects);
    assert.equal(tableCount(db, "slate_series"), beforeSeries);
    assert.equal(archive.filename, "the-snow-gate.slate");
    assert.equal(archive.mediaType, "application/vnd.prism.slate+zip");
    assert.equal(Buffer.from(archive.payload).includes(Buffer.from("secret-for-author-a")), false);
    assert.throws(
      () => createSlateProjectArchive(db, "author-b", seeded.project.id),
      /not found/i,
    );
  });

  it("imports every authoritative layer as a new project with remapped links", () => {
    const seeded = seedPortableProject(db, "author-a");
    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);
    const excludedBefore = {
      jobs: tableCount(db, "slate_continuity_jobs"),
      indexes: tableCount(db, "slate_continuity_source_indexes"),
      exports: tableCount(db, "slate_manuscript_exports"),
      returns: tableCount(db, "slate_return_sessions"),
    };

    const imported = importSlateProjectArchiveAsCopy(db, "author-a", archive.payload, {
      now: new Date("2026-07-16T04:00:00.000Z"),
    });

    assert.notEqual(imported.projectId, seeded.project.id);
    assert.notEqual(imported.seriesId, seeded.series.id);
    assert.equal(imported.title, "The Snow Gate (Recovered copy)");
    assert.equal(imported.seriesTitle, "The Winter Crown Cycle (Imported)");
    const project = db.prepare(
      "SELECT * FROM slate_projects WHERE id = ? AND user_id = ?",
    ).get(imported.projectId, "author-a") as Record<string, unknown>;
    assert.equal(project.title, imported.title);
    assert.equal(project.title_origin, "spark");
    assert.equal(project.premise, "Mara must decide whether an old promise still binds her city.");
    assert.equal(project.prose_mode, "auto");
    assert.equal(project.prose_provider, "openai");
    assert.equal(project.prose_model, "gpt-5-mini");
    assert.deepEqual(JSON.parse(String(project.deliberation_config_json)), {
      lux: {
        provider: "openai",
        model: "gpt-5-mini",
        directive: "Protect the sincerity of Mara's return.",
      },
      umbra: {
        provider: "local",
        model: "qwen3:8b",
        directive: "Make every welcome conceal a concrete cost.",
      },
    });
    assert.equal(project.manuscript,
      "The Arrival\n\nSnow moved sideways across the gate when Mara came home.\n\n\n" +
      "The Promise\n\nThe gate spoke her childhood name, and every lock opened.");
    assert.equal(tableCount(db, "slate_projects"), 2);
    assert.equal(
      Number((db.prepare("SELECT COUNT(*) AS count FROM slate_sections WHERE project_id = ? AND user_id = ?")
        .get(imported.projectId, "author-a") as { count: number }).count),
      2,
    );
    assert.equal(
      Number((db.prepare("SELECT COUNT(*) AS count FROM slate_revisions WHERE project_id = ? AND user_id = ?")
        .get(imported.projectId, "author-a") as { count: number }).count),
      1,
    );
    for (const table of [
      "slate_continuity_sources",
      "slate_continuity_entities",
      "slate_continuity_aliases",
      "slate_continuity_claims",
      "slate_continuity_events",
      "slate_continuity_relationships",
      "slate_continuity_knowledge",
      "slate_continuity_threads",
      "slate_continuity_concerns",
    ]) {
      const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE series_id = ? AND user_id = ?`)
        .get(imported.seriesId, "author-a") as { count: number };
      assert.ok(Number(count.count) > 0, `${table} was not restored`);
    }
    const importedSections = db.prepare(
      "SELECT id, parent_section_id FROM slate_sections WHERE project_id = ? ORDER BY ordinal",
    ).all(imported.projectId) as Array<{ id: string; parent_section_id: string | null }>;
    assert.equal(importedSections[1]!.parent_section_id, importedSections[0]!.id);
    assert.notEqual(importedSections[0]!.id, seeded.arrival.id);
    const importedEntity = db.prepare(
      "SELECT id, anchors_json FROM slate_continuity_entities WHERE series_id = ? AND canonical_name = 'Mara'",
    ).get(imported.seriesId) as { id: string; anchors_json: string };
    const importedAnchor = JSON.parse(importedEntity.anchors_json)[0] as {
      sourceId: string;
      sectionId: string;
    };
    assert.notEqual(importedEntity.id, "entity-mara");
    assert.equal(importedAnchor.sectionId, importedSections[0]!.id);
    assert.notEqual(importedAnchor.sourceId, seeded.source.id);
    const concern = db.prepare(
      "SELECT claim_ids_json, resolution_json FROM slate_continuity_concerns WHERE series_id = ?",
    ).get(imported.seriesId) as { claim_ids_json: string; resolution_json: string };
    assert.notEqual(JSON.parse(concern.claim_ids_json)[0], "claim-gate-knows");
    assert.notEqual(JSON.parse(concern.resolution_json).revisionId, "revision-portable");
    assert.deepEqual(excludedBefore, {
      jobs: tableCount(db, "slate_continuity_jobs"),
      indexes: tableCount(db, "slate_continuity_source_indexes"),
      exports: tableCount(db, "slate_manuscript_exports"),
      returns: tableCount(db, "slate_return_sessions"),
    });
    const state = db.prepare(
      "SELECT storage_version FROM slate_manuscript_state WHERE project_id = ? AND user_id = ?",
    ).get(imported.projectId, "author-a") as { storage_version: number };
    assert.equal(state.storage_version, 2);
    assert.equal(
      (db.prepare("SELECT title FROM slate_projects WHERE id = ? AND user_id = ?")
        .get(seeded.project.id, "author-a") as { title: string }).title,
      "The Snow Gate",
    );
  });

  it("keeps a project archive free of sibling prose and derived Continuity", () => {
    const seeded = seedPortableProject(db, "author-a");
    const sibling = seedSiblingBookWithCrossBookReference(db, "author-a", seeded);
    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);
    const bundle = decodeSlateArchiveZip(archive.payload);
    const continuity = JSON.parse(bundle.files["data/continuity.json"]!) as {
      sources: Array<Record<string, unknown>>;
      entities: Array<Record<string, unknown>>;
      aliases: Array<Record<string, unknown>>;
      claims: Array<Record<string, unknown>>;
      events: Array<Record<string, unknown>>;
      relationships: Array<Record<string, unknown>>;
      knowledge: Array<Record<string, unknown>>;
      threads: Array<Record<string, unknown>>;
      concerns: Array<Record<string, unknown>>;
    };
    const serialized = JSON.stringify(bundle);

    for (const marker of [
      "SIBLING_PROSE_SECRET",
      "SIBLING_DERIVED_ENTITY_SECRET",
      "SIBLING_PRODUCER_SECRET",
      "SIBLING_ALIAS_SECRET",
      "SIBLING_CLAIM_SECRET",
      "SIBLING_EVENT_SECRET",
      "SIBLING_RELATIONSHIP_SECRET",
      "SIBLING_KNOWLEDGE_SECRET",
      "SIBLING_THREAD_SECRET",
      "SIBLING_CONCERN_SECRET",
      sibling.sibling.id,
      sibling.siblingSection.id,
      sibling.siblingSource.id,
    ]) {
      assert.equal(serialized.includes(marker), false, `archive leaked ${marker}`);
    }
    assert.equal(
      continuity.sources.every((row) => row.project_id === seeded.project.id),
      true,
    );
    for (const collection of [
      continuity.claims,
      continuity.events,
      continuity.threads,
      continuity.concerns,
    ]) {
      assert.equal(collection.every((row) => row.project_id === seeded.project.id), true);
    }
    assert.equal(continuity.aliases.some((row) => row.id === "alias-sibling-secret"), false);
    assert.equal(continuity.claims.some((row) => row.id === "claim-sibling-secret"), false);
    assert.equal(continuity.events.some((row) => row.id === "event-sibling-secret"), false);
    assert.equal(
      continuity.relationships.some((row) => row.id === "relationship-sibling-secret"),
      false,
    );
    assert.equal(
      continuity.knowledge.some((row) => row.id === "knowledge-sibling-secret"),
      false,
    );
    const crossBookClaim = continuity.claims.find(
      (row) => row.id === "claim-project-cross-book-reference",
    );
    assert.ok(crossBookClaim);
    const referenceStub = continuity.entities.find(
      (row) => row.id === "entity-sibling-ysra",
    );
    assert.deepEqual(
      {
        name: referenceStub?.canonical_name,
        description: referenceStub?.description,
        sourceId: referenceStub?.source_id,
        anchors: referenceStub?.anchors_json,
        producerVersions: referenceStub?.producer_versions_json,
      },
      {
        name: "Ysra",
        description: "",
        sourceId: null,
        anchors: "[]",
        producerVersions: "{\"projection\":\"slate-project-reference-v1\"}",
      },
    );

    const preview = previewSlateProjectArchiveImport(db, "author-a", archive.payload);
    assert.equal(preview.counts.continuityClaims, 2);
    const imported = importSlateProjectArchiveAsCopy(db, "author-a", archive.payload);
    const restoredCrossBook = db.prepare(
      `SELECT claims.project_id, entities.canonical_name, entities.description,
              entities.source_id, entities.anchors_json
         FROM slate_continuity_claims AS claims
         JOIN slate_continuity_entities AS entities
           ON entities.id = claims.object_entity_id
        WHERE claims.user_id = ? AND claims.project_id = ?
          AND claims.predicate = 'remembers'`,
    ).get("author-a", imported.projectId) as {
      project_id: string;
      canonical_name: string;
      description: string;
      source_id: string | null;
      anchors_json: string;
    };
    assert.deepEqual({ ...restoredCrossBook }, {
      project_id: imported.projectId,
      canonical_name: "Ysra",
      description: "",
      source_id: null,
      anchors_json: "[]",
    });
    const restoredSourceLeak = db.prepare(
      `SELECT COUNT(*) AS count FROM slate_continuity_sources
        WHERE user_id = ? AND series_id = ? AND content LIKE '%SIBLING_PROSE_SECRET%'`,
    ).get("author-a", imported.seriesId) as { count: number };
    assert.equal(restoredSourceLeak.count, 0);
    assert.equal(
      (db.prepare("SELECT prose FROM slate_sections WHERE id = ? AND user_id = ?")
        .get(sibling.siblingSection.id, "author-a") as { prose: string }).prose,
      "SIBLING_PROSE_SECRET: Ysra hid the ember crown beneath the drowned observatory.",
    );
  });

  it("restores Continuity generations with remapped ids and operational rollback pointers", () => {
    const seeded = seedPortableProject(db, "author-a");
    const now = "2026-07-16T02:30:00.000Z";
    const producerVersions = JSON.stringify(currentContinuityProducerVersions());
    const continuityVersion = currentContinuityProducerVersions().continuity;
    db.prepare(
      `INSERT INTO slate_continuity_generations
        (id, user_id, project_id, generation, status, target_version,
         source_fingerprint, comparison_summary, producer_versions_json,
         created_at, completed_at)
       VALUES ('generation-previous', 'author-a', ?, 1, 'superseded', ?,
               'fingerprint-previous', 'Previous ledger.', ?, ?, ?),
              ('generation-active', 'author-a', ?, 2, 'active', ?,
               'fingerprint-active', 'Active ledger.', ?, ?, ?)`,
    ).run(
      seeded.project.id, continuityVersion, producerVersions, now, now,
      seeded.project.id, continuityVersion, producerVersions, now, now,
    );
    db.prepare(
      `UPDATE slate_projects
          SET continuity_active_version = ?, continuity_target_version = ?,
              continuity_active_generation = 2, continuity_previous_generation = 1,
              continuity_upgrade_status = 'current', continuity_last_success_at = ?
        WHERE id = ? AND user_id = 'author-a'`,
    ).run(continuityVersion, continuityVersion, now, seeded.project.id);

    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);
    const preview = previewSlateProjectArchiveImport(db, "author-a", archive.payload);
    const imported = importSlateProjectArchiveAsCopy(db, "author-a", archive.payload);

    assert.equal(preview.counts.continuityGenerations, 2);
    const importedProject = db.prepare(
      `SELECT continuity_active_generation, continuity_previous_generation
         FROM slate_projects WHERE id = ? AND user_id = 'author-a'`,
    ).get(imported.projectId) as {
      continuity_active_generation: number;
      continuity_previous_generation: number | null;
    };
    assert.equal(importedProject.continuity_active_generation, 2);
    assert.equal(importedProject.continuity_previous_generation, 1);
    const generations = db.prepare(
      `SELECT id, generation, status FROM slate_continuity_generations
        WHERE project_id = ? AND user_id = 'author-a' ORDER BY generation`,
    ).all(imported.projectId) as Array<{ id: string; generation: number; status: string }>;
    assert.deepEqual(generations.map(({ generation, status }) => ({ generation, status })), [
      { generation: 1, status: "superseded" },
      { generation: 2, status: "active" },
    ]);
    assert.notEqual(generations[0]!.id, "generation-previous");
    assert.notEqual(generations[1]!.id, "generation-active");

    const rolledBack = rollbackSlateContinuityGeneration(db, "author-a", imported.projectId);
    assert.equal(rolledBack.activeGeneration, 1);
    assert.equal(rolledBack.previousGeneration, 2);
  });

  it("retires an in-flight Continuity build when its project is restored", () => {
    const seeded = seedPortableProject(db, "author-a");
    const producerVersions = JSON.stringify(currentContinuityProducerVersions());
    const continuityVersion = currentContinuityProducerVersions().continuity;
    db.prepare(
      `INSERT INTO slate_continuity_generations
        (id, user_id, project_id, generation, status, target_version,
         source_fingerprint, comparison_summary, producer_versions_json,
         created_at, completed_at)
       VALUES ('generation-building', 'author-a', ?, 1, 'building', ?,
               'fingerprint-building', NULL, ?, '2026-07-16T02:30:00.000Z', NULL)`,
    ).run(seeded.project.id, continuityVersion, producerVersions);
    db.prepare(
      `UPDATE slate_projects
          SET continuity_target_version = ?, continuity_upgrade_status = 'building'
        WHERE id = ? AND user_id = 'author-a'`,
    ).run(continuityVersion, seeded.project.id);

    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);
    const imported = importSlateProjectArchiveAsCopy(db, "author-a", archive.payload, {
      now: new Date("2026-07-16T05:00:00.000Z"),
    });
    const project = db.prepare(
      `SELECT continuity_active_generation, continuity_previous_generation,
              continuity_upgrade_status
         FROM slate_projects WHERE id = ? AND user_id = 'author-a'`,
    ).get(imported.projectId) as {
      continuity_active_generation: number;
      continuity_previous_generation: number | null;
      continuity_upgrade_status: string;
    };
    const generation = db.prepare(
      `SELECT status, comparison_summary, completed_at
         FROM slate_continuity_generations
        WHERE project_id = ? AND user_id = 'author-a'`,
    ).get(imported.projectId) as {
      status: string;
      comparison_summary: string | null;
      completed_at: string | null;
    };
    assert.equal(project.continuity_active_generation, 0);
    assert.equal(project.continuity_previous_generation, null);
    assert.equal(project.continuity_upgrade_status, "failed");
    assert.equal(generation.status, "failed");
    assert.match(generation.comparison_summary ?? "", /safely retired/i);
    assert.equal(generation.completed_at, "2026-07-16T05:00:00.000Z");
  });

  it("restores a portable archive under the importing tenant only", () => {
    const seeded = seedPortableProject(db, "author-a");
    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);

    const imported = importSlateProjectArchiveAsCopy(db, "author-b", archive.payload);

    assert.equal(
      Number((db.prepare("SELECT COUNT(*) AS count FROM slate_projects WHERE id = ? AND user_id = 'author-b'")
        .get(imported.projectId) as { count: number }).count),
      1,
    );
    assert.equal(
      Number((db.prepare("SELECT COUNT(*) AS count FROM slate_sections WHERE project_id = ? AND user_id != 'author-b'")
        .get(imported.projectId) as { count: number }).count),
      0,
    );
    assert.equal(
      Number((db.prepare("SELECT COUNT(*) AS count FROM slate_continuity_entities WHERE series_id = ? AND user_id != 'author-b'")
        .get(imported.seriesId) as { count: number }).count),
      0,
    );
    assert.equal(
      (db.prepare("SELECT title FROM slate_projects WHERE id = ? AND user_id = 'author-a'")
        .get(seeded.project.id) as { title: string }).title,
      "The Snow Gate",
    );
  });

  it("defaults title provenance when restoring an older portable archive", () => {
    const seeded = seedPortableProject(db, "author-a");
    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);
    const bundle = decodeSlateArchiveZip(archive.payload);
    const path = "data/project.json";
    const projectData = JSON.parse(bundle.files[path]!) as {
      project: Record<string, unknown>;
    };
    delete projectData.project.title_origin;
    const content = `${JSON.stringify(projectData)}\n`;
    bundle.files[path] = content;
    const manifestFile = bundle.manifest.files.find((file) => file.path === path)!;
    manifestFile.bytes = Buffer.byteLength(content);
    manifestFile.sha256 = hash(content);
    const manuscriptData = JSON.parse(bundle.files["data/manuscript.json"]!) as Record<string, unknown>;
    const continuityData = JSON.parse(bundle.files["data/continuity.json"]!) as Record<string, unknown>;
    const { schemaVersion: _projectSchema, ...projectContent } = projectData as Record<string, unknown>;
    const { schemaVersion: _manuscriptSchema, ...manuscriptContent } = manuscriptData;
    const { schemaVersion: _continuitySchema, ...continuityContent } = continuityData;
    bundle.manifest.contentHash = hash(canonicalSlateJson({
      schemaVersion: 1,
      ...projectContent,
      ...manuscriptContent,
      continuity: continuityContent,
    }));

    const imported = importSlateProjectArchiveAsCopy(
      db,
      "author-a",
      encodeSlateArchiveZip(bundle),
    );
    const project = db
      .prepare("SELECT title_origin FROM slate_projects WHERE id = ?")
      .get(imported.projectId) as { title_origin: string };
    assert.equal(project.title_origin, "writer");
  });

  it("rolls back the entire copy if any generated id collides", () => {
    const seeded = seedPortableProject(db, "author-a");
    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);
    const beforeProjects = tableCount(db, "slate_projects");
    const beforeSeries = tableCount(db, "slate_series");
    const ids = ["new-series-before-rollback", "new-project-before-rollback", "revision-portable"];
    let fallback = 0;

    assert.throws(
      () => importSlateProjectArchiveAsCopy(db, "author-a", archive.payload, {
        idFactory: () => ids.shift() ?? `fallback-${fallback++}`,
      }),
      /UNIQUE constraint failed/i,
    );
    assert.equal(tableCount(db, "slate_projects"), beforeProjects);
    assert.equal(tableCount(db, "slate_series"), beforeSeries);
    assert.equal(
      db.prepare("SELECT 1 FROM slate_projects WHERE id = 'new-project-before-rollback'").get(),
      undefined,
    );
    assert.equal(
      db.prepare("SELECT 1 FROM slate_series WHERE id = 'new-series-before-rollback'").get(),
      undefined,
    );
  });

  it("rejects undeclared v1 payload categories instead of restoring caches or secrets", () => {
    const seeded = seedPortableProject(db, "author-a");
    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);
    const bundle = decodeSlateArchiveZip(archive.payload);
    const path = "data/provider-cache.json";
    const content = "{\"apiKey\":\"must-not-import\"}\n";
    bundle.files[path] = content;
    bundle.manifest.files.push({
      path,
      mediaType: "application/json",
      bytes: Buffer.byteLength(content),
      sha256: hash(content),
    });
    const payload = encodeSlateArchiveZip(bundle);
    const before = tableCount(db, "slate_projects");

    assert.throws(
      () => previewSlateProjectArchiveImport(db, "author-a", payload),
      /must contain only/i,
    );
    assert.throws(
      () => importSlateProjectArchiveAsCopy(db, "author-a", payload),
      /must contain only/i,
    );
    assert.equal(tableCount(db, "slate_projects"), before);
  });
});
