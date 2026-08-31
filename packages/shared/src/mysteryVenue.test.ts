import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compileDeterministicDebateMystery,
  resolveDebateMysteryRoomPresentationV1,
  resolveDebateMysteryConfig,
} from "./debateMystery.ts";
import { mansionLayoutV2ToLegacyRooms, validateMansionLayoutV2 } from "./mansionLayoutV2.ts";
import { createMysteryVenueProposalV1, parseMysteryVenueCreativeDraftV1 } from "./mysteryVenue.ts";

describe("Mystery Venue proposals", () => {
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
