const FALLBACK_TINT = "#d9d2ff";
const tintedRasterUrlCache = new Map<string, Promise<string>>();

export type RuntimeTintRgb = readonly [
  red: number,
  green: number,
  blue: number,
];

export function runtimeTintRgb(
  color: string | null | undefined,
  fallback = FALLBACK_TINT,
): RuntimeTintRgb {
  const normalized = color?.trim() || fallback;
  const shortHex = /^#([\da-f])([\da-f])([\da-f])$/iu.exec(normalized);
  if (shortHex) {
    return [
      Number.parseInt(`${shortHex[1]}${shortHex[1]}`, 16),
      Number.parseInt(`${shortHex[2]}${shortHex[2]}`, 16),
      Number.parseInt(`${shortHex[3]}${shortHex[3]}`, 16),
    ];
  }
  const fullHex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(normalized);
  if (fullHex) {
    return [
      Number.parseInt(fullHex[1], 16),
      Number.parseInt(fullHex[2], 16),
      Number.parseInt(fullHex[3], 16),
    ];
  }
  return normalized === fallback
    ? [217, 210, 255]
    : runtimeTintRgb(fallback, FALLBACK_TINT);
}

export function recolorMagentaKeyPixels(
  pixels: Uint8ClampedArray,
  tint: RuntimeTintRgb,
): Uint8ClampedArray {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const alpha = pixels[offset + 3] ?? 0;
    if (alpha === 0) continue;

    const magentaFloor = Math.min(red, blue);
    const magentaDominance = magentaFloor - green;
    if (
      magentaFloor < 48 ||
      magentaDominance < 24 ||
      Math.abs(red - blue) > 128
    ) {
      continue;
    }

    const sourceValue = Math.max(red, green, blue) / 255;
    const sourceMinimum = Math.min(red, green, blue);
    const sourceMaximum = Math.max(red, green, blue);
    const sourceSaturation =
      sourceMaximum === 0 ? 0 : (sourceMaximum - sourceMinimum) / sourceMaximum;
    const neutral = 255 * sourceValue;

    pixels[offset] = Math.round(
      neutral * (1 - sourceSaturation) +
        tint[0] * sourceValue * sourceSaturation,
    );
    pixels[offset + 1] = Math.round(
      neutral * (1 - sourceSaturation) +
        tint[1] * sourceValue * sourceSaturation,
    );
    pixels[offset + 2] = Math.round(
      neutral * (1 - sourceSaturation) +
        tint[2] * sourceValue * sourceSaturation,
    );
  }
  return pixels;
}

function loadRaster(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load raster: ${source}`));
    image.src = source;
  });
}

function canvasPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Unable to encode tinted raster."));
    }, "image/png");
  });
}

export function magentaTintedRasterUrl(
  source: string,
  color: string | null | undefined,
): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(source);
  }

  const tint = runtimeTintRgb(color);
  const cacheKey = `${source}|${tint.join(",")}`;
  const cached = tintedRasterUrlCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const image = await loadRaster(source);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return source;
      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      recolorMagentaKeyPixels(imageData.data, tint);
      context.putImageData(imageData, 0, 0);
      return URL.createObjectURL(await canvasPngBlob(canvas));
    } catch {
      return source;
    }
  })();
  tintedRasterUrlCache.set(cacheKey, pending);
  return pending;
}
