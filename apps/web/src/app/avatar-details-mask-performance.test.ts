import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import * as avatarDetails from "./avatar-details.ts";

type MaskProps = Parameters<
  typeof import("./AvatarDetailsMask.tsx").AvatarDetailsMask
>[0];

interface JsxNode {
  props: { children?: JsxNode | readonly JsxNode[]; pixels?: Uint8ClampedArray };
}

function emptyDetails(): avatarDetails.AvatarDetailsV1 {
  return {
    version: 1,
    screen: { stamps: [], paintMaskBase64: null },
  };
}

function maskHarness() {
  const cells: Array<{ dependencies: readonly unknown[]; value: unknown }> = [];
  let hookIndex = 0;
  let visibleRasterizations = 0;
  const exports = {} as {
    AvatarDetailsMask: (props: MaskProps) => JsxNode | null;
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL("./AvatarDetailsMask.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  runInNewContext(compiled, {
    exports,
    Uint8ClampedArray,
    require(name: string) {
      if (name === "react") {
        return {
          useMemo<T>(factory: () => T, dependencies: readonly unknown[]): T {
            const currentIndex = hookIndex++;
            const current = cells[currentIndex];
            if (
              current &&
              current.dependencies.length === dependencies.length &&
              current.dependencies.every((value, index) =>
                Object.is(value, dependencies[index]),
              )
            ) {
              return current.value as T;
            }
            const value = factory();
            cells[currentIndex] = { dependencies, value };
            return value;
          },
          useLayoutEffect() {},
          useRef: (value: unknown) => ({ current: value }),
          useState: (value: unknown) => [value, () => {}],
        };
      }
      if (name === "react/jsx-runtime") {
        return {
          Fragment: Symbol("fragment"),
          jsx: (_type: unknown, props: JsxNode["props"]) => ({ props }),
          jsxs: (_type: unknown, props: JsxNode["props"]) => ({ props }),
        };
      }
      if (name === "./avatar-details") {
        return {
          ...avatarDetails,
          rasterizeVisibleAvatarDetailsRgba(
            ...args: Parameters<typeof avatarDetails.rasterizeVisibleAvatarDetailsRgba>
          ) {
            visibleRasterizations += 1;
            return avatarDetails.rasterizeVisibleAvatarDetailsRgba(...args);
          },
        };
      }
      if (name === "./zenLiveMouth") {
        return { ZEN_LIVE_CUSTOM_MOUTH_SPIN_TURN_MS: 360 };
      }
      if (name === "./avatar-details-speech-motion") {
        return { avatarDetailsSpeechMotionOrigin: () => null };
      }
      if (name === "./avatar-details-glow") {
        return {
          avatarDetailsCropRgbaRaster: () => null,
          avatarDetailsExteriorGlowRaster: () => null,
        };
      }
      if (name === "./phosphorPixelRaster") {
        return { resamplePhosphorRgbaForPresentation: (pixels: Uint8ClampedArray) => pixels };
      }
      if (name.endsWith(".css")) return { default: {} };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return {
    get visibleRasterizations() {
      return visibleRasterizations;
    },
    render(props: MaskProps): JsxNode | null {
      hookIndex = 0;
      return exports.AvatarDetailsMask(props);
    },
  };
}

function visiblePixels(node: JsxNode): Uint8ClampedArray {
  const children = node.props.children;
  assert.ok(Array.isArray(children));
  const visiblePlane = children[0];
  assert.ok(visiblePlane?.props.pixels instanceof Uint8ClampedArray);
  return visiblePlane.props.pixels;
}

test("real AvatarDetailsMask hooks retain equal fresh geometry, but reraster pose and authored geometry changes", () => {
  let colorMap: Uint8Array<ArrayBufferLike> = new Uint8Array(
    avatarDetails.AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
  );
  colorMap = avatarDetails.paintAvatarDetailsColorMap(
    colorMap,
    [{ x: 60, y: 60 }],
    1,
    "blink",
  ).colorMap;
  colorMap = avatarDetails.paintAvatarDetailsColorMap(
    colorMap,
    [{ x: 64, y: 60 }],
    1,
    "talking",
  ).colorMap;
  const authoredDetails = avatarDetails.avatarDetailsWithPaintColorMap(
    avatarDetails.toggleAvatarDetailStamp(emptyDetails(), "round-glasses"),
    colorMap,
  );
  const base = {
    details: authoredDetails,
    color: "#f0c020",
    blinkPhase: "open" as const,
    talking: false,
    faceGeometry: { eyeScale: 0.9, eyeOffsetX: 0.04 },
  };
  const h = maskHarness();
  const first = h.render(base);
  assert.ok(first);
  const firstPixels = visiblePixels(first);
  assert.deepEqual(
    Array.from(firstPixels),
    Array.from(
      avatarDetails.rasterizeVisibleAvatarDetailsRgba(
        authoredDetails,
        "#f0c020",
        { eyeScale: 0.9, eyeOffsetX: 0.04 },
        { blinking: false, talking: false },
        "above-face",
      ),
    ),
    "the rendered component pixels remain equal to an independent direct raster",
  );
  assert.equal(h.visibleRasterizations, 1);

  const equivalentGeometry = h.render({
    ...base,
    faceGeometry: { eyeScale: 0.9, eyeOffsetX: 0.04 },
  });
  assert.ok(equivalentGeometry);
  assert.equal(
    visiblePixels(equivalentGeometry),
    firstPixels,
    "a fresh face-style object with equal normalized values retains the raster",
  );
  assert.equal(h.visibleRasterizations, 1, "equal geometry does not allocate or repaint a raster");

  const poseOnly = h.render({ ...base, mouthShape: "open-wide" });
  assert.ok(poseOnly);
  assert.equal(
    visiblePixels(poseOnly),
    firstPixels,
    "mouth pose updates retain the unchanged visible raster",
  );
  assert.equal(h.visibleRasterizations, 1, "pose-only rerenders do not allocate or repaint ink");

  const blinking = h.render({ ...base, blinkPhase: "closed" });
  assert.ok(blinking);
  assert.equal(h.visibleRasterizations, 2, "blink changes reraster visible semantic ink");
  assert.notDeepEqual(Array.from(visiblePixels(blinking)), Array.from(firstPixels));

  const talking = h.render({ ...base, talking: true });
  assert.ok(talking);
  assert.equal(h.visibleRasterizations, 3, "talking changes reraster visible semantic ink");
  assert.notDeepEqual(Array.from(visiblePixels(talking)), Array.from(firstPixels));

  const changedGeometry = h.render({
    ...base,
    faceGeometry: { eyeScale: 1.2, eyeOffsetX: -0.1 },
  });
  assert.ok(changedGeometry);
  assert.equal(h.visibleRasterizations, 4, "authored face geometry changes reraster detail placement");
  assert.notDeepEqual(Array.from(visiblePixels(changedGeometry)), Array.from(firstPixels));

  assert.equal(
    h.render({ ...base, details: emptyDetails() }),
    null,
    "empty ink stays unmounted",
  );
  assert.equal(h.visibleRasterizations, 4, "empty ink does not allocate a visible raster");
});
