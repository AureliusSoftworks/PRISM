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

export interface DebateMysteryMansionDoorTargetV1 {
  xPercent: number;
  yPercent: number;
}

const DEBATE_MYSTERY_MANSION_DOOR_TARGETS_V1 = {
  "gothic-old-house-v1": {
    compact: { xPercent: 50, yPercent: 59 },
    standard: { xPercent: 50, yPercent: 55 },
    grand: { xPercent: 45, yPercent: 54 },
  },
  "spacecraft-industrial-v1": {
    compact: { xPercent: 54, yPercent: 58 },
    standard: { xPercent: 66, yPercent: 58 },
    grand: { xPercent: 54, yPercent: 50 },
  },
  "jungle-wilderness-v1": {
    compact: { xPercent: 47, yPercent: 55 },
    standard: { xPercent: 49, yPercent: 56 },
    grand: { xPercent: 45, yPercent: 57 },
  },
  "neutral-mansion-v1": {
    compact: { xPercent: 59, yPercent: 49 },
    standard: { xPercent: 60, yPercent: 44 },
    grand: { xPercent: 54, yPercent: 48 },
  },
} as const satisfies Record<
  keyof typeof DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1,
  Record<DebateMysteryMansionExteriorScaleClassV1, DebateMysteryMansionDoorTargetV1>
>;

function debateMysteryMansionExteriorFamilyV1(
  houseStyle: Pick<DebateMysteryHouseStyleV2, "label"> &
    Partial<Pick<DebateMysteryHouseStyleV2, "promptContract" | "acousticThemePaletteId">>,
): keyof typeof DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1 {
  const inferredPalette = debateMysteryAcousticThemePaletteV1(
    `${houseStyle.label} ${houseStyle.promptContract ?? ""}`,
  );
  const palette = houseStyle.acousticThemePaletteId?.trim() || inferredPalette;
  return palette in DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1
    ? palette as keyof typeof DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1
    : "neutral-mansion-v1";
}

export function debateMysteryMansionDoorTargetV1(
  houseStyle: Pick<DebateMysteryHouseStyleV2, "label"> &
    Partial<Pick<DebateMysteryHouseStyleV2, "promptContract" | "acousticThemePaletteId">>,
  scaleClass: DebateMysteryMansionExteriorScaleClassV1 = "standard",
): DebateMysteryMansionDoorTargetV1 {
  return DEBATE_MYSTERY_MANSION_DOOR_TARGETS_V1[
    debateMysteryMansionExteriorFamilyV1(houseStyle)
  ][scaleClass];
}

export function debateMysteryMansionExteriorFallbackV1(
  houseStyle: Pick<DebateMysteryHouseStyleV2, "label"> &
    Partial<Pick<DebateMysteryHouseStyleV2, "promptContract" | "acousticThemePaletteId">>,
  scaleClass: DebateMysteryMansionExteriorScaleClassV1 = "standard",
): string {
  const family = DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1[
    debateMysteryMansionExteriorFamilyV1(houseStyle)
  ];
  return family[scaleClass];
}
