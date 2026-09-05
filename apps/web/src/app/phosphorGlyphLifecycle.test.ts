import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as raster from "./phosphorPixelRaster.ts";
import * as schedule from "./phosphorRasterSchedule.ts";
import * as probes from "./phosphorFontProbe.ts";

// Execute the real glyph effect/raster code with controlled DOM/font/canvas
// shims. This measures work admission, NOT browser font appearance or GPU cost.
function harness() {
  const counts = { loads: 0, readbacks: 0, readySubscriptions: 0, geometry: 0 };
  const effects: (() => (() => void) | void)[] = [];
  const frames = new Map<number, () => void>();
  const fontListeners = new Set<() => void>();
  let nextFrame = 0;
  const node = { offsetWidth: 16, offsetHeight: 16, closest: () => null };
  const computed = {
    width: "16px", height: "16px", boxSizing: "border-box",
    fontSize: "16px", fontStyle: "normal", fontWeight: "400",
    fontFamily: '"Authored", monospace', letterSpacing: "0px",
    getPropertyValue: () => "0",
  };
  const fonts = {
    status: "loaded",
    load: async () => { counts.loads++; return []; },
    get ready() { counts.readySubscriptions++; return Promise.resolve(); },
    addEventListener: (_type: string, callback: () => void) => fontListeners.add(callback),
    removeEventListener: (_type: string, callback: () => void) => fontListeners.delete(callback),
  };
  const context = {
    clearRect() {}, fillText() {}, putImageData() {},
    measureText: () => ({ fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4 }),
    getImageData(_x: number, _y: number, width: number, height: number) {
      counts.readbacks++;
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  };
  const exports = {} as { CrtPixelTextGlyph: (props: unknown) => void };
  const compiled = ts.transpileModule(readFileSync(new URL("./PhosphorPixelGlyph.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === "react") return {
        forwardRef: (render: unknown) => render,
        useCallback: (fn: unknown) => fn,
        useLayoutEffect: (effect: () => (() => void) | void) => effects.push(effect),
        useRef: (value: unknown) => ({ current: value }),
        useState: (value: unknown) => [value, () => {}],
      };
      if (name === "react/jsx-runtime") return {
        jsx: (_type: unknown, props: { ref?: (node: unknown) => void }) => { props.ref?.(node); },
        jsxs: (_type: unknown, props: { ref?: (node: unknown) => void }) => { props.ref?.(node); },
      };
      if (name === "./phosphorPixelRaster") return raster;
      if (name === "./phosphorRasterSchedule") return schedule;
      if (name === "./phosphorFontProbe") return probes;
      if (name.endsWith(".css")) return { default: {} };
      throw new Error(`Unexpected import: ${name}`);
    },
    window: { devicePixelRatio: 1, getComputedStyle: () => { counts.geometry++; return computed; } },
    document: { fonts, createElement: () => ({ getContext: () => context, toDataURL: () => "data:image/png;base64,fixture" }) },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback: () => void) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    queueMicrotask,
  });
  return {
    counts, frames, fontListeners,
    mount(content: string) {
      exports.CrtPixelTextGlyph({ content, enabled: true });
      const cleanups = effects.splice(0).map((effect) => effect());
      return () => cleanups.forEach((cleanup) => cleanup?.());
    },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); },
  };
}

test("real glyph effects keep cold fallback but warm poses avoid font-load and ready reraster storms", async () => {
  const h = harness();
  let cleanup = h.mount("o");
  assert.equal(h.counts.readbacks, 1, "cold glyph paints synchronously without waiting for fonts");
  await new Promise<void>((resolve) => setImmediate(resolve));
  h.flush();
  cleanup();
  cleanup = h.mount("o");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.frames.size, 0, "warm pose needs no promised reraster");
  cleanup();
  const readbacks = h.counts.readbacks;
  const geometry = h.counts.geometry;
  for (let step = 0; step < 60; step++) {
    cleanup = h.mount("o");
    await Promise.resolve();
    assert.equal(h.frames.size, 0);
    cleanup();
  }
  assert.equal(h.counts.loads, 1, "not one authored-font load per mouth effect restart");
  assert.equal(h.counts.readySubscriptions, 0, "a settled font set needs no ready continuation");
  assert.equal(h.counts.readbacks, readbacks, "warm masks remain cached");
  assert.equal(h.counts.geometry - geometry, 120, "one immediate two-read geometry pass per pose, no deferred extra passes");
  assert.equal(h.fontListeners.size, 0, "listeners are released on unmount");
});

test("late authored fonts still schedule a replacement and unmounted glyphs ignore them", async () => {
  const h = harness();
  const cleanup = h.mount("*");
  cleanup();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.frames.size, 0);
  const mounted = h.mount("*");
  for (const listener of h.fontListeners) listener();
  assert.equal(h.frames.size, 1);
  mounted();
  assert.equal(h.frames.size, 0);
});
