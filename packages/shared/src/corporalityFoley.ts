/**
 * Corporality Foley bins — Artificial / Organic / Ethereal stock bodily SFX
 * with adjacent-bin crossfade for mixed corporality on the Identity slider.
 */

import type { ActionSfxPackKind } from "./actionSfxPack.ts";
import { isActionSfxPackBodilyKind } from "./actionSfxPack.ts";
import { normalizeCorporality } from "./audioVoice.ts";

export { normalizeCorporality } from "./audioVoice.ts";

export const CORPORALITY_BINS = [
  "artificial",
  "organic",
  "ethereal",
] as const;

export type CorporalityBin = (typeof CORPORALITY_BINS)[number];

export const CORPORALITY_STOCK_KINDS = ["fart", "burp", "cough"] as const;
export type CorporalityStockKind = (typeof CORPORALITY_STOCK_KINDS)[number];

export const CORPORALITY_STOCK_VARIANT_COUNT = 3 as const;
export const CORPORALITY_DEFAULT = 0.5;
export const CORPORALITY_ORGANIC = 0.5;
export const CORPORALITY_ARTIFICIAL = 0;
export const CORPORALITY_ETHEREAL = 1;

const BIN_ANCHORS: ReadonlyArray<{ bin: CorporalityBin; value: number }> = [
  { bin: "artificial", value: 0 },
  { bin: "organic", value: 0.5 },
  { bin: "ethereal", value: 1 },
];

export function isCorporalityBin(value: unknown): value is CorporalityBin {
  return (
    typeof value === "string" &&
    (CORPORALITY_BINS as readonly string[]).includes(value)
  );
}

export function isCorporalityStockKind(
  value: unknown,
): value is CorporalityStockKind {
  return (
    typeof value === "string" &&
    (CORPORALITY_STOCK_KINDS as readonly string[]).includes(value)
  );
}

export interface CorporalityBinMix {
  leftBin: CorporalityBin;
  rightBin: CorporalityBin;
  /** 0 = fully leftBin, 1 = fully rightBin. */
  mix: number;
  leftGain: number;
  rightGain: number;
}

/**
 * Adjacent-bin crossfade along Artificial (0) → Organic (0.5) → Ethereal (1).
 * Never blends all three bins at once.
 */
export function corporalityBinsForValue(value: unknown): CorporalityBinMix {
  const corporality = normalizeCorporality(value);
  if (corporality <= CORPORALITY_ORGANIC) {
    const span = CORPORALITY_ORGANIC - CORPORALITY_ARTIFICIAL;
    const mix = span <= 0 ? 0 : (corporality - CORPORALITY_ARTIFICIAL) / span;
    return {
      leftBin: "artificial",
      rightBin: "organic",
      mix,
      leftGain: 1 - mix,
      rightGain: mix,
    };
  }
  const span = CORPORALITY_ETHEREAL - CORPORALITY_ORGANIC;
  const mix = span <= 0 ? 0 : (corporality - CORPORALITY_ORGANIC) / span;
  return {
    leftBin: "organic",
    rightBin: "ethereal",
    mix,
    leftGain: 1 - mix,
    rightGain: mix,
  };
}

/** Dominant bin for labeling / seeding (nearest anchor). */
export function corporalityNearestBin(value: unknown): CorporalityBin {
  const corporality = normalizeCorporality(value);
  let best: CorporalityBin = "organic";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of BIN_ANCHORS) {
    const distance = Math.abs(anchor.value - corporality);
    if (distance < bestDistance) {
      best = anchor.bin;
      bestDistance = distance;
    }
  }
  return best;
}

export function corporalityStockClipPath(
  bin: CorporalityBin,
  kind: CorporalityStockKind,
  variantIndex: number,
): string {
  const variant = Math.max(
    0,
    Math.min(CORPORALITY_STOCK_VARIANT_COUNT - 1, Math.floor(variantIndex)),
  );
  const suffix = String(variant + 1).padStart(2, "0");
  return `/audio/action-reactions/corporality/${bin}/${kind}-${suffix}.mp3`;
}

export function corporalityStockClipPathsForMix(args: {
  kind: CorporalityStockKind | ActionSfxPackKind;
  corporality: number;
  variantIndex: number;
}): { left: string; right: string; mix: CorporalityBinMix } | null {
  if (
    !isCorporalityStockKind(args.kind) &&
    !isActionSfxPackBodilyKind(args.kind)
  ) {
    return null;
  }
  const kind = args.kind as CorporalityStockKind;
  const mix = corporalityBinsForValue(args.corporality);
  return {
    left: corporalityStockClipPath(mix.leftBin, kind, args.variantIndex),
    right: corporalityStockClipPath(mix.rightBin, kind, args.variantIndex),
    mix,
  };
}

const ARTIFICIAL_PERSONA =
  /\b(?:robot|android|cyborg|mech(?:anical)?|synthetic|automaton|machine|drone|ai\b|artificial|metallic|servo|circuit)\b/iu;
const ETHEREAL_PERSONA =
  /\b(?:ghost|spirit|specter|spectre|ethereal|phantom|wraith|angel|demon|energy being|non[- ]?corporeal|astral|otherworldly|hologram|projection)\b/iu;

/**
 * Infer a corporality slider seed from persona / profile text.
 * Artificial and ethereal keywords win over the organic default when present.
 */
export function inferCorporalityFromPersona(
  personaText: string | null | undefined,
): number {
  const text = personaText?.replace(/\s+/gu, " ").trim() ?? "";
  if (!text) return CORPORALITY_DEFAULT;
  const artificial = ARTIFICIAL_PERSONA.test(text);
  const ethereal = ETHEREAL_PERSONA.test(text);
  if (artificial && !ethereal) return 0.15;
  if (ethereal && !artificial) return 0.85;
  if (artificial && ethereal) return CORPORALITY_DEFAULT;
  return CORPORALITY_DEFAULT;
}

/** Material flavor line for ElevenLabs stock-clip prompts. */
export function corporalityBinMaterialPrompt(bin: CorporalityBin): string {
  switch (bin) {
    case "artificial":
      return "servo and metal resonance, pressurized valve release, dry mechanical body";
    case "organic":
      return "close-mic flesh and wet air comedy, natural room decay, organic body";
    case "ethereal":
      return "airy spectral flutter, soft otherworldly whoosh, non-corporeal body";
    default: {
      const _exhaustive: never = bin;
      return _exhaustive;
    }
  }
}

export function buildCorporalityStockSfxPrompt(args: {
  bin: CorporalityBin;
  kind: CorporalityStockKind;
  variantIndex: number;
}): string {
  const variant = Math.max(
    0,
    Math.min(CORPORALITY_STOCK_VARIANT_COUNT - 1, Math.floor(args.variantIndex)),
  );
  const kindLine =
    args.kind === "fart"
      ? "short comic fart"
      : args.kind === "burp"
        ? "short comic burp"
        : "short single cough";
  const material = corporalityBinMaterialPrompt(args.bin);
  return `A ${kindLine}, ${material}, dry close mic, brief natural decay, unique take ${variant + 1}.`.slice(
    0,
    450,
  );
}
