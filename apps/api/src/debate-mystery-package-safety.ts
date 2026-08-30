import { createHash } from "node:crypto";
import sharp from "sharp";
import { isPlayablePcmWave } from "./builtin-tts.ts";
import { pcmWaveDurationMs } from "./local-voice-engine.ts";
import type { InternalMansionPackageV1 } from "./debate-mystery-mansion-codec.ts";

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_STORE = 0;
const ZIP_DEFLATE = 8;
const MAX_ENTRY_COUNT = 512;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_COMPONENT_ENTRY_BYTES = 256 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 384 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const MAX_IMAGE_PIXELS = 40_000_000;
const SAFE_ENTRY_PATH = /^(?:manifest\.json|assets\/[a-f0-9]{64}\.(?:png|webp)|audio\/[a-f0-9]{64}\.(?:mp3|ogg|wav)|components\/(?:case\.case|mansion\.mansion))$/u;

export class PortableMysteryImportSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortableMysteryImportSafetyError";
  }
}

function uint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new PortableMysteryImportSafetyError("Package archive is truncated.");
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function uint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new PortableMysteryImportSafetyError("Package archive is truncated.");
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function endOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (uint32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new PortableMysteryImportSafetyError("Package archive has no central directory.");
}

function safePath(bytes: Uint8Array): string {
  let path: string;
  try {
    path = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PortableMysteryImportSafetyError("Package archive has an invalid filename.");
  }
  if (!SAFE_ENTRY_PATH.test(path) || path.includes("..") || path.includes("\\") || path.startsWith("/")) {
    throw new PortableMysteryImportSafetyError("Package archive contains an unsafe path.");
  }
  return path;
}

export interface PortableMysteryArchivePreflightV1 {
  entryCount: number;
  expandedBytes: number;
  paths: string[];
}

/** Reads only ZIP headers. No entry is inflated by this preflight. */
export function preflightPortableMysteryArchiveV1(
  archive: Uint8Array,
): PortableMysteryArchivePreflightV1 {
  const end = endOfCentralDirectory(archive);
  const disk = uint16(archive, end + 4);
  const centralDisk = uint16(archive, end + 6);
  const diskEntries = uint16(archive, end + 8);
  const entryCount = uint16(archive, end + 10);
  const centralBytes = uint32(archive, end + 12);
  const centralOffset = uint32(archive, end + 16);
  const commentBytes = uint16(archive, end + 20);
  if (
    disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount ||
    entryCount < 1 || entryCount > MAX_ENTRY_COUNT ||
    end + 22 + commentBytes !== archive.byteLength ||
    centralOffset + centralBytes !== end
  ) throw new PortableMysteryImportSafetyError("Package archive directory is invalid.");

  const paths = new Set<string>();
  const localRanges: Array<{ start: number; end: number }> = [];
  let cursor = centralOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (uint32(archive, cursor) !== ZIP_CENTRAL_FILE_HEADER) {
      throw new PortableMysteryImportSafetyError("Package archive directory is invalid.");
    }
    const madeBy = uint16(archive, cursor + 4);
    const flags = uint16(archive, cursor + 8);
    const compression = uint16(archive, cursor + 10);
    const compressedBytes = uint32(archive, cursor + 20);
    const uncompressedBytes = uint32(archive, cursor + 24);
    const nameBytes = uint16(archive, cursor + 28);
    const extraBytes = uint16(archive, cursor + 30);
    const entryCommentBytes = uint16(archive, cursor + 32);
    const diskStart = uint16(archive, cursor + 34);
    const externalAttributes = uint32(archive, cursor + 38);
    const localOffset = uint32(archive, cursor + 42);
    const next = cursor + 46 + nameBytes + extraBytes + entryCommentBytes;
    const path = safePath(archive.subarray(cursor + 46, cursor + 46 + nameBytes));
    const maxEntryBytes = path.startsWith("components/")
      ? MAX_COMPONENT_ENTRY_BYTES
      : MAX_ENTRY_BYTES;
    if (
      next > end || nameBytes < 1 || diskStart !== 0 ||
      (flags & 0x0001) !== 0 ||
      (compression !== ZIP_STORE && compression !== ZIP_DEFLATE) ||
      compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff ||
      compressedBytes > maxEntryBytes || uncompressedBytes > maxEntryBytes ||
      (compressedBytes === 0 && uncompressedBytes !== 0) ||
      (uncompressedBytes > 1024 * 1024 && uncompressedBytes > compressedBytes * MAX_COMPRESSION_RATIO)
    ) throw new PortableMysteryImportSafetyError("Package archive entry is unsafe or too large.");
    const creatorSystem = madeBy >>> 8;
    const unixFileType = (externalAttributes >>> 16) & 0xf000;
    if (creatorSystem === 3 && unixFileType !== 0 && unixFileType !== 0x8000) {
      throw new PortableMysteryImportSafetyError("Package archive links and special files are forbidden.");
    }
    expandedBytes += uncompressedBytes;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new PortableMysteryImportSafetyError("Package archive expands beyond its safe limit.");
    }
    if (paths.has(path)) throw new PortableMysteryImportSafetyError(`Package archive repeats ${path}.`);
    paths.add(path);

    if (uint32(archive, localOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new PortableMysteryImportSafetyError(`Package archive entry is invalid: ${path}.`);
    }
    const localFlags = uint16(archive, localOffset + 6);
    const localCompression = uint16(archive, localOffset + 8);
    const localNameBytes = uint16(archive, localOffset + 26);
    const localExtraBytes = uint16(archive, localOffset + 28);
    const contentStart = localOffset + 30 + localNameBytes + localExtraBytes;
    const contentEnd = contentStart + compressedBytes;
    if (
      localFlags !== flags || localCompression !== compression ||
      contentEnd > centralOffset ||
      safePath(archive.subarray(localOffset + 30, localOffset + 30 + localNameBytes)) !== path
    ) throw new PortableMysteryImportSafetyError(`Package archive entry is invalid: ${path}.`);
    localRanges.push({ start: localOffset, end: contentEnd });
    cursor = next;
  }
  if (cursor !== end || !paths.has("manifest.json")) {
    throw new PortableMysteryImportSafetyError("Package archive directory length is invalid.");
  }
  localRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index - 1]!.end > localRanges[index]!.start) {
      throw new PortableMysteryImportSafetyError("Package archive entries overlap.");
    }
  }
  return { entryCount, expandedBytes, paths: [...paths].sort() };
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
}

function hasWebpSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
}

function hasMp3Signature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  if (Buffer.from(bytes.subarray(0, 3)).toString("ascii") === "ID3") return true;
  return bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
}

const MPEG1_BITRATES_KBPS: Record<number, readonly number[]> = {
  1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
};
const MPEG2_BITRATES_KBPS: Record<number, readonly number[]> = {
  1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

function syncSafeUint32(bytes: Uint8Array, offset: number): number {
  const values = [bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]];
  if (values.some((value) => value === undefined || (value & 0x80) !== 0)) {
    throw new PortableMysteryImportSafetyError("Package audio has an invalid ID3 tag.");
  }
  return (values[0]! << 21) | (values[1]! << 14) | (values[2]! << 7) | values[3]!;
}

/** Strict MPEG audio frame walk used to bound duration without invoking a codec. */
export function portableMp3DurationMsV1(bytes: Uint8Array): number {
  if (!hasMp3Signature(bytes)) {
    throw new PortableMysteryImportSafetyError("Package audio signature is invalid.");
  }
  let offset = 0;
  if (Buffer.from(bytes.subarray(0, 3)).toString("ascii") === "ID3") {
    if (bytes.byteLength < 10) throw new PortableMysteryImportSafetyError("Package audio is truncated.");
    const footerBytes = (bytes[5]! & 0x10) !== 0 ? 10 : 0;
    offset = 10 + syncSafeUint32(bytes, 6) + footerBytes;
  }
  let samples = 0;
  let sampleRateForDuration = 0;
  let frames = 0;
  while (offset + 4 <= bytes.byteLength) {
    if (
      offset + 128 === bytes.byteLength &&
      Buffer.from(bytes.subarray(offset, offset + 3)).toString("ascii") === "TAG"
    ) break;
    const header = uint32(Uint8Array.of(bytes[offset + 3]!, bytes[offset + 2]!, bytes[offset + 1]!, bytes[offset]!), 0);
    if (((header & 0xffe00000) >>> 0) !== 0xffe00000) {
      throw new PortableMysteryImportSafetyError("Package audio contains an invalid MPEG frame.");
    }
    const versionBits = (header >>> 19) & 0x3;
    const layerBits = (header >>> 17) & 0x3;
    const bitrateIndex = (header >>> 12) & 0xf;
    const sampleRateIndex = (header >>> 10) & 0x3;
    const padding = (header >>> 9) & 0x1;
    if (versionBits === 1 || layerBits === 0 || bitrateIndex < 1 || bitrateIndex > 14 || sampleRateIndex === 3) {
      throw new PortableMysteryImportSafetyError("Package audio contains an unsupported MPEG frame.");
    }
    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
    const layer = 4 - layerBits;
    const baseSampleRate = [44_100, 48_000, 32_000][sampleRateIndex]!;
    const sampleRate = version === 1 ? baseSampleRate : version === 2 ? baseSampleRate / 2 : baseSampleRate / 4;
    const bitrate = (version === 1 ? MPEG1_BITRATES_KBPS : MPEG2_BITRATES_KBPS)[layer]![bitrateIndex]! * 1000;
    const frameBytes = layer === 1
      ? Math.floor(12 * bitrate / sampleRate + padding) * 4
      : Math.floor((version !== 1 && layer === 3 ? 72 : 144) * bitrate / sampleRate + padding);
    if (frameBytes < 4 || offset + frameBytes > bytes.byteLength) {
      throw new PortableMysteryImportSafetyError("Package audio contains a truncated MPEG frame.");
    }
    if (sampleRateForDuration !== 0 && sampleRateForDuration !== sampleRate) {
      throw new PortableMysteryImportSafetyError("Package audio changes sample rate unexpectedly.");
    }
    sampleRateForDuration = sampleRate;
    samples += layer === 1 ? 384 : version === 1 || layer === 2 ? 1152 : 576;
    frames += 1;
    offset += frameBytes;
  }
  if (frames < 1 || offset !== bytes.byteLength && offset + 128 !== bytes.byteLength) {
    throw new PortableMysteryImportSafetyError("Package audio is malformed.");
  }
  return Math.round(samples / sampleRateForDuration * 1000);
}

/** Strict Ogg page walk for Opus packages. It never invokes a media decoder. */
export function portableOggOpusDurationMsV1(bytes: Uint8Array): number {
  let offset = 0;
  let streamSerial: number | null = null;
  let expectedSequence = 0;
  let preSkip = 0;
  let finalGranule = 0n;
  let pages = 0;
  while (offset < bytes.byteLength) {
    if (offset + 27 > bytes.byteLength ||
        Buffer.from(bytes.subarray(offset, offset + 4)).toString("ascii") !== "OggS" ||
        bytes[offset + 4] !== 0) {
      throw new PortableMysteryImportSafetyError("Package Opus audio has an invalid Ogg page.");
    }
    const segmentCount = bytes[offset + 26]!;
    const tableEnd = offset + 27 + segmentCount;
    if (tableEnd > bytes.byteLength) {
      throw new PortableMysteryImportSafetyError("Package Opus audio is truncated.");
    }
    let payloadBytes = 0;
    for (let index = offset + 27; index < tableEnd; index += 1) payloadBytes += bytes[index]!;
    const pageEnd = tableEnd + payloadBytes;
    if (pageEnd > bytes.byteLength) {
      throw new PortableMysteryImportSafetyError("Package Opus audio is truncated.");
    }
    const page = Buffer.from(bytes.buffer, bytes.byteOffset + offset, pageEnd - offset);
    const serial = page.readUInt32LE(14);
    const sequence = page.readUInt32LE(18);
    if (streamSerial === null) streamSerial = serial;
    if (serial !== streamSerial || sequence !== expectedSequence) {
      throw new PortableMysteryImportSafetyError("Package Opus audio changes stream unexpectedly.");
    }
    if (pages === 0) {
      const firstPacket = Buffer.from(bytes.subarray(tableEnd, Math.min(pageEnd, tableEnd + 19)));
      if (firstPacket.subarray(0, 8).toString("ascii") !== "OpusHead" || firstPacket.byteLength < 12) {
        throw new PortableMysteryImportSafetyError("Package audio is not Ogg Opus.");
      }
      preSkip = firstPacket.readUInt16LE(10);
    }
    const granule = page.readBigUInt64LE(6);
    if (granule !== 0xffffffffffffffffn) finalGranule = granule;
    expectedSequence += 1;
    pages += 1;
    offset = pageEnd;
  }
  if (pages < 2 || finalGranule <= BigInt(preSkip)) {
    throw new PortableMysteryImportSafetyError("Package Opus audio has no playable duration.");
  }
  return Math.round(Number(finalGranule - BigInt(preSkip)) / 48_000 * 1_000);
}

export async function validatePortableMansionMediaV1(
  packageData: InternalMansionPackageV1,
): Promise<void> {
  const themedPropAssetIds = new Set(
    packageData.manifest.propTheme?.variants.map((variant) => variant.packageAssetId) ?? [],
  );
  for (const descriptor of packageData.manifest.assets) {
    const bytes = packageData.assets.get(descriptor.archivePath)!;
    if (descriptor.mimeType === "audio/mpeg") {
      const measuredDurationMs = portableMp3DurationMsV1(bytes);
      const allowedDriftMs = Math.max(1_000, measuredDurationMs * 0.05);
      if (
        descriptor.durationMs === null || measuredDurationMs < 1 || measuredDurationMs > 10 * 60 * 1000 ||
        Math.abs(descriptor.durationMs - measuredDurationMs) > allowedDriftMs
      ) {
        throw new PortableMysteryImportSafetyError(`Package audio is invalid: ${descriptor.archivePath}.`);
      }
      continue;
    }
    if (descriptor.mimeType === "audio/wav") {
      const buffer = Buffer.from(bytes);
      const measuredDurationMs = pcmWaveDurationMs(buffer);
      const allowedDriftMs = Math.max(250, (measuredDurationMs ?? 0) * 0.02);
      if (
        !isPlayablePcmWave(buffer) || measuredDurationMs === null ||
        descriptor.durationMs === null || measuredDurationMs < 1 || measuredDurationMs > 10 * 60 * 1000 ||
        Math.abs(descriptor.durationMs - measuredDurationMs) > allowedDriftMs
      ) throw new PortableMysteryImportSafetyError(`Package audio is invalid: ${descriptor.archivePath}.`);
      continue;
    }
    if (descriptor.mimeType === "audio/ogg") {
      const measuredDurationMs = portableOggOpusDurationMsV1(bytes);
      const allowedDriftMs = Math.max(250, measuredDurationMs * 0.02);
      if (
        descriptor.durationMs === null || measuredDurationMs < 1 || measuredDurationMs > 10 * 60 * 1000 ||
        Math.abs(descriptor.durationMs - measuredDurationMs) > allowedDriftMs
      ) throw new PortableMysteryImportSafetyError(`Package audio is invalid: ${descriptor.archivePath}.`);
      continue;
    }
    const signatureValid = descriptor.mimeType === "image/png"
      ? hasPngSignature(bytes)
      : hasWebpSignature(bytes);
    if (!signatureValid) throw new PortableMysteryImportSafetyError(`Package image signature is invalid: ${descriptor.archivePath}.`);
    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      metadata = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    } catch {
      throw new PortableMysteryImportSafetyError(`Package image could not be decoded: ${descriptor.archivePath}.`);
    }
    const expectedFormat = descriptor.mimeType === "image/png" ? "png" : "webp";
    if (
      metadata.format !== expectedFormat || !metadata.width || !metadata.height ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      descriptor.width !== metadata.width || descriptor.height !== metadata.height
    ) throw new PortableMysteryImportSafetyError(`Package image dimensions are invalid: ${descriptor.archivePath}.`);
    if (themedPropAssetIds.has(descriptor.id)) {
      let hasTransparentPixel = false;
      try {
        const stats = await sharp(bytes, {
          failOn: "error",
          limitInputPixels: MAX_IMAGE_PIXELS,
        }).ensureAlpha().stats();
        hasTransparentPixel = metadata.hasAlpha === true &&
          (stats.channels[3]?.min ?? 255) < 255;
      } catch {
        throw new PortableMysteryImportSafetyError(
          `Mansion themed prop alpha could not be inspected: ${descriptor.archivePath}.`,
        );
      }
      if (!hasTransparentPixel) {
        throw new PortableMysteryImportSafetyError(
          `Mansion themed prop must retain transparency: ${descriptor.archivePath}.`,
        );
      }
    }
  }
}

/** Decodes and re-encodes images so installed bytes contain no imported metadata. */
export async function sanitizePortableMansionMediaV1(
  packageData: InternalMansionPackageV1,
): Promise<InternalMansionPackageV1> {
  await validatePortableMansionMediaV1(packageData);
  const assets = new Map<string, Uint8Array>();
  const descriptors: InternalMansionPackageV1["manifest"]["assets"] = [];
  for (const descriptor of packageData.manifest.assets) {
    const source = packageData.assets.get(descriptor.archivePath)!;
    if (descriptor.mimeType === "audio/mpeg" || descriptor.mimeType === "audio/ogg" || descriptor.mimeType === "audio/wav") {
      assets.set(descriptor.archivePath, Uint8Array.from(source));
      descriptors.push({ ...descriptor });
      continue;
    }
    const pipeline = sharp(source, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS });
    const sanitized = descriptor.mimeType === "image/png"
      ? await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
      : await pipeline.webp({ quality: 90, effort: 6 }).toBuffer();
    const sha256 = createHash("sha256").update(sanitized).digest("hex");
    const extension = descriptor.mimeType === "image/png" ? "png" : "webp";
    const archivePath = `assets/${sha256}.${extension}`;
    assets.set(archivePath, sanitized);
    descriptors.push({
      ...descriptor,
      archivePath,
      sha256,
      byteLength: sanitized.byteLength,
    });
  }
  return {
    manifest: { ...packageData.manifest, assets: descriptors },
    assets,
  };
}
