import assert from "node:assert/strict";
import test from "node:test";
import {
  DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS,
  DEBATE_MYSTERY_V2_PRESETS,
  debateMysteryDeterministicDenialClaimV2,
  debateMysteryDeterministicDenialTextV2,
  debateMysteryStatementIsContractEchoV2,
  debateMysteryTalkTopicMirrorsRecordV2,
  debateMysteryClassifyVerdictV2,
  debateMysteryCredibilityMaximumV2,
  debateMysteryEyewitnessChanceV2,
  debateMysteryHouseStyleV2,
  debateMysteryMansionExteriorPromptV1,
  debateMysteryMansionExteriorScaleIsStaleV1,
  debateMysteryMansionBundleEligibleV2,
  debateMysteryMansionHeldByArchiveV1,
  debateMysteryVenueHeldBySessionV1,
  debateMysteryPlayerStanceV2,
  debateMysteryPremiumAvailableV2,
  debateMysterySpectatorEvidenceReferencesV2,
  emptyDebateMysteryMutationsV2,
  emptyDebateMysteryRequirementsV2,
  normalizeDebateMysteryFormatStateV2,
  normalizeDebateMysteryTalkSubjectV2,
  normalizeDebateMysteryV2ForgeProgressMessage,
  validateDebateMysteryAudioManifestV1,
  validateDebateMysteryDialogueGraphV2,
  validateDebateMysteryStageCuePerformanceV1,
  resolveDebateMysteryAssetSynthesisV2,
  resolveDebateMysteryConfigV2,
  resolveDebateMysteryProductionCapabilitiesV1,
  resolveDebateMysteryVenueProductionV1,
  resolveDebateMysteryMansionExteriorScaleClassV1,
  splitDebateMysteryStageActionTextV2,
  stripDebateMysterySelfAddressV2,
  stripDebateMysterySpeakerLabelV2,
  type DebateMysteryAudioManifestV1,
  type DebateMysteryDialogueGraphV2,
  type DebateMysteryDialogueNodeV2,
  type DebateMysteryRecordReferenceV2,
  type DebateMysteryRoomV2,
  type DebateMysterySpokenLineV2,
  type DebateMysteryStageCueV1,
  type DebateMysteryWitnessChapterV2,
} from "./debateMysteryV2.ts";

test("gives Case Forge five bounded authoring attempts", () => {
  assert.equal(DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS, 5);
});

test("mansion exterior prompt freezes geography and rejects interior montage covers", () => {
  const prompt = debateMysteryMansionExteriorPromptV1(
    debateMysteryHouseStyleV2(
      "A deep-space observatory mansion orbiting a blue giant with glass domes and sealed airlocks.",
    ),
  );
  assert.match(prompt, /complete mansion from outside/iu);
  assert.match(prompt, /geography/iu);
  assert.match(prompt, /approach or entrance/iu);
  assert.match(prompt, /No interiors/iu);
  assert.match(prompt, /room montages, collages, mosaics/iu);
  assert.match(prompt, /No .*evidence, clues/iu);
});

test("mansion exterior prompts make each scale family visually explicit", () => {
  const houseStyle = debateMysteryHouseStyleV2("A rain-lashed old house on a wooded hill.");
  const compact = debateMysteryMansionExteriorPromptV1(houseStyle, "compact");
  const standard = debateMysteryMansionExteriorPromptV1(houseStyle, "standard");
  const grand = debateMysteryMansionExteriorPromptV1(houseStyle, "grand");
  assert.match(compact, /small two-story footprint/iu);
  assert.match(standard, /broader two-story estate/iu);
  assert.match(grand, /three-story.*multiple major wings/iu);
  for (const prompt of [compact, standard, grand]) {
    assert.match(prompt, /library-card size/iu);
    assert.match(prompt, /Do not use camera zoom or cropping/iu);
  }
});

test("mansion exterior scale follows presets and frozen custom topology", () => {
  assert.equal(resolveDebateMysteryMansionExteriorScaleClassV1({ preset: "compact", floors: 3, totalRooms: 18 }), "compact");
  assert.equal(resolveDebateMysteryMansionExteriorScaleClassV1({ preset: "standard", floors: 2, totalRooms: 5 }), "standard");
  assert.equal(resolveDebateMysteryMansionExteriorScaleClassV1({ preset: "grand", floors: 2, totalRooms: 5 }), "grand");
  assert.equal(resolveDebateMysteryMansionExteriorScaleClassV1({ preset: "custom", floors: 2, totalRooms: 7 }), "compact");
  assert.equal(resolveDebateMysteryMansionExteriorScaleClassV1({ preset: "custom", floors: 2, totalRooms: 8 }), "standard");
  assert.equal(resolveDebateMysteryMansionExteriorScaleClassV1({ preset: "custom", floors: 3, totalRooms: 8 }), "grand");
  assert.equal(
    debateMysteryMansionExteriorScaleIsStaleV1({
      exteriorScaleClass: "compact",
      topology: { preset: "custom", floors: 2, totalRooms: 8 },
    }),
    true,
  );
});

test("clamps Case Forge progress copy to its declared authoring budget", () => {
  assert.equal(
    normalizeDebateMysteryV2ForgeProgressMessage(
      "Writing the Case · Witness chapter 1 of 4 · attempt 6 of 5",
    ),
    "Writing the Case · Witness chapter 1 of 4 · attempt 5 of 5",
  );
  assert.equal(
    normalizeDebateMysteryV2ForgeProgressMessage(
      "Writing the Case · Witness chapter 1 of 4 · attempt 4 of 5",
    ),
    "Writing the Case · Witness chapter 1 of 4 · attempt 4 of 5",
  );
});

test("normalizes a frozen pre-substep Case Forge payload without crashing Archive resume", () => {
  const normalized = normalizeDebateMysteryFormatStateV2({
    version: 2,
    format: "whodunnit",
    config: {
      version: 2,
      prosecutorBotId: "prosecutor-1",
      spark: "",
      nonce: "legacy-title",
    },
    compilation: {
      version: 2,
      jobId: "legacy-job",
      stage: "writing_case",
      attempt: 1,
      completedPasses: 0,
      totalPasses: 5,
      preparedAudioCount: 0,
      requiredAudioCount: 0,
      retryable: false,
      spoilerSafeMessage: "Writing the Case",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
    caseTitle: "The Disappearance of an earlier unexplained disappearance",
    caseCharge: {
      version: 1,
      incidentId: "primary-disappearance",
      kind: "disappearance",
      title: "Disappearance",
      subject: "an earlier unexplained disappearance",
      accusationPrompt: "Who is responsible for an earlier unexplained disappearance?",
    },
    suspects: [],
    rooms: [{
      id: "legacy-room",
      name: "Legacy room",
      floor: 1,
      emoji: "□",
      imageId: null,
      bundledAssetPath: null,
      unlocked: true,
      visited: false,
      hotspots: [],
      sealedAsset: {
        version: 1,
        kind: "room",
        status: "pending",
        source: "synthesized",
        revealed: false,
        mimeType: "image/png",
      },
    }],
    record: [],
    topics: [],
    dialogueHistory: [{
      nodeId: "talk-holder-seat-alibi",
      lineId: "line-player-address",
      visibleText: "Collin, explain that contradiction.",
      speakerSeatId: null,
      speakerBotId: "prosecutor-1",
      speakerKind: "player",
      occurredAt: "2026-08-25T00:00:00.000Z",
    }],
    identityMirrorTargetSnapshots: {
      "prosecutor-1": {
        version: 1,
        botId: "prosecutor-1",
        name: "  Miles Edgeworth  ",
        faceStyle: {
          eyesFont: "concise",
          eyeCharacter: "⌁",
          eyeCount: 2,
          eyeSpacing: 0.47,
          mouthFont: "formal",
          mouthCharacter: "▽",
          mouthAnimation: "custom",
          mouthSpeechPoses: ["▽", "·", "△", "○"],
        },
        avatarDetails: {
          version: 1,
          screen: {
            stamps: [{ id: "diagonal-scar", offsetX: 2, offsetY: -3, scalePct: 90 }],
            paintMaskBase64: null,
            speechInkAnimation: "wobble",
          },
        },
        glyph: "lucideScale",
      },
    },
  });

  assert.ok(normalized);
  assert.equal(normalized.config.useRelevantAssetLibraryProps, false);
  assert.deepEqual(normalized.compilation.substeps, [{
    id: "legacy-writing_case",
    label: "Writing the Case",
    state: "active",
  }]);
  assert.equal(normalized.dialogueHistory[0]?.speakerKind, "player");
  assert.equal(normalized.identityMirrorTargetSnapshots["prosecutor-1"]?.name, "Miles Edgeworth");
  assert.equal(
    normalized.identityMirrorTargetSnapshots["prosecutor-1"]?.faceStyle.mouthAnimation,
    "none",
  );
  assert.deepEqual(
    normalized.identityMirrorTargetSnapshots["prosecutor-1"]?.faceStyle.mouthSpeechPoses,
    ["▽", "·", "△", "○"],
  );
  assert.equal(
    normalized.identityMirrorTargetSnapshots["prosecutor-1"]?.avatarDetails?.screen.speechInkAnimation,
    "wobble",
  );
  assert.equal(normalized.identityMirrorTargetSnapshots["prosecutor-1"]?.glyph, "lucideScale");
  assert.equal(normalized.rooms[0]?.accessState, "being_secured");
  assert.notEqual(
    normalized.caseTitle,
    "The Disappearance of an earlier unexplained disappearance",
  );
  assert.doesNotMatch(
    normalized.caseTitle ?? "",
    /disappear\w*.*disappear\w*/iu,
  );
});

function line(id: string, nodeId: string, visibleText = id): DebateMysterySpokenLineV2 {
  return {
    id,
    nodeId,
    speakerKind: "bot",
    speakerBotId: "bot-1",
    stageActionText: null,
    visibleText,
    spokenText: visibleText,
    performance: { mood: "guarded", pace: "natural", intensity: 1, actorNote: "Keep the subtext controlled." },
    mode: "spoken",
    reusableCalloutKey: null,
  };
}

test("separates Whodunnit stage action from spoken dialogue", () => {
  assert.deepEqual(
    splitDebateMysteryStageActionTextV2(
      "Meg Griffin frowns at the item. “That does not tell me much about where I was.”",
      "Meg Griffin",
    ),
    {
      stageActionText: "Frowns at the item",
      spokenText: "That does not tell me much about where I was.",
    },
  );
  assert.deepEqual(
    splitDebateMysteryStageActionTextV2(
      "Former Witness frowns at the item. “That does not tell me much about where I was.”",
      "Current Cast Name",
    ),
    {
      stageActionText: "Frowns at the item",
      spokenText: "That does not tell me much about where I was.",
    },
  );
  assert.deepEqual(
    splitDebateMysteryStageActionTextV2("*winces at the photograph* I have never seen it before."),
    {
      stageActionText: "Winces at the photograph",
      spokenText: "I have never seen it before.",
    },
  );
  assert.deepEqual(
    splitDebateMysteryStageActionTextV2("That does not prove I entered the room."),
    {
      stageActionText: null,
      spokenText: "That does not prove I entered the room.",
    },
  );
});

test("Talk semantics preserve rooms while filtering Case File mirrors", () => {
  const roomSubject = normalizeDebateMysteryTalkSubjectV2({
    value: { category: "room", subjectId: "room-archive" },
    label: "The archive",
    rooms: [{ id: "room-archive", name: "Optical Archive" }],
  });
  assert.deepEqual(roomSubject, { category: "room", roomId: "room-archive" });
  assert.equal(debateMysteryTalkTopicMirrorsRecordV2({
    topicId: "lead-pipe",
    label: "The lead pipe",
    subject: { category: "general" },
    records: [{ reference: { kind: "evidence", id: "bloodied-lead-pipe" }, title: "Bloodied Lead Pipe" }],
  })?.id, "bloodied-lead-pipe");
  assert.equal(debateMysteryTalkTopicMirrorsRecordV2({
    topicId: "archive-room",
    label: "The lead pipe display room",
    subject: roomSubject,
    records: [{ reference: { kind: "evidence", id: "bloodied-lead-pipe" }, title: "Bloodied Lead Pipe" }],
  }), null);
  assert.equal(debateMysteryTalkTopicMirrorsRecordV2({
    topicId: "archive-room",
    label: "The archive",
    subject: { category: "general" },
    records: [{ reference: { kind: "evidence", id: "archive-exhibit" }, title: "Archive Exhibit 3" }],
  }), null, "a one-word location label must not partially mirror an evidence title");
});

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

const validationRecordReferences: DebateMysteryRecordReferenceV2[] = [
  { kind: "evidence", id: "evidence-seat-1" },
  { kind: "evidence", id: "evidence-seat-2" },
];

function graphWithPresentationGate(): DebateMysteryDialogueGraphV2 {
  const graph = validGraph();
  const gatedTopicId = "talk-gated-lead";
  const gatedResponseId = "talk-gated-lead-response";
  const topic = node(gatedTopicId, "talk_topic", {
    speakerSeatId: null,
    intendedRecipientSeatId: "seat-1",
    label: "What the timing changes",
    locationId: "room-1",
    talkSubject: { category: "general" },
    requirements: {
      ...emptyDebateMysteryRequirementsV2(),
      unlockedTopicIds: [gatedTopicId],
    },
    nextNodeIds: [gatedResponseId],
  });
  const topicResponse = node(gatedResponseId, "talk_topic", {
    speakerSeatId: "seat-1",
    intendedRecipientSeatId: null,
    locationId: "room-1",
  });
  graph.nodes.push(topic, topicResponse);
  graph.lines.push(line(topic.lineId!, topic.id), line(topicResponse.lineId!, topicResponse.id));
  graph.interactionRootNodeIds.push(topic.id);
  graph.talkTopicNodeIdsBySuspect["seat-1"]!.push(topic.id);

  for (const seatId of ["seat-1", "seat-2"]) {
    for (const reference of validationRecordReferences) {
      const key = `${reference.kind}-${reference.id}`;
      const promptId = `present-${seatId}-${key}`;
      const responseId = `${promptId}-response`;
      const prompt = node(promptId, "present_reaction", {
        speakerSeatId: null,
        intendedRecipientSeatId: seatId,
        locationId: "room-1",
        requirements: {
          ...emptyDebateMysteryRequirementsV2(),
          admittedRecordIds: [`${reference.kind}:${reference.id}`],
        },
        recordReferences: [reference],
        nextNodeIds: [responseId],
      });
      const response = node(responseId, "present_reaction", {
        speakerSeatId: seatId,
        locationId: "room-1",
        recordReferences: [reference],
      });
      graph.nodes.push(prompt, response);
      graph.lines.push(line(prompt.lineId!, prompt.id), line(response.lineId!, response.id));
      graph.interactionRootNodeIds.push(prompt.id);
      graph.presentNodeIdsBySuspect[seatId]!.push(prompt.id);
    }
  }
  graph.presentationGates = [{
    id: "gate-pivotal-record",
    requiredRecord: validationRecordReferences[0]!,
    requiredSuspectSeatId: "seat-1",
    correctPresentNodeId: "present-seat-1-evidence-evidence-seat-1",
    unlocks: [{ kind: "topic", topicNodeId: gatedTopicId }],
    requiredForProgression: true,
  }];
  return graph;
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

test("V2 graph validation requires a private bot carrier for anonymous Babble", () => {
  const graph = validGraph();
  const anonymous = graph.lines[0]!;
  anonymous.mode = "anonymous_babble";
  anonymous.speakerKind = "narrator";
  const valid = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
  });
  assert.equal(valid.valid, true, valid.errors.join("\n"));

  anonymous.speakerBotId = null;
  const missingCarrier = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
  });
  assert.equal(missingCarrier.valid, false);
  assert.ok(missingCarrier.errors.some((error) => error.includes("no private bot carrier")));
});

test("V2 graph validation makes persona Babble a public embodied-player thought", () => {
  const graph = validGraph();
  const playerThought = graph.lines[0]!;
  playerThought.mode = "persona_babble";
  playerThought.speakerKind = "player";
  playerThought.speakerBotId = "prosecutor-1";
  const valid = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
  });
  assert.equal(valid.valid, true, valid.errors.join("\n"));

  playerThought.speakerBotId = null;
  const missingEmbodiedSpeaker = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
  });
  assert.equal(missingEmbodiedSpeaker.valid, false);
  assert.ok(missingEmbodiedSpeaker.errors.some((error) => error.includes("no embodied bot speaker")));
});

test("V2 graph validation permits one automated Spectator prosecution option only", () => {
  const graph = validGraph();
  const prompt = node("spectator-choice-prompt", "prosecution_choice", {
    speakerSeatId: null,
  });
  const response = node("spectator-choice-response", "choice_reaction", {
    requirements: {
      ...emptyDebateMysteryRequirementsV2(),
      choices: [{ choiceId: "spectator-choice", optionId: "automatic" }],
    },
  });
  const optionLine = {
    ...line("line-spectator-choice-option", response.id, "The automated prosecution proceeds."),
    mode: "player_selected" as const,
  };
  graph.nodes.push(prompt, response);
  graph.lines.push(
    line(prompt.lineId!, prompt.id),
    line(response.lineId!, response.id),
    optionLine,
  );
  graph.interactionRootNodeIds.push(prompt.id, response.id);
  graph.prosecutionChoices = [{
    id: "spectator-choice",
    promptLineId: prompt.lineId!,
    options: [{
      id: "automatic",
      lineId: optionLine.id,
      responseNodeId: response.id,
    }],
  }];
  const common = {
    graph,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
  };

  const spectator = validateDebateMysteryDialogueGraphV2({
    ...common,
    playerRole: "spectator",
  });
  assert.equal(spectator.valid, true, spectator.errors.join("\n"));

  const participant = validateDebateMysteryDialogueGraphV2({
    ...common,
    playerRole: "participant",
  });
  assert.equal(participant.valid, false);
  assert.ok(participant.errors.some((error) => error.includes("at least two authored options")));
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

test("presentation-gate validation proves an exact finite record and recipient route", () => {
  const graph = graphWithPresentationGate();
  const valid = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
    roomIds: ["room-1"],
  });
  assert.equal(valid.valid, true, valid.errors.join("\n"));
  assert.ok(valid.reachableNodeIds.includes("talk-gated-lead"));

  const wrongRecipient = structuredClone(graph);
  wrongRecipient.presentationGates![0]!.requiredSuspectSeatId = "seat-2";
  const wrongRecipientResult = validateDebateMysteryDialogueGraphV2({
    graph: wrongRecipient,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
    roomIds: ["room-1"],
  });
  assert.equal(wrongRecipientResult.valid, false);
  assert.ok(wrongRecipientResult.errors.some((error) => error.includes("no exact finite Present route")));
});

test("presentation-gate validation rejects bad targets, self-locks, and unreachable required records", () => {
  const badTarget = graphWithPresentationGate();
  badTarget.presentationGates![0]!.unlocks = [{
    kind: "hotspot",
    roomId: "room-1",
    hotspotId: "missing-hotspot",
    nodeId: "missing-examination",
  }];
  const badTargetResult = validateDebateMysteryDialogueGraphV2({
    graph: badTarget,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
    roomIds: ["room-1"],
    hotspotIdsByRoom: { "room-1": ["known-hotspot"] },
  });
  assert.ok(badTargetResult.errors.some((error) => error.includes("targets invalid hotspot")));

  const selfLocked = graphWithPresentationGate();
  selfLocked.presentationGates![0]!.unlocks = [{
    kind: "record_discovery",
    record: validationRecordReferences[0]!,
  }];
  const selfLockedResult = validateDebateMysteryDialogueGraphV2({
    graph: selfLocked,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
    roomIds: ["room-1"],
  });
  assert.ok(selfLockedResult.errors.some((error) => error.includes("self-locks on required record")));

  const unreachable = graphWithPresentationGate();
  unreachable.nodes.find((entry) => entry.id === "checkpoint-seat-1")!.mutations.admitRecordIds = [];
  const unreachableResult = validateDebateMysteryDialogueGraphV2({
    graph: unreachable,
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
    roomIds: ["room-1"],
  });
  assert.ok(unreachableResult.errors.some((error) => error.includes("record is unreachable before the gate")));
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

test("Defense frame validation runs only when the frame is supplied", () => {
  const legacy = validateDebateMysteryDialogueGraphV2({
    graph: validGraph(),
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
  });
  assert.equal(legacy.valid, true, legacy.errors.join("\n"));
  const framed = validateDebateMysteryDialogueGraphV2({
    graph: validGraph(),
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
    defenseFrame: {
      defendantSeatId: "seat-2",
      frameEvidenceId: "evidence-seat-1",
      alibiSupportDiscoveryIds: ["alibi-a", "alibi-b"],
      investigation: true,
    },
  });
  assert.equal(framed.valid, true, framed.errors.join("\n"));
  const broken = validateDebateMysteryDialogueGraphV2({
    graph: validGraph(),
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
    defenseFrame: {
      defendantSeatId: "seat-9",
      frameEvidenceId: "evidence-unknown",
      alibiSupportDiscoveryIds: ["alibi-a", "alibi-missing"],
      investigation: true,
    },
  });
  assert.equal(broken.valid, false);
  assert.ok(broken.errors.some((error) => error.includes("not a frozen suspect")));
  assert.ok(broken.errors.some((error) => error.includes("has no witness chapter")));
  assert.ok(broken.errors.some((error) => error.includes("not a frozen Case File record")));
  assert.ok(broken.errors.some((error) => error.includes("alibi-missing is not discoverable")));
  const tooFew = validateDebateMysteryDialogueGraphV2({
    graph: validGraph(),
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
    defenseFrame: {
      defendantSeatId: "seat-2",
      frameEvidenceId: null,
      alibiSupportDiscoveryIds: ["alibi-a"],
      investigation: true,
    },
  });
  assert.ok(tooFew.errors.some((error) => error.includes("two outwardly independent alibi supports for the client")));
  // Court-only Defense cases have no investigation route to prove.
  const courtOnly = validateDebateMysteryDialogueGraphV2({
    graph: validGraph(),
    suspectSeatIds: ["seat-1", "seat-2"],
    recordReferences: validationRecordReferences,
    defenseFrame: {
      defendantSeatId: "seat-2",
      frameEvidenceId: "evidence-seat-1",
      alibiSupportDiscoveryIds: [],
      investigation: false,
    },
  });
  assert.equal(courtOnly.valid, true, courtOnly.errors.join("\n"));
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

test("lazy audio manifests remain valid without unspoken branch clips", () => {
  const graph = validGraph();
  const manifest: DebateMysteryAudioManifestV1 = {
    version: 1,
    preparationMode: "lazy-on-demand-v1",
    caseId: graph.caseId,
    caseHash: "case-hash",
    scriptHash: "script-hash",
    dialogueGraphHash: "graph-hash",
    engine: "prism-instant-local",
    model: "kokoro-82m-q8",
    modelVersion: "1",
    entries: [],
    complete: true,
    completedAt: "now",
    verifiedAt: "now",
  };
  assert.deepEqual(validateDebateMysteryAudioManifestV1({
    graph,
    manifest,
    reachableSpokenLineIds: ["line-press-seat-1"],
  }), { valid: true, errors: [] });
});

test("stage-cue performances require grounded beats and reject sealed disclosures", () => {
  const cue: DebateMysteryStageCueV1 = {
    version: 1,
    id: "cue-room-1",
    objective: "Invite an investigation without adding a clue.",
    emotionalState: "Guarded",
    knownFactIds: ["room", "speaker"],
    allowedFacts: [
      {
        id: "room",
        statement: "The room is the Library.",
        mentionFragments: ["Library"],
        required: true,
      },
      {
        id: "speaker",
        statement: "The speaker is Rowan.",
        mentionFragments: ["Rowan"],
        required: true,
      },
    ],
    requiredBeats: [{
      id: "invite",
      instruction: "Invite a careful look.",
      acceptedTextFragments: ["look", "search"],
    }],
    forbiddenDisclosures: ["i poisoned"],
    contradictionTrigger: null,
    exitCondition: "Return control after one line.",
    deterministicFallbackText: "I am Rowan. Look carefully around the Library.",
    maxCharacters: 180,
  };
  assert.equal(validateDebateMysteryStageCuePerformanceV1({
    cue,
    text: "I am Rowan. Look carefully around the Library.",
  }).valid, true);
  assert.match(
    validateDebateMysteryStageCuePerformanceV1({
      cue,
      text: "I am Rowan. I poisoned them. Look around the Library.",
    }).errors.join(" "),
    /forbidden disclosure/iu,
  );
  assert.match(
    validateDebateMysteryStageCuePerformanceV1({
      cue,
      text: "Look carefully around the room.",
    }).errors.join(" "),
    /required fact/iu,
  );
});

test("difficulty, eyewitness, Premium, and verdict contracts are deterministic", () => {
  assert.equal(debateMysteryCredibilityMaximumV2("casual"), 5);
  assert.equal(debateMysteryCredibilityMaximumV2("classic"), 4);
  assert.equal(debateMysteryCredibilityMaximumV2("mastermind"), 3);
  assert.equal(debateMysteryEyewitnessChanceV2("casual", "compact"), 0.05);
  assert.equal(debateMysteryEyewitnessChanceV2("classic", "grand"), 0.35);
  assert.equal(debateMysteryEyewitnessChanceV2("mastermind", "grand"), 0.5);
  assert.equal(debateMysteryPremiumAvailableV2(), true);
  assert.equal(debateMysteryPremiumAvailableV2("play"), true);
  assert.equal(debateMysteryPremiumAvailableV2("case_forge"), false);
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "guilty", accusedIsCulprit: false, proofEstablished: true, proofSafe: true }), "wrongful_conviction");
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "not_guilty", accusedIsCulprit: true, proofEstablished: true, proofSafe: true }), "acquittal_despite_proof");
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "guilty", accusedIsCulprit: true, proofEstablished: true, proofSafe: true, stance: "prosecution" }), "just_conviction");
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "not_guilty", accusedIsCulprit: false, proofEstablished: false, proofSafe: false }), "failed_prosecution");
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "guilty", accusedIsCulprit: false, proofEstablished: false, proofSafe: false, stance: "defense" }), "wrongful_conviction");
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "not_guilty", accusedIsCulprit: false, proofEstablished: true, proofSafe: true, stance: "defense", theoryNamedCulprit: true }), "just_acquittal");
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "not_guilty", accusedIsCulprit: false, proofEstablished: true, proofSafe: true, stance: "defense", theoryNamedCulprit: false }), "acquittal_without_truth");
  assert.equal(debateMysteryClassifyVerdictV2({ legalResult: "not_guilty", accusedIsCulprit: false, proofEstablished: true, proofSafe: true, stance: "defense" }), "acquittal_without_truth");
});

test("Whodunnit V2 setup defaults the player stance to prosecution and accepts defense", () => {
  const base = {
    version: 2 as const,
    preset: "compact" as const,
    difficulty: "casual" as const,
    artMode: "bundled" as const,
    trialType: "bench" as const,
    inspiration: "",
    nonce: "stance-default",
    suspectBotIds: ["suspect-1", "suspect-2", "suspect-3", "suspect-4"],
    prosecutorBotId: "prosecutor",
    rivalDefenseBotId: "defense",
    jurorBotIds: [],
  };
  const prosecution = resolveDebateMysteryConfigV2(base);
  assert.equal(prosecution.playerStance, "prosecution");
  assert.equal(debateMysteryPlayerStanceV2(prosecution), "prosecution");
  assert.equal(debateMysteryPlayerStanceV2(undefined), "prosecution");
  assert.equal(debateMysteryPlayerStanceV2({}), "prosecution");
  assert.equal(
    resolveDebateMysteryConfigV2({ ...base, playerStance: "sideways" as never }).playerStance,
    "prosecution",
  );
  const defense = resolveDebateMysteryConfigV2({
    ...base,
    playerStance: "defense",
    playerRole: "spectator",
  });
  assert.equal(defense.playerStance, "defense");
  assert.equal(debateMysteryPlayerStanceV2(defense), "defense");
  // Stance never moves the frozen seats; only their roles follow it.
  assert.equal(defense.playerRole, "spectator");
  assert.equal(defense.prosecutorBotId, "prosecutor");
  assert.equal(defense.rivalDefenseBotId, "defense");
});

test("new V2 mansions keep a two-floor minimum while compact stays easiest", () => {
  assert.deepEqual(DEBATE_MYSTERY_V2_PRESETS, [
    { id: "compact", floors: 2, rooms: 5, suspects: 4 },
    { id: "standard", floors: 2, rooms: 10, suspects: 6 },
    { id: "grand", floors: 3, rooms: 15, suspects: 8 },
  ]);
  const base = {
    version: 2 as const,
    preset: "compact" as const,
    difficulty: "casual" as const,
    artMode: "bundled" as const,
    trialType: "bench" as const,
    inspiration: "",
    nonce: "two-storey-compact",
    suspectBotIds: ["suspect-1", "suspect-2", "suspect-3", "suspect-4"],
    prosecutorBotId: "prosecutor",
    rivalDefenseBotId: "defense",
    jurorBotIds: [],
  };
  const compact = resolveDebateMysteryConfigV2(base);
  assert.equal(compact.floors, 2);
  assert.equal(compact.totalRooms, 5);
  assert.equal(compact.suspectBotIds.length, 4);
  assert.equal(compact.useRelevantAssetLibraryProps, false);
  assert.equal(resolveDebateMysteryConfigV2({
    ...base,
    useRelevantAssetLibraryProps: true,
  }).useRelevantAssetLibraryProps, true);
  assert.equal(resolveDebateMysteryConfigV2({
    ...base,
    preset: "custom",
    floors: 1,
  }).floors, 2);
  const grandWithSix = resolveDebateMysteryConfigV2({
    ...base,
    preset: "grand",
    suspectBotIds: [
      "suspect-1", "suspect-2", "suspect-3", "suspect-4", "suspect-5", "suspect-6",
    ],
  });
  assert.equal(grandWithSix.floors, 3);
  assert.equal(grandWithSix.totalRooms, 15);
  assert.equal(grandWithSix.suspectBotIds.length, 6);
});

test("Theme, asset synthesis, and reusable mansion eligibility freeze deterministically", () => {
  const pixelArtFirst = resolveDebateMysteryAssetSynthesisV2({
    investigationMode: "full",
    mansionBundleId: null,
    assetSynthesis: { rooms: true, illustratedRooms: false },
  });
  assert.equal(pixelArtFirst.rooms, true);
  assert.equal(pixelArtFirst.illustratedRooms, false);
  const explicitRealisticUpgrade = resolveDebateMysteryAssetSynthesisV2({
    investigationMode: "full",
    mansionBundleId: null,
    assetSynthesis: { rooms: true, illustratedRooms: true },
  });
  assert.equal(explicitRealisticUpgrade.rooms, true);
  assert.equal(explicitRealisticUpgrade.illustratedRooms, true);
  // A venue whose rooms already carry authored art takes HD derivatives
  // without a Mosaic request; Case Forge validates the venue side itself.
  const venueUpgradeOnly = resolveDebateMysteryAssetSynthesisV2({
    investigationMode: "full",
    mansionBundleId: "mansion-1",
    assetSynthesis: { rooms: false, illustratedRooms: true },
  });
  assert.equal(venueUpgradeOnly.rooms, false);
  assert.equal(venueUpgradeOnly.illustratedRooms, true);
  assert.equal(
    resolveDebateMysteryAssetSynthesisV2({
      investigationMode: "court_only",
      mansionBundleId: "mansion-1",
      assetSynthesis: { rooms: false, illustratedRooms: true },
    }).illustratedRooms,
    false,
  );

  const resolved = resolveDebateMysteryConfigV2({
    version: 2,
    preset: "compact",
    difficulty: "classic",
    artMode: "bundled",
    trialType: "bench",
    inspiration: "",
    spark: "Rainy art-deco observatory",
    assetSynthesis: { evidence: true, rooms: true, illustratedRooms: true, music: true, ambience: true },
    mansionBundleId: "mansion-1",
    nonce: "theme-contract",
    suspectBotIds: ["suspect-1", "suspect-2", "suspect-3", "suspect-4"],
    prosecutorBotId: "prosecutor",
    rivalDefenseBotId: "defense",
    jurorBotIds: [],
  });
  assert.equal(resolved.spark, "Rainy art-deco observatory");
  assert.deepEqual(resolved.assetSynthesis, {
    evidence: true,
    rooms: true,
    illustratedRooms: true,
    music: true,
    ambience: true,
  });
  assert.equal(resolved.investigationMode, "full");
  const courtOnly = resolveDebateMysteryConfigV2({
    ...resolved,
    investigationMode: "court_only",
    assetSynthesis: { evidence: true, rooms: true, illustratedRooms: true, music: true as never },
  });
  assert.equal(courtOnly.investigationMode, "court_only");
  assert.deepEqual(courtOnly.assetSynthesis, {
    evidence: true,
    rooms: false,
    illustratedRooms: false,
    music: false,
    ambience: false,
  });
  assert.equal(resolved.mansionBundleId, "mansion-1");
  assert.equal(
    resolved.houseStyle.id,
    debateMysteryHouseStyleV2("Rainy art-deco observatory").id,
  );
  assert.match(resolved.houseStyle.promptContract, /same mansion/iu);

  const completeRoom: DebateMysteryRoomV2 = {
    id: "room-1",
    name: "Observatory",
    floor: 1,
    emoji: "◇",
    imageId: null,
    bundledAssetPath: "rooms/observatory.webp",
    unlocked: true,
    visited: true,
    hotspots: [{
      id: "hotspot-1",
      label: "Telescope",
      polygon: [],
      examined: true,
      unlocked: true,
    }],
  };
  assert.equal(debateMysteryMansionBundleEligibleV2({ rooms: [completeRoom] }), true);
  assert.equal(debateMysteryMansionBundleEligibleV2({
    rooms: [{ ...completeRoom, hotspots: [{ ...completeRoom.hotspots[0]!, examined: false }] }],
  }), true);
  assert.equal(debateMysteryMansionBundleEligibleV2({
    rooms: [{ ...completeRoom, unlocked: false, visited: false }],
  }), true);
  assert.equal(debateMysteryMansionBundleEligibleV2({ rooms: [] }), false);
});

test("holds a library venue while an unfinished Archive Whodunnit still occupies it", () => {
  const session = {
    id: "case-1",
    status: "waiting_for_player",
    completedAt: null,
    format: "whodunnit",
    motion: { title: "The Violet House" },
    formatState: {
      format: "whodunnit" as const,
      version: 2 as const,
      playPhase: "investigation",
      caseTitle: "The Violet House",
      config: {
        mansionBundleId: "venue-a",
        mansionSnapshot: { sourceBundleId: "venue-a" },
      },
    },
  };
  const hold = debateMysteryVenueHeldBySessionV1({ bundleId: "venue-a", session });
  assert.deepEqual(hold, {
    version: 1,
    sessionId: "case-1",
    caseTitle: "The Violet House",
  });
  assert.equal(debateMysteryMansionHeldByArchiveV1({ archiveHold: hold }), true);
  assert.equal(
    debateMysteryVenueHeldBySessionV1({
      bundleId: "venue-a",
      session: { ...session, formatState: { ...session.formatState, playPhase: "trial" } },
    }),
    null,
  );
  assert.equal(
    debateMysteryVenueHeldBySessionV1({
      bundleId: "venue-b",
      session,
    }),
    null,
  );
  assert.equal(
    debateMysteryVenueHeldBySessionV1({
      bundleId: "venue-a",
      session: { ...session, status: "cancelled" },
    }),
    null,
  );
});

test("Spectator setup is preserved and its partner record selects only required physical proof", () => {
  const resolved = resolveDebateMysteryConfigV2({
    version: 2,
    preset: "compact",
    difficulty: "classic",
    artMode: "bundled",
    trialType: "bench",
    inspiration: "",
    nonce: "spectator-contract",
    suspectBotIds: ["suspect-1", "suspect-2", "suspect-3", "suspect-4"],
    prosecutorPartnerBotId: "partner",
    rivalDefenseBotId: "defense",
    jurorBotIds: [],
    playerRole: "spectator",
  });
  assert.equal(resolved.playerRole, "spectator");

  const graph = validGraph();
  graph.initialAdmittedRecordIds = ["evidence:opening", "testimony:not-yet-public"];
  graph.witnessChapters[1]!.statementVersions[0]!.correctPresentations = [{
    kind: "testimony",
    id: "prior-witness",
  }];
  assert.deepEqual(debateMysterySpectatorEvidenceReferencesV2(graph), [
    { kind: "evidence", id: "opening" },
    { kind: "evidence", id: "evidence-seat-1" },
  ]);
});

test("venue production reports what an installed Mystery Venue already provides", () => {
  const room = (id: string, art: Partial<{ imageId: string | null; acceptedRoomAssetId: string | null }> = {}) => ({
    kind: "room" as const,
    id,
    templateId: "study",
    name: id,
    floor: 1,
    x: 0,
    y: 0,
    rotation: 0 as never,
    suspectSlotId: null,
    emoji: "📚",
    imageId: null,
    bundledAssetPath: "bundled/study.png",
    acceptedRoomAssetId: null,
    ...art,
  });
  const complete = resolveDebateMysteryVenueProductionV1({
    name: " Blackwood House ",
    rooms: [],
    layoutV2: {
      entities: [
        room("foyer", { acceptedRoomAssetId: "asset-foyer" }),
        room("study", { imageId: "image-study" }),
        { kind: "corridor" as const, id: "hall", floor: 1, x: 0, y: 1, width: 2, height: 1 },
      ],
    } as never,
    assets: [],
    music: { version: 1, identity: {} as never, active: { id: "track" } as never, candidate: null, previous: null },
    atmosphere: { version: 1, active: null, candidate: null, previous: null },
    propTheme: null,
    propThemeProgress: { version: 1, registryVersion: 1 as never, totalCount: 16, readyCount: 9, pendingCount: 7, failedCount: 0, complete: false, variants: [] },
  });
  assert.equal(complete.venueName, "Blackwood House");
  assert.deepEqual(complete.roomArt, { totalRooms: 2, authoredRooms: 2, complete: true });
  assert.equal(complete.music, true, "an active soundtrack is reused, never requested");
  assert.equal(complete.atmosphere, false);
  assert.deepEqual(complete.propTheme, { readyCount: 9, totalCount: 16, complete: false });

  const partial = resolveDebateMysteryVenueProductionV1({
    name: "Half Manor",
    rooms: [
      { id: "a", imageId: "image-a" } as never,
      { id: "b", imageId: null } as never,
      { id: "c", imageId: null } as never,
    ],
    layoutV2: null,
    assets: [{ id: "m", role: "music", logicalId: "theme", mimeType: "audio/mpeg", sha256: "x", byteLength: 1 }],
    atmosphere: { version: 1, active: { id: "bed" } as never, candidate: null, previous: null },
    propTheme: { version: 1, registryVersion: 1 as never, variants: [{ id: "v" } as never] },
  });
  assert.deepEqual(partial.roomArt, { totalRooms: 3, authoredRooms: 1, complete: false });
  assert.equal(partial.music, true, "a bundled music asset counts as a venue soundtrack");
  assert.equal(partial.atmosphere, true);
  assert.deepEqual(partial.propTheme, { readyCount: 1, totalCount: 1, complete: true });

  const none = resolveDebateMysteryVenueProductionV1(null);
  assert.equal(none.venueName, null);
  assert.deepEqual(none.roomArt, { totalRooms: 0, authoredRooms: 0, complete: false });
  assert.equal(none.music, false);
  assert.equal(none.propTheme, null);
});

test("production capabilities speak plainly and keep ambience local while music is never forged", () => {
  const local = resolveDebateMysteryProductionCapabilitiesV1({ responseMode: "local", localVoiceAvailable: true });
  const byCategory = (mode: typeof local, category: string) =>
    mode.capabilities.find((capability) => capability.category === category)!;
  assert.equal(byCategory(local, "ambience").available, true, "the personalized mix is deterministic and local");
  assert.equal(byCategory(local, "music").available, false, "Case Forge does not compose music");
  assert.equal(byCategory(local, "mosaic_rooms").available, false);
  assert.match(byCategory(local, "mosaic_rooms").publicReason, /Needs ONLINE mode/u);
  const online = resolveDebateMysteryProductionCapabilitiesV1({ responseMode: "online", localVoiceAvailable: false });
  assert.equal(byCategory(online, "exterior").available, true);
  assert.match(byCategory(online, "exterior").publicReason, /this case only/u);
  assert.equal(byCategory(online, "voices").available, false);
  assert.match(byCategory(online, "voices").publicReason, /voice service is not running/u);
  for (const capability of [...local.capabilities, ...online.capabilities]) {
    assert.doesNotMatch(capability.publicReason, /case-scoped production asset|audited at Production Readiness/u);
  }
});

test("strips a leaked speaker label from a performed line, and only the speaker's own", () => {
  assert.equal(
    stripDebateMysterySpeakerLabelV2("Peter Griffin: What was your working relationship like?", "Peter Griffin"),
    "What was your working relationship like?",
  );
  assert.equal(stripDebateMysterySpeakerLabelV2("Sarah: Tense, obviously.", ["Sassy Sarah"]), "Tense, obviously.");
  assert.equal(stripDebateMysterySpeakerLabelV2("Avery: get over here.", "Sassy Sarah"), "Avery: get over here.");
  assert.equal(stripDebateMysterySpeakerLabelV2("Peter Griffin:", "Peter Griffin"), "Peter Griffin:");
  assert.equal(stripDebateMysterySpeakerLabelV2("The clock read nine: no later.", "Bob Ross"), "The clock read nine: no later.");
  assert.equal(stripDebateMysterySpeakerLabelV2("What was it like?", null), "What was it like?");
  const split = splitDebateMysteryStageActionTextV2("Sassy Sarah: *Pauses for a beat* Tense, obviously.", "Sassy Sarah");
  assert.equal(split.spokenText, "Tense, obviously.");
  assert.ok(split.stageActionText);
});

test("strips a Prosecutor's self-address from private reasoning and keeps other vocatives", () => {
  assert.equal(
    stripDebateMysterySelfAddressV2("Okay, Peter, the record is a neat little nightmare.", "Peter Griffin"),
    "Okay, the record is a neat little nightmare.",
  );
  assert.equal(stripDebateMysterySelfAddressV2("Peter Griffin — think about the timeline.", ["Peter Griffin"]), "Think about the timeline.");
  assert.equal(stripDebateMysterySelfAddressV2("Lois, where were you at nine?", "Peter Griffin"), "Lois, where were you at nine?");
  assert.equal(stripDebateMysterySelfAddressV2("The record is clear.", "Peter Griffin"), "The record is clear.");
});

test("swears a deterministic denial in plain words and still recognizes the retired contract phrasings", () => {
  const sworn = debateMysteryDeterministicDenialTextV2({ recordTitle: "Silver Key", recordClaim: "Vale withdrew at 9:30" });
  assert.equal(sworn, 'I know what the Silver Key is said to prove: "Vale withdrew at 9:30." That is false, and I will swear to it.');
  assert.equal(debateMysteryDeterministicDenialClaimV2(sworn), "Vale withdrew at 9:30");
  assert.equal(debateMysteryDeterministicDenialClaimV2("The assigned record's exact claim is false.", "the door was locked"), "the door was locked");
  assert.equal(debateMysteryDeterministicDenialClaimV2("The assigned record's exact claim is false: the door was locked"), "the door was locked");
  assert.equal(debateMysteryDeterministicDenialClaimV2("I was in the galley all night."), null);
  assert.equal(debateMysteryStatementIsContractEchoV2("The assigned record's exact claim is false."), true);
  assert.equal(debateMysteryStatementIsContractEchoV2(sworn), false);
  assert.match(debateMysteryDeterministicDenialTextV2({ recordTitle: "Silver Key" }), /did not happen that way/u);
});
