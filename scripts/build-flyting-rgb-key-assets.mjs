import { fileURLToPath } from "node:url";
import path from "node:path";

import sharp from "sharp";

import {
  FLYTING_RGB_KEY_ASSETS,
  FLYTING_RGB_KEY_HUES,
  FLYTING_RGB_KEY_HUE_TOLERANCE_DEGREES,
  FLYTING_RGB_KEY_MIN_SATURATION,
  flytingHsvToRgb,
  flytingRgbKeyHueDistance,
  flytingRgbKeyRegionContains,
  flytingRgbKeyRoleForPixel,
  flytingRgbToHsv,
} from "../apps/web/src/app/debateFlytingRgbKey.ts";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const flytingPublicRoot = path.join(repositoryRoot, "apps/web/public");
const checkOnly = process.argv.includes("--check");
const roles = ["pro", "jarl", "con"];
const themes = ["dark", "light"];
const scenes = ["wide", "jarl", "gallery"];
const daylightSources = {
  wide: path.join(
    repositoryRoot,
    ".codex/output/imagegen/flyting-daylight-2026-09-01/mead-hall-daylight-source.png",
  ),
  jarl: path.join(
    repositoryRoot,
    ".codex/output/imagegen/flyting-daylight-2026-09-01/jarl-throne-daylight-source.png",
  ),
};
const originalColorSources = {
  wide: path.join(
    repositoryRoot,
    ".codex/output/imagegen/flyting-clean-mead-hall-2026-08-30/clean-mead-hall-rgb-reference.png",
  ),
  jarl: path.join(
    repositoryRoot,
    ".codex/output/imagegen/flyting-clean-mead-hall-2026-08-30/jarl-throne-rgb-reference.webp",
  ),
};

function assetFilePath(asset) {
  return path.join(flytingPublicRoot, asset.src.replace(/^\/+/, ""));
}

function expectedRoleChannel(role) {
  return role === "pro" ? 0 : role === "jarl" ? 1 : 2;
}

function regionBounds(region, width, height) {
  if (region.kind === "circle") {
    return {
      minX: Math.max(0, Math.floor(region.cx - region.radius)),
      minY: Math.max(0, Math.floor(region.cy - region.radius)),
      maxX: Math.min(width - 1, Math.ceil(region.cx + region.radius)),
      maxY: Math.min(height - 1, Math.ceil(region.cy + region.radius)),
    };
  }
  const xs = region.points.map(([x]) => x);
  const ys = region.points.map(([, y]) => y);
  return {
    minX: Math.max(0, Math.floor(Math.min(...xs))),
    minY: Math.max(0, Math.floor(Math.min(...ys))),
    maxX: Math.min(width - 1, Math.ceil(Math.max(...xs))),
    maxY: Math.min(height - 1, Math.ceil(Math.max(...ys))),
  };
}

function visitRegionPixels(region, width, height, visit) {
  const bounds = regionBounds(region, width, height);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (flytingRgbKeyRegionContains(region, x + 0.5, y + 0.5)) {
        visit(x, y);
      }
    }
  }
}

function pixelHsv(data, offset) {
  return flytingRgbToHsv(data[offset], data[offset + 1], data[offset + 2]);
}

function writeHsv(data, offset, hue, saturation, value) {
  const color = flytingHsvToRgb(hue, saturation, value);
  data[offset] = color.red;
  data[offset + 1] = color.green;
  data[offset + 2] = color.blue;
}

function breakRgbKeyMarker(data, offset, role) {
  const channel = role === "con" ? offset + 1 : offset + 2;
  const dominantChannel =
    role === "pro" ? offset : role === "jarl" ? offset + 1 : offset + 2;
  const dominant = data[dominantChannel];
  if (data[channel] > 0) {
    data[channel] -= 1;
    return;
  }
  const alternate = role === "pro" ? offset + 1 : offset;
  if (data[alternate] + 1 < dominant) {
    data[alternate] += 1;
  } else if (dominant > 0) {
    data[dominantChannel] -= 1;
  }
}

const gallerySourceHues = {
  dark: { pro: 5, jarl: 89, con: 201 },
  light: { pro: 8, jarl: 89, con: 202 },
};
const gallerySourceHueTolerances = { pro: 28, jarl: 35, con: 35 };

function sourcePixelBelongsToRole(
  scene,
  theme,
  role,
  sourceColor,
  sourceData,
  offset,
) {
  if (sourceColor.s < FLYTING_RGB_KEY_MIN_SATURATION || sourceColor.v <= 0) {
    return false;
  }
  const channel = expectedRoleChannel(role);
  if (
    sourceData[offset + channel] < sourceData[offset + ((channel + 1) % 3)] ||
    sourceData[offset + channel] < sourceData[offset + ((channel + 2) % 3)]
  ) {
    return false;
  }
  const keyDistance = flytingRgbKeyHueDistance(
    sourceColor.h,
    FLYTING_RGB_KEY_HUES[role],
  );
  if (keyDistance <= FLYTING_RGB_KEY_HUE_TOLERANCE_DEGREES) return true;
  if (scene !== "gallery") return keyDistance <= (role === "pro" ? 10 : 24);
  return (
    flytingRgbKeyHueDistance(sourceColor.h, gallerySourceHues[theme][role]) <=
    gallerySourceHueTolerances[role]
  );
}

async function authorAsset(scene, theme, asset) {
  const outputPath = assetFilePath(asset);
  const basePath =
    theme === "light" && scene !== "gallery"
      ? daylightSources[scene]
      : outputPath;
  const base = await sharp(basePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colorSourcePath = originalColorSources[scene] ?? outputPath;
  const colorSource = await sharp(colorSourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (
    base.info.width !== asset.width ||
    base.info.height !== asset.height ||
    colorSource.info.width !== asset.width ||
    colorSource.info.height !== asset.height
  ) {
    throw new Error(`${scene}/${theme} Flyting RGB-key dimensions drifted`);
  }

  const output = Buffer.from(base.data);
  for (let offset = 0; offset < output.length; offset += 4) {
    const role = flytingRgbKeyRoleForPixel(
      output[offset],
      output[offset + 1],
      output[offset + 2],
    );
    if (role) breakRgbKeyMarker(output, offset, role);
  }

  const authoredCounts = { pro: 0, jarl: 0, con: 0 };
  for (const role of roles) {
    const keyHue = FLYTING_RGB_KEY_HUES[role];
    for (const region of asset.regions[role]) {
      visitRegionPixels(region, asset.width, asset.height, (x, y) => {
        const offset = (y * asset.width + x) * 4;
        const sourceColor = pixelHsv(colorSource.data, offset);
        const baseColor = pixelHsv(output, offset);
        if (
          sourcePixelBelongsToRole(
            scene,
            theme,
            role,
            sourceColor,
            colorSource.data,
            offset,
          )
        ) {
          writeHsv(output, offset, keyHue, sourceColor.s, baseColor.v);
          authoredCounts[role] += 1;
          return;
        }

        if (
          baseColor.s >= FLYTING_RGB_KEY_MIN_SATURATION &&
          flytingRgbKeyHueDistance(baseColor.h, keyHue) <=
            FLYTING_RGB_KEY_HUE_TOLERANCE_DEGREES
        ) {
          writeHsv(
            output,
            offset,
            keyHue + FLYTING_RGB_KEY_HUE_TOLERANCE_DEGREES + 2,
            baseColor.s,
            baseColor.v,
          );
        }
      });
    }
  }

  if (Object.values(authoredCounts).some((count) => count < 50)) {
    throw new Error(
      `${scene}/${theme} did not retain enough RGB-key pixels: ${JSON.stringify(authoredCounts)}`,
    );
  }

  await sharp(output, {
    raw: { width: asset.width, height: asset.height, channels: 4 },
  })
    .webp({ lossless: true, effort: 6 })
    .toFile(outputPath);
  return authoredCounts;
}

async function auditAsset(scene, theme, asset) {
  const source = await sharp(assetFilePath(asset))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    source.info.width !== asset.width ||
    source.info.height !== asset.height
  ) {
    throw new Error(`${scene}/${theme} Flyting RGB-key dimensions drifted`);
  }

  const keyedPixelsInAuthoredSurfaces = {
    pro: new Set(),
    jarl: new Set(),
    con: new Set(),
  };
  for (const role of roles) {
    for (const region of asset.regions[role]) {
      visitRegionPixels(region, asset.width, asset.height, (x, y) => {
        const pixelIndex = y * asset.width + x;
        const offset = pixelIndex * 4;
        if (
          flytingRgbKeyRoleForPixel(
            source.data[offset],
            source.data[offset + 1],
            source.data[offset + 2],
          ) === role
        ) {
          keyedPixelsInAuthoredSurfaces[role].add(pixelIndex);
        }
      });
    }
  }
  const counts = Object.fromEntries(
    roles.map((role) => [role, keyedPixelsInAuthoredSurfaces[role].size]),
  );
  if (Object.values(counts).some((count) => count < 50)) {
    throw new Error(
      `${scene}/${theme} is missing visible RGB authoring keys: ${JSON.stringify(counts)}`,
    );
  }
  const globalCounts = { pro: 0, jarl: 0, con: 0 };
  for (let offset = 0; offset < source.data.length; offset += 4) {
    const role = flytingRgbKeyRoleForPixel(
      source.data[offset],
      source.data[offset + 1],
      source.data[offset + 2],
    );
    if (role) globalCounts[role] += 1;
  }
  for (const role of roles) {
    if (globalCounts[role] !== counts[role]) {
      throw new Error(
        `${scene}/${theme} has ${globalCounts[role] - counts[role]} stray ${role} key pixels outside its authored surfaces`,
      );
    }
  }
  return counts;
}

for (const scene of scenes) {
  for (const theme of themes) {
    const asset = FLYTING_RGB_KEY_ASSETS[scene][theme];
    const counts = checkOnly
      ? await auditAsset(scene, theme, asset)
      : await authorAsset(scene, theme, asset);
    console.log(
      `${checkOnly ? "checked" : "authored"} ${scene}/${theme}`,
      counts,
    );
  }
}
