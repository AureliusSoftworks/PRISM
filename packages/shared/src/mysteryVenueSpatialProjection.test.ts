import assert from "node:assert/strict";
import test from "node:test";

import {
  createMysteryVenueProposalV1,
  projectDebateMysteryVenueSpatialV1,
} from "../dist/index.js";

function standardPassengerShip() {
  return createMysteryVenueProposalV1({
    id: "proposal:ship:ambient-standard",
    description: "A modern full-size passenger cruise ship, not a yacht, manor, or estate.",
    length: { id: "standard", rooms: 10, suspects: 6 },
  });
}

test("projects anonymous inert ship massing without changing the reusable venue", () => {
  const proposal = standardPassengerShip();
  const sourceBefore = JSON.stringify(proposal.layout);
  const activeRoomIds = proposal.layout.entities.flatMap((entity) =>
    entity.kind === "room" ? [entity.id] : []
  );
  const projection = projectDebateMysteryVenueSpatialV1({
    layout: proposal.layout,
    activeRoomIds,
  });
  assert.ok(projection);
  assert.deepEqual(projection.activeRoomIds, activeRoomIds);
  assert.equal(projection.activeRoomIds.length, 10);
  assert.deepEqual([...new Set(projection.ambientSpaces.map((space) => space.floor))], [1, 2]);
  assert.ok(projection.ambientSpaces.length > 0);
  assert.ok(projection.ambientSpaces.some((space) => space.pattern === "outboard-band"));
  assert.ok(projection.ambientSpaces.some((space) => space.pattern === "inboard-compartment"));
  for (const space of projection.ambientSpaces) {
    assert.deepEqual(
      Object.keys(space).sort(),
      ["floor", "height", "id", "pattern", "width", "x", "y"],
    );
    assert.ok(space.x >= 0 && space.y >= 0);
    assert.ok(space.x + space.width <= 16);
    assert.ok(space.y + space.height <= 12);
  }
  assert.deepEqual(
    projectDebateMysteryVenueSpatialV1({ layout: proposal.layout, activeRoomIds }),
    projection,
  );
  assert.equal(JSON.stringify(proposal.layout), sourceBefore);
});

test("promotes case-scoped ambient massing without mutating the venue source", () => {
  const proposal = standardPassengerShip();
  const sourceBefore = JSON.stringify(proposal.layout);
  const activeRoomIds = proposal.layout.entities.flatMap((entity) =>
    entity.kind === "room" ? [entity.id] : []
  );
  const firstCase = projectDebateMysteryVenueSpatialV1({ layout: proposal.layout, activeRoomIds });
  assert.ok(firstCase?.ambientSpaces[0]);
  const promotedRoomId = "case-room:private-suite";
  const secondCase = projectDebateMysteryVenueSpatialV1({
    layout: proposal.layout,
    activeRoomIds,
    promotions: [{ ambientId: firstCase.ambientSpaces[0].id, roomId: promotedRoomId }],
  });
  assert.ok(secondCase);
  assert.ok(secondCase.activeRoomIds.includes(promotedRoomId));
  assert.equal(secondCase.ambientSpaces.some((space) => space.id === firstCase.ambientSpaces[0]!.id), false);
  assert.deepEqual(secondCase.promotedAmbientSpaces, [{
    ambientId: firstCase.ambientSpaces[0].id,
    roomId: promotedRoomId,
    floor: firstCase.ambientSpaces[0].floor,
    x: firstCase.ambientSpaces[0].x,
    y: firstCase.ambientSpaces[0].y,
    width: firstCase.ambientSpaces[0].width,
    height: firstCase.ambientSpaces[0].height,
  }]);
  assert.equal(JSON.stringify(proposal.layout), sourceBefore);
});

test("projects visible inert massing on every occupied venue tier without adding rooms", () => {
  const proposal = createMysteryVenueProposalV1({
    id: "proposal:ship:ambient-grand",
    description: "A large passenger cruise ship with lower service, embarkation, and promenade decks.",
    length: { id: "grand", rooms: 15, suspects: 8 },
  });
  const activeRoomIds = proposal.layout.entities.flatMap((entity) =>
    entity.kind === "room" ? [entity.id] : []
  );
  const projection = projectDebateMysteryVenueSpatialV1({ layout: proposal.layout, activeRoomIds });
  assert.ok(projection);
  assert.deepEqual(projection.activeRoomIds, activeRoomIds);
  assert.deepEqual(
    [...new Set(projection.ambientSpaces.map((space) => space.floor))],
    [1, 2, 3],
  );
  assert.ok(projection.ambientSpaces.every((space) => !projection.activeRoomIds.includes(space.id)));
});
