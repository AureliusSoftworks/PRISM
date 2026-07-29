import type { CSSProperties } from "react";

export const DEBATE_STAGE_ALIGNMENT_VERSION = 4 as const;
export const DEBATE_STAGE_ALIGNMENT_MIN = -12;
export const DEBATE_STAGE_ALIGNMENT_MAX = 12;
export const DEBATE_STAGE_ALIGNMENT_STEP = 0.5;
export const DEBATE_STAGE_GAVEL_SIZE_MIN = 50;
export const DEBATE_STAGE_GAVEL_SIZE_MAX = 200;
export const DEBATE_STAGE_GAVEL_SIZE_STEP = 5;
export const DEBATE_STAGE_LIGHT_MASK_OPACITY_MIN = 0;
export const DEBATE_STAGE_LIGHT_MASK_OPACITY_MAX = 100;
export const DEBATE_STAGE_LIGHT_MASK_OPACITY_STEP = 5;
export const DEBATE_STAGE_LIGHT_BLEND_MODES = ["screen", "overlay"] as const;

export type DebateStageAlignmentRole = "for" | "moderator" | "against";
export type DebateStageAlignmentItem = "bot" | "nameplate" | "glyph";
export type DebateStageAlignmentView = "wide" | "moderator";
export type DebateStageLightBlendMode =
  (typeof DEBATE_STAGE_LIGHT_BLEND_MODES)[number];
export type DebateStageAlignmentTarget =
  | `${DebateStageAlignmentRole}:${DebateStageAlignmentItem}`
  | `moderatorView:${DebateStageAlignmentItem}`;

export interface DebateStageOffsetV1 {
  x: number;
  y: number;
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

export interface DebateStageGavelV1 extends DebateStageOffsetV1 {
  size: number;
}

export interface DebateStageAlignmentV4 {
  version: typeof DEBATE_STAGE_ALIGNMENT_VERSION;
  wide: DebateStageAlignmentWideV4;
  moderator: DebateStageRolePlacementV4;
  gavel: DebateStageGavelV1;
  lightBlendModes: DebateStageLightBlendModesV1;
  lightMaskOpacities: DebateStageLightMaskOpacitiesV1;
}

export const DEBATE_STAGE_ALIGNMENT_ROLES: readonly DebateStageAlignmentRole[] =
  ["for", "moderator", "against"];
export const DEBATE_STAGE_ALIGNMENT_ITEMS: readonly DebateStageAlignmentItem[] =
  ["bot", "nameplate", "glyph"];

function defaultPlacement(): DebateStageRolePlacementV4 {
  return {
    bot: { x: 0, y: 0 },
    nameplate: { x: 0, y: 0 },
    glyph: { x: 0, y: 0 },
  };
}

export const DEFAULT_DEBATE_STAGE_ALIGNMENT: DebateStageAlignmentV4 = {
  version: DEBATE_STAGE_ALIGNMENT_VERSION,
  wide: {
    for: defaultPlacement(),
    moderator: defaultPlacement(),
    against: defaultPlacement(),
  },
  moderator: defaultPlacement(),
  gavel: {
    x: 0,
    y: 0,
    size: 100,
  },
  lightBlendModes: {
    dark: "screen",
    light: "overlay",
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

function normalizedOffset(value: unknown): number {
  return normalizedNumber(
    value,
    DEBATE_STAGE_ALIGNMENT_MIN,
    DEBATE_STAGE_ALIGNMENT_MAX,
    0,
  );
}

function normalizedGavelSize(value: unknown): number {
  return normalizedNumber(
    value,
    DEBATE_STAGE_GAVEL_SIZE_MIN,
    DEBATE_STAGE_GAVEL_SIZE_MAX,
    100,
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

function normalizeStageOffset(value: unknown): DebateStageOffsetV1 {
  const candidate = offsetCandidate(value);
  return {
    x: normalizedOffset(candidate.x),
    y: normalizedOffset(candidate.y),
  };
}

function hasNestedPlacement(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return DEBATE_STAGE_ALIGNMENT_ITEMS.some((item) => item in candidate);
}

function normalizeStagePlacement(
  value: unknown,
  legacyNameplateOffset: unknown = value,
): DebateStageRolePlacementV4 {
  if (!hasNestedPlacement(value)) {
    return {
      bot: normalizeStageOffset(value),
      nameplate: normalizeStageOffset(legacyNameplateOffset),
      glyph: { x: 0, y: 0 },
    };
  }
  const candidate = value as Partial<Record<DebateStageAlignmentItem, unknown>>;
  return {
    bot: normalizeStageOffset(candidate.bot),
    nameplate: normalizeStageOffset(candidate.nameplate),
    glyph: normalizeStageOffset(candidate.glyph),
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
): DebateStageAlignmentV4 {
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
  const lightMaskOpacities =
    typeof candidate.lightMaskOpacities === "object" &&
    candidate.lightMaskOpacities !== null
      ? (candidate.lightMaskOpacities as Record<string, unknown>)
      : {};
  return {
    version: DEBATE_STAGE_ALIGNMENT_VERSION,
    wide: {
      for: normalizeStagePlacement(wideCandidate.for),
      moderator: normalizeStagePlacement(legacyModerator),
      against: normalizeStagePlacement(wideCandidate.against),
    },
    moderator: normalizeStagePlacement(
      nestedWide ? candidate.moderator : legacyModerator,
    ),
    gavel: {
      ...normalizeStageOffset(gavel),
      size: normalizedGavelSize(gavel.size),
    },
    lightBlendModes: {
      dark: normalizeLightBlendMode(lightBlendModes.dark, "screen"),
      light: normalizeLightBlendMode(lightBlendModes.light, "overlay"),
    },
    lightMaskOpacities: {
      dark: normalizedLightMaskOpacity(lightMaskOpacities.dark),
      light: normalizedLightMaskOpacity(lightMaskOpacities.light),
    },
  };
}

export function copyDebateStageAlignment(
  alignment: DebateStageAlignmentV4,
): DebateStageAlignmentV4 {
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
  alignment: DebateStageAlignmentV4,
  target: DebateStageAlignmentTarget,
): DebateStageOffsetV1 {
  const { role, item, view } = debateStageAlignmentTargetParts(target);
  return view === "moderator"
    ? alignment.moderator[item]
    : alignment.wide[role][item];
}

export function updateDebateStageAlignmentOffset(
  alignment: DebateStageAlignmentV4,
  target: DebateStageAlignmentTarget,
  update: Partial<DebateStageOffsetV1>,
): DebateStageAlignmentV4 {
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
  alignment: DebateStageAlignmentV4,
  theme: "light" | "dark",
  blendMode: DebateStageLightBlendMode,
): DebateStageAlignmentV4 {
  return normalizeDebateStageAlignment({
    ...alignment,
    lightBlendModes: {
      ...alignment.lightBlendModes,
      [theme]: blendMode,
    },
  });
}

export function updateDebateStageLightMaskOpacity(
  alignment: DebateStageAlignmentV4,
  theme: "light" | "dark",
  opacity: number,
): DebateStageAlignmentV4 {
  return normalizeDebateStageAlignment({
    ...alignment,
    lightMaskOpacities: {
      ...alignment.lightMaskOpacities,
      [theme]: opacity,
    },
  });
}

export function updateDebateStageGavel(
  alignment: DebateStageAlignmentV4,
  update: Partial<DebateStageGavelV1>,
): DebateStageAlignmentV4 {
  return normalizeDebateStageAlignment({
    ...alignment,
    gavel: {
      ...alignment.gavel,
      ...update,
    },
  });
}

export function debateStageAlignmentStorageKey(scopeId: string): string {
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
): DebateStageAlignmentV4 {
  try {
    const serialized =
      storage.getItem(debateStageAlignmentStorageKey(scopeId)) ??
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
  alignment: DebateStageAlignmentV4,
): void {
  storage.setItem(
    debateStageAlignmentStorageKey(scopeId),
    JSON.stringify(normalizeDebateStageAlignment(alignment)),
  );
}

export function debateStageAlignmentStyle(
  alignment: DebateStageAlignmentV4,
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
    "--debate-gavel-offset-x": `${normalized.gavel.x}%`,
    "--debate-gavel-offset-y": `${normalized.gavel.y}%`,
    "--debate-gavel-scale": `${normalized.gavel.size / 100}`,
    "--debate-light-blend-mode-dark": normalized.lightBlendModes.dark,
    "--debate-light-blend-mode-light": normalized.lightBlendModes.light,
    "--debate-light-mask-opacity-dark": `${normalized.lightMaskOpacities.dark}%`,
    "--debate-light-mask-opacity-light": `${normalized.lightMaskOpacities.light}%`,
  } as CSSProperties;
}

export function formatDebateStageAlignmentClipboard(
  alignment: DebateStageAlignmentV4,
): string {
  return JSON.stringify(normalizeDebateStageAlignment(alignment), null, 2);
}
