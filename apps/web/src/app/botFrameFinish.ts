export const BOT_FRAME_FACTORY_FINISHES = ["clean"] as const;

export const BOT_FRAME_NEUTRAL_FINISHES = ["scuffed", "chipped"] as const;

export const BOT_FRAME_PAINT_FINISHES = [
  "band",
  "stripe",
  "top-crown",
  "side-pods",
  "lower-jaw",
  "staggered-dashes",
  "diagonal-sweep",
  "quartered-panels",
  "weathered-asymmetric",
  "weathered-segments",
  "weathered-ring",
  "weathered-gap",
] as const;

export type BotFrameFinish =
  | (typeof BOT_FRAME_FACTORY_FINISHES)[number]
  | (typeof BOT_FRAME_NEUTRAL_FINISHES)[number]
  | (typeof BOT_FRAME_PAINT_FINISHES)[number];

export const BOT_FRAME_PAINT_ENABLED = false;

export const BOT_FRAME_ALL_FINISHES: readonly BotFrameFinish[] = [
  ...BOT_FRAME_FACTORY_FINISHES,
  ...BOT_FRAME_NEUTRAL_FINISHES,
  ...BOT_FRAME_PAINT_FINISHES,
];

/**
 * The live deterministic mix. Painted recipes remain authored below so they
 * can be refined without deleting work, but factory-clean is never randomly
 * assigned. Every non-PRISM bot receives visible, colorless scratch wear.
 */
export const BOT_FRAME_FINISHES: readonly BotFrameFinish[] =
  BOT_FRAME_PAINT_ENABLED
    ? [...BOT_FRAME_NEUTRAL_FINISHES, ...BOT_FRAME_PAINT_FINISHES]
    : BOT_FRAME_NEUTRAL_FINISHES;

export interface BotFrameFinishRecipe {
  paintMaskAsset: string | null;
  paintStrength: number;
  wearMaskAsset: string | null;
  wearStrength: number;
  scratchOpacity: number | "seeded";
}

export const BOT_FRAME_FINISH_RECIPES: Record<
  BotFrameFinish,
  BotFrameFinishRecipe
> = {
  clean: {
    paintMaskAsset: null,
    paintStrength: 0,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0,
  },
  scuffed: {
    paintMaskAsset: null,
    paintStrength: 0,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: "seeded",
  },
  chipped: {
    paintMaskAsset: null,
    paintStrength: 0,
    wearMaskAsset: "bot-frame-chipped-paint-mask.png",
    wearStrength: 0.52,
    scratchOpacity: 0.05,
  },
  band: {
    paintMaskAsset: "bot-frame-broken-band-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  stripe: {
    paintMaskAsset: "bot-frame-offset-stripe-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "top-crown": {
    paintMaskAsset: "bot-frame-top-crown-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "side-pods": {
    paintMaskAsset: "bot-frame-side-pods-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "lower-jaw": {
    paintMaskAsset: "bot-frame-lower-jaw-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "staggered-dashes": {
    paintMaskAsset: "bot-frame-staggered-dashes-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "diagonal-sweep": {
    paintMaskAsset: "bot-frame-diagonal-sweep-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "quartered-panels": {
    paintMaskAsset: "bot-frame-quartered-panels-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "weathered-asymmetric": {
    paintMaskAsset: "bot-frame-weathered-asymmetric-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "weathered-segments": {
    paintMaskAsset: "bot-frame-weathered-segments-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "weathered-ring": {
    paintMaskAsset: "bot-frame-weathered-ring-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
  "weathered-gap": {
    paintMaskAsset: "bot-frame-weathered-gap-mask.png",
    paintStrength: 1,
    wearMaskAsset: null,
    wearStrength: 0,
    scratchOpacity: 0.035,
  },
};

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
    normalizedSeed === PRISM_FACTORY_CLEAN_FRAME_SEED ||
    normalizedSeed === "bot-frame-material:fallback:prism"
  ) {
    return "clean";
  }

  const assignmentSeed = normalizedSeed || "bot-frame-material:fallback:unknown";

  const finishIndex = Math.min(
    BOT_FRAME_FINISHES.length - 1,
    Math.floor(stableUnitValue(`${assignmentSeed}:finish:v3`) * BOT_FRAME_FINISHES.length)
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
