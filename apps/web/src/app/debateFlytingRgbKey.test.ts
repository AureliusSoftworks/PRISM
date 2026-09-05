import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  FLYTING_RGB_KEY_ASSETS,
  FLYTING_RGB_KEY_HUES,
  flytingRgbKeyRegionContains,
  flytingRgbToHsv,
  remapFlytingRgbKeyPixels,
  type FlytingRgbKeyRole,
} from "./debateFlytingRgbKey.ts";

describe("Flyting RGB-key hue remapping", () => {
  it("maps authored red, green, and blue roles to Pro, Jarl, and Con hues", () => {
    const source = new Uint8ClampedArray([
      128, 64, 64, 37, 32, 160, 32, 129, 51, 51, 204, 255, 90, 70, 50, 201,
    ]);
    const output = remapFlytingRgbKeyPixels(source, 4, 1, {
      pro: "#00ffff",
      jarl: "#ff00ff",
      con: "#ffff00",
    });

    assert.deepEqual(
      [...output],
      [64, 128, 128, 37, 160, 32, 160, 129, 204, 204, 51, 255, 90, 70, 50, 201],
    );
    assert.deepEqual(
      [...source],
      [128, 64, 64, 37, 32, 160, 32, 129, 51, 51, 204, 255, 90, 70, 50, 201],
    );
  });

  it("preserves each keyed pixel's saturation, value, and alpha", () => {
    const source = new Uint8ClampedArray([
      176, 44, 44, 73, 44, 176, 44, 149, 44, 44, 176, 221, 0, 0, 0, 0,
    ]);
    const output = remapFlytingRgbKeyPixels(source, 4, 1, {
      pro: "#7f4cff",
      jarl: "#ff9a3d",
      con: "#3de2ff",
    });

    for (let pixel = 0; pixel < 3; pixel += 1) {
      const offset = pixel * 4;
      const before = flytingRgbToHsv(
        source[offset]!,
        source[offset + 1]!,
        source[offset + 2]!,
      );
      const after = flytingRgbToHsv(
        output[offset]!,
        output[offset + 1]!,
        output[offset + 2]!,
      );
      assert.ok(Math.abs(before.s - after.s) <= 1 / 255);
      assert.ok(Math.abs(before.v - after.v) <= 1 / 255);
      assert.equal(output[offset + 3], source[offset + 3]);
    }
  });

  it("leaves non-key color, near-neutral antialiasing, and out-of-role pixels untouched", () => {
    const source = new Uint8ClampedArray([
      100, 98, 98, 255, 160, 112, 64, 180, 64, 160, 112, 120, 12, 23, 34, 45,
    ]);
    const output = remapFlytingRgbKeyPixels(source, 4, 1, {
      pro: "#00ffff",
      jarl: "#ff00ff",
      con: "#ffff00",
    });
    assert.deepEqual(output, source);
  });

  it("maps every dark and light scene to one complete RGB-key source raster", () => {
    assert.deepEqual(Object.keys(FLYTING_RGB_KEY_ASSETS), [
      "wide",
      "jarl",
      "gallery",
    ]);
    assert.deepEqual(FLYTING_RGB_KEY_HUES, {
      pro: 0,
      jarl: 120,
      con: 240,
    });

    const expectedSources = {
      wide: {
        dark: "/debate/flyting/mead-hall-keyed-base.webp",
        light: "/debate/flyting/mead-hall-keyed-base-light.webp",
      },
      jarl: {
        dark: "/debate/flyting/jarl-throne-keyed-base.webp",
        light: "/debate/flyting/jarl-throne-keyed-base-light.webp",
      },
      gallery: {
        dark: "/debate/flyting/mead-hall-gallery-floor.webp",
        light: "/debate/flyting/mead-hall-gallery-floor-light.webp",
      },
    } as const;

    for (const scene of ["wide", "jarl", "gallery"] as const) {
      for (const theme of ["dark", "light"] as const) {
        const asset = FLYTING_RGB_KEY_ASSETS[scene][theme];
        assert.equal(asset.src, expectedSources[scene][theme]);
        for (const role of ["pro", "jarl", "con"] as FlytingRgbKeyRole[]) {
          assert.ok(asset.regions[role].length > 0);
        }
      }
    }
  });

  it("covers the outer fringe of all three rugs in both gallery themes", () => {
    const expectedFringePixels = {
      dark: {
        pro: [120, 550],
        jarl: [1230, 550],
        con: [2050, 550],
      },
      light: {
        pro: [120, 550],
        jarl: [1232, 558],
        con: [2050, 550],
      },
    } as const;

    for (const theme of ["dark", "light"] as const) {
      for (const role of ["pro", "jarl", "con"] as const) {
        const [x, y] = expectedFringePixels[theme][role];
        assert.ok(
          FLYTING_RGB_KEY_ASSETS.gallery[theme].regions[role].some((region) =>
            flytingRgbKeyRegionContains(region, x, y),
          ),
          `${theme} ${role} rug fringe must be RGB-keyed`,
        );
      }
    }
  });

  it("keeps visible red, green, and blue authoring keys in all six rasters", () => {
    const verifierPath = fileURLToPath(
      new URL(
        "../../../../scripts/build-flyting-rgb-key-assets.mjs",
        import.meta.url,
      ),
    );
    const verification = execFileSync(
      process.execPath,
      ["--experimental-strip-types", verifierPath, "--check"],
      { encoding: "utf8", maxBuffer: 16_000 },
    );
    for (const scene of ["wide", "jarl", "gallery"] as const) {
      assert.match(verification, new RegExp(`checked ${scene}/dark`, "u"));
      assert.match(verification, new RegExp(`checked ${scene}/light`, "u"));
    }
  });
});
