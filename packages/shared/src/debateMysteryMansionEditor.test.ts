import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAddDebateMysteryMansionEditorThirdFloorV1,
  validateDebateMysteryMansionEditorTopologyV1,
  type DebateMysteryMansionBundleRoomV1,
} from "./debateMysteryV2.ts";

function room(
  id: string,
  templateId: string,
  floor: number,
  x: number,
  y: number,
  neighborIds: string[],
): DebateMysteryMansionBundleRoomV1 {
  return {
    id,
    templateId,
    name: templateId === "foyer" ? "Foyer" : id,
    floor,
    x,
    y,
    width: 2,
    height: 2,
    neighborIds,
    assignedSuspectSeatId: null,
    emoji: "◇",
    imageId: null,
    bundledAssetPath: null,
  };
}

function validRooms(): DebateMysteryMansionBundleRoomV1[] {
  return [
    room("foyer", "foyer", 1, 0, 0, ["parlor", "landing"]),
    room("parlor", "parlor", 1, 2, 0, ["foyer", "library"]),
    room("library", "library", 1, 4, 0, ["parlor"]),
    room("landing", "guest-bedroom", 2, 0, 0, ["foyer", "bathroom"]),
    room("bathroom", "bathroom", 2, 2, 0, ["landing"]),
  ];
}

describe("Mansion Editor topology", () => {
  it("accepts a connected two-floor plan with a functional foyer staircase", () => {
    assert.deepEqual(validateDebateMysteryMansionEditorTopologyV1(validRooms(), 4), []);
  });

  it("rejects legacy-flat, overlapping, one-way, and disconnected edits without invalidating reads", () => {
    const flat = validRooms().map((candidate) => ({ ...candidate, floor: 1 }));
    assert.match(
      validateDebateMysteryMansionEditorTopologyV1(flat, 4).join("\n"),
      /ground and upper floors/u,
    );

    const broken = validRooms();
    broken[1] = { ...broken[1]!, x: 0, neighborIds: [] };
    const errors = validateDebateMysteryMansionEditorTopologyV1(broken, 4).join("\n");
    assert.match(errors, /overlaps/u);
    assert.match(errors, /two-way connection/u);
    assert.match(errors, /walkable plan/u);
  });

  it("requires four second-floor rooms before a third floor can be saved", () => {
    const tooNarrow = validRooms();
    tooNarrow.push(room("observatory", "library", 3, 0, 0, ["landing"]));
    tooNarrow[3] = { ...tooNarrow[3]!, neighborIds: ["foyer", "bathroom", "observatory"] };
    assert.equal(canAddDebateMysteryMansionEditorThirdFloorV1(tooNarrow), false);
    assert.match(
      validateDebateMysteryMansionEditorTopologyV1(tooNarrow, 4).join("\n"),
      /Floor 2 needs at least 4 rooms before Floor 3 can be used/u,
    );

    const supported = [
      ...tooNarrow,
      room("gallery", "library", 2, 4, 0, ["landing", "study"]),
      room("study", "library", 2, 6, 0, ["gallery"]),
    ];
    supported[3] = { ...supported[3]!, neighborIds: ["foyer", "bathroom", "observatory", "gallery"] };
    assert.equal(canAddDebateMysteryMansionEditorThirdFloorV1(supported), true);
    assert.doesNotMatch(
      validateDebateMysteryMansionEditorTopologyV1(supported, 4).join("\n"),
      /Floor 2 needs at least/u,
    );
  });
});
