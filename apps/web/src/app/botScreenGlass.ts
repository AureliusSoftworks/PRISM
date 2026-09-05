export const BOT_SCREEN_GLASS_PROFILE_COUNT = 12;
export const BOT_SCREEN_GLASS_ASSET_VERSION = 1;

export interface BotScreenGlassProfile {
  profileIndex: number;
  profileId: string;
  residueUrl: string;
  distortionUrl: string;
  rotationQuarterTurns: 0 | 1 | 2 | 3;
  rotationDeg: number;
  residueOpacity: number;
  distortionOpacity: number;
  distortionBlurPx: number;
}

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

/** Resolve one portable, screen-fixed wear profile independently from chassis
 * finish. Only quarter turns are used so generated fingerprint ridges stay
 * crisp and replay-stable. */
export function botScreenGlassProfileForSeed(
  seed: string | null | undefined,
): BotScreenGlassProfile {
  const normalizedSeed = seed?.trim() || "bot-screen-material:fallback:prism";
  const profileIndex = Math.min(
    BOT_SCREEN_GLASS_PROFILE_COUNT,
    Math.floor(
      stableUnitValue(`${normalizedSeed}:glass-profile`) *
        BOT_SCREEN_GLASS_PROFILE_COUNT,
    ) + 1,
  );
  const rotationQuarterTurns = Math.min(
    3,
    Math.floor(stableUnitValue(`${normalizedSeed}:glass-rotation`) * 4),
  ) as 0 | 1 | 2 | 3;
  const profileToken = String(profileIndex).padStart(2, "0");
  const assetRoot = "/bot-frame/glass-v1";

  return {
    profileIndex,
    profileId: `crt-glass/v1/profile-${profileToken}`,
    residueUrl: `${assetRoot}/glass-profile-${profileToken}-residue.png?v=${BOT_SCREEN_GLASS_ASSET_VERSION}`,
    distortionUrl: `${assetRoot}/glass-profile-${profileToken}-distortion.png?v=${BOT_SCREEN_GLASS_ASSET_VERSION}`,
    rotationQuarterTurns,
    rotationDeg: rotationQuarterTurns * 90,
    // The host lens has its own whole-layer opacity. These values compensate
    // for that so real fingerprint ridges survive at presentation scale.
    residueOpacity: Number(
      (
        0.72 +
        stableUnitValue(`${normalizedSeed}:glass-residue-strength`) * 0.16
      ).toFixed(3),
    ),
    distortionOpacity: Number(
      (
        0.76 +
        stableUnitValue(`${normalizedSeed}:glass-distortion-strength`) * 0.14
      ).toFixed(3),
    ),
    distortionBlurPx: Number(
      (
        0.34 +
        stableUnitValue(`${normalizedSeed}:glass-distortion-blur`) * 0.22
      ).toFixed(3),
    ),
  };
}
