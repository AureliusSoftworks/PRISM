export const DEBATE_FLYTING_STAGE_ALIGNMENT_VERSION = 1 as const;

/** Forge epithets may already contain the name; never print it twice. */
export function debateFlytingNameplate(name: string, epithet?: string | null): string {
  const title = epithet?.trim();
  const identity = name.trim();
  if (!title) return identity;
  const words = (value: string) => value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? value;
  const normalizedTitle = ` ${words(title)} `;
  const normalizedName = ` ${words(identity)} `;
  return !identity || normalizedTitle.includes(normalizedName)
    ? title
    : `${identity}, ${title}`;
}

/** Both camera renderers turn the complete face/Ink plane, never one feature. */
export function debateFlytingStageFacing(
  role: "for" | "against" | "moderator",
  floorSide: "for" | "against" | null = null,
): "left" | "right" {
  return role === "against" || (role === "moderator" && floorSide === "for")
    ? "left"
    : "right";
}

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
  | "galleryBotsContainer"
  | "galleryHelmets"
  | "galleryForRugGlyph"
  | "galleryModeratorRugGlyph"
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
  /** Degrees added to the authored vertical skew. */
  skewY: number;
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
  supportsSkewY?: boolean;
}

export const DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS: readonly DebateFlytingStageAlignmentItemDefinition[] =
  [
    { id: "wideForBot", view: "wide", label: "Challenger bot" },
    {
      id: "wideForHelmet",
      view: "wide",
      label: "Challenger helmet",
      supportsRotation: true,
      supportsSkew: true,
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
      supportsSkew: true,
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
      supportsSkew: true,
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
      supportsSkew: true,
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
      id: "galleryBotsContainer",
      view: "gallery",
      label: "Gallery bot container",
    },
    {
      id: "galleryHelmets",
      view: "gallery",
      label: "Gallery helmets",
      supportsRotation: true,
      supportsSkew: true,
    },
    {
      id: "galleryForRugGlyph",
      view: "gallery",
      label: "Challenger rug glyph",
      supportsRotation: true,
      supportsSkew: true,
      supportsSkewY: true,
    },
    {
      id: "galleryModeratorRugGlyph",
      view: "gallery",
      label: "Jarl rug glyph",
      supportsRotation: true,
      supportsSkew: true,
      supportsSkewY: true,
    },
    {
      id: "galleryAgainstRugGlyph",
      view: "gallery",
      label: "Defender rug glyph",
      supportsRotation: true,
      supportsSkew: true,
      supportsSkewY: true,
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
  return { x: 0, y: 0, scale: 100, rotation: 0, skewX: 0, skewY: 0 };
}

const DEBATE_FLYTING_STAGE_ALIGNMENT_DEFAULT_OVERRIDES: Partial<
  Record<DebateFlytingStageAlignmentItem, DebateFlytingStagePlacementV1>
> = {
  wideForHeraldry: {
    x: -0.25,
    y: -14,
    scale: 90,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  wideModeratorBot: {
    x: 0,
    y: -4.5,
    scale: 100,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  wideModeratorHelmet: {
    x: -11,
    y: -10.25,
    scale: 80,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  wideModeratorNameplate: {
    x: 0,
    y: -4,
    scale: 100,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  wideModeratorHeraldry: {
    x: -0.25,
    y: 3,
    scale: 80,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  wideAgainstNameplate: {
    x: 0,
    y: 0.02,
    scale: 100,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  wideAgainstHeraldry: {
    x: -0.5,
    y: -14,
    scale: 90,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  moderatorForHeraldry: {
    x: 0.6,
    y: -14,
    scale: 100,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  moderatorModeratorBot: {
    x: 0,
    y: -1.5,
    scale: 100,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  moderatorModeratorNameplate: {
    x: 0,
    y: 7,
    scale: 100,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  moderatorModeratorHeraldry: {
    x: -0.25,
    y: -3,
    scale: 100,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  moderatorAgainstHeraldry: {
    x: -1.4,
    y: -14,
    scale: 100,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  galleryBotsContainer: {
    x: 0,
    y: -2.75,
    scale: 97,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  galleryHelmets: {
    x: -21.38,
    y: -13.02,
    scale: 73,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  galleryForRugGlyph: {
    x: -0.77,
    y: -13.87,
    scale: 100,
    rotation: 0,
    skewX: -20,
    skewY: 0,
  },
  galleryModeratorRugGlyph: {
    x: -0.04,
    y: -14.77,
    scale: 100,
    rotation: 0,
    skewX: 0,
    skewY: 0,
  },
  galleryAgainstRugGlyph: {
    x: 1.22,
    y: -11.7,
    scale: 100,
    rotation: 0,
    skewX: 20,
    skewY: 0,
  },
};

export const DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT: DebateFlytingStageAlignmentV1 =
  {
    version: DEBATE_FLYTING_STAGE_ALIGNMENT_VERSION,
    placements: Object.fromEntries(
      DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.map((item) => [
        item.id,
        DEBATE_FLYTING_STAGE_ALIGNMENT_DEFAULT_OVERRIDES[item.id] ??
          defaultPlacement(),
      ]),
    ) as Record<DebateFlytingStageAlignmentItem, DebateFlytingStagePlacementV1>,
  };

export const DEFAULT_DEBATE_FLYTING_STAGE_REHEARSAL_CONTROLS = {
  galleryBotScale: 60,
  galleryMaxVerticalRoam: 60,
} as const;

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
    skewY: normalizedNumber(candidate.skewY, -60, 60, 0),
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
            DEFAULT_DEBATE_FLYTING_STAGE_REHEARSAL_CONTROLS.galleryBotScale,
          ),
          galleryMaxVerticalRoam: normalizedNumber(
            rehearsal.galleryMaxVerticalRoam,
            0,
            60,
            DEFAULT_DEBATE_FLYTING_STAGE_REHEARSAL_CONTROLS.galleryMaxVerticalRoam,
          ),
        },
        null,
        2,
      )} as const;`,
    );
  }
  return lines.join("\n");
}
