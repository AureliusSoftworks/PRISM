import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { projectActiveSlateStoryBible } from "../slate-story-bible-projection.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

const NOW = "2026-07-29T12:00:00.000Z";
const USER_ID = "author-a";
const SERIES_ID = "series-a";
const PROJECT_ID = "book-a";
const SECTION_ID = "scene-a";

function seedWorkspace(
  db: DatabaseSync,
  input: {
    seriesGeneration?: number;
    projectGeneration?: number;
    characters?: unknown[];
    threads?: unknown[];
  } = {},
): void {
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, 'author@example.test', 'Author', 'hash', 'salt', 'wrapped',
             'iv', 'tag', ?, ?)`,
  ).run(USER_ID, NOW, NOW);
  db.prepare(
    `INSERT INTO slate_series
      (id, user_id, title, description, continuity_active_generation,
       created_at, updated_at)
     VALUES (?, ?, 'Series', '', ?, ?, ?)`,
  ).run(
    SERIES_ID,
    USER_ID,
    input.seriesGeneration ?? 1,
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO slate_projects
      (id, user_id, series_id, title, spark, characters_json,
       unresolved_threads_json, continuity_active_generation,
       created_at, updated_at)
     VALUES (?, ?, ?, 'Book', 'A spark', ?, ?, ?, ?, ?)`,
  ).run(
    PROJECT_ID,
    USER_ID,
    SERIES_ID,
    JSON.stringify(input.characters ?? []),
    JSON.stringify(input.threads ?? []),
    input.projectGeneration ?? 1,
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO slate_sections
      (id, project_id, series_id, user_id, kind, ordinal, title, summary,
       direction, prose, status, revision, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'scene', 0, 'Opening', 'Cross the flooded square.',
             'Force Mira to choose between the bell and her brother.',
             'Accepted prose.', 'drafting', 3, 'section-hash', ?, ?)`,
  ).run(SECTION_ID, PROJECT_ID, SERIES_ID, USER_ID, NOW, NOW);
}

function sourceAnchor(sourceId: string): object {
  return {
    sourceId,
    sectionId: SECTION_ID,
    sectionRevision: 3,
    start: 0,
    end: 8,
    quoteHash: "quote-hash",
  };
}

function insertSource(
  db: DatabaseSync,
  input: {
    id: string;
    generation: number;
    kind?: string;
    revision?: number;
    authority?: string;
  },
): void {
  db.prepare(
    `INSERT INTO slate_continuity_sources
      (id, user_id, series_id, project_id, section_id, scope_kind, kind,
       source_revision, content, content_hash, authority, provider, model,
       producer_versions_json, generation, created_at)
     VALUES (?, ?, ?, ?, ?, 'section', ?, ?, 'Accepted prose.',
             ?, ?, 'local', 'test-model', '{}', ?, ?)`,
  ).run(
    input.id,
    USER_ID,
    SERIES_ID,
    PROJECT_ID,
    SECTION_ID,
    input.kind ?? "human_edit",
    input.revision ?? input.generation,
    `hash-${input.id}`,
    input.authority ?? "human",
    input.generation,
    NOW,
  );
}

function insertCharacterProfile(
  db: DatabaseSync,
  input: {
    suffix: string;
    generation: number;
    name: string;
    layer?: string;
    profile?: Record<string, unknown>;
  },
): { entityId: string; profileId: string } {
  const entityId = `character-${input.suffix}`;
  const profileId = `profile-${input.suffix}`;
  db.prepare(
    `INSERT INTO slate_continuity_entities
      (id, user_id, series_id, kind, canonical_name, description, locked,
       anchors_json, source_id, producer_versions_json, generation,
       created_at, updated_at)
     VALUES (?, ?, ?, 'character', ?, '', 0, '[]', NULL, '{}', ?, ?, ?)`,
  ).run(
    entityId,
    USER_ID,
    SERIES_ID,
    input.name,
    input.generation,
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO slate_character_profiles
      (id, user_id, series_id, project_id, entity_id, generation, layer,
       profile_json, field_locks_json, provenance_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)`,
  ).run(
    profileId,
    USER_ID,
    SERIES_ID,
    PROJECT_ID,
    entityId,
    input.generation,
    input.layer ?? "evidence",
    JSON.stringify({
      identity: input.name,
      ...(input.profile ?? {}),
    }),
    JSON.stringify({
      authority: "manuscript",
      sourceIds: [],
      anchors: [],
      createdAt: NOW,
    }),
    NOW,
    NOW,
  );
  return { entityId, profileId };
}

function insertThread(
  db: DatabaseSync,
  input: {
    id: string;
    sourceId: string;
    generation: number;
    label: string;
    status?: string;
    dueSectionId?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO slate_continuity_threads
      (id, user_id, series_id, project_id, section_id, scope_kind, label,
       status, due_section_id, anchors_json, source_id,
       producer_versions_json, generation, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'promise', ?, ?, ?, ?, ?, '{}', ?, ?, ?)`,
  ).run(
    input.id,
    USER_ID,
    SERIES_ID,
    PROJECT_ID,
    SECTION_ID,
    input.label,
    input.status ?? "open",
    input.dueSectionId ?? null,
    JSON.stringify([sourceAnchor(input.sourceId)]),
    input.sourceId,
    input.generation,
    NOW,
    NOW,
  );
}

describe("curated Slate Story Bible projection", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    closeTestDatabase(db);
  });

  it("uses the series active generation and never leaks shadow or compatibility records", () => {
    seedWorkspace(db, { seriesGeneration: 2, projectGeneration: 1 });
    insertSource(db, {
      id: "source-generation-1",
      generation: 1,
      revision: 1,
    });
    insertSource(db, {
      id: "source-generation-2",
      generation: 2,
      revision: 2,
    });
    insertCharacterProfile(db, {
      suffix: "old",
      generation: 1,
      name: "Old Mira",
    });
    const activeProfile = insertCharacterProfile(db, {
      suffix: "active",
      generation: 2,
      name: "Mira",
    });
    db.prepare(
      `UPDATE slate_character_profiles
          SET provenance_json = ?
        WHERE id = ?`,
    ).run(
      JSON.stringify({
        authority: "manuscript",
        sourceIds: ["source-generation-1", "source-generation-2"],
        anchors: [
          sourceAnchor("source-generation-1"),
          sourceAnchor("source-generation-2"),
        ],
        createdAt: NOW,
      }),
      activeProfile.profileId,
    );
    insertThread(db, {
      id: "thread-old",
      sourceId: "source-generation-1",
      generation: 1,
      label: "The discarded bell promise",
    });
    insertThread(db, {
      id: "thread-active",
      sourceId: "source-generation-2",
      generation: 2,
      label: "The bell promise",
    });

    const result = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: PROJECT_ID,
      sectionId: SECTION_ID,
      now: NOW,
    });

    assert.equal(result.activeGeneration, 2);
    assert.deepEqual(
      result.storyBible.characters.map((character) => character.identity.value),
      ["Mira"],
    );
    assert.deepEqual(
      result.storyBible.threads.map((thread) => thread.id),
      ["thread-active"],
    );
    assert.equal(result.momentum.continuityGeneration, 2);
    assert.equal(
      result.storyBible.characters[0]?.generationId,
      `${SERIES_ID}:generation:2`,
    );
    assert.deepEqual(
      result.storyBible.characters[0]?.identity.provenance.sourceIds,
      ["source-generation-2"],
    );
    assert.deepEqual(
      result.storyBible.characters[0]?.identity.provenance.anchors.map(
        (anchor) => anchor.sourceId,
      ),
      ["source-generation-2"],
    );
  });

  it("keeps intended and observed character arcs as separate synchronized tracks", () => {
    seedWorkspace(db);
    const { profileId, entityId } = insertCharacterProfile(db, {
      suffix: "mira",
      generation: 1,
      name: "Mira",
    });
    db.prepare(
      `INSERT INTO slate_character_arcs
        (id, user_id, series_id, project_id, character_profile_id, generation,
         intended_json, observed_json, provenance_json, created_at, updated_at)
       VALUES ('arc-mira', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    ).run(
      USER_ID,
      SERIES_ID,
      PROJECT_ID,
      profileId,
      JSON.stringify({
        startState: "Avoids responsibility",
        destinationState: "Chooses the city",
        writerLocked: true,
      }),
      JSON.stringify({
        startState: "Avoids responsibility",
        destinationState: "Protects only her brother",
      }),
      JSON.stringify({
        authority: "writer",
        sourceIds: ["shape:book-a"],
        anchors: [],
        createdAt: NOW,
      }),
      NOW,
      NOW,
    );
    db.prepare(
      `INSERT INTO slate_character_arc_beats
        (id, user_id, series_id, project_id, character_arc_id, section_id,
         generation, track, ordinal, beat_json, provenance_json,
         created_at, updated_at)
       VALUES
        ('beat-intended', ?, ?, ?, 'arc-mira', ?, 1, 'intended', 1, ?, ?, ?, ?),
        ('beat-observed', ?, ?, ?, 'arc-mira', ?, 1, 'observed', 1, ?, ?, ?, ?)`,
    ).run(
      USER_ID,
      SERIES_ID,
      PROJECT_ID,
      SECTION_ID,
      JSON.stringify({
        label: "Answer the bell",
        status: "planned",
        layer: "plans",
      }),
      JSON.stringify({
        authority: "writer",
        sourceIds: ["shape:book-a"],
        anchors: [],
        createdAt: NOW,
      }),
      NOW,
      NOW,
      USER_ID,
      SERIES_ID,
      PROJECT_ID,
      SECTION_ID,
      JSON.stringify({
        label: "Runs toward her brother",
        status: "landed",
        layer: "evidence",
      }),
      JSON.stringify({
        authority: "manuscript",
        sourceIds: ["source-scene"],
        anchors: [],
        createdAt: NOW,
      }),
      NOW,
      NOW,
    );

    const arc = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: PROJECT_ID,
      sectionId: SECTION_ID,
      now: NOW,
    }).storyBible.arcs[0];

    assert.ok(arc);
    assert.equal(arc.characterEntityId, entityId);
    assert.equal(arc.intended.destinationState, "Chooses the city");
    assert.equal(arc.intended.writerLocked, true);
    assert.deepEqual(
      arc.intended.beats.map((beat) => [beat.label, beat.status, beat.layer]),
      [["Answer the bell", "planned", "plans"]],
    );
    assert.equal(arc.observed.destinationState, "Protects only her brother");
    assert.deepEqual(
      arc.observed.beats.map((beat) => [beat.label, beat.status, beat.layer]),
      [["Runs toward her brother", "landed", "evidence"]],
    );
  });

  it("projects a landed thread payoff with exact evidence provenance", () => {
    seedWorkspace(db);
    insertSource(db, {
      id: "source-payoff",
      generation: 1,
      kind: "accepted_revision",
    });
    insertThread(db, {
      id: "thread-payoff",
      sourceId: "source-payoff",
      generation: 1,
      label: "Return the rain bell",
      status: "resolved",
      dueSectionId: SECTION_ID,
    });

    const thread = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: PROJECT_ID,
      sectionId: SECTION_ID,
      now: NOW,
    }).storyBible.threads[0];

    assert.ok(thread);
    assert.equal(thread.status, "landed");
    assert.equal(thread.expectedPayoffStartSectionId, SECTION_ID);
    assert.equal(thread.expectedPayoffEndSectionId, SECTION_ID);
    assert.equal(thread.resolvedSectionId, SECTION_ID);
    assert.equal(thread.layer, "evidence");
    assert.equal(thread.provenance.authority, "manuscript");
    assert.deepEqual(thread.provenance.sourceIds, ["source-payoff"]);
    assert.equal(thread.provenance.anchors[0]?.startPosition, null);
  });

  it("selects one section-contextual Live Wire and persists it idempotently", () => {
    seedWorkspace(db);
    insertSource(db, {
      id: "source-open",
      generation: 1,
      revision: 1,
    });
    insertSource(db, {
      id: "source-due",
      generation: 1,
      revision: 2,
      kind: "accepted_revision",
    });
    insertThread(db, {
      id: "thread-open",
      sourceId: "source-open",
      generation: 1,
      label: "A distant mystery",
    });
    insertThread(db, {
      id: "thread-due",
      sourceId: "source-due",
      generation: 1,
      label: "Ring the rain bell",
      status: "due",
      dueSectionId: SECTION_ID,
    });

    const first = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: PROJECT_ID,
      sectionId: SECTION_ID,
      now: NOW,
    });
    const second = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: PROJECT_ID,
      sectionId: SECTION_ID,
      now: "2026-07-29T13:00:00.000Z",
    });

    assert.equal(first.momentum.liveWire?.kind, "approaching_payoff");
    assert.equal(first.momentum.liveWire?.threadId, "thread-due");
    assert.equal(first.momentum.liveWire?.label, "Ring the rain bell");
    assert.equal(
      first.momentum.litMatch?.intention,
      "Force Mira to choose between the bell and her brother.",
    );
    assert.equal(second.momentum.id, first.momentum.id);
    assert.equal(second.momentum.createdAt, NOW);
    const extraction = first.diagnostics.find(
      (event) => event.stage === "extraction",
    );
    const momentum = first.diagnostics.find(
      (event) => event.stage === "momentum",
    );
    assert.ok(extraction);
    assert.deepEqual(extraction.sourceIds, ["source-due", "source-open"]);
    assert.match(extraction.summary, /Curated active generation 1/u);
    assert.ok(momentum);
    assert.match(
      momentum.summary,
      /expected payoff window matches the focused section/u,
    );
    assert.equal(momentum.detail.momentumSnapshotId, first.momentum.id);
    const count = db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM slate_momentum_snapshots
          WHERE user_id = ? AND project_id = ? AND section_id = ?`,
      )
      .get(USER_ID, PROJECT_ID, SECTION_ID) as { count: number };
    assert.equal(Number(count.count), 1);
  });

  it("curates causal, timeline, and world records without exposing raw rows", () => {
    seedWorkspace(db);
    insertSource(db, {
      id: "source-world",
      generation: 1,
      kind: "review_direction",
    });
    db.prepare(
      `INSERT INTO slate_continuity_entities
        (id, user_id, series_id, kind, canonical_name, description, locked,
         anchors_json, source_id, producer_versions_json, generation,
         created_at, updated_at)
       VALUES ('world-rain-rule', ?, ?, 'world_rule', 'The rain remembers',
               'Every bell stroke returns one forgotten name.', 1, ?,
               'source-world', '{}', 1, ?, ?)`,
    ).run(
      USER_ID,
      SERIES_ID,
      JSON.stringify([sourceAnchor("source-world")]),
      NOW,
      NOW,
    );
    db.prepare(
      `INSERT INTO slate_narrative_edges
        (id, user_id, series_id, project_id, generation, from_ref_json,
         to_ref_json, kind, branch_id, story_time_json,
         manuscript_order_json, provenance_json, created_at, updated_at)
       VALUES ('edge-payoff', ?, ?, ?, 1, ?, ?, 'resolves', 'flashback-bell',
               ?, ?, ?, ?, ?)`,
    ).run(
      USER_ID,
      SERIES_ID,
      PROJECT_ID,
      JSON.stringify({ kind: "section", id: SECTION_ID }),
      JSON.stringify({ kind: "thread", id: "thread-bell" }),
      JSON.stringify({ key: "night-3" }),
      JSON.stringify({ order: 4 }),
      JSON.stringify({
        layer: "canon",
        authority: "writer",
        sourceIds: ["source-world"],
        anchors: [sourceAnchor("source-world")],
        createdAt: NOW,
      }),
      NOW,
      NOW,
    );

    const storyBible = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: PROJECT_ID,
      sectionId: SECTION_ID,
      now: NOW,
    }).storyBible;

    assert.deepEqual(
      storyBible.causalEdges.map((edge) => [
        edge.kind,
        edge.branchId,
        edge.storyTimeKey,
        edge.manuscriptOrder,
      ]),
      [["resolves", "flashback-bell", "night-3", 4]],
    );
    assert.deepEqual(
      storyBible.timeline.map((branch) => [branch.id, branch.kind]),
      [
        ["flashback-bell", "flashback"],
        ["main", "main"],
      ],
    );
    assert.deepEqual(
      storyBible.world.map((entry) => [
        entry.label,
        entry.layer,
        entry.writerLocked,
      ]),
      [["The rain remembers", "canon", true]],
    );
    assert.equal(
      Object.hasOwn(storyBible.world[0] as object, "producer_versions_json"),
      false,
    );
  });

  it("uses Shape cast and threads only as writer-owned plans fallbacks", () => {
    seedWorkspace(db, {
      characters: [
        {
          id: "mira",
          name: "Mira",
          role: "Bell keeper",
          voice: "Short, rain-soaked sentences",
          locked: true,
        },
      ],
      threads: [
        {
          id: "bell",
          label: "Who cracked the rain bell?",
          resolved: false,
          locked: true,
        },
      ],
    });

    const storyBible = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: PROJECT_ID,
      sectionId: SECTION_ID,
      now: NOW,
    }).storyBible;

    assert.equal(storyBible.characters[0]?.identity.value, "Mira");
    assert.equal(storyBible.characters[0]?.identity.layer, "plans");
    assert.equal(storyBible.characters[0]?.identity.writerLocked, true);
    assert.equal(storyBible.characters[0]?.identity.provenance.authority, "writer");
    assert.equal(storyBible.threads[0]?.label, "Who cracked the rain bell?");
    assert.equal(storyBible.threads[0]?.layer, "plans");
    assert.equal(storyBible.threads[0]?.provenance.authority, "writer");
  });
});
