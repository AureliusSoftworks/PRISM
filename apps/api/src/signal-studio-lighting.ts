import sharp from "sharp";

export const SIGNAL_STUDIO_LIGHTING_MAX_WIDTH = 960;

export interface SignalStudioLightingMap {
  pngBytes: Buffer;
  width: number;
  height: number;
}

interface PreparedStudioSource {
  pixels: Buffer;
  width: number;
  height: number;
}

function percentile(values: Uint8Array, ratio: number): number {
  const histogram = new Uint32Array(256);
  for (const value of values) histogram[value] += 1;
  const target = Math.max(0, Math.min(values.length - 1, Math.round(values.length * ratio)));
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value]!;
    if (seen > target) return value;
  }
  return 255;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

async function prepareStudioSource(
  input: Buffer,
  width: number,
  height: number,
): Promise<PreparedStudioSource> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(width, height, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels: data, width: info.width, height: info.height };
}

async function receiverResponse(source: PreparedStudioSource): Promise<Buffer> {
  const luminance = Buffer.alloc(source.width * source.height);
  const saturation = new Float32Array(source.width * source.height);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 3;
    const red = source.pixels[offset]!;
    const green = source.pixels[offset + 1]!;
    const blue = source.pixels[offset + 2]!;
    luminance[pixel] = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    saturation[pixel] = maximum === 0 ? 0 : (maximum - minimum) / maximum;
  }

  const sigma = Math.max(2, Math.min(24, source.width * 0.018));
  const blurred = await sharp(luminance, {
    raw: { width: source.width, height: source.height, channels: 1 },
  })
    .blur(sigma)
    .greyscale()
    .raw()
    .toBuffer();
  const low = percentile(blurred, 0.04);
  const high = Math.max(low + 1, percentile(blurred, 0.96));
  const response = Buffer.alloc(blurred.length);
  for (let pixel = 0; pixel < response.length; pixel += 1) {
    const normalized = Math.max(0, Math.min(1, (blurred[pixel]! - low) / (high - low)));
    const directLightRejection = 1 - smoothstep(0.82, 1, normalized);
    const chromaRejection = 1 - smoothstep(0.42, 0.86, saturation[pixel]!);
    const y = Math.floor(pixel / source.width) / Math.max(1, source.height - 1);
    const lowerSurfaceBias = 0.58 + smoothstep(0.18, 0.9, y) * 0.42;
    const receiver = (0.16 + Math.sqrt(normalized) * 0.84) *
      (0.62 + directLightRejection * 0.38) *
      (0.72 + chromaRejection * 0.28) *
      lowerSurfaceBias;
    response[pixel] = Math.round(Math.max(0, Math.min(1, receiver)) * 255);
  }
  return sharp(response, {
    raw: { width: source.width, height: source.height, channels: 1 },
  })
    .blur(Math.max(1.2, sigma * 0.55))
    .greyscale()
    .raw()
    .toBuffer();
}

/** Builds one theme-neutral receiver mask from the installed Light/Dark pair. */
export async function generateSignalStudioLightingMap(
  dayBytes: Buffer,
  nightBytes: Buffer,
): Promise<SignalStudioLightingMap> {
  const nightMetadata = await sharp(nightBytes).metadata();
  if (!nightMetadata.width || !nightMetadata.height) {
    throw new Error("Dark studio dimensions could not be read.");
  }
  const scale = Math.min(1, SIGNAL_STUDIO_LIGHTING_MAX_WIDTH / nightMetadata.width);
  const width = Math.max(2, Math.round(nightMetadata.width * scale));
  const height = Math.max(2, Math.round(nightMetadata.height * scale));
  const [day, night] = await Promise.all([
    prepareStudioSource(dayBytes, width, height),
    prepareStudioSource(nightBytes, width, height),
  ]);
  const [dayResponse, nightResponse] = await Promise.all([
    receiverResponse(day),
    receiverResponse(night),
  ]);
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < dayResponse.length; pixel += 1) {
    const offset = pixel * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    rgba[offset + 3] = Math.round((dayResponse[pixel]! + nightResponse[pixel]!) / 2);
  }
  return {
    pngBytes: await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
    width,
    height,
  };
}
