import {
  debateMysteryAcousticThemePaletteV1,
  type DebateMysteryMansionExteriorScaleClassV1,
  type DebateMysteryHouseStyleV2,
} from "@localai/shared";

export const DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1 = {
  "gothic-old-house-v1": {
    compact: "/debate/mystery/exteriors/gothic-old-house-compact-v1.webp",
    standard: "/debate/mystery/exteriors/gothic-old-house-standard-v1.webp",
    grand: "/debate/mystery/exteriors/gothic-old-house-grand-v1.webp",
  },
  "spacecraft-industrial-v1": {
    compact: "/debate/mystery/exteriors/spacecraft-industrial-compact-v1.webp",
    standard: "/debate/mystery/exteriors/spacecraft-industrial-standard-v1.webp",
    grand: "/debate/mystery/exteriors/spacecraft-industrial-grand-v1.webp",
  },
  "jungle-wilderness-v1": {
    compact: "/debate/mystery/exteriors/jungle-wilderness-compact-v1.webp",
    standard: "/debate/mystery/exteriors/jungle-wilderness-standard-v1.webp",
    grand: "/debate/mystery/exteriors/jungle-wilderness-grand-v1.webp",
  },
  "neutral-mansion-v1": {
    compact: "/debate/mystery/exteriors/prism-house-compact-v1.webp",
    standard: "/debate/mystery/exteriors/prism-house-standard-v1.webp",
    grand: "/debate/mystery/exteriors/prism-house-grand-v1.webp",
  },
} as const;

export function debateMysteryMansionExteriorFallbackV1(
  houseStyle: Pick<DebateMysteryHouseStyleV2, "label"> &
    Partial<Pick<DebateMysteryHouseStyleV2, "promptContract" | "acousticThemePaletteId">>,
  scaleClass: DebateMysteryMansionExteriorScaleClassV1 = "standard",
): string {
  const inferredPalette = debateMysteryAcousticThemePaletteV1(
    `${houseStyle.label} ${houseStyle.promptContract ?? ""}`,
  );
  const palette = houseStyle.acousticThemePaletteId?.trim() || inferredPalette;
  const family = DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1[
    palette as keyof typeof DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1
  ] ?? DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1["neutral-mansion-v1"];
  return family[scaleClass];
}
