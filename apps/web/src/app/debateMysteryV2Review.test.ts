import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateWhodunnitFormatStateV2, DebateSessionV1 } from "@localai/shared";
import { readFileSync } from "node:fs";
import { formatDebateMysteryV2PublicReview } from "./debateMysteryV2Review.ts";
import { MODE_TUTORIALS } from "./modeTutorials.ts";

const state = {
  version: 2,
  format: "whodunnit",
  playPhase: "verdict",
  caseTitle: "The Clockwork Alibi",
  fictionLabel: "Fictional, non-canonical case",
  config: {
    difficulty: "classic",
    trialType: "jury",
    playerRole: "participant",
    inspiration: "PRIVATE INSPIRATION",
    nonce: "PRIVATE NONCE",
  },
  victim: { id: "victim-private-id", name: "Avery Vale" },
  suspects: [
    {
      seatId: "suspect-iris",
      botId: "bot-iris",
      exportHash: null,
      name: "Iris",
      color: null,
      glyph: null,
      roomId: "library",
    },
  ],
  rooms: [
    {
      id: "library",
      name: "Library",
      visited: true,
      hotspots: [
        { id: "clock", label: "stopped clock", examined: true },
        { id: "drawer", label: "UNSEEN DRAWER", examined: false },
      ],
    },
  ],
  record: [
    {
      reference: { kind: "evidence", id: "clock-evidence" },
      title: "Stopped clock",
      description: "Its hands stopped at midnight.",
      emoji: "🕰️",
      admitted: true,
      updatedAt: "2026-08-24T20:00:00.000Z",
    },
    {
      reference: { kind: "evidence", id: "sealed-clue" },
      title: "UNADMITTED CLUE",
      description: "This must remain out of the copy.",
      emoji: "🔒",
      admitted: false,
      updatedAt: "2026-08-24T20:00:00.000Z",
    },
  ],
  dialogueHistory: [
    {
      nodeId: "node-1",
      lineId: "line-1",
      visibleText: "The clock was already broken when I arrived.",
      speakerSeatId: "suspect-iris",
      occurredAt: "2026-08-24T20:01:00.000Z",
    },
  ],
  theory: {
    culpritSeatId: "suspect-iris",
    accompliceSeatId: null,
    method: "Clock mechanism",
    motive: "Inheritance",
    opportunity: "Midnight access",
    evidenceIds: ["clock-evidence"],
    testimonyIds: [],
  },
  theoryFiledAt: "2026-08-24T20:02:00.000Z",
  court: {
    statements: [
      {
        statementId: "statement-1",
        versionId: "statement-1-v1",
        witnessSeatId: "suspect-iris",
        version: 1,
        lineId: "line-1",
        visibleText: "I never touched the clock.",
        pressed: true,
      },
    ],
  },
  verdict: {
    legalResult: "guilty",
    classification: "just_conviction",
    sealedCulpritCorrect: true,
    proofGrade: "proved",
    jurorBallots: [
      {
        jurorBotId: "juror-1",
        vote: "guilty",
        reason: "The admitted contradiction proved the charge.",
        powerAffected: false,
      },
    ],
    deliveredAt: "2026-08-24T20:03:00.000Z",
  },
  calloutHistory: [
    {
      id: "callout-1",
      callout: "guilty",
      actorColor: null,
      occurredAt: "2026-08-24T20:03:00.000Z",
    },
  ],
  voicesEnabled: true,
} as unknown as DebateWhodunnitFormatStateV2;

describe("Whodunnit V2 public review", () => {
  it("includes the recorded public case while excluding sealed and undiscovered data", () => {
    const review = formatDebateMysteryV2PublicReview(
      state,
      (botId) => (botId === "juror-1" ? "Mira" : null),
    );

    assert.match(review, /The Clockwork Alibi/u);
    assert.match(review, /Iris: The clock was already broken/u);
    assert.match(review, /Stopped clock/u);
    assert.match(review, /I never touched the clock/u);
    assert.match(review, /Mira: guilty/u);
    assert.doesNotMatch(review, /PRIVATE INSPIRATION|PRIVATE NONCE/u);
    assert.doesNotMatch(review, /UNADMITTED CLUE|UNSEEN DRAWER/u);
    assert.doesNotMatch(review, /sealedCulpritCorrect|victim-private-id/u);
  });

  it("exports full chronological observations, action provenance and a non-legal case-check result", () => {
    const fixture = structuredClone(state);
    const longObservation = "Public observation. ".repeat(300);
    fixture.dialogueHistory.unshift({ nodeId: "observation", lineId: null, speakerSeatId: null, speakerBotId: "PRIVATE-VOICE-CARRIER", speakerKind: "player", visibleText: longObservation, delivery: "text_only", occurredAt: "2026-08-24T20:00:10.000Z" });
    fixture.dialogueHistory.push({ nodeId: "narration", lineId: null, speakerSeatId: null, speakerBotId: "PRIVATE-VOICE-CARRIER", speakerKind: "narrator", visibleText: "The room settles.", occurredAt: "2026-08-24T20:00:20.000Z" });
    fixture.caseCheck = { version: 1, completionKind: "case_check", courtSkipped: true, assessed: "accused_set_only", accusationCorrect: false, concludedAt: "2026-08-24T20:02:00.000Z" };
    fixture.verdict = null;
    fixture.court = null;
    fixture.calloutHistory = [];
    fixture.publicActionHistoryComplete = true;
    fixture.config.mansionSnapshot = {
      version: 2, sourceBundleId: "public-bundle", capturedAt: "2026-08-24T19:00:00.000Z",
      layoutSha256: "public-layout-hash", presentationSha256: "public-presentation-hash",
      layoutV2: { privateCase: "PRIVATE-TOPOLOGY" }, presentation: { hiddenPrompt: "PRIVATE-PRESENTATION" },
    } as unknown as DebateWhodunnitFormatStateV2["config"]["mansionSnapshot"];
    fixture.publicActions = [{ version: 1, id: "action-examine", sequence: 1, occurredAt: "2026-08-24T20:00:11.000Z", action: "examine", revisionBefore: 10, revisionAfter: 11, phaseBefore: "investigation", phaseAfter: "investigation", roomViewAfter: "room", roomId: "library", hotspotId: "clock", admittedRecords: [{ kind: "evidence", id: "clock-evidence" }], acquiredItemIds: [], dialogueIndexes: [0] }];
    Object.assign(fixture, { privateCase: { sealedResponsibleSeatIds: ["PRIVATE-SOLUTION"] }, privatePrompt: "PRIVATE-PROMPT" });
    Object.assign(fixture.publicActions[0]!, { privateCase: "PRIVATE-PAYLOAD", dialogue: "HIDDEN-DIALOGUE", evidenceId: "sealed-clue" });
    fixture.theory!.evidenceIds.push("sealed-clue", "PRIVATE-REFERENCE");
    const session = { id: "run-public", revision: 12, status: "completed", phase: "verdict", updatedAt: "2026-08-24T20:03:00.000Z", provider: "local", model: "synthetic-model", responseMode: "local" } as DebateSessionV1;
    const review = formatDebateMysteryV2PublicReview(fixture, () => "PRIVATE-NAME", session, [
      { id: "legacy-move", sequence: 0, action: "move", occurredAt: "2026-08-24T20:00:00.000Z", payload: { privateCase: "PRIVATE-LEGACY" } } as never,
      { id: "after-snapshot", sequence: 99, action: "move", occurredAt: "2026-08-24T21:00:00.000Z" },
    ]);
    assert.ok(review.includes(longObservation));
    assert.match(review, /diagnostic verbose transcript · v1/);
    assert.match(review, /Investigator: Public observation/);
    assert.match(review, /Narrator: The room settles/);
    assert.match(review, /intended delivery=text_only/);
    assert.match(review, /action-examine.*revision 10→11/);
    assert.ok(review.indexOf("legacy-move") < review.indexOf("Investigator: Public observation"));
    assert.ok(review.indexOf("Investigator: Public observation") < review.indexOf("action-examine"));
    assert.ok(review.indexOf("Narrator: The room settles") < review.indexOf("Iris: The clock was already"));
    assert.match(review, /run-public.*revision: 12/);
    assert.match(review, /local \/ synthetic-model/);
    assert.match(review, /Frozen mansion source: public-bundle.*public-layout-hash.*public-presentation-hash/);
    assert.match(review, /Court skipped: yes/);
    assert.match(review, /Accusation correct: false/);
    assert.match(review, /not semantically graded/);
    assert.match(review, /Delivery-observed: unknown/);
    assert.doesNotMatch(review, /PRIVATE-|HIDDEN-DIALOGUE|UNADMITTED CLUE|UNSEEN DRAWER|after-snapshot|Legal result:|sealedResponsibleSeatIds/);
  });

  it("marks legacy history and unknown speaker provenance without pretending dialogue was heard", () => {
    const fixture = structuredClone(state);
    fixture.dialogueHistory[0]!.speakerSeatId = null;
    fixture.dialogueHistory[0]!.speakerBotId = "PRIVATE-CARRIER";
    const review = formatDebateMysteryV2PublicReview(fixture);
    assert.match(review, /Missing \/ legacy history/);
    assert.match(review, /Unknown speaker \(legacy public record\)/);
    assert.doesNotMatch(review, /PRIVATE-CARRIER/);
  });

  it("wires guarded confirmation, draft-preserving cancel and one copy contract across surfaces", () => {
    const actions = readFileSync(new URL("./WhodunnitCaseCheckActions.tsx", import.meta.url), "utf8");
    const experience = readFileSync(new URL("./DebateMysteryV2Experience.tsx", import.meta.url), "utf8");
    const parent = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./debateMysteryV2.module.css", import.meta.url), "utf8");
    assert.match(actions, /disabled=\{props.busy \|\| !props.hasAccused\}/);
    assert.match(actions, /onClick=\{\(\) => setConfirming\(false\)\}>Cancel — keep editing/);
    assert.match(actions, /skips Court and permanently concludes this Run/);
    assert.match(actions, /role="alert"/);
    assert.match(experience, /state.theoryAvailable && state.config.investigationMode !== "court_only" \? <WhodunnitCaseCheckActions/);
    assert.match(experience, /if \(await sendAction\(\{ action: "check_case", theory \}\)\) setTheoryOpen\(false\)/);
    assert.match(experience, /idempotencyKey: action.action === "check_case"/);
    assert.match(experience, /caseFileHeaderActions\}><WhodunnitTranscriptCopyButton/);
    assert.match(parent, /return formatDebateMysteryV2PublicReview\(/);
    assert.match(parent, /\/mystery-actions/);
    assert.match(parent, /formatDebateVerboseTranscript\(session, playerName, presenceBeats, mysteryActions\)/);
    const tutorial = MODE_TUTORIALS.debate.steps.find((step) => step.heading === "Investigate a Whodunnit")!;
    assert.match(tutorial.body, /Check my case and conclude.*Cancel keeps your draft/);
    assert.match(tutorial.body, /selected accused set, not method, motive, opportunity, or proof/);
    assert.match(tutorial.body, /Case File, Theory Board, completed outcome, and Archive/);
    assert.match(actions, /data-tutorial-target="mystery-v2-check-case"/);
    assert.match(actions, /data-tutorial-target="debate-copy-transcript"/);
    assert.match(experience, /<footer className=\{styles.theoryBoardActions\}>/);
    assert.match(css, /\.theoryBoard \{[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto[^}]*overflow: hidden/);
    assert.match(css, /\.theoryBoardFields \{[^}]*overflow-y: auto/);
  });
});

describe("Whodunnit V2 public review stance", () => {
  it("labels the opposing seat by stance and records the Defense client", () => {
    const prosecution = formatDebateMysteryV2PublicReview(state);
    assert.match(prosecution, /- Stance: prosecution · player counsel=Prosecutor · opposing counsel=Defense Counsel/u);
    assert.match(prosecution, /- Client: None \(prosecution stance\)/u);

    const fixture = structuredClone(state);
    fixture.config = {
      ...fixture.config,
      playerStance: "defense",
      prosecutorBotId: "bot-counsel",
      rivalDefenseBotId: "bot-rival",
    } as typeof fixture.config;
    fixture.caseCharge = {
      version: 1,
      incidentId: "incident-1",
      kind: "homicide",
      title: "Homicide",
      subject: "the victim",
      accusationPrompt: "Who is really responsible for the victim's death?",
      defendantSeatId: "suspect-iris",
    } as typeof fixture.caseCharge;
    fixture.dialogueHistory = [
      {
        nodeId: "node-rival",
        lineId: "line-rival",
        visibleText: "Objection. The defense is reaching.",
        speakerSeatId: null,
        speakerBotId: "bot-rival",
        occurredAt: "2026-08-24T20:01:30.000Z",
      },
      {
        nodeId: "node-player",
        lineId: "line-player",
        visibleText: "My client was elsewhere.",
        speakerSeatId: null,
        speakerBotId: "bot-counsel",
        speakerKind: "player",
        occurredAt: "2026-08-24T20:01:40.000Z",
      },
    ] as typeof fixture.dialogueHistory;
    const defense = formatDebateMysteryV2PublicReview(fixture);
    assert.match(defense, /- Stance: defense · player counsel=Defense Attorney · opposing counsel=Prosecutor/u);
    assert.match(defense, /- Client: Iris \[suspect-iris\]/u);
    assert.match(defense, /Prosecution: Objection\. The defense is reaching\./u);
    assert.match(defense, /Investigator: My client was elsewhere\./u);
    assert.doesNotMatch(defense, /\n {2}Defense: /u);
  });
});
