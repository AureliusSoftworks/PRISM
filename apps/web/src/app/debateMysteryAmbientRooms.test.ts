import assert from "node:assert/strict";
import test from "node:test";
import { mysteryAmbientRooms } from "./debateMysteryAmbientRooms.ts";
import { readFileSync } from "node:fs";

const room = { x: 3, y: 3, width: 2, height: 2 };
const occupied = [room, { x: 3, y: 5, width: 6, height: 1 }];
const intersects = (a: typeof room, b: typeof room) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test("subdivides existing ambient bands without changing their bounds or playable geometry", () => {
  const space = { id: "ambient:deck", floor: 1, x: 0, y: 0, width: 12, height: 2, pattern: "outboard-band" as const };
  const args = { floor: 1, spaces: [space], occupied, roomFootprints: [room] };
  const before = JSON.stringify(args);
  const rooms = mysteryAmbientRooms(args);
  assert.ok(rooms.length > 6);
  assert.ok(new Set(rooms.map((item) => item.width)).size > 1);
  assert.equal(rooms.reduce((area, item) => area + item.width * item.height, 0), 24);
  assert.ok(rooms.every((item) => item.x >= 0 && item.x + item.width <= 12 && item.y + item.height <= 2));
  assert.deepEqual(mysteryAmbientRooms(args), rooms);
  assert.equal(JSON.stringify(args), before);
  assert.equal(new Set(rooms.map((item) => item.id)).size, rooms.length);
});

test("older maps gain quiet surrounding rooms without overlapping rooms or corridors", () => {
  const rooms = mysteryAmbientRooms({ floor: 1, spaces: null, occupied, roomFootprints: [room] });
  assert.ok(rooms.length > 0);
  for (const ambient of rooms) {
    assert.ok(occupied.every((entity) => !intersects(ambient, entity)));
    assert.ok(rooms.every((other) => other === ambient || !intersects(ambient, other)));
    assert.deepEqual(Object.keys(ambient).sort(), ["floor", "height", "id", "pattern", "width", "x", "y"]);
  }
});

test("an intentionally empty projection and a floor with no playable rooms stay empty", () => {
  assert.deepEqual(mysteryAmbientRooms({ floor: 1, spaces: [], occupied, roomFootprints: [room] }), []);
  assert.deepEqual(mysteryAmbientRooms({ floor: 2, spaces: null, occupied: [], roomFootprints: [] }), []);
});

test("authored infill retains exact rectangles and IDs without adding automatic filler", () => {
  const block = { id: "ambient:f1:01", kind: "infill" as const, floor: 1, x: 0, y: 3, width: 3, height: 2 };
  const upstairs = { ...block, id: "ambient:f2:01", floor: 2 };
  const args = { floor: 1, spaces: null, authoredInfill: [block, upstairs], occupied: [...occupied, block], roomFootprints: [room] };
  const before = JSON.stringify(args);
  assert.deepEqual(mysteryAmbientRooms(args), [{
    id: block.id, floor: 1, x: 0, y: 3, width: 3, height: 2, pattern: "closed-volume",
  }]);
  assert.equal(JSON.stringify(args), before);
  assert.deepEqual(mysteryAmbientRooms({ ...args, floor: 2 }), [{
    id: upstairs.id, floor: 2, x: 0, y: 3, width: 3, height: 2, pattern: "closed-volume",
  }]);
});

test("infill on another floor and corridor blocks do not suppress legacy fallback", () => {
  const args = { floor: 1, spaces: null, occupied, roomFootprints: [room] };
  assert.deepEqual(mysteryAmbientRooms({
    ...args,
    authoredInfill: [
      { id: "upstairs", kind: "infill", floor: 2, ...room },
      { id: "hall", kind: "corridor", floor: 1, ...room },
    ],
  }), mysteryAmbientRooms(args));
});

test("the real V2 map wires authored blocks only for legacy estates and keeps them inert", () => {
  const source = readFileSync(new URL("./DebateMysteryV2Experience.tsx", import.meta.url), "utf8");
  assert.match(source, /authoredInfill: mansionLayout\?\.venueProfile \? \[\] : mansionLayout\?\.entities\.filter\([\s\S]{0,120}entity\.kind === "infill"/u);
  const start = source.indexOf("{mansionAmbientSpaces.map");
  const render = source.slice(start, source.indexOf("{mansionCorridors.map", start));
  assert.match(render, /<i\s/u);
  assert.match(render, /aria-hidden="true"/u);
  assert.match(render, /data-ambient-space-id=\{space.id\}/u);
  assert.doesNotMatch(render, /onClick|onPointer|onKey|tabIndex|title=|aria-label|<button/u);
  const css = readFileSync(new URL("./debateMysteryV2.module.css", import.meta.url), "utf8");
  assert.match(css, /\.mansionAmbientSpace\s*\{[^}]*pointer-events:\s*none/u);
  // Ambient spaces wear the room silhouette (lit top bevel and side face) without any route hatching.
  assert.match(css, /\.mansionAmbientSpace::before\s*\{[^}]*border-top: 4px solid/u);
  assert.match(css, /\.mansionAmbientSpace::after\s*\{[^}]*clip-path: polygon/u);
  assert.doesNotMatch(css, /\.mansionAmbientSpace\s*\{[^}]*repeating-linear-gradient/u);
});
