export const DEBATE_FLYTING_STAGE_ALIGNMENT_VERSION = 1 as const;

export type DebateFlytingStageAlignmentView = "wide" | "moderator" | "gallery";

export type DebateFlytingStageRehearsalView = Exclude<
  DebateFlytingStageAlignmentView,
  "gallery"
>;

export type DebateFlytingStageAlignmentItem =
  | "wideForBot"
  | "wideForHelmet"
  | "wideForNameplate"
  | "wideForHeraldry"
  | "wideModeratorBot"
  | "wideModeratorHelmet"
  | "wideModeratorNameplate"
  | "wideModeratorHeraldry"
  | "wideAgainstBot"
  | "wideAgainstHelmet"
  | "wideAgainstNameplate"
  | "wideAgainstHeraldry"
  | "moderatorForHeraldry"
  | "moderatorModeratorBot"
  | "moderatorModeratorHelmet"
  | "moderatorModeratorNameplate"
  | "moderatorModeratorHeraldry"
  | "moderatorAgainstHeraldry"
  | "galleryForRugGlyph"
  | "galleryAgainstRugGlyph";

export interface DebateFlytingStagePlacementV1 {
  /** Percentage offset from the authored element anchor. */
  x: number;
  /** Percentage offset from the authored element anchor. */
  y: number;
  /** Percent of the authored element size. */
  scale: number;
  /** Degrees added to the authored rotation. */
  rotation: number;
  /** Degrees added to the authored horizontal skew. */
  skewX: number;
}

export interface DebateFlytingStageAlignmentV1 {
  version: typeof DEBATE_FLYTING_STAGE_ALIGNMENT_VERSION;
  placements: Record<
    DebateFlytingStageAlignmentItem,
    DebateFlytingStagePlacementV1
  >;
}

export interface DebateFlytingStageAlignmentItemDefinition {
  id: DebateFlytingStageAlignmentItem;
  view: DebateFlytingStageAlignmentView;
  label: string;
  supportsRotation?: boolean;
  supportsSkew?: boolean;
}

export const DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS: readonly DebateFlytingStageAlignmentItemDefinition[] =
  [
    { id: "wideForBot", view: "wide", label: "Challenger bot" },
    {
      id: "wideForHelmet",
      view: "wide",
      label: "Challenger helmet",
      supportsRotation: true,
    },
    {
      id: "wideForNameplate",
      view: "wide",
      label: "Challenger nameplate",
    },
    {
      id: "wideForHeraldry",
      view: "wide",
      label: "Challenger banner glyph",
      supportsRotation: true,
    },
    { id: "wideModeratorBot", view: "wide", label: "Jarl bot" },
    {
      id: "wideModeratorHelmet",
      view: "wide",
      label: "Jarl helmet",
      supportsRotation: true,
    },
    {
      id: "wideModeratorNameplate",
      view: "wide",
      label: "Jarl nameplate",
    },
    {
      id: "wideModeratorHeraldry",
      view: "wide",
      label: "Jarl banner glyph",
      supportsRotation: true,
    },
    { id: "wideAgainstBot", view: "wide", label: "Defender bot" },
    {
      id: "wideAgainstHelmet",
      view: "wide",
      label: "Defender helmet",
      supportsRotation: true,
    },
    {
      id: "wideAgainstNameplate",
      view: "wide",
      label: "Defender nameplate",
    },
    {
      id: "wideAgainstHeraldry",
      view: "wide",
      label: "Defender banner glyph",
      supportsRotation: true,
    },
    {
      id: "moderatorForHeraldry",
      view: "moderator",
      label: "Challenger throne banner glyph",
      supportsRotation: true,
    },
    {
      id: "moderatorModeratorBot",
      view: "moderator",
      label: "Jarl throne bot",
    },
    {
      id: "moderatorModeratorHelmet",
      view: "moderator",
      label: "Jarl throne helmet",
      supportsRotation: true,
    },
    {
      id: "moderatorModeratorNameplate",
      view: "moderator",
      label: "Jarl throne nameplate",
    },
    {
      id: "moderatorModeratorHeraldry",
      view: "moderator",
      label: "Jarl throne banner glyph",
      supportsRotation: true,
    },
    {
      id: "moderatorAgainstHeraldry",
      view: "moderator",
      label: "Defender throne banner glyph",
      supportsRotation: true,
    },
    {
      id: "galleryForRugGlyph",
      view: "gallery",
      label: "Challenger rug glyph",
      supportsRotation: true,
      supportsSkew: true,
    },
    {
      id: "galleryAgainstRugGlyph",
      view: "gallery",
      label: "Defender rug glyph",
      supportsRotation: true,
      supportsSkew: true,
    },
  ];

export function debateFlytingStageRehearsalViewForItem(
  item: Pick<DebateFlytingStageAlignmentItemDefinition, "view">,
): DebateFlytingStageRehearsalView {
  return item.view === "gallery" ? "wide" : item.view;
}

export function debateFlytingStageRehearsalItems(
  view: DebateFlytingStageRehearsalView,
): readonly DebateFlytingStageAlignmentItemDefinition[] {
  return DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.filter(
    (item) => debateFlytingStageRehearsalViewForItem(item) === view,
  );
}

function defaultPlacement(): DebateFlytingStagePlacementV1 {
  return { x: 0, y: 0, scale: 100, rotation: 0, skewX: 0 };
}

export const DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT: DebateFlytingStageAlignmentV1 =
  {
    version: DEBATE_FLYTING_STAGE_ALIGNMENT_VERSION,
    placements: Object.fromEntries(
      DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.map((item) => [
        item.id,
        defaultPlacement(),
      ]),
    ) as Record<DebateFlytingStageAlignmentItem, DebateFlytingStagePlacementV1>,
  };

function normalizedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.max(minimum, Math.min(maximum, numeric)) * 100) / 100;
}

function normalizePlacement(value: unknown): DebateFlytingStagePlacementV1 {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    x: normalizedNumber(candidate.x, -100, 100, 0),
    y: normalizedNumber(candidate.y, -100, 100, 0),
    scale: normalizedNumber(candidate.scale, 25, 250, 100),
    rotation: normalizedNumber(candidate.rotation, -180, 180, 0),
    skewX: normalizedNumber(candidate.skewX, -60, 60, 0),
  };
}

export function normalizeDebateFlytingStageAlignment(
  value: unknown,
): DebateFlytingStageAlignmentV1 {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const placements =
    typeof candidate.placements === "object" && candidate.placements !== null
      ? (candidate.placements as Record<string, unknown>)
      : {};
  return {
    version: DEBATE_FLYTING_STAGE_ALIGNMENT_VERSION,
    placements: Object.fromEntries(
      DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.map((item) => [
        item.id,
        normalizePlacement(placements[item.id]),
      ]),
    ) as Record<DebateFlytingStageAlignmentItem, DebateFlytingStagePlacementV1>,
  };
}

export function copyDebateFlytingStageAlignment(
  alignment: DebateFlytingStageAlignmentV1,
): DebateFlytingStageAlignmentV1 {
  return normalizeDebateFlytingStageAlignment(alignment);
}

export function updateDebateFlytingStagePlacement(
  alignment: DebateFlytingStageAlignmentV1,
  item: DebateFlytingStageAlignmentItem,
  update: Partial<DebateFlytingStagePlacementV1>,
): DebateFlytingStageAlignmentV1 {
  const normalized = normalizeDebateFlytingStageAlignment(alignment);
  return normalizeDebateFlytingStageAlignment({
    ...normalized,
    placements: {
      ...normalized.placements,
      [item]: { ...normalized.placements[item], ...update },
    },
  });
}

export function formatDebateFlytingStageAlignmentClipboard(
  alignment: DebateFlytingStageAlignmentV1,
  rehearsal?: {
    galleryBotScale: number;
    galleryMaxVerticalRoam: number;
  },
): string {
  const lines = [
    "export const DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT: DebateFlytingStageAlignmentV1 =",
    `${JSON.stringify(normalizeDebateFlytingStageAlignment(alignment), null, 2)};`,
  ];
  if (rehearsal) {
    lines.push(
      "",
      "export const DEFAULT_DEBATE_FLYTING_STAGE_REHEARSAL_CONTROLS =",
      `${JSON.stringify(
        {
          galleryBotScale: normalizedNumber(
            rehearsal.galleryBotScale,
            60,
            160,
            100,
          ),
          galleryMaxVerticalRoam: normalizedNumber(
            rehearsal.galleryMaxVerticalRoam,
            0,
            30,
            12,
          ),
        },
        null,
        2,
      )} as const;`,
    );
  }
  return lines.join("\n");
}
