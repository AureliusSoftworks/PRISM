import assert from "node:assert/strict";
import test from "node:test";
import {
  debateMysteryClassifyVerdictV2,
  debateMysteryCredibilityMaximumV2,
  debateMysteryEyewitnessChanceV2,
  debateMysteryPremiumAvailableV2,
  emptyDebateMysteryMutationsV2,
  emptyDebateMysteryRequirementsV2,
  validateDebateMysteryAudioManifestV1,
  validateDebateMysteryDialogueGraphV2,
  type DebateMysteryAudioManifestV1,
  type DebateMysteryDialogueGraphV2,
  type DebateMysteryDialogueNodeV2,
  type DebateMysterySpokenLineV2,
  type DebateMysteryWitnessChapterV2,
} from "./debateMysteryV2.ts";

function line(id: string, nodeId: string, visibleText = id): DebateMysterySpokenLineV2 {
  return {
    id,
    nodeId,
    speakerKind: "bot",
    speakerBotId: "bot-1",
    visibleText,
    spokenText: visibleText,
    performance: { mood: "guarded", pace: "natural", intensity: 1, actorNote: "Keep the subtext controlled." },
    mode: "spoken",
    reusableCalloutKey: null,
  };
}

function node(
  id: string,
  kind: DebateMysteryDialogueNodeV2["kind"],
  options: Partial<DebateMysteryDialogueNodeV2> = {},
): DebateMysteryDialogueNodeV2 {
  return {
    id,
    kind,
    scene: kind === "talk_topic" || kind === "present_reaction" ? "investigation" : "court",
    speakerSeatId: "seat-1",
    intendedRecipientSeatId: null,
    lineId: `line-${id}`,
    label: id,
    requirements: emptyDebateMysteryRequirementsV2(),
    mutations: emptyDebateMysteryMutationsV2(),
    recordReferences: [],
    nextNodeIds: [],
    terminalOutcome: null,
    ...options,
  };
}

function chapter(seatId: string, ordinal: number): DebateMysteryWitnessChapterV2 {
  return {
    id: `chapter-${seatId}`,
    witnessSeatId: seatId,
    ordinal,
    pivotal: ordinal === 2,
    recall: false,
    checkpointNodeId: `checkpoint-${seatId}`,
    initialStatementIds: [`statement-${seatId}`],
    statementVersions: [{
      id: `statement-version-${seatId}`,
      statementId: `statement-${seatId}`,
      witnessSeatId: seatId,
      version: 1,
      lineId: `line-statement-${seatId}`,
      pressNodeId: `press-${seatId}`,
      correctPresentations: [{ kind: "evidence", id: `evidence-${seatId}` }],
      rebuttalNodeId: `rebuttal-${seatId}`,
      revisionNodeId: `revision-${seatId}`,
      nextStatementId: null,
    }],
    completionNodeId: `complete-${seatId}`,
  };
}

function validGraph(): DebateMysteryDialogueGraphV2 {
  const seatIds = ["seat-1", "seat-2"];
  const nodes: DebateMysteryDialogueNodeV2[] = [];
  const lines: DebateMysterySpokenLineV2[] = [];
  for (const seatId of seatIds) {
    const entries = [
      node(`checkpoint-${seatId}`, "court_reaction", {
        speakerSeatId: seatId,
        mutations: { ...emptyDebateMysteryMutationsV2(), admitRecordIds: [`evidence:evidence-${seatId}`] },
        nextNodeIds: [`statement-node-${seatId}`],
      }),
      node(`statement-node-${seatId}`, "testimony_statement", { speakerSeatId: seatId }),
      node(`press-${seatId}`, "press_result", { speakerSeatId: seatId }),
      node(`rebuttal-${seatId}`, "court_reaction", { speakerSeatId: seatId }),
      node(`revision-${seatId}`, "testimony_revision", { speakerSeatId: seatId, nextNodeIds: [`complete-${seatId}`] }),
      node(`complete-${seatId}`, "court_reaction", { speakerSeatId: seatId, terminalOutcome: "chapter_complete" }),
    ];
    nodes.push(...entries);
    lines.push(...entries.map((entry) => line(entry.lineId!, entry.id)));
    lines.push(line(`line-statement-${seatId}`, `statement-node-${seatId}`, `${seatId} statement`));
  }
  return {
    version: 2,
    caseId: "case-1",
    initialDiscoveryIds: ["alibi-a", "alibi-b"],
    initialAdmittedRecordIds: [],
    interactionRootNodeIds: nodes.map((entry) => entry.id),
    nodes,
    lines,
    witnessChapters: seatIds.map(chapter),
    prosecutionChoices: [],
    talkTopicNodeIdsBySuspect: { "seat-1": [], "seat-2": [] },
    presentNodeIdsBySuspect: { "seat-1": [], "seat-2": [] },
    verdictNodeIds: [],
  };
}

test("V2 graph validation proves every suspect has a reachable statement-level proof route", () => {
  const graph = validGraph();
  const result = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: [
      { kind: "evidence", id: "evidence-seat-1" },
      { kind: "evidence", id: "evidence-seat-2" },
    ],
  });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.reachableSpokenLineIds.length, graph.lines.length - 2);
});

test("V2 graph validation rejects a suspect without cross-examination", () => {
  const graph = validGraph();
  graph.witnessChapters = graph.witnessChapters.filter((entry) => entry.witnessSeatId !== "seat-2");
  const result = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: [
      { kind: "evidence", id: "evidence-seat-1" },
      { kind: "evidence", id: "evidence-seat-2" },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("seat-2 has no cross-examination")));
});

test("eyewitness validation requires two discoverable independent alibi supports", () => {
  const graph = validGraph();
  const result = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: [
      { kind: "evidence", id: "evidence-seat-1" },
      { kind: "evidence", id: "evidence-seat-2" },
    ],
    eyewitnessSeatId: "seat-1",
    accusedAlibiSupportDiscoveryIds: ["alibi-a"],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("two outwardly independent")));
});

test("local audio validation rejects missing and unreachable clips", () => {
  const graph = validGraph();
  const manifest: DebateMysteryAudioManifestV1 = {
    version: 1,
    caseId: graph.caseId,
    caseHash: "case-hash",
    scriptHash: "script-hash",
    dialogueGraphHash: "graph-hash",
    engine: "prism-instant-local",
    model: "kokoro-82m-q8",
    modelVersion: "1",
    entries: [{
      lineId: "line-not-in-graph",
      textHash: "text",
      botId: null,
      voiceProfileHash: "voice",
      performanceDirectionHash: "direction",
      clipPath: "clip.wav",
      mimeType: "audio/wav",
      durationMs: 100,
      byteSize: 100,
      sha256: "hash",
      alignment: null,
      reusableCalloutKey: null,
      verifiedAt: "now",
    }],
    complete: true,
    completedAt: "now",
    verifiedAt: "now",
  };
  const result = validateDebateMysteryAudioManifestV1({
    graph,
    manifest,
    reachableSpokenLineIds: ["line-press-seat-1"],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("missing from the local audio pack")));
  assert.ok(result.errors.some((error) => error.includes("not in the dialogue graph")));
});

test("difficulty, eyewitness, Premium, and verdict contracts are deterministic", () => {
  assert.equal(debateMysteryCredibilityMaximumV2("casual"), 5);
  assert.equal(debateMysteryCredibilityMaximumV2("classic"), 4);
  assert.equal(debateMysteryCredibilityMaximumV2("mastermind"), 3);
  assert.equal(debateMysteryEyewitnessChanceV2("casual", "compact"), 0.05);
  assert.equal(debateMysteryEyewitnessChanceV2("classic", "grand"), 0.35);
  assert.equal(debateMysteryEyewitnessChanceV2("mastermind", "grand"), 0.5);
  assert.equal(debateMysteryPremiumAvailableV2(), false);
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "guilty", accusedIsCulprit: false, proofEstablished: true, proofSafe: true }), "wrongful_conviction");
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "not_guilty", accusedIsCulprit: true, proofEstablished: true, proofSafe: true }), "acquittal_despite_proof");
});
