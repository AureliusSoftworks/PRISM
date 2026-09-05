/**
 * Kokoro's generated clips currently carry roughly 300-460 ms of synthesis
 * silence at each outer edge. At internal stream joins, keep only a small
 * -42 dBFS safety pad around the first/last voiced sample so quiet phoneme
 * attacks and releases survive, and cap removal so unexpected files fail soft.
 */
export const KOKORO_STREAM_SILENCE_THRESHOLD_DB = -42;
export const KOKORO_STREAM_EDGE_PAD_MS = 40;
export const KOKORO_STREAM_MAX_TRIM_MS = 600;

const KOKORO_STREAM_SILENCE_THRESHOLD =
  10 ** (KOKORO_STREAM_SILENCE_THRESHOLD_DB / 20);

export interface PcmWaveChunkEdgeTrimOptions {
  trimLeading: boolean;
  trimTrailing: boolean;
}

interface ParsedPcmWave {
  audioFormat: 1 | 3;
  bitsPerSample: 16 | 32;
  blockAlign: number;
  channels: number;
  sampleRate: number;
  dataHeaderOffset: number;
  dataStart: number;
  dataEnd: number;
  dataPaddedEnd: number;
}

export interface PcmWaveAudibleBounds {
  firstVoicedFrame: number;
  lastVoicedFrame: number;
  sampleRate: number;
  frameCount: number;
}

function parseSupportedPcmWave(wave: Buffer): ParsedPcmWave | null {
  if (
    wave.length < 44 ||
    wave.subarray(0, 4).toString("ascii") !== "RIFF" ||
    wave.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    return null;
  }
  const riffEnd = wave.readUInt32LE(4) + 8;
  // Generated chunks are complete standalone files. Trailing bytes or a
  // truncated RIFF declaration are ambiguous, so preserve those files intact.
  if (riffEnd !== wave.length) return null;

  let format: Omit<
    ParsedPcmWave,
    "dataHeaderOffset" | "dataStart" | "dataEnd" | "dataPaddedEnd"
  > | null = null;
  let data:
    | Pick<
        ParsedPcmWave,
        "dataHeaderOffset" | "dataStart" | "dataEnd" | "dataPaddedEnd"
      >
    | null = null;

  for (let offset = 12; offset + 8 <= riffEnd; ) {
    const chunkId = wave.subarray(offset, offset + 4).toString("ascii");
    const chunkBytes = wave.readUInt32LE(offset + 4);
    const valueOffset = offset + 8;
    const valueEnd = valueOffset + chunkBytes;
    const nextOffset = valueEnd + (chunkBytes % 2);
    if (valueEnd > riffEnd || nextOffset > riffEnd) return null;

    if (chunkId === "fmt ") {
      if (format || chunkBytes < 16) return null;
      const audioFormat = wave.readUInt16LE(valueOffset);
      const channels = wave.readUInt16LE(valueOffset + 2);
      const sampleRate = wave.readUInt32LE(valueOffset + 4);
      const byteRate = wave.readUInt32LE(valueOffset + 8);
      const blockAlign = wave.readUInt16LE(valueOffset + 12);
      const bitsPerSample = wave.readUInt16LE(valueOffset + 14);
      const supported =
        (audioFormat === 1 && bitsPerSample === 16) ||
        (audioFormat === 3 && bitsPerSample === 32);
      const bytesPerSample = bitsPerSample / 8;
      if (
        !supported ||
        channels < 1 ||
        sampleRate < 1 ||
        blockAlign !== channels * bytesPerSample ||
        byteRate !== sampleRate * blockAlign
      ) {
        return null;
      }
      format = {
        audioFormat: audioFormat as 1 | 3,
        bitsPerSample: bitsPerSample as 16 | 32,
        blockAlign,
        channels,
        sampleRate,
      };
    } else if (chunkId === "data") {
      if (data) return null;
      data = {
        dataHeaderOffset: offset,
        dataStart: valueOffset,
        dataEnd: valueEnd,
        dataPaddedEnd: nextOffset,
      };
    }

    offset = nextOffset;
  }

  if (!format || !data) return null;
  const dataBytes = data.dataEnd - data.dataStart;
  if (dataBytes < format.blockAlign || dataBytes % format.blockAlign !== 0) {
    return null;
  }
  return { ...format, ...data };
}

function frameMagnitude(
  wave: Buffer,
  parsed: ParsedPcmWave,
  frameIndex: number,
): number | null {
  const bytesPerSample = parsed.bitsPerSample / 8;
  const frameOffset = parsed.dataStart + frameIndex * parsed.blockAlign;
  let peak = 0;
  for (let channel = 0; channel < parsed.channels; channel += 1) {
    const sampleOffset = frameOffset + channel * bytesPerSample;
    const sample = parsed.audioFormat === 3
      ? wave.readFloatLE(sampleOffset)
      : wave.readInt16LE(sampleOffset) / 0x8000;
    if (!Number.isFinite(sample)) return null;
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

function audibleBounds(
  wave: Buffer,
  parsed: ParsedPcmWave,
): PcmWaveAudibleBounds | null {
  const frameCount =
    (parsed.dataEnd - parsed.dataStart) / parsed.blockAlign;
  let firstVoicedFrame = -1;
  let lastVoicedFrame = -1;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const magnitude = frameMagnitude(wave, parsed, frameIndex);
    if (magnitude === null) return null;
    if (magnitude >= KOKORO_STREAM_SILENCE_THRESHOLD) {
      if (firstVoicedFrame < 0) firstVoicedFrame = frameIndex;
      lastVoicedFrame = frameIndex;
    }
  }
  if (firstVoicedFrame < 0 || lastVoicedFrame < 0) return null;
  return { firstVoicedFrame, lastVoicedFrame, sampleRate: parsed.sampleRate, frameCount };
}

/** Reports -42 dBFS audible bounds for deterministic tests/evidence. */
export function pcmWaveAudibleBounds(wave: Buffer): PcmWaveAudibleBounds | null {
  const parsed = parseSupportedPcmWave(wave);
  return parsed ? audibleBounds(wave, parsed) : null;
}

/**
 * Removes redundant outer silence from an internal generated WAV chunk.
 * Unsupported or malformed inputs return by identity so this can never turn a
 * playable fallback/system payload into a broken stream.
 */
export function trimPcmWaveChunkJoinSilence(
  wave: Buffer,
  options: PcmWaveChunkEdgeTrimOptions,
): Buffer {
  if (!options.trimLeading && !options.trimTrailing) return wave;
  const parsed = parseSupportedPcmWave(wave);
  if (!parsed) return wave;

  const bounds = audibleBounds(wave, parsed);
  // Do not reshape an all-silent payload; its intent cannot be inferred safely.
  if (!bounds) return wave;
  const { firstVoicedFrame, lastVoicedFrame, frameCount } = bounds;

  const edgePadFrames = Math.ceil(
    parsed.sampleRate * KOKORO_STREAM_EDGE_PAD_MS / 1_000,
  );
  const maxTrimFrames = Math.floor(
    parsed.sampleRate * KOKORO_STREAM_MAX_TRIM_MS / 1_000,
  );
  const desiredStartFrame = Math.max(0, firstVoicedFrame - edgePadFrames);
  const desiredEndFrame = Math.min(
    frameCount,
    lastVoicedFrame + 1 + edgePadFrames,
  );
  const startFrame = options.trimLeading
    ? Math.min(desiredStartFrame, maxTrimFrames)
    : 0;
  const trailingTrimFrames = options.trimTrailing
    ? Math.min(frameCount - desiredEndFrame, maxTrimFrames)
    : 0;
  const endFrame = frameCount - trailingTrimFrames;
  if (startFrame === 0 && endFrame === frameCount) return wave;

  const trimmedData = wave.subarray(
    parsed.dataStart + startFrame * parsed.blockAlign,
    parsed.dataStart + endFrame * parsed.blockAlign,
  );
  const dataPadding = trimmedData.length % 2 === 0
    ? Buffer.alloc(0)
    : Buffer.alloc(1);
  const output = Buffer.concat([
    wave.subarray(0, parsed.dataStart),
    trimmedData,
    dataPadding,
    wave.subarray(parsed.dataPaddedEnd),
  ]);
  output.writeUInt32LE(trimmedData.length, parsed.dataHeaderOffset + 4);
  output.writeUInt32LE(output.length - 8, 4);
  return output;
}
