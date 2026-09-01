import {
  debateMysteryAcousticThemePaletteV1,
  type DebateMysteryMansionExteriorScaleClassV1,
  type DebateMysteryHouseStyleV2,
  type MysteryVenueProfileV1,
} from "@localai/shared";

export const DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1 = {
  "abstract-venue-v1": {
    compact: "/debate/mystery/exteriors/abstract-venue-compact-v1.svg",
    standard: "/debate/mystery/exteriors/abstract-venue-standard-v1.svg",
    grand: "/debate/mystery/exteriors/abstract-venue-grand-v1.svg",
  },
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
  "maritime-passenger-v1": {
    compact: "/debate/mystery/exteriors/maritime-passenger-compact-v1.webp",
    standard: "/debate/mystery/exteriors/maritime-passenger-standard-v1.webp",
    grand: "/debate/mystery/exteriors/maritime-passenger-grand-v1.webp",
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
  "abstract-venue-v1": {
    compact: { xPercent: 50, yPercent: 60 },
    standard: { xPercent: 50, yPercent: 58 },
    grand: { xPercent: 50, yPercent: 56 },
  },
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
  "maritime-passenger-v1": {
    compact: { xPercent: 36, yPercent: 64 },
    standard: { xPercent: 28, yPercent: 61 },
    grand: { xPercent: 22, yPercent: 60 },
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
  venueProfile?: Pick<MysteryVenueProfileV1, "kind" | "presentation"> | null,
): keyof typeof DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1 {
  const declaredFamilies = venueProfile?.presentation
    ? [
        venueProfile.presentation.familyId,
        ...venueProfile.presentation.compatibleExteriorFamilies,
      ]
    : [];
  const declared = declaredFamilies.find((family) =>
    family in DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1);
  if (declared) {
    return declared as keyof typeof DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1;
  }
  // An authored non-estate venue may never inherit a mansion photograph from
  // acoustic wording. Its caller renders a polished abstract silhouette until
  // a compatible family is installed.
  if (venueProfile && venueProfile.kind !== "estate") {
    return venueProfile.kind === "vessel" &&
        venueProfile.presentation?.familyId === "maritime-passenger-v1"
      ? "maritime-passenger-v1"
      : "abstract-venue-v1";
  }
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
  venueProfile?: Pick<MysteryVenueProfileV1, "kind" | "presentation"> | null,
): DebateMysteryMansionDoorTargetV1 {
  return DEBATE_MYSTERY_MANSION_DOOR_TARGETS_V1[
    debateMysteryMansionExteriorFamilyV1(houseStyle, venueProfile)
  ][scaleClass];
}

export function debateMysteryMansionExteriorFallbackV1(
  houseStyle: Pick<DebateMysteryHouseStyleV2, "label"> &
    Partial<Pick<DebateMysteryHouseStyleV2, "promptContract" | "acousticThemePaletteId">>,
  scaleClass: DebateMysteryMansionExteriorScaleClassV1 = "standard",
  venueProfile?: Pick<MysteryVenueProfileV1, "kind" | "presentation"> | null,
): string {
  const family = DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1[
    debateMysteryMansionExteriorFamilyV1(houseStyle, venueProfile)
  ];
  return family[scaleClass];
}
