export const BOT_FRAME_FINISHES = [
  "clean",
  "scuffed",
  "chipped",
  "band",
  "stripe",
] as const;

export type BotFrameFinish = (typeof BOT_FRAME_FINISHES)[number];

export const PRISM_FACTORY_CLEAN_FRAME_SEED =
  "bot-frame-material:prism:factory-clean";

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

export function botFrameFinishForSeed(seed: string | null | undefined): BotFrameFinish {
  const normalizedSeed = seed?.trim();
  if (
    !normalizedSeed ||
    normalizedSeed === PRISM_FACTORY_CLEAN_FRAME_SEED ||
    normalizedSeed === "bot-frame-material:fallback:prism"
  ) {
    return "clean";
  }

  const finishIndex = Math.min(
    BOT_FRAME_FINISHES.length - 1,
    Math.floor(stableUnitValue(`${normalizedSeed}:finish:v1`) * BOT_FRAME_FINISHES.length)
  );
  return BOT_FRAME_FINISHES[finishIndex];
}

export function botFrameFinishMirroredForSeed(
  seed: string | null | undefined
): boolean {
  const normalizedSeed = seed?.trim();
  if (!normalizedSeed || normalizedSeed === PRISM_FACTORY_CLEAN_FRAME_SEED) {
    return false;
  }
  return stableUnitValue(`${normalizedSeed}:finish:mirror:v1`) >= 0.5;
}
