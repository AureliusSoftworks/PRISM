import assert from "node:assert/strict";
import test from "node:test";
import {
  DEBATE_MYSTERY_MANSION_GRID,
  DEBATE_MYSTERY_ROOM_FOOTPRINTS,
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  compileDeterministicDebateMystery,
  debateMysteryAccompliceChance,
  debateMysteryRoomFloorRuleV1,
  debateMysteryRoomTypeIsAllowedOnFloorV1,
  debateMysteryRoomsShareEdge,
  debateMysteryNotebookCharacterCount,
  gradeDebateMysteryTheory,
  normalizeDebateMysteryFormatStateV1,
  projectDebateMysteryCase,
  resolveDebateMysteryConfig,
  resolveDebateMysteryWeaponCategory,
  shouldRevealDebateMysteryWeaponAtOpening,
  updateDebateMysteryPublicLeads,
  validateDebateMysteryCaseBible,
  validateDebateMysteryNotebookCleanupProposal,
  type DebateMysteryNotebookCleanupProposalV1,
  type DebateMysteryNotebookV1,
  type DebateWhodunnitCreateConfigV1,
  type DebateWhodunnitFormatStateV1,
} from "./debateMystery.ts";

function createConfig(
  preset: "compact" | "standard" | "grand",
  difficulty: "casual" | "classic" | "mastermind",
  nonce: string,
): DebateWhodunnitCreateConfigV1 {
  const suspectCount = preset === "compact" ? 4 : preset === "standard" ? 6 : 8;
  return {
    version: 1,
    preset,
    difficulty,
    artMode: "bundled",
    inspiration: "",
    nonce,
    suspectBotIds: Array.from({ length: suspectCount }, (_, index) => `bot-${index + 1}`),
    prosecutorPartnerBotId: "prosecutor",
    rivalDefenseBotId: "defense",
  };
}

function suspects(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    botId: `bot-${index + 1}`,
    exportHash: `hash-${index + 1}`,
    name: `Suspect ${index + 1}`,
    color: null,
    glyph: null,
  }));
}

test("reserves accomplices for Mastermind mysteries", () => {
  assert.equal(debateMysteryAccompliceChance("casual", "grand", 8), 0);
  assert.equal(debateMysteryAccompliceChance("classic", "grand", 8), 0);
  assert.equal(debateMysteryAccompliceChance("mastermind", "compact", 4), 0);
  assert.equal(debateMysteryAccompliceChance("mastermind", "standard", 6), 0.25);
  assert.equal(debateMysteryAccompliceChance("mastermind", "grand", 8), 0.35);
  assert.equal(debateMysteryAccompliceChance("mastermind", "custom", 7), 0.35);

  assert.equal(
    resolveDebateMysteryConfig(
      createConfig("grand", "classic", "no-lower-difficulty-accomplice"),
    ).accompliceChance,
    0,
  );
});

test("bundles at least fifteen original semantic room templates with accessible regions", () => {
  assert.ok(DEBATE_MYSTERY_ROOM_TEMPLATES.length >= 15);
  for (const template of DEBATE_MYSTERY_ROOM_TEMPLATES) {
    const broadRegions = template.regions.filter((region) => !region.id.includes(":detail-"));
    const detailRegions = template.regions.filter((region) => region.id.includes(":detail-"));
    assert.ok(broadRegions.length >= 6 && broadRegions.length <= 10);
    assert.equal(detailRegions.length, broadRegions.length * 3);
    assert.equal(new Set(template.regions.map((region) => region.id)).size, template.regions.length);
    assert.equal(
      new Set(template.regions.map((region) => JSON.stringify(region.polygon))).size,
      template.regions.length,
    );
    for (const region of template.regions) {
      assert.ok(region.polygon.length >= 4);
      for (const point of region.polygon) {
        assert.ok(point.x >= 0 && point.x <= 100);
        assert.ok(point.y >= 0 && point.y <= 100);
      }
    }
  }
});

test("keeps sparse generator-v1 Case Bibles valid while generator-v2 cases require dense searches", () => {
  const config = resolveDebateMysteryConfig(createConfig("compact", "classic", "legacy-density"));
  const current = compileDeterministicDebateMystery({ config, suspects: suspects(4) });
  const requiredRegionTargets = new Set(
    current.accessLocks
      .filter((lock) => lock.targetKind === "region")
      .map((lock) => lock.targetId),
  );
  const legacy = {
    ...current,
    generatorVersion: 1,
    activeRegions: current.rooms.flatMap((room) => {
      const roomOutcomes = current.activeRegions.filter((outcome) => outcome.roomId === room.id);
      return roomOutcomes.filter((outcome, index) => (
        index < 2
        || Boolean(outcome.evidenceId)
        || Boolean(outcome.inventoryItemId)
        || requiredRegionTargets.has(`${outcome.roomId}:${outcome.regionId}`)
      ));
    }),
  };
  assert.equal(validateDebateMysteryCaseBible(legacy, config.actionBudget).valid, true);
  assert.equal(
    validateDebateMysteryCaseBible({ ...legacy, generatorVersion: 2 }, config.actionBudget).valid,
    false,
  );
});

test("writes the deterministic player-Prosecutor opening in first person", () => {
  const config = resolveDebateMysteryConfig(
    createConfig("compact", "classic", "first-person-opening"),
  );
  const bible = compileDeterministicDebateMystery({ config, suspects: suspects(4) });
  assert.match(bible.publicOpening, /\bI am the lead investigator\./u);
  assert.doesNotMatch(bible.publicOpening, /\bYou are the lead investigator\./u);
});

test("locks weapon category and opening-reveal probability boundaries deterministically", () => {
  assert.equal(resolveDebateMysteryWeaponCategory(0), "poison");
  assert.equal(resolveDebateMysteryWeaponCategory(0.249999), "poison");
  assert.equal(resolveDebateMysteryWeaponCategory(0.25), "ordinary_object");
  assert.equal(resolveDebateMysteryWeaponCategory(0.749999), "ordinary_object");
  assert.equal(resolveDebateMysteryWeaponCategory(0.75), "recognizable_weapon");
  assert.equal(shouldRevealDebateMysteryWeaponAtOpening(0.499999), true);
  assert.equal(shouldRevealDebateMysteryWeaponAtOpening(0.5), false);
  const resolvedConfig = resolveDebateMysteryConfig(createConfig("compact", "classic", "weapon-boundary"));
  const bible = compileDeterministicDebateMystery({ config: resolvedConfig, suspects: suspects(4) });
  assert.equal(bible.evidence.filter((item) => item.isCanonicalWeapon).length, 1);
  assert.equal(bible.evidence.find((item) => item.isCanonicalWeapon)?.object, bible.weapon.descriptor);
  assert.ok(bible.evidence.some((item) => item.relation === "related"));
  assert.ok(bible.evidence.some((item) => item.relation === "unrelated"));

  const openingBible = structuredClone(bible);
  openingBible.weapon.revealedAtOpening = true;
  const openingState = projectDebateMysteryCase(openingBible, resolvedConfig);
  const canonicalWeapon = openingBible.evidence.find((item) => item.isCanonicalWeapon)!;
  const crimeScene = openingState.rooms.find((room) => room.id === openingBible.crimeSceneRoomId)!;
  assert.deepEqual(openingState.discoveredEvidence.map((item) => item.id), [canonicalWeapon.id]);
  assert.ok(crimeScene.inspectedRegionIds.includes(canonicalWeapon.regionId));

  const hiddenBible = structuredClone(bible);
  hiddenBible.weapon.revealedAtOpening = false;
  const hiddenState = projectDebateMysteryCase(hiddenBible, resolvedConfig);
  assert.equal(hiddenState.discoveredEvidence.length, 0);
  assert.ok(!hiddenState.rooms.find((room) => room.id === hiddenBible.crimeSceneRoomId)!
    .inspectedRegionIds.includes(canonicalWeapon.regionId));
});

test("chooses a deterministic non-foyer incident scene", () => {
  const config = resolveDebateMysteryConfig(
    createConfig("standard", "classic", "random-incident-room"),
  );
  const first = compileDeterministicDebateMystery({ config, suspects: suspects(6) });
  const replay = compileDeterministicDebateMystery({ config, suspects: suspects(6) });
  const incidentScene = first.rooms.find((room) => room.id === first.crimeSceneRoomId);
  assert.ok(incidentScene);
  assert.notEqual(incidentScene.templateId, "foyer");
  assert.equal(incidentScene.kind, "crime_scene");
  assert.equal(replay.crimeSceneRoomId, first.crimeSceneRoomId);
  assert.equal(first.rooms.filter((room) => room.kind === "crime_scene").length, 1);
  const incidentSceneIds = new Set(
    Array.from({ length: 12 }, (_, index) => {
      const seededConfig = resolveDebateMysteryConfig(
        createConfig("standard", "classic", `random-incident-room-${index}`),
      );
      return compileDeterministicDebateMystery({
        config: seededConfig,
        suspects: suspects(6),
      }).crimeSceneRoomId;
    }),
  );
  assert.ok(incidentSceneIds.size > 1, "different case seeds distribute incidents across the mansion");
});

test("uses the classic action budgets and freezes one hidden recovery token per five rooms", () => {
  const expectations = [
    { preset: "compact" as const, suspects: 4, rooms: 5, actions: 16, tokens: 1 },
    { preset: "standard" as const, suspects: 6, rooms: 10, actions: 28, tokens: 2 },
    { preset: "grand" as const, suspects: 8, rooms: 15, actions: 40, tokens: 3 },
  ];

  for (const expectation of expectations) {
    const config = resolveDebateMysteryConfig(createConfig(expectation.preset, "classic", `action-economy-${expectation.preset}`));
    const first = compileDeterministicDebateMystery({ config, suspects: suspects(expectation.suspects) });
    const second = compileDeterministicDebateMystery({ config, suspects: suspects(expectation.suspects) });
    const projected = projectDebateMysteryCase(first, config);

    assert.equal(config.totalRooms, expectation.rooms);
    assert.equal(config.actionBudget, expectation.actions);
    assert.equal(first.actionTokens?.length, expectation.tokens);
    assert.deepEqual(first.actionTokens, second.actionTokens);
    assert.equal(new Set(first.actionTokens?.map((token) => token.id)).size, expectation.tokens);
    assert.equal(new Set(first.actionTokens?.map((token) => token.roomId)).size, expectation.tokens);
    assert.ok(first.actionTokens?.every((token) =>
      token.amount === 1 && first.activeRegions.some((region) => region.roomId === token.roomId && region.regionId === token.regionId)));
    assert.deepEqual(projected.recoveredActionTokens, []);
    assert.ok(first.actionTokens?.every((token) => !JSON.stringify(projected).includes(token.id)));
  }
});

test("backfills met suspects from both saved interview history and an active legacy interview", () => {
  const config = resolveDebateMysteryConfig(createConfig("compact", "classic", "encounter-backfill"));
  const bible = compileDeterministicDebateMystery({ config, suspects: suspects(4) });
  const projected = projectDebateMysteryCase(bible, config);
  const [activeSuspect, historicalSuspect] = projected.suspects;
  const legacy = structuredClone(projected) as typeof projected & { metSuspectSeatIds?: string[] };
  legacy.metSuspectSeatIds = [];
  legacy.activeActivity = { kind: "interview", suspectSeatId: activeSuspect!.seatId, startedAt: "2026-08-22T12:00:00.000Z" };
  legacy.interviewLog = [{ id: "legacy-answer", suspectSeatId: historicalSuspect!.seatId, role: "suspect", content: "I was there.", evidenceId: null, createdAt: "2026-08-22T12:01:00.000Z" }];

  const normalized = normalizeDebateMysteryFormatStateV1(legacy);
  assert.deepEqual(new Set(normalized.metSuspectSeatIds), new Set([activeSuspect!.seatId, historicalSuspect!.seatId]));
});

test("opens new cases on a persisted investigation assignment without resurfacing it for legacy saves", () => {
  const config = resolveDebateMysteryConfig(createConfig("compact", "classic", "investigation-assignment"));
  const bible = compileDeterministicDebateMystery({ config, suspects: suspects(4) });
  const projected = projectDebateMysteryCase(bible, config);
  assert.equal(projected.investigationApproach, "undecided");

  const legacy = structuredClone(projected) as unknown as Record<string, unknown>;
  delete legacy.investigationApproach;
  const normalized = normalizeDebateMysteryFormatStateV1(legacy);
  assert.equal(normalized.investigationApproach, "player");
});

test("treats an already-used legacy room investigation as action-committed", () => {
  const config = resolveDebateMysteryConfig(createConfig("compact", "classic", "investigation-commit-backfill"));
  const bible = compileDeterministicDebateMystery({ config, suspects: suspects(4) });
  const legacy = structuredClone(projectDebateMysteryCase(bible, config)) as unknown as Record<string, unknown>;
  const rooms = legacy.rooms as DebateWhodunnitFormatStateV1["rooms"];
  const activeRoom = rooms.find((room) => room.id === bible.crimeSceneRoomId)!;
  activeRoom.inspectedRegionIds = [activeRoom.activeRegionIds[0]!];
  legacy.activeActivity = {
    kind: "investigation",
    roomId: activeRoom.id,
    startedAt: "2026-08-22T12:00:00.000Z",
  };

  const normalized = normalizeDebateMysteryFormatStateV1(legacy);
  assert.equal(normalized.activeActivity?.kind, "investigation");
  if (normalized.activeActivity?.kind === "investigation") {
    assert.equal(normalized.activeActivity.actionCommitted, true);
  }
});

test("fails closed when loading a legacy continuance save", () => {
  const config = resolveDebateMysteryConfig(createConfig("compact", "classic", "legacy-continuance"));
  const bible = compileDeterministicDebateMystery({ config, suspects: suspects(4) });
  const legacy = structuredClone(projectDebateMysteryCase(bible, config)) as unknown as Record<string, unknown>;
  legacy.playPhase = "continuance";
  legacy.actionsRemaining = 3;
  legacy.activeActivity = {
    kind: "investigation",
    roomId: bible.crimeSceneRoomId,
    startedAt: "2026-08-22T12:00:00.000Z",
  };

  const normalized = normalizeDebateMysteryFormatStateV1(legacy);
  assert.equal(normalized.playPhase, "verdict");
  assert.equal(normalized.actionsRemaining, 0);
  assert.equal(normalized.activeActivity, null);
  assert.equal(normalized.verdict?.grade, "incorrect");
  assert.match(normalized.verdict?.reason ?? "", /investigation is permanently closed/iu);
});

test("gives outcome-neutral regions varied deterministic sensory texture", () => {
  const config = resolveDebateMysteryConfig(createConfig("compact", "classic", "room-texture"));
  const first = compileDeterministicDebateMystery({ config, suspects: suspects(4) });
  const second = compileDeterministicDebateMystery({ config, suspects: suspects(4) });
  const emptyResponses = first.activeRegions
    .filter((outcome) => outcome.kind === "empty")
    .map((outcome) => outcome.inspectionResponse);
  assert.deepEqual(first.activeRegions, second.activeRegions);
  assert.ok(emptyResponses.length > 20);
  assert.ok(new Set(emptyResponses).size > 16);
  assert.ok(emptyResponses.every((response) =>
    !/worth a closer look|old dust and ordinary wear|only what it appears to be/iu.test(response)));
});

test("maintains several public leads from discovered facts without projecting their private recipes", () => {
  const config = resolveDebateMysteryConfig(createConfig("compact", "classic", "public-leads"));
  const bible = compileDeterministicDebateMystery({ config, suspects: suspects(4) });
  const opening = projectDebateMysteryCase(bible, config);

  assert.equal(bible.leadDefinitions.length, 5);
  assert.ok(opening.leads.length >= 2);
  assert.ok(opening.leads.every((lead) => lead.revision >= 1));
  const openingJson = JSON.stringify(opening);
  assert.doesNotMatch(openingJson, /leadDefinitions|requiredForensicEvidenceIds|requiredObservationKeys|"kind":"proof"/u);

  const fullyDiscovered = structuredClone(opening);
  fullyDiscovered.discoveredEvidence = bible.evidence.map((item) => {
    const { factTags: _factTags, relation: _relation, isCanonicalWeapon: _isCanonicalWeapon, ...publicItem } = item;
    return publicItem;
  });
  fullyDiscovered.forensicFindings = bible.evidence.map((item) => ({
    evidenceId: item.id,
    usedInMurder: item.isCanonicalWeapon,
    contextualRelevance: item.isCanonicalWeapon ? "used" as const : item.relation === "unrelated" ? "no_matching_trace" as const : "contextual" as const,
    summary: "Frozen public forensic result.",
    completedAt: "2026-08-21T12:00:00.000Z",
  }));
  fullyDiscovered.testimony = bible.testimony.map(({ factTags: _factTags, ...item }) => ({ ...item, discovered: true }));
  fullyDiscovered.rooms = fullyDiscovered.rooms.map((room) => ({
    ...room,
    discovered: true,
    observations: bible.activeRegions.filter((outcome) => outcome.roomId === room.id).map((outcome) => ({
      regionId: outcome.regionId,
      label: outcome.mechanism,
      observation: outcome.response,
      outcomeKind: outcome.kind,
      evidenceId: outcome.evidenceId,
    })),
  }));
  fullyDiscovered.leads = updateDebateMysteryPublicLeads(bible, fullyDiscovered, "2026-08-21T12:00:00.000Z");

  assert.equal(fullyDiscovered.leads.length, 5);
  assert.equal(fullyDiscovered.leads.find((lead) => lead.id === "lead-final-hour")?.status, "unresolved");
  assert.equal(fullyDiscovered.leads.find((lead) => lead.id === "lead-method")?.status, "reconciled");
  assert.equal(fullyDiscovered.leads.find((lead) => lead.id === "lead-misplaced-object")?.status, "stalled");
  assert.ok(fullyDiscovered.leads.some((lead) => lead.revision > 1));
  assert.ok(fullyDiscovered.leads.every((lead) => lead.linkedEvidenceIds.every((id) => fullyDiscovered.discoveredEvidence.some((item) => item.id === id))));
  assert.ok(fullyDiscovered.leads.every((lead) => lead.linkedTestimonyIds.every((id) => fullyDiscovered.testimony.some((item) => item.id === id))));
});

test("maps the sixteen bundled production scenes to stable templates and public names", () => {
  const expected = new Map([
    ["foyer", ["Foyer", "/debate/mystery/rooms/foyer.webp"]],
    ["kitchen", ["Kitchen", "/debate/mystery/rooms/kitchen.webp"]],
    ["ballroom", ["Ballroom", "/debate/mystery/rooms/ballroom.webp"]],
    ["dining-room", ["Dining Room", "/debate/mystery/rooms/dining-room.webp"]],
    ["parlor", ["Living Room", "/debate/mystery/rooms/living-room.webp"]],
    ["utility", ["Garage", "/debate/mystery/rooms/garage.webp"]],
    ["cellar", ["Basement", "/debate/mystery/rooms/basement.webp"]],
    ["library", ["Library", "/debate/mystery/rooms/library.webp"]],
    ["study", ["Office", "/debate/mystery/rooms/office.webp"]],
    ["conservatory", ["Arboretum", "/debate/mystery/rooms/arboretum.webp"]],
    ["primary-bedroom", ["Bedroom", "/debate/mystery/rooms/bedroom.webp"]],
    ["wine-room", ["Lounge", "/debate/mystery/rooms/lounge.webp"]],
    ["theater", ["Theater", "/debate/mystery/rooms/theater.webp"]],
    ["pool", ["Pool", "/debate/mystery/rooms/pool.webp"]],
    ["bathroom", ["Bathroom", "/debate/mystery/rooms/bathroom.webp"]],
    ["rooftop-lounge", ["Rooftop Lounge", "/debate/mystery/rooms/rooftop-lounge.webp"]],
  ]);
  const bundled = DEBATE_MYSTERY_ROOM_TEMPLATES.filter((template) => template.bundledAssetPath);
  assert.equal(bundled.length, expected.size);
  for (const template of bundled) {
    const expectedTemplate = expected.get(template.id);
    assert.ok(expectedTemplate, `unexpected bundled template ${template.id}`);
    assert.equal(template.name, expectedTemplate[0]);
    assert.equal(template.bundledAssetPath, expectedTemplate[1]);
    assert.equal(template.nativeWidth, 1600);
    assert.equal(template.nativeHeight, 900);
    const broadRegions = template.regions.filter((region) => !region.id.includes(":detail-"));
    assert.ok(broadRegions.length >= 6 && broadRegions.length <= 10);
    assert.equal(template.regions.length, broadRegions.length * 4);
  }
});

test("seeded mansion layouts are stable for a seed and vary across seeds", () => {
  const signatures = new Set<string>();

  for (let index = 0; index < 36; index += 1) {
    const config = resolveDebateMysteryConfig(createConfig("grand", "classic", `lineup-${index}`));
    const first = compileDeterministicDebateMystery({ config, suspects: suspects(8) });
    const second = compileDeterministicDebateMystery({ config, suspects: suspects(8) });
    const layout = first.rooms.map((room) => [room.templateId, room.floor, room.x, room.y, room.width, room.height]);

    assert.deepEqual(second.rooms.map((room) => [room.templateId, room.floor, room.x, room.y, room.width, room.height]), layout);
    signatures.add(JSON.stringify(layout));
  }

  assert.ok(signatures.size > 20);
});

test("semantic room types expose stable architectural floor rules", () => {
  assert.equal(debateMysteryRoomFloorRuleV1("foyer"), "ground-floor-only");
  assert.equal(debateMysteryRoomFloorRuleV1("cellar"), "ground-floor-only");
  assert.equal(debateMysteryRoomFloorRuleV1("utility"), "ground-floor-only");
  assert.equal(debateMysteryRoomFloorRuleV1("attic"), "top-floor-only");
  assert.equal(debateMysteryRoomFloorRuleV1("rooftop-lounge"), "top-floor-only");
  assert.equal(debateMysteryRoomFloorRuleV1("library"), null);
});

test("the five-room two-storey topology makes the foyer staircase functional", () => {
  assert.equal(
    resolveDebateMysteryConfig(createConfig("compact", "casual", "legacy-compact"))
      .floors,
    1,
    "legacy V1 compact recipes retain their frozen one-floor contract",
  );
  const config = resolveDebateMysteryConfig({
    ...createConfig("compact", "casual", "v2-compact-topology"),
    preset: "custom",
    floors: 2,
    totalRooms: 5,
  });
  const bible = compileDeterministicDebateMystery({
    config,
    suspects: suspects(4),
  });
  assert.deepEqual(
    [...new Set(bible.rooms.map((room) => room.floor))],
    [1, 2],
  );
  const foyer = bible.rooms.find((room) => room.templateId === "foyer")!;
  const foyerTemplate = DEBATE_MYSTERY_ROOM_TEMPLATES.find(
    (room) => room.id === "foyer",
  )!;
  assert.ok(
    foyerTemplate.regions.some((region) => /stair|upper landing/iu.test(region.label)),
    "the Foyer visibly establishes the staircase and upstairs space",
  );
  assert.ok(
    foyer.neighborIds.some((neighborId) =>
      bible.rooms.find((room) => room.id === neighborId)?.floor === 2),
    "the visible Foyer stairs enter the generated upstairs topology",
  );
});

test("room types keep their stable normalized footprints while instances stay in bounds", () => {
  assert.deepEqual(Object.fromEntries(DEBATE_MYSTERY_ROOM_FOOTPRINTS.map((entry) => [entry.roomTypeId, [entry.width, entry.height]])), {
    bathroom: [2, 2], foyer: [3, 2], study: [3, 2], "dining-room": [4, 2], kitchen: [4, 2], conservatory: [4, 2],
    library: [3, 3], parlor: [4, 3], "primary-bedroom": [4, 3], "guest-bedroom": [4, 3], cellar: [4, 3], theater: [4, 3], "wine-room": [4, 3],
    ballroom: [5, 3], utility: [5, 3], pool: [5, 3], "rooftop-lounge": [10, 6],
  });
  const request: DebateWhodunnitCreateConfigV1 = {
    ...createConfig("grand", "classic", "largest-custom-lineup"),
    preset: "custom",
    floors: 3,
    totalRooms: 18,
  };
  const config = resolveDebateMysteryConfig(request);
  const bible = compileDeterministicDebateMystery({ config, suspects: suspects(8) });
  assert.equal(bible.rooms.length, 18);
  for (const room of bible.rooms) {
    assert.ok(room.x >= 0 && room.y >= 0);
    assert.ok(room.x + room.width <= DEBATE_MYSTERY_MANSION_GRID.width);
    assert.ok(room.y + room.height <= DEBATE_MYSTERY_MANSION_GRID.height);
  }
});

test("mansion rooms do not overlap, share doors on edges, and retain the architectural circulation promises", () => {
  for (let index = 0; index < 80; index += 1) {
    const config = resolveDebateMysteryConfig(createConfig("grand", "classic", `architecture-${index}`));
    const bible = compileDeterministicDebateMystery({ config, suspects: suspects(8) });
    const foyer = bible.rooms.find((room) => room.templateId === "foyer")!;
    assert.equal(foyer.floor, 1);
    assert.ok(foyer.x === 0 || foyer.y === 0, "the foyer should touch an exterior edge");
    for (const room of bible.rooms) {
      for (const neighborId of room.neighborIds) {
        const neighbor = bible.rooms.find((candidate) => candidate.id === neighborId)!;
        if (neighbor.floor === room.floor) assert.equal(debateMysteryRoomsShareEdge(room, neighbor), true);
      }
      for (const other of bible.rooms.filter((candidate) => candidate.floor === room.floor && candidate.id > room.id)) {
        assert.equal(room.x < other.x + other.width && room.x + room.width > other.x && room.y < other.y + other.height && room.y + room.height > other.y, false);
      }
    }
    const adjacent = (leftType: string, rightType: string): boolean => {
      const left = bible.rooms.find((room) => room.templateId === leftType);
      const right = bible.rooms.find((room) => room.templateId === rightType);
      return !left || !right || left.neighborIds.includes(right.id);
    };
    assert.equal(adjacent("kitchen", "dining-room"), true);
    assert.equal(adjacent("bathroom", "primary-bedroom"), true);
    assert.equal(adjacent("ballroom", "foyer"), true);
    assert.equal(adjacent("utility", "kitchen"), true);
    const rooftop = bible.rooms.find((room) => room.templateId === "rooftop-lounge")!;
    assert.equal(rooftop.floor, config.floors);
    assert.ok(rooftop.neighborIds.some((id) => bible.rooms.find((room) => room.id === id)?.floor < rooftop.floor || bible.rooms.find((room) => room.id === id)?.floor === rooftop.floor));
  }
});

test("three hundred seeded preset cases stay connected, solvable, and exactly three-route", () => {
  const presets = ["compact", "standard", "grand"] as const;
  const difficulties = ["casual", "classic", "mastermind"] as const;
  let sawEvidenceInSuspectRoom = false;
  for (let index = 0; index < 300; index += 1) {
    const request = createConfig(presets[index % presets.length]!, difficulties[index % difficulties.length]!, `property-${index}`);
    const config = resolveDebateMysteryConfig(request);
    const bible = compileDeterministicDebateMystery({ config, suspects: suspects(config.suspectBotIds.length) });
    const result = validateDebateMysteryCaseBible(bible, config.actionBudget);
    assert.deepEqual(result.errors, [], `seed ${index}: ${result.errors.join("; ")}`);
    assert.equal(bible.proofBundles.length, 3);
    assert.equal(bible.rooms.length, config.totalRooms);
    const expectedRegionsPerRoom = config.difficulty === "casual"
      ? 12
      : config.difficulty === "mastermind"
        ? 20
        : 16;
    assert.equal(bible.activeRegions.length, bible.rooms.length * expectedRegionsPerRoom);
    const suspectRoomIds = new Set(bible.suspects.map((suspect) => suspect.roomId));
    if (bible.evidence.some((item) => suspectRoomIds.has(item.roomId))) {
      sawEvidenceInSuspectRoom = true;
    }
    for (const room of bible.rooms) {
      const regionCount = bible.activeRegions.filter((outcome) => outcome.roomId === room.id).length;
      assert.equal(
        regionCount,
        expectedRegionsPerRoom,
        `seed ${index}: ${room.id} must expose the difficulty-scaled inspectable regions`,
      );
    }
    for (let floor = 1; floor <= config.floors; floor += 1) {
      const floorRooms = bible.rooms.filter((room) => room.floor === floor);
      if (floorRooms.length < 3) continue;
      // A floor with enough rooms must read as a compact building, not a
      // horizontal procession of cards. Both axes are occupied, and at least
      // one room participates in genuinely branching same-floor connections.
      assert.ok(new Set(floorRooms.map((room) => room.x)).size > 1, `seed ${index}, floor ${floor}: expected multiple columns`);
      assert.ok(new Set(floorRooms.map((room) => room.y)).size > 1, `seed ${index}, floor ${floor}: expected multiple rows`);
      const minimumBranchDegree = floorRooms.length >= 4 ? 3 : 2;
      assert.ok(
        floorRooms.some((room) => room.neighborIds.filter((neighborId) =>
          bible.rooms.find((candidate) => candidate.id === neighborId)?.floor === floor,
        ).length >= minimumBranchDegree),
        `seed ${index}, floor ${floor}: expected a room with multiple same-floor doors`,
      );
    }
  }
  assert.equal(sawEvidenceInSuspectRoom, true, "at least one seeded case should place evidence in a suspect room");
});

test("access items resolve item, room, and region locks without cycles or public relevance labels", () => {
  const config = resolveDebateMysteryConfig(createConfig("standard", "classic", "access-locks"));
  const bible = compileDeterministicDebateMystery({ config, suspects: suspects(6) });
  assert.deepEqual(new Set(bible.accessLocks.map((lock) => lock.targetKind)), new Set(["item", "room", "region"]));
  assert.ok(bible.inventoryItems.some((item) => item.usable && !bible.accessLocks.some((lock) => lock.requiredAccessItemId === item.id)));
  assert.equal(bible.accessLocks.find((lock) => lock.id === "lock-jewelry-box")?.proofCritical, true);
  assert.equal(bible.evidence.find((item) => item.id === "evidence-locked-jewelry-box")?.relation, "unrelated");
  const projected = projectDebateMysteryCase(bible, config);
  const lockedRoomId = bible.accessLocks.find((lock) => lock.targetKind === "room")!.targetId;
  assert.equal(projected.rooms.find((room) => room.id === lockedRoomId)?.locked, true);
  assert.deepEqual(projected.inventoryItems, []);
  assert.deepEqual(validateDebateMysteryCaseBible(bible, config.actionBudget).errors, []);

  const cyclic = structuredClone(bible);
  const jewelryLock = cyclic.accessLocks.find((lock) => lock.id === "lock-jewelry-box")!;
  const safeLock = cyclic.accessLocks.find((lock) => lock.id === "lock-hidden-safe")!;
  jewelryLock.requiredAccessItemId = "artifact-private-ledger";
  safeLock.requiredAccessItemId = "artifact-heirloom-jewels";
  cyclic.inventoryItems.find((item) => item.id === "artifact-private-ledger")!.usable = true;
  cyclic.inventoryItems.find((item) => item.id === "artifact-heirloom-jewels")!.usable = true;
  assert.ok(validateDebateMysteryCaseBible(cyclic, config.actionBudget).errors.some((error) => error.includes("dependency cycle")));
});

test("MansionLayoutV2 semantic projections may use corridor links and colon room IDs", () => {
  const config = resolveDebateMysteryConfig(createConfig("standard", "classic", "layout-v2-projection"));
  const canonical = compileDeterministicDebateMystery({ config, suspects: suspects(6) });
  const roomId = (id: string) => `room:${id}`;
  const blueprint = canonical.rooms.map((room) => ({
    ...room,
    id: roomId(room.id),
    neighborIds: room.neighborIds.map(roomId),
  }));
  const sameFloorNonNeighbors = blueprint.flatMap((left) =>
    blueprint
      .filter((right) =>
        right.floor === left.floor &&
        right.id !== left.id &&
        !left.neighborIds.includes(right.id) &&
        !debateMysteryRoomsShareEdge(left, right))
      .map((right) => [left, right] as const),
  )[0];
  assert.ok(sameFloorNonNeighbors, "fixture needs a corridor-style semantic connection");
  const [left, right] = sameFloorNonNeighbors;
  left.neighborIds.push(right.id);
  right.neighborIds.push(left.id);
  const bible = compileDeterministicDebateMystery({
    config,
    suspects: suspects(6),
    roomBlueprint: blueprint,
  });

  assert.ok(
    validateDebateMysteryCaseBible(bible, config.actionBudget).errors.some((error) =>
      error.includes("does not share an architectural edge")),
  );
  assert.deepEqual(
    validateDebateMysteryCaseBible(bible, config.actionBudget, {
      architecture: "mansion-layout-v2",
    }).errors,
    [],
  );
});

test("accepted mansion plates use neutral examination regions instead of PRISM template props", () => {
  const config = resolveDebateMysteryConfig(createConfig("standard", "classic", "accepted-room-regions"));
  const bundled = compileDeterministicDebateMystery({ config, suspects: suspects(6) });
  const blueprint = bundled.rooms.map((room) => room.templateId === "foyer"
    ? {
        ...room,
        imageId: "accepted-observatory-foyer",
        usesBundledHotspotGeometry: false,
      }
    : room,
  );
  const caseWithAcceptedPlate = compileDeterministicDebateMystery({
    config,
    suspects: suspects(6),
    roomBlueprint: blueprint,
  });
  const foyer = blueprint.find((room) => room.templateId === "foyer")!;
  const foyerRegionIds = caseWithAcceptedPlate.activeRegions
    .filter((region) => region.roomId === foyer.id)
    .map((region) => region.regionId);

  assert.ok(foyerRegionIds.length >= 12);
  assert.ok(foyerRegionIds.every((id) => id.startsWith("foyer:scene-")));
  assert.ok(!foyerRegionIds.some((id) => id.includes("umbrella")));
});

test("custom floor counts keep architectural room groups intact", () => {
  for (let totalRooms = 5; totalRooms <= 18; totalRooms += 1) {
    for (let floors = 1; floors <= 3; floors += 1) {
      for (let seed = 0; seed < 4; seed += 1) {
        const suspectCount = Math.min(8, totalRooms - 1);
        const request: DebateWhodunnitCreateConfigV1 = {
          ...createConfig("grand", "classic", `custom-${totalRooms}-${floors}-${seed}`),
          preset: "custom",
          floors,
          totalRooms,
          suspectBotIds: Array.from({ length: suspectCount }, (_, index) => `bot-${index + 1}`),
        };
        const config = resolveDebateMysteryConfig(request);
        const bible = compileDeterministicDebateMystery({ config, suspects: suspects(suspectCount) });
        const result = validateDebateMysteryCaseBible(bible, config.actionBudget);
        assert.deepEqual(result.errors, [], `${totalRooms} rooms / ${floors} floors / seed ${seed}: ${result.errors.join("; ")}`);
        assert.equal(new Set(bible.rooms.map((room) => room.floor)).size, floors);
        const topFloor = Math.max(...bible.rooms.map((room) => room.floor));
        for (const room of bible.rooms) {
          assert.equal(
            debateMysteryRoomTypeIsAllowedOnFloorV1(room.templateId, room.floor, topFloor),
            true,
            `${room.templateId} is on Floor ${room.floor} of ${topFloor}`,
          );
        }
      }
    }
  }
});

test("same room polygon can resolve with different outcomes and hiding origins", () => {
  const observations = new Map<string, Set<string>>();
  const mechanisms = new Map<string, Set<string>>();
  for (let index = 0; index < 250; index += 1) {
    const config = resolveDebateMysteryConfig(createConfig("grand", "classic", `regions-${index}`));
    const bible = compileDeterministicDebateMystery({ config, suspects: suspects(8) });
    for (const outcome of bible.activeRegions) {
      const room = bible.rooms.find((candidate) => candidate.id === outcome.roomId)!;
      const key = `${room.templateId}/${outcome.regionId}`;
      if (!observations.has(key)) observations.set(key, new Set());
      if (!mechanisms.has(key)) mechanisms.set(key, new Set());
      observations.get(key)!.add(outcome.kind);
      mechanisms.get(key)!.add(outcome.hidingMechanism);
    }
  }
  assert.ok([...observations.values()].some((values) => values.size > 1));
  assert.ok([...mechanisms.values()].some((values) => values.size > 1));
});

test("wrong culprits and false accomplices cannot pass while supersets select the strongest bundle", () => {
  const config = resolveDebateMysteryConfig(createConfig("grand", "classic", "verdict"));
  let bible = compileDeterministicDebateMystery({ config, suspects: suspects(8) });
  // Make accomplice behavior deterministic for this verdict boundary test.
  bible = { ...bible, accompliceSeatId: bible.suspects.find((seat) => seat.seatId !== bible.culpritSeatId)!.seatId };
  const allEvidence = bible.evidence.map((item) => item.id);
  const allTestimony = bible.testimony.map((item) => item.id);
  const correct = gradeDebateMysteryTheory({ bible, theory: { culpritSeatId: bible.culpritSeatId, accompliceSeatId: bible.accompliceSeatId, method: bible.method, motive: bible.motive, opportunity: "complete", evidenceIds: allEvidence, testimonyIds: allTestimony }, sustainedTestimonyIds: allTestimony, credibilityRemaining: 2, deliveredAt: "now" });
  assert.equal(correct.grade, "smoking_gun");
  assert.equal(correct.matchedBundleId, "smoking-gun");
  const strongBundle = bible.proofBundles.find((bundle) => bundle.grade === "strong_case")!;
  const omittedAccomplice = gradeDebateMysteryTheory({ bible, theory: { culpritSeatId: bible.culpritSeatId, accompliceSeatId: null, method: bible.method, motive: "", opportunity: "coherent", evidenceIds: strongBundle.requiredEvidenceIds, testimonyIds: strongBundle.requiredTestimonyIds }, sustainedTestimonyIds: [], credibilityRemaining: 3, deliveredAt: "now" });
  assert.equal(omittedAccomplice.grade, "strong_case");
  assert.equal(omittedAccomplice.matchedBundleId, "strong-case");
  const wrong = gradeDebateMysteryTheory({ bible, theory: { culpritSeatId: bible.suspects.find((seat) => seat.seatId !== bible.culpritSeatId)!.seatId, accompliceSeatId: null, method: "", motive: "", opportunity: "", evidenceIds: allEvidence, testimonyIds: allTestimony }, sustainedTestimonyIds: allTestimony, credibilityRemaining: 2, deliveredAt: "now" });
  assert.equal(wrong.grade, "incorrect");
  const falseAccomplice = gradeDebateMysteryTheory({ bible, theory: { culpritSeatId: bible.culpritSeatId, accompliceSeatId: bible.suspects.find((seat) => seat.seatId !== bible.culpritSeatId && seat.seatId !== bible.accompliceSeatId)!.seatId, method: bible.method, motive: bible.motive, opportunity: "complete", evidenceIds: allEvidence, testimonyIds: allTestimony }, sustainedTestimonyIds: allTestimony, credibilityRemaining: 2, deliveredAt: "now" });
  assert.equal(falseAccomplice.grade, "incorrect");
});

test("notebook cleanup requires complete provenance and immutable protected tokens", () => {
  const notebook: DebateMysteryNotebookV1 = {
    version: 1,
    sessionId: "case-1",
    revision: 4,
    createdAt: "now",
    updatedAt: "now",
    pages: [{ id: "page-1", title: "Case Notes", createdAt: "now", updatedAt: "now", blocks: [
      { id: "b1", kind: "paragraph", text: "Maybe Rowan did not enter the study." },
      { id: "b2", kind: "quote", text: "“I never touched it.”" },
      { id: "b3", kind: "reference", text: "[[evidence:evidence-1]]", referenceId: "evidence-1", referenceKind: "evidence" },
    ] }],
  };
  assert.ok(debateMysteryNotebookCharacterCount(notebook) > 0);
  const proposal: DebateMysteryNotebookCleanupProposalV1 = {
    version: 1,
    id: "proposal-1",
    sessionId: "case-1",
    sourceRevision: 4,
    scopePageIds: ["page-1"],
    status: "pending",
    createdAt: "now",
    resolvedAt: null,
    pages: [{ pageId: "page-1", proposedTitle: "Case Notes", proposedBlocks: [
      { id: "p1", kind: "paragraph", text: "Maybe Rowan did not enter the study.", sourceBlockIds: ["b1"] },
      { id: "p2", kind: "quote", text: "“I never touched it.”", sourceBlockIds: ["b2"] },
      { id: "p3", kind: "reference", text: "[[evidence:evidence-1]]", referenceId: "evidence-1", referenceKind: "evidence", sourceBlockIds: ["b3"] },
    ] }],
  };
  assert.equal(validateDebateMysteryNotebookCleanupProposal(notebook, proposal).valid, true);
  const strengthened = structuredClone(proposal);
  strengthened.pages[0]!.proposedBlocks[0]!.text = "Rowan entered the study.";
  assert.equal(validateDebateMysteryNotebookCleanupProposal(notebook, strengthened).valid, false);
  const changedQuote = structuredClone(proposal);
  changedQuote.pages[0]!.proposedBlocks[1]!.text = "“I touched it.”";
  assert.equal(validateDebateMysteryNotebookCleanupProposal(notebook, changedQuote).valid, false);
  const invented = structuredClone(proposal);
  invented.pages[0]!.proposedBlocks[0]!.text = "Maybe Rowan did not enter the study at 10:30 PM; therefore Rowan is the murderer.";
  assert.equal(validateDebateMysteryNotebookCleanupProposal(notebook, invented).valid, false);
  const missing = structuredClone(proposal);
  missing.pages[0]!.proposedBlocks.pop();
  assert.equal(validateDebateMysteryNotebookCleanupProposal(notebook, missing).valid, false);
});
