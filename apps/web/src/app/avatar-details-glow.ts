export interface AvatarDetailsGlowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AvatarDetailsExteriorGlowRaster {
  bounds: AvatarDetailsGlowBounds;
  pixels: Uint8ClampedArray;
}

const RGBA_CHANNELS_PER_PIXEL = 4;

function rgbaAlphaAt(pixels: Uint8ClampedArray, index: number): number {
  return pixels[index * RGBA_CHANNELS_PER_PIXEL + 3] ?? 0;
}

/** Crops an RGBA raster to its occupied alpha bounds without changing pixels. */
export function avatarDetailsCropRgbaRaster(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): AvatarDetailsExteriorGlowRaster | null {
  const normalizedWidth = Math.max(0, Math.floor(width));
  const normalizedHeight = Math.max(0, Math.floor(height));
  const pixelCount = normalizedWidth * normalizedHeight;
  if (
    normalizedWidth === 0 ||
    normalizedHeight === 0 ||
    pixels.length !== pixelCount * RGBA_CHANNELS_PER_PIXEL
  ) {
    return null;
  }

  let minX = normalizedWidth;
  let minY = normalizedHeight;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < normalizedHeight; y += 1) {
    for (let x = 0; x < normalizedWidth; x += 1) {
      if (rgbaAlphaAt(pixels, y * normalizedWidth + x) === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const cropped = new Uint8ClampedArray(
    croppedWidth * croppedHeight * RGBA_CHANNELS_PER_PIXEL,
  );
  for (let y = minY; y <= maxY; y += 1) {
    const sourceStart =
      (y * normalizedWidth + minX) * RGBA_CHANNELS_PER_PIXEL;
    const sourceEnd = sourceStart + croppedWidth * RGBA_CHANNELS_PER_PIXEL;
    const destinationStart =
      (y - minY) * croppedWidth * RGBA_CHANNELS_PER_PIXEL;
    cropped.set(pixels.subarray(sourceStart, sourceEnd), destinationStart);
  }

  return {
    bounds: {
      x: minX,
      y: minY,
      width: croppedWidth,
      height: croppedHeight,
    },
    pixels: cropped,
  };
}

/**
 * Keeps only the exterior-connected edge of an RGBA silhouette, then crops it
 * to the smallest useful raster. Transparent holes enclosed by ink do not
 * emit, while disconnected marks each retain their own exposed outline.
 */
export function avatarDetailsExteriorGlowRaster(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  edgeWidth = 2,
): AvatarDetailsExteriorGlowRaster | null {
  const normalizedWidth = Math.max(0, Math.floor(width));
  const normalizedHeight = Math.max(0, Math.floor(height));
  const pixelCount = normalizedWidth * normalizedHeight;
  if (
    normalizedWidth === 0 ||
    normalizedHeight === 0 ||
    pixels.length !== pixelCount * RGBA_CHANNELS_PER_PIXEL
  ) {
    return null;
  }

  const exterior = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueRead = 0;
  let queueWrite = 0;

  const enqueueExterior = (x: number, y: number): void => {
    const index = y * normalizedWidth + x;
    if (exterior[index] || rgbaAlphaAt(pixels, index) > 0) return;
    exterior[index] = 1;
    queue[queueWrite] = index;
    queueWrite += 1;
  };

  for (let x = 0; x < normalizedWidth; x += 1) {
    enqueueExterior(x, 0);
    if (normalizedHeight > 1) enqueueExterior(x, normalizedHeight - 1);
  }
  for (let y = 1; y < normalizedHeight - 1; y += 1) {
    enqueueExterior(0, y);
    if (normalizedWidth > 1) enqueueExterior(normalizedWidth - 1, y);
  }

  // Eight-way connectivity treats a diagonal opening as exposed glass rather
  // than accidentally sealing it into a non-emitting interior cavity.
  while (queueRead < queueWrite) {
    const index = queue[queueRead] ?? 0;
    queueRead += 1;
    const x = index % normalizedWidth;
    const y = Math.floor(index / normalizedWidth);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX < 0 ||
          nextY < 0 ||
          nextX >= normalizedWidth ||
          nextY >= normalizedHeight
        ) {
          continue;
        }
        enqueueExterior(nextX, nextY);
      }
    }
  }

  const normalizedEdgeWidth = Math.max(1, Math.floor(edgeWidth));
  const contour = new Uint8Array(pixelCount);
  let minX = normalizedWidth;
  let minY = normalizedHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < normalizedHeight; y += 1) {
    for (let x = 0; x < normalizedWidth; x += 1) {
      const index = y * normalizedWidth + x;
      if (rgbaAlphaAt(pixels, index) === 0) continue;

      let touchesExterior = false;
      for (
        let offsetY = -normalizedEdgeWidth;
        offsetY <= normalizedEdgeWidth && !touchesExterior;
        offsetY += 1
      ) {
        for (
          let offsetX = -normalizedEdgeWidth;
          offsetX <= normalizedEdgeWidth;
          offsetX += 1
        ) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= normalizedWidth ||
            nextY >= normalizedHeight ||
            exterior[nextY * normalizedWidth + nextX]
          ) {
            touchesExterior = true;
            break;
          }
        }
      }
      if (!touchesExterior) continue;

      contour[index] = 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const cropped = new Uint8ClampedArray(
    croppedWidth * croppedHeight * RGBA_CHANNELS_PER_PIXEL,
  );
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const sourceIndex = y * normalizedWidth + x;
      if (!contour[sourceIndex]) continue;
      const destinationIndex =
        ((y - minY) * croppedWidth + (x - minX)) * RGBA_CHANNELS_PER_PIXEL;
      const sourceRgbaIndex = sourceIndex * RGBA_CHANNELS_PER_PIXEL;
      cropped[destinationIndex] = pixels[sourceRgbaIndex] ?? 0;
      cropped[destinationIndex + 1] = pixels[sourceRgbaIndex + 1] ?? 0;
      cropped[destinationIndex + 2] = pixels[sourceRgbaIndex + 2] ?? 0;
      cropped[destinationIndex + 3] = pixels[sourceRgbaIndex + 3] ?? 0;
    }
  }

  return {
    bounds: {
      x: minX,
      y: minY,
      width: croppedWidth,
      height: croppedHeight,
    },
    pixels: cropped,
  };
}
