// Every full-avatar emitter occupies the same one-pixel logical phosphor grid.
// The completed raster is scaled to the chassis only after its alpha is fixed.
export const PHOSPHOR_PIXEL_CELL_SIZE_PX = 1;
export const PHOSPHOR_PIXEL_ALPHA_THRESHOLD = 92;
export const PHOSPHOR_FACE_PIXEL_CELL_SIZE_PX = 1;
export const PHOSPHOR_FACE_PIXEL_COVERAGE_GAMMA = 0.78;
export const PHOSPHOR_FACE_PIXEL_MIN_COVERAGE = 0.006;
export const PHOSPHOR_FACE_PIXEL_OVERSCAN_CELLS = 2;
export const PHOSPHOR_FACE_SUPERSAMPLE_MIN = 2;
export const PHOSPHOR_FACE_SUPERSAMPLE_MAX = 4;
export const PHOSPHOR_FACE_CANONICAL_DENSITY_SCALE = 2;

/**
 * Face glyphs, thinking frames, authored Ink, and the lower buckle share this
 * logical CRT grid. Presentation surfaces may scale the completed screen, but
 * they must never rasterize a glyph again at the room's display size or its
 * silhouette and apparent phosphor pitch will change.
 */
export const PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX =
  128 * PHOSPHOR_FACE_CANONICAL_DENSITY_SCALE;

export function phosphorCanonicalPresentationScale(
  renderedScreenSize: number,
  logicalScreenSize = PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX,
): number {
  if (
    !Number.isFinite(renderedScreenSize) ||
    renderedScreenSize <= 0 ||
    !Number.isFinite(logicalScreenSize) ||
    logicalScreenSize <= 0
  ) {
    return 1;
  }
  return renderedScreenSize / logicalScreenSize;
}

export function phosphorCanonicalRasterDimension(
  renderedDimension: number,
  presentationScale: number,
): number {
  const safeScale =
    Number.isFinite(presentationScale) && presentationScale > 0
      ? presentationScale
      : 1;
  return Math.max(1, Math.ceil(renderedDimension / safeScale));
}

type PhosphorTextBaselineMetrics = {
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
};

/**
 * Match the browser's alphabetic baseline inside a line-height box. Using a
 * glyph's actual ink bounds recenters every character independently, which
 * makes compact custom mouths jump upward when their live CRT mask appears.
 */
export function phosphorTextAlphabeticBaseline(
  lineBoxHeight: number,
  metrics: PhosphorTextBaselineMetrics,
): number {
  const ascent =
    metrics.fontBoundingBoxAscent ||
    metrics.actualBoundingBoxAscent ||
    lineBoxHeight * 0.5;
  const descent =
    metrics.fontBoundingBoxDescent ||
    metrics.actualBoundingBoxDescent ||
    lineBoxHeight * 0.12;
  return (lineBoxHeight - ascent - descent) / 2 + ascent;
}

export function phosphorCanvasFontShorthand(
  font: {
    fontFamily: string;
    fontSize: string;
    fontStyle: string;
    fontVariant?: string;
    fontWeight: string;
  },
  scale: number,
): string {
  const fontSize = Math.max(1, Number.parseFloat(font.fontSize)) * scale;
  // Do not include fontVariant. Canvas rejects otherwise-valid CSS values such
  // as `lining-nums` in its font shorthand and silently keeps 10px sans-serif.
  return [
    font.fontStyle,
    font.fontWeight,
    `${fontSize}px`,
    font.fontFamily,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Return the authored first family from a computed CSS font-family list.
 * FontFaceSet.check/load accepts a fallback list as soon as any later family
 * can paint the glyph, so the complete list cannot prove that the selected
 * Avatar Studio face is available.
 */
export function phosphorPrimaryFontFamily(fontFamily: string): string {
  const source = fontFamily.trim();
  if (!source) return source;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ",") return source.slice(0, index).trim();
  }
  return source;
}

export function thresholdPhosphorPixelAlpha(
  rgba: Uint8ClampedArray,
  threshold = PHOSPHOR_PIXEL_ALPHA_THRESHOLD,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(rgba);
  for (let index = 0; index < output.length; index += 4) {
    const alpha = output[index + 3] ?? 0;
    const visible = alpha >= threshold;
    output[index] = 255;
    output[index + 1] = 255;
    output[index + 2] = 255;
    output[index + 3] = visible ? 255 : 0;
  }
  return output;
}

/**
 * Sample a supersampled glyph silhouette into square phosphor cells while
 * retaining fractional edge coverage. The output is deliberately not binary:
 * curves, punctuation, and thin diagonal strokes keep their recognizable
 * antialiased contour inside the CRT cell grid.
 */
export function samplePhosphorAlphaCells(
  rgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  cellSize = PHOSPHOR_FACE_PIXEL_CELL_SIZE_PX,
  coverageGamma = PHOSPHOR_FACE_PIXEL_COVERAGE_GAMMA,
  minimumCoverage = PHOSPHOR_FACE_PIXEL_MIN_COVERAGE,
): Uint8ClampedArray {
  const normalizedSourceWidth = Math.max(0, Math.floor(sourceWidth));
  const normalizedSourceHeight = Math.max(0, Math.floor(sourceHeight));
  const normalizedOutputWidth = Math.max(0, Math.floor(outputWidth));
  const normalizedOutputHeight = Math.max(0, Math.floor(outputHeight));
  const normalizedCellSize = Math.max(1, Math.floor(cellSize));
  const normalizedGamma = Math.max(0.01, coverageGamma);
  const normalizedMinimumCoverage = Math.max(
    0,
    Math.min(1, minimumCoverage),
  );
  const output = new Uint8ClampedArray(
    normalizedOutputWidth * normalizedOutputHeight * 4,
  );
  if (
    normalizedSourceWidth === 0 ||
    normalizedSourceHeight === 0 ||
    normalizedOutputWidth === 0 ||
    normalizedOutputHeight === 0
  ) {
    return output;
  }

  const sampleScaleX = normalizedSourceWidth / normalizedOutputWidth;
  const sampleScaleY = normalizedSourceHeight / normalizedOutputHeight;

  for (
    let cellY = 0;
    cellY < normalizedOutputHeight;
    cellY += normalizedCellSize
  ) {
    for (
      let cellX = 0;
      cellX < normalizedOutputWidth;
      cellX += normalizedCellSize
    ) {
      const cellRight = Math.min(
        normalizedOutputWidth,
        cellX + normalizedCellSize,
      );
      const cellBottom = Math.min(
        normalizedOutputHeight,
        cellY + normalizedCellSize,
      );
      const sampleLeft = Math.floor(cellX * sampleScaleX);
      const sampleRight = Math.min(
        normalizedSourceWidth,
        Math.ceil(cellRight * sampleScaleX),
      );
      const sampleTop = Math.floor(cellY * sampleScaleY);
      const sampleBottom = Math.min(
        normalizedSourceHeight,
        Math.ceil(cellBottom * sampleScaleY),
      );
      let alphaTotal = 0;
      let sampleCount = 0;
      for (let y = sampleTop; y < sampleBottom; y += 1) {
        for (let x = sampleLeft; x < sampleRight; x += 1) {
          alphaTotal +=
            rgba[(y * normalizedSourceWidth + x) * 4 + 3] ?? 0;
          sampleCount += 1;
        }
      }
      const coverage =
        sampleCount > 0 ? alphaTotal / (sampleCount * 255) : 0;
      const alpha =
        coverage < normalizedMinimumCoverage
          ? 0
          : Math.round(Math.pow(coverage, normalizedGamma) * 255);
      for (let y = cellY; y < cellBottom; y += 1) {
        for (let x = cellX; x < cellRight; x += 1) {
          const index = (y * normalizedOutputWidth + x) * 4;
          output[index] = 255;
          output[index + 1] = 255;
          output[index + 2] = 255;
          output[index + 3] = alpha;
        }
      }
    }
  }

  return output;
}

/**
 * Reconstruct authored binary Ink on the denser full-avatar phosphor plane.
 * Bilinear, premultiplied-alpha sampling preserves the exact 128px authored
 * geometry while giving its edges the same fractional cell coverage as text
 * and SVG emitters. Mini avatars can keep the original raster by requesting
 * the authored dimensions instead.
 */
export function resamplePhosphorRgbaCoverage(
  rgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  coverageGamma = PHOSPHOR_FACE_PIXEL_COVERAGE_GAMMA,
  minimumCoverage = PHOSPHOR_FACE_PIXEL_MIN_COVERAGE,
): Uint8ClampedArray {
  const normalizedSourceWidth = Math.max(0, Math.floor(sourceWidth));
  const normalizedSourceHeight = Math.max(0, Math.floor(sourceHeight));
  const normalizedOutputWidth = Math.max(0, Math.floor(outputWidth));
  const normalizedOutputHeight = Math.max(0, Math.floor(outputHeight));
  const output = new Uint8ClampedArray(
    normalizedOutputWidth * normalizedOutputHeight * 4,
  );
  if (
    normalizedSourceWidth === 0 ||
    normalizedSourceHeight === 0 ||
    normalizedOutputWidth === 0 ||
    normalizedOutputHeight === 0 ||
    rgba.length < normalizedSourceWidth * normalizedSourceHeight * 4
  ) {
    return output;
  }
  if (
    normalizedSourceWidth === normalizedOutputWidth &&
    normalizedSourceHeight === normalizedOutputHeight
  ) {
    output.set(
      rgba.subarray(0, normalizedOutputWidth * normalizedOutputHeight * 4),
    );
    return output;
  }

  const normalizedGamma = Math.max(0.01, coverageGamma);
  const normalizedMinimumCoverage = Math.max(
    0,
    Math.min(1, minimumCoverage),
  );
  const scaleX = normalizedSourceWidth / normalizedOutputWidth;
  const scaleY = normalizedSourceHeight / normalizedOutputHeight;
  const clampX = (value: number): number =>
    Math.max(0, Math.min(normalizedSourceWidth - 1, value));
  const clampY = (value: number): number =>
    Math.max(0, Math.min(normalizedSourceHeight - 1, value));

  for (let y = 0; y < normalizedOutputHeight; y += 1) {
    const sourceY = (y + 0.5) * scaleY - 0.5;
    const sourceY0 = Math.floor(sourceY);
    const sourceY1 = sourceY0 + 1;
    const mixY = sourceY - sourceY0;
    for (let x = 0; x < normalizedOutputWidth; x += 1) {
      const sourceX = (x + 0.5) * scaleX - 0.5;
      const sourceX0 = Math.floor(sourceX);
      const sourceX1 = sourceX0 + 1;
      const mixX = sourceX - sourceX0;
      const samples = [
        [clampX(sourceX0), clampY(sourceY0), (1 - mixX) * (1 - mixY)],
        [clampX(sourceX1), clampY(sourceY0), mixX * (1 - mixY)],
        [clampX(sourceX0), clampY(sourceY1), (1 - mixX) * mixY],
        [clampX(sourceX1), clampY(sourceY1), mixX * mixY],
      ] as const;
      let alphaCoverage = 0;
      let premultipliedRed = 0;
      let premultipliedGreen = 0;
      let premultipliedBlue = 0;
      for (const [sampleX, sampleY, weight] of samples) {
        if (weight <= 0) continue;
        const index = (sampleY * normalizedSourceWidth + sampleX) * 4;
        const alpha = (rgba[index + 3] ?? 0) / 255;
        alphaCoverage += alpha * weight;
        premultipliedRed += ((rgba[index] ?? 0) / 255) * alpha * weight;
        premultipliedGreen +=
          ((rgba[index + 1] ?? 0) / 255) * alpha * weight;
        premultipliedBlue +=
          ((rgba[index + 2] ?? 0) / 255) * alpha * weight;
      }
      if (alphaCoverage < normalizedMinimumCoverage) continue;
      const outputIndex = (y * normalizedOutputWidth + x) * 4;
      output[outputIndex] = Math.round(
        (premultipliedRed / alphaCoverage) * 255,
      );
      output[outputIndex + 1] = Math.round(
        (premultipliedGreen / alphaCoverage) * 255,
      );
      output[outputIndex + 2] = Math.round(
        (premultipliedBlue / alphaCoverage) * 255,
      );
      output[outputIndex + 3] = Math.round(
        Math.pow(alphaCoverage, normalizedGamma) * 255,
      );
    }
  }

  return output;
}

/**
 * Upsample or downsample RGBA with hard nearest-neighbor cells. Used when the
 * Avatar Studio pixel grid is visible so authored Ink stays blocky and
 * placement-aligned instead of bilinear-soft.
 */
export function resamplePhosphorRgbaNearestNeighbor(
  rgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
): Uint8ClampedArray {
  const normalizedSourceWidth = Math.max(0, Math.floor(sourceWidth));
  const normalizedSourceHeight = Math.max(0, Math.floor(sourceHeight));
  const normalizedOutputWidth = Math.max(0, Math.floor(outputWidth));
  const normalizedOutputHeight = Math.max(0, Math.floor(outputHeight));
  const output = new Uint8ClampedArray(
    normalizedOutputWidth * normalizedOutputHeight * 4,
  );
  if (
    normalizedSourceWidth === 0 ||
    normalizedSourceHeight === 0 ||
    normalizedOutputWidth === 0 ||
    normalizedOutputHeight === 0 ||
    rgba.length < normalizedSourceWidth * normalizedSourceHeight * 4
  ) {
    return output;
  }
  if (
    normalizedSourceWidth === normalizedOutputWidth &&
    normalizedSourceHeight === normalizedOutputHeight
  ) {
    output.set(
      rgba.subarray(0, normalizedOutputWidth * normalizedOutputHeight * 4),
    );
    return output;
  }

  const scaleX = normalizedSourceWidth / normalizedOutputWidth;
  const scaleY = normalizedSourceHeight / normalizedOutputHeight;
  for (let y = 0; y < normalizedOutputHeight; y += 1) {
    const sourceY = Math.min(
      normalizedSourceHeight - 1,
      Math.max(0, Math.floor((y + 0.5) * scaleY)),
    );
    for (let x = 0; x < normalizedOutputWidth; x += 1) {
      const sourceX = Math.min(
        normalizedSourceWidth - 1,
        Math.max(0, Math.floor((x + 0.5) * scaleX)),
      );
      const sourceIndex = (sourceY * normalizedSourceWidth + sourceX) * 4;
      const outputIndex = (y * normalizedOutputWidth + x) * 4;
      output[outputIndex] = rgba[sourceIndex] ?? 0;
      output[outputIndex + 1] = rgba[sourceIndex + 1] ?? 0;
      output[outputIndex + 2] = rgba[sourceIndex + 2] ?? 0;
      output[outputIndex + 3] = rgba[sourceIndex + 3] ?? 0;
    }
  }
  return output;
}

/** Pick coverage (CRT soft) or nearest-neighbor (pixel-grid editing) resampling. */
export function resamplePhosphorRgbaForPresentation(
  rgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  mode: "coverage" | "nearest" = "coverage",
): Uint8ClampedArray {
  if (mode === "nearest") {
    return resamplePhosphorRgbaNearestNeighbor(
      rgba,
      sourceWidth,
      sourceHeight,
      outputWidth,
      outputHeight,
    );
  }
  return resamplePhosphorRgbaCoverage(
    rgba,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
  );
}
