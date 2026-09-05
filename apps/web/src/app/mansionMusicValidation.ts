import {
  validateMansionMusicLoopV1,
  type MansionMusicIdentityV1,
  type MansionMusicLoopV1,
} from "@localai/shared";

const ANALYSIS_BLOCK_MS = 100;
const NEAR_SILENCE_DBFS = -42;
const NEAR_SILENCE_RELATIVE_DB = -12;
const LOUDNESS_REFERENCE_PERCENTILE = 0.9;
const AUDIBLE_CONTENT_RMS = 0.02;

export interface MansionMusicPcmV1 {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface MansionMusicAnalysisV1 {
  loop: MansionMusicLoopV1 | null;
  errors: string[];
}

function findQuietRun(
  quiet: readonly boolean[],
  start: number,
  end: number,
  required: number,
  preferLast: boolean,
): { start: number; end: number } | null {
  const found: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let index = start; index < end; index += 1) {
    if (quiet[index]) {
      if (runStart < 0) runStart = index;
      continue;
    }
    if (runStart >= 0 && index - runStart >= required) {
      found.push({ start: runStart, end: index });
    }
    runStart = -1;
  }
  if (runStart >= 0 && end - runStart >= required) {
    found.push({ start: runStart, end });
  }
  return preferLast ? found.at(-1) ?? null : found[0] ?? null;
}

export function analyzeMansionMusicPcmV1(
  pcm: MansionMusicPcmV1,
  identity: MansionMusicIdentityV1,
): MansionMusicAnalysisV1 {
  if (pcm.sampleRate < 8_000 || pcm.length < 1 || pcm.numberOfChannels < 1) {
    return { loop: null, errors: ["The decoded music preview is empty or invalid."] };
  }
  const blockFrames = Math.max(1, Math.round(pcm.sampleRate * ANALYSIS_BLOCK_MS / 1_000));
  const blockCount = Math.ceil(pcm.length / blockFrames);
  const rms: number[] = [];
  let peak = 0;
  for (let block = 0; block < blockCount; block += 1) {
    const frameStart = block * blockFrames;
    const frameEnd = Math.min(pcm.length, frameStart + blockFrames);
    let sumSquares = 0;
    let sampleCount = 0;
    for (let channel = 0; channel < pcm.numberOfChannels; channel += 1) {
      const samples = pcm.getChannelData(channel);
      for (let frame = frameStart; frame < frameEnd; frame += 1) {
        const sample = samples[frame] ?? 0;
        peak = Math.max(peak, Math.abs(sample));
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }
    rms.push(sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0);
  }
  const orderedRms = [...rms].sort((left, right) => left - right);
  const loudnessReference = orderedRms[
    Math.floor((orderedRms.length - 1) * LOUDNESS_REFERENCE_PERCENTILE)
  ] ?? 0;
  const threshold = Math.max(
    10 ** (NEAR_SILENCE_DBFS / 20),
    loudnessReference * 10 ** (NEAR_SILENCE_RELATIVE_DB / 20),
  );
  const quiet = rms.map((value) => value <= threshold);
  const silenceRatio = quiet.filter(Boolean).length / quiet.length;
  const durationMs = pcm.length / pcm.sampleRate * 1_000;
  const requiredQuietBlocks = Math.ceil(identity.loopBoundary.quietWindowSeconds * 1_000 / ANALYSIS_BLOCK_MS);
  const searchBlocks = Math.ceil(identity.loopBoundary.searchWindowSeconds * 1_000 / ANALYSIS_BLOCK_MS);
  const head = findQuietRun(quiet, 0, Math.min(blockCount, searchBlocks), requiredQuietBlocks, false);
  const tail = findQuietRun(quiet, Math.max(0, blockCount - searchBlocks), blockCount, requiredQuietBlocks, true);
  const errors: string[] = [];
  if (Math.max(...rms) < AUDIBLE_CONTENT_RMS) {
    errors.push("The music preview contains no sufficiently audible instrumental content.");
  }
  if (peak > 0.98) {
    errors.push("The music preview peak is too high for a dialogue-safe background mix.");
  }
  if (!head || !tail) {
    errors.push("The music preview needs quiet windows near both loop boundaries.");
  }
  const loop: MansionMusicLoopV1 | null = head && tail
    ? {
        version: 1,
        loopStartMs: Math.round(head.start * ANALYSIS_BLOCK_MS),
        loopEndMs: Math.min(Math.round(durationMs), Math.round(tail.end * ANALYSIS_BLOCK_MS)),
        crossfadeMs: Math.round(identity.loopBoundary.crossfadeSeconds * 1_000),
        silenceRatio: Number(silenceRatio.toFixed(4)),
      }
    : null;
  errors.push(...validateMansionMusicLoopV1(loop, durationMs, identity));
  const playerFacingErrors = errors.map((error) => error === "music loop silence ratio is invalid."
    ? "The generated music needs a clearer balance of quiet intervals and instrumental phrases. Try synthesizing another version."
    : error);
  return {
    loop: errors.length === 0 ? loop : null,
    errors: [...new Set(playerFacingErrors)],
  };
}

export async function validateMansionMusicCandidateUrlV1(
  url: string,
  identity: MansionMusicIdentityV1,
): Promise<MansionMusicLoopV1> {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("PRISM could not load the generated music preview for validation.");
  const AudioContextConstructor = window.AudioContext;
  if (typeof AudioContextConstructor !== "function") {
    throw new Error("This device cannot decode the generated music preview.");
  }
  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(await response.arrayBuffer());
    const analysis = analyzeMansionMusicPcmV1(decoded, identity);
    if (!analysis.loop) throw new Error(analysis.errors.join(" "));
    return analysis.loop;
  } finally {
    await context.close().catch(() => undefined);
  }
}
