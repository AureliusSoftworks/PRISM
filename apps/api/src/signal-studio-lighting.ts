import sharp from "sharp";

export const SIGNAL_STUDIO_LIGHTING_MAX_WIDTH = 960;

/**
 * Source-edit instruction for the optional online receiver-map pass. The
 * deterministic map remains the baseline; this matte only adds scene-aware
 * surface and occlusion structure.
 */
export const SIGNAL_STUDIO_LIGHTING_RECEIVER_EDIT_PROMPT = [
  "The attached image is the sole canonical source frame.",
  "Produce one full-frame technical grayscale lighting receiver matte for that exact studio, aligned pixel-for-pixel with the source camera, crop, perspective, geometry, furniture, microphones, props, windows, and object placement.",
  "Use white and light gray only on solid room surfaces that would realistically receive soft colored light cast from performers seated in the two existing chairs, including correctly shaped floor, furniture, wall, and nearby object faces.",
  "Use black and dark gray for open air, windows and exterior sky, emissive fixtures, deep cavities, surfaces facing away from the chairs, and areas occluded from both seats.",
  "Respect edges, depth, surface orientation, contact shadows, and occlusion. Keep transitions physically plausible and moderately soft, but preserve recognizable surface boundaries.",
  "Do not depict the original colors, materials, people, bots, light beams, bloom, lens flare, fog, labels, text, arrows, legends, or a beauty render.",
  "Do not redesign, restage, add, remove, substitute, duplicate, relocate, crop, zoom, or recompose anything.",
  "Output only one single-channel-looking grayscale receiver matte filling the complete frame. Do not output a source comparison, diptych, split screen, grid, collage, inset, border, divider, caption, or multiple panels.",
].join(" ");

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

async function generatedReceiverResponse(
  input: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const response = await sharp(input)
    .rotate()
    .resize(width, height, { fit: "cover", position: "centre" })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .greyscale()
    .blur(Math.max(0.4, width * 0.0012))
    .raw()
    .toBuffer();
  const low = percentile(response, 0.04);
  const high = percentile(response, 0.96);
  if (high - low < 18) {
    throw new Error("Generated Studio receiver matte did not contain usable contrast.");
  }
  const normalized = Buffer.alloc(response.length);
  for (let pixel = 0; pixel < response.length; pixel += 1) {
    const value = Math.max(0, Math.min(1, (response[pixel]! - low) / (high - low)));
    normalized[pixel] = Math.round(smoothstep(0, 1, value) * 255);
  }
  return normalized;
}

/**
 * Builds one theme-neutral receiver mask from the installed Light/Dark pair.
 * When supplied, an aligned image-model matte adds surface structure without
 * replacing the deterministic baseline or its safe nonzero floor.
 */
export async function generateSignalStudioLightingMap(
  dayBytes: Buffer,
  nightBytes: Buffer,
  generatedReceiverBytes?: Buffer,
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
  const generatedResponse = generatedReceiverBytes
    ? await generatedReceiverResponse(generatedReceiverBytes, width, height)
    : null;
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < dayResponse.length; pixel += 1) {
    const offset = pixel * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    const baseline = (dayResponse[pixel]! + nightResponse[pixel]!) / 2;
    const surfaceStructure = generatedResponse
      ? 0.2 + (generatedResponse[pixel]! / 255) * 0.8
      : 1;
    rgba[offset + 3] = Math.round(baseline * surfaceStructure);
  }
  return {
    pngBytes: await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
    width,
    height,
  };
}
