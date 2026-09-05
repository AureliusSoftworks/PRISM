import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FlytingGalleryWorld, type FlytingGalleryRegion } from "./debateFlytingGalleryMotion.ts";
import {
  FlytingGalleryWriteCache,
  flytingGalleryDepthRanks,
  flytingGalleryMembersSignature,
} from "./flytingGalleryMotionCache.ts";

const members = (leaning: FlytingGalleryRegion, count = 18) =>
  Array.from({ length: count }, (_, i) => ({ id: `bot-${i}`, leaning }));
function advance(world: FlytingGalleryWorld, seconds: number, fps = 60) {
  for (let i = 0; i < seconds * fps; i++) world.step(1 / fps);
}
function positions(world: FlytingGalleryWorld) {
  return [...world.bodies.values()].map(({ id, x, y, vx, vy }) => ({ id, x, y, vx, vy }));
}
function inside(world: FlytingGalleryWorld) {
  for (const body of world.bodies.values()) {
    const b = world.bounds(body.leaning);
    assert.ok(body.x >= b.left - 0.001 && body.x <= b.right + 0.001, `${body.id}: x=${body.x}`);
    assert.ok(body.y >= b.top - 0.001 && body.y <= b.bottom + 0.001, `${body.id}: y=${body.y}`);
  }
}

describe("Flyting independent floor roaming", () => {
  it("changes depth ranks only when foot ordering changes, including subpixel crossings", () => {
    const initial = [{ id: "a", y: 10 }, { id: "b", y: 10.02 }, { id: "c", y: 20 }];
    assert.deepEqual([...flytingGalleryDepthRanks(initial)], [["a", 100], ["b", 101], ["c", 102]]);
    assert.deepEqual([...flytingGalleryDepthRanks(initial.map(b => ({ ...b, y: b.y + 2.35 })))], [...flytingGalleryDepthRanks(initial)]);
    assert.deepEqual([...flytingGalleryDepthRanks([{ id: "a", y: 10.03 }, initial[1]!, initial[2]!])], [["b", 100], ["a", 101], ["c", 102]]);
    assert.deepEqual([...flytingGalleryDepthRanks([{ id: "b", y: 10 }, { id: "a", y: 10 }])], [["a", 100], ["b", 101]]);
  });

  it("uses the helmet-safe floor vertically and reserves destinations across it on mass votes", () => {
    for (const [width, height, size] of [[720, 188, 29], [1400, 244, 46], [2000, 500, 46]]) {
      const world = new FlytingGalleryWorld();
      world.configure(width!, height!, size!, 60);
      world.sync(members("neutral"));
      for (const side of ["for", "against", "for"] as const) {
        world.sync(members(side));
        const b = world.bounds(side);
        assert.equal(b.bottom, height! * 0.96);
        assert.ok(b.top >= size! * 1.75 - 0.001, "horn clearance above the foot anchor");
        const targets = [...world.bodies.values()];
        const spreadX = Math.max(...targets.map(b => b.targetX)) - Math.min(...targets.map(b => b.targetX));
        const spreadY = Math.max(...targets.map(b => b.targetY)) - Math.min(...targets.map(b => b.targetY));
        assert.ok(spreadX > (b.right - b.left) * 0.75, `horizontal destination spread: ${spreadX}`);
        assert.ok(spreadY > (b.bottom - b.top) * 0.75, `vertical destination spread: ${spreadY}`);
        advance(world, 40);
        inside(world);
        assert.ok([...world.bodies.values()].every(body => !body.travelling), "all 18 arrive without stopping independent roaming");
      }
    }
  });

  it("does not repeat unchanged paint writes or treat equal member updates as a world change", () => {
    const cache = new FlytingGalleryWriteCache<object>();
    const seat = {};
    let writes = 0;
    assert.equal(cache.write(seat, "translate", "10px", () => { writes += 1; }), true);
    assert.equal(cache.write(seat, "translate", "10px", () => { writes += 1; }), false);
    assert.equal(cache.write(seat, "translate", "11px", () => { writes += 1; }), true);
    assert.equal(writes, 2);
    assert.equal(
      flytingGalleryMembersSignature(members("neutral")),
      flytingGalleryMembersSignature(members("neutral")),
    );
    assert.notEqual(
      flytingGalleryMembersSignature(members("neutral")),
      flytingGalleryMembersSignature(members("for")),
    );
  });

  it("deterministically scatters a full crowd into any voting region without rows", () => {
    for (const side of ["for", "neutral", "against"] as const) {
      const a = new FlytingGalleryWorld(), b = new FlytingGalleryWorld();
      a.sync(members(side)); b.sync(members(side));
      assert.deepEqual(positions(a), positions(b));
      inside(a);
      assert.equal(new Set([...a.bodies.values()].map((body) => Math.round(body.y))).size > 12, true);
      advance(a, 120); advance(b, 120);
      assert.deepEqual(positions(a), positions(b));
      inside(a);
    }
  });

  it("wanders beyond an idle bob, pauses independently, and remains bounded", () => {
    const world = new FlytingGalleryWorld();
    world.sync(members("for", 4));
    const initial = positions(world);
    const travelled = new Set<string>(), paused = new Set<string>();
    for (let i = 0; i < 60 * 45; i++) {
      world.step(1 / 60);
      inside(world);
      for (const body of world.bodies.values()) {
        if (Math.hypot(body.x - initial.find((a) => a.id === body.id)!.x, body.y - initial.find((a) => a.id === body.id)!.y) > 35) travelled.add(body.id);
        if (body.pause > 0 && Math.hypot(body.vx, body.vy) < 1) paused.add(body.id);
      }
    }
    assert.equal(travelled.size, 4);
    assert.equal(paused.size, 4);
  });

  it("preserves positions and velocity across vote changes and mid-travel reversals", () => {
    const world = new FlytingGalleryWorld();
    world.sync(members("for"));
    advance(world, 4);
    const before = positions(world);
    world.sync(members("against"));
    assert.deepEqual(positions(world), before);
    advance(world, 2);
    const midway = positions(world);
    assert.notDeepEqual(midway, before);
    world.sync(members("for"));
    assert.deepEqual(positions(world), midway);
    advance(world, 25);
    inside(world);
  });

  it("crosses the room into the selected region without teleporting or starving a crowded arrival", () => {
    const world = new FlytingGalleryWorld();
    world.sync(members("for"));
    world.sync(members("against"));
    const targets = [...world.bodies.values()].map((body) => body.targetX);
    assert.ok(Math.max(...targets) - Math.min(...targets) > 200,
      "a unanimous vote must reserve destinations across the region, not pile into one corner");
    for (let i = 0; i < 60 * 40; i++) {
      const before = positions(world);
      world.step(1 / 60);
      positions(world).forEach((body, index) => {
        assert.ok(Math.hypot(body.x - before[index]!.x, body.y - before[index]!.y) < 2.1);
      });
    }
    inside(world);
    assert.equal([...world.bodies.values()].filter((b) => b.travelling).length, 0);
  });

  it("does not restart on face updates, list reorder, or unrelated votes", () => {
    const world = new FlytingGalleryWorld();
    world.sync(members("neutral"));
    advance(world, 3);
    const before = positions(world);
    const target = world.bodies.get("bot-5")!.targetX;
    world.sync([...members("neutral")].reverse());
    assert.deepEqual(positions(world), before);
    world.sync(members("neutral").map((member, i) => i === 0 ? { ...member, leaning: "for" } : member));
    assert.equal(world.bodies.get("bot-5")!.targetX, target);
    assert.deepEqual(positions(world), before);
  });

  it("keeps guards in the center until their own allegiance changes", () => {
    const world = new FlytingGalleryWorld();
    const roster = [...members("for", 15), ...Array.from({ length: 3 }, (_, i) => ({ id: `guard-${i}`, leaning: "neutral" as const }))];
    world.sync(roster);
    advance(world, 20);
    inside(world);
    assert.equal(world.bodies.get("guard-0")!.leaning, "neutral");
    world.sync(roster.map((member) => ({ ...member, leaning: "against" })), true);
    inside(world);
  });

  it("softly separates overlapping neighbors rather than locking them together", () => {
    const world = new FlytingGalleryWorld();
    world.sync(members("neutral", 2));
    const [a, b] = [...world.bodies.values()];
    a!.x = b!.x = 500; a!.y = b!.y = 140;
    a!.pause = b!.pause = 10;
    advance(world, 2);
    assert.ok(Math.abs(a!.x - b!.x) > 20);
    inside(world);
  });

  it("uses the authored roam range and resizes in floor coordinates", () => {
    const world = new FlytingGalleryWorld();
    world.sync(members("neutral", 3));
    const before = positions(world);
    world.configure(2000, 480, 92, 60);
    positions(world).forEach((body, i) => {
      assert.equal(body.x, before[i]!.x * 2);
      assert.equal(body.y, before[i]!.y * 2);
    });
    world.configure(1000, 240, 46, 0);
    advance(world, 20);
    assert.equal(new Set(positions(world).map((b) => b.y)).size, 1);
    inside(world);
  });

  it("keeps a unanimous crowd bounded at compact and wide gallery sizes", () => {
    for (const [width, height, size] of [[720, 188, 29], [1400, 244, 46], [2000, 500, 46]]) {
      const world = new FlytingGalleryWorld();
      world.configure(width!, height!, size!, 60);
      world.sync(members("neutral"));
      world.sync(members("for"));
      advance(world, 35);
      inside(world);
      world.sync(members("against"));
      advance(world, 35);
      inside(world);
    }
  });

  it("settles reduced motion immediately and preserves unchanged seats", () => {
    const world = new FlytingGalleryWorld();
    world.sync(members("for"));
    world.sync(members("against"), true);
    inside(world);
    const still = positions(world);
    world.sync(members("against"), true);
    assert.deepEqual(positions(world), still);
    assert.ok(still.every((body) => body.vx === 0 && body.vy === 0));
  });

  it("caps suspended time, tolerates zero-size measurements, and removes old identities", () => {
    const world = new FlytingGalleryWorld();
    world.sync(members("neutral"));
    advance(world, 3);
    const before = positions(world);
    world.configure(0, 0, 0, NaN);
    world.step(NaN);
    assert.deepEqual(positions(world), before);
    world.step(600);
    positions(world).forEach((body, i) => assert.ok(Math.hypot(body.x - before[i]!.x, body.y - before[i]!.y) < 2));
    world.sync(members("neutral", 2));
    assert.equal(world.bodies.size, 2);
    world.sync([]);
    assert.equal(world.bodies.size, 0);
  });

  it("is frame-rate independent at 30 and 60 fps", () => {
    const a = new FlytingGalleryWorld(), b = new FlytingGalleryWorld();
    a.sync(members("neutral")); b.sync(members("neutral"));
    advance(a, 20, 30); advance(b, 20, 60);
    assert.deepEqual(positions(a), positions(b));
  });

  it("shares one stable-child controller across rehearsal and live, with depth and lifecycle ownership", () => {
    const source = readFileSync(new URL("./DebateFlyting.tsx", import.meta.url), "utf8");
    const component = readFileSync(new URL("./FlytingGalleryMotion.tsx", import.meta.url), "utf8");
    assert.equal([...source.matchAll(/<FlytingGalleryMotion\s/gu)].length, 2);
    assert.equal([...source.matchAll(/data-flyting-gallery-seat=\{seat.id\}/gu)].length, 2);
    assert.match(source, /members=\{previewHallSeats\}/u);
    assert.match(source, /members=\{hallAudienceSeats\}/u);
    assert.doesNotMatch(source, /styles.flytingAudience(?:Cluster|Layer)/u);
    assert.match(component, /this\.writes\.write\(seat, "z-index"/u);
    assert.match(component, /seat\.style\.transform = transform/u);
    assert.match(component, /portrait\.style\.transform = portraitTransform/u);
    assert.doesNotMatch(component, /--flyting-floor-(?:depth|bob|lean)/u);
    assert.match(component, /componentDidUpdate[\s\S]{0,480}nextMembersSignature !== this\.membersSignature/u);
    assert.doesNotMatch(component, /componentDidUpdate\(\): void \{\s*this\.refresh/u);
    assert.match(component, /new ResizeObserver\([\s\S]{0,100}this\.refreshGeometry\(\);\s*this\.refreshLifecycle\(\)/u);
    assert.match(component, /visibilitychange/u);
    assert.match(component, /IntersectionObserver/u);
    assert.match(component, /!this\.visible[\s\S]{0,180}this\.stop\(\);\s*return;/u);
    assert.match(component, /componentWillUnmount[\s\S]*this.stop/u);
    assert.doesNotMatch(component, /setState|\.animate\(/u);
    assert.match(source, /function FlytingGalleryLiveAmbience[\s\S]{0,2000}setMouthPhase/u);
    assert.doesNotMatch(source, /const \[galleryMouthPhase/u);
    assert.doesNotMatch(source, /const \[galleryHopWave/u);
  });
});
