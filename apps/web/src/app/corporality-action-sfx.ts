/**
 * Bodily Action SFX resolution: pack → corporality-bin stock (crossfade) → legacy.
 */

import {
  corporalityStockClipPathsForMix,
  isActionSfxPackBodilyKind,
  isCorporalityStockKind,
  normalizeCorporality,
  type ActionSfxPackKind,
  type CorporalityBinMix,
  type CorporalityStockKind,
} from "@localai/shared";

export type BodilyActionSfxKind = CorporalityStockKind;

export type ResolvedBodilyActionSfx =
  | {
      source: "pack";
      urls: [string];
      gains: [number];
      playbackRate: number;
      variantIndex: number;
    }
  | {
      source: "corporality";
      urls: [string] | [string, string];
      gains: [number] | [number, number];
      mix: CorporalityBinMix;
      playbackRate: number;
      variantIndex: number;
    }
  | {
      source: "legacy";
      urls: [string];
      gains: [number];
      playbackRate: number;
      variantIndex: number;
    };

const LEGACY_BODILY_SOURCES = {
  fart: [
    "/audio/coffee/action-reactions/fart-01.mp3",
    "/audio/coffee/action-reactions/fart-02.mp3",
    "/audio/coffee/action-reactions/fart-03.mp3",
    "/audio/coffee/action-reactions/fart-04.mp3",
  ],
  burp: [
    "/audio/coffee/action-reactions/burp-01.mp3",
    "/audio/coffee/action-reactions/burp-02.mp3",
    "/audio/coffee/action-reactions/burp-03.mp3",
    "/audio/coffee/action-reactions/burp-04.mp3",
  ],
  cough: [
    "/audio/coffee/action-reactions/cough-01.mp3",
    "/audio/coffee/action-reactions/cough-02.mp3",
    "/audio/coffee/action-reactions/cough-03.mp3",
    "/audio/coffee/action-reactions/cough-04.mp3",
  ],
} as const satisfies Record<BodilyActionSfxKind, readonly string[]>;

function boundedRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.999_999, Math.max(0, value));
}

function bodilyPlaybackRate(
  kind: BodilyActionSfxKind,
  random: () => number,
): number {
  const pitchDepth = kind === "cough" ? 0.1 : 0.16;
  return 1 + (boundedRandom(random) * 2 - 1) * pitchDepth;
}

/** Prefer pack clip when present; otherwise adjacent-bin corporality stock. */
export function resolveBodilyActionSfxPlayback(args: {
  kind: ActionSfxPackKind | BodilyActionSfxKind;
  corporality?: number | null;
  packSource?: string | null;
  packVariantIndex?: number | null;
  random?: () => number;
}): ResolvedBodilyActionSfx | null {
  const random = args.random ?? Math.random;
  if (args.packSource) {
    return {
      source: "pack",
      urls: [args.packSource],
      gains: [1],
      playbackRate: 1,
      variantIndex: Math.max(0, Math.floor(args.packVariantIndex ?? 0)),
    };
  }
  if (!isCorporalityStockKind(args.kind) && !isActionSfxPackBodilyKind(args.kind as ActionSfxPackKind)) {
    return null;
  }
  const kind = args.kind as BodilyActionSfxKind;
  const variantIndex = Math.floor(boundedRandom(random) * 3);
  const playbackRate = bodilyPlaybackRate(kind, random);
  const mixPaths = corporalityStockClipPathsForMix({
    kind,
    corporality: normalizeCorporality(args.corporality),
    variantIndex,
  });
  if (!mixPaths) return null;
  const { mix } = mixPaths;
  const nearUnity = (gain: number) => gain >= 0.995;
  const nearSilent = (gain: number) => gain <= 0.005;
  if (nearUnity(mix.leftGain) || nearSilent(mix.rightGain)) {
    return {
      source: "corporality",
      urls: [mixPaths.left],
      gains: [1],
      mix,
      playbackRate,
      variantIndex,
    };
  }
  if (nearUnity(mix.rightGain) || nearSilent(mix.leftGain)) {
    return {
      source: "corporality",
      urls: [mixPaths.right],
      gains: [1],
      mix,
      playbackRate,
      variantIndex,
    };
  }
  return {
    source: "corporality",
    urls: [mixPaths.left, mixPaths.right],
    gains: [mix.leftGain, mix.rightGain],
    mix,
    playbackRate,
    variantIndex,
  };
}

/** Last-resort flat coffee clips when corporality stock is unavailable. */
export function resolveLegacyBodilyActionSfxPlayback(
  kind: BodilyActionSfxKind,
  random: () => number = Math.random,
): ResolvedBodilyActionSfx {
  const sources = LEGACY_BODILY_SOURCES[kind];
  const variantIndex = Math.floor(boundedRandom(random) * sources.length);
  return {
    source: "legacy",
    urls: [sources[variantIndex]!],
    gains: [1],
    playbackRate: bodilyPlaybackRate(kind, random),
    variantIndex,
  };
}
