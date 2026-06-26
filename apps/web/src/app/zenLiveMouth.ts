export const ZEN_LIVE_MOUTH_PHASE_MS = 120;

export type ZenLiveBotMouthShape =
  | "open-wide"
  | "closed"
  | "open-small"
  | "open-round";

const ZEN_LIVE_SIMPLE_OPEN_MOUTH_SHAPES = [
  "open-small",
  "open-wide",
] as const satisfies readonly ZenLiveBotMouthShape[];

function zenLiveMouthHashText(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function zenLiveMouthOpenShape(seed: number, beatIndex: number): ZenLiveBotMouthShape {
  const roll = zenLiveMouthHashText(`${seed}:${beatIndex}`);
  return ZEN_LIVE_SIMPLE_OPEN_MOUTH_SHAPES[
    roll % ZEN_LIVE_SIMPLE_OPEN_MOUTH_SHAPES.length
  ]!;
}

function zenLiveMouthUsesFlourish(seed: number, beatIndex: number): boolean {
  const stride = 7 + (seed % 4);
  const offset = 3 + (Math.floor(seed / 13) % Math.max(1, stride - 3));
  return beatIndex >= offset && (beatIndex - offset) % stride === 0;
}

function zenLiveMouthFlourishPlan(seed: number): { stride: number; offset: number } {
  const stride = 7 + (seed % 4);
  return {
    stride,
    offset: 3 + (Math.floor(seed / 13) % Math.max(1, stride - 3)),
  };
}

function zenLiveMouthFlourishCountBeforeBeat(seed: number, beatIndex: number): number {
  const { stride, offset } = zenLiveMouthFlourishPlan(seed);
  if (beatIndex <= offset) return 0;
  return Math.floor((beatIndex - 1 - offset) / stride) + 1;
}

function zenLiveMouthPhaseStartForBeat(seed: number, beatIndex: number): number {
  const safeBeatIndex = Math.max(0, Math.floor(beatIndex));
  return safeBeatIndex * 2 + zenLiveMouthFlourishCountBeforeBeat(seed, safeBeatIndex) * 2;
}

function zenLiveMouthBeatIndexForPhase(phaseIndex: number, seed: number): number {
  const safePhaseIndex = Math.max(0, Math.floor(phaseIndex));
  let low = 0;
  let high = Math.floor(safePhaseIndex / 2) + 1;

  while (zenLiveMouthPhaseStartForBeat(seed, high) <= safePhaseIndex) {
    high *= 2;
  }

  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (zenLiveMouthPhaseStartForBeat(seed, mid) <= safePhaseIndex) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
}

function zenLiveBotMouthShapeAtPhase(
  phaseIndex: number,
  seed: number
): ZenLiveBotMouthShape {
  const safePhaseIndex = Math.max(0, Math.floor(phaseIndex));
  const beatIndex = zenLiveMouthBeatIndexForPhase(safePhaseIndex, seed);
  const localIndex = safePhaseIndex - zenLiveMouthPhaseStartForBeat(seed, beatIndex);
  const openShape = zenLiveMouthOpenShape(seed, beatIndex);
  const pattern = zenLiveMouthUsesFlourish(seed, beatIndex)
    ? (["closed", openShape, "open-round", openShape] as const)
    : (["closed", openShape] as const);
  return pattern[localIndex] ?? "closed";
}

function zenLiveRevealTokenHasWord(token: string | undefined): boolean {
  return typeof token === "string" && /[A-Za-z0-9]/u.test(token);
}

export function zenLiveBotMouthShapeFromRevealProgress({
  tokens,
  visibleTokenCount,
  nowMs,
  firstSeenAtMs,
  startDelayMs,
  phaseMs = ZEN_LIVE_MOUTH_PHASE_MS,
}: {
  tokens: readonly string[];
  visibleTokenCount: number;
  nowMs: number;
  firstSeenAtMs: number;
  startDelayMs: number;
  phaseMs?: number;
}): ZenLiveBotMouthShape | null {
  const clampedVisibleTokenCount = Math.min(
    tokens.length,
    Math.max(0, Math.floor(visibleTokenCount))
  );
  if (clampedVisibleTokenCount <= 0) return null;
  const hasVisibleWord = tokens
    .slice(0, clampedVisibleTokenCount)
    .some(zenLiveRevealTokenHasWord);
  if (!hasVisibleWord) return null;

  const elapsedSpeechMs = nowMs - firstSeenAtMs - startDelayMs;
  if (elapsedSpeechMs < 0) return null;

  const safePhaseMs = Math.max(1, phaseMs);
  const phaseIndex = Math.floor(elapsedSpeechMs / safePhaseMs);
  return zenLiveBotMouthShapeAtPhase(
    phaseIndex,
    zenLiveMouthHashText(tokens.join(""))
  );
}

export function zenLiveBotMouthOpenFromRevealProgress(
  input: Parameters<typeof zenLiveBotMouthShapeFromRevealProgress>[0]
): boolean | null {
  const mouthShape = zenLiveBotMouthShapeFromRevealProgress(input);
  return mouthShape === null ? null : mouthShape !== "closed";
}
