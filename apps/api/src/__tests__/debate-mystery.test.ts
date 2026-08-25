import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type {
  DebateSessionV1,
  DebateMysteryNotebookPageV1,
  DebateWhodunnitCreateConfigV1,
} from "@localai/shared";
import {
  botPowerIntendedSpeechLooksGibberishV1,
  debateMysteryTheoryClaimOptions,
  debateSpokenText,
  validateDebateMysteryCaseBible,
} from "@localai/shared";
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
  reuseDebateMysteryExhibitEvidence,
  resolveDebateMysteryQuestionMentions,
  resumeDebateMysteryCompilation,
} from "../debate-mystery.ts";
import {
  getDebateSession,
  mysteryCourtContradictionPairMatches,
  submitDebateTurnaboutAction,
  type DebateAiRuntime,
} from "../debate.ts";
import {
  bakeDebateSpectatorSession,
  debateSessionSupportsFullBake,
} from "../live-bake.ts";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";
import { HttpError } from "../utils.http.ts";

const NOW = "2026-08-20T19:00:00.000Z";
const debateSource = readFileSync(
  fileURLToPath(new URL("../debate.ts", import.meta.url)),
  "utf8",
);
const debateMysterySource = readFileSync(
  fileURLToPath(new URL("../debate-mystery.ts", import.meta.url)),
  "utf8",
);

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
    if (prompt.includes('Return JSON only: {"content":"your public statement"')) {
      return JSON.stringify({
        content: "I will stay with the frozen public record and test the testimony against it.",
        deliveryCue: null,
      });
    }
    if (prompt.includes('Return JSON only: {"surprised":true|false')) {
      return JSON.stringify({
        surprised: false,
        botId: "",
        expected: "",
        reaction: "",
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

async function bakeMysteryCourtToPlayerAction(
  db: DatabaseSync,
  provider: MysteryProviderStub,
  session: DebateSessionV1,
  keyPrefix: string,
): Promise<DebateSessionV1> {
  assert.equal(debateSessionSupportsFullBake(session), true);
  const baked = await bakeDebateSpectatorSession({
    db,
    userId: "user-1",
    sessionId: session.id,
    resolveRuntime: async () => runtime(provider),
    plannedSynthesisEngine: "local",
  });
  const current = baked.session;
  assert.equal(
    baked.artifact.status,
    "ready",
    `${keyPrefix}: ${JSON.stringify({ status: current.status, stepKey: current.stepKey, error: current.error })}`,
  );
  assert.equal(current.format, "turnabout");
  assert.equal(current.formatState.format, "turnabout");
  assert.ok(current.formatState.mysteryTrial);
  assert.equal(current.status, "waiting_for_player");
  assert.equal(current.stepKey, "turnabout_action");
  return current;
}

describe("Debate Whodunnit private/public boundary", () => {
  it("uses courtroom party language and a deterministic public Judge verdict", () => {
    assert.match(
      debateMysterySource,
      /call them 'the accused' or 'the defendant'; never call them 'my client'/u,
    );
    assert.match(
      debateMysterySource,
      /Refer to the charged person only as 'my client'/u,
    );
    assert.match(
      debateMysterySource,
      /My client asks the court to judge only what this admissible record actually proves/u,
    );
    assert.match(debateSource, /mystery_turnabout_verdict/u);
    assert.match(debateSource, /speakerKind: "moderator"/u);
    assert.match(debateSource, /speakerBotId: session\.moderator\.id/u);
    assert.match(
      debateSource,
      /const courtroomVerdict: "Guilty" \| "Not Guilty" =\s*graded\.grade === "incorrect" \? "Not Guilty" : "Guilty"/u,
    );
    assert.match(debateSource, /\$\{courtroomVerdict\}/u);
    assert.match(
      debateSource,
      /Do not describe either side as winning, carrying, prevailing, or winning a debate or Turnabout/u,
    );
  });

  it("lets the player own the mansion or inherit a deterministic partner-built court record", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const config = setup(db);

    let manual = await createDebateMysterySession(
      db,
      "user-1",
      config,
      "mystery-assignment-manual-create",
      runtime(provider),
    );
    assert.equal(manual.formatState.investigationApproach, "undecided");
    const manualBudget = manual.formatState.actionsRemaining;
    manual = await applyDebateMysteryAction(db, "user-1", manual.id, {
      expectedRevision: manual.revision,
      idempotencyKey: "mystery-assignment-manual",
      action: "choose_investigation_path",
      path: "player",
    }, runtime(provider));
    assert.equal(manual.format, "whodunnit");
    assert.equal(manual.formatState.investigationApproach, "player");
    assert.equal(manual.formatState.actionsRemaining, manualBudget);
    assert.deepEqual(
      listDebateMysteryActions(db, "user-1", manual.id).map((entry) => entry.action),
      ["choose_investigation_path"],
    );

    let delegated = await createDebateMysterySession(
      db,
      "user-1",
      config,
      "mystery-assignment-partner-create",
      runtime(provider),
    );
    const delegatedRequest = {
      expectedRevision: delegated.revision,
      idempotencyKey: "mystery-assignment-partner",
      action: "choose_investigation_path" as const,
      path: "partner" as const,
    };
    const bible = getDebateMysteryCaseBible(db, "user-1", delegated.id);
    const strongCase = bible.proofBundles.find((bundle) => bundle.id === "strong-case")!;
    delegated = await applyDebateMysteryAction(
      db,
      "user-1",
      delegated.id,
      delegatedRequest,
      runtime(provider),
    );
    assert.equal(delegated.format, "turnabout");
    assert.equal(delegated.phase, "opening");
    assert.equal(delegated.stepKey, "turnabout_intro");
    assert.equal(delegated.formatState.format, "turnabout");
    const frozen = delegated.formatState.mysteryTrial?.frozenInvestigation;
    assert.ok(frozen);
    assert.equal(frozen.investigationApproach, "partner");
    assert.equal(frozen.playPhase, "trial");
    assert.equal(frozen.actionsRemaining, 0);
    assert.equal(frozen.theory?.culpritSeatId, bible.culpritSeatId);
    assert.equal(frozen.theory?.accompliceSeatId, null);
    assert.deepEqual(frozen.theory?.evidenceIds, strongCase.requiredEvidenceIds);
    assert.deepEqual(frozen.theory?.testimonyIds, strongCase.requiredTestimonyIds);
    assert.ok(strongCase.requiredEvidenceIds.every((id) =>
      frozen.discoveredEvidence.some((item) => item.id === id)));
    assert.ok(strongCase.requiredTestimonyIds.every((id) =>
      frozen.testimony.some((item) => item.id === id && item.discovered)));
    assert.ok(frozen.metSuspectSeatIds.includes(bible.culpritSeatId));
    assert.match(frozen.partnerJournal.at(-1) ?? "", /filed charges/iu);
    assert.ok(delegated.evidence.exhibits.length > 0);
    assert.ok(delegated.evidence.sources.length > 0);
    for (const hiddenKey of ["actorKnowledge", "proofBundles", "factTags", "hidingMechanism", "isCanonicalWeapon"]) {
      assert.equal(JSON.stringify(delegated).includes(hiddenKey), false, hiddenKey);
    }
    assert.deepEqual(
      listDebateMysteryActions(db, "user-1", delegated.id).map((entry) => entry.action),
      ["choose_investigation_path"],
    );
    const replay = await applyDebateMysteryAction(
      db,
      "user-1",
      delegated.id,
      delegatedRequest,
      runtime(provider),
    );
    assert.equal(replay.revision, delegated.revision);
  });

  it("isolates each suspect's interview history unless the investigator explicitly discloses testimony", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(
      db,
      "user-1",
      setup(db),
      "mystery-private-interviews",
      runtime(provider),
    );
    const [firstSuspect, secondSuspect] = session.formatState.suspects;
    assert.ok(firstSuspect);
    assert.ok(secondSuspect);

    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "private-interview-travel-first",
      action: "travel",
      roomId: firstSuspect.roomId,
    }, runtime(provider));
    session = await beginInterview(
      db,
      provider,
      session,
      firstSuspect.seatId,
      "private-interview-open-first",
    );
    provider.actorReply = "I privately remember a silver umbrella beneath the midnight clock.";
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "private-interview-first-answer",
      action: "interview",
      suspectSeatId: firstSuspect.seatId,
      question: "What do you remember?",
      evidenceId: null,
    }, runtime(provider));
    const firstAnswer = session.formatState.interviewLog.at(-1)!.content;
    provider.actorReply = "That private answer has not changed.";
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "private-interview-first-followup",
      action: "interview",
      suspectSeatId: firstSuspect.seatId,
      question: "Are you certain?",
      evidenceId: null,
    }, runtime(provider));
    assert.ok(provider.actorPrompts.at(-1)?.includes(firstAnswer));
    const firstFollowupAnswer = session.formatState.interviewLog.at(-1)!.content;
    const firstTestimony = session.formatState.testimony.find(
      (entry) => entry.speakerSeatId === firstSuspect.seatId,
    )!;

    session = await endActivity(
      db,
      provider,
      session,
      "private-interview-close-first",
    );
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "private-interview-travel-second",
      action: "travel",
      roomId: secondSuspect.roomId,
    }, runtime(provider));
    session = await beginInterview(
      db,
      provider,
      session,
      secondSuspect.seatId,
      "private-interview-open-second",
    );
    provider.actorReply = "I can answer only for myself.";
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "private-interview-second-answer",
      action: "interview",
      suspectSeatId: secondSuspect.seatId,
      question: "What do you know?",
      evidenceId: null,
    }, runtime(provider));
    const isolatedPrompt = provider.actorPrompts.at(-1)!;
    assert.match(isolatedPrompt, /This suspect interview is private and isolated/u);
    assert.equal(isolatedPrompt.includes(firstAnswer), false);
    assert.equal(isolatedPrompt.includes(firstFollowupAnswer), false);
    assert.equal(isolatedPrompt.includes(firstTestimony.exactQuote), false);

    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "private-interview-explicit-disclosure",
      action: "interview",
      suspectSeatId: secondSuspect.seatId,
      question: `Respond to [[mystery:testimony:${firstTestimony.id}]].`,
      evidenceId: null,
    }, runtime(provider));
    assert.ok(provider.actorPrompts.at(-1)?.includes(firstTestimony.exactQuote));
  });

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

  it("charges each committed search pass and question while view navigation stays free", async () => {
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
    session = getDebateSession(db, "user-1", session.id);
    assert.equal(session.formatState.activeActivity?.kind, "investigation");
    if (session.formatState.activeActivity?.kind === "investigation") {
      assert.equal(session.formatState.activeActivity.actionCommitted, true);
    }
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).at(-1)?.payload.cost, 1);
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
    const includedRegionId = session.formatState.rooms.find((room) => room.id === suspectRoom.id)!.activeRegionIds.find((regionId) =>
      regionId !== suspectRegionId &&
      !bible.actionTokens?.some((token) => token.roomId === suspectRoom.id && token.regionId === regionId))!;
    const beforeIncludedInspection = session.formatState.actionsRemaining;
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "suspect-room-inspect-included",
      action: "inspect",
      roomId: suspectRoom.id,
      regionId: includedRegionId,
    }, runtime(provider));
    assert.equal(session.formatState.actionsRemaining, beforeIncludedInspection);
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).at(-1)?.payload.cost, 0);
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
    assert.equal(session.formatState.activeActivity?.kind, "investigation");
    if (session.formatState.activeActivity?.kind === "investigation") {
      assert.equal(session.formatState.activeActivity.actionCommitted, false);
    }
    const reentryRegionId = session.formatState.rooms.find((room) => room.id === suspectRoom.id)!.activeRegionIds.find((regionId) =>
      regionId !== suspectRegionId &&
      regionId !== includedRegionId &&
      !bible.actionTokens?.some((token) => token.roomId === suspectRoom.id && token.regionId === regionId))!;
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "suspect-room-reentry-commit",
      action: "inspect",
      roomId: suspectRoom.id,
      regionId: reentryRegionId,
    }, runtime(provider));
    assert.equal(session.formatState.actionsRemaining, beforeInvestigationReentry - 1);
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).at(-1)?.payload.cost, 1);
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
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    const exhausted = structuredClone(session);
    exhausted.formatState.actionsRemaining = 1;
    db.prepare("UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = 'user-1'")
      .run(JSON.stringify(exhausted), session.id);
    session = exhausted;
    session = await beginInvestigation(db, provider, session, roomId, "exhaust-begin");
    const paidRegionId = session.formatState.rooms.find((room) => room.id === roomId)!.activeRegionIds.find((regionId) =>
      !session.formatState.rooms.find((room) => room.id === roomId)!.inspectedRegionIds.includes(regionId) &&
      !bible.actionTokens?.some((token) => token.roomId === roomId && token.regionId === regionId))!;
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "exhaust-last-inspection",
      action: "inspect",
      roomId,
      regionId: paidRegionId,
    }, runtime(provider));

    assert.equal(session.formatState.actionsRemaining, 0);
    assert.equal(session.formatState.activeActivity?.kind, "investigation");
    assert.equal(session.formatState.playPhase, "investigation");

    const includedRegionId = session.formatState.rooms.find((room) => room.id === roomId)!.activeRegionIds.find((regionId) =>
      !session.formatState.rooms.find((room) => room.id === roomId)!.inspectedRegionIds.includes(regionId) &&
      !bible.actionTokens?.some((token) => token.roomId === roomId && token.regionId === regionId))!;
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "exhaust-extra-inspection",
      action: "inspect",
      roomId,
      regionId: includedRegionId,
    }, runtime(provider));
    assert.equal(session.formatState.actionsRemaining, 0);
    assert.equal(listDebateMysteryActions(db, "user-1", session.id).at(-1)?.payload.cost, 0);

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

  it("charges one search commitment across rapid clicks on different hotspots", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-search-pass-race", runtime(provider));
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    const room = session.formatState.rooms.find((entry) => entry.id === session.formatState.currentRoomId)!;
    const regionIds = room.activeRegionIds.filter((regionId) =>
      !room.inspectedRegionIds.includes(regionId) &&
      !bible.actionTokens?.some((token) => token.roomId === room.id && token.regionId === regionId)).slice(0, 2);
    assert.equal(regionIds.length, 2);
    session = await beginInvestigation(db, provider, session, room.id, "search-pass-race-begin");
    const actionsBefore = session.formatState.actionsRemaining;
    const requestInspection = (idempotencyKey: string, regionId: string) => applyDebateMysteryAction(
      db,
      "user-1",
      session.id,
      {
        expectedRevision: session.revision,
        idempotencyKey,
        action: "inspect" as const,
        roomId: room.id,
        regionId,
      },
      runtime(provider),
    );

    const results = await Promise.allSettled([
      requestInspection("search-pass-race-a", regionIds[0]!),
      requestInspection("search-pass-race-b", regionIds[1]!),
    ]);
    const first = results.find((result): result is PromiseFulfilledResult<DebateSessionV1> => result.status === "fulfilled")?.value;
    const staleIndex = results.findIndex((result) => result.status === "rejected");
    assert.ok(first);
    assert.notEqual(staleIndex, -1);
    assert.equal(session.formatState.actionsRemaining, actionsBefore);
    const retried = await applyDebateMysteryAction(db, "user-1", first.id, {
      expectedRevision: first.revision,
      idempotencyKey: "search-pass-race-retry",
      action: "inspect",
      roomId: room.id,
      regionId: regionIds[staleIndex]!,
    }, runtime(provider));

    assert.equal(retried.formatState.actionsRemaining, actionsBefore - 1);
    assert.deepEqual(
      listDebateMysteryActions(db, "user-1", session.id)
        .filter((entry) => entry.action === "inspect")
        .slice(-2)
        .map((entry) => entry.payload.cost),
      [1, 0],
    );
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
    assert.deepEqual(discoveredBox.accessTargets, [], "portable containers should expose their lock only in inventory");

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

  it("deterministically recasts synthesized exhibits as supporting evidence without importing their old meaning", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-create-reused-props", runtime(provider));
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    const candidates = [{
      id: "asset-crimson-ledger",
      adjective: "crimson",
      object: "ledger",
      title: "Crimson ledger",
      emoji: "📕",
      imageId: "image-crimson-ledger",
      keywords: ["paper", "ledger", "debate", "old-argument"],
    }, {
      id: "asset-brass-compass",
      adjective: "brass",
      object: "compass",
      title: "Brass compass",
      emoji: "🧭",
      imageId: "image-brass-compass",
      keywords: ["metal", "navigation", "debate"],
    }];
    const first = reuseDebateMysteryExhibitEvidence(bible, candidates);
    const second = reuseDebateMysteryExhibitEvidence(bible, candidates);
    assert.deepEqual(first, second);
    assert.equal(first.evidence.find((item) => item.isCanonicalWeapon)?.imageId, null);
    const reused = first.evidence.filter((item) => item.imageId?.startsWith("image-"));
    assert.equal(reused.length, 2);
    for (const item of reused) {
      const original = bible.evidence.find((candidate) => candidate.id === item.id)!;
      assert.deepEqual(item.factTags, original.factTags);
      assert.equal(item.relation, original.relation);
      assert.equal(item.roomId, original.roomId);
      assert.equal(item.regionId, original.regionId);
      assert.notEqual(item.observation, original.observation);
    }
  });

  it("keeps synthesized exhibit reuse off by default and draws only after the setting is enabled", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const config = setup(db);
    db.prepare(
      `INSERT INTO images
         (id, user_id, origin, prompt, url, provider, model, purpose, local_rel_path, created_at)
       VALUES ('image-reusable-ledger', 'user-1', 'debate', ?, '', 'openai',
               'gpt-image-1', 'debate_exhibit', ?, ?)`,
    ).run(
      'Create one evidence exhibit sprite depicting exactly: "Crimson ledger".',
      'generated-images/user-1/image-reusable-ledger.png',
      NOW,
    );
    db.prepare(
      `INSERT INTO debate_sessions
         (id, user_id, status, phase, step_key, player_role,
          create_idempotency_key, motion, session_json, created_at, updated_at)
       VALUES ('debate-prior-exhibit', 'user-1', 'completed', 'verdict',
               'completed', 'spectator', 'prior-exhibit-key', 'An old motion', ?, ?, ?)`,
    ).run(JSON.stringify({
      evidence: {
        exhibits: [{
          id: "exhibit-ledger",
          adjective: "crimson",
          object: "ledger",
          title: "Crimson ledger",
          emoji: "📕",
          imageId: "image-reusable-ledger",
          observation: "This old Debate claim must never become a case fact.",
        }],
      },
    }), NOW, NOW);

    const disabled = await createDebateMysterySession(
      db,
      "user-1",
      config,
      "mystery-reuse-disabled",
      runtime(provider),
    );
    assert.equal(
      getDebateMysteryCaseBible(db, "user-1", disabled.id).evidence.some((item) => item.imageId),
      false,
    );

    db.prepare(
      "UPDATE users SET debate_whodunnit_reuse_synthesized_exhibits = 1 WHERE id = 'user-1'",
    ).run();
    const enabled = await createDebateMysterySession(
      db,
      "user-1",
      config,
      "mystery-reuse-enabled",
      runtime(provider),
    );
    const enabledBible = getDebateMysteryCaseBible(db, "user-1", enabled.id);
    const reused = enabledBible.evidence.find((item) => item.imageId === "image-reusable-ledger");
    assert.ok(reused);
    assert.equal(reused.title, "Crimson ledger");
    assert.equal(reused.isCanonicalWeapon, false);
    assert.doesNotMatch(reused.observation, /old Debate claim/iu);
  });

  it("compiles a Compact LOCAL case without placing hidden truth in session_json", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-create-0001", runtime(provider));
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    assert.equal(session.format, "whodunnit");
    assert.equal(session.playerRole, "participant");
    assert.equal(session.playerSideId, "for");
    assert.equal(session.participation?.difficulty, "standard");
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

  it("freezes Participant or Spectator while keeping a separately cast public Judge away from sealed truth", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const config = setup(db);
    seedBot(db, "bot-7", 7);
    config.judgeBotId = "bot-7";
    const spectator = await createDebateMysterySession(
      db,
      "user-1",
      config,
      "mystery-spectator-role",
      runtime(provider),
      { playerRole: "spectator", participationDifficulty: "immersive" },
    );
    assert.equal(spectator.playerRole, "spectator");
    assert.equal(spectator.playerSideId, null);
    assert.equal(spectator.participation, null);
    assert.equal(spectator.moderator.id, "bot-7");
    assert.equal(spectator.moderator.name, "Actor 7");
    assert.equal(spectator.formatState.format, "whodunnit");
    assert.equal(spectator.formatState.config.judgeBotId, "bot-7");
    const publicRow = db.prepare(
      "SELECT session_json FROM debate_sessions WHERE id = ?",
    ).get(spectator.id) as { session_json: string };
    assert.equal(publicRow.session_json.includes("culpritSeatId"), false);
    await assert.rejects(
      () => createDebateMysterySession(
        db,
        "user-1",
        config,
        "mystery-judge-role",
        runtime(provider),
        { playerRole: "judge" },
      ),
      /Participant or Spectator.*Judge seat/iu,
    );
  });

  it("freezes shared court formality and Jury rules across create, Case Seed import, and resume", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const config = {
      ...setup(db),
      formality: "heated" as const,
      juryEnabled: true,
      playerRole: "participant" as const,
      participationDifficulty: "coach" as const,
    };
    const created = await createDebateMysterySession(
      db,
      "user-1",
      config,
      "mystery-court-rules-create",
      runtime(provider),
      {
        moderatorTitle: "Keeper of the Truth",
        forTeamName: "The Seekers",
        againstTeamName: "The Doubters",
      },
    );
    assert.equal(created.formatState.format, "whodunnit");
    assert.equal(created.formatState.config.formality, "heated");
    assert.equal(created.formatState.config.juryEnabled, true);
    assert.equal(created.formatState.config.playerRole, "participant");
    assert.equal(created.formatState.config.participationDifficulty, "coach");
    assert.equal(created.formality, "heated");
    assert.equal(created.jury.enabled, true);
    assert.equal(created.participation?.difficulty, "coach");
    assert.equal(created.moderatorName, "PRISM");
    assert.equal(created.moderatorTitle, "Keeper of the Truth");
    assert.equal(created.motion.forSide.label, "The Seekers");
    assert.equal(created.motion.againstSide.label, "The Doubters");
    const code = debateMysteryCaseCodeForSession(db, "user-1", created.id);
    const inspection = inspectDebateMysteryCaseCode(code);
    const imported = await importDebateMysteryCase(db, "user-1", {
      caseCode: code,
      seatAssignments: inspection.seats.map((seat, index) => ({ seatId: seat.seatId, botId: `bot-${index + 1}` })),
      prosecutorPartnerBotId: "bot-5",
      rivalDefenseBotId: "bot-6",
      formality: "parliamentary",
      juryEnabled: false,
      moderatorName: "Justice Nova",
      moderatorTitle: "Speaker of the House",
      forTeamName: "The Finders",
      againstTeamName: "The Skeptics",
      idempotencyKey: "mystery-court-rules-import",
    }, runtime(provider));
    assert.equal(imported.formality, "parliamentary");
    assert.equal(imported.jury.enabled, false);
    assert.equal(imported.formatState.format, "whodunnit");
    assert.equal(imported.formatState.config.formality, "parliamentary");
    assert.equal(imported.formatState.config.juryEnabled, false);
    assert.equal(imported.formatState.config.playerRole, "participant");
    assert.equal(imported.formatState.config.participationDifficulty, "coach");
    assert.equal(imported.participation?.difficulty, "coach");
    assert.equal(imported.moderatorName, "PRISM");
    assert.equal(imported.moderatorTitle, "Speaker of the House");
    assert.equal(imported.motion.forSide.label, "The Finders");
    assert.equal(imported.motion.againstSide.label, "The Skeptics");
    db.prepare("DELETE FROM debate_mystery_cases WHERE session_id = ? AND user_id = 'user-1'").run(created.id);
    const interrupted = {
      ...created,
      status: "live" as const,
      stepKey: "mystery_hiding_evidence",
      formatState: created.formatState.format === "whodunnit"
        ? { ...created.formatState, compileStage: "hiding_evidence" as const, playPhase: "compiling" as const, rooms: [], suspects: [] }
        : created.formatState,
    };
    db.prepare("UPDATE debate_sessions SET status = 'live', step_key = ?, session_json = ? WHERE id = ? AND user_id = 'user-1'").run(interrupted.stepKey, JSON.stringify(interrupted), created.id);
    const resumed = await resumeDebateMysteryCompilation(db, "user-1", created.id, runtime(provider));
    assert.equal(resumed.formality, "heated");
    assert.equal(resumed.jury.enabled, true);
    assert.equal(resumed.formatState.format, "whodunnit");
    assert.equal(resumed.formatState.config.formality, "heated");
    assert.equal(resumed.formatState.config.juryEnabled, true);
    assert.equal(resumed.formatState.config.playerRole, "participant");
    assert.equal(resumed.formatState.config.participationDifficulty, "coach");
    assert.equal(resumed.participation?.difficulty, "coach");
    assert.equal(resumed.moderatorName, "PRISM");
    assert.equal(resumed.motion.forSide.label, "The Seekers");
    assert.equal(resumed.motion.againstSide.label, "The Doubters");
  });

  it("admits no scene testimony without an interview and lets an unanswered defendant denial stand", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(
      db,
      "user-1",
      setup(db),
      "mystery-no-interview-testimony",
      runtime(provider),
      { playerRole: "participant", participationDifficulty: "coach" },
    );
    assert.equal(session.formatState.format, "whodunnit");
    const crimeScene = session.formatState.rooms.find(
      (room) => room.id === session.formatState.crimeSceneRoomId,
    )!;
    session = await beginInvestigation(
      db,
      provider,
      session,
      crimeScene.id,
      "no-testimony-begin-investigation",
    );
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "no-testimony-inspect",
      action: "inspect",
      roomId: crimeScene.id,
      regionId: crimeScene.activeRegionId!,
    }, runtime(provider));
    session = await endActivity(
      db,
      provider,
      session,
      "no-testimony-end-investigation",
    );
    assert.equal(session.formatState.format, "whodunnit");
    const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
    const accused = session.formatState.suspects.find(
      (suspect) => suspect.seatId === bible.culpritSeatId,
    )!;
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "no-testimony-travel",
      action: "travel",
      roomId: accused.roomId,
    }, runtime(provider));
    session = await beginInterview(
      db,
      provider,
      session,
      accused.seatId,
      "no-testimony-meet-accused",
    );
    session = await endActivity(
      db,
      provider,
      session,
      "no-testimony-leave-accused",
    );
    assert.equal(session.formatState.format, "whodunnit");
    assert.equal(session.formatState.testimony.length, 0);
    const claims = debateMysteryTheoryClaimOptions(session.formatState);
    session = await applyDebateMysteryAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "no-testimony-file",
      action: "file_theory",
      theory: {
        culpritSeatId: accused.seatId,
        accompliceSeatId: null,
        method: claims.method[0]!.value,
        motive: claims.motive[0]!.value,
        opportunity: claims.opportunity[0]!.value,
        evidenceIds: [session.formatState.discoveredEvidence[0]!.id],
        testimonyIds: [],
      },
    }, runtime(provider));
    assert.equal(session.formatState.format, "turnabout");
    assert.deepEqual(session.formatState.mysteryTrial!.testimonySourceMap, {});
    assert.equal(session.evidence.sources.length, 0);
    session = await bakeMysteryCourtToPlayerAction(
      db,
      provider,
      session,
      "no-testimony-court",
    );
    assert.equal(session.formatState.format, "turnabout");
    const denial = session.formatState.statements.find(
      (statement) =>
        statement.recordTestimonyId === "mystery-defendant-denial",
    );
    assert.ok(denial);
    assert.match(denial.content, new RegExp(accused.name, "u"));
    assert.match(denial.content, new RegExp(bible.victim.name, "u"));
    while (session.status === "waiting_for_player") {
      assert.equal(session.formatState.format, "turnabout");
      session = await submitDebateTurnaboutAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: `no-testimony-pass-${session.revision}`,
        action: "pass",
        statementId: session.formatState.activeStatementId!,
      }, runtime(provider));
    }
    assert.equal(session.status, "completed");
    assert.equal(session.winnerSideId, "against");
    assert.equal(session.formatState.format, "turnabout");
    assert.match(
      session.formatState.mysteryTrial?.verdict?.reason ?? "",
      /defendant's denial stands/iu,
    );
  });

  it("freezes only the public case record and earns a deterministic Lucky Break in real Turnabout", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", { ...setup(db), formality: "plainspoken", juryEnabled: false }, "mystery-create-0002", runtime(provider));
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
    const courtPromptStart = provider.prompts.length;
    assert.equal(session.formatState.format, "whodunnit");
    const claimOptions = debateMysteryTheoryClaimOptions(session.formatState);
    const method = claimOptions.method[0]!.value;
    const motive = claimOptions.motive[0]!.value;
    const opportunity = claimOptions.opportunity[0]!.value;
    const unseenSuspect = session.formatState.suspects.find((suspect) => suspect.seatId !== culprit.seatId)!;
    await assert.rejects(
      () => applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "mystery-file-unmet-suspect", action: "file_theory", theory: { culpritSeatId: unseenSuspect.seatId, accompliceSeatId: null, method, motive, opportunity, evidenceIds: [evidenceId], testimonyIds: [testimonyId] } }, runtime(provider)),
      /Interview the accused before filing charges/u,
    );
    await assert.rejects(
      () => applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "mystery-file-freeform", action: "file_theory", theory: { culpritSeatId: culprit.seatId, accompliceSeatId: null, method: "hand-authored method", motive, opportunity, evidenceIds: [evidenceId], testimonyIds: [testimonyId] } }, runtime(provider)),
      /Choose a method from the discovered record/u,
    );
    const investigationRoomImageId = "generated-investigation-room";
    const courtEvidenceImageId = "generated-court-evidence";
    const assetBearingSession = structuredClone(session);
    if (assetBearingSession.formatState.format !== "whodunnit") assert.fail("Expected an active Whodunnit investigation.");
    assetBearingSession.formatState.rooms[0]!.imageId = investigationRoomImageId;
    assetBearingSession.formatState.discoveredEvidence.find((item) => item.id === evidenceId)!.imageId = courtEvidenceImageId;
    db.prepare("UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = 'user-1'")
      .run(JSON.stringify(assetBearingSession), session.id);
    session = assetBearingSession;
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "mystery-file-0001", action: "file_theory", theory: { culpritSeatId: culprit.seatId, accompliceSeatId: null, method, motive, opportunity, evidenceIds: [evidenceId], testimonyIds: [testimonyId] } }, runtime(provider));
    assert.equal(session.format, "turnabout");
    assert.equal(session.formality, "plainspoken");
    assert.equal(session.jury.enabled, false);
    assert.equal(session.formatState.format, "turnabout");
    assert.ok(session.formatState.mysteryTrial);
    assert.equal(
      session.formatState.mysteryTrial.courtroomComposition
        .prosecutionCoCounsel.id,
      "bot-5",
    );
    assert.equal(
      session.formatState.mysteryTrial.courtroomComposition.defenseClient.id,
      culprit.botId,
    );
    assert.deepEqual(
      session.formatState.mysteryTrial.courtroomComposition.eligibleWitnesses.map(
        (witness) => witness.seatId,
      ),
      [culprit.seatId],
    );
    assert.equal(
      JSON.stringify(
        session.formatState.mysteryTrial.courtroomComposition,
      ).includes("systemPrompt"),
      false,
    );
    assert.equal(session.formatState.mysteryTrial.frozenInvestigation.theory?.culpritSeatId, culprit.seatId);
    assert.equal(session.formatState.mysteryTrial.frozenInvestigation.rooms.every((room) => room.imageId === null), true);
    assert.equal(session.formatState.mysteryTrial.frozenInvestigation.discoveredEvidence.find((item) => item.id === evidenceId)?.imageId, courtEvidenceImageId);
    assert.equal(session.evidence.exhibits.find((item) => item.imageId === courtEvidenceImageId)?.imageId, courtEvidenceImageId);
    assert.equal(JSON.stringify(session.formatState.mysteryTrial.frozenInvestigation).includes(investigationRoomImageId), false);
    assert.equal(session.motion.forSide.brief.includes(method), true);
    assert.equal(session.motion.forSide.brief.includes(motive), true);
    assert.equal(session.motion.forSide.brief.includes(opportunity), true);
    const publicSession = JSON.stringify(session);
    for (const hiddenKey of ["actorKnowledge", "proofBundles", "factTags", "hidingMechanism"]) {
      assert.equal(publicSession.includes(hiddenKey), false, hiddenKey);
    }
    const reloadedCourt = getDebateSession(db, "user-1", session.id);
    assert.equal(reloadedCourt.formatState.format, "turnabout");
    assert.equal(reloadedCourt.formatState.mysteryTrial?.frozenInvestigation.theory?.culpritSeatId, culprit.seatId);
    assert.equal(reloadedCourt.formatState.mysteryTrial?.frozenInvestigation.rooms.every((room) => room.imageId === null), true);
    assert.equal(reloadedCourt.evidence.exhibits.some((item) => item.imageId === courtEvidenceImageId), true);
    session = await bakeMysteryCourtToPlayerAction(db, provider, session, "mystery-court");
    assert.equal(session.formatState.format, "turnabout");
    const courtroomOpening = session.events.find(
      (event) => event.stepKey === "turnabout_intro" && event.kind === "intro",
    );
    assert.match(
      courtroomOpening?.content ?? "",
      /The Participant leads .* with .* at counsel table as co-counsel/iu,
    );
    assert.match(
      courtroomOpening?.content ?? "",
      new RegExp(
        `${session.againstAdvocate.name} leads .* for ${culprit.name}, the accused`,
        "iu",
      ),
    );
    assert.match(
      courtroomOpening?.content ?? "",
      /visible statement pauses until the Participant chooses Previous, Next, Press, Present, or Pass/iu,
    );
    const orderedStatements = session.formatState.statements
      .filter((statement) => statement.mysteryWitness)
      .sort(
        (left, right) =>
          left.mysteryWitness!.ordinal - right.mysteryWitness!.ordinal,
      );
    assert.equal(
      orderedStatements.length,
      session.evidence.sources.length + 1,
    );
    assert.equal(
      orderedStatements[0]?.mysteryWitness?.kind,
      "defendant_denial",
    );
    assert.deepEqual(
      orderedStatements.slice(1).map((statement) => ({
        recordTestimonyId: statement.recordTestimonyId,
        sourceId: statement.mysteryWitness?.sourceId,
        content: debateSpokenText(statement.content),
      })),
      session.evidence.sources.map((source) => ({
        recordTestimonyId:
          session.formatState.format === "turnabout"
            ? session.formatState.mysteryTrial!.testimonySourceMap[source.id]
            : null,
        sourceId: source.id,
        content: `${culprit.name}'s submitted testimony: “${source.snippet}”`,
      })),
    );
    const credibilityBeforePress =
      session.formatState.mysteryTrial!.credibilityRemaining;
    const eventsBeforeNavigation = session.events.length;
    const submittedStatement = orderedStatements[1]!;
    session = await submitDebateTurnaboutAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "mystery-focus-submitted",
      action: "focus_statement",
      statementId: submittedStatement.id,
    }, runtime(provider));
    assert.equal(session.formatState.format, "turnabout");
    assert.equal(session.formatState.activeStatementId, submittedStatement.id);
    assert.equal(session.events.length, eventsBeforeNavigation);
    assert.equal(
      session.formatState.mysteryTrial!.credibilityRemaining,
      credibilityBeforePress,
    );
    session = await submitDebateTurnaboutAction(db, "user-1", session.id, {
      expectedRevision: session.revision,
      idempotencyKey: "mystery-press-submitted",
      action: "press",
      statementId: submittedStatement.id,
    }, runtime(provider));
    assert.equal(session.formatState.format, "turnabout");
    assert.equal(session.formatState.activeStatementId, submittedStatement.id);
    assert.equal(
      session.formatState.statements.find(
        (statement) => statement.id === submittedStatement.id,
      )?.status,
      "pressed",
    );
    assert.equal(
      session.formatState.mysteryTrial!.credibilityRemaining,
      credibilityBeforePress,
    );
    assert.equal(session.events.length, eventsBeforeNavigation + 3);
    while (session.status === "waiting_for_player" && session.formatState.format === "turnabout") {
      const state = session.formatState;
      const statement = state.statements.find((item) => item.id === state.activeStatementId)!;
      const evidenceSourceId = Object.entries(state.mysteryTrial!.evidenceSourceMap)
        .find(([, canonicalId]) => canonicalId === evidenceId)?.[0];
      const action =
        (statement.recordTestimonyId === testimonyId ||
          statement.recordTestimonyId === "mystery-defendant-denial") &&
        evidenceSourceId
        ? "present_evidence" as const
        : "pass" as const;
      session = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: `mystery-turnabout-${session.revision}`,
          action,
          statementId: statement.id,
          ...(evidenceSourceId && action === "present_evidence" ? { evidenceSourceId } : {}),
        },
        runtime(provider),
      );
    }
    assert.equal(session.status, "completed");
    assert.equal(session.formatState.format, "turnabout");
    assert.equal(session.formatState.mysteryTrial?.verdict?.grade, "lucky_break");
    const publicVerdict = session.events.find(
      (event) => event.stepKey === "mystery_turnabout_verdict",
    );
    assert.equal(publicVerdict?.speakerKind, "moderator");
    assert.equal(publicVerdict?.speakerBotId, session.moderator.id);
    assert.match(publicVerdict?.content ?? "", /Judge: Guilty\./u);
    assert.doesNotMatch(publicVerdict?.content ?? "", /wins?(?: the)? (?:debate|turnabout)/iu);
    const closing = session.events.find(
      (event) => event.stepKey === "closing_moderator",
    );
    assert.match(closing?.content ?? "", /Guilty/u);
    assert.doesNotMatch(closing?.content ?? "", /wins?|prevails?|carries/iu);
    const actions = listDebateMysteryActions(db, "user-1", session.id);
    assert.deepEqual(actions.map((entry) => entry.action), ["begin_investigation", "inspect", "end_activity", "travel", "begin_interview", "interview", "end_activity", "file_theory"]);
    assert.equal(JSON.stringify(actions).includes("culpritSeatId"), true); // The filed accusation is public.
    assert.equal(JSON.stringify(actions).includes("proofBundles"), false);
    assert.equal(JSON.stringify(actions).includes("factTags"), false);
    const courtPrompts = provider.prompts.slice(courtPromptStart);
    assert.equal(courtPrompts.some((prompt) => prompt.includes("proofBundles")), false);
    assert.equal(
      courtPrompts.some((prompt) => prompt.includes("actorKnowledge")),
      false,
      courtPrompts.filter((prompt) => prompt.includes("actorKnowledge")).join("\n---\n"),
    );
  });

  it("grades only sealed statement/evidence pairs, never shared contradiction tags", () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const setupConfig = setup(db);
    return createDebateMysterySession(
      db,
      "user-1",
      setupConfig,
      "mystery-pair-key",
      runtime(provider),
    ).then((session) => {
      const bible = getDebateMysteryCaseBible(db, "user-1", session.id);
      const bundle = bible.proofBundles.find(
        (candidate) => candidate.requiredCourtContradictionId,
      )!;
      const evidenceId = bundle.requiredEvidenceIds[0]!;
      assert.equal(
        mysteryCourtContradictionPairMatches({
          bible,
          accusedSeatId: bundle.culpritSeatId,
          recordTestimonyId: bundle.requiredCourtContradictionId!,
          evidenceId,
        }),
        true,
      );
      const wrongEvidence = bible.evidence.find(
        (candidate) => !bundle.requiredEvidenceIds.includes(candidate.id),
      )!;
      assert.equal(
        mysteryCourtContradictionPairMatches({
          bible,
          accusedSeatId: bundle.culpritSeatId,
          recordTestimonyId: bundle.requiredCourtContradictionId!,
          evidenceId: wrongEvidence.id,
        }),
        false,
      );
    });
  });

  it("grounds exact quotes and permanently closes the case on the first credibility collapse", async () => {
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
    assert.equal(session.formatState.format, "whodunnit");
    const claimOptions = debateMysteryTheoryClaimOptions(session.formatState);
    const theory = { culpritSeatId: accused.seatId, accompliceSeatId: null, method: claimOptions.method[0]!.value, motive: claimOptions.motive[0]!.value, opportunity: claimOptions.opportunity[0]!.value, evidenceIds: [evidenceId], testimonyIds: [] };
    session = await endActivity(db, provider, session, "continuance-end-investigation");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "continuance-travel-accused", action: "travel", roomId: accused.roomId }, runtime(provider));
    session = await beginInterview(db, provider, session, accused.seatId, "continuance-meet-accused");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "continuance-question-accused", action: "interview", suspectSeatId: accused.seatId, question: "State your alibi for the record." }, runtime(provider));
    session = await endActivity(db, provider, session, "continuance-end-meeting");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "continuance-file-1", action: "file_theory", theory }, runtime(provider));
    assert.equal(session.formatState.format, "turnabout");
    const testimonySourceId = Object.keys(session.formatState.mysteryTrial!.testimonySourceMap)[0]!;
    const testimonyId = session.formatState.mysteryTrial!.testimonySourceMap[testimonySourceId]!;
    const testimonySource = session.evidence.sources.find((source) => source.id === testimonySourceId)!;
    const stagedCourt = structuredClone(session);
    assert.equal(stagedCourt.formatState.format, "turnabout");
    stagedCourt.status = "waiting_for_player";
    stagedCourt.phase = "challenge";
    stagedCourt.stepKey = "turnabout_action";
    stagedCourt.formatState = {
      ...stagedCourt.formatState,
      phase: "examination",
      activeStatementId: "irreversible-court-statement",
      floorOwnerBotId: stagedCourt.againstAdvocate.id,
      statements: [{
        id: "irreversible-court-statement",
        sideId: "against",
        speakerBotId: stagedCourt.againstAdvocate.id,
        content: testimonySource.snippet,
        sourceIds: [testimonySourceId],
        status: "ready",
        createdEventId: "irreversible-court-event",
        recordTestimonyId: testimonyId,
      }],
    };
    db.prepare("UPDATE debate_sessions SET status = ?, phase = ?, step_key = ?, session_json = ? WHERE id = ? AND user_id = 'user-1'")
      .run(stagedCourt.status, stagedCourt.phase, stagedCourt.stepKey, JSON.stringify(stagedCourt), session.id);
    session = getDebateSession(db, "user-1", session.id);
    for (let index = 0; index < 3; index += 1) {
      assert.equal(session.formatState.format, "turnabout");
      const statementId = session.formatState.activeStatementId!;
      session = await submitDebateTurnaboutAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: `continuance-fail-${index}`,
        action: "present_evidence",
        statementId,
        evidenceSourceId: testimonySourceId,
      }, runtime(provider));
      assert.equal(session.formatState.format, "turnabout");
      assert.equal(
        session.formatState.mysteryTrial?.credibilityRemaining,
        Math.max(0, 2 - index),
      );
      if (index < 2) {
        assert.equal(session.status, "waiting_for_player");
        assert.equal(session.formatState.activeStatementId, statementId);
      }
    }
    assert.equal(session.status, "completed");
    assert.equal(session.formatState.format, "turnabout");
    assert.equal(session.formatState.mysteryTrial?.verdict?.grade, "incorrect");
    const publicVerdict = session.events.find(
      (event) => event.stepKey === "mystery_turnabout_verdict",
    );
    assert.equal(publicVerdict?.speakerKind, "moderator");
    assert.equal(publicVerdict?.speakerBotId, session.moderator.id);
    assert.match(publicVerdict?.content ?? "", /Judge: Not Guilty\./u);
    assert.doesNotMatch(publicVerdict?.content ?? "", /wins?(?: the)? (?:debate|turnabout)/iu);
    assert.match(session.formatState.mysteryTrial?.verdict?.reason ?? "", /filed accusation is final/iu);
    await assert.rejects(
      () => applyDebateMysteryAction(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "court-cannot-return-to-mansion",
        action: "travel",
        roomId: crimeScene.id,
      }, runtime(provider)),
      /not a (?:legacy )?Whodunnit case|already complete/iu,
    );
  });

  it("seals a stored legacy continuance before any mansion action can run", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    const created = await createDebateMysterySession(db, "user-1", setup(db), "legacy-continuance-session", runtime(provider));
    const stored = structuredClone(created);
    assert.equal(stored.formatState.format, "whodunnit");
    const legacyState = stored.formatState as unknown as Record<string, unknown>;
    legacyState.playPhase = "continuance";
    legacyState.actionsRemaining = 3;
    stored.status = "waiting_for_player";
    stored.phase = "challenge";
    stored.stepKey = "mystery_continuance";
    db.prepare("UPDATE debate_sessions SET status = ?, phase = ?, step_key = ?, session_json = ? WHERE id = ? AND user_id = 'user-1'")
      .run(stored.status, stored.phase, stored.stepKey, JSON.stringify(stored), stored.id);

    const sealed = getDebateSession(db, "user-1", stored.id);
    assert.equal(sealed.status, "completed");
    assert.equal(sealed.phase, "verdict");
    assert.equal(sealed.stepKey, "mystery_verdict");
    assert.equal(sealed.formatState.format, "whodunnit");
    assert.equal(sealed.formatState.playPhase, "verdict");
    assert.equal(sealed.formatState.actionsRemaining, 0);
    assert.equal(sealed.formatState.verdict?.grade, "incorrect");
    await assert.rejects(
      () => applyDebateMysteryAction(db, "user-1", stored.id, {
        expectedRevision: sealed.revision,
        idempotencyKey: "legacy-continuance-cannot-travel",
        action: "travel",
        roomId: sealed.formatState.crimeSceneRoomId,
      }, runtime(provider)),
      /already complete/iu,
    );
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

  it("projects frozen speech-obfuscation through partner and suspect public replies", async () => {
    const db = testDb();
    const provider = new MysteryProviderStub();
    let session = await createDebateMysterySession(db, "user-1", setup(db), "mystery-gibberish", runtime(provider));
    const suspect = session.formatState.format === "whodunnit" ? session.formatState.suspects[0]! : null;
    assert.ok(suspect);
    const prosecutorPartnerBotId = session.formatState.format === "whodunnit"
      ? session.formatState.config.prosecutorPartnerBotId
      : "";
    const stored = structuredClone(session);
    for (const botId of [prosecutorPartnerBotId, suspect.botId]) {
      stored.powerPlan.bots[botId] = {
        ...(stored.powerPlan.bots[botId] ?? { botId, effects: [], hardMuted: false, visibleToBotIds: null, speechAudienceBotIds: null, warnings: [] }),
        effects: [{ powerId: "gibberish", powerName: "Gibberish", policy: "direct", effect: { type: "speech_obfuscation", mode: "gibberish" } }],
        hardMuted: false,
      };
    }
    db.prepare("UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = 'user-1'").run(JSON.stringify(stored), session.id);
    session = getDebateSession(db, "user-1", session.id);
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "gibberish-consult", action: "consult_partner", question: "What does the record establish?" }, runtime(provider));
    assert.equal(session.formatState.format, "whodunnit");
    assert.equal(botPowerIntendedSpeechLooksGibberishV1(session.formatState.partnerConsultations.at(-1)?.answer), true);
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "gibberish-travel", action: "travel", roomId: suspect.roomId }, runtime(provider));
    session = await beginInterview(db, provider, session, suspect.seatId, "gibberish-begin");
    session = await applyDebateMysteryAction(db, "user-1", session.id, { expectedRevision: session.revision, idempotencyKey: "gibberish-interview", action: "interview", suspectSeatId: suspect.seatId, question: "State your alibi." }, runtime(provider));
    assert.equal(session.formatState.format, "whodunnit");
    assert.equal(botPowerIntendedSpeechLooksGibberishV1(session.formatState.interviewLog.at(-1)?.content), true);
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
