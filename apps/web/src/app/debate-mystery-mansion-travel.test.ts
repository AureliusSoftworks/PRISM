import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { describe, it } from "node:test";

import type { MansionTraversalRouteV1 } from "@localai/shared";
import {
  MYSTERY_MANSION_TRAVEL_AUDIO,
  mysteryMansionTravelCuePlanV1,
  mysteryMansionTravelDurationMs,
  mysteryMansionTravelFoleyPlanV1,
  mysteryMansionTravelPointAtProgress,
} from "./debateMysteryMansionTravel.ts";

const route: MansionTraversalRouteV1 = {
  version: 1,
  fromRoomId: "foyer",
  toRoomId: "ballroom",
  entityIds: ["foyer", "hall", "ballroom"],
  doorIds: ["door-a", "door-b"],
  connectorIds: [],
  distanceUnits: 8,
  waypoints: [
    { kind: "entity_center", floor: 1, x: 1, y: 1, entityId: "foyer", edgeId: null, connectorKind: null },
    { kind: "door", floor: 1, x: 3, y: 1, entityId: "foyer", edgeId: "door-a", connectorKind: null },
    { kind: "entity_center", floor: 1, x: 5, y: 1, entityId: "hall", edgeId: "door-a", connectorKind: null },
    { kind: "door", floor: 1, x: 7, y: 1, entityId: "hall", edgeId: "door-b", connectorKind: null },
    { kind: "entity_center", floor: 1, x: 9, y: 1, entityId: "ballroom", edgeId: "door-b", connectorKind: null },
  ],
};

const crossFloorRoute: MansionTraversalRouteV1 = {
  version: 1,
  fromRoomId: "foyer",
  toRoomId: "study",
  entityIds: ["foyer", "stairs-lower", "stairs-upper", "study"],
  doorIds: ["door-foyer", "door-study"],
  connectorIds: ["stairs-1-2"],
  distanceUnits: 12,
  waypoints: [
    { kind: "entity_center", floor: 1, x: 2, y: 2, entityId: "foyer", edgeId: null, connectorKind: null },
    { kind: "door", floor: 1, x: 4, y: 2, entityId: "foyer", edgeId: "door-foyer", connectorKind: null },
    { kind: "entity_center", floor: 1, x: 5, y: 2, entityId: "stairs-lower", edgeId: "door-foyer", connectorKind: null },
    { kind: "vertical_connector", floor: 1, x: 5, y: 2, entityId: "stairs-lower", edgeId: "stairs-1-2", connectorKind: "stairs" },
    { kind: "entity_center", floor: 2, x: 5, y: 2, entityId: "stairs-upper", edgeId: "stairs-1-2", connectorKind: "stairs" },
    { kind: "door", floor: 2, x: 6, y: 2, entityId: "stairs-upper", edgeId: "door-study", connectorKind: null },
    { kind: "entity_center", floor: 2, x: 8, y: 2, entityId: "study", edgeId: "door-study", connectorKind: null },
  ],
};

describe("Whodunnit mansion travel", () => {
  it("bounds first-visit travel duration and interpolates the authored route", () => {
    assert.equal(mysteryMansionTravelDurationMs(route), 2_210);
    assert.deepEqual(mysteryMansionTravelPointAtProgress(route, 0), {
      floor: 1, x: 1, y: 1, waypointIndex: 0,
    });
    const middle = mysteryMansionTravelPointAtProgress(route, 0.5);
    assert.equal(middle.floor, 1);
    assert.equal(middle.x, 5);
    assert.deepEqual(mysteryMansionTravelPointAtProgress(route, 1), {
      floor: 1, x: 9, y: 1, waypointIndex: 4,
    });
  });

  it("plans deterministic door cycles and material footsteps", () => {
    const first = mysteryMansionTravelFoleyPlanV1({
      route,
      seed: "case:move:1",
      durationMs: 2_210,
      footstepMaterial: "wood",
    });
    const second = mysteryMansionTravelFoleyPlanV1({
      route,
      seed: "case:move:1",
      durationMs: 2_210,
      footstepMaterial: "wood",
    });
    assert.deepEqual(first, second);
    assert.equal(first.filter((cue) => cue.kind === "door_open").length, 2);
    assert.equal(first.filter((cue) => cue.kind === "door_close").length, 2);
    assert.deepEqual(
      first.filter((cue) => cue.kind === "door_open").map((cue) => cue.acousticRole),
      ["outgoing", "corridor"],
    );
    assert.deepEqual(
      first.filter((cue) => cue.kind === "door_close").map((cue) => cue.acousticRole),
      ["corridor", "destination"],
    );
    assert.ok(first.some((cue) => cue.url.includes("footstep-wood")));
  });

  it("uses a compact non-blocking Foley bridge for revisits and skipped travel", () => {
    const compact = mysteryMansionTravelFoleyPlanV1({
      route,
      seed: "case:revisit:1",
      footstepMaterial: "stone",
      compact: true,
    });
    assert.deepEqual(compact.map((cue) => cue.atMs), [0, 125, 285]);
    assert.deepEqual(compact.map((cue) => cue.acousticRole), ["outgoing", "corridor", "destination"]);
    assert.ok(compact[1]?.url.includes("footstep-stone"));
  });

  it("expresses movement, thresholds, floor changes, steps, and arrival as timed cues", () => {
    const plan = mysteryMansionTravelCuePlanV1({ route: crossFloorRoute });
    assert.ok(plan.some((cue) => cue.kind === "movement"));
    assert.ok(plan.some((cue) => cue.kind === "door"));
    assert.ok(plan.some((cue) => cue.kind === "floor_change" && cue.connectorKind === "stairs"));
    assert.ok(plan.some((cue) => cue.kind === "step"));
    assert.equal(plan.at(-1)?.kind, "arrival");
    assert.equal(plan.at(-1)?.entityId, crossFloorRoute.toRoomId);
  });

  it("ships every deterministic footstep and threshold performance offline", () => {
    const urls = [
      ...Object.values(MYSTERY_MANSION_TRAVEL_AUDIO.footsteps).flat(),
      ...Object.values(MYSTERY_MANSION_TRAVEL_AUDIO.doors).flatMap((door) => [
        ...door.open,
        ...door.close,
      ]),
    ];
    assert.equal(urls.length, 12);
    for (const url of urls) {
      const file = new URL(`../../public${url}`, import.meta.url);
      assert.equal(existsSync(file), true, url);
      assert.ok(statSync(file).size > 1_000, url);
    }
  });
});
