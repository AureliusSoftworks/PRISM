import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  DISABLED_BOT_FACE_THINKING_FRAMES,
} from "@localai/shared";

const require = createRequire(import.meta.url);
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const face = readFileSync(new URL("./CoffeeSeatPlateEmoji.tsx", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing production block: ${start}`);
  return source.slice(from, to);
}

// Execute the production gate and effect, including their real dependencies.
// This checks timer ownership, not browser paint or recorded audio delivery.
const thinkingBranch = between(page,
  "const directionIndependentThinkingScreen = thinkingSpinnerActive ? (",
  "if (microFallbackActive)");
const motionMode = thinkingBranch.match(/motionMode=\{([\s\S]*?)\}/u)?.[1];
assert.ok(motionMode);
const semanticGate = between(page,
  "const resolvedSemanticFaceMotionEnabled =", "const inkAuthoringActive");
const frameMs = face.match(/const COFFEE_SEAT_THINKING_SPINNER_FRAME_MS = (\d+);/u)?.[1];
assert.ok(frameMs);
const effectStart = face.lastIndexOf("useEffect(() => {", face.indexOf("if (!thinkingSpinnerMotionActive)"));
const clock = face.slice(effectStart, face.indexOf("const displayBlinkPhase", effectStart));
const compiled = ts.transpileModule(`(scope) => {
  const { semanticFaceMotionEnabled, runtimeEffectsEnabled, renderDetailLevel,
    enabled, isTalking, showThinkingSpinner, faceThinkingFrames } = scope;
  ${semanticGate}
  const motionMode = (${motionMode});
  ${between(face, "const fullMotion =", "const questionGlyphActive =")}
  ${clock}
  const thinkingSpinnerFrameIndex = readFrameIndex();
  ${between(face, "const thinkingSpinnerGlyph =", "// Raster masks")}
  return { motionMode, thinkingSpinnerGlyph, thinkingSpinnerActive, thinkingSpinnerFrameIndex };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

interface FrameProps {
  semanticFaceMotionEnabled?: boolean;
  runtimeEffectsEnabled: boolean;
  renderDetailLevel: string;
  enabled: boolean;
  isTalking: boolean;
  showThinkingSpinner: boolean;
  faceThinkingFrames: readonly string[];
}

function harness(frames: readonly string[]) {
  let index = 0;
  let previousDependencies: unknown[] | undefined;
  let cleanup: (() => void) | undefined;
  let started = 0;
  let nextId = 0;
  const timers = new Map<number, () => void>();
  const render = runInNewContext(compiled, {
    ...require("@localai/shared"),
    ...require("./coffee-seat-thinking-presentation.ts"),
    COFFEE_SEAT_THINKING_SPINNER_FRAME_MS: Number(frameMs),
    readFrameIndex: () => index,
    setThinkingSpinnerFrameIndex: (next: number | ((current: number) => number)) => {
      index = typeof next === "function" ? next(index) : next;
    },
    useEffect: (effect: () => (() => void) | undefined, dependencies: unknown[]) => {
      if (previousDependencies?.every((value, i) => Object.is(value, dependencies[i]))) return;
      cleanup?.();
      previousDependencies = dependencies;
      cleanup = effect();
    },
    setInterval: (tick: () => void, delay: number) => {
      assert.equal(delay, 142);
      started += 1;
      timers.set(++nextId, tick);
      return nextId;
    },
    clearInterval: (id: number) => timers.delete(id),
  }) as (props: FrameProps) => {
    motionMode: string; thinkingSpinnerGlyph: string;
    thinkingSpinnerActive: boolean; thinkingSpinnerFrameIndex: number;
  };
  const props: FrameProps = {
    semanticFaceMotionEnabled: true, runtimeEffectsEnabled: false,
    renderDetailLevel: "full", enabled: true, isTalking: false,
    showThinkingSpinner: true, faceThinkingFrames: frames,
  };
  return {
    render: (change: Partial<FrameProps> = {}) => render(Object.assign(props, change)),
    tick: () => { for (const tick of timers.values()) tick(); },
    started: () => started, pending: () => timers.size,
    unmount: () => cleanup?.(),
  };
}

for (const [name, frames] of [
  ["default", DEFAULT_BOT_FACE_THINKING_FRAMES],
  ["custom", ["◐", "◓", "◑", "◒"]],
] as const) {
  for (const [surface, runtimeEffectsEnabled] of [
    ["live performance", false],
    ["faithful replay", true],
  ] as const) {
    test(`Signal ${surface} advances ${name} frames`, () => {
      const h = harness(frames);
      assert.equal(h.render({ runtimeEffectsEnabled }).motionMode, "full");
      assert.equal(h.render().thinkingSpinnerGlyph, frames[0]);
      for (let step = 1; step <= 9; step++) {
        h.tick();
        for (let rerender = 0; rerender < 10; rerender++) {
          // Parent renders reconstruct normalized face styles on each update.
          const result = h.render({ faceThinkingFrames: [...frames] });
          assert.equal(result.thinkingSpinnerFrameIndex, step % 4);
          assert.equal(result.thinkingSpinnerGlyph, frames[step % 4]);
        }
      }
      assert.equal(h.started(), 1, "unrelated renders must not restart the frame clock");
      h.unmount();
      assert.equal(h.pending(), 0);
    });
  }
}

test("authored static and disabled motion keep the first frame and release the clock", () => {
  for (const gate of [
    { semanticFaceMotionEnabled: false },
    { semanticFaceMotionEnabled: undefined, runtimeEffectsEnabled: false },
    { renderDetailLevel: "audience" },
    { enabled: false },
  ]) {
    const h = harness(DEFAULT_BOT_FACE_THINKING_FRAMES);
    h.render(); h.tick();
    assert.equal(h.render(gate).thinkingSpinnerFrameIndex, 0);
    assert.equal(h.pending(), 0);
    h.tick();
    assert.equal(h.render().thinkingSpinnerGlyph, DEFAULT_BOT_FACE_THINKING_FRAMES[0]);
    h.unmount();
  }
});

test("ending thinking or starting speech stops the clock; the next run starts cleanly", () => {
  const h = harness(DEFAULT_BOT_FACE_THINKING_FRAMES);
  h.render(); h.tick();
  assert.equal(h.render({ showThinkingSpinner: false }).thinkingSpinnerActive, false);
  assert.equal(h.pending(), 0);
  assert.equal(h.render({ showThinkingSpinner: true }).thinkingSpinnerFrameIndex, 0);
  h.tick();
  assert.equal(h.render().thinkingSpinnerFrameIndex, 1);
  assert.equal(h.render({ isTalking: true }).thinkingSpinnerActive, false);
  assert.equal(h.pending(), 0);
  h.render({ isTalking: false, faceThinkingFrames: DISABLED_BOT_FACE_THINKING_FRAMES });
  assert.equal(h.pending(), 0);
  h.unmount();
});

test("Signal live and faithful replay callers preserve their distinct motion policies", () => {
  const policy = between(page, "const signalLivePerformanceAvatar =", "const faceScaleY =");
  assert.match(policy, /avatarState\.surface === "stage"/u);
  assert.match(policy, /signalLiveSessionId !== null/u);
  assert.match(policy, /avatarState\.replayAudioMaster !== true/u);
  const props = between(page, "const signalMannequinProps:", "const signalMannequinAmbientProps:");
  assert.match(props, /semanticFaceMotionEnabled:\s*true/u);
  assert.match(props, /runtimeEffectsEnabled:\s*!signalLivePerformanceAvatar/u);
});
