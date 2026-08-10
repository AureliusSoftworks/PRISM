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

/**
 * Face glyphs, thinking frames, authored Ink, and the lower buckle share this
 * logical CRT grid. Presentation surfaces may scale the completed screen, but
 * they must never rasterize a glyph again at the room's display size or its
 * silhouette and apparent phosphor pitch will change.
 */
export const PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX = 128;

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
