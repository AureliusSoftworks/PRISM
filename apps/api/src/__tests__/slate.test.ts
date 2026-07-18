import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import {
  acceptSlateRevision,
  createSlateProject,
  draftSlateStructureItem,
  generateSlateShape,
  getSlateProject,
  listSlateProjects,
  proposeSlateRevision,
  rejectSlateRevision,
  resolveSlateAccountDefaults,
  resolveSlateProjectSparkWildcards,
  SlateShapeWriteConflictError,
  updateSlateProject,
} from "../slate.ts";
import {
  chatWithSlateProject,
  generateSlateProjectTitle,
  listSlateProjectChatMessages,
  refreshSlateLivingSummary,
  resolveSlateProjectTitleSuggestion,
  suggestSlateProjectTitle,
} from "../slate-project-companion.ts";
import {
  closeTestDatabase,
  createDeterministicProvider,
  createTestDatabase,
} from "../test-support.ts";
import {
  LocalOllamaProvider,
  OpenAiProvider,
  selectProvider,
  type LlmProvider,
} from "../providers.ts";
import {
  getSlateProjectSection,
  listSlateProjectSections,
  saveSlateProjectSection,
  SlateSectionAiWriteConflictError,
} from "../slate-continuity.ts";

function seedUser(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.test`, id, "2026-07-15T00:00:00.000Z", "2026-07-15T00:00:00.000Z");
}

function scene(id = "scene-1") {
  return {
    id,
    kind: "scene" as const,
    title: "The Signal",
    summary: "Mara hears a signal beneath the city.",
    direction: "Keep the discovery intimate.",
    status: "planned" as const,
    locked: false,
  };
}

function createDelayedProvider(response: string): {
  provider: LlmProvider;
  started: Promise<void>;
  release: () => void;
  callCount: () => number;
} {
  let release!: () => void;
  let markStarted!: () => void;
  let calls = 0;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    provider: {
      name: "local",
      async generateResponse() {
        calls += 1;
        markStarted();
        await gate;
        return response;
      },
      async embedText() {
        return [];
      },
    },
    started,
    release,
    callCount: () => calls,
  };
}

describe("Slate persistence and writing operations", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "user-1");
    seedUser(db, "user-2");
  });

  afterEach(() => closeTestDatabase(db));

  it("generates a literary title from the story rather than title-casing its first line", async () => {
    const provider = createDeterministicProvider([
      JSON.stringify({
        title: "He Sat There in the Chair",
        reason: "It echoes the opening image.",
      }),
      JSON.stringify({
        title: "The Quiet Geometry",
        reason: "It joins the room's physical precision with the captive's inner calculation.",
      }),
    ]);
    const generated = await generateSlateProjectTitle(
      {
        sourceKind: "material",
        source:
          "He sat there in the chair. The captive begins mapping the room by sound, waiting for the fluorescent hum to reveal a hidden door.",
      },
      { provider, providerName: "local", model: "qwen3:8b" },
    );

    assert.equal(generated.title, "The Quiet Geometry");
    assert.equal(provider.calls.length, 2);
    assert.equal(generated.provider, "local");
    assert.match(generated.reason, /inner calculation/u);
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /not merely its opening sentence/u,
    );
    assert.match(
      provider.calls[0]?.[0]?.content ?? "",
      /Do not copy or lightly title-case the first line/u,
    );
    assert.match(
      provider.calls[1]?.[1]?.content ?? "",
      /Rejected candidate: He Sat There in the Chair/u,
    );
  });

  it("creates, saves, and reopens complete tenant-scoped project state", () => {
    const created = createSlateProject(db, "user-1", {
      title: "Glass City",
      titleOrigin: "spark",
      spark: "A city hears a signal from its own buried future.",
    });
    createSlateProject(db, "user-2", {
      title: "Other tenant",
      spark: "This must remain invisible.",
    });

    updateSlateProject(db, "user-1", created.id, {
      premise: "Mara follows a future signal through the city she designed.",
      phase: "draft",
      structure: [scene()],
      characters: [
        {
          id: "mara",
          name: "Mara",
          role: "Architect and reluctant investigator",
          voice: "Exact, dry, increasingly vulnerable",
          locked: true,
        },
      ],
      unresolvedThreads: [
        {
          id: "signal-origin",
          label: "Who sent the signal?",
          resolved: false,
          locked: false,
        },
      ],
      manuscript: "The Signal\n\nAt midnight, the pavement answered Mara.",
      direction: "Keep the speculative elements tactile.",
      lockedRanges: [{ id: "opening", start: 0, end: 10, label: "Opening title" }],
    });

    const reopened = getSlateProject(db, "user-1", created.id);
    assert.equal(reopened.title, "Glass City");
    assert.equal(reopened.titleOrigin, "spark");
    assert.equal(reopened.sparkWildcards, null);
    assert.equal(reopened.phase, "draft");
    assert.equal(reopened.structure[0]?.summary, scene().summary);
    assert.equal(reopened.characters[0]?.name, "Mara");
    assert.equal(reopened.unresolvedThreads[0]?.label, "Who sent the signal?");
    assert.equal(reopened.manuscript, "The Signal\n\nAt midnight, the pavement answered Mara.");
    assert.deepEqual(listSlateProjects(db, "user-1").map((project) => project.id), [created.id]);
    assert.throws(() => getSlateProject(db, "user-2", created.id), /not found/i);
  });

  it("defaults title provenance to the writer and marks direct renames as writer-owned", () => {
    const project = createSlateProject(db, "user-1", {
      title: "From Existing Pages",
      titleOrigin: "material",
      spark: "Chapter One begins in a snowbound station.",
    });
    assert.equal(project.titleOrigin, "material");
    const renamed = updateSlateProject(db, "user-1", project.id, {
      title: "The Last Snowbound Train",
    });
    assert.equal(renamed.titleOrigin, "writer");

    const legacyDefault = createSlateProject(db, "user-1", {
      title: "Writer Named",
      spark: "A quiet signal.",
    });
    assert.equal(legacyDefault.titleOrigin, "writer");
  });

  it("resolves and persists an optional wildcard spark with its source template", async () => {
    const provider = createDeterministicProvider([
      JSON.stringify({ OMEN__1: "a bell that rings beneath the sea" }),
    ]);
    const resolved = await resolveSlateProjectSparkWildcards(
      "A lighthouse keeper follows {OMEN} into a flooded archive.",
      { provider, providerName: "local", model: "qwen3:8b" },
    );

    assert.equal(
      resolved.spark,
      "A lighthouse keeper follows a bell that rings beneath the sea into a flooded archive.",
    );
    assert.equal(
      resolved.sparkWildcards.template,
      "A lighthouse keeper follows {OMEN} into a flooded archive.",
    );
    assert.equal(resolved.sparkWildcards.wildcardReplacements?.[0]?.key, "OMEN");
    assert.equal(provider.calls.length, 1);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /fill prompt-template wildcards/i);

    const project = createSlateProject(db, "user-1", {
      title: "The Drowned Bell",
      spark: resolved.spark,
      sparkWildcards: resolved.sparkWildcards,
    });
    const reopened = getSlateProject(db, "user-1", project.id);
    assert.equal(reopened.spark, resolved.spark);
    assert.deepEqual(reopened.sparkWildcards, resolved.sparkWildcards);

    const humanReplacement = updateSlateProject(db, "user-1", project.id, {
      spark: "A human-authored replacement spark.",
    });
    assert.equal(humanReplacement.sparkWildcards, null);
  });

  it("shapes a scene plan and drafts an approved scene through the supplied local provider", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    const provider = createDeterministicProvider([
      JSON.stringify({
        premise: "An architect follows a signal sent by the city she abandoned.",
        voice: "Close third person, precise and quietly uncanny.",
        nonNegotiables: ["No chosen-one reveal"],
        structure: [
          {
            kind: "scene",
            title: "The Signal",
            summary: "Mara finds the signal beneath a condemned plaza.",
            direction: "End with the city speaking her name.",
          },
        ],
        characters: [{ name: "Mara", role: "Architect", voice: "Dry and exact" }],
        unresolvedThreads: ["Why the city waited for Mara"],
      }),
      "At midnight, the condemned plaza spoke in the voice of a settling foundation.",
    ]);

    const shaped = await generateSlateShape(db, "user-1", project.id, {
      provider,
      providerName: "local",
      model: "llama3.2",
    });
    assert.equal(shaped.structure.length, 1);
    assert.equal(shaped.characters[0]?.name, "Mara");
    assert.equal(shaped.lastProvider, "local");

    const drafted = await draftSlateStructureItem(
      db,
      "user-1",
      project.id,
      shaped.structure[0]!.id,
      "Make the signal physically unsettling.",
      { provider, providerName: "local", model: "llama3.2" },
    );
    assert.match(drafted.manuscript, /The Signal/);
    assert.match(drafted.manuscript, /condemned plaza spoke/);
    assert.equal(drafted.structure[0]?.status, "drafted");
    assert.equal(provider.calls.length, 2);
  });

  it("persists project prose routing and model receipts for generated prose", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    const configured = updateSlateProject(db, "user-1", project.id, {
      proseMode: "online",
      proseProvider: "anthropic",
      proseModel: "claude-sonnet-test",
      structure: [scene()],
    });
    assert.equal(configured.proseMode, "online");
    assert.equal(configured.proseProvider, "anthropic");
    assert.equal(configured.proseModel, "claude-sonnet-test");

    const provider = createDeterministicProvider([
      "At midnight, the plaza answered Mara in the voice of settling stone.",
      "At midnight, the condemned plaza whispered Mara's name through its seams.",
    ]);
    await draftSlateStructureItem(
      db,
      "user-1",
      project.id,
      scene().id,
      "Keep it intimate.",
      { provider, providerName: "anthropic", model: "claude-sonnet-test" },
    );
    const draftedReceipt = db.prepare(
      `SELECT operation, provider, model, status, artifact_hash
         FROM slate_generation_receipts WHERE project_id = ?`,
    ).get(project.id) as {
      operation: string;
      provider: string;
      model: string;
      status: string;
      artifact_hash: string;
    };
    assert.deepEqual(
      {
        operation: draftedReceipt.operation,
        provider: draftedReceipt.provider,
        model: draftedReceipt.model,
        status: draftedReceipt.status,
      },
      {
        operation: "draft",
        provider: "anthropic",
        model: "claude-sonnet-test",
        status: "accepted",
      },
    );
    assert.match(draftedReceipt.artifact_hash, /^[a-f0-9]{64}$/u);

    const proposed = await proposeSlateRevision(
      db,
      "user-1",
      project.id,
      {
        action: "rewrite",
        scope: "scene",
        structureItemId: scene().id,
        direction: "Make the city feel awake.",
      },
      { provider, providerName: "anthropic", model: "claude-sonnet-test" },
    );
    const revision = proposed.revisions.find((candidate) => candidate.status === "pending")!;
    const proposedReceipt = db.prepare(
      `SELECT status, revision_id FROM slate_generation_receipts
        WHERE project_id = ? AND operation = 'revision'`,
    ).get(project.id) as { status: string; revision_id: string };
    assert.equal(proposedReceipt.status, "proposed");
    assert.equal(proposedReceipt.revision_id, revision.id);
    acceptSlateRevision(db, "user-1", project.id, revision.id);
    assert.equal(
      (
        db.prepare(
          "SELECT status FROM slate_generation_receipts WHERE revision_id = ?",
        ).get(revision.id) as { status: string }
      ).status,
      "accepted",
    );
  });

  it("persists a living summary, advisory project chat, and explicit title acceptance", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      titleOrigin: "spark",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, { structure: [scene()] });
    const section = listSlateProjectSections(db, "user-1", project.id)[0]!;
    saveSlateProjectSection(db, "user-1", project.id, section.id, {
      expectedRevision: section.revision,
      mutationId: "writer-opening",
      prose: "At midnight, the plaza answered Mara and called her home.",
      lockedRanges: [],
    });

    const summary = refreshSlateLivingSummary(db, "user-1", project.id);
    assert.equal(summary.projectId, project.id);
    assert.match(summary.text, /Mara hears a signal beneath the city/i);
    assert.equal(
      (
        db.prepare(
          "SELECT summary FROM slate_living_summaries WHERE project_id = ? AND user_id = ?",
        ).get(project.id, "user-1") as { summary: string }
      ).summary,
      summary.text,
    );

    const provider = createDeterministicProvider([
      "The opening is strongest when Mara treats the voice as an engineering fault before an invitation.",
      "Try making the plaza's answer feel almost useful before it becomes intimate.",
      "Let Mara recognize the engineering pattern one beat before she recognizes the voice.",
      JSON.stringify({
        keep: false,
        title: "The City Beneath Her Name",
        reason: "It joins the buried city with Mara's personal summons.",
      }),
    ]);
    const ai = { provider, providerName: "local" as const, model: "qwen3:8b" };
    const messages = await chatWithSlateProject(
      db,
      "user-1",
      project.id,
      "What is emotionally strongest in this opening?",
      ai,
    );
    assert.deepEqual(messages.map((message) => message.role), ["user", "assistant"]);
    assert.equal(messages[1]?.model, "qwen3:8b");
    assert.equal(listSlateProjectChatMessages(db, "user-1", project.id).length, 2);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /ephemeral creative companion/i);
    assert.match(provider.calls[0]?.[0]?.content ?? "", /Never imply long-term memory/i);

    await chatWithSlateProject(
      db,
      "user-1",
      project.id,
      "What is another direction?",
      ai,
    );
    const recovered = await chatWithSlateProject(
      db,
      "user-1",
      project.id,
      "Give me one last option.",
      ai,
    );
    assert.equal(recovered.length, 3);
    assert.deepEqual(
      recovered.map((message) => message.role),
      ["assistant", "user", "assistant"],
    );
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM slate_project_chat_messages WHERE project_id = ? AND user_id = ?",
      ).get(project.id, "user-1")?.count,
      3,
    );
    assert.deepEqual(
      provider.calls[2]?.slice(2).map((message) => message.role),
      ["assistant", "user", "assistant", "user"],
    );
    assert.throws(
      () => listSlateProjectChatMessages(db, "user-2", project.id),
      /not found/i,
    );

    const suggested = await suggestSlateProjectTitle(
      db,
      "user-1",
      project.id,
      ai,
    );
    assert.equal(suggested.title, "Glass City");
    assert.equal(suggested.titleSuggestion?.title, "The City Beneath Her Name");
    const accepted = resolveSlateProjectTitleSuggestion(
      db,
      "user-1",
      project.id,
      suggested.titleSuggestion!.id,
      "accepted",
    );
    assert.equal(accepted.title, "The City Beneath Her Name");
    assert.equal(accepted.titleOrigin, "writer");
    assert.equal(accepted.titleSuggestion, null);
  });

  it("refuses to Shape over locked author material before calling the model", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, {
      structure: [{ ...scene(), locked: true }],
    });
    const provider = createDeterministicProvider([
      JSON.stringify({ premise: "Must not be used." }),
    ]);

    await assert.rejects(
      generateSlateShape(db, "user-1", project.id, {
        provider,
        providerName: "local",
        model: "llama3.2",
      }),
      (error: unknown) =>
        error instanceof SlateShapeWriteConflictError &&
        error.reason === "locked",
    );
    assert.equal(provider.calls.length, 0);
    assert.equal(getSlateProject(db, "user-1", project.id).structure[0]?.locked, true);
  });

  it("keeps author edits made while Shape is in flight", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, {
      premise: "The writer's first premise.",
      direction: "Keep the city unknowable.",
      structure: [scene()],
    });
    const delayed = createDelayedProvider(
      JSON.stringify({
        premise: "A generated premise that arrived too late.",
        voice: "Generated voice.",
        nonNegotiables: [],
        structure: [
          {
            kind: "scene",
            title: "Replacement",
            summary: "This must not replace the writer's plan.",
            direction: "Overwrite it.",
          },
        ],
        characters: [],
        unresolvedThreads: [],
      }),
    );
    const shaping = generateSlateShape(db, "user-1", project.id, {
      provider: delayed.provider,
      providerName: "local",
      model: "llama3.2",
    });

    await delayed.started;
    const section = listSlateProjectSections(db, "user-1", project.id)[0]!;
    saveSlateProjectSection(db, "user-1", project.id, section.id, {
      expectedRevision: section.revision,
      mutationId: "writer-during-shape",
      prose: "The writer opened the scene while Slate was still thinking.",
      lockedRanges: [
        { id: "writer-lock", start: 0, end: 10, label: "Writer opening" },
      ],
    });
    updateSlateProject(db, "user-1", project.id, {
      premise: "The writer's newer premise.",
      direction: "Follow the writer's newer direction.",
      structure: [{ ...scene(), summary: "The writer's revised plan.", locked: true }],
    });
    delayed.release();

    await assert.rejects(
      shaping,
      (error: unknown) =>
        error instanceof SlateShapeWriteConflictError &&
        error.code === "slate_shape_write_conflict" &&
        error.reason === "locked",
    );
    const reopened = getSlateProject(db, "user-1", project.id);
    assert.equal(reopened.premise, "The writer's newer premise.");
    assert.equal(reopened.direction, "Follow the writer's newer direction.");
    assert.equal(reopened.structure[0]?.summary, "The writer's revised plan.");
    assert.equal(reopened.structure[0]?.locked, true);
    assert.match(reopened.manuscript, /writer opened the scene/i);
    assert.equal(reopened.lastProvider, null);
    assert.equal(delayed.callCount(), 1);
  });

  it("rejects a stale Shape when unlocked premise, direction, or structure changes", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, { structure: [scene()] });
    const delayed = createDelayedProvider(
      JSON.stringify({
        premise: "Late generated premise.",
        voice: "Late generated voice.",
        nonNegotiables: [],
        structure: [
          {
            kind: "scene",
            title: "Late Plan",
            summary: "This result is stale.",
            direction: "Do not commit it.",
          },
        ],
        characters: [],
        unresolvedThreads: [],
      }),
    );
    const shaping = generateSlateShape(db, "user-1", project.id, {
      provider: delayed.provider,
      providerName: "local",
      model: "llama3.2",
    });

    await delayed.started;
    updateSlateProject(db, "user-1", project.id, {
      premise: "The writer changed the premise.",
      direction: "The writer changed the direction.",
      structure: [
        {
          ...scene(),
          summary: "The writer changed the unlocked plan.",
        },
      ],
    });
    delayed.release();

    await assert.rejects(
      shaping,
      (error: unknown) =>
        error instanceof SlateShapeWriteConflictError &&
        error.reason === "structure_changed",
    );
    const reopened = getSlateProject(db, "user-1", project.id);
    assert.equal(reopened.premise, "The writer changed the premise.");
    assert.equal(reopened.direction, "The writer changed the direction.");
    assert.equal(
      reopened.structure[0]?.summary,
      "The writer changed the unlocked plan.",
    );
    assert.equal(reopened.lastProvider, null);
  });

  it("refuses to draft over existing writer prose without calling the model", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, { structure: [scene()] });
    const section = listSlateProjectSections(db, "user-1", project.id)[0]!;
    saveSlateProjectSection(db, "user-1", project.id, section.id, {
      expectedRevision: section.revision,
      mutationId: "writer-before-draft",
      prose: "Mara put her own sentence on the page.",
    });
    const provider = createDeterministicProvider(["Slate must not replace this."]);

    await assert.rejects(
      draftSlateStructureItem(
        db,
        "user-1",
        project.id,
        scene().id,
        "Continue.",
        { provider, providerName: "local", model: "llama3.2" },
      ),
      (error: unknown) =>
        error instanceof SlateSectionAiWriteConflictError &&
        error.reason === "contains_prose",
    );

    assert.equal(provider.calls.length, 0);
    assert.equal(
      getSlateProjectSection(db, "user-1", project.id, section.id).prose,
      "Mara put her own sentence on the page.",
    );
    assert.equal(getSlateProject(db, "user-1", project.id).structure[0]?.status, "planned");
  });

  it("refuses to draft a locked planned section without calling the model", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, {
      structure: [{ ...scene(), locked: true }],
    });
    const section = listSlateProjectSections(db, "user-1", project.id)[0]!;
    const provider = createDeterministicProvider(["Slate must not write here."]);

    await assert.rejects(
      draftSlateStructureItem(
        db,
        "user-1",
        project.id,
        scene().id,
        "Draft it.",
        { provider, providerName: "local", model: "llama3.2" },
      ),
      (error: unknown) =>
        error instanceof SlateSectionAiWriteConflictError && error.reason === "locked",
    );

    assert.equal(provider.calls.length, 0);
    assert.equal(
      getSlateProjectSection(db, "user-1", project.id, section.id).prose,
      "",
    );
  });

  it("keeps edits and locks made while an AI draft is in flight", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, { structure: [scene()] });
    const section = listSlateProjectSections(db, "user-1", project.id)[0]!;
    const delayed = createDelayedProvider("Generated prose that arrived too late.");
    const draft = draftSlateStructureItem(
      db,
      "user-1",
      project.id,
      scene().id,
      "Continue.",
      { provider: delayed.provider, providerName: "local", model: "llama3.2" },
    );

    await delayed.started;
    saveSlateProjectSection(db, "user-1", project.id, section.id, {
      expectedRevision: section.revision,
      mutationId: "writer-during-draft",
      prose: "The writer changed this while Slate was working.",
      lockedRanges: [
        { id: "writer-lock", start: 0, end: 10, label: "Keep this opening" },
      ],
    });
    delayed.release();

    await assert.rejects(
      draft,
      (error: unknown) =>
        error instanceof SlateSectionAiWriteConflictError && error.reason === "changed",
    );
    assert.equal(delayed.callCount(), 1);
    const reopened = getSlateProjectSection(db, "user-1", project.id, section.id);
    assert.equal(reopened.prose, "The writer changed this while Slate was working.");
    assert.deepEqual(reopened.lockedRanges, [
      { id: "writer-lock", start: 0, end: 10, label: "Keep this opening" },
    ]);
    assert.equal(getSlateProject(db, "user-1", project.id).structure[0]?.status, "planned");
    const aiSources = db
      .prepare(
        "SELECT COUNT(*) AS count FROM slate_continuity_sources WHERE section_id = ? AND kind = 'ai_draft'",
      )
      .get(section.id) as { count: number };
    assert.equal(aiSources.count, 0);
  });

  it("re-anchors manuscript locks across direct insertions, deletions, and overlapping edits", () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, { structure: [scene()] });
    const summary = listSlateProjectSections(db, "user-1", project.id)[0]!;
    const original = "Hello world!";
    const initial = saveSlateProjectSection(db, "user-1", project.id, summary.id, {
      expectedRevision: summary.revision,
      mutationId: "lock-anchor-original",
      prose: original,
      lockedRanges: [
        { id: "locked-world", start: 6, end: 11, label: "Keep the world" },
      ],
    });

    const inserted = saveSlateProjectSection(db, "user-1", project.id, summary.id, {
      expectedRevision: initial.revision,
      mutationId: "lock-anchor-insert",
      prose: "Bright Hello world!",
      // The browser may still send the coordinates from the previous prose.
      lockedRanges: initial.lockedRanges,
    });
    assert.equal(
      inserted.prose.slice(
        inserted.lockedRanges[0]!.start,
        inserted.lockedRanges[0]!.end,
      ),
      "world",
    );

    const deleted = saveSlateProjectSection(db, "user-1", project.id, summary.id, {
      expectedRevision: inserted.revision,
      mutationId: "lock-anchor-delete",
      prose: "Hello world!",
    });
    assert.equal(
      deleted.prose.slice(
        deleted.lockedRanges[0]!.start,
        deleted.lockedRanges[0]!.end,
      ),
      "world",
    );

    const overlapping = saveSlateProjectSection(db, "user-1", project.id, summary.id, {
      expectedRevision: deleted.revision,
      mutationId: "lock-anchor-overlap",
      prose: "Hello wide world!",
      lockedRanges: deleted.lockedRanges,
    });
    assert.equal(
      overlapping.prose.slice(
        overlapping.lockedRanges[0]!.start,
        overlapping.lockedRanges[0]!.end,
      ),
      "wide world",
    );
  });

  it("persists revision previews and keeps reject and accept outcomes explicit", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, {
      manuscript: "The pavement answered Mara with a low metallic note.",
    });
    const provider = createDeterministicProvider([
      "The pavement answered Mara with a note that trembled in her teeth.",
      "The pavement spoke Mara's name through every bolt in the plaza.",
    ]);

    const proposedThenRejected = await proposeSlateRevision(
      db,
      "user-1",
      project.id,
      { action: "deepen", scope: "project", direction: "Make the sound bodily." },
      { provider, providerName: "local", model: "llama3.2" },
    );
    const rejectedId = proposedThenRejected.revisions[0]!.id;
    const rejected = rejectSlateRevision(db, "user-1", project.id, rejectedId);
    assert.equal(rejected.manuscript, "The pavement answered Mara with a low metallic note.");
    assert.equal(rejected.revisions[0]?.status, "rejected");

    const proposedThenAccepted = await proposeSlateRevision(
      db,
      "user-1",
      project.id,
      { action: "rewrite", scope: "project", direction: "Make the signal personal." },
      { provider, providerName: "local", model: "llama3.2" },
    );
    const accepted = acceptSlateRevision(
      db,
      "user-1",
      project.id,
      proposedThenAccepted.revisions[0]!.id,
    );
    assert.equal(accepted.manuscript, "The pavement spoke Mara's name through every bolt in the plaza.");
    assert.equal(accepted.revisions[0]?.status, "accepted");
    assert.equal(accepted.versions.length, 2);
    assert.equal(accepted.versions[0]?.reason, "Before rewrite revision");
    const acceptedSection = db
      .prepare(
        `SELECT prose, revision FROM slate_sections
          WHERE project_id = ? AND user_id = ?`,
      )
      .get(project.id, "user-1") as { prose: string; revision: number };
    assert.equal(
      acceptedSection.prose,
      "The pavement spoke Mara's name through every bolt in the plaza.",
    );
    assert.equal(acceptedSection.revision, 1);
    const acceptedSource = db
      .prepare(
        `SELECT kind, authority, provider, model FROM slate_continuity_sources
          WHERE project_id = ? AND user_id = ? AND source_revision = ?`,
      )
      .get(project.id, "user-1", acceptedSection.revision) as {
      kind: string;
      authority: string;
      provider: string;
      model: string;
    };
    assert.deepEqual({ ...acceptedSource }, {
      kind: "accepted_revision",
      authority: "ai",
      provider: "local",
      model: "llama3.2",
    });
  });

  it("refuses to accept a stale proposal over newer human edits", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, { manuscript: "Original human sentence." });
    const provider = createDeterministicProvider(["Proposed replacement."]);
    const proposed = await proposeSlateRevision(
      db,
      "user-1",
      project.id,
      { action: "rewrite", scope: "project" },
      { provider, providerName: "local", model: "llama3.2" },
    );

    updateSlateProject(db, "user-1", project.id, { manuscript: "Newer authoritative human edit." });
    assert.throws(
      () => acceptSlateRevision(db, "user-1", project.id, proposed.revisions[0]!.id),
      /changed.*edits stay authoritative/i,
    );
    assert.equal(getSlateProject(db, "user-1", project.id).manuscript, "Newer authoritative human edit.");
  });

  it("blocks AI revision across locked manuscript text", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    updateSlateProject(db, "user-1", project.id, {
      manuscript: "This sentence cannot move.",
      lockedRanges: [{ id: "locked", start: 0, end: 13, label: "Writer lock" }],
    });
    const provider = createDeterministicProvider(["Replacement."]);
    await assert.rejects(
      proposeSlateRevision(
        db,
        "user-1",
        project.id,
        { action: "rewrite", scope: "selection", selectionStart: 0, selectionEnd: 10 },
        { provider, providerName: "local", model: "llama3.2" },
      ),
      /overlaps locked/i,
    );
    assert.equal(provider.calls.length, 0);
  });

  it("preserves later manuscript locks when an accepted selection changes length", async () => {
    const project = createSlateProject(db, "user-1", {
      title: "Glass City",
      spark: "A buried future calls its architect.",
    });
    const manuscript = "A signal. Keep this exact.";
    const lockedStart = manuscript.indexOf("Keep");
    updateSlateProject(db, "user-1", project.id, {
      manuscript,
      lockedRanges: [
        {
          id: "locked-later",
          start: lockedStart,
          end: manuscript.length,
          label: "Exact ending",
        },
      ],
    });
    const provider = createDeterministicProvider(["A long, trembling signal."]);
    const proposed = await proposeSlateRevision(
      db,
      "user-1",
      project.id,
      {
        action: "deepen",
        scope: "selection",
        selectionStart: 0,
        selectionEnd: "A signal.".length,
      },
      { provider, providerName: "local", model: "llama3.2" },
    );
    const accepted = acceptSlateRevision(
      db,
      "user-1",
      project.id,
      proposed.revisions[0]!.id,
    );
    const lock = accepted.lockedRanges[0]!;
    assert.equal(accepted.manuscript.slice(lock.start, lock.end), "Keep this exact.");
  });
});

describe("Slate provider inheritance", () => {
  it("uses the account LOCAL model and ignores online defaults", () => {
    const resolved = resolveSlateAccountDefaults({
        preferredProvider: "local",
        preferredLocalModel: "qwen3:8b",
        preferredOnlineModel: "gpt-5.4",
      });
    assert.deepEqual(resolved, { provider: "local", model: "qwen3:8b" });
    const provider = selectProvider(resolved.provider, "sk-present-but-must-stay-unused");
    assert.ok(provider instanceof LocalOllamaProvider);
    assert.ok(!(provider instanceof OpenAiProvider));
  });

  it("uses the account online default only when the account is online", () => {
    assert.deepEqual(
      resolveSlateAccountDefaults({
        preferredProvider: "openai",
        preferredLocalModel: "qwen3:8b",
        preferredOnlineModel: "gpt-5.4",
      }),
      { provider: "openai", model: "gpt-5.4" },
    );
  });
});
