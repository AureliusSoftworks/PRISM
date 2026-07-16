import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { currentContinuityProducerVersions } from "@localai/shared";
import {
  createSlateSeries,
  listSlateProjectSections,
  saveSlateProjectSection,
} from "../slate-continuity.ts";
import {
  compileSlateDraftContinuityContext,
  processSlateContinuityAuxiliaryModelJob,
  processSlateContinuityJobDeterministically,
} from "../slate-continuity-processing.ts";
import {
  hashContinuityText,
} from "../slate-continuity-index.ts";
import {
  runSlateContinuityWorkerCycle,
  type SlateContinuityJob,
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

function seedUser(db: DatabaseSync, id: string): void {
  const now = "2026-07-16T00:00:00.000Z";
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, preferred_provider,
       created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', 'local', ?, ?)`,
  ).run(id, `${id}@example.test`, id, now, now);
}

function scene(id: string, title: string, summary: string) {
  return {
    id,
    kind: "scene" as const,
    title,
    summary,
    direction: "Keep the scene precise.",
    status: "planned" as const,
    locked: false,
  };
}

class AuxiliaryProvider implements LlmProvider {
  readonly name = "local" as const;
  readonly diagnosticModel = "llama3.2-test";
  calls = 0;
  readonly evidence: string;

  constructor(evidence: string) {
    this.evidence = evidence;
  }

  async generateResponse(
    messages: ProviderMessage[],
    _options?: GenerateOptions,
  ): Promise<string> {
    this.calls += 1;
    const request = JSON.parse(messages.at(-1)!.content) as {
      task: string;
      newClaims?: Array<{ id: string }>;
      existingClaims?: Array<{ claimId: string }>;
    };
    if (request.task === "extract_changed_fiction_source") {
      return JSON.stringify({
        entities: [
          {
            name: "Mara Vale",
            kind: "character",
            aliases: ["the Ash Regent"],
            description: "The returning ruler of Northwatch.",
            confidence: 0.96,
            evidenceQuotes: [this.evidence],
          },
          {
            name: "Southwatch",
            kind: "location",
            aliases: [],
            description: "A rival watch-city.",
            confidence: 0.95,
            evidenceQuotes: [this.evidence],
          },
        ],
        claims: [
          {
            subjectName: "Mara Vale",
            predicate: "rule",
            objectName: "Southwatch",
            value: "Southwatch",
            epistemicStatus: "fact",
            perspectiveName: "",
            confidence: 0.94,
            evidenceQuotes: [this.evidence],
          },
        ],
        events: [
          {
            title: "Mara rules Southwatch",
            description: "Mara's rule extends to Southwatch.",
            chronologyKey: "book-1:scene-2",
            participantNames: ["Mara Vale"],
            locationName: "Southwatch",
            epistemicStatus: "fact",
            confidence: 0.92,
            evidenceQuotes: [this.evidence],
          },
        ],
        relationships: [
          {
            fromName: "Mara Vale",
            toName: "Southwatch",
            kind: "rules",
            state: "contested",
            epistemicStatus: "fact",
            confidence: 0.9,
            evidenceQuotes: [this.evidence],
          },
        ],
        threads: [
          {
            label: "Why does Mara claim two watch-cities?",
            confidence: 0.86,
            evidenceQuotes: [this.evidence],
          },
        ],
      });
    }
    assert.equal(request.task, "reconcile_continuity_claims");
    return JSON.stringify({
      concerns: [
        {
          kind: "factual_contradiction",
          severity: "important",
          summary: "Mara appears to rule two different watch-cities.",
          explanation: "Earlier canon names Northwatch; this scene names Southwatch.",
          newClaimIds: [request.newClaims![0]!.id],
          existingClaimIds: [request.existingClaims![0]!.claimId],
          evidenceQuotes: [this.evidence],
          recommendedResolution: "update_canon",
        },
      ],
    });
  }

  async embedText(): Promise<number[]> {
    throw new Error("Continuity auxiliary processing must not request embeddings.");
  }
}

class AuxiliaryStateConflictProvider implements LlmProvider {
  readonly name = "local" as const;
  readonly diagnosticModel = "llama3.2-state-test";
  calls = 0;
  readonly evidence: string;

  constructor(evidence: string) {
    this.evidence = evidence;
  }

  async generateResponse(
    messages: ProviderMessage[],
    _options?: GenerateOptions,
  ): Promise<string> {
    this.calls += 1;
    const request = JSON.parse(messages.at(-1)!.content) as { task: string };
    assert.equal(request.task, "extract_changed_fiction_source");
    return JSON.stringify({
      entities: [
        {
          name: "Ember Door",
          kind: "object",
          aliases: [],
          description: "A door whose condition is disputed by two ledgers.",
          confidence: 0.95,
          evidenceQuotes: [this.evidence],
        },
      ],
      claims: [
        {
          subjectName: "Ember Door",
          predicate: "state",
          objectName: "",
          value: "open",
          epistemicStatus: "fact",
          perspectiveName: "",
          confidence: 0.94,
          evidenceQuotes: [this.evidence],
        },
        {
          subjectName: "Ember Door",
          predicate: "state",
          objectName: "",
          value: "sealed",
          epistemicStatus: "fact",
          perspectiveName: "",
          confidence: 0.93,
          evidenceQuotes: [this.evidence],
        },
      ],
      events: [],
      relationships: [],
      threads: [],
    });
  }

  async embedText(): Promise<number[]> {
    throw new Error("Continuity auxiliary processing must not request embeddings.");
  }
}

describe("Slate Continuity deterministic processing", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "continuity-author");
  });

  afterEach(() => closeTestDatabase(db));

  it("turns a settled edit into exact anchored canon without a model call", async () => {
    const series = createSlateSeries(db, "continuity-author", {
      title: "The Northwatch Cycle",
    });
    const project = createSlateProject(db, "continuity-author", {
      title: "The Regent",
      spark: "A ruler returns to a city that remembers her.",
      seriesId: series.id,
    });
    updateSlateProject(db, "continuity-author", project.id, {
      structure: [scene("opening", "The Return", "Mara enters Northwatch.")],
    });
    const section = listSlateProjectSections(
      db,
      "continuity-author",
      project.id,
    )[0]!;
    const prose = "Mara Vale rules Northwatch.";
    saveSlateProjectSection(
      db,
      "continuity-author",
      project.id,
      section.id,
      {
        expectedRevision: 0,
        mutationId: "settled-human-edit",
        prose,
        status: "drafted",
      },
    );
    let modelCalls = 0;
    const result = await runSlateContinuityWorkerCycle(
      db,
      {
        deterministic: processSlateContinuityJobDeterministically,
        localModel: () => {
          modelCalls += 1;
        },
      },
      {
        now: () => new Date("2099-01-01T00:00:00.000Z"),
      },
    );

    assert.deepEqual(
      {
        claimed: result.claimed,
        completed: result.completed,
        failures: result.failures,
        modelCalls,
      },
      { claimed: 1, completed: 1, failures: [], modelCalls: 0 },
    );
    const source = db
      .prepare(
        `SELECT id, content FROM slate_continuity_sources
          WHERE project_id = ? AND section_id = ? ORDER BY source_revision DESC`,
      )
      .get(project.id, section.id) as { id: string; content: string };
    const mara = db
      .prepare(
        `SELECT id, anchors_json FROM slate_continuity_entities
          WHERE user_id = ? AND series_id = ? AND canonical_name = 'Mara Vale'`,
      )
      .get("continuity-author", series.id) as {
      id: string;
      anchors_json: string;
    };
    const anchors = JSON.parse(mara.anchors_json) as Array<{
      sourceId: string;
      start: number;
      end: number;
      quoteHash: string;
    }>;
    assert.ok(anchors.length > 0);
    for (const anchor of anchors) {
      assert.equal(anchor.sourceId, source.id);
      assert.equal(
        anchor.quoteHash,
        hashContinuityText(source.content.slice(anchor.start, anchor.end)),
      );
    }
    const claim = db
      .prepare(
        `SELECT id, predicate, value, anchors_json, source_id
           FROM slate_continuity_claims
          WHERE user_id = ? AND series_id = ?`,
      )
      .get("continuity-author", series.id) as {
      id: string;
      predicate: string;
      value: string;
      anchors_json: string;
      source_id: string;
    };
    assert.equal(claim.predicate, "rule");
    assert.equal(claim.value, "Northwatch");
    assert.equal(claim.source_id, source.id);
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM slate_continuity_source_indexes WHERE source_id = ?",
          )
          .get(source.id) as { count: number }
      ).count,
      1,
    );

    const countsBeforeRetry = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM slate_continuity_entities WHERE series_id = ?) AS entities,
          (SELECT COUNT(*) FROM slate_continuity_claims WHERE series_id = ?) AS claims`,
      )
      .get(series.id, series.id) as { entities: number; claims: number };
    processSlateContinuityJobDeterministically({
      db,
      job: {
        id: "idempotency-check",
        userId: "continuity-author",
        seriesId: series.id,
        projectId: project.id,
        sectionId: section.id,
        sourceId: source.id,
        sourceRevision: 1,
        kind: "extract_source",
        attempt: 2,
        inputFingerprint: "same-source",
        availableAt: "2026-07-16T00:00:00.000Z",
        startedAt: "2026-07-16T00:00:00.000Z",
        createdAt: "2026-07-16T00:00:00.000Z",
        accountProvider: "local",
        modelLane: "local",
      },
    });
    const countsAfterRetry = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM slate_continuity_entities WHERE series_id = ?) AS entities,
          (SELECT COUNT(*) FROM slate_continuity_claims WHERE series_id = ?) AS claims`,
      )
      .get(series.id, series.id) as { entities: number; claims: number };
    assert.deepEqual({ ...countsAfterRetry }, { ...countsBeforeRetry });
  });

  it("detects deterministic conflicts during indexing without duplicates and preserves writer states on replay", async () => {
    const series = createSlateSeries(db, "continuity-author", {
      title: "The Gate Ledger",
    });
    const project = createSlateProject(db, "continuity-author", {
      title: "Three Disputed Gates",
      spark: "Three gate records disagree.",
      seriesId: series.id,
    });
    updateSlateProject(db, "continuity-author", project.id, {
      structure: [scene("ledger", "The Ledger", "Compare the gate records.")],
    });
    const section = listSlateProjectSections(
      db,
      "continuity-author",
      project.id,
    )[0]!;
    saveSlateProjectSection(
      db,
      "continuity-author",
      project.id,
      section.id,
      {
        expectedRevision: 0,
        mutationId: "three-gate-conflicts",
        prose: [
          "Amber Gate is open.",
          "Amber Gate is closed.",
          "Blue Gate is open.",
          "Blue Gate is closed.",
          "Copper Gate is open.",
          "Copper Gate is closed.",
        ].join(" "),
        status: "drafted",
      },
    );

    const cycle = await runSlateContinuityWorkerCycle(
      db,
      { deterministic: processSlateContinuityJobDeterministically },
      {
        maxJobsPerCycle: 1,
        now: () => new Date("2099-01-01T00:00:00.000Z"),
      },
    );
    assert.equal(cycle.completed, 1);
    assert.deepEqual(cycle.failures, []);
    const concerns = db
      .prepare(
        `SELECT id, status, resolved_at FROM slate_continuity_concerns
          WHERE user_id = ? AND project_id = ? AND kind = 'state_conflict'
          ORDER BY id ASC`,
      )
      .all("continuity-author", project.id) as Array<{
      id: string;
      status: string;
      resolved_at: string | null;
    }>;
    assert.equal(concerns.length, 3);
    db.prepare(
      "UPDATE slate_continuity_concerns SET status = 'intentional' WHERE id = ?",
    ).run(concerns[0]!.id);
    db.prepare(
      "UPDATE slate_continuity_concerns SET status = 'deferred' WHERE id = ?",
    ).run(concerns[1]!.id);
    db.prepare(
      `UPDATE slate_continuity_concerns
          SET status = 'resolved', resolved_at = ? WHERE id = ?`,
    ).run("2099-01-01T01:00:00.000Z", concerns[2]!.id);

    const source = db
      .prepare(
        `SELECT id, source_revision FROM slate_continuity_sources
          WHERE user_id = ? AND project_id = ? AND section_id = ?
          ORDER BY source_revision DESC LIMIT 1`,
      )
      .get("continuity-author", project.id, section.id) as {
      id: string;
      source_revision: number;
    };
    const replayJob: SlateContinuityJob = {
      id: "deterministic-concern-replay",
      userId: "continuity-author",
      seriesId: series.id,
      projectId: project.id,
      sectionId: section.id,
      sourceId: source.id,
      sourceRevision: source.source_revision,
      kind: "extract_source",
      attempt: 2,
      inputFingerprint: "same-indexed-source",
      availableAt: "2099-01-01T01:01:00.000Z",
      startedAt: "2099-01-01T01:01:00.000Z",
      createdAt: "2099-01-01T00:00:00.000Z",
      accountProvider: "local",
      modelLane: "local",
    };
    processSlateContinuityJobDeterministically({ db, job: replayJob });

    const afterReplay = db
      .prepare(
        `SELECT id, status, resolved_at FROM slate_continuity_concerns
          WHERE user_id = ? AND project_id = ? AND kind = 'state_conflict'
          ORDER BY id ASC`,
      )
      .all("continuity-author", project.id) as Array<{
      id: string;
      status: string;
      resolved_at: string | null;
    }>;
    assert.equal(afterReplay.length, 3);
    assert.deepEqual(
      afterReplay.map((concern) => [concern.id, concern.status]),
      [
        [concerns[0]!.id, "intentional"],
        [concerns[1]!.id, "deferred"],
        [concerns[2]!.id, "resolved"],
      ],
    );
    assert.equal(
      afterReplay[2]!.resolved_at,
      "2099-01-01T01:00:00.000Z",
    );
  });

  it("projects only current section canon and retires conflicts after correction or deletion", async () => {
    const series = createSlateSeries(db, "continuity-author", {
      title: "The Corrected Gate",
    });
    const project = createSlateProject(db, "continuity-author", {
      title: "The Gate Record",
      spark: "A copied ledger needs correction.",
      seriesId: series.id,
    });
    updateSlateProject(db, "continuity-author", project.id, {
      structure: [
        scene("ledger", "The Ledger", "Establish the record."),
        scene("aftermath", "The Aftermath", "Continue from settled canon."),
      ],
    });
    const sections = listSlateProjectSections(
      db,
      "continuity-author",
      project.id,
    );
    const initialProse = [
      "Amber Gate is open. Amber Gate is closed.",
      "Mara Vale rules Northwatch.",
    ].join("\n\n");
    saveSlateProjectSection(
      db,
      "continuity-author",
      project.id,
      sections[0]!.id,
      {
        expectedRevision: 0,
        mutationId: "conflicted-gate-record",
        prose: initialProse,
        status: "drafted",
      },
    );
    await runSlateContinuityWorkerCycle(
      db,
      { deterministic: processSlateContinuityJobDeterministically },
      { now: () => new Date("2099-01-01T04:00:00.000Z") },
    );
    const initialConcern = db
      .prepare(
        `SELECT id, status FROM slate_continuity_concerns
          WHERE user_id = ? AND project_id = ? AND kind = 'state_conflict'`,
      )
      .get("continuity-author", project.id) as {
      id: string;
      status: string;
    };
    assert.equal(initialConcern.status, "open");

    const correctedProse = [
      "Amber Gate is closed.",
      "Mara Vale rules Northwatch.",
    ].join("\n\n");
    saveSlateProjectSection(
      db,
      "continuity-author",
      project.id,
      sections[0]!.id,
      {
        expectedRevision: 1,
        mutationId: "corrected-gate-record",
        prose: correctedProse,
        status: "revised",
      },
    );
    await runSlateContinuityWorkerCycle(
      db,
      { deterministic: processSlateContinuityJobDeterministically },
      { now: () => new Date("2099-01-01T04:01:00.000Z") },
    );

    const retiredConcern = db
      .prepare(
        `SELECT status, resolved_at, resolution_json
           FROM slate_continuity_concerns WHERE id = ?`,
      )
      .get(initialConcern.id) as {
      status: string;
      resolved_at: string | null;
      resolution_json: string | null;
    };
    assert.equal(retiredConcern.status, "resolved");
    assert.ok(retiredConcern.resolved_at);
    assert.match(
      retiredConcern.resolution_json ?? "",
      /source_changed_or_no_longer_detected/,
    );

    const correctedContext = compileSlateDraftContinuityContext(
      db,
      "continuity-author",
      project.id,
      "aftermath",
      "Use only the settled record.",
      1_024,
    );
    assert.match(
      correctedContext.renderedBrief,
      /Amber Gate state closed \[fact\]/,
    );
    assert.doesNotMatch(correctedContext.renderedBrief, /Amber Gate is open/);
    assert.match(correctedContext.renderedBrief, /Mara Vale rule Northwatch \[fact\]/);

    saveSlateProjectSection(
      db,
      "continuity-author",
      project.id,
      sections[0]!.id,
      {
        expectedRevision: 2,
        mutationId: "delete-gate-record",
        prose: "",
        status: "planned",
      },
    );
    await runSlateContinuityWorkerCycle(
      db,
      { deterministic: processSlateContinuityJobDeterministically },
      { now: () => new Date("2099-01-01T04:02:00.000Z") },
    );
    const deletedContext = compileSlateDraftContinuityContext(
      db,
      "continuity-author",
      project.id,
      "aftermath",
      "Continue without deleted lore.",
      1_024,
    );
    assert.doesNotMatch(deletedContext.renderedBrief, /Amber Gate/);
    assert.doesNotMatch(deletedContext.renderedBrief, /Northwatch/);
  });

  it("rescans deterministic concerns inside auxiliary persistence and replay transactions", async () => {
    const series = createSlateSeries(db, "continuity-author", {
      title: "The Ember Archive",
    });
    const project = createSlateProject(db, "continuity-author", {
      title: "The Door Record",
      spark: "Two ledgers disagree about one door.",
      seriesId: series.id,
    });
    updateSlateProject(db, "continuity-author", project.id, {
      structure: [scene("door", "The Ember Door", "Read both ledgers.")],
    });
    const section = listSlateProjectSections(
      db,
      "continuity-author",
      project.id,
    )[0]!;
    const evidence =
      "By local record, the Ember Door's condition reads open in one ledger and sealed in another.";
    saveSlateProjectSection(
      db,
      "continuity-author",
      project.id,
      section.id,
      {
        expectedRevision: 0,
        mutationId: "auxiliary-door-conflict",
        prose: evidence,
        status: "drafted",
      },
    );
    const provider = new AuxiliaryStateConflictProvider(evidence);
    let replayJob: SlateContinuityJob | null = null;
    let replayInput: unknown;
    const cycle = await runSlateContinuityWorkerCycle(
      db,
      {
        deterministic: processSlateContinuityJobDeterministically,
        localModel: async ({ db: workerDb, job, modelInput }) => {
          replayJob = job;
          replayInput = modelInput;
          await processSlateContinuityAuxiliaryModelJob({
            db: workerDb,
            job,
            modelInput,
            provider,
          });
        },
      },
      {
        maxJobsPerCycle: 2,
        now: () => new Date("2099-01-01T02:00:00.000Z"),
      },
    );

    assert.equal(cycle.completed, 2);
    assert.deepEqual(cycle.failures, []);
    assert.equal(provider.calls, 1);
    const first = db
      .prepare(
        `SELECT id, status FROM slate_continuity_concerns
          WHERE user_id = ? AND project_id = ? AND kind = 'state_conflict'`,
      )
      .all("continuity-author", project.id) as Array<{
      id: string;
      status: string;
    }>;
    assert.equal(first.length, 1);
    db.prepare(
      "UPDATE slate_continuity_concerns SET status = 'deferred' WHERE id = ?",
    ).run(first[0]!.id);
    assert.ok(replayJob);
    await processSlateContinuityAuxiliaryModelJob({
      db,
      job: replayJob!,
      modelInput: replayInput,
      provider,
    });

    const afterReplay = db
      .prepare(
        `SELECT id, status FROM slate_continuity_concerns
          WHERE user_id = ? AND project_id = ? AND kind = 'state_conflict'`,
      )
      .all("continuity-author", project.id) as Array<{
      id: string;
      status: string;
    }>;
    assert.equal(afterReplay.length, 1);
    assert.equal(afterReplay[0]!.id, first[0]!.id);
    assert.equal(afterReplay[0]!.status, "deferred");
    assert.equal(provider.calls, 2);
  });

  it("assembles bounded cross-book canon, state, knowledge, and threads", async () => {
    const series = createSlateSeries(db, "continuity-author", {
      title: "The Northwatch Cycle",
    });
    const firstBook = createSlateProject(db, "continuity-author", {
      title: "The Ash Regent",
      spark: "Mara claims Northwatch.",
      seriesId: series.id,
    });
    updateSlateProject(db, "continuity-author", firstBook.id, {
      structure: [scene("claim", "The Claim", "Mara takes the city.")],
    });
    const firstSection = listSlateProjectSections(
      db,
      "continuity-author",
      firstBook.id,
    )[0]!;
    saveSlateProjectSection(
      db,
      "continuity-author",
      firstBook.id,
      firstSection.id,
      {
        expectedRevision: 0,
        mutationId: "book-one-canon",
        prose: "Mara Vale rules Northwatch.",
      },
    );
    await runSlateContinuityWorkerCycle(
      db,
      { deterministic: processSlateContinuityJobDeterministically },
      { now: () => new Date("2099-01-01T00:00:00.000Z") },
    );

    const source = db
      .prepare(
        "SELECT id FROM slate_continuity_sources WHERE project_id = ? ORDER BY source_revision DESC",
      )
      .get(firstBook.id) as { id: string };
    const entities = db
      .prepare(
        `SELECT id, canonical_name FROM slate_continuity_entities
          WHERE series_id = ?`,
      )
      .all(series.id) as Array<{ id: string; canonical_name: string }>;
    const mara = entities.find((entity) => entity.canonical_name === "Mara Vale")!;
    const northwatch = entities.find(
      (entity) => entity.canonical_name === "Northwatch",
    )!;
    const claim = db
      .prepare("SELECT id FROM slate_continuity_claims WHERE series_id = ?")
      .get(series.id) as { id: string };
    const versions = JSON.stringify(currentContinuityProducerVersions());
    const now = "2026-07-16T03:00:00.000Z";
    db.prepare(
      `INSERT INTO slate_continuity_relationships
        (id, user_id, series_id, from_entity_id, to_entity_id, kind, state,
         epistemic_status, source_id, producer_versions_json, created_at)
       VALUES ('relationship-rule', ?, ?, ?, ?, 'rules', 'contested', 'fact', ?, ?, ?)`,
    ).run(
      "continuity-author",
      series.id,
      mara.id,
      northwatch.id,
      source.id,
      versions,
      now,
    );
    db.prepare(
      `INSERT INTO slate_continuity_events
        (id, user_id, series_id, project_id, section_id, scope_kind, title,
         description, chronology_key, participant_entity_ids_json,
         location_entity_id, source_id, producer_versions_json, created_at)
       VALUES ('event-claim', ?, ?, ?, ?, 'section', 'Mara claims Northwatch',
               'The city recognizes its returning ruler.', 'book-1:scene-1', ?, ?, ?, ?, ?)`,
    ).run(
      "continuity-author",
      series.id,
      firstBook.id,
      firstSection.id,
      JSON.stringify([mara.id]),
      northwatch.id,
      source.id,
      versions,
      now,
    );
    db.prepare(
      `INSERT INTO slate_continuity_knowledge
        (id, user_id, series_id, character_entity_id, claim_id, status,
         source_id, producer_versions_json, created_at)
       VALUES ('knowledge-mara-rule', ?, ?, ?, ?, 'knows', ?, ?, ?)`,
    ).run(
      "continuity-author",
      series.id,
      mara.id,
      claim.id,
      source.id,
      versions,
      now,
    );
    db.prepare(
      `INSERT INTO slate_continuity_threads
        (id, user_id, series_id, project_id, section_id, scope_kind, label,
         status, source_id, producer_versions_json, created_at, updated_at)
       VALUES ('thread-crown', ?, ?, NULL, NULL, 'series',
               'Who forged the river crown?', 'open', ?, ?, ?, ?)`,
    ).run(
      "continuity-author",
      series.id,
      source.id,
      versions,
      now,
      now,
    );

    const secondBook = createSlateProject(db, "continuity-author", {
      title: "The River Crown",
      spark: "Years later, Mara Vale returns to Northwatch.",
      seriesId: series.id,
    });
    updateSlateProject(db, "continuity-author", secondBook.id, {
      premise: "Mara Vale returns to Northwatch as the crown resurfaces.",
      structure: [
        scene(
          "return",
          "The Second Return",
          "Mara Vale enters Northwatch and confronts the river crown.",
        ),
      ],
    });
    const secondSection = listSlateProjectSections(
      db,
      "continuity-author",
      secondBook.id,
    )[0]!;
    const context = compileSlateDraftContinuityContext(
      db,
      "continuity-author",
      secondBook.id,
      "return",
      "Preserve what the first novel established.",
      512,
    );

    assert.ok(context.tokenEstimate <= 512);
    assert.ok(context.relevantClaimIds.includes(claim.id));
    assert.ok(context.relevantEntityIds.includes(mara.id));
    assert.ok(context.relevantEventIds.includes("event-claim"));
    assert.ok(
      context.relevantRelationshipIds.includes("relationship-rule"),
    );
    assert.ok(
      context.relevantKnowledgeStateIds.includes("knowledge-mara-rule"),
    );
    assert.ok(context.dueThreadIds.includes("thread-crown"));
    assert.match(context.renderedBrief, /CHARACTER KNOWLEDGE/);
    assert.match(context.renderedBrief, /Who forged the river crown/);
    assert.equal(context.sectionId, secondSection.id);
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM slate_continuity_context_briefs
              WHERE project_id = ? AND section_id = ?`,
          )
          .get(secondBook.id, secondSection.id) as { count: number }
      ).count,
      1,
    );
  });

  it("persists LOCAL semantic lore and a source-linked concern behind the deterministic baseline", async () => {
    const series = createSlateSeries(db, "continuity-author", {
      title: "The Watch Cycle",
    });
    const project = createSlateProject(db, "continuity-author", {
      title: "The Divided Crown",
      spark: "A ruler's borders no longer agree.",
      seriesId: series.id,
    });
    updateSlateProject(db, "continuity-author", project.id, {
      structure: [
        scene("north", "Northwatch", "Establish Mara's rule."),
        scene("south", "Southwatch", "Complicate Mara's rule."),
      ],
    });
    const sections = listSlateProjectSections(
      db,
      "continuity-author",
      project.id,
    );
    saveSlateProjectSection(
      db,
      "continuity-author",
      project.id,
      sections[0]!.id,
      {
        expectedRevision: 0,
        mutationId: "northwatch-fact",
        prose: "Mara Vale rules Northwatch.",
      },
    );
    await runSlateContinuityWorkerCycle(
      db,
      { deterministic: processSlateContinuityJobDeterministically },
      {
        maxJobsPerCycle: 1,
        now: () => new Date("2099-01-01T00:00:00.000Z"),
      },
    );

    const evidence = "Mara Vale rules Southwatch now.";
    const prose = `${evidence} ${"Rain worried the old boundary stones. ".repeat(8)}`;
    saveSlateProjectSection(
      db,
      "continuity-author",
      project.id,
      sections[1]!.id,
      {
        expectedRevision: 0,
        mutationId: "southwatch-fact",
        prose,
      },
    );
    const provider = new AuxiliaryProvider(evidence);
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
        maxJobsPerCycle: 4,
        now: () => new Date("2099-01-01T00:01:00.000Z"),
      },
    );

    assert.equal(cycle.completed, 2);
    assert.deepEqual(cycle.failures, []);
    assert.equal(provider.calls, 2);
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM slate_continuity_events WHERE series_id = ?",
          )
          .get(series.id) as { count: number }
      ).count,
      1,
    );
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM slate_continuity_relationships WHERE series_id = ?",
          )
          .get(series.id) as { count: number }
      ).count,
      1,
    );
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM slate_continuity_threads WHERE series_id = ?",
          )
          .get(series.id) as { count: number }
      ).count,
      1,
    );
    const concern = db
      .prepare(
        `SELECT status, kind, claim_ids_json, anchors_json
           FROM slate_continuity_concerns WHERE series_id = ?`,
      )
      .get(series.id) as {
      status: string;
      kind: string;
      claim_ids_json: string;
      anchors_json: string;
    };
    assert.equal(concern.status, "open");
    assert.equal(concern.kind, "factual_contradiction");
    assert.equal((JSON.parse(concern.claim_ids_json) as string[]).length, 2);
    assert.equal(
      new Set(
        (JSON.parse(concern.anchors_json) as Array<{ sourceId: string }>).map(
          (anchor) => anchor.sourceId,
        ),
      ).size,
      2,
    );
    const indexed = db
      .prepare(
        `SELECT candidate_counts_json FROM slate_continuity_source_indexes
          WHERE project_id = ? AND section_id = ?
          ORDER BY source_revision DESC LIMIT 1`,
      )
      .get(project.id, sections[1]!.id) as { candidate_counts_json: string };
    const counts = JSON.parse(indexed.candidate_counts_json) as {
      auxiliaryFingerprint?: string;
      auxiliary?: { model?: string; concerns?: number };
    };
    assert.ok(counts.auxiliaryFingerprint);
    assert.equal(counts.auxiliary?.model, "llama3.2-test");
    assert.equal(counts.auxiliary?.concerns, 1);
  });
});
