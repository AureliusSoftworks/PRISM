import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import {
  projectAcceptedSourceToCharacterStudioInTransaction,
  updateSlateCharacterIntendedArc,
  updateSlateCharacterProfileField,
} from "../slate-character-studio.ts";
import {
  createSlateSeries,
  listSlateProjectSections,
  saveSlateProjectSection,
} from "../slate-continuity.ts";
import {
  processSlateContinuityAuxiliaryModelJob,
  processSlateContinuityJobDeterministically,
} from "../slate-continuity-processing.ts";
import { projectActiveSlateStoryBible } from "../slate-story-bible-projection.ts";
import {
  runSlateContinuityWorkerCycle,
} from "../slate-continuity-worker.ts";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "../providers.ts";
import {
  createSlateProject,
  updateSlateProject,
} from "../slate.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

const USER_ID = "character-studio-author";
const NOW = "2026-07-29T20:00:00.000Z";
const OPENING_EVIDENCE =
  "Mara Vale chose the drowned bell over Northwatch's empty crown.";
const AFTERMATH_EVIDENCE =
  "Mara Vale left the bell tower and asked the rain for exile.";

function seedUser(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, preferred_provider,
       created_at, last_active_at)
     VALUES (?, 'character-studio@example.test', 'Author', 'hash', 'salt',
             'wrapped', 'iv', 'tag', 'local', ?, ?)`,
  ).run(USER_ID, NOW, NOW);
}

function scene(id: string, title: string, summary: string) {
  return {
    id,
    kind: "scene" as const,
    title,
    summary,
    direction: "Keep the choice visible.",
    status: "planned" as const,
    locked: false,
  };
}

class CharacterStudioProvider implements LlmProvider {
  readonly name = "local" as const;
  readonly diagnosticModel = "character-studio-local-test";
  calls = 0;

  async generateResponse(
    messages: ProviderMessage[],
    _options?: GenerateOptions,
  ): Promise<string> {
    this.calls += 1;
    const request = JSON.parse(messages.at(-1)!.content) as {
      task: string;
      segments?: Array<{ text: string }>;
    };
    if (request.task === "reconcile_continuity_claims") {
      return JSON.stringify({ concerns: [] });
    }
    assert.equal(request.task, "extract_changed_fiction_source");
    const text = (request.segments ?? []).map((segment) => segment.text).join("\n");
    const opening = text.includes(OPENING_EVIDENCE);
    const evidence = opening ? OPENING_EVIDENCE : AFTERMATH_EVIDENCE;
    assert.ok(text.includes(evidence));
    return JSON.stringify({
      entities: [
        {
          name: "Mara Vale",
          kind: "character",
          aliases: opening ? ["the Rain Keeper"] : [],
          description: opening
            ? "A reluctant keeper who masks duty with dry restraint."
            : "A keeper trying to turn departure into freedom.",
          confidence: 0.98,
          evidenceQuotes: [evidence],
        },
        {
          name: "Northwatch",
          kind: "location",
          aliases: [],
          description: "The drowned city below the bell tower.",
          confidence: 0.94,
          evidenceQuotes: [evidence],
        },
      ],
      claims: opening
        ? [
            {
              subjectName: "Mara Vale",
              predicate: "wants",
              objectName: "",
              value: "restore the drowned bell",
              epistemicStatus: "fact",
              perspectiveName: "",
              confidence: 0.96,
              evidenceQuotes: [evidence],
            },
            {
              subjectName: "Mara Vale",
              predicate: "current state",
              objectName: "",
              value: "refuses Northwatch's crown",
              epistemicStatus: "fact",
              perspectiveName: "",
              confidence: 0.95,
              evidenceQuotes: [evidence],
            },
          ]
        : [
            {
              subjectName: "Mara Vale",
              predicate: "wants",
              objectName: "",
              value: "seek exile",
              epistemicStatus: "fact",
              perspectiveName: "",
              confidence: 0.96,
              evidenceQuotes: [evidence],
            },
            {
              subjectName: "Mara Vale",
              predicate: "current state",
              objectName: "",
              value: "in self-imposed exile",
              epistemicStatus: "fact",
              perspectiveName: "",
              confidence: 0.95,
              evidenceQuotes: [evidence],
            },
          ],
      events: [
        {
          title: opening ? "Mara chooses the bell" : "Mara leaves the tower",
          description: opening
            ? "Mara rejects the crown and keeps the drowned bell."
            : "Mara leaves the tower and asks the rain for exile.",
          chronologyKey: opening ? "night-1" : "dawn-2",
          participantNames: ["Mara Vale"],
          locationName: "Northwatch",
          epistemicStatus: "fact",
          confidence: 0.96,
          evidenceQuotes: [evidence],
        },
      ],
      relationships: [],
      threads: [
        {
          label: opening
            ? "Will Mara restore the drowned bell?"
            : "Will exile free Mara from the bell?",
          confidence: 0.9,
          evidenceQuotes: [evidence],
        },
      ],
    });
  }

  async embedText(): Promise<number[]> {
    throw new Error("Character Studio tests must not request embeddings.");
  }
}

async function runContinuity(
  db: DatabaseSync,
  provider: CharacterStudioProvider,
): Promise<void> {
  const cycle = await runSlateContinuityWorkerCycle(
    db,
    {
      deterministic: processSlateContinuityJobDeterministically,
      localModel: ({ db: workerDb, job, modelInput }) =>
        processSlateContinuityAuxiliaryModelJob({
          db: workerDb,
          job,
          modelInput,
          provider,
        }),
    },
    {
      maxJobsPerCycle: 8,
      now: () => new Date("2099-01-01T00:00:00.000Z"),
    },
  );
  assert.deepEqual(cycle.failures, []);
  assert.ok(cycle.completed >= 2);
}

function seedProject(db: DatabaseSync) {
  const series = createSlateSeries(db, USER_ID, {
    title: "The Rain Bell",
  });
  const project = createSlateProject(db, USER_ID, {
    title: "The Bell Keeper",
    spark: "A keeper must choose between a city and its crown.",
    seriesId: series.id,
  });
  updateSlateProject(db, USER_ID, project.id, {
    structure: [
      scene("opening", "The Drowned Bell", "Mara makes the first choice."),
      scene("aftermath", "After the Ring", "Mara pays for that choice."),
    ],
  });
  return {
    series,
    project,
    sections: listSlateProjectSections(db, USER_ID, project.id),
  };
}

function acceptedProse(evidence: string): string {
  return `${evidence} ${"Rain worried the old bronze while the drowned city listened. ".repeat(8)}`;
}

describe("Slate Character Studio runtime projection", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db);
  });

  afterEach(() => closeTestDatabase(db));

  it("materializes generation-scoped profiles, observed arcs, and narrative edges from accepted prose", async () => {
    const { project, sections } = seedProject(db);
    saveSlateProjectSection(db, USER_ID, project.id, sections[0]!.id, {
      expectedRevision: 0,
      mutationId: "accepted-opening",
      prose: acceptedProse(OPENING_EVIDENCE),
      status: "drafted",
    });
    const provider = new CharacterStudioProvider();
    await runContinuity(db, provider);

    const storyBible = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: project.id,
      sectionId: sections[0]!.id,
      now: NOW,
    }).storyBible;
    const mara = storyBible.characters.find(
      (character) => character.identity.value === "Mara Vale",
    );
    assert.ok(mara);
    assert.deepEqual(mara.aliases.value, ["the Rain Keeper"]);
    assert.deepEqual(mara.wants.value, ["restore the drowned bell"]);
    assert.equal(mara.wants.layer, "evidence");
    assert.equal(mara.wants.provenance.authority, "manuscript");
    assert.equal(mara.wants.provenance.anchors[0]?.startPosition, null);
    assert.equal(mara.publicPersona.layer, "interpretations");
    assert.equal(mara.publicPersona.provenance.authority, "ai");

    const arc = storyBible.arcs.find(
      (candidate) => candidate.characterEntityId === mara.entityId,
    );
    assert.ok(arc);
    assert.equal(arc.intended.destinationState, "");
    assert.deepEqual(arc.intended.beats, []);
    assert.ok(arc.observed.beats.length >= 2);
    assert.ok(
      arc.observed.beats.some((beat) => beat.label === "Mara chooses the bell"),
    );
    assert.ok(
      arc.observed.beats.every(
        (beat) =>
          beat.layer === "evidence" &&
          beat.provenance.authority === "manuscript",
      ),
    );
    assert.ok(
      storyBible.causalEdges.some(
        (edge) =>
          edge.kind === "reveals" &&
          edge.from.kind === "event" &&
          edge.to.kind === "arc_beat",
      ),
    );
    assert.ok(
      storyBible.causalEdges.some(
        (edge) =>
          edge.kind === "reveals" &&
          edge.from.kind === "section" &&
          edge.to.kind === "claim",
      ),
    );

    const source = db
      .prepare(
        `SELECT id, generation
           FROM slate_continuity_sources
          WHERE user_id = ? AND project_id = ? AND section_id = ?
          ORDER BY source_revision DESC LIMIT 1`,
      )
      .get(USER_ID, project.id, sections[0]!.id) as {
      id: string;
      generation: number;
    };
    const before = {
      profiles: Number(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM slate_character_profiles WHERE series_id = ?",
            )
            .get(project.seriesId) as { count: number }
        ).count,
      ),
      beats: Number(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM slate_character_arc_beats WHERE series_id = ?",
            )
            .get(project.seriesId) as { count: number }
        ).count,
      ),
      edges: Number(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM slate_narrative_edges WHERE series_id = ?",
            )
            .get(project.seriesId) as { count: number }
        ).count,
      ),
    };
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    const replay = projectAcceptedSourceToCharacterStudioInTransaction(
      db,
      source.id,
      NOW,
    );
    db.exec("COMMIT");
    assert.equal(replay?.activeGeneration, source.generation);
    assert.deepEqual(
      {
        profiles: Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM slate_character_profiles WHERE series_id = ?",
              )
              .get(project.seriesId) as { count: number }
          ).count,
        ),
        beats: Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM slate_character_arc_beats WHERE series_id = ?",
              )
              .get(project.seriesId) as { count: number }
          ).count,
        ),
        edges: Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM slate_narrative_edges WHERE series_id = ?",
              )
              .get(project.seriesId) as { count: number }
          ).count,
        ),
      },
      before,
    );
  });

  it("preserves writer field locks and intended arcs while later accepted prose advances observed evidence", async () => {
    const { series, project, sections } = seedProject(db);
    saveSlateProjectSection(db, USER_ID, project.id, sections[0]!.id, {
      expectedRevision: 0,
      mutationId: "accepted-opening-for-lock",
      prose: acceptedProse(OPENING_EVIDENCE),
      status: "drafted",
    });
    const provider = new CharacterStudioProvider();
    await runContinuity(db, provider);
    const initial = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: project.id,
      sectionId: sections[0]!.id,
      now: NOW,
    }).storyBible;
    const mara = initial.characters.find(
      (character) => character.identity.value === "Mara Vale",
    );
    assert.ok(mara);
    const profileId = mara.id;

    const fieldMutation = updateSlateCharacterProfileField(db, {
      userId: USER_ID,
      projectId: project.id,
      profileId,
      field: "wants",
      value: ["restore the bell without accepting the crown"],
      writerLocked: true,
      mutationId: "writer-locks-mara-want",
      now: "2026-07-29T20:01:00.000Z",
    });
    const arcMutation = updateSlateCharacterIntendedArc(db, {
      userId: USER_ID,
      projectId: project.id,
      profileId,
      mutationId: "writer-directs-mara-arc",
      startState: "Treats duty as a sentence",
      destinationState: "Chooses stewardship without becoming queen",
      writerLocked: true,
      beats: [
        {
          label: "Name the crown's real cost",
          description: "Mara admits what ruling would take from the city.",
          expectedSectionId: sections[1]!.id,
        },
      ],
      now: "2026-07-29T20:02:00.000Z",
    });

    saveSlateProjectSection(db, USER_ID, project.id, sections[1]!.id, {
      expectedRevision: 0,
      mutationId: "accepted-aftermath",
      prose: acceptedProse(AFTERMATH_EVIDENCE),
      status: "drafted",
    });
    await runContinuity(db, provider);

    const after = projectActiveSlateStoryBible(db, {
      userId: USER_ID,
      projectId: project.id,
      sectionId: sections[1]!.id,
      now: "2026-07-29T20:03:00.000Z",
    }).storyBible;
    const lockedMara = after.characters.find(
      (character) => character.identity.value === "Mara Vale",
    );
    assert.ok(lockedMara);
    assert.deepEqual(lockedMara.wants.value, [
      "restore the bell without accepting the crown",
    ]);
    assert.equal(lockedMara.wants.writerLocked, true);
    assert.equal(lockedMara.wants.layer, "canon");
    assert.deepEqual(lockedMara.wants.provenance.sourceIds, [
      fieldMutation.sourceId,
    ]);
    assert.equal(lockedMara.currentState.value, "in self-imposed exile");

    const arc = after.arcs.find((candidate) => candidate.id === arcMutation.arcId);
    assert.ok(arc);
    assert.equal(
      arc.intended.destinationState,
      "Chooses stewardship without becoming queen",
    );
    assert.equal(arc.intended.writerLocked, true);
    assert.deepEqual(
      arc.intended.beats.map((beat) => [
        beat.label,
        beat.layer,
        beat.provenance.authority,
      ]),
      [["Name the crown's real cost", "plans", "writer"]],
    );
    assert.equal(arc.observed.destinationState, "in self-imposed exile");
    assert.ok(
      arc.observed.beats.some((beat) => beat.label === "Mara leaves the tower"),
    );
    const authoritySources = db
      .prepare(
        `SELECT id, kind, authority, generation
           FROM slate_continuity_sources
          WHERE id IN (?, ?)
          ORDER BY id ASC`,
      )
      .all(fieldMutation.sourceId, arcMutation.sourceId) as Array<{
      id: string;
      kind: string;
      authority: string;
      generation: number;
    }>;
    assert.equal(authoritySources.length, 2);
    assert.ok(
      authoritySources.every(
        (source) =>
          source.kind === "review_direction" &&
          source.authority === "human" &&
          source.generation === fieldMutation.generation,
      ),
    );

    db.prepare(
      `UPDATE slate_series
          SET continuity_active_generation = 1
        WHERE id = ? AND user_id = ?`,
    ).run(series.id, USER_ID);
    const latestAcceptedSource = db
      .prepare(
        `SELECT id
           FROM slate_continuity_sources
          WHERE user_id = ? AND project_id = ? AND section_id = ?
          ORDER BY source_revision DESC LIMIT 1`,
      )
      .get(USER_ID, project.id, sections[1]!.id) as { id: string };
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    const inactiveProjection =
      projectAcceptedSourceToCharacterStudioInTransaction(
        db,
        latestAcceptedSource.id,
        "2026-07-29T20:04:00.000Z",
      );
    db.exec("COMMIT");
    assert.equal(inactiveProjection, null);
    assert.throws(
      () =>
        updateSlateCharacterProfileField(db, {
          userId: USER_ID,
          projectId: project.id,
          profileId,
          field: "wants",
          value: ["mutate an inactive generation"],
          writerLocked: false,
          mutationId: "inactive-generation-write",
          now: "2026-07-29T20:05:00.000Z",
        }),
      /inactive Continuity generation/u,
    );
  });
});
