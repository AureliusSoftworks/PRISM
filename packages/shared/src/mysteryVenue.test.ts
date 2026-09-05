import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compileDeterministicDebateMystery,
  resolveDebateMysteryRoomPresentationV1,
  resolveDebateMysteryConfig,
} from "./debateMystery.ts";
import { mansionLayoutV2ToLegacyRooms, validateMansionLayoutV2 } from "./mansionLayoutV2.ts";
import {
  createMysteryVenueProposalV1,
  deriveMysteryVenueIntentV1,
  parseMysteryVenueCreativeDraftV1,
} from "./mysteryVenue.ts";

describe("Mystery Venue proposals", () => {
  it("freezes a modern full-size passenger ship separately from yachts and estates", () => {
    const intent = deriveMysteryVenueIntentV1(
      "A modern full-size passenger cruise ship, not a yacht, manor, or estate.",
    );
    assert.equal(intent.archetype, "passenger_cruise_ship");
    assert.equal(intent.era, "modern");
    assert.equal(intent.physicalScaleClass, "grand");
    assert.deepEqual(intent.excludedArchetypes, ["vintage_yacht", "private_estate"]);

    const ship = createMysteryVenueProposalV1({
      id: "proposal:modern-passenger-ship",
      description: "A modern full-size passenger cruise ship, not a yacht, manor, or estate.",
      length: { id: "standard", rooms: 10, suspects: 6 },
    });
    assert.equal(ship.profile.kindLabel, "Passenger Cruise Ship");
    assert.equal(ship.profile.placeNoun, "ship");
    assert.equal(ship.profile.physicalScaleClass, "grand");
    assert.equal(ship.profile.presentation?.familyId, "maritime-passenger-v1");
    assert.equal(ship.profile.presentation?.entryAction, "Board the ship");
    assert.equal(ship.profile.presentation?.mapStyle, "hull-deck-v1");
    assert.equal(ship.profile.presentation?.mapOrientation.fore, "right");
    assert.equal(ship.profile.presentation?.mapOrientation.port, "top");
    assert.equal(ship.length.id, "standard");
    assert.equal(ship.length.suspects, 6);

    const yacht = createMysteryVenueProposalV1({
      id: "proposal:vintage-yacht",
      description: "A vintage private yacht",
      length: { id: "standard", rooms: 10, suspects: 6 },
    });
    assert.equal(yacht.intent.archetype, "vintage_yacht");
    assert.equal(yacht.profile.kindLabel, "Vintage Yacht");
  });

  it("rejects mismatched model identity and discloses the compatible passenger catalog replacement", () => {
    const yachtDraft = parseMysteryVenueCreativeDraftV1({
      title: "The Little Gilded Wake",
      archetype: "vintage_yacht",
      era: "historic",
      physicalScaleClass: "compact",
      kind: "vessel",
      kindLabel: "Vintage Yacht",
      placeNoun: "yacht",
      topology: "spine",
      tierNoun: "Deck",
      exteriorMode: "in-transit",
      environmentSummary: "A small private yacht.",
      atmosphere: "Polished brass and dark water.",
      connectorLabel: "ladder",
      rooms: Array.from({ length: 5 }, (_, index) => ({
        templateId: `venue:yacht-${index}`,
        name: index === 0 ? "Gangway" : `Cabin ${index}`,
        emoji: "⚓",
        role: index === 0 ? "entry" : "private",
        anchors: ["brass fitting"],
      })),
    });
    const proposal = createMysteryVenueProposalV1({
      id: "proposal:mismatch",
      description: "Modern full-size passenger cruise ship, never a yacht",
      length: { id: "standard", rooms: 10, suspects: 6 },
      creativeDraft: yachtDraft,
    });
    assert.equal(proposal.source, "catalog");
    assert.equal(proposal.match.status, "matched");
    assert.match(proposal.editableDraftNotice ?? "", /did not match the frozen brief/u);
    assert.equal(proposal.profile.intent?.archetype, "passenger_cruise_ship");
    assert.equal(proposal.layout.verticalConnectors.some((connector) => connector.kind === "ladder"), false);
  });

  it("builds hull-bounded semantic decks with zoned rooms and aligned ship shafts", () => {
    for (const [id, rooms, suspects, expectedLabels] of [
      ["quick", 5, 4, ["Embarkation & Promenade Deck"]],
      ["standard", 10, 6, ["Embarkation & Service Deck", "Command & Promenade Deck"]],
      ["grand", 15, 6, ["Lower Service Deck", "Embarkation Deck", "Promenade & Command Deck"]],
    ] as const) {
      const proposal = createMysteryVenueProposalV1({
        id: `proposal:ship:${id}`,
        description: "modern full-size passenger cruise ship",
        length: { id, rooms, suspects },
      });
      assert.deepEqual(proposal.profile.tierLabels, expectedLabels);
      assert.equal(proposal.length.suspects, suspects);
      assert.equal(proposal.layout.venuePresentation?.tierOutlines.length, expectedLabels.length);
      assert.deepEqual(validateMansionLayoutV2(proposal.layout, { suspectCount: suspects }), []);
      const venueRooms = proposal.layout.entities.filter((entity) => entity.kind === "room");
      const bridge = venueRooms.find((entry) => entry.templateId === "venue:bridge");
      const engine = venueRooms.find((entry) => entry.templateId === "venue:engine");
      const gangway = venueRooms.find((entry) => entry.templateId === "venue:gangway");
      const promenade = venueRooms.find((entry) => entry.templateId === "venue:promenade");
      if (id !== "quick") {
        assert.equal(bridge?.venueContract?.spatial?.longitudinal, "fore");
        assert.equal(engine?.venueContract?.spatial?.longitudinal, "aft");
      }
      assert.equal(gangway?.venueContract?.spatial?.transverse, "starboard");
      assert.equal(promenade?.venueContract?.spatial?.exposure, "open-deck");
      assert.equal((promenade?.venueContract?.footprint.width ?? 0) > 2, true);
      assert.equal(proposal.layout.verticalConnectors.some((connector) => connector.kind === "ladder"), false);
      const shaftGroups = new Map<string | undefined, typeof proposal.layout.verticalConnectors>();
      for (const connector of proposal.layout.verticalConnectors) {
        shaftGroups.set(connector.shaftId, [...(shaftGroups.get(connector.shaftId) ?? []), connector]);
      }
      for (const connectors of shaftGroups.values()) {
        if (connectors.length < 2) continue;
        assert.equal(new Set(connectors.map((entry) => JSON.stringify(entry.lowerPoint))).size, 1);
        assert.equal(new Set(connectors.map((entry) => JSON.stringify(entry.upperPoint))).size, 1);
      }
    }
  });

  for (const [description, kind, topology, entry] of [
    ["A midnight cruise aboard a vintage yacht", "vessel", "spine", "Gangway"],
    ["A remote lunar module", "habitat", "radial", "Main Airlock"],
    ["A deep underwater research facility", "facility", "pods", "Docking Collar"],
    ["A murder aboard a night train", "transport", "linear", "Rear Vestibule"],
    ["A mystery inside a clockwork museum", "other", "pods", "Arrival Point"],
    ["An old country house", "estate", "estate", "Foyer"],
  ] as const) {
    it(`creates a connected ${kind} proposal`, () => {
      const proposal = createMysteryVenueProposalV1({
        id: `proposal:${kind}`,
        description,
        length: { id: "standard", rooms: 10, suspects: 6 },
      });
      assert.equal(proposal.profile.kind, kind);
      assert.equal(proposal.profile.topology, topology);
      assert.equal(proposal.layout.entities.find(
        (entity) => entity.kind === "room" && entity.id === proposal.profile.entryRoomId,
      )?.name, entry);
      assert.deepEqual(validateMansionLayoutV2(proposal.layout, { suspectCount: 6 }), []);
    });
  }

  it("keeps Quick one-tier and allows repeated venue archetypes", () => {
    const proposal = createMysteryVenueProposalV1({
      id: "proposal:yacht",
      description: "vintage yacht",
      length: { id: "quick", rooms: 99, suspects: 99 },
    });
    assert.equal(proposal.length.rooms, 5);
    assert.deepEqual(proposal.profile.tierLabels, ["Deck 1"]);
    assert.equal(proposal.layout.verticalConnectors.length, 0);
    const duplicate = structuredClone(proposal.layout);
    const venueRooms = duplicate.entities.filter((entity) => entity.kind === "room");
    venueRooms[1]!.templateId = venueRooms[0]!.templateId;
    assert.deepEqual(validateMansionLayoutV2(duplicate, { suspectCount: 4 }), []);
    const invalidEntry = structuredClone(proposal.layout);
    const entry = invalidEntry.entities.find(
      (entity) => entity.kind === "room" && entity.id === invalidEntry.venueProfile?.entryRoomId,
    );
    if (entry?.kind === "room" && entry.venueContract) entry.venueContract.role = "social";
    assert.match(validateMansionLayoutV2(invalidEntry, { suspectCount: 4 }).join(" "), /semantic entry room/u);
  });

  it("keeps every topology connected and in bounds at every investigation length", () => {
    const descriptions = [
      "old country estate",
      "vintage yacht",
      "lunar habitat",
      "underwater facility",
      "night train",
    ];
    const lengths = [
      { id: "quick" as const, rooms: 5, suspects: 4 },
      { id: "standard" as const, rooms: 10, suspects: 6 },
      { id: "grand" as const, rooms: 15, suspects: 8 },
      { id: "custom" as const, rooms: 18, suspects: 8, tiers: 1 },
      { id: "custom" as const, rooms: 5, suspects: 4, tiers: 3 },
    ];
    for (const description of descriptions) {
      for (const length of lengths) {
        const proposal = createMysteryVenueProposalV1({
          id: `proposal:${description}:${length.id}:${length.rooms}:${length.tiers ?? "preset"}`,
          description,
          length,
        });
        assert.deepEqual(
          validateMansionLayoutV2(proposal.layout, { suspectCount: proposal.length.suspects }),
          [],
          `${description} ${JSON.stringify(length)}`,
        );
      }
    }
  });

  it("gives the five topology families distinct server-owned silhouettes", () => {
    const proposals = [
      createMysteryVenueProposalV1({ id: "estate", description: "estate", length: { id: "quick", rooms: 5, suspects: 4 } }),
      createMysteryVenueProposalV1({ id: "spine", description: "yacht", length: { id: "quick", rooms: 5, suspects: 4 } }),
      createMysteryVenueProposalV1({ id: "radial", description: "lunar habitat", length: { id: "quick", rooms: 5, suspects: 4 } }),
      createMysteryVenueProposalV1({ id: "pods", description: "underwater facility", length: { id: "quick", rooms: 5, suspects: 4 } }),
      createMysteryVenueProposalV1({ id: "linear", description: "night train", length: { id: "quick", rooms: 5, suspects: 4 } }),
    ];
    const signatures = proposals.map((proposal) => JSON.stringify(proposal.layout.entities.map((entity) => [
      entity.kind, entity.x, entity.y, entity.width, entity.height,
    ])));
    assert.equal(new Set(signatures).size, 5);
  });

  it("compiles venue-owned room IDs without a global mansion template", () => {
    const proposal = createMysteryVenueProposalV1({
      id: "proposal:compile-yacht",
      description: "vintage yacht",
      length: { id: "quick", rooms: 5, suspects: 4 },
    });
    const roomBlueprint = mansionLayoutV2ToLegacyRooms(proposal.layout).map((room) => ({
      ...room,
      usesBundledHotspotGeometry: false,
      kind: room.assignedSuspectSeatId ? "suspect" as const : "crime_scene" as const,
    }));
    const config = resolveDebateMysteryConfig({
      version: 1,
      preset: "custom",
      difficulty: "classic",
      artMode: "bundled",
      inspiration: "",
      nonce: "venue-compile",
      floors: 1,
      totalRooms: 5,
      suspectBotIds: ["bot-1", "bot-2", "bot-3", "bot-4"],
      prosecutorPartnerBotId: "prosecutor",
      rivalDefenseBotId: "defense",
    });
    const compiled = compileDeterministicDebateMystery({
      config,
      suspects: [1, 2, 3, 4].map((index) => ({
        botId: `bot-${index}`,
        exportHash: `hash-${index}`,
        name: `Suspect ${index}`,
        color: null,
        glyph: null,
      })),
      roomBlueprint,
    });
    assert.equal(compiled.rooms.some((room) => room.templateId === "venue:gangway"), true);
    const presentation = resolveDebateMysteryRoomPresentationV1({
      ...compiled.rooms[0]!,
      name: "Gangway",
      emoji: "⚓",
      venueContract: { footprint: { width: 2, height: 2 } },
      placementAnchors: [{ name: "boarding rail" }],
    });
    assert.equal(presentation.name, "Gangway");
    assert.equal(presentation.emoji, "⚓");
    assert.equal(presentation.footprint.width, 2);
    assert.deepEqual(presentation.fixtureLabels, ["boarding rail"]);
    assert.ok(presentation.regions.length > 0);
  });

  it("lets a creative draft own names and anchors while the server owns geometry", () => {
    const creativeDraft = parseMysteryVenueCreativeDraftV1({
      title: "The Glass Menagerie",
      kind: "other",
      kindLabel: "Clockwork Museum",
      placeNoun: "museum",
      topology: "radial",
      tierNoun: "Gallery",
      exteriorMode: "contained",
      environmentSummary: "A mechanical museum arranged around a sealed central atrium.",
      atmosphere: "Ticking exhibits fall in and out of sync.",
      connectorLabel: "gallery stair",
      rooms: Array.from({ length: 5 }, (_, index) => ({
        templateId: `venue:gallery-${index + 1}`,
        name: index === 0 ? "Ticket Vestibule" : `Gallery ${index}`,
        emoji: "⚙️",
        role: index === 0 ? "entry" : "observation",
        anchors: ["display plinth", "winding mechanism"],
      })),
    });
    assert.ok(creativeDraft);
    const proposal = createMysteryVenueProposalV1({
      id: "proposal:model",
      description: "clockwork museum",
      length: { id: "quick", rooms: 5, suspects: 4 },
      creativeDraft,
    });
    assert.equal(proposal.source, "model");
    assert.deepEqual(proposal.creativeDraft, creativeDraft);
    assert.equal(proposal.title, "The Glass Menagerie");
    assert.equal(proposal.layout.placementAnchors[0]?.name, "display plinth");
    assert.deepEqual(validateMansionLayoutV2(proposal.layout, { suspectCount: 4 }), []);

    const acceptedShape = createMysteryVenueProposalV1({
      id: proposal.id,
      description: proposal.description,
      length: proposal.length,
      nonce: proposal.nonce,
      creativeDraft: proposal.creativeDraft,
    });
    assert.equal(acceptedShape.title, "The Glass Menagerie");
    assert.equal(acceptedShape.layout.placementAnchors[0]?.name, "display plinth");
  });
});
