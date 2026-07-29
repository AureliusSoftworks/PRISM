import type { CSSProperties } from "react";

export const DEBATE_STAGE_ALIGNMENT_VERSION = 3 as const;
export const DEBATE_STAGE_ALIGNMENT_MIN = -12;
export const DEBATE_STAGE_ALIGNMENT_MAX = 12;
export const DEBATE_STAGE_ALIGNMENT_STEP = 0.5;

export type DebateStageAlignmentRole = "for" | "moderator" | "against";
export type DebateStageAlignmentItem = "bot" | "nameplate" | "glyph";
export type DebateStageAlignmentView = "wide" | "moderator";
export type DebateStageAlignmentTarget =
  | `${DebateStageAlignmentRole}:${DebateStageAlignmentItem}`
  | `moderatorView:${DebateStageAlignmentItem}`;

export interface DebateStageOffsetV1 {
  x: number;
  y: number;
}

export interface DebateStageRolePlacementV3 {
  bot: DebateStageOffsetV1;
  nameplate: DebateStageOffsetV1;
  glyph: DebateStageOffsetV1;
}

export interface DebateStageAlignmentWideV3 {
  for: DebateStageRolePlacementV3;
  moderator: DebateStageRolePlacementV3;
  against: DebateStageRolePlacementV3;
}

export interface DebateStageAlignmentV3 {
  version: typeof DEBATE_STAGE_ALIGNMENT_VERSION;
  wide: DebateStageAlignmentWideV3;
  moderator: DebateStageRolePlacementV3;
}

export const DEBATE_STAGE_ALIGNMENT_ROLES: readonly DebateStageAlignmentRole[] =
  ["for", "moderator", "against"];
export const DEBATE_STAGE_ALIGNMENT_ITEMS: readonly DebateStageAlignmentItem[] =
  ["bot", "nameplate", "glyph"];

function defaultPlacement(): DebateStageRolePlacementV3 {
  return {
    bot: { x: 0, y: 0 },
    nameplate: { x: 0, y: 0 },
    glyph: { x: 0, y: 0 },
  };
}

export const DEFAULT_DEBATE_STAGE_ALIGNMENT: DebateStageAlignmentV3 = {
  version: DEBATE_STAGE_ALIGNMENT_VERSION,
  wide: {
    for: defaultPlacement(),
    moderator: defaultPlacement(),
    against: defaultPlacement(),
  },
  moderator: defaultPlacement(),
};

function normalizedOffset(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return (
    Math.round(
      Math.max(
        DEBATE_STAGE_ALIGNMENT_MIN,
        Math.min(DEBATE_STAGE_ALIGNMENT_MAX, numeric),
      ) * 100,
    ) / 100
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
): DebateStageRolePlacementV3 {
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

export function normalizeDebateStageAlignment(
  value: unknown,
): DebateStageAlignmentV3 {
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
  };
}

export function copyDebateStageAlignment(
  alignment: DebateStageAlignmentV3,
): DebateStageAlignmentV3 {
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
  alignment: DebateStageAlignmentV3,
  target: DebateStageAlignmentTarget,
): DebateStageOffsetV1 {
  const { role, item, view } = debateStageAlignmentTargetParts(target);
  return view === "moderator"
    ? alignment.moderator[item]
    : alignment.wide[role][item];
}

export function updateDebateStageAlignmentOffset(
  alignment: DebateStageAlignmentV3,
  target: DebateStageAlignmentTarget,
  update: Partial<DebateStageOffsetV1>,
): DebateStageAlignmentV3 {
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

export function debateStageAlignmentStorageKey(scopeId: string): string {
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
): DebateStageAlignmentV3 {
  try {
    const serialized =
      storage.getItem(debateStageAlignmentStorageKey(scopeId)) ??
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
  alignment: DebateStageAlignmentV3,
): void {
  storage.setItem(
    debateStageAlignmentStorageKey(scopeId),
    JSON.stringify(normalizeDebateStageAlignment(alignment)),
  );
}

export function debateStageAlignmentStyle(
  alignment: DebateStageAlignmentV3,
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
  } as CSSProperties;
}

export function formatDebateStageAlignmentClipboard(
  alignment: DebateStageAlignmentV3,
): string {
  return JSON.stringify(normalizeDebateStageAlignment(alignment), null, 2);
}
