import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as motion from "./debateFlytingGalleryMotion.ts";
import * as cache from "./flytingGalleryMotionCache.ts";

// Execute the production controller against controlled browser lifecycle events.
// Keep rendering/GPU verification separate from these deterministic DOM checks.
const source = readFileSync(new URL("./FlytingGalleryMotion.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

interface Props {
  members: readonly motion.FlytingGalleryMember[];
  botScale: number;
  maxVerticalRoam: number;
}
interface Controller {
  props: Props;
  container: { current: unknown };
  world: motion.FlytingGalleryWorld;
  componentDidMount(): void;
  componentDidUpdate(): void;
  componentWillUnmount(): void;
}

function harness() {
  const counts = { reads: 0, queries: 0, writes: 0, disconnected: 0 };
  const propertyWrites = new Map<string, number>();
  const size = { width: 1200, height: 240 };
  const frames = new Map<number, (time: number) => void>();
  const listeners = new Map<string, () => void>();
  let nextFrame = 1;
  let resized = () => {};
  let reducedChanged = () => {};
  let intersected: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const media = {
    matches: false,
    addEventListener(_type: string, callback: () => void) { reducedChanged = callback; },
    removeEventListener() {},
  };
  const view = {
    requestAnimationFrame(callback: (time: number) => void) {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    matchMedia() { return media; },
  };
  const document = {
    hidden: false,
    defaultView: view,
    addEventListener(type: string, callback: () => void) { listeners.set(type, callback); },
    removeEventListener(type: string) { listeners.delete(type); },
  };
  const style = (kind: string) => new Proxy<Record<string, unknown>>({}, {
    set(target, key, value) {
      counts.writes++;
      const property = `${kind}.${String(key)}`;
      propertyWrites.set(property, (propertyWrites.get(property) ?? 0) + 1);
      return Reflect.set(target, key, value);
    },
  });
  const seats = Array.from({ length: 18 }, (_, index) => {
    const portrait = { style: style("portrait") };
    return {
      style: style("seat"),
      dataset: new Proxy<Record<string, string>>({ flytingGallerySeat: `bot-${index}` }, {
        set(target, key, value) { counts.writes++; return Reflect.set(target, key, value); },
      }),
      get offsetWidth() { counts.reads++; return 76; },
      querySelector() { counts.queries++; return portrait; },
    };
  });
  const root = {
    ownerDocument: document,
    get clientWidth() { counts.reads++; return size.width; },
    get clientHeight() { counts.reads++; return size.height; },
    querySelectorAll() { counts.queries++; return seats; },
  };
  const exports = {} as { FlytingGalleryMotion: new (props: Props) => Controller };
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === "react") return {
        Component: class {
          props: Props;
          constructor(props: Props) { this.props = props; }
        },
        createRef: () => ({ current: null }),
      };
      if (name === "react/jsx-runtime") return { jsx() {} };
      if (name === "./debateFlytingGalleryMotion") return motion;
      if (name === "./flytingGalleryMotionCache") return cache;
      throw new Error(`Unexpected controller dependency: ${name}`);
    },
    ResizeObserver: class {
      constructor(callback: () => void) { resized = callback; }
      observe() {}
      disconnect() { counts.disconnected++; }
    },
    IntersectionObserver: class {
      constructor(callback: typeof intersected) { intersected = callback; }
      observe() {}
      disconnect() { counts.disconnected++; }
    },
  });
  const controller = new exports.FlytingGalleryMotion({
    members: Array.from({ length: 18 }, (_, i) => ({ id: `bot-${i}`, leaning: "neutral" })),
    botScale: 60,
    maxVerticalRoam: 60,
  });
  controller.container.current = root;
  controller.componentDidMount();
  return {
    controller, counts, propertyWrites, seats, size, frames, listeners,
    update(props: Partial<Props> = {}) {
      controller.props = { ...controller.props, ...props };
      controller.componentDidUpdate();
    },
    resize(width: number, height = size.height) { Object.assign(size, { width, height }); resized(); },
    reduced(matches: boolean) { media.matches = matches; reducedChanged(); },
    visible(visible: boolean) { document.hidden = !visible; listeners.get("visibilitychange")!(); },
    intersect(visible: boolean) { intersected([{ isIntersecting: visible }]); },
    frame(time: number) {
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback(time);
    },
  };
}

describe("Flyting gallery controller lifecycle", () => {
  it("keeps crossing transforms continuous while avoiding redundant depth paint writes", () => {
    const h = harness();
    h.frame(0);
    const oldDepth = new Map<string, number>();
    const oldScale = new Map<string, string>();
    let priorDepthWrites = 0, priorScaleWrites = 0;
    h.propertyWrites.clear();
    h.counts.reads = 0;
    for (let frame = 1; frame <= 1080; frame++) {
      if (frame === 1 || frame === 361 || frame === 721) {
        const leaning = frame === 361 ? "against" : "for";
        h.update({ members: h.controller.props.members.map(member => ({ ...member, leaning })) });
      }
      h.frame(frame * 1000 / 60);
      const bodies = [...h.controller.world.bodies.values()];
      for (const body of bodies) {
        const oldZ = 100 + Math.round(body.y * 10);
        const oldS = (0.84 + 0.16 * body.y / h.controller.world.height).toFixed(4);
        if (oldDepth.get(body.id) !== oldZ) priorDepthWrites++;
        if (oldScale.get(body.id) !== oldS) priorScaleWrites++;
        oldDepth.set(body.id, oldZ); oldScale.set(body.id, oldS);
      }
      const ordered = [...bodies].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
      ordered.forEach((body, i) => {
        const seat = h.seats.find(seat => seat.dataset.flytingGallerySeat === body.id)!;
        assert.equal(seat.style.zIndex, String(100 + i));
      });
      assert.equal(h.frames.size, 1);
    }
    const depthWrites = h.propertyWrites.get("seat.zIndex") ?? 0;
    const scaleWrites = h.propertyWrites.get("seat.transform") ?? 0;
    assert.ok(depthWrites < priorDepthWrites * 0.3, `${depthWrites} ranked depth writes vs ${priorDepthWrites} old subpixel writes`);
    assert.ok(scaleWrites < priorScaleWrites * 0.3, `${scaleWrites} scale writes vs ${priorScaleWrites} old scale writes`);
    assert.ok((h.propertyWrites.get("seat.translate") ?? 0) > 15_000, "translation stays continuous for all 18, without a frame cap");
    assert.ok((h.propertyWrites.get("portrait.transform") ?? 0) > 5_000, "gait is retained");
    assert.equal(h.counts.reads, 0);
    assert.equal(h.controller.world.bodies.size, 18);
    console.info(`Crossing DOM writes (18 seconds, 18 bots): depth ${depthWrites}/${priorDepthWrites}, scale ${scaleWrites}/${priorScaleWrites}, translation ${h.propertyWrites.get("seat.translate")}, gait ${h.propertyWrites.get("portrait.transform")}; layout reads ${h.counts.reads}. Not a browser FPS measurement.`);
    h.controller.componentWillUnmount();
  });

  it("does no DOM work and schedules no extra frames for identical face-only updates", () => {
    const h = harness();
    Object.assign(h.counts, { reads: 0, queries: 0, writes: 0 });
    for (let i = 0; i < 50; i++) h.update({ members: h.controller.props.members.map(member => ({ ...member })) });
    assert.deepEqual(h.counts, { reads: 0, queries: 0, writes: 0, disconnected: 0 });
    assert.equal(h.frames.size, 1);
    h.controller.componentWillUnmount();
  });

  it("retargets changed votes while keeping the same bodies and current positions", () => {
    const h = harness();
    h.frame(0); h.frame(16); h.frame(32);
    const bodies = [...h.controller.world.bodies.values()];
    const before = bodies.map(({ x, y, vx, vy }) => ({ x, y, vx, vy }));
    h.update({ members: h.controller.props.members.map(member => ({ ...member, leaning: "against" })) });
    assert.deepEqual([...h.controller.world.bodies.values()], bodies);
    assert.deepEqual(bodies.map(({ x, y, vx, vy }) => ({ x, y, vx, vy })), before);
    assert.ok(bodies.every(body => body.leaning === "against" && body.travelling));
    assert.equal(h.frames.size, 1);
    h.controller.componentWillUnmount();
  });

  it("reconfigures scale and roam without repeating geometry work on the next update", () => {
    const h = harness();
    h.update({ botScale: 80, maxVerticalRoam: 30 });
    assert.equal(h.controller.world.bodySize, 60.8);
    assert.equal(h.controller.world.maxVerticalRoam, 30);
    h.counts.reads = 0;
    h.update();
    assert.equal(h.counts.reads, 0);
    h.controller.componentWillUnmount();
  });

  it("stops on zero width or height and resumes when the gallery has area again", () => {
    const h = harness();
    h.resize(0); assert.equal(h.frames.size, 0);
    h.resize(1200); assert.equal(h.frames.size, 1);
    h.resize(1200, 0); assert.equal(h.frames.size, 0);
    h.resize(1200, 240); assert.equal(h.frames.size, 1);
    h.controller.componentWillUnmount();
  });

  it("suspends hidden, offscreen and reduced-motion scenes without fast-forwarding", () => {
    const h = harness();
    h.frame(0); h.frame(16);
    const before = [...h.controller.world.bodies.values()].map(({ x, y }) => ({ x, y }));
    h.visible(false); assert.equal(h.frames.size, 0);
    h.visible(true); assert.equal(h.frames.size, 1);
    h.frame(30_000);
    assert.deepEqual([...h.controller.world.bodies.values()].map(({ x, y }) => ({ x, y })), before);
    h.intersect(false); assert.equal(h.frames.size, 0);
    h.intersect(true); assert.equal(h.frames.size, 1);
    h.reduced(true); assert.equal(h.frames.size, 0);
    assert.ok([...h.controller.world.bodies.values()].every(body => body.vx === 0 && body.vy === 0));
    h.reduced(false); assert.equal(h.frames.size, 1);
    h.controller.componentWillUnmount();
  });

  it("releases its pending frame, observers and document listener on unmount", () => {
    const h = harness();
    h.controller.componentWillUnmount();
    assert.equal(h.frames.size, 0);
    assert.equal(h.counts.disconnected, 2);
    assert.equal(h.listeners.size, 0);
  });
});
