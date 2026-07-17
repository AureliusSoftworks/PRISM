export const CRT_FACE_PIXEL_GRID_SIZE = 128;
export const CRT_GLYPH_ALPHA_THRESHOLD = 32;

export function crtPixelGridDimension(
  contentCssSize: number,
  screenCssSize: number,
  gridSize = CRT_FACE_PIXEL_GRID_SIZE,
): number {
  if (
    !Number.isFinite(contentCssSize) ||
    !Number.isFinite(screenCssSize) ||
    !Number.isFinite(gridSize) ||
    contentCssSize <= 0 ||
    screenCssSize <= 0 ||
    gridSize <= 0
  ) {
    return 1;
  }
  return Math.max(
    1,
    Math.round((contentCssSize / screenCssSize) * Math.floor(gridSize)),
  );
}

export function quantizeCrtGlyphAlpha(
  rgba: Uint8ClampedArray,
  threshold = CRT_GLYPH_ALPHA_THRESHOLD,
): Uint8ClampedArray {
  if (rgba.length % 4 !== 0) {
    throw new RangeError("CRT glyph RGBA data must contain complete pixels.");
  }
  const normalizedThreshold = Math.max(0, Math.min(255, threshold));
  const quantized = new Uint8ClampedArray(rgba.length);
  for (let index = 0; index < rgba.length; index += 4) {
    const visible = rgba[index + 3]! >= normalizedThreshold;
    quantized[index] = 255;
    quantized[index + 1] = 255;
    quantized[index + 2] = 255;
    quantized[index + 3] = visible ? 255 : 0;
  }
  return quantized;
}
