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
import {
  ensureSlateSectionDocument,
  slateSectionDocumentSnapshot,
} from "../slate-section-documents.ts";
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

function replaceArchiveJson(
  bundle: ReturnType<typeof decodeSlateArchiveZip>,
  path: string,
  value: unknown,
): void {
  const content = `${JSON.stringify(value)}\n`;
  bundle.files[path] = content;
  const file = bundle.manifest.files.find((candidate) => candidate.path === path)!;
  file.bytes = Buffer.byteLength(content);
  file.sha256 = hash(content);
}

function legacyV1ArchivePayload(
  payload: Uint8Array,
  mutateProject?: (project: Record<string, unknown>) => void,
): Uint8Array {
  const bundle = decodeSlateArchiveZip(payload);
  const projectData = JSON.parse(bundle.files["data/project.json"]!) as {
    schemaVersion: number;
    series: Record<string, unknown>;
    project: Record<string, unknown>;
  };
  const manuscriptData = JSON.parse(bundle.files["data/manuscript.json"]!) as {
    schemaVersion: number;
    revisions: Array<Record<string, unknown>>;
    versions: Array<Record<string, unknown>>;
    sections: Array<Record<string, unknown>>;
    sectionVersions: Array<Record<string, unknown>>;
    documents?: unknown;
    annotations?: unknown;
    writing?: unknown;
  };
  const continuityData = JSON.parse(bundle.files["data/continuity.json"]!) as
    Record<string, unknown>;
  mutateProject?.(projectData.project);
  delete (projectData as Record<string, unknown>).studios;
  delete projectData.series.continuity_active_generation;
  delete projectData.series.continuity_previous_generation;
  projectData.schemaVersion = 1;
  manuscriptData.schemaVersion = 1;
  delete manuscriptData.documents;
  delete manuscriptData.annotations;
  delete manuscriptData.writing;
  for (const row of manuscriptData.sectionVersions) {
    delete row.document_json;
    delete row.document_hash;
    delete row.prose_hash;
  }
  continuityData.schemaVersion = 1;
  for (const [collection, rows] of Object.entries(continuityData)) {
    if (collection === "schemaVersion" || collection === "generations") continue;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        delete (row as Record<string, unknown>).generation;
      }
    }
  }
  delete continuityData.generations;
  replaceArchiveJson(bundle, "data/project.json", projectData);
  replaceArchiveJson(bundle, "data/manuscript.json", manuscriptData);
  replaceArchiveJson(bundle, "data/continuity.json", continuityData);
  const { schemaVersion: _projectSchema, ...projectContent } = projectData;
  const { schemaVersion: _manuscriptSchema, ...manuscriptContent } = manuscriptData;
  const { schemaVersion: _continuitySchema, ...continuityContent } = continuityData;
  bundle.manifest = {
    ...bundle.manifest,
    version: 1,
    contentHash: hash(canonicalSlateJson({
      schemaVersion: 1,
      ...projectContent,
      ...manuscriptContent,
      continuity: continuityContent,
    })),
  };
  return encodeSlateArchiveZip(bundle);
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
    proseMode: "online",
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
    assert.equal(ownerPreview.version, 2);
    assert.equal(ownerPreview.seriesTitle, "The Winter Crown Cycle");
    assert.equal(ownerPreview.willCreateCopy, true);
    assert.equal(ownerPreview.sourceProjectExistsForCurrentUser, true);
    assert.equal(otherPreview.sourceProjectExistsForCurrentUser, false);
    assert.equal(ownerPreview.counts.sections, 2);
    assert.equal(ownerPreview.counts.documents, 2);
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
    assert.equal(project.prose_mode, "online");
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
    assert.equal(
      Number((db.prepare(
        "SELECT COUNT(*) AS count FROM slate_section_documents WHERE project_id = ? AND user_id = ?",
      ).get(imported.projectId, "author-a") as { count: number }).count),
      2,
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

  it("round-trips rich documents, annotations, and safe Continuity review provenance", () => {
    const seeded = seedPortableProject(db, "author-a");
    const legacyDocument = ensureSlateSectionDocument(db, {
      userId: "author-a",
      projectId: seeded.project.id,
      sectionId: seeded.arrival.id,
    });
    const richDocument = structuredClone(legacyDocument.document);
    richDocument.content[0]!.content![0]!.marks = [
      { type: "italic", attrs: { source: "writer" } },
    ];
    const document = slateSectionDocumentSnapshot(
      richDocument,
      legacyDocument.sectionRevision,
    );
    db.prepare(
      `UPDATE slate_section_documents
          SET document_json = ?, document_hash = ?, prose_hash = ?
        WHERE section_id = ? AND project_id = ? AND user_id = 'author-a'`,
    ).run(
      JSON.stringify(document.document),
      document.documentHash,
      document.proseHash,
      seeded.arrival.id,
      seeded.project.id,
    );
    db.prepare(
      `UPDATE slate_sections
          SET locked = 1, locked_ranges_json = ?
        WHERE id = ? AND project_id = ? AND user_id = 'author-a'`,
    ).run(
      JSON.stringify([{ start: 0, end: 4, label: "writer-lock" }]),
      seeded.arrival.id,
      seeded.project.id,
    );
    const blockId = String(document.document.content[0]!.attrs.blockId);
    const now = "2026-07-16T02:45:00.000Z";
    const annotationAnchor = {
      sourceId: seeded.source.id,
      sectionId: seeded.arrival.id,
      sectionRevision: document.sectionRevision,
      start: 0,
      end: 4,
      startPosition: { blockId, offset: 0, affinity: "forward" },
      endPosition: { blockId, offset: 4, affinity: "backward" },
      quoteHash: hash("Snow"),
    };
    db.prepare(
      `INSERT INTO slate_section_annotations
        (id, user_id, project_id, section_id, block_id, anchor_json, kind, body,
         resolved, idempotency_key, created_at, updated_at)
       VALUES ('annotation-portable', 'author-a', ?, ?, ?, ?, 'comment',
               'Keep this cold image.', 0, 'annotation-original-key', ?, ?)`,
    ).run(
      seeded.project.id,
      seeded.arrival.id,
      blockId,
      JSON.stringify(annotationAnchor),
      now,
      now,
    );
    const proposal = "Ice moved sideways across the gate when Mara came home.";
    db.prepare(
      `INSERT INTO slate_writing_operations
        (id, user_id, project_id, section_id, parent_operation_id, kind, status,
         direction_intent_json, validated_snapshot_json, revision_fingerprint,
         continuity_generation, mirror_profile_version_id, provider, model,
         proposal_text, proposal_hash, revision_id, idempotency_key, error,
         created_at, updated_at, started_at, completed_at, resolved_at)
       VALUES ('operation-portable', 'author-a', ?, ?, NULL, 'rewrite',
               'proposed', '{}', '{}', 'fingerprint-original', 0, NULL,
               'local', 'llama3.2', ?, ?, 'revision-portable',
               'operation-original-key', NULL, ?, ?, ?, ?, NULL)`,
    ).run(
      seeded.project.id,
      seeded.arrival.id,
      proposal,
      hash(proposal),
      now,
      now,
      now,
      now,
    );
    db.prepare(
      `INSERT INTO slate_clarification_requests
        (id, user_id, project_id, section_id, operation_id, kind, status,
         prompt, choices_json, allows_custom_vibe, evidence_json,
         revision_fingerprint, continuity_generation, mirror_profile_version_id,
         created_at)
       VALUES ('clarification-portable', 'author-a', ?, ?, 'operation-portable',
               'hard_continuity_conflict', 'pending', 'Which truth survives?',
               ?, 1, '[]', 'fingerprint-original', 0, NULL, ?)`,
    ).run(
      seeded.project.id,
      seeded.arrival.id,
      JSON.stringify([
        { id: "preserve", label: "Preserve canon" },
        { id: "change", label: "Change canon" },
        { id: "ambiguity", label: "Keep ambiguous" },
      ]),
      now,
    );
    db.prepare(
      `INSERT INTO slate_continuity_developer_events
        (id, user_id, series_id, project_id, section_id, section_revision,
         sequence, stage, kind, summary, detail_json, source_ids_json,
         operation_id, clarification_id, provider, model,
         continuity_generation, created_at)
       VALUES ('developer-event-portable', 'author-a', ?, ?, ?, ?, 1,
               'clarification', 'hard_conflict_paused',
               'Paused before prose generation for a material conflict.', '{}',
               ?, 'operation-portable', 'clarification-portable', NULL, NULL,
               0, ?)`,
    ).run(
      seeded.series.id,
      seeded.project.id,
      seeded.arrival.id,
      document.sectionRevision,
      JSON.stringify([seeded.source.id]),
      now,
    );

    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);
    const preview = previewSlateProjectArchiveImport(
      db,
      "author-a",
      archive.payload,
    );
    assert.equal(preview.counts.documents, 2);
    assert.equal(preview.counts.annotations, 1);
    assert.equal(preview.counts.writingOperations, 1);
    assert.equal(preview.counts.clarifications, 1);
    assert.equal(preview.counts.developerEvents, 1);
    assert.equal(
      Buffer.from(archive.payload).includes(
        Buffer.from("operation-original-key"),
      ),
      false,
    );

    const imported = importSlateProjectArchiveAsCopy(
      db,
      "author-a",
      archive.payload,
      { now: new Date("2026-07-16T05:00:00.000Z") },
    );
    const importedDocument = db.prepare(
      `SELECT documents.document_json, documents.document_hash,
              documents.prose_hash, sections.id AS section_id,
              sections.prose, sections.revision, sections.locked,
              sections.locked_ranges_json
         FROM slate_section_documents AS documents
         JOIN slate_sections AS sections ON sections.id = documents.section_id
        WHERE documents.project_id = ? AND documents.user_id = 'author-a'
          AND sections.title = 'The Arrival'`,
    ).get(imported.projectId) as {
      document_json: string;
      document_hash: string;
      prose_hash: string;
      section_id: string;
      prose: string;
      revision: number;
      locked: number;
      locked_ranges_json: string;
    };
    assert.equal(importedDocument.document_json, JSON.stringify(document.document));
    assert.equal(importedDocument.document_hash, document.documentHash);
    assert.equal(importedDocument.prose_hash, document.proseHash);
    assert.equal(
      importedDocument.prose,
      "Snow moved sideways across the gate when Mara came home.",
    );
    assert.equal(importedDocument.revision, document.sectionRevision);
    assert.equal(importedDocument.locked, 1);
    assert.deepEqual(JSON.parse(importedDocument.locked_ranges_json), [
      { start: 0, end: 4, label: "writer-lock" },
    ]);
    const annotation = db.prepare(
      `SELECT section_id, block_id, anchor_json, idempotency_key
         FROM slate_section_annotations
        WHERE project_id = ? AND user_id = 'author-a'`,
    ).get(imported.projectId) as {
      section_id: string;
      block_id: string;
      anchor_json: string;
      idempotency_key: string;
    };
    assert.equal(annotation.section_id, importedDocument.section_id);
    assert.equal(annotation.block_id, blockId);
    assert.equal(
      JSON.parse(annotation.anchor_json).sectionId,
      importedDocument.section_id,
    );
    assert.notEqual(annotation.idempotency_key, "annotation-original-key");
    const operation = db.prepare(
      `SELECT id, status, proposal_text, idempotency_key, error
         FROM slate_writing_operations
        WHERE project_id = ? AND user_id = 'author-a'`,
    ).get(imported.projectId) as {
      id: string;
      status: string;
      proposal_text: string;
      idempotency_key: string;
      error: string;
    };
    assert.equal(operation.status, "stale");
    assert.equal(operation.proposal_text, proposal);
    assert.notEqual(operation.idempotency_key, "operation-original-key");
    assert.match(operation.error, /source project/i);
    const clarification = db.prepare(
      `SELECT status, operation_id, stale_at
         FROM slate_clarification_requests
        WHERE project_id = ? AND user_id = 'author-a'`,
    ).get(imported.projectId) as {
      status: string;
      operation_id: string;
      stale_at: string;
    };
    assert.equal(clarification.status, "stale");
    assert.equal(clarification.operation_id, operation.id);
    assert.equal(clarification.stale_at, "2026-07-16T05:00:00.000Z");
    const event = db.prepare(
      `SELECT summary, source_ids_json, operation_id
         FROM slate_continuity_developer_events
        WHERE project_id = ? AND user_id = 'author-a'`,
    ).get(imported.projectId) as {
      summary: string;
      source_ids_json: string;
      operation_id: string;
    };
    assert.match(event.summary, /material conflict/i);
    assert.equal(event.operation_id, operation.id);
    assert.notEqual(JSON.parse(event.source_ids_json)[0], seeded.source.id);
  });

  it("round-trips every Writer's Cockpit studio with copy-safe references", () => {
    const seeded = seedPortableProject(db, "author-a");
    const now = "2026-07-16T03:15:00.000Z";
    const provenance = {
      generationId: "0",
      sourceIds: [seeded.source.id],
      anchors: [{
        sourceId: seeded.source.id,
        sectionId: seeded.arrival.id,
        sectionRevision: seeded.source.source_revision,
        start: 0,
        end: 4,
        quoteHash: hash("Snow"),
      }],
      authority: "manuscript",
      provider: null,
      model: null,
      createdAt: now,
    };
    const identity = {
      value: "Mara",
      layer: "evidence",
      writerLocked: true,
      provenance,
    };
    db.prepare(
      `INSERT INTO slate_character_profiles
        (id, user_id, series_id, project_id, entity_id, generation, layer,
         profile_json, field_locks_json, provenance_json, created_at, updated_at)
       VALUES ('character-profile-portable', 'author-a', ?, NULL, 'entity-mara',
               0, 'evidence', ?, '{"identity":true}', ?, ?, ?)`,
    ).run(
      seeded.series.id,
      JSON.stringify({ identity }),
      JSON.stringify(provenance),
      now,
      now,
    );
    db.prepare(
      `INSERT INTO slate_character_arcs
        (id, user_id, series_id, project_id, character_profile_id, generation,
         intended_json, observed_json, provenance_json, created_at, updated_at)
       VALUES ('character-arc-portable', 'author-a', ?, NULL,
               'character-profile-portable', 0, ?, ?, ?, ?, ?)`,
    ).run(
      seeded.series.id,
      JSON.stringify({
        startState: "Bound by the promise",
        destinationState: "Chooses its meaning",
        writerLocked: true,
      }),
      JSON.stringify({
        startState: "Returns to the gate",
        destinationState: "Hears her childhood name",
        writerLocked: false,
      }),
      JSON.stringify(provenance),
      now,
      now,
    );
    db.prepare(
      `INSERT INTO slate_character_arc_beats
        (id, user_id, series_id, project_id, character_arc_id, section_id,
         generation, track, ordinal, beat_json, provenance_json,
         created_at, updated_at)
       VALUES ('arc-beat-portable', 'author-a', ?, NULL,
               'character-arc-portable', ?, 0, 'observed', 0, ?, ?, ?, ?)`,
    ).run(
      seeded.series.id,
      seeded.arrival.id,
      JSON.stringify({
        id: "arc-beat-portable",
        label: "Mara returns",
        description: "The gate recognizes her.",
        expectedSectionId: null,
        observedSectionId: seeded.arrival.id,
        manuscriptOrder: 0,
        storyTimeKey: "book-1:scene-1",
        status: "landed",
        layer: "evidence",
        provenance,
      }),
      JSON.stringify(provenance),
      now,
      now,
    );
    db.prepare(
      `INSERT INTO slate_narrative_edges
        (id, user_id, series_id, project_id, generation, from_ref_json,
         to_ref_json, kind, branch_id, story_time_json, manuscript_order_json,
         provenance_json, created_at, updated_at)
       VALUES ('narrative-edge-portable', 'author-a', ?, ?, 0, ?, ?, 'reveals',
               'main', ?, ?, ?, ?, ?)`,
    ).run(
      seeded.series.id,
      seeded.project.id,
      JSON.stringify({ kind: "section", id: seeded.arrival.id }),
      JSON.stringify({ kind: "arc_beat", id: "arc-beat-portable" }),
      JSON.stringify({ key: "book-1:scene-1" }),
      JSON.stringify({ ordinal: 0 }),
      JSON.stringify(provenance),
      now,
      now,
    );

    db.prepare(
      `INSERT INTO slate_mirror_profiles
        (id, user_id, name, pen_name, frozen, created_at, updated_at)
       VALUES ('mirror-profile-portable', 'author-a', 'Winter Voice',
               'A. Snow', 1, ?, ?)`,
    ).run(now, now);
    const voiceCard = {
      narrativeDistance: "close third",
      diction: ["precise"],
      rhythm: ["measured"],
      imagery: ["weather"],
      dialogueHabits: [],
      exposition: [],
      humor: [],
      density: ["lean"],
      preferences: ["concrete stakes"],
      avoidances: ["purple prose"],
      exemplars: ["Snow moved sideways."],
    };
    db.prepare(
      `INSERT INTO slate_mirror_profile_versions
        (id, user_id, profile_id, version, voice_card_json,
         eligibility_summary_json, created_at)
       VALUES ('mirror-version-portable', 'author-a', 'mirror-profile-portable',
               3, ?, ?, ?)`,
    ).run(
      JSON.stringify(voiceCard),
      JSON.stringify({
        parentVersionId: "mirror-version-omitted",
        sampleIds: ["private-sample-id"],
        sourceFingerprint: "voice-fingerprint",
        eligibleSampleCount: 9,
        excludedSampleCount: 2,
        publishedAt: now,
      }),
      now,
    );
    const projectOverlay = {
      id: "overlay-project",
      kind: "project",
      label: "Winter restraint",
      povCharacterId: null,
      direction: "Keep magic concrete.",
      createdAt: now,
      updatedAt: now,
    };
    const povOverlay = {
      id: "overlay-pov",
      kind: "pov",
      label: "Mara close",
      povCharacterId: "entity-mara",
      direction: "Let duty shape every observation.",
      createdAt: now,
      updatedAt: now,
    };
    db.prepare(
      `INSERT INTO slate_project_mirror_bindings
        (project_id, user_id, profile_version_id, project_overlay_json,
         pov_overlays_json, created_at, updated_at)
       VALUES (?, 'author-a', 'mirror-version-portable', ?, ?, ?, ?)`,
    ).run(
      seeded.project.id,
      JSON.stringify(projectOverlay),
      JSON.stringify([povOverlay]),
      now,
      now,
    );

    db.prepare(
      `INSERT INTO slate_source_shelf_items
        (id, user_id, project_id, title, kind, content, metadata_json,
         promoted_source_id, mirror_eligible, created_at, updated_at)
       VALUES ('source-shelf-portable', 'author-a', ?, 'Gate research',
               'research', 'Historical notes about winter gates.',
               '{"origin":"writer notes"}', ?, 0, ?, ?)`,
    ).run(seeded.project.id, seeded.source.id, now, now);
    db.prepare(
      `INSERT INTO images
        (id, user_id, prompt, url, provider, model, created_at)
       VALUES ('image-portable', 'author-a', 'A gate in sideways snow',
               'https://example.test/private-image.png', 'openai',
               'gpt-image-2', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO slate_visual_references
        (id, user_id, project_id, section_id, entity_id, kind, status,
         image_id, prompt, reference_state_json, visual_style_version,
         provider, model, created_at, pinned_at)
       VALUES ('visual-portable', 'author-a', ?, ?, 'entity-mara',
               'scene_keyframe', 'pinned', 'image-portable',
               'Mara before the speaking gate.', ?, 'winter-v1',
               'openai', 'gpt-image-2', ?, ?)`,
    ).run(
      seeded.project.id,
      seeded.arrival.id,
      JSON.stringify({
        continuityGeneration: 0,
        visualStyleVersionId: "winter-v1",
        passageAnchor: provenance.anchors[0],
        entityStates: [{
          entityId: "entity-mara",
          label: "Mara",
          state: "snow-covered",
        }],
        referenceAssetIds: [],
      }),
      now,
      now,
    );

    const artifact = {
      version: 1,
      appletId: "slate",
      subjectId: seeded.arrival.id,
      subjectTitle: "The Snow Gate · The Arrival",
      perspective: "reader",
      perspectiveLabel: "Invited fiction reader",
      context: {
        projectId: seeded.project.id,
        sectionRevision: 1,
        continuityVersion: "0.0",
        continuityGeneration: 0,
      },
      evidence: [{
        id: `section:${seeded.arrival.id}:revision:1`,
        channel: "text",
        label: "The Arrival",
        content: "Snow moved sideways across the gate when Mara came home.",
      }],
      createdAt: now,
    };
    const reviewerSnapshot = {
      version: 1,
      reviewerId: "guest:reader",
      reviewerName: "First Reader",
      systemPrompt: "Read for emotional clarity.",
    };
    const reviewResult = {
      version: 1,
      artifactHash: "artifact-hash",
      reviewerSnapshotHash: "reviewer-hash",
      reviewerSnapshot,
      rubricId: "slate-fiction-reader",
      rubricVersion: 1,
      provider: "local",
      model: "qwen",
      createdAt: now,
      output: {
        verdict: "promising",
        headline: "The gate has pressure.",
      },
    };
    const roomNote = {
      verdict: "promising",
      headline: "Keep the gate unexplained.",
      consensus: "The opening works.",
      tensions: [],
      nextMove: "Let Mara choose.",
    };
    db.prepare(
      `INSERT INTO slate_review_circle_sessions
        (id, user_id, project_id, section_id, artifact_json,
         section_revisions_json, continuity_version, continuity_generation,
         provider, model, created_at)
       VALUES ('review-session-portable', 'author-a', ?, ?, ?, ?, '0.0', 0,
               'local', 'qwen', ?)`,
    ).run(
      seeded.project.id,
      seeded.arrival.id,
      JSON.stringify(artifact),
      JSON.stringify({ [seeded.arrival.id]: 1 }),
      now,
    );
    db.prepare(
      `INSERT INTO slate_review_circle_results
        (id, session_id, user_id, ordinal, reviewer_id,
         reviewer_snapshot_json, result_json, created_at)
       VALUES ('review-result-portable', 'review-session-portable', 'author-a',
               0, 'guest:reader', ?, ?, ?)`,
    ).run(JSON.stringify(reviewerSnapshot), JSON.stringify(reviewResult), now);
    db.prepare(
      `INSERT INTO slate_review_circle_room_notes
        (session_id, user_id, room_note_json, created_at)
       VALUES ('review-session-portable', 'author-a', ?, ?)`,
    ).run(JSON.stringify(roomNote), now);

    const momentumState = {
      liveWire: {
        kind: "urgent_thread",
        label: "The gate remembers",
        summary: "Mara must decide what the promise means.",
        entityId: "entity-mara",
        threadId: "thread-old-promise",
        sourceIds: [seeded.source.id],
        anchors: provenance.anchors,
      },
      litMatch: {
        intention: "Ask the gate what it wants.",
        unfinishedPressure: "Every lock is open.",
        sourceSectionId: seeded.arrival.id,
        capturedAt: now,
      },
    };
    db.prepare(
      `INSERT INTO slate_momentum_snapshots
        (id, user_id, project_id, section_id, kind, state_json,
         source_fingerprint, created_at)
       VALUES ('momentum-portable', 'author-a', ?, ?, 'urgent_thread', ?,
               'momentum-fingerprint', ?)`,
    ).run(
      seeded.project.id,
      seeded.arrival.id,
      JSON.stringify(momentumState),
      now,
    );

    const archive = createSlateProjectArchive(db, "author-a", seeded.project.id);
    assert.equal(
      Buffer.from(archive.payload).includes(Buffer.from("private-sample-id")),
      false,
    );
    assert.equal(
      Buffer.from(archive.payload).includes(
        Buffer.from("https://example.test/private-image.png"),
      ),
      false,
    );
    const preview = previewSlateProjectArchiveImport(
      db,
      "author-b",
      archive.payload,
    );
    assert.deepEqual(
      {
        profiles: preview.counts.characterProfiles,
        arcs: preview.counts.characterArcs,
        beats: preview.counts.characterArcBeats,
        edges: preview.counts.narrativeEdges,
        mirrorProfiles: preview.counts.mirrorProfiles,
        mirrorVersions: preview.counts.mirrorVersions,
        binding: preview.counts.mirrorBindings,
        sources: preview.counts.sourceShelfItems,
        visuals: preview.counts.visualReferences,
        rooms: preview.counts.reviewCircleSessions,
        reviews: preview.counts.reviewCircleResults,
        notes: preview.counts.reviewCircleRoomNotes,
        momentum: preview.counts.momentumSnapshots,
      },
      {
        profiles: 1,
        arcs: 1,
        beats: 1,
        edges: 1,
        mirrorProfiles: 1,
        mirrorVersions: 1,
        binding: 1,
        sources: 1,
        visuals: 1,
        rooms: 1,
        reviews: 1,
        notes: 1,
        momentum: 1,
      },
    );

    const imported = importSlateProjectArchiveAsCopy(
      db,
      "author-b",
      archive.payload,
      { now: new Date("2026-07-16T06:00:00.000Z") },
    );
    const importedProfile = db.prepare(
      `SELECT id, user_id, series_id, entity_id, profile_json
         FROM slate_character_profiles
        WHERE user_id = 'author-b' AND series_id = ?`,
    ).get(imported.seriesId) as {
      id: string;
      user_id: string;
      series_id: string;
      entity_id: string;
      profile_json: string;
    };
    assert.notEqual(importedProfile.id, "character-profile-portable");
    assert.notEqual(importedProfile.entity_id, "entity-mara");
    assert.equal(JSON.parse(importedProfile.profile_json).identity.value, "Mara");
    const importedArc = db.prepare(
      `SELECT id, character_profile_id FROM slate_character_arcs
        WHERE user_id = 'author-b' AND series_id = ?`,
    ).get(imported.seriesId) as { id: string; character_profile_id: string };
    assert.equal(importedArc.character_profile_id, importedProfile.id);
    const importedBeat = db.prepare(
      `SELECT id, character_arc_id, section_id, beat_json
         FROM slate_character_arc_beats
        WHERE user_id = 'author-b' AND series_id = ?`,
    ).get(imported.seriesId) as {
      id: string;
      character_arc_id: string;
      section_id: string;
      beat_json: string;
    };
    assert.equal(importedBeat.character_arc_id, importedArc.id);
    assert.equal(
      JSON.parse(importedBeat.beat_json).observedSectionId,
      importedBeat.section_id,
    );
    const importedEdge = db.prepare(
      `SELECT from_ref_json, to_ref_json FROM slate_narrative_edges
        WHERE user_id = 'author-b' AND series_id = ?`,
    ).get(imported.seriesId) as {
      from_ref_json: string;
      to_ref_json: string;
    };
    assert.equal(JSON.parse(importedEdge.to_ref_json).id, importedBeat.id);

    const importedBinding = db.prepare(
      `SELECT bindings.profile_version_id, bindings.project_overlay_json,
              bindings.pov_overlays_json, versions.profile_id,
              profiles.user_id, profiles.name
         FROM slate_project_mirror_bindings AS bindings
         JOIN slate_mirror_profile_versions AS versions
           ON versions.id = bindings.profile_version_id
         JOIN slate_mirror_profiles AS profiles
           ON profiles.id = versions.profile_id
        WHERE bindings.project_id = ? AND bindings.user_id = 'author-b'`,
    ).get(imported.projectId) as {
      profile_version_id: string;
      profile_id: string;
      project_overlay_json: string;
      pov_overlays_json: string;
      user_id: string;
      name: string;
    };
    assert.notEqual(importedBinding.profile_version_id, "mirror-version-portable");
    assert.notEqual(importedBinding.profile_id, "mirror-profile-portable");
    assert.equal(importedBinding.user_id, "author-b");
    assert.equal(importedBinding.name, "Winter Voice");
    assert.equal(
      JSON.parse(importedBinding.project_overlay_json).direction,
      projectOverlay.direction,
    );
    assert.equal(
      JSON.parse(importedBinding.pov_overlays_json)[0].povCharacterId,
      importedProfile.entity_id,
    );
    const importedSource = db.prepare(
      `SELECT title, content, promoted_source_id, mirror_eligible
         FROM slate_source_shelf_items
        WHERE user_id = 'author-b' AND project_id = ?`,
    ).get(imported.projectId) as {
      title: string;
      content: string;
      promoted_source_id: string;
      mirror_eligible: number;
    };
    assert.equal(importedSource.title, "Gate research");
    assert.equal(importedSource.content, "Historical notes about winter gates.");
    assert.notEqual(importedSource.promoted_source_id, seeded.source.id);
    assert.equal(importedSource.mirror_eligible, 0);
    const importedVisual = db.prepare(
      `SELECT section_id, entity_id, image_id, prompt, status,
              reference_state_json
         FROM slate_visual_references
        WHERE user_id = 'author-b' AND project_id = ?`,
    ).get(imported.projectId) as {
      section_id: string;
      entity_id: string;
      image_id: string | null;
      prompt: string;
      status: string;
      reference_state_json: string;
    };
    assert.equal(importedVisual.image_id, null);
    assert.equal(importedVisual.status, "pinned");
    assert.equal(importedVisual.prompt, "Mara before the speaking gate.");
    assert.equal(
      JSON.parse(importedVisual.reference_state_json).entityStates[0].entityId,
      importedProfile.entity_id,
    );
    const importedReview = db.prepare(
      `SELECT sessions.artifact_json, sessions.section_revisions_json,
              results.reviewer_snapshot_json, results.result_json,
              notes.room_note_json
         FROM slate_review_circle_sessions AS sessions
         JOIN slate_review_circle_results AS results
           ON results.session_id = sessions.id
         JOIN slate_review_circle_room_notes AS notes
           ON notes.session_id = sessions.id
        WHERE sessions.user_id = 'author-b' AND sessions.project_id = ?`,
    ).get(imported.projectId) as {
      artifact_json: string;
      section_revisions_json: string;
      reviewer_snapshot_json: string;
      result_json: string;
      room_note_json: string;
    };
    assert.equal(importedReview.artifact_json, JSON.stringify(artifact));
    assert.equal(
      importedReview.section_revisions_json,
      JSON.stringify({ [seeded.arrival.id]: 1 }),
    );
    assert.equal(
      importedReview.reviewer_snapshot_json,
      JSON.stringify(reviewerSnapshot),
    );
    assert.equal(importedReview.result_json, JSON.stringify(reviewResult));
    assert.equal(importedReview.room_note_json, JSON.stringify(roomNote));
    const importedMomentum = db.prepare(
      `SELECT section_id, state_json FROM slate_momentum_snapshots
        WHERE user_id = 'author-b' AND project_id = ?`,
    ).get(imported.projectId) as { section_id: string; state_json: string };
    const importedMomentumState = JSON.parse(importedMomentum.state_json);
    assert.equal(
      importedMomentumState.litMatch.sourceSectionId,
      importedMomentum.section_id,
    );
    assert.notEqual(
      importedMomentumState.liveWire.sourceIds[0],
      seeded.source.id,
    );
  });

  it("keeps a project archive free of sibling prose and derived Continuity", () => {
    const seeded = seedPortableProject(db, "author-a");
    const sibling = seedSiblingBookWithCrossBookReference(db, "author-a", seeded);
    db.prepare(
      `INSERT INTO slate_continuity_developer_events
        (id, user_id, series_id, project_id, section_id, section_revision,
         sequence, stage, kind, summary, detail_json, source_ids_json,
         continuity_generation, created_at)
       VALUES ('developer-event-cross-book', 'author-a', ?, ?, ?, 1, 1,
               'concern', 'cross_book_reference',
               'A project event accidentally named a sibling source.', '{}',
               ?, 0, '2026-07-16T02:45:00.000Z')`,
    ).run(
      seeded.series.id,
      seeded.project.id,
      seeded.arrival.id,
      JSON.stringify([sibling.siblingSource.id]),
    );
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
    db.prepare(
      `UPDATE slate_series
          SET continuity_active_generation = 2,
              continuity_previous_generation = 1
        WHERE id = ? AND user_id = 'author-a'`,
    ).run(seeded.series.id);
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
      db.prepare(
        `UPDATE ${table} SET generation = 2
          WHERE user_id = 'author-a' AND series_id = ?`,
      ).run(seeded.series.id);
    }
    db.prepare(
      `INSERT INTO slate_continuity_sources
        (id, user_id, series_id, project_id, section_id, scope_kind, kind,
         source_revision, content, content_hash, authority, provider, model,
         producer_versions_json, generation, supersedes_source_id, created_at)
       VALUES ('source-previous-generation', 'author-a', ?, ?, NULL, 'book',
               'import', 0, 'Previous generation source.', ?, 'human', NULL,
               NULL, ?, 1, NULL, ?)`,
    ).run(
      seeded.series.id,
      seeded.project.id,
      hash("Previous generation source."),
      producerVersions,
      now,
    );

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
    const importedSeries = db.prepare(
      `SELECT continuity_active_generation, continuity_previous_generation
         FROM slate_series WHERE id = ? AND user_id = 'author-a'`,
    ).get(imported.seriesId) as {
      continuity_active_generation: number;
      continuity_previous_generation: number | null;
    };
    assert.deepEqual({ ...importedSeries }, {
      continuity_active_generation: 2,
      continuity_previous_generation: 1,
    });
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
    for (const table of [
      "slate_continuity_entities",
      "slate_continuity_aliases",
      "slate_continuity_claims",
      "slate_continuity_events",
      "slate_continuity_relationships",
      "slate_continuity_knowledge",
      "slate_continuity_threads",
      "slate_continuity_concerns",
    ]) {
      const restored = db.prepare(
        `SELECT DISTINCT generation FROM ${table}
          WHERE user_id = 'author-a' AND series_id = ? ORDER BY generation`,
      ).all(imported.seriesId) as Array<{ generation: number }>;
      assert.deepEqual(
        restored.map((row) => Number(row.generation)),
        [2],
        `${table} lost its active generation during archive restore`,
      );
    }
    const restoredSourceGenerations = db.prepare(
      `SELECT DISTINCT generation FROM slate_continuity_sources
        WHERE user_id = 'author-a' AND series_id = ? ORDER BY generation`,
    ).all(imported.seriesId) as Array<{ generation: number }>;
    assert.deepEqual(
      restoredSourceGenerations.map((row) => Number(row.generation)),
      [1, 2],
    );

    const rolledBack = rollbackSlateContinuityGeneration(db, "author-a", imported.projectId);
    assert.equal(rolledBack.activeGeneration, 1);
    assert.equal(rolledBack.previousGeneration, 2);
    const rolledBackSeries = db.prepare(
      `SELECT continuity_active_generation, continuity_previous_generation
         FROM slate_series WHERE id = ?`,
    ).get(imported.seriesId);
    assert.deepEqual({
      ...(rolledBackSeries as Record<string, unknown>),
    }, {
      continuity_active_generation: 1,
      continuity_previous_generation: 2,
    });

    const sibling = seedSiblingBookWithCrossBookReference(
      db,
      "author-a",
      seeded,
    );
    db.prepare(
      `UPDATE slate_projects
          SET continuity_active_version = ?, continuity_target_version = ?,
              continuity_active_generation = 2,
              continuity_previous_generation = 1
        WHERE id = ? AND user_id = 'author-a'`,
    ).run(
      continuityVersion,
      continuityVersion,
      sibling.sibling.id,
    );
    const siblingArchive = createSlateProjectArchive(
      db,
      "author-a",
      sibling.sibling.id,
    );
    const siblingPreview = previewSlateProjectArchiveImport(
      db,
      "author-a",
      siblingArchive.payload,
    );
    assert.equal(siblingPreview.counts.continuityGenerations, 2);
    const importedSibling = importSlateProjectArchiveAsCopy(
      db,
      "author-a",
      siblingArchive.payload,
    );
    const siblingGenerationState = db.prepare(
      `SELECT series.continuity_active_generation,
              series.continuity_previous_generation,
              generations.status
         FROM slate_series AS series
         JOIN slate_projects AS projects
           ON projects.series_id = series.id
          AND projects.user_id = series.user_id
         JOIN slate_continuity_generations AS generations
           ON generations.project_id = projects.id
          AND generations.user_id = projects.user_id
          AND generations.generation = series.continuity_active_generation
        WHERE projects.id = ? AND projects.user_id = 'author-a'`,
    ).get(importedSibling.projectId) as Record<string, unknown>;
    assert.deepEqual({ ...siblingGenerationState }, {
      continuity_active_generation: 2,
      continuity_previous_generation: 1,
      status: "active",
    });
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
    const payload = legacyV1ArchivePayload(
      archive.payload,
      (project) => delete project.title_origin,
    );

    const imported = importSlateProjectArchiveAsCopy(
      db,
      "author-a",
      payload,
    );
    const project = db
      .prepare("SELECT title_origin FROM slate_projects WHERE id = ?")
      .get(imported.projectId) as { title_origin: string };
    assert.equal(project.title_origin, "writer");
    assert.equal(imported.version, 1);
    const state = db.prepare(
      "SELECT storage_version FROM slate_manuscript_state WHERE project_id = ?",
    ).get(imported.projectId) as { storage_version: number };
    assert.equal(state.storage_version, 1);
    assert.equal(
      Number((db.prepare(
        "SELECT COUNT(*) AS count FROM slate_section_documents WHERE project_id = ?",
      ).get(imported.projectId) as { count: number }).count),
      0,
    );
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
