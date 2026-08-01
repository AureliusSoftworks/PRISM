import type { CSSProperties } from "react";

export const DEBATE_STAGE_ALIGNMENT_VERSION = 10 as const;
export const DEBATE_STAGE_ALIGNMENT_MIN = -12;
export const DEBATE_STAGE_ALIGNMENT_MAX = 12;
export const DEBATE_STAGE_ALIGNMENT_STEP = 0.5;
export const DEBATE_STAGE_GAVEL_POSITION_MIN = -300;
export const DEBATE_STAGE_GAVEL_POSITION_MAX = 300;
export const DEBATE_STAGE_GAVEL_POSITION_STEP = 0.5;
export const DEBATE_STAGE_GAVEL_ROTATION_MIN = -180;
export const DEBATE_STAGE_GAVEL_ROTATION_MAX = 180;
export const DEBATE_STAGE_GAVEL_ROTATION_STEP = 1;
export const DEBATE_STAGE_GAVEL_SIZE_MIN = 50;
export const DEBATE_STAGE_GAVEL_SIZE_MAX = 200;
export const DEBATE_STAGE_GAVEL_SIZE_STEP = 5;
export const DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN = -300;
export const DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX = 300;
export const DEBATE_STAGE_EVIDENCE_TABLE_POSITION_STEP = 0.5;
export const DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN = 40;
export const DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MAX = 220;
export const DEBATE_STAGE_EVIDENCE_TABLE_SIZE_STEP = 5;
export const DEBATE_STAGE_LIGHT_MASK_OPACITY_MIN = 0;
export const DEBATE_STAGE_LIGHT_MASK_OPACITY_MAX = 100;
export const DEBATE_STAGE_LIGHT_MASK_OPACITY_STEP = 5;
export const DEBATE_STAGE_LIGHT_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

export type DebateStageAlignmentRole = "for" | "moderator" | "against";
export type DebateStageAlignmentItem = "bot" | "nameplate" | "glyph";
export type DebateStageAlignmentView = "wide" | "moderator";
export type DebateStageEvidenceKind = "exhibit" | "source";
export type DebateStageEvidenceView = "wide" | "left" | "moderator" | "right";
export type DebateStageCameraView = DebateStageEvidenceView | "jury";
export type DebateStageLightBlendMode =
  (typeof DEBATE_STAGE_LIGHT_BLEND_MODES)[number];
export type DebateStageAlignmentTarget =
  | `${DebateStageAlignmentRole}:${DebateStageAlignmentItem}`
  | `moderatorView:${DebateStageAlignmentItem}`;

export interface DebateStageOffsetV1 {
  x: number;
  y: number;
}

/** Jury reuses Wide evidence geometry; each public-floor camera is independent. */
export function debateStageEvidenceViewForCamera(
  cameraView: DebateStageCameraView,
): DebateStageEvidenceView {
  return cameraView === "jury" ? "wide" : cameraView;
}

export interface DebateStageRolePlacementV4 {
  bot: DebateStageOffsetV1;
  nameplate: DebateStageOffsetV1;
  glyph: DebateStageOffsetV1;
}

export interface DebateStageAlignmentWideV4 {
  for: DebateStageRolePlacementV4;
  moderator: DebateStageRolePlacementV4;
  against: DebateStageRolePlacementV4;
}

export interface DebateStageLightBlendModesV1 {
  dark: DebateStageLightBlendMode;
  light: DebateStageLightBlendMode;
}

export interface DebateStageLightMaskOpacitiesV1 {
  dark: number;
  light: number;
}

export interface DebateStageGavelPoseV3 extends DebateStageOffsetV1 {
  rotation: number;
  size: number;
}

export interface DebateStageGavelV3 {
  lowered: DebateStageGavelPoseV3;
  raised: DebateStageGavelPoseV3;
}

/** Shared place/size for the exhibit table that uses the Jury coffee-table raster. */
export interface DebateStageEvidenceTableV1 extends DebateStageOffsetV1 {
  size: number;
}

/** Per-camera evidence placement for every public Forum composition. */
export interface DebateStageEvidenceTablesV10 {
  wide: DebateStageEvidenceTableV1;
  left: DebateStageEvidenceTableV1;
  moderator: DebateStageEvidenceTableV1;
  right: DebateStageEvidenceTableV1;
}

/** Exhibits and source pamphlets retain independent per-camera geometry. */
export interface DebateStageEvidencePlacementsV10 {
  exhibit: DebateStageEvidenceTablesV10;
  source: DebateStageEvidenceTablesV10;
}

export interface DebateStageAlignmentV10 {
  version: typeof DEBATE_STAGE_ALIGNMENT_VERSION;
  wide: DebateStageAlignmentWideV4;
  moderator: DebateStageRolePlacementV4;
  gavel: DebateStageGavelV3;
  evidenceTable: DebateStageEvidencePlacementsV10;
  lightBlendModes: DebateStageLightBlendModesV1;
  lightMaskOpacities: DebateStageLightMaskOpacitiesV1;
}

/** @deprecated Prefer DebateStageAlignmentV10 — kept as stable import aliases. */
export type DebateStageAlignmentV9 = DebateStageAlignmentV10;
export type DebateStageAlignmentV8 = DebateStageAlignmentV10;
export type DebateStageAlignmentV7 = DebateStageAlignmentV10;
export type DebateStageAlignmentV6 = DebateStageAlignmentV10;

export const DEBATE_STAGE_ALIGNMENT_ROLES: readonly DebateStageAlignmentRole[] =
  ["for", "moderator", "against"];
export const DEBATE_STAGE_ALIGNMENT_ITEMS: readonly DebateStageAlignmentItem[] =
  ["bot", "nameplate", "glyph"];

export const DEFAULT_DEBATE_STAGE_ALIGNMENT: DebateStageAlignmentV10 = {
  version: DEBATE_STAGE_ALIGNMENT_VERSION,
  wide: {
    for: {
      bot: { x: 0.01, y: -2 },
      nameplate: { x: 3, y: -4 },
      glyph: { x: 2.5, y: -6.5 },
    },
    moderator: {
      bot: { x: -0.02, y: -4 },
      nameplate: { x: -0.02, y: -11 },
      glyph: { x: 0, y: 1.5 },
    },
    against: {
      bot: { x: -0.03, y: -2 },
      nameplate: { x: -3, y: -4 },
      glyph: { x: -2.5, y: -6.5 },
    },
  },
  moderator: {
    bot: { x: -0.02, y: -1.5 },
    nameplate: { x: -0.02, y: -12 },
    glyph: { x: 0, y: 7 },
  },
  gavel: {
    lowered: { x: -138.5, y: 12.5, rotation: -131, size: 75 },
    raised: { x: -130.5, y: -4.5, rotation: -77, size: 90 },
  },
  evidenceTable: {
    exhibit: {
      wide: { x: 0, y: 111.5, size: 100 },
      left: { x: 0, y: 111.5, size: 100 },
      moderator: { x: 0, y: 174, size: 220 },
      right: { x: 0, y: 111.5, size: 100 },
    },
    source: {
      wide: { x: 0, y: 111.5, size: 100 },
      left: { x: 0, y: 174, size: 220 },
      moderator: { x: 0, y: 174, size: 220 },
      right: { x: 0, y: 174, size: 220 },
    },
  },
  lightBlendModes: {
    dark: "hard-light",
    light: "color",
  },
  lightMaskOpacities: {
    dark: 100,
    light: 100,
  },
};

function normalizedNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.max(min, Math.min(max, numeric)) * 100) / 100;
}

function normalizedOffset(value: unknown, fallback: number): number {
  return normalizedNumber(
    value,
    DEBATE_STAGE_ALIGNMENT_MIN,
    DEBATE_STAGE_ALIGNMENT_MAX,
    fallback,
  );
}

function normalizedGavelSize(value: unknown, fallback: number): number {
  return normalizedNumber(
    value,
    DEBATE_STAGE_GAVEL_SIZE_MIN,
    DEBATE_STAGE_GAVEL_SIZE_MAX,
    fallback,
  );
}

function normalizedGavelPosition(value: unknown, fallback: number): number {
  return normalizedNumber(
    value,
    DEBATE_STAGE_GAVEL_POSITION_MIN,
    DEBATE_STAGE_GAVEL_POSITION_MAX,
    fallback,
  );
}

function normalizedGavelRotation(value: unknown, fallback: number): number {
  return normalizedNumber(
    value,
    DEBATE_STAGE_GAVEL_ROTATION_MIN,
    DEBATE_STAGE_GAVEL_ROTATION_MAX,
    fallback,
  );
}

function normalizedEvidenceTableSize(value: unknown, fallback: number): number {
  return normalizedNumber(
    value,
    DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
    DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MAX,
    fallback,
  );
}

function normalizedEvidenceTablePosition(
  value: unknown,
  fallback: number,
): number {
  return normalizedNumber(
    value,
    DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
    DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
    fallback,
  );
}

function normalizedLightMaskOpacity(value: unknown): number {
  return normalizedNumber(
    value,
    DEBATE_STAGE_LIGHT_MASK_OPACITY_MIN,
    DEBATE_STAGE_LIGHT_MASK_OPACITY_MAX,
    100,
  );
}

function offsetCandidate(value: unknown): Partial<DebateStageOffsetV1> {
  return typeof value === "object" && value !== null
    ? (value as Partial<DebateStageOffsetV1>)
    : {};
}

function normalizeStageOffset(
  value: unknown,
  fallback: DebateStageOffsetV1,
): DebateStageOffsetV1 {
  const candidate = offsetCandidate(value);
  return {
    x: normalizedOffset(candidate.x, fallback.x),
    y: normalizedOffset(candidate.y, fallback.y),
  };
}

function normalizeGavelPose(
  value: unknown,
  fallback: DebateStageGavelPoseV3,
): DebateStageGavelPoseV3 {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    x: normalizedGavelPosition(candidate.x, fallback.x),
    y: normalizedGavelPosition(candidate.y, fallback.y),
    rotation: normalizedGavelRotation(candidate.rotation, fallback.rotation),
    size: normalizedGavelSize(candidate.size, fallback.size),
  };
}

function normalizeEvidenceTable(
  value: unknown,
  fallback: DebateStageEvidenceTableV1,
): DebateStageEvidenceTableV1 {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    x: normalizedEvidenceTablePosition(candidate.x, fallback.x),
    y: normalizedEvidenceTablePosition(candidate.y, fallback.y),
    size: normalizedEvidenceTableSize(candidate.size, fallback.size),
  };
}

function isLegacyFlatEvidenceTable(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    ("x" in candidate || "y" in candidate || "size" in candidate) &&
    !("wide" in candidate) &&
    !("moderator" in candidate)
  );
}

function normalizeEvidenceTables(
  value: unknown,
  fallback: DebateStageEvidenceTablesV10,
  legacyCloseupView: "wide" | "moderator",
): DebateStageEvidenceTablesV10 {
  if (isLegacyFlatEvidenceTable(value)) {
    const shared = normalizeEvidenceTable(value, fallback.wide);
    return {
      wide: shared,
      left: { ...shared },
      moderator: { ...shared },
      right: { ...shared },
    };
  }
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const wide = normalizeEvidenceTable(candidate.wide, fallback.wide);
  const moderator = normalizeEvidenceTable(
    candidate.moderator,
    fallback.moderator,
  );
  const legacyCloseup = legacyCloseupView === "moderator" ? moderator : wide;
  return {
    wide,
    left: normalizeEvidenceTable(candidate.left, legacyCloseup),
    moderator,
    right: normalizeEvidenceTable(candidate.right, legacyCloseup),
  };
}

function hasEvidenceKinds(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return "exhibit" in candidate || "source" in candidate;
}

function normalizeEvidencePlacements(
  value: unknown,
  fallback: DebateStageEvidencePlacementsV10,
): DebateStageEvidencePlacementsV10 {
  if (!hasEvidenceKinds(value)) {
    return {
      exhibit: normalizeEvidenceTables(value, fallback.exhibit, "wide"),
      source: normalizeEvidenceTables(value, fallback.source, "moderator"),
    };
  }
  const candidate = value as Record<string, unknown>;
  return {
    exhibit: normalizeEvidenceTables(
      candidate.exhibit,
      fallback.exhibit,
      "wide",
    ),
    source: normalizeEvidenceTables(
      candidate.source,
      fallback.source,
      "moderator",
    ),
  };
}

function hasNestedPlacement(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return DEBATE_STAGE_ALIGNMENT_ITEMS.some((item) => item in candidate);
}

function hasFlatOffset(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return "x" in candidate || "y" in candidate;
}

function normalizeStagePlacement(
  value: unknown,
  fallback: DebateStageRolePlacementV4,
  legacyNameplateOffset: unknown = value,
): DebateStageRolePlacementV4 {
  if (!hasNestedPlacement(value)) {
    if (!hasFlatOffset(value) && !hasFlatOffset(legacyNameplateOffset)) {
      return {
        bot: normalizeStageOffset(undefined, fallback.bot),
        nameplate: normalizeStageOffset(undefined, fallback.nameplate),
        glyph: normalizeStageOffset(undefined, fallback.glyph),
      };
    }
    const legacyFallback = { x: 0, y: 0 };
    return {
      bot: normalizeStageOffset(value, legacyFallback),
      nameplate: normalizeStageOffset(legacyNameplateOffset, legacyFallback),
      glyph: { x: 0, y: 0 },
    };
  }
  const candidate = value as Partial<Record<DebateStageAlignmentItem, unknown>>;
  return {
    bot: normalizeStageOffset(candidate.bot, fallback.bot),
    nameplate: normalizeStageOffset(candidate.nameplate, fallback.nameplate),
    glyph: normalizeStageOffset(candidate.glyph, fallback.glyph),
  };
}

function normalizeLightBlendMode(
  value: unknown,
  fallback: DebateStageLightBlendMode,
): DebateStageLightBlendMode {
  return DEBATE_STAGE_LIGHT_BLEND_MODES.includes(
    value as DebateStageLightBlendMode,
  )
    ? (value as DebateStageLightBlendMode)
    : fallback;
}

export function normalizeDebateStageAlignment(
  value: unknown,
): DebateStageAlignmentV6 {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const nestedWide =
    typeof candidate.wide === "object" && candidate.wide !== null
      ? (candidate.wide as Record<string, unknown>)
      : null;
  const wideCandidate = nestedWide ?? candidate;
  const legacyModerator = wideCandidate.moderator;
  const lightBlendModes =
    typeof candidate.lightBlendModes === "object" &&
    candidate.lightBlendModes !== null
      ? (candidate.lightBlendModes as Record<string, unknown>)
      : {};
  const gavel =
    typeof candidate.gavel === "object" && candidate.gavel !== null
      ? (candidate.gavel as Record<string, unknown>)
      : {};
  const hasLegacyFlatGavel = ["x", "y", "rotation", "size"].some(
    (key) => key in gavel,
  );
  const legacySharedGavelSize = normalizedGavelSize(gavel.size, 100);
  const legacyLowered = normalizeGavelPose(gavel, {
    x: 0,
    y: 0,
    rotation: 0,
    size: legacySharedGavelSize,
  });
  const legacyRaised: DebateStageGavelPoseV3 = {
    x: normalizedGavelPosition(legacyLowered.x + 8, 8),
    y: normalizedGavelPosition(legacyLowered.y - 24, -24),
    rotation: 0,
    size: legacySharedGavelSize,
  };
  const loweredFallback = hasLegacyFlatGavel
    ? legacyLowered
    : DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel.lowered;
  const raisedFallback = hasLegacyFlatGavel
    ? legacyRaised
    : DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel.raised;
  const lightMaskOpacities =
    typeof candidate.lightMaskOpacities === "object" &&
    candidate.lightMaskOpacities !== null
      ? (candidate.lightMaskOpacities as Record<string, unknown>)
      : {};
  return {
    version: DEBATE_STAGE_ALIGNMENT_VERSION,
    wide: {
      for: normalizeStagePlacement(
        wideCandidate.for,
        DEFAULT_DEBATE_STAGE_ALIGNMENT.wide.for,
      ),
      moderator: normalizeStagePlacement(
        legacyModerator,
        DEFAULT_DEBATE_STAGE_ALIGNMENT.wide.moderator,
      ),
      against: normalizeStagePlacement(
        wideCandidate.against,
        DEFAULT_DEBATE_STAGE_ALIGNMENT.wide.against,
      ),
    },
    moderator: normalizeStagePlacement(
      nestedWide ? candidate.moderator : legacyModerator,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.moderator,
    ),
    gavel: {
      lowered: normalizeGavelPose(gavel.lowered, loweredFallback),
      raised: normalizeGavelPose(gavel.raised, raisedFallback),
    },
    evidenceTable: normalizeEvidencePlacements(
      candidate.evidenceTable,
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable,
    ),
    lightBlendModes: {
      dark: normalizeLightBlendMode(
        lightBlendModes.dark,
        DEFAULT_DEBATE_STAGE_ALIGNMENT.lightBlendModes.dark,
      ),
      light: normalizeLightBlendMode(
        lightBlendModes.light,
        DEFAULT_DEBATE_STAGE_ALIGNMENT.lightBlendModes.light,
      ),
    },
    lightMaskOpacities: {
      dark: normalizedLightMaskOpacity(lightMaskOpacities.dark),
      light: normalizedLightMaskOpacity(lightMaskOpacities.light),
    },
  };
}

export function copyDebateStageAlignment(
  alignment: DebateStageAlignmentV6,
): DebateStageAlignmentV6 {
  return normalizeDebateStageAlignment(alignment);
}

export function debateStageAlignmentTarget(
  role: DebateStageAlignmentRole,
  item: DebateStageAlignmentItem,
  view: DebateStageAlignmentView,
): DebateStageAlignmentTarget {
  return view === "moderator" && role === "moderator"
    ? `moderatorView:${item}`
    : `${role}:${item}`;
}

function debateStageAlignmentTargetParts(target: DebateStageAlignmentTarget): {
  role: DebateStageAlignmentRole;
  item: DebateStageAlignmentItem;
  view: DebateStageAlignmentView;
} {
  const [roleOrView, item] = target.split(":") as [
    DebateStageAlignmentRole | "moderatorView",
    DebateStageAlignmentItem,
  ];
  return {
    role: roleOrView === "moderatorView" ? "moderator" : roleOrView,
    item,
    view: roleOrView === "moderatorView" ? "moderator" : "wide",
  };
}

export function debateStageAlignmentOffset(
  alignment: DebateStageAlignmentV6,
  target: DebateStageAlignmentTarget,
): DebateStageOffsetV1 {
  const { role, item, view } = debateStageAlignmentTargetParts(target);
  return view === "moderator"
    ? alignment.moderator[item]
    : alignment.wide[role][item];
}

export function updateDebateStageAlignmentOffset(
  alignment: DebateStageAlignmentV6,
  target: DebateStageAlignmentTarget,
  update: Partial<DebateStageOffsetV1>,
): DebateStageAlignmentV6 {
  const { role, item, view } = debateStageAlignmentTargetParts(target);
  if (view === "moderator") {
    return normalizeDebateStageAlignment({
      ...alignment,
      moderator: {
        ...alignment.moderator,
        [item]: { ...alignment.moderator[item], ...update },
      },
    });
  }
  return normalizeDebateStageAlignment({
    ...alignment,
    wide: {
      ...alignment.wide,
      [role]: {
        ...alignment.wide[role],
        [item]: { ...alignment.wide[role][item], ...update },
      },
    },
  });
}

export function updateDebateStageLightBlendMode(
  alignment: DebateStageAlignmentV6,
  theme: "light" | "dark",
  blendMode: DebateStageLightBlendMode,
): DebateStageAlignmentV6 {
  return normalizeDebateStageAlignment({
    ...alignment,
    lightBlendModes: {
      ...alignment.lightBlendModes,
      [theme]: blendMode,
    },
  });
}

export function updateDebateStageLightMaskOpacity(
  alignment: DebateStageAlignmentV6,
  theme: "light" | "dark",
  opacity: number,
): DebateStageAlignmentV6 {
  return normalizeDebateStageAlignment({
    ...alignment,
    lightMaskOpacities: {
      ...alignment.lightMaskOpacities,
      [theme]: opacity,
    },
  });
}

export function updateDebateStageGavelPose(
  alignment: DebateStageAlignmentV6,
  pose: "lowered" | "raised",
  update: Partial<DebateStageGavelPoseV3>,
  linkPoses = false,
): DebateStageAlignmentV6 {
  const normalized = normalizeDebateStageAlignment(alignment);
  if (linkPoses) {
    const otherPose = pose === "lowered" ? "raised" : "lowered";
    const linkedUpdate: Partial<DebateStageGavelPoseV3> = {};
    for (const key of ["x", "y", "rotation", "size"] as const) {
      if (update[key] === undefined) continue;
      linkedUpdate[key] =
        normalized.gavel[otherPose][key] +
        update[key] -
        normalized.gavel[pose][key];
    }
    return normalizeDebateStageAlignment({
      ...normalized,
      gavel: {
        ...normalized.gavel,
        [pose]: {
          ...normalized.gavel[pose],
          ...update,
        },
        [otherPose]: {
          ...normalized.gavel[otherPose],
          ...linkedUpdate,
        },
      },
    });
  }
  return normalizeDebateStageAlignment({
    ...normalized,
    gavel: {
      ...normalized.gavel,
      [pose]: {
        ...normalized.gavel[pose],
        ...update,
      },
    },
  });
}

export function updateDebateStageEvidenceTable(
  alignment: DebateStageAlignmentV6,
  evidenceKind: DebateStageEvidenceKind,
  view: DebateStageEvidenceView,
  update: Partial<DebateStageEvidenceTableV1>,
): DebateStageAlignmentV6 {
  const normalized = normalizeDebateStageAlignment(alignment);
  return normalizeDebateStageAlignment({
    ...normalized,
    evidenceTable: {
      ...normalized.evidenceTable,
      [evidenceKind]: {
        ...normalized.evidenceTable[evidenceKind],
        [view]: {
          ...normalized.evidenceTable[evidenceKind][view],
          ...update,
        },
      },
    },
  });
}

export function debateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v10:${scopeId}`;
}

function v9DebateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v9:${scopeId}`;
}

function v8DebateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v8:${scopeId}`;
}

function v7DebateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v7:${scopeId}`;
}

function v6DebateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v6:${scopeId}`;
}

function v5DebateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v5:${scopeId}`;
}

function v4DebateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v4:${scopeId}`;
}

function v3DebateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v3:${scopeId}`;
}

function v2DebateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v2:${scopeId}`;
}

function legacyDebateStageAlignmentStorageKey(scopeId: string): string {
  return `prism_debate_stage_alignment_v1:${scopeId}`;
}

export function readDebateStageAlignment(
  storage: Pick<Storage, "getItem">,
  scopeId: string,
): DebateStageAlignmentV6 {
  try {
    const serialized =
      storage.getItem(debateStageAlignmentStorageKey(scopeId)) ??
      storage.getItem(v9DebateStageAlignmentStorageKey(scopeId)) ??
      storage.getItem(v8DebateStageAlignmentStorageKey(scopeId)) ??
      storage.getItem(v7DebateStageAlignmentStorageKey(scopeId)) ??
      storage.getItem(v6DebateStageAlignmentStorageKey(scopeId)) ??
      storage.getItem(v5DebateStageAlignmentStorageKey(scopeId)) ??
      storage.getItem(v4DebateStageAlignmentStorageKey(scopeId)) ??
      storage.getItem(v3DebateStageAlignmentStorageKey(scopeId)) ??
      storage.getItem(v2DebateStageAlignmentStorageKey(scopeId)) ??
      storage.getItem(legacyDebateStageAlignmentStorageKey(scopeId));
    return serialized
      ? normalizeDebateStageAlignment(JSON.parse(serialized) as unknown)
      : copyDebateStageAlignment(DEFAULT_DEBATE_STAGE_ALIGNMENT);
  } catch {
    return copyDebateStageAlignment(DEFAULT_DEBATE_STAGE_ALIGNMENT);
  }
}

export function writeDebateStageAlignment(
  storage: Pick<Storage, "setItem">,
  scopeId: string,
  alignment: DebateStageAlignmentV6,
): void {
  storage.setItem(
    debateStageAlignmentStorageKey(scopeId),
    JSON.stringify(normalizeDebateStageAlignment(alignment)),
  );
}

export function debateStageAlignmentStyle(
  alignment: DebateStageAlignmentV6,
): CSSProperties {
  const normalized = normalizeDebateStageAlignment(alignment);
  return {
    "--debate-for-offset-x": `${normalized.wide.for.bot.x}%`,
    "--debate-for-offset-y": `${normalized.wide.for.bot.y}%`,
    "--debate-for-nameplate-offset-x": `${normalized.wide.for.nameplate.x}%`,
    "--debate-for-nameplate-offset-y": `${normalized.wide.for.nameplate.y}%`,
    "--debate-for-glyph-offset-x": `${normalized.wide.for.glyph.x}%`,
    "--debate-for-glyph-offset-y": `${normalized.wide.for.glyph.y}%`,
    "--debate-moderator-offset-x": `${normalized.wide.moderator.bot.x}%`,
    "--debate-moderator-offset-y": `${normalized.wide.moderator.bot.y}%`,
    "--debate-moderator-nameplate-offset-x": `${normalized.wide.moderator.nameplate.x}%`,
    "--debate-moderator-nameplate-offset-y": `${normalized.wide.moderator.nameplate.y}%`,
    "--debate-moderator-glyph-offset-x": `${normalized.wide.moderator.glyph.x}%`,
    "--debate-moderator-glyph-offset-y": `${normalized.wide.moderator.glyph.y}%`,
    "--debate-against-offset-x": `${normalized.wide.against.bot.x}%`,
    "--debate-against-offset-y": `${normalized.wide.against.bot.y}%`,
    "--debate-against-nameplate-offset-x": `${normalized.wide.against.nameplate.x}%`,
    "--debate-against-nameplate-offset-y": `${normalized.wide.against.nameplate.y}%`,
    "--debate-against-glyph-offset-x": `${normalized.wide.against.glyph.x}%`,
    "--debate-against-glyph-offset-y": `${normalized.wide.against.glyph.y}%`,
    "--debate-moderator-view-offset-x": `${normalized.moderator.bot.x}%`,
    "--debate-moderator-view-offset-y": `${normalized.moderator.bot.y}%`,
    "--debate-moderator-view-nameplate-offset-x": `${normalized.moderator.nameplate.x}%`,
    "--debate-moderator-view-nameplate-offset-y": `${normalized.moderator.nameplate.y}%`,
    "--debate-moderator-view-glyph-offset-x": `${normalized.moderator.glyph.x}%`,
    "--debate-moderator-view-glyph-offset-y": `${normalized.moderator.glyph.y}%`,
    "--debate-gavel-lowered-offset-x": `${normalized.gavel.lowered.x}%`,
    "--debate-gavel-lowered-offset-y": `${normalized.gavel.lowered.y}%`,
    "--debate-gavel-lowered-rotation": `${normalized.gavel.lowered.rotation}deg`,
    "--debate-gavel-lowered-scale": `${normalized.gavel.lowered.size / 100}`,
    "--debate-gavel-raised-offset-x": `${normalized.gavel.raised.x}%`,
    "--debate-gavel-raised-offset-y": `${normalized.gavel.raised.y}%`,
    "--debate-gavel-raised-rotation": `${normalized.gavel.raised.rotation}deg`,
    "--debate-gavel-raised-scale": `${normalized.gavel.raised.size / 100}`,
    "--debate-evidence-offset-x": `${normalized.evidenceTable.exhibit.wide.x}%`,
    "--debate-evidence-offset-y": `${normalized.evidenceTable.exhibit.wide.y}%`,
    "--debate-evidence-scale": `${normalized.evidenceTable.exhibit.wide.size / 100}`,
    "--debate-left-evidence-offset-x": `${normalized.evidenceTable.exhibit.left.x}%`,
    "--debate-left-evidence-offset-y": `${normalized.evidenceTable.exhibit.left.y}%`,
    "--debate-left-evidence-scale": `${normalized.evidenceTable.exhibit.left.size / 100}`,
    "--debate-moderator-evidence-offset-x": `${normalized.evidenceTable.exhibit.moderator.x}%`,
    "--debate-moderator-evidence-offset-y": `${normalized.evidenceTable.exhibit.moderator.y}%`,
    "--debate-moderator-evidence-scale": `${normalized.evidenceTable.exhibit.moderator.size / 100}`,
    "--debate-right-evidence-offset-x": `${normalized.evidenceTable.exhibit.right.x}%`,
    "--debate-right-evidence-offset-y": `${normalized.evidenceTable.exhibit.right.y}%`,
    "--debate-right-evidence-scale": `${normalized.evidenceTable.exhibit.right.size / 100}`,
    "--debate-source-evidence-offset-x": `${normalized.evidenceTable.source.wide.x}%`,
    "--debate-source-evidence-offset-y": `${normalized.evidenceTable.source.wide.y}%`,
    "--debate-source-evidence-scale": `${normalized.evidenceTable.source.wide.size / 100}`,
    "--debate-left-source-evidence-offset-x": `${normalized.evidenceTable.source.left.x}%`,
    "--debate-left-source-evidence-offset-y": `${normalized.evidenceTable.source.left.y}%`,
    "--debate-left-source-evidence-scale": `${normalized.evidenceTable.source.left.size / 100}`,
    "--debate-moderator-source-evidence-offset-x": `${normalized.evidenceTable.source.moderator.x}%`,
    "--debate-moderator-source-evidence-offset-y": `${normalized.evidenceTable.source.moderator.y}%`,
    "--debate-moderator-source-evidence-scale": `${normalized.evidenceTable.source.moderator.size / 100}`,
    "--debate-right-source-evidence-offset-x": `${normalized.evidenceTable.source.right.x}%`,
    "--debate-right-source-evidence-offset-y": `${normalized.evidenceTable.source.right.y}%`,
    "--debate-right-source-evidence-scale": `${normalized.evidenceTable.source.right.size / 100}`,
    "--debate-light-blend-mode-dark": normalized.lightBlendModes.dark,
    "--debate-light-blend-mode-light": normalized.lightBlendModes.light,
    "--debate-light-mask-opacity-dark": `${normalized.lightMaskOpacities.dark}%`,
    "--debate-light-mask-opacity-light": `${normalized.lightMaskOpacities.light}%`,
    "--debate-light-mask-opacity-dark-factor": `${normalized.lightMaskOpacities.dark / 100}`,
    "--debate-light-mask-opacity-light-factor": `${normalized.lightMaskOpacities.light / 100}`,
  } as CSSProperties;
}

export function formatDebateStageAlignmentClipboard(
  alignment: DebateStageAlignmentV6,
): string {
  return JSON.stringify(normalizeDebateStageAlignment(alignment), null, 2);
}

export function formatDebateStageGavelClipboard(
  gavel: DebateStageGavelV3,
): string {
  return JSON.stringify(
    normalizeDebateStageAlignment({ gavel }).gavel,
    null,
    2,
  );
}

export function formatDebateStageEvidenceTableClipboard(
  evidenceTable:
    | DebateStageEvidencePlacementsV10
    | DebateStageEvidenceTablesV10
    | DebateStageEvidenceTableV1,
): string {
  return JSON.stringify(
    normalizeDebateStageAlignment({ evidenceTable }).evidenceTable,
    null,
    2,
  );
}
