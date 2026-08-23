import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type {
  DebateSessionV1,
  DebateMysteryNotebookPageV1,
  DebateWhodunnitCreateConfigV1,
} from "@localai/shared";
import { validateDebateMysteryCaseBible } from "@localai/shared";
import { initializeDatabase } from "../db.ts";
import {
  applyDebateMysteryAction,
  attachDebateMysteryGeneratedAssets,
  createDebateMysterySession,
  debateMysteryCaseCodeForSession,
  getDebateMysteryCaseBible,
  getDebateMysteryNotebook,
  getDebateMysteryNotebookV2,
  inspectDebateMysteryCaseCode,
  importDebateMysteryCase,
  listDebateMysteryActions,
  patchDebateMysteryNotebook,
  patchDebateMysteryNotebookV2,
  parseDebateMysteryEvidenceConfrontation,
  proposeDebateMysteryNotebookCleanup,
  resolveDebateMysteryEvidenceVisuals,
  resolveDebateMysteryQuestionMentions,
  resumeDebateMysteryCompilation,
} from "../debate-mystery.ts";
import type { DebateAiRuntime } from "../debate.ts";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";
import { HttpError } from "../utils.http.ts";

const NOW = "2026-08-20T19:00:00.000Z";

class MysteryProviderStub implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "mystery-test";
  public cleanupCalls = 0;
  public actorCalls = 0;
  public textureCalls = 0;
  public prompts: string[] = [];
  public actorPrompts: string[] = [];
  public actorOptions: GenerateOptions[] = [];
  public actorReply = "I remember the corridor clock, but I will not pretend I saw more than that.";

  public async generateResponse(messages: ProviderMessage[], options?: GenerateOptions): Promise<string> {
    const prompt = messages.map((message) => message.content).join("\n");
    this.prompts.push(prompt);
    if (prompt.includes("Clean up the investigator's selected notebook")) {
      this.cleanupCalls += 1;
      throw new Error("Use the safety-preserving exact proposal in this test.");
    }
    if (prompt.includes("acting in a fictional, non-canonical murder mystery")) {
      this.actorCalls += 1;
      this.actorPrompts.push(prompt);
      if (options) this.actorOptions.push(options);
      return this.actorReply;
    }
    if (prompt.includes("private Murder Mystery author")) {
      return JSON.stringify({
        title: "The Prism at Midnight",
        victimName: "Avery Vale",
        victimDescription: "The private owner of the rainbound estate.",
        motive: "To conceal a forged inheritance codicil.",
        method: "A measured dose hidden in a restorative cordial.",
        publicOpening: "Rain seals the estate as the investigation begins.",
      });
    }
    if (prompt.includes("room-observation stylist")) {
      this.textureCalls += 1;
      const input = JSON.parse(messages.at(-1)!.content) as {
        regions: Array<{ roomId: string; regionId: string; physicalAnchor: string }>;
      };
      return JSON.stringify({
        observations: input.regions.map((region, index) => ({
          roomId: region.roomId,
          regionId: region.regionId,
          observation: index === 0
            ? "Blood on this surface proves which culprit handled the weapon."
            : `Warm light slides across ${region.physicalAnchor}, revealing a quiet material gradient unique to this angle.`,
        })),
      });
    }
    return "I can only reason from the public record and your fallible notes.";
  }

  public async embedText(): Promise<number[]> { return [0.1, 0.2]; }
}

function runtime(provider: MysteryProviderStub): DebateAiRuntime {
  return {
    preferredProvider: "local",
    responseMode: "local",
    local: { provider, providerName: "local", model: "mystery-test" },
  };
}

function testDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  for (const id of ["user-1", "user-2"]) {
    db.prepare(
      `INSERT INTO users
         (id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          created_at, last_active_at)
       VALUES (?, ?, ?, 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
    ).run(id, `${id}@example.com`, id === "user-1" ? "Investigator" : "Other", NOW, NOW);
  }
  return db;
}

function seedBot(db: DatabaseSync, id: string, index: number): void {
  db.prepare(
    `INSERT INTO bots
       (id, user_id, name, system_prompt, export_hash, powers_json, color, glyph,
        online_enabled, model, local_model, online_model, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, ?, '[]', ?, '◆', 1, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    `Actor ${index}`,
    `Actor ${index} is observant, guarded, and willing to participate in clearly fictional ensemble stories.`,
    `export-${index}`,
    `hsl(${index * 40} 70% 60%)`,
    "mystery-test",
    "mystery-test",
    "mystery-test",
    NOW,
    NOW,
  );
}

function setup(db: DatabaseSync): DebateWhodunnitCreateConfigV1 {
  for (let index = 1; index <= 6; index += 1) seedBot(db, `bot-${index}`, index);
  return {
    version: 1,
    preset: "compact",
    difficulty: "classic",
    artMode: "bundled",
    inspiration: "Surprise me",
    nonce: "api-test",
    suspectBotIds: ["bot-1", "bot-2", "bot-3", "bot-4"],
    prosecutorPartnerBotId: "bot-5",
    rivalDefenseBotId: "bot-6",
  };
}

async function beginInvestigation(
  db: DatabaseSync,
  provider: MysteryProviderStub,
  session: DebateSessionV1,
  roomId: string,
  idempotencyKey: string,
): Promise<DebateSessionV1> {
  return applyDebateMysteryAction(db, "user-1", session.id, {
    expectedRevision: session.revision,
    idempotencyKey,
    action: "begin_investigation",
    roomId,
  }, runtime(provider));
}

async function beginInterview(
  db: DatabaseSync,
  provider: MysteryProviderStub,
  session: DebateSessionV1,
  suspectSeatId: string,
  idempotencyKey: string,
): Promise<DebateSessionV1> {
  return applyDebateMysteryAction(db, "user-1", session.id, {
    expectedRevision: session.revision,
    idempotencyKey,
    action: "begin_interview",
    suspectSeatId,
  }, runtime(provider));
}

async function endActivity(
  db: DatabaseSync,
  provider: MysteryProviderStub,
  session: DebateSessionV1,
  idempotencyKey: string,
): Promise<DebateSessionV1> {
  return applyDebateMysteryAction(db, "user-1", session.id, {
    expectedRevision: session.revision,
    idempotencyKey,
    action: "end_activity",
  }, runtime(provider));
}

describe("Debate Whodunnit private/public boundary", () => {
  it("persists free suspect encounters and keeps v2 desk pins as validated hypotheses", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-desk-v2", runtime(provider));
    const suspect = session.formatState.suspects[0]!;
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "desk-v2-travel", action: "travel", roomId: suspect.roomId }, runtime(provider));
    const before = session.formatState.actionsRemaining;
    session = await beginInterview(db, provider, session, suspect.seatId, "desk-v2-open");
    assert.equal(session.formatState.actionsRemaining, before);
    assert.deepEqual(session.formatState.metSuspectSeatIds, [suspect.seatId]);
    session = await endActivity(db, provider, session, "desk-v2-close");
    session = await beginInterview(db, provider, session, suspect.seatId, "desk-v2-reopen");
    assert.equal(session.formatState.actionsRemaining, before);
    const desk = getDebateMysteryNotebookV2(db, "user-1", session.id).notebook;
    const saved = patchDebateMysteryNotebookV2(db, "user-1", session.id, {
      expectedRevision: desk.revision,
      idempotencyKey: "desk-v2-save",
      leadAnnotations: [{ leadId: session.formatState.leads[0]!.id, text: "This may be related." }],
      suspectNotes: [{ seatId: suspect.seatId, text: "Ask about the timeline." }],
      suspectPins: [{ referenceKind: "lead", referenceId: session.formatState.leads[0]!.id, seatId: suspect.seatId }],
    }).notebook;
    assert.equal(saved.version, 2);
    assert.equal(saved.suspectPins.length, 1);
    assert.equal(JSON.stringify(session.formatState).includes("Ask about the timeline"), false);
    const replay = patchDebateMysteryNotebookV2(db, "user-1", session.id, { expectedRevision: desk.revision, idempotencyKey: "desk-v2-save" });
    assert.equal(replay.notebook.revision, saved.revision);
    assert.throws(
      () => patchDebateMysteryNotebookV2(db, "user-1", session.id, { expectedRevision: desk.revision, idempotencyKey: "desk-v2-stale", leadAnnotations: saved.leadAnnotations, suspectNotes: saved.suspectNotes, suspectPins: saved.suspectPins }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 409,
    );
    const unmetSeatId = session.formatState.suspects.find((candidate) => candidate.seatId !== suspect.seatId)!.seatId;
    const tampered = { ...saved, suspectNotes: [...saved.suspectNotes, { seatId: unmetSeatId, text: "Private data for an unmet suspect.", updatedAt: NOW }], suspectPins: [...saved.suspectPins, { id: "invalid-pin", referenceKind: "lead", referenceId: session.formatState.leads[0]!.id, seatId: unmetSeatId, createdAt: NOW }] };
    db.prepare("UPDATE debate_mystery_notebooks SET document_json = ? WHERE session_id = ? AND user_id = ?").run(JSON.stringify(tampered), session.id, "user-1");
    const sanitized = getDebateMysteryNotebookV2(db, "user-1", session.id).notebook;
    assert.equal(sanitized.suspectNotes.some((note) => note.seatId === unmetSeatId), false);
    assert.equal(sanitized.suspectPins.some((pin) => pin.seatId === unmetSeatId), false);
  });
  it("migrates v1 pages into valid lead annotations only", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-desk-migration", runtime(provider));
    const lead = session.formatState.leads[0]!;
    const legacy = {
      version: 1,
      sessionId: session.id,
      revision: 1,
      pages: [{ id: "legacy", title: "Old page", createdAt: NOW, updatedAt: NOW, blocks: [
        { id: "valid-lead", kind: "paragraph", text: "Keep this lead note.", leadId: lead.id, leadRevision: lead.revision },
        { id: "discard-reference", kind: "reference", text: "[[evidence:unknown]]", referenceKind: "evidence", referenceId: "unknown" },
        { id: "discard-note", kind: "paragraph", text: "This generic page content must not migrate." },
      ] }],
      createdAt: NOW,
      updatedAt: NOW,
    };
    db.prepare("UPDATE debate_mystery_notebooks SET document_json = ? WHERE session_id = ? AND user_id = ?").run(JSON.stringify(legacy), session.id, "user-1");
    const desk = getDebateMysteryNotebookV2(db, "user-1", session.id).notebook;
    assert.equal(desk.version, 2);
    assert.equal(Object.hasOwn(desk, "pages"), false);
    assert.deepEqual(desk.leadAnnotations.map((annotation) => annotation.text), ["Keep this lead note."]);
    assert.equal(JSON.stringify(desk).includes("generic page content"), false);
  });
  it("enforces one private suspect note per met seat and the combined desk character limit", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-desk-limits", runtime(provider));
    const suspects = session.formatState.suspects.slice(0, 3);
    for (const [index, suspect] of suspects.entries()) {
      session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: `desk-limit-travel-${index}`, action: "travel", roomId: suspect.roomId }, runtime(provider));
      session = await beginInterview(db, provider, session, suspect.seatId, `desk-limit-meet-${index}`);
      session = await endActivity(db, provider, session, `desk-limit-leave-${index}`);
    }
    const desk = getDebateMysteryNotebookV2(db, "user-1", session.id).notebook;
    assert.throws(
      () => patchDebateMysteryNotebookV2(db, "user-1", session.id, {
        expectedRevision: desk.revision,
        idempotencyKey: "desk-limit-save",
        leadAnnotations: [],
        suspectNotes: suspects.map((suspect) => ({ seatId: suspect.seatId, text: "x".repeat(8_000) })),
        suspectPins: [],
      }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 413,
    );
  });
  it("charges exactly three actions for frozen forensics without auto-filing desk references", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-forensics", runtime(provider));
    const crimeScene = session.formatState.rooms.find((room) => room.id === session.formatState.crimeSceneRoomId)!;
    session = await beginInvestigation(db, provider, session, crimeScene.id, "forensics-begin-investigation");
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision, idempotencyKey: "forensics-discover", action: "inspect", roomId: crimeScene.id, regionId: crimeScene.activeRegionId!,
    }, runtime(provider));
    const evidence = session.formatState.discoveredEvidence[0]!;
    const before = session.formatState.actionsRemaining;
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision, idempotencyKey: "forensics-run", action: "forensic", evidenceId: evidence.id,
    }, runtime(provider));
    assert.equal(session.formatState.actionsRemaining, before - 3);
    const finding = session.formatState.forensicFindings.find((entry) => entry.evidenceId === evidence.id)!;
    assert.equal(finding.usedInMurder, true);
    assert.equal(finding.contextualRelevance, "used");
    assert.equal(JSON.stringify(session.formatState).includes("isCanonicalWeapon"), false);
    assert.equal(Object.hasOwn(evidence, "relation"), false);
    assert.equal(Object.hasOwn(finding, "relation"), false);
    const afterForensics = session.revision;
    const replay = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision, idempotencyKey: "forensics-run", action: "forensic", evidenceId: evidence.id,
    }, runtime(provider));
    assert.equal(replay.revision, afterForensics);
    const notebookAfterEvidence = getDebateMysteryNotebook(db, "user-1", session.id).notebook;
    assert.equal(notebookAfterEvidence.pages.flatMap((page) => page.blocks).filter((block) => block.referenceKind === "evidence" && block.referenceId === evidence.id).length, 0);
    const suspect = session.formatState.suspects[0]!;
    provider.actorReply = "Suspect-2 was near the corridor; that is all I saw.";
    const suspectRoom = session.formatState.rooms.find((room) => room.id === suspect.roomId)!;
    session = await endActivity(db, provider, session, "forensics-end-investigation");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "forensics-travel", action: "travel", roomId: suspectRoom.id }, runtime(provider));
    session = await beginInterview(db, provider, session, suspect.seatId, "forensics-begin-interview");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "forensics-interview", action: "interview", suspectSeatId: suspect.seatId, question: "State your alibi.", evidenceId: null }, runtime(provider));
    const actorAnswer = session.formatState.interviewLog.at(-1)!.content;
    assert.match(actorAnswer, new RegExp(session.formatState.suspects[1]!.name));
    assert.doesNotMatch(actorAnswer, /suspect-2/iu);
    const testimonyId = session.formatState.testimony.find((entry) => entry.speakerSeatId === suspect.seatId)!.id;
    const notebook = getDebateMysteryNotebook(db, "user-1", session.id).notebook;
    assert.equal(notebook.pages.flatMap((page) => page.blocks).filter((block) => block.referenceKind === "testimony" && block.referenceId === testimonyId).length, 0);
    const resolved = resolveDebateMysteryQuestionMentions(`Ask [[mystery:suspect:${suspect.seatId}]] about [[mystery:testimony:${testimonyId}]] and [[mystery:victim:victim]].`, session.formatState, getDebateMysteryCaseBible(db, "user-1", session.id));
    assert.match(resolved, new RegExp(suspect.name));
    assert.match(resolved, new RegExp(session.formatState.victim.name));
    assert.doesNotMatch(resolved, /suspect-\d/u);
    const lead = session.formatState.leads.find((entry) => entry.revision > 1) ?? session.formatState.leads[0]!;
    const resolvedLead = resolveDebateMysteryQuestionMentions(
      `What do you make of [[mystery:lead:${lead.id}@${lead.revision}]]?`,
      session.formatState,
      getDebateMysteryCaseBible(db, "user-1", session.id),
    );
    assert.match(resolvedLead, new RegExp(lead.title.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
    assert.match(resolvedLead, new RegExp(lead.summary.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
    assert.doesNotMatch(resolvedLead, /requiredEvidenceIds|requiredTestimonyIds|requiredObservationKeys/u);
    assert.throws(
      () => resolveDebateMysteryQuestionMentions(
        `Review [[mystery:lead:${lead.id}@${lead.revision + 1}]].`,
        session.formatState,
        getDebateMysteryCaseBible(db, "user-1", session.id),
      ),
      (error: unknown) => error instanceof HttpError && error.statusCode === 409,
    );
    const leadUpdateEvents = listDebateMysteryActions(db, "user-1", session.id)
      .flatMap((event) => Array.isArray(event.payload.leadUpdates) ? event.payload.leadUpdates : []);
    assert.ok(leadUpdateEvents.length > 0);
    assert.doesNotMatch(JSON.stringify(leadUpdateEvents), /requiredEvidenceIds|requiredTestimonyIds|requiredObservationKeys/u);
  });

  it("charges committed searches and questions while view navigation stays free", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-free-interview", runtime(provider));
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    assert.equal(bible.activeRegions.length, bible.rooms.length * 16);
    assert.ok(provider.textureCalls > 0);
    const emptyRegions = bible.activeRegions.filter((region) => region.kind === "empty");
    assert.ok(emptyRegions.some((region) => region.inspectionResponse.startsWith("Warm light slides across ")));
    assert.ok(emptyRegions.some((region) => !region.inspectionResponse.startsWith("Warm light slides across ")));
    assert.ok(emptyRegions.every((region) => !/blood|culprit|weapon/iu.test(region.inspectionResponse)));
    const suspect = bible.suspects[0]!;
    const suspectRoom = bible.rooms.find((room) => room.id === suspect.roomId)!;
    const beforeTravel = session.formatState.actionsRemaining;
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "free-travel", action: "travel", roomId: suspectRoom.id }, runtime(provider));
    assert.equal(session.formatState.actionsRemaining, beforeTravel - 1);
    const suspectRegionId = bible.activeRegions.find((item) => item.roomId === suspectRoom.id)!.regionId;
    assert.equal(session.formatState.rooms.find((room) => room.id === suspectRoom.id)?.activeRegionId, suspectRegionId);
    const afterTravel = session.formatState.actionsRemaining;
    session = await beginInvestigation(db, provider, session, suspectRoom.id, "suspect-room-begin");
    assert.equal(session.formatState.actionsRemaining, afterTravel);
    const afterInvestigationStart = session.formatState.actionsRemaining;
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "suspect-room-inspect", action: "inspect", roomId: suspectRoom.id, regionId: suspectRegionId }, runtime(provider));
    assert.equal(
      session.formatState.actionsRemaining,
      afterInvestigationStart - 1 + session.formatState.recoveredActionTokens.filter((token) => token.roomId === suspectRoom.id).reduce((total, token) => total + token.amount, 0),
    );
    assert.equal(session.formatState.rooms.find((room) => room.id === suspectRoom.id)?.searched, false);
    assert.ok(session.formatState.rooms.find((room) => room.id === suspectRoom.id)?.publicObservation);
    const observationCount = session.formatState.rooms.find((room) => room.id === suspectRoom.id)!.observations.length;
    await assert.rejects(
      applyDebateMysteryAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "suspect-room-inspect-repeat",
        action: "inspect",
        roomId: suspectRoom.id,
        regionId: suspectRegionId,
      }, runtime(provider)),
      (error: unknown) => error instanceof HttpError && error.statusCode === 409 && error.message.includes("already been investigated"),
    );
    assert.equal(session.formatState.rooms.find((room) => room.id === suspectRoom.id)?.inspectionCounts[suspectRegionId], 1);
    assert.equal(session.formatState.rooms.find((room) => room.id === suspectRoom.id)?.observations.length, observationCount);
    session = await endActivity(db, provider, session, "suspect-room-end");
    const beforeInvestigationReentry = session.formatState.actionsRemaining;
    session = await beginInvestigation(
      db,
      provider,
      session,
      suspectRoom.id,
      "suspect-room-reenter",
    );
    assert.equal(
      session.formatState.actionsRemaining,
      beforeInvestigationReentry,
    );
    session = await endActivity(
      db,
      provider,
      session,
      "suspect-room-reenter-end",
    );
    const beforeInterview = session.formatState.actionsRemaining;
    session = await beginInterview(db, provider, session, suspect.seatId, "suspect-interview-begin");
    assert.equal(session.formatState.actionsRemaining, beforeInterview);
    const afterInterviewStart = session.formatState.actionsRemaining;
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "free-question-one", action: "interview", suspectSeatId: suspect.seatId, question: "State your alibi." }, runtime(provider));
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "free-question-two", action: "interview", suspectSeatId: suspect.seatId, question: "Please state that alibi again." }, runtime(provider));
    assert.equal(session.formatState.actionsRemaining, afterInterviewStart - 2);
    assert.equal(provider.actorCalls, 2);
    assert.equal(provider.actorPrompts.every((prompt) => !prompt.includes("proofBundles") && !prompt.includes("culpritSeatId")), true);
    assert.equal(provider.actorPrompts.every((prompt) => prompt.includes("one to three concise sentences") && prompt.includes("at most 70 words")), true);
    assert.equal(provider.actorOptions.every((options) => options.maxTokens === 180), true);
    assert.equal(parseDebateMysteryEvidenceConfrontation("The creased receipt sounds suspicious.", []), null);
    assert.throws(
      () => parseDebateMysteryEvidenceConfrontation("[[exhibit:unknown]] Why?", []),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
    const crimeScene = session.formatState.rooms.find((room) => room.id === session.formatState.crimeSceneRoomId)!;
    session = await endActivity(db, provider, session, "marker-end-first-interview");
    const beforeInterviewReentry = session.formatState.actionsRemaining;
    session = await beginInterview(
      db,
      provider,
      session,
      suspect.seatId,
      "marker-reenter-first-interview",
    );
    assert.equal(session.formatState.actionsRemaining, beforeInterviewReentry);
    session = await endActivity(
      db,
      provider,
      session,
      "marker-end-reentered-interview",
    );
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "marker-crime-scene", action: "travel", roomId: crimeScene.id }, runtime(provider));
    session = await beginInvestigation(db, provider, session, crimeScene.id, "marker-begin-investigation");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "marker-inspect", action: "inspect", roomId: crimeScene.id, regionId: crimeScene.activeRegionId! }, runtime(provider));
    const evidenceId = session.formatState.discoveredEvidence[0]!.id;
    session = await endActivity(db, provider, session, "marker-end-investigation");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "marker-return", action: "travel", roomId: suspectRoom.id }, runtime(provider));
    session = await beginInterview(db, provider, session, suspect.seatId, "marker-begin-second-interview");
    await assert.rejects(
      applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "plain-name-not-confrontation", action: "interview", suspectSeatId: suspect.seatId, question: `What about the ${session.formatState.discoveredEvidence[0]!.title}?`, evidenceId }, runtime(provider)),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "marker-confrontation", action: "interview", suspectSeatId: suspect.seatId, question: `[[exhibit:${evidenceId}]] What does this mean?`, evidenceId }, runtime(provider));
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).at(-1)?.payload.evidenceId, evidenceId);
  });

  it("keeps partner consultation free and force-locks an exhausted investigation to Theory", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-action-exhaustion", runtime(provider));
    const roomId = session.formatState.currentRoomId;
    const exhausted = structuredClone(session);
    exhausted.formatState.actionsRemaining = 1;
    db.prepare("UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = 'user-1'")
      .run(JSON.stringify(exhausted), session.id);
    session = exhausted;
    session = await beginInvestigation(db, provider, session, roomId, "exhaust-begin");
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "exhaust-last-inspection",
      action: "inspect",
      roomId,
      regionId: session.formatState.rooms.find((room) => room.id === roomId)!.activeRegionId!,
    }, runtime(provider));

    assert.equal(session.formatState.actionsRemaining, 0);
    assert.equal(session.formatState.activeActivity?.kind, "investigation");
    assert.equal(session.formatState.playPhase, "investigation");

    await assert.rejects(
      applyDebateMysteryAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "exhaust-extra-inspection",
        action: "inspect",
        roomId,
        regionId: session.formatState.rooms.find((room) => room.id === roomId)!.activeRegionIds[1]!,
      }, runtime(provider)),
      (error: unknown) => error instanceof HttpError && error.statusCode === 409 && error.message.includes("No investigation actions remain"),
    );

    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "exhaust-partner-active",
      action: "consult_partner",
      question: "What can the record support so far?",
    }, runtime(provider));
    assert.equal(session.formatState.actionsRemaining, 0);
    assert.equal(session.formatState.partnerConsultations.length, 1);

    session = await endActivity(db, provider, session, "exhaust-final-session");
    assert.equal(session.formatState.playPhase, "theory");
    assert.equal(session.formatState.activeActivity, null);
    assert.equal(session.stepKey, "mystery_theory");

    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "exhaust-partner-theory",
      action: "consult_partner",
      question: "Help me build the strongest available theory.",
    }, runtime(provider));
    assert.equal(session.formatState.actionsRemaining, 0);
    assert.equal(session.formatState.partnerConsultations.length, 2);
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).at(-1)?.payload.cost, 0);
    assert.ok(provider.prompts.some((prompt) => prompt.includes("fallible, unverified player hypothesis")));

    await assert.rejects(
      beginInvestigation(db, provider, session, roomId, "exhaust-reenter"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 409 && error.message.includes("unavailable after the investigation closes"),
    );
  });

  it("recovers each frozen room token exactly once without exposing its placement beforehand", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-action-token", runtime(provider));
    const token = getDebateMysteryCaseBible(db, "user-1", session.id).actionTokens![0]!;

    assert.equal(JSON.stringify(session.formatState).includes(token.id), false);
    if (session.formatState.currentRoomId !== token.roomId) {
      session = await applyDebateMysteryAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "token-travel",
        action: "travel",
        roomId: token.roomId,
      }, runtime(provider));
    }
    session = await beginInvestigation(db, provider, session, token.roomId, "token-begin-investigation");
    const beforeRecovery = session.formatState.actionsRemaining;
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "token-inspect",
      action: "inspect",
      roomId: token.roomId,
      regionId: token.regionId,
    }, runtime(provider));

    assert.equal(session.formatState.actionsRemaining, beforeRecovery - 1 + token.amount);
    assert.deepEqual(session.formatState.recoveredActionTokens.map((item) => item.id), [token.id]);
    const actionTokenPayload = listDebateMysteryActions(db, "user-1", session.id).at(-1)?.payload.actionToken as { id?: string } | undefined;
    assert.equal(actionTokenPayload?.id, token.id);
    await assert.rejects(
      applyDebateMysteryAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "token-inspect-repeat",
        action: "inspect",
        roomId: token.roomId,
        regionId: token.regionId,
      }, runtime(provider)),
      (error: unknown) => error instanceof HttpError && error.statusCode === 409 && error.message.includes("already been investigated"),
    );
    assert.equal(session.formatState.actionsRemaining, beforeRecovery - 1 + token.amount);
  });

  it("rejects concurrent fresh requests for one hotspot after its single reward", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-hotspot-race", runtime(provider));
    const token = getDebateMysteryCaseBible(db, "user-1", session.id).actionTokens![0]!;
    if (session.formatState.currentRoomId !== token.roomId) {
      session = await applyDebateMysteryAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "hotspot-race-travel",
        action: "travel",
        roomId: token.roomId,
      }, runtime(provider));
    }
    session = await beginInvestigation(db, provider, session, token.roomId, "hotspot-race-begin");
    const actionCount = listDebateMysteryActions(db, "user-1", session.id).length;
    const request = (idempotencyKey: string) => applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey,
      action: "inspect" as const,
      roomId: token.roomId,
      regionId: token.regionId,
    }, runtime(provider));

    const results = await Promise.allSettled([request("hotspot-race-a"), request("hotspot-race-b")]);
    const first = results.find((result): result is PromiseFulfilledResult<DebateSessionV1> => result.status === "fulfilled")?.value;
    const duplicate = results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason;

    assert.ok(first);
    assert.ok(duplicate instanceof HttpError && duplicate.statusCode === 409);
    assert.deepEqual(first.formatState.recoveredActionTokens.map((entry) => entry.id), [token.id]);
    assert.equal(first.formatState.rooms.find((room) => room.id === token.roomId)?.observations.filter((entry) => entry.regionId === token.regionId).length, 1);
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).length, actionCount + 1);
  });

  it("charges each committed access-item application without consuming the tool on failed attempts", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const config = setup(db);
    seedBot(db, "bot-7", 7);
    seedBot(db, "bot-8", 8);
    config.preset = "standard";
    config.suspectBotIds = ["bot-1", "bot-2", "bot-3", "bot-4", "bot-5", "bot-6"];
    config.prosecutorPartnerBotId = "bot-7";
    config.rivalDefenseBotId = "bot-8";
    let session = await createDebateMysterySession(db, "user-1", config, "mystery-access-items", runtime(provider));
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    const crimeScene = session.formatState.rooms.find((room) => room.id === session.formatState.crimeSceneRoomId)!;
    session = await beginInvestigation(db, provider, session, crimeScene.id, "access-begin-crime-scene");
    const sourceRegions = bible.activeRegions.filter((outcome) => outcome.roomId === crimeScene.id && outcome.inventoryItemId);
    for (const [index, outcome] of sourceRegions.entries()) {
      session = await applyDebateMysteryAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: `access-source-${index}`,
        action: "inspect",
        roomId: crimeScene.id,
        regionId: outcome.regionId,
      }, runtime(provider));
    }
    const beforeAttempts = session.formatState.actionsRemaining;
    const goldKey = session.formatState.inventoryItems.find((item) => item.id === "access-delicate-gold-key")!;
    const safeCode = session.formatState.inventoryItems.find((item) => item.id === "access-safe-code")!;
    const jewelryBox = session.formatState.inventoryItems.find((item) => item.id === "container-locked-jewelry-box")!;
    assert.ok(goldKey && safeCode && jewelryBox);
    const discoveredBox = session.formatState.rooms.find((room) => room.id === jewelryBox.sourceRoomId)!
      .observations.find((observation) => observation.regionId === jewelryBox.sourceRegionId)!;
    assert.deepEqual(discoveredBox.accessTargets, [{
      targetKind: "item",
      targetId: jewelryBox.id,
      targetLabel: jewelryBox.title,
    }]);

    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "access-wrong-item",
      action: "use_access_item",
      accessItemId: safeCode.id,
      targetKind: "item",
      targetId: jewelryBox.id,
    }, runtime(provider));
    assert.equal(session.formatState.accessHistory.at(-1)?.success, false);
    assert.ok(session.formatState.inventoryItems.some((item) => item.id === safeCode.id));
    assert.equal(session.formatState.actionsRemaining, beforeAttempts - 1);

    const accessActionCount = listDebateMysteryActions(db, "user-1", session.id).length;
    const duplicateAccessRequest = (idempotencyKey: string) => applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey,
      action: "use_access_item" as const,
      accessItemId: goldKey.id,
      targetKind: "item" as const,
      targetId: jewelryBox.id,
    }, runtime(provider));
    const duplicateAccessResults = await Promise.allSettled([
      duplicateAccessRequest("access-open-box-a"),
      duplicateAccessRequest("access-open-box-b"),
    ]);
    const openedBox = duplicateAccessResults.find(
      (result): result is PromiseFulfilledResult<DebateSessionV1> => result.status === "fulfilled",
    )?.value;
    const duplicateOpenedBox = duplicateAccessResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )?.reason;
    assert.ok(openedBox);
    assert.ok(duplicateOpenedBox instanceof HttpError && duplicateOpenedBox.statusCode === 409);
    session = openedBox;
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).length, accessActionCount + 1);
    assert.equal(session.formatState.accessHistory.filter((entry) => entry.id === "lock-jewelry-box").length, 1);
    assert.equal(session.formatState.inventoryItems.some((item) => item.id === goldKey.id || item.id === jewelryBox.id), false);
    assert.ok(session.formatState.inventoryItems.some((item) => item.id === "artifact-heirloom-jewels"));
    assert.ok(session.formatState.discoveredEvidence.some((item) => item.id === "evidence-heirloom-jewels"));
    assert.equal(session.formatState.discoveredEvidence.some((item) => item.id === "evidence-locked-jewelry-box"), false);
    assert.match(session.formatState.rooms.find((room) => room.id === jewelryBox.sourceRoomId)!.observations.find((observation) => observation.regionId === jewelryBox.sourceRegionId)!.observation, /jewelry box opens/u);

    const roomLock = bible.accessLocks.find((lock) => lock.targetKind === "room")!;
    const roomAccessItem = session.formatState.inventoryItems.find((item) => item.id === roomLock.requiredAccessItemId)!;
    assert.ok(roomAccessItem);
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "access-unlock-room",
      action: "use_access_item",
      accessItemId: roomAccessItem.id,
      targetKind: "room",
      targetId: roomLock.targetId,
    }, runtime(provider));
    assert.equal(session.formatState.rooms.find((room) => room.id === roomLock.targetId)?.locked, false);

    const regionLock = bible.accessLocks.find((lock) => lock.targetKind === "region")!;
    const [safeRoomId] = regionLock.targetId.split(":");
    session = await endActivity(db, provider, session, "access-end-crime-scene");
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "access-travel-safe-room",
      action: "travel",
      roomId: safeRoomId!,
    }, runtime(provider));
    session = await beginInvestigation(db, provider, session, safeRoomId!, "access-begin-safe-room");
    await assert.rejects(
      applyDebateMysteryAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "access-open-safe-before-discovery",
        action: "use_access_item",
        accessItemId: safeCode.id,
        targetKind: "region",
        targetId: regionLock.targetId,
      }, runtime(provider)),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404 && error.message.includes("No discovered lock"),
    );
    const safeRegionId = regionLock.targetId.split(":").slice(1).join(":");
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "access-discover-safe",
      action: "inspect",
      roomId: safeRoomId!,
      regionId: safeRegionId,
    }, runtime(provider));
    const discoveredSafe = session.formatState.rooms.find((room) => room.id === safeRoomId)!
      .observations.find((observation) => observation.regionId === safeRegionId)!;
    assert.deepEqual(discoveredSafe.accessTargets, [{
      targetKind: "region",
      targetId: regionLock.targetId,
      targetLabel: regionLock.targetLabel,
    }]);
    assert.equal(JSON.stringify(discoveredSafe.accessTargets).includes("requiredAccessItemId"), false);
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "access-open-safe",
      action: "use_access_item",
      accessItemId: safeCode.id,
      targetKind: "region",
      targetId: regionLock.targetId,
    }, runtime(provider));
    assert.ok(session.formatState.inventoryItems.some((item) => item.id === "artifact-private-ledger"));
    const openedSafe = session.formatState.rooms.find((room) => room.id === safeRoomId)!.observations.find((observation) => observation.regionId === safeRegionId)!;
    assert.match(openedSafe.observation, /hidden safe opens/u);
    assert.deepEqual(openedSafe.accessTargets, []);
    assert.equal(session.formatState.accessHistory.filter((entry) => entry.success).length, 3);
    assert.equal(JSON.stringify(session.formatState.accessHistory).includes("unrelated"), false);
  });

  it("reuses a strong Debate exhibit match without changing canonical evidence text", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-create-assets", runtime(provider));
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    const evidence = bible.evidence[0]!;
    const resolved = resolveDebateMysteryEvidenceVisuals(bible, [{
      id: "prior-exhibit",
      adjective: evidence.adjective,
      object: evidence.object,
      title: evidence.title,
      emoji: "🧩",
      imageId: "image-prior",
    }]);
    assert.equal(resolved.evidence[0]!.imageId, "image-prior");
    assert.equal(resolved.evidence[0]!.observation, evidence.observation);
    assert.equal(resolved.evidence[0]!.factTags.join("|"), evidence.factTags.join("|"));
  });

  it("compiles a Compact LOCAL case without placing hidden truth in session_json", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-create-0001", runtime(provider));
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    assert.equal(session.format, "whodunnit");
    assert.equal(session.playerRole, "investigator");
    assert.equal(session.formatState.format, "whodunnit");
    assert.equal(session.formatState.playPhase, "investigation");
    assert.equal(session.formatState.rooms.length, 5);
    assert.equal(
      session.formatState.rooms
        .filter((room) => !room.discovered)
        .every((room) => room.name !== null && room.templateId !== null && room.imageId === null && room.kind === null && room.assignedSuspectSeatId === null),
      true,
    );
    assert.deepEqual(
      session.formatState.suspects.map((suspect) => suspect.roomId),
      bible.suspects.map((suspect) => suspect.roomId),
    );
    const row = db.prepare("SELECT session_json FROM debate_sessions WHERE id = ?").get(session.id) as { session_json: string };
    for (const hiddenKey of ["culpritSeatId", "accompliceSeatId", "actorKnowledge", "proofBundles", "hidingMechanism"]) {
      assert.equal(row.session_json.includes(hiddenKey), false, hiddenKey);
    }
    const privateRow = db.prepare("SELECT private_json, content_hash FROM debate_mystery_cases WHERE session_id = ? AND user_id = 'user-1'").get(session.id) as { private_json: string; content_hash: string };
    assert.match(privateRow.private_json, /"culpritSeatId"/u);
    assert.equal(privateRow.content_hash.length, 64);
    assert.throws(
      () => getDebateMysteryCaseBible(db, "user-2", session.id),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );

    db.prepare(
      "INSERT INTO images (id, user_id, prompt, url, created_at) VALUES ('mystery-room-image', 'user-1', 'room', '/room.png', ?)",
    ).run(NOW);
    const privateRoom = getDebateMysteryCaseBible(db, "user-1", session.id).rooms.find((room) => room.id !== session.formatState.crimeSceneRoomId)!;
    const withAsset = attachDebateMysteryGeneratedAssets(db, "user-1", session.id, {
      roomImageByTemplateId: { [privateRoom.templateId]: "mystery-room-image" },
    });
    const stillPrivate = withAsset.formatState.format === "whodunnit"
      ? withAsset.formatState.rooms.find((room) => room.id === privateRoom.id)!
      : null;
    assert.equal(stillPrivate?.templateId, privateRoom.templateId);
    assert.equal(stillPrivate?.imageId, null);
  });

  it("investigates with a paid inspection and earns a deterministic Lucky Break at trial", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-create-0002", runtime(provider));
    assert.equal(session.formatState.format, "whodunnit");
    const initialActions = session.formatState.actionsRemaining;
    const crimeScene = session.formatState.rooms.find((room) => room.id === session.formatState.crimeSceneRoomId)!;
    session = await beginInvestigation(db, provider, session, crimeScene.id, "mystery-begin-investigation-0001");
    const inspectRequest = { expectedRevision: session.revision, idempotencyKey: "mystery-inspect-0001", action: "inspect" as const, roomId: crimeScene.id, regionId: crimeScene.activeRegionId! };
    session = await applyDebateMysteryAction(db, "user-1", session.id, inspectRequest, runtime(provider));
    assert.equal(session.formatState.format, "whodunnit");
    assert.equal(session.formatState.actionsRemaining, initialActions - 1 + session.formatState.recoveredActionTokens.length);
    assert.equal(session.formatState.discoveredEvidence.length, 1);
    assert.equal(JSON.stringify(session.formatState).includes("factTags"), false);
    const inspectReplay = await applyDebateMysteryAction(db, "user-1", session.id, inspectRequest, runtime(provider));
    assert.equal(inspectReplay.revision, session.revision);
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).length, 2);
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    const culprit = session.formatState.suspects.find((seat) => seat.seatId === bible.culpritSeatId)!;
    const culpritRoomId = bible.suspects.find((seat) => seat.seatId === culprit.seatId)!.roomId;
    session = await endActivity(db, provider, session, "mystery-end-investigation-0001");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "mystery-travel-0001", action: "travel", roomId: culpritRoomId }, runtime(provider));
    session = await beginInterview(db, provider, session, culprit.seatId, "mystery-begin-interview-0001");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "mystery-interview-0001", action: "interview", suspectSeatId: culprit.seatId, question: "Where were you when the corridor clock chimed?" }, runtime(provider));
    assert.equal(provider.actorCalls, 1);
    assert.equal(provider.actorPrompts[0]!.includes("proofBundles"), false);
    assert.equal(provider.actorPrompts[0]!.includes("culpritSeatId"), false);
    assert.equal(provider.actorPrompts[0]!.includes("actorKnowledge"), false);
    assert.equal(session.formatState.format, "whodunnit");
    const evidenceId = session.formatState.discoveredEvidence[0]!.id;
    const testimonyId = session.formatState.testimony.find((entry) => entry.speakerSeatId === culprit.seatId)!.id;
    session = await endActivity(db, provider, session, "mystery-end-interview-0001");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "mystery-file-0001", action: "file_theory", theory: { culpritSeatId: culprit.seatId, accompliceSeatId: null, method: "The cordial", motive: "A secret", opportunity: "The corridor", evidenceIds: [evidenceId], testimonyIds: [testimonyId] } }, runtime(provider));
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "mystery-court-0001", action: "court_present", testimonyId, evidenceId }, runtime(provider));
    if (session.formatState.format === "whodunnit" && session.formatState.court?.activeTestimonyId) {
      session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "mystery-court-pass-0001", action: "court_pass", testimonyId: session.formatState.court.activeTestimonyId }, runtime(provider));
    }
    assert.equal(session.status, "completed");
    assert.equal(session.formatState.format, "whodunnit");
    assert.equal(session.formatState.verdict?.grade, "lucky_break");
    const actions = listDebateMysteryActions(db, "user-1", session.id);
    assert.deepEqual(actions.map((entry) => entry.action), ["begin_investigation", "inspect", "end_activity", "travel", "begin_interview", "interview", "end_activity", "file_theory", "court_present", "court_pass"]);
    assert.equal(JSON.stringify(actions).includes("culpritSeatId"), true); // The filed accusation is public.
    assert.equal(JSON.stringify(actions).includes("proofBundles"), false);
    assert.equal(JSON.stringify(actions).includes("factTags"), false);
  });

  it("grounds exact quotes, grants one continuance, and terminates the second credibility collapse", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-create-continuance", runtime(provider));
    assert.equal(session.formatState.format, "whodunnit");
    const crimeScene = session.formatState.rooms.find((room) => room.id === session.formatState.crimeSceneRoomId)!;
    session = await beginInvestigation(db, provider, session, crimeScene.id, "continuance-begin-investigation");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "continuance-inspect", action: "inspect", roomId: crimeScene.id, regionId: crimeScene.activeRegionId! }, runtime(provider));
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    const accused = bible.suspects.find((suspect) => suspect.seatId !== bible.culpritSeatId)!;
    const evidenceId = session.formatState.format === "whodunnit" ? session.formatState.discoveredEvidence[0]!.id : "";
    const theory = { culpritSeatId: accused.seatId, accompliceSeatId: null, method: "", motive: "", opportunity: "", evidenceIds: [evidenceId], testimonyIds: [] };
    session = await endActivity(db, provider, session, "continuance-end-investigation");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "continuance-file-1", action: "file_theory", theory }, runtime(provider));
    assert.equal(session.formatState.format, "whodunnit");
    const testimonyId = session.formatState.court!.activeTestimonyId!;
    const exactQuote = session.formatState.testimony.find((item) => item.id === testimonyId)!.exactQuote;
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "continuance-press", action: "court_press", testimonyId }, runtime(provider));
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).at(-1)!.payload.exactQuote, exactQuote);
    for (let index = 0; index < 3; index += 1) {
      session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: `continuance-fail-${index}`, action: "court_present", testimonyId, evidenceId }, runtime(provider));
    }
    assert.equal(session.formatState.format, "whodunnit");
    assert.equal(session.formatState.playPhase, "continuance");
    assert.equal(session.formatState.actionsRemaining, 3);
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "continuance-file-2", action: "file_theory", theory }, runtime(provider));
    assert.equal(session.formatState.format, "whodunnit");
    const secondTestimonyId = session.formatState.court!.activeTestimonyId!;
    for (let index = 0; index < 3; index += 1) {
      session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: `terminal-fail-${index}`, action: "court_present", testimonyId: secondTestimonyId, evidenceId }, runtime(provider));
    }
    assert.equal(session.status, "completed");
    assert.equal(session.formatState.format, "whodunnit");
    assert.equal(session.formatState.verdict?.grade, "incorrect");
    assert.equal(session.formatState.continuanceUsed, true);
  });

  it("keeps a hard-muted suspect solvable through the frozen recorded statement", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-create-muted", runtime(provider));
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    const culprit = bible.suspects.find((suspect) => suspect.seatId === bible.culpritSeatId)!;
    const stored = structuredClone(session);
    stored.powerPlan.bots[culprit.botId] = {
      ...(stored.powerPlan.bots[culprit.botId] ?? { botId: culprit.botId, effects: [] }),
      hardMuted: true,
    };
    db.prepare("UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = 'user-1'").run(JSON.stringify(stored), session.id);
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "muted-travel", action: "travel", roomId: culprit.roomId }, runtime(provider));
    session = await beginInterview(db, provider, session, culprit.seatId, "muted-begin-interview");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "muted-interview", action: "interview", suspectSeatId: culprit.seatId, question: "State your alibi." }, runtime(provider));
    assert.equal(session.formatState.format, "whodunnit");
    assert.equal(session.formatState.testimony.some((item) => item.speakerSeatId === culprit.seatId), true);
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).at(-1)!.payload.answer, "...");
    assert.equal(provider.actorCalls, 0);
    assert.equal(validateDebateMysteryCaseBible(bible, session.formatState.config.actionBudget).valid, true);
  });

  it("keeps notebook edits private and cleanup proposal-only until approval", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-create-0003", runtime(provider));
    const initial = getDebateMysteryNotebook(db, "user-1", session.id).notebook;
    const page: DebateMysteryNotebookPageV1 = {
      ...initial.pages[0]!,
      blocks: [
        { id: "note-block-1", kind: "paragraph", text: "Maybe Actor 2 did not enter the room." },
        { id: "note-block-2", kind: "quote", text: "“I never touched it.”" },
      ],
    };
    const edited = patchDebateMysteryNotebook(db, "user-1", session.id, { expectedRevision: initial.revision, idempotencyKey: "notebook-edit-0001", operation: "replace", pages: [page] });
    assert.equal(edited.notebook.revision, 2);
    const replayedEdit = patchDebateMysteryNotebook(db, "user-1", session.id, { expectedRevision: initial.revision, idempotencyKey: "notebook-edit-0001", operation: "replace", pages: [page] });
    assert.equal(replayedEdit.notebook.revision, 2);
    const proposal = await proposeDebateMysteryNotebookCleanup(db, "user-1", session.id, {
      expectedRevision: 2,
      pageIds: [page.id],
      blockIds: ["note-block-1"],
    }, runtime(provider));
    assert.equal(provider.cleanupCalls, 1);
    assert.deepEqual(
      proposal.pages[0]!.proposedBlocks.map((block) => block.sourceBlockIds),
      [["note-block-1"], ["note-block-2"]],
    );
    assert.equal(proposal.pages[0]!.proposedBlocks[1]!.text, "“I never touched it.”");
    assert.equal(getDebateMysteryNotebook(db, "user-1", session.id).notebook.revision, 2);
    const accepted = patchDebateMysteryNotebook(db, "user-1", session.id, { expectedRevision: 2, idempotencyKey: "notebook-clean-0001", operation: "accept_cleanup", proposalId: proposal.id });
    assert.equal(accepted.notebook.revision, 3);
    assert.equal(accepted.notebook.pages[0]!.blocks[1]!.text, "“I never touched it.”");
    const rejectedProposal = await proposeDebateMysteryNotebookCleanup(db, "user-1", session.id, {
      expectedRevision: 3,
      pageIds: [page.id],
    }, runtime(provider));
    const rejected = patchDebateMysteryNotebook(db, "user-1", session.id, { expectedRevision: 3, idempotencyKey: "notebook-reject-0001", operation: "reject_cleanup", proposalId: rejectedProposal.id });
    assert.equal(rejected.notebook.revision, 3);
    assert.equal(getDebateMysteryNotebook(db, "user-1", session.id).cleanupProposal, null);
    const undone = patchDebateMysteryNotebook(db, "user-1", session.id, { expectedRevision: 3, idempotencyKey: "notebook-undo-0001", operation: "undo" });
    assert.equal(undone.notebook.revision, 4);
    const sessionRow = db.prepare("SELECT session_json FROM debate_sessions WHERE id = ?").get(session.id) as { session_json: string };
    assert.equal(sessionRow.session_json.includes("Maybe Actor 2"), false);
    const code = debateMysteryCaseCodeForSession(db, "user-1", session.id);
    assert.equal(code.payload.includes("Maybe Actor 2"), false);
    assert.equal(inspectDebateMysteryCaseCode(code).seats.length, 4);
    assert.throws(
      () => inspectDebateMysteryCaseCode({ ...code, checksum: "0".repeat(64) }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
  });

  it("stores player-authored lead annotations against the public revision they saw", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-lead-note", runtime(provider));
    const initial = getDebateMysteryNotebook(db, "user-1", session.id).notebook;
    const lead = session.formatState.leads[0]!;
    const annotatedPage: DebateMysteryNotebookPageV1 = {
      ...initial.pages[0]!,
      blocks: [{
        id: "lead-note-1",
        kind: "paragraph",
        text: "This account may depend on the clock.",
        leadId: lead.id,
        leadRevision: lead.revision,
      }],
    };
    const edited = patchDebateMysteryNotebook(db, "user-1", session.id, {
      expectedRevision: initial.revision,
      idempotencyKey: "lead-note-edit",
      operation: "replace",
      pages: [annotatedPage],
    });
    assert.equal(edited.notebook.pages[0]!.blocks[0]!.leadId, lead.id);
    assert.equal(edited.notebook.pages[0]!.blocks[0]!.leadRevision, lead.revision);
    assert.throws(
      () => patchDebateMysteryNotebook(db, "user-1", session.id, {
        expectedRevision: edited.notebook.revision,
        idempotencyKey: "invalid-lead-note-edit",
        operation: "replace",
        pages: [{ ...annotatedPage, blocks: [{ ...annotatedPage.blocks[0]!, id: "lead-note-2", leadRevision: undefined }] }],
      }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
  });

  it("imports a valid Case Seed with remapped seats, a blank notebook, and no spoiler inspection", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const original = await createDebateMysterySession(db, "user-1", setup(db), "mystery-create-seed-source", runtime(provider));
    const code = debateMysteryCaseCodeForSession(db, "user-1", original.id);
    const inspection = inspectDebateMysteryCaseCode(code);
    assert.equal(JSON.stringify(inspection).includes("culpritSeatId"), false);
    assert.equal(JSON.stringify(inspection).includes("proofBundles"), false);
    const imported = await importDebateMysteryCase(db, "user-1", {
      caseCode: code,
      seatAssignments: inspection.seats.map((seat, index) => ({
        seatId: seat.seatId,
        botId: `bot-${index + 1}`,
      })),
      prosecutorPartnerBotId: "bot-5",
      rivalDefenseBotId: "bot-6",
      idempotencyKey: "mystery-seed-import-0001",
    }, runtime(provider));
    assert.equal(imported.formatState.format, "whodunnit");
    assert.equal(imported.formatState.suspects.length, 4);
    assert.deepEqual(
      getDebateMysteryNotebook(db, "user-1", imported.id).notebook.pages[0]!.blocks,
      [],
    );
    assert.equal(
      getDebateMysteryCaseBible(db, "user-1", imported.id).evidence.every((item) => item.imageId === null),
      true,
    );
  });

  it("keeps generator-v1 Case Seeds inspectable and importable after the dense-search upgrade", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const original = await createDebateMysterySession(db, "user-1", setup(db), "mystery-legacy-seed-source", runtime(provider));
    const currentCode = debateMysteryCaseCodeForSession(db, "user-1", original.id);
    const manifest = JSON.parse(
      inflateRawSync(Buffer.from(currentCode.payload, "base64url")).toString("utf8"),
    ) as { generatorVersion: number; case: { generatorVersion: number } };
    manifest.generatorVersion = 1;
    manifest.case.generatorVersion = 1;
    const payload = deflateRawSync(Buffer.from(JSON.stringify(manifest), "utf8")).toString("base64url");
    const legacyCode = {
      ...currentCode,
      generatorVersion: 1,
      payload,
      checksum: createHash("sha256").update(payload).digest("hex"),
    };
    const inspection = inspectDebateMysteryCaseCode(legacyCode);
    assert.equal(inspection.generatorVersion, 1);
    const imported = await importDebateMysteryCase(db, "user-1", {
      caseCode: legacyCode,
      seatAssignments: inspection.seats.map((seat, index) => ({ seatId: seat.seatId, botId: `bot-${index + 1}` })),
      prosecutorPartnerBotId: "bot-5",
      rivalDefenseBotId: "bot-6",
      idempotencyKey: "mystery-legacy-seed-import-0001",
    }, runtime(provider));
    assert.equal(getDebateMysteryCaseBible(db, "user-1", imported.id).generatorVersion, 1);
    assert.match(getDebateMysteryCaseBible(db, "user-1", imported.id).caseSeed, /^case-v1-/u);
  });

  it("resumes an interrupted compiler from the persisted frozen config", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const compiled = await createDebateMysterySession(db, "user-1", setup(db), "mystery-resumable-key", runtime(provider));
    db.prepare("DELETE FROM debate_mystery_cases WHERE session_id = ? AND user_id = 'user-1'").run(compiled.id);
    const interrupted = {
      ...compiled,
      status: "live" as const,
      stepKey: "mystery_hiding_evidence",
      formatState: compiled.formatState.format === "whodunnit" ? {
        ...compiled.formatState,
        compileStage: "hiding_evidence" as const,
        playPhase: "compiling" as const,
        rooms: [],
        suspects: [],
      } : compiled.formatState,
    };
    db.prepare("UPDATE debate_sessions SET status = 'live', step_key = ?, session_json = ? WHERE id = ? AND user_id = 'user-1'").run(interrupted.stepKey, JSON.stringify(interrupted), compiled.id);
    const resumed = await resumeDebateMysteryCompilation(db, "user-1", compiled.id, runtime(provider));
    assert.equal(resumed.formatState.format, "whodunnit");
    assert.equal(resumed.formatState.playPhase, "investigation");
    assert.equal(resumed.formatState.rooms.length, 5);
    assert.equal(getDebateMysteryCaseBible(db, "user-1", resumed.id).proofBundles.length, 3);
  });
});
