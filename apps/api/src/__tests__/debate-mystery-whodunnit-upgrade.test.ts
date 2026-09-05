import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PORTABLE_CASE_PACKAGE_SCHEMA_V1,
  PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1,
  canonicalPortablePackageJsonV1,
  proceduralPortableCaseThumbnailV1,
  validateDebateMysteryDialogueGraphV2,
  type DebateMysteryDialogueGraphV2,
  type MansionPackageManifestV1,
  type PortableCasePackageManifestV1,
  type PortablePackageJsonValueV1,
  type WhodunnitPackageManifestV1,
} from "@localai/shared";
import {
  decodeInternalCasePackageV1,
  encodeInternalCasePackageV1,
  portableWhodunnitCompositionRecordV1,
} from "../debate-mystery-case-package.ts";
import {
  decodeInternalMansionPackageV1,
  encodeInternalMansionPackageV1,
} from "../debate-mystery-mansion-codec.ts";
import {
  openPortableMysteryEnvelopeV1,
  sealPortableMysteryEnvelopeV1,
} from "../debate-mystery-package-envelope.ts";
import { preflightPortableMysteryArchiveV1 } from "../debate-mystery-package-safety.ts";
import {
  migrateDebateMysteryRoomOpeningCutscenesV2,
} from "../debate-mystery-v2.ts";
import {
  decodeInternalWhodunnitPackageV1,
  encodeInternalWhodunnitPackageV1,
  upgradePortableWhodunnitRoomCutscenesFileV1,
  upgradePortableWhodunnitRoomCutscenesV1,
} from "../debate-mystery-whodunnit-package.ts";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function asJson(value: unknown): PortablePackageJsonValueV1 {
  return JSON.parse(JSON.stringify(value)) as PortablePackageJsonValueV1;
}

const compatibility = {
  minimumFormatMajor: 1,
  maximumFormatMajor: 1,
  minimumPrismVersion: "0.15.1",
};
const creator = { name: "Portable Fixture", id: null, url: null };
const provenance = {
  createdAt: "2026-08-30T00:00:00.000Z",
  prismVersion: "0.15.1",
  generatedWith: ["fixture"],
};
const license = { name: "Private use", url: null, allowsRedistribution: false };

function legacyGraph(): DebateMysteryDialogueGraphV2 {
  const emptyRequirements = {
    discoveryIds: [],
    unlockedTopicIds: [],
    admittedRecordIds: [],
    choices: [],
  };
  const emptyMutations = {
    discoverIds: [],
    unlockTopicIds: [],
    admitRecordIds: [],
    choices: [],
  };
  return {
    version: 2,
    caseId: "portable-session",
    initialDiscoveryIds: [],
    initialAdmittedRecordIds: [],
    interactionRootNodeIds: ["intro-casekeeper", "prosecutor-strategy"],
    nodes: [
      {
        id: "intro-casekeeper",
        kind: "room_introduction",
        scene: "investigation",
        speakerSeatId: null,
        intendedRecipientSeatId: "seat-1",
        lineId: "line-intro-casekeeper",
        label: null,
        locationId: "room-1",
        talkSubject: null,
        requirements: emptyRequirements,
        mutations: emptyMutations,
        recordReferences: [],
        nextNodeIds: ["intro-persona"],
        terminalOutcome: null,
      },
      {
        id: "intro-persona",
        kind: "room_introduction",
        scene: "investigation",
        speakerSeatId: "seat-1",
        intendedRecipientSeatId: null,
        lineId: "line-intro-persona",
        label: null,
        locationId: "room-1",
        talkSubject: null,
        requirements: emptyRequirements,
        mutations: emptyMutations,
        recordReferences: [],
        nextNodeIds: [],
        terminalOutcome: "return_to_room",
      },
      {
        id: "prosecutor-strategy",
        kind: "prosecutor_strategy",
        scene: "court",
        speakerSeatId: null,
        intendedRecipientSeatId: null,
        lineId: "line-prosecutor-strategy",
        label: null,
        locationId: null,
        talkSubject: null,
        requirements: emptyRequirements,
        mutations: emptyMutations,
        recordReferences: [],
        nextNodeIds: [],
        terminalOutcome: "return_to_room",
      },
    ],
    lines: [
      {
        id: "line-intro-casekeeper",
        nodeId: "intro-casekeeper",
        speakerKind: "narrator",
        speakerBotId: null,
        stageActionText: null,
        visibleText: "Rain traces the study windows while the desk lamp burns low.",
        spokenText: "Rain traces the study windows while the desk lamp burns low.",
        performance: { mood: "observant", pace: "measured", intensity: 1, actorNote: "Hold." },
        mode: "text_only",
        reusableCalloutKey: null,
      },
      {
        id: "line-intro-persona",
        nodeId: "intro-persona",
        speakerKind: "bot",
        speakerBotId: "bot-suspect",
        stageActionText: "Folds their hands on the desk.",
        visibleText: "You wanted to speak with me?",
        spokenText: "You wanted to speak with me?",
        performance: { mood: "guarded", pace: "natural", intensity: 1, actorNote: "Stay composed." },
        mode: "spoken",
        reusableCalloutKey: null,
      },
      {
        id: "line-prosecutor-strategy",
        nodeId: "prosecutor-strategy",
        speakerKind: "player",
        speakerBotId: "bot-prosecutor",
        stageActionText: "Reviews the case notes.",
        visibleText: "I will keep the public record and every inference separate.",
        spokenText: "I will keep the public record and every inference separate.",
        performance: { mood: "focused", pace: "measured", intensity: 1, actorNote: "Think aloud." },
        mode: "spoken",
        reusableCalloutKey: null,
      },
    ],
    witnessChapters: [],
    prosecutionChoices: [],
    roomIntroductionNodeIdsByRoom: {
      "room-1": {
        casekeeperNodeId: "intro-casekeeper",
        personaNodeId: "intro-persona",
        suspectSeatId: "seat-1",
      },
    },
    talkTopicNodeIdsBySuspect: {},
    presentNodeIdsBySuspect: {},
    prosecutorStrategyNodeId: "prosecutor-strategy",
    verdictNodeIds: [],
  };
}

function privateCase(graph: DebateMysteryDialogueGraphV2): Record<string, PortablePackageJsonValueV1> {
  const validation = validateDebateMysteryDialogueGraphV2({
    graph,
    suspectSeatIds: [],
    recordReferences: [],
    playerRole: "participant",
    roomIds: ["room-1"],
    personIds: ["seat-1"],
    hotspotIdsByRoom: { "room-1": [] },
    prosecutorBotId: "bot-prosecutor",
  });
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  return {
    config: {
      playerRole: "participant",
      prosecutorBotId: "bot-prosecutor",
      rivalDefenseBotId: "bot-defense",
    },
    actorAccounts: [],
    recordItems: [],
    investigationRoomIds: ["room-1"],
    investigationPersonIds: ["seat-1"],
    investigationHotspotIdsByRoom: { "room-1": [] },
    accusedAlibiSupportDiscoveryIds: [],
    graphValidation: asJson(validation),
    sealedFixtureTruth: { answer: "preserve-this-exactly" },
  };
}

function mansionManifest(): MansionPackageManifestV1 {
  return {
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1 },
    packageId: "mansion-fixture",
    title: "Fixture House",
    description: "A package-upgrade fixture.",
    creator,
    provenance,
    license,
    contentWarnings: [],
    compatibility,
    floorCount: 1,
    rooms: [{
      id: "room-1",
      templateId: "study",
      name: "Study",
      floor: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      neighborIds: [],
      slots: [{ id: "slot-1", x: 0.5, y: 0.5 }],
      emoji: "📚",
      roomAssetId: null,
      propAssetIds: [],
    }],
    houseStyle: { id: "classic", label: "Classic", promptContract: "A quiet manor study." },
    assets: [],
    previewAssetId: null,
    investigationThemeAssetId: null,
  };
}

function sealComponent(args: {
  payload: Uint8Array;
  packageType: "case" | "mansion";
  title: string;
}): Uint8Array {
  const preflight = preflightPortableMysteryArchiveV1(args.payload);
  return sealPortableMysteryEnvelopeV1({
    payload: args.payload,
    mode: "spoiler_seal",
    metadata: {
      packageType: args.packageType,
      title: args.title,
      creatorName: creator.name,
      compatibility,
      expandedBytes: preflight.expandedBytes,
      assetCount: 0,
      contentWarnings: [],
    },
  });
}

function fixtureEnvelope(): Uint8Array {
  const graph = legacyGraph();
  const sealedPrivate = privateCase(graph);
  const publicCase = { roomIntroductions: { "room-1": "unseen" }, fixture: "public" };
  const mansion = mansionManifest();
  const mansionArchive = sealComponent({
    payload: encodeInternalMansionPackageV1({ manifest: mansion, assets: new Map() }),
    packageType: "mansion",
    title: mansion.title,
  });
  const privateCanonical = canonicalPortablePackageJsonV1(asJson(sealedPrivate));
  const graphCanonical = canonicalPortablePackageJsonV1(asJson(graph));
  const caseManifest: PortableCasePackageManifestV1 = {
    schema: PORTABLE_CASE_PACKAGE_SCHEMA_V1,
    formatVersion: { major: 1, minor: PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1 },
    packageId: "case-fixture",
    title: "The Package Fixture",
    description: "A certified package-upgrade fixture.",
    storyTags: ["Closed circle"],
    creator,
    provenance,
    license,
    contentWarnings: [],
    compatibility,
    difficulty: "classic",
    trialType: "bench",
    investigationMode: "full",
    thumbnail: proceduralPortableCaseThumbnailV1("case-fixture"),
    mansionRequirements: {
      version: 1,
      suspectCount: 1,
      minimumRoomCount: 1,
      minimumFloorCount: 1,
      rooms: [{
        id: "room-1",
        role: "suspect",
        templateId: "study",
        suspectSeatId: "seat-1",
        hotspotCount: 1,
      }],
    },
    certification: {
      version: 1,
      investigationCompletedAt: "2026-08-30T00:30:00.000Z",
      caseHash: sha256(privateCanonical),
      graphHash: sha256(graphCanonical),
      graphValid: true,
      validatorVersion: 1,
    },
    cast: [
      { id: "bot-prosecutor", name: "Prosecutor", presentation: {}, voiceId: null },
      { id: "bot-suspect", name: "Suspect", presentation: {}, voiceId: null },
    ],
    publicCase,
    privateCase: sealedPrivate,
    proofContract: {
      accusedAlibiSupportDiscoveryIds: sealedPrivate.accusedAlibiSupportDiscoveryIds!,
      graphValidation: sealedPrivate.graphValidation!,
    },
    dialogueGraph: graph as unknown as Record<string, PortablePackageJsonValueV1>,
    court: { witnessChapters: [], prosecutionChoices: [], verdictNodeIds: [] },
    evidenceAssignments: {
      recordItems: sealedPrivate.recordItems!,
      investigationRoomIds: sealedPrivate.investigationRoomIds!,
      investigationHotspotIdsByRoom: sealedPrivate.investigationHotspotIdsByRoom!,
    },
  };
  const caseArchive = sealComponent({
    payload: encodeInternalCasePackageV1(caseManifest),
    packageType: "case",
    title: caseManifest.title,
  });
  const composition = portableWhodunnitCompositionRecordV1({ caseArchive, mansionArchive });
  const completedPlaythrough = {
    schema: "prism-whodunnit-playthrough-v1" as const,
    completedAt: "2026-08-30T01:00:00.000Z",
    transcript: [{ lineId: "historical-line", visibleText: "Historical replay." }],
    discoveryIds: ["historical-discovery"],
    prosecutionChoiceIds: [],
    record: [],
    theory: { culpritSeatId: "seat-1" },
    court: { phase: "complete" },
    verdict: { classification: "not_guilty" },
    calloutHistory: [],
  };
  const manifest: WhodunnitPackageManifestV1 = {
    schema: "prism-whodunnit-package-v1",
    formatVersion: { major: 1, minor: PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1 },
    packageId: "whodunnit-fixture",
    title: "The Package Fixture",
    description: "An authenticated composed Whodunnit fixture.",
    creator,
    provenance,
    license,
    contentWarnings: [],
    compatibility,
    composition,
    mansionManifest: mansion,
    mansionManifestSha256: sha256(canonicalPortablePackageJsonV1(asJson(mansion))),
    cast: caseManifest.cast,
    publicCase,
    privateCase: sealedPrivate,
    proofContract: {
      accusedAlibiSupportDiscoveryIds: sealedPrivate.accusedAlibiSupportDiscoveryIds!,
      graphValidation: sealedPrivate.graphValidation!,
    },
    dialogueGraph: graph as unknown as Record<string, PortablePackageJsonValueV1>,
    court: { witnessChapters: [], prosecutionChoices: [], verdictNodeIds: [] },
    evidenceAssignments: {
      recordItems: sealedPrivate.recordItems!,
      investigationRoomIds: sealedPrivate.investigationRoomIds!,
      investigationHotspotIdsByRoom: sealedPrivate.investigationHotspotIdsByRoom!,
    },
    voices: [],
    assets: [],
    runtime: {
      session: publicCase,
      compiledPublicState: { playPhase: "title_card", roomIntroductions: { "room-1": "unseen" } },
      completedPlaythrough,
      audioManifest: {
        version: 1,
        caseId: "portable-session",
        caseHash: "old-case-hash",
        dialogueGraphHash: "old-graph-hash",
        preparationMode: "lazy-on-demand-v1",
        entries: [],
      },
      assetBindings: [],
    },
    silent: true,
  };
  const payload = encodeInternalWhodunnitPackageV1({
    manifest,
    assets: new Map(),
    components: new Map([
      [composition.case.archivePath, caseArchive],
      [composition.mansion.archivePath, mansionArchive],
    ]),
  });
  const preflight = preflightPortableMysteryArchiveV1(payload);
  return sealPortableMysteryEnvelopeV1({
    payload,
    mode: "spoiler_seal",
    metadata: {
      packageType: "whodunnit",
      title: manifest.title,
      creatorName: creator.name,
      compatibility,
      expandedBytes: preflight.expandedBytes,
      assetCount: 0,
      contentWarnings: [],
    },
  });
}

const migrateGraph = ({ graph, prosecutorBotId }: {
  graph: DebateMysteryDialogueGraphV2;
  prosecutorBotId: string;
}) => migrateDebateMysteryRoomOpeningCutscenesV2({ graph, prosecutorBotId });

test("authenticated room-cutscene upgrade preserves canonical case data and migrates both graphs", async () => {
  const source = fixtureEnvelope();
  const sourceBytes = Buffer.from(source);
  const sourceHash = sha256(source);
  const sourceDecoded = decodeInternalWhodunnitPackageV1(
    openPortableMysteryEnvelopeV1({ envelope: source }).payload,
  );
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error("network access is forbidden in package migration");
  }) as typeof fetch;
  try {
    const upgraded = await upgradePortableWhodunnitRoomCutscenesV1({
      envelope: source,
      prismVersion: "0.15.1-cutscene-test",
      migrateGraph,
    });
    assert.equal(upgraded.changed, true);
    assert.equal(upgraded.upgradedRoomCount, 1);
    assert.notEqual(upgraded.packageId, upgraded.sourcePackageId);
    assert.equal(sha256(source), sourceHash);
    assert.deepEqual(Buffer.from(source), sourceBytes);
    assert.equal(fetchCalls, 0);

    const decoded = decodeInternalWhodunnitPackageV1(
      openPortableMysteryEnvelopeV1({ envelope: upgraded.envelope }).payload,
    );
    const intro = (decoded.manifest.dialogueGraph as unknown as DebateMysteryDialogueGraphV2)
      .roomIntroductionNodeIdsByRoom?.["room-1"];
    assert.ok(intro?.openingExchangeNodeIds);
    assert.equal(intro.personaNodeId, intro.openingExchangeNodeIds.occupantResponseNodeId);
    assert.deepEqual(
      decoded.manifest.runtime.completedPlaythrough,
      sourceDecoded.manifest.runtime.completedPlaythrough,
    );
    assert.deepEqual(decoded.manifest.cast, sourceDecoded.manifest.cast);
    assert.deepEqual(decoded.manifest.publicCase, sourceDecoded.manifest.publicCase);
    assert.deepEqual(decoded.manifest.assets, sourceDecoded.manifest.assets);
    assert.deepEqual(
      decoded.manifest.privateCase.sealedFixtureTruth,
      sourceDecoded.manifest.privateCase.sealedFixtureTruth,
    );
    const mansionPath = decoded.manifest.composition!.mansion.archivePath;
    assert.deepEqual(decoded.components!.get(mansionPath), sourceDecoded.components!.get(mansionPath));
    decodeInternalMansionPackageV1(
      openPortableMysteryEnvelopeV1({ envelope: decoded.components!.get(mansionPath)! }).payload,
    );

    const casePath = decoded.manifest.composition!.case.archivePath;
    const upgradedCase = decodeInternalCasePackageV1(
      openPortableMysteryEnvelopeV1({ envelope: decoded.components!.get(casePath)! }).payload,
    );
    const caseIntro = (upgradedCase.dialogueGraph as unknown as DebateMysteryDialogueGraphV2)
      .roomIntroductionNodeIdsByRoom?.["room-1"];
    assert.ok(caseIntro?.openingExchangeNodeIds);
    assert.equal(caseIntro.personaNodeId, caseIntro.openingExchangeNodeIds.occupantResponseNodeId);
    assert.deepEqual(
      upgradedCase.privateCase.sealedFixtureTruth,
      sourceDecoded.manifest.privateCase.sealedFixtureTruth,
    );
    assert.equal(
      upgradedCase.certification.caseHash,
      sha256(canonicalPortablePackageJsonV1(asJson(upgradedCase.privateCase))),
    );
    assert.equal(
      upgradedCase.certification.graphHash,
      sha256(canonicalPortablePackageJsonV1(asJson(upgradedCase.dialogueGraph))),
    );

    const repeated = await upgradePortableWhodunnitRoomCutscenesV1({
      envelope: upgraded.envelope,
      prismVersion: "0.15.1-cutscene-test",
      migrateGraph,
    });
    assert.equal(repeated.changed, false);
    assert.deepEqual(Buffer.from(repeated.envelope), Buffer.from(upgraded.envelope));
    assert.equal(repeated.packageId, upgraded.packageId);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("upgrade rejects divergent flattened and embedded cutscene semantics", async () => {
  await assert.rejects(
    upgradePortableWhodunnitRoomCutscenesV1({
      envelope: fixtureEnvelope(),
      prismVersion: "0.15.1-cutscene-test",
      migrateGraph: ({ scope, graph, prosecutorBotId }) => {
        const migrated = migrateDebateMysteryRoomOpeningCutscenesV2({ graph, prosecutorBotId });
        if (scope !== "case" || !migrated.changed) return migrated;
        const exchange = migrated.graph.roomIntroductionNodeIdsByRoom?.["room-1"]
          ?.openingExchangeNodeIds;
        const handoffNode = migrated.graph.nodes.find(
          (node) => node.id === exchange?.prosecutionHandoffNodeId,
        );
        const handoffLine = migrated.graph.lines.find((line) => line.id === handoffNode?.lineId);
        assert.ok(handoffLine);
        handoffLine.visibleText = "A divergent embedded-only handoff.";
        handoffLine.spokenText = handoffLine.visibleText;
        return migrated;
      },
    }),
    /different room-cutscene coverage/iu,
  );
});

test("side-by-side upgrader never overwrites the source or an existing output", async () => {
  const directory = mkdtempSync(join(tmpdir(), "prism-whodunnit-upgrade-"));
  const inputPath = join(directory, "source.whodunnit");
  const outputPath = join(directory, "source-cutscenes-v1.whodunnit");
  const source = fixtureEnvelope();
  const collision = Buffer.from("existing output must survive");
  try {
    writeFileSync(inputPath, source);
    writeFileSync(outputPath, collision);
    await assert.rejects(
      upgradePortableWhodunnitRoomCutscenesFileV1({
        inputPath,
        outputPath,
        prismVersion: "0.15.1-cutscene-test",
        migrateGraph,
      }),
      /output already exists/iu,
    );
    assert.deepEqual(readFileSync(inputPath), source);
    assert.deepEqual(readFileSync(outputPath), collision);
    rmSync(outputPath);

    const written = await upgradePortableWhodunnitRoomCutscenesFileV1({
      inputPath,
      outputPath,
      prismVersion: "0.15.1-cutscene-test",
      migrateGraph,
    });
    assert.equal(written.written, true);
    assert.equal(written.inputSha256, sha256(source));
    assert.equal(written.outputSha256, sha256(readFileSync(outputPath)));
    assert.deepEqual(readFileSync(inputPath), source);
    const preservedOutput = readFileSync(outputPath);
    await assert.rejects(
      upgradePortableWhodunnitRoomCutscenesFileV1({
        inputPath,
        outputPath,
        prismVersion: "0.15.1-cutscene-test",
        migrateGraph,
      }),
      /output already exists/iu,
    );
    assert.deepEqual(readFileSync(outputPath), preservedOutput);
    await assert.rejects(
      upgradePortableWhodunnitRoomCutscenesFileV1({
        inputPath,
        outputPath: inputPath,
        prismVersion: "0.15.1-cutscene-test",
        migrateGraph,
      }),
      /never the source package/iu,
    );
    assert.deepEqual(readFileSync(inputPath), source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
