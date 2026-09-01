import {
  normalizeDebateFormalityId,
  type DebateFormalityId,
  type DebateParticipantDifficulty,
} from "./debate.ts";
import { normalizeDebateParticipantDifficulty } from "./debateParticipation.ts";

/**
 * Whodunnit is deliberately split into a portable deterministic case model and
 * a public play projection. The server is the only consumer allowed to persist
 * `DebateMysteryCaseBibleV1`; clients receive `DebateWhodunnitFormatStateV1`.
 */

export const DEBATE_MYSTERY_SCHEMA_VERSION = 1 as const;
export const DEBATE_MYSTERY_GENERATOR_VERSION = 3 as const;
/** The page/block notebook remains readable for old backups only. */
export const DEBATE_MYSTERY_NOTEBOOK_VERSION = 2 as const;
export const DEBATE_MYSTERY_NOTEBOOK_CHARACTER_LIMIT = 20_000;
export const DEBATE_MYSTERY_CREDIBILITY_STRIKES = 3;

export type DebateMysteryPresetId = "compact" | "standard" | "grand" | "custom";
export type DebateMysteryDifficulty = "casual" | "classic" | "mastermind";
export type DebateMysteryArtMode = "bundled" | "generated";
export type DebateMysteryCompileStage =
  | "casting"
  | "building_mansion"
  | "writing_alibis"
  | "hiding_evidence"
  | "testing_theories"
  | "preparing_rooms"
  | "complete"
  | "failed";
export type DebateMysteryPlayPhase =
  | "compiling"
  | "investigation"
  | "theory"
  | "trial"
  | "verdict";
export type DebateMysteryRoomKind = "crime_scene" | "suspect" | "search";
export type DebateMysteryRegionOutcomeKind = "clue" | "subplot" | "empty";
export type DebateMysteryWeaponCategoryV1 = "poison" | "ordinary_object" | "recognizable_weapon";
export type DebateMysteryEvidenceRelationV1 = "canonical" | "related" | "unrelated";
export type DebateMysteryAccessItemKindV1 = "key" | "code" | "remote" | "container" | "artifact";
export type DebateMysteryLockTargetKindV1 = "item" | "room" | "region";
export type DebateMysteryRouteGrade =
  | "smoking_gun"
  | "strong_case"
  | "lucky_break"
  | "incorrect";

export type DebateMysteryActiveActivityV1 =
  | { kind: "investigation"; roomId: string; startedAt: string; actionCommitted: boolean }
  | { kind: "interview"; suspectSeatId: string; startedAt: string };

export interface DebateMysteryRecoveredActionTokenV1 {
  id: string;
  roomId: string;
  regionId: string;
  amount: 1;
  recoveredAt: string;
}

export interface DebateMysteryPartnerConsultationV1 {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface DebateMysteryPresetV1 {
  id: Exclude<DebateMysteryPresetId, "custom">;
  floors: number;
  rooms: number;
  suspects: number;
  classicActions: number;
  accompliceChance: number;
}

export const DEBATE_MYSTERY_PRESETS: readonly DebateMysteryPresetV1[] = [
  { id: "compact", floors: 1, rooms: 5, suspects: 4, classicActions: 16, accompliceChance: 0 },
  { id: "standard", floors: 2, rooms: 10, suspects: 6, classicActions: 28, accompliceChance: 0.25 },
  { id: "grand", floors: 3, rooms: 15, suspects: 8, classicActions: 40, accompliceChance: 0.35 },
] as const;

/**
 * An accomplice adds a second sealed culpability relationship, so reserve it
 * for the highest mystery difficulty. Mansion size still controls how often
 * that extra relationship appears once Mastermind is selected.
 */
export function debateMysteryAccompliceChance(
  difficulty: DebateMysteryDifficulty,
  preset: DebateMysteryPresetId,
  suspectCount: number,
): number {
  if (difficulty !== "mastermind") return 0;
  const presetChance = DEBATE_MYSTERY_PRESETS.find(
    (entry) => entry.id === preset,
  )?.accompliceChance;
  return presetChance ??
    (suspectCount >= 7 ? 0.35 : suspectCount >= 6 ? 0.25 : 0);
}

export interface DebateWhodunnitCreateConfigV1 {
  version: typeof DEBATE_MYSTERY_SCHEMA_VERSION;
  preset: DebateMysteryPresetId;
  difficulty: DebateMysteryDifficulty;
  artMode: DebateMysteryArtMode;
  /** Frozen court register, shared with ordinary Debate and Turnabout. */
  formality?: DebateFormalityId;
  /** Frozen court rule, shared with ordinary Debate and Turnabout. */
  juryEnabled?: boolean;
  /** The player may prosecute or spectate; the public Judge is cast separately. */
  playerRole?: "participant" | "spectator";
  /** Participant-only feedback visibility, frozen with the court contract. */
  participationDifficulty?: DebateParticipantDifficulty;
  inspiration: string;
  nonce: string;
  floors?: number;
  totalRooms?: number;
  suspectBotIds: string[];
  /** Public presiding bot. PRISM remains the sealed server-side Casekeeper. */
  judgeBotId?: string;
  prosecutorPartnerBotId: string;
  rivalDefenseBotId: string;
}

export interface DebateMysteryResolvedConfigV1 {
  version: typeof DEBATE_MYSTERY_SCHEMA_VERSION;
  preset: DebateMysteryPresetId;
  difficulty: DebateMysteryDifficulty;
  artMode: DebateMysteryArtMode;
  formality: DebateFormalityId;
  juryEnabled: boolean;
  playerRole: "participant" | "spectator";
  participationDifficulty: DebateParticipantDifficulty | undefined;
  inspiration: string;
  nonce: string;
  floors: number;
  totalRooms: number;
  suspectBotIds: string[];
  judgeBotId: string;
  prosecutorPartnerBotId: string;
  rivalDefenseBotId: string;
  actionBudget: number;
  accompliceChance: number;
}

export interface DebateMysteryPointV1 { x: number; y: number }

export interface DebateMysteryRegionV1 {
  id: string;
  label: string;
  keywords: string[];
  physicalAnchor: string;
  polygon: DebateMysteryPointV1[];
}

export interface DebateMysteryRoomTemplateV1 {
  version: typeof DEBATE_MYSTERY_SCHEMA_VERSION;
  id: string;
  name: string;
  emoji: string;
  nativeWidth: number;
  nativeHeight: number;
  /** A local production scene that is available without generated room art. */
  bundledAssetPath?: string;
  palette: [string, string, string];
  regions: DebateMysteryRegionV1[];
}

const REGION_SHAPES: readonly DebateMysteryPointV1[][] = [
  [{ x: 4, y: 55 }, { x: 25, y: 52 }, { x: 26, y: 84 }, { x: 3, y: 87 }],
  [{ x: 29, y: 61 }, { x: 48, y: 58 }, { x: 51, y: 89 }, { x: 28, y: 91 }],
  [{ x: 55, y: 55 }, { x: 78, y: 54 }, { x: 80, y: 86 }, { x: 54, y: 88 }],
  [{ x: 81, y: 50 }, { x: 97, y: 52 }, { x: 97, y: 88 }, { x: 80, y: 86 }],
  [{ x: 8, y: 13 }, { x: 31, y: 11 }, { x: 31, y: 43 }, { x: 7, y: 45 }],
  [{ x: 36, y: 8 }, { x: 62, y: 8 }, { x: 62, y: 42 }, { x: 36, y: 42 }],
  [{ x: 68, y: 12 }, { x: 94, y: 14 }, { x: 93, y: 45 }, { x: 67, y: 43 }],
  [{ x: 40, y: 43 }, { x: 68, y: 43 }, { x: 70, y: 65 }, { x: 39, y: 66 }],
] as const;

function semanticRoomRegion(
  id: string,
  label: string,
  physicalAnchor: string,
  polygon: readonly DebateMysteryPointV1[],
): DebateMysteryRegionV1 {
  return {
    id,
    label,
    keywords: [...new Set([label, ...label.toLowerCase().split(/\s+|&/gu).filter(Boolean)])],
    physicalAnchor,
    polygon: polygon.map((point) => ({ ...point })),
  };
}

function interpolateMysteryPoint(
  start: DebateMysteryPointV1,
  end: DebateMysteryPointV1,
  amount: number,
): DebateMysteryPointV1 {
  return {
    x: Number((start.x + (end.x - start.x) * amount).toFixed(3)),
    y: Number((start.y + (end.y - start.y) * amount).toFixed(3)),
  };
}

/** Keep the broad authored polygon for old Case Seeds, while exposing three
 * non-overlapping detail bands to newly compiled cases. This makes every
 * bundled scene richly searchable without asking image generation or vision
 * to rediscover its composition. */
function mysteryDetailRegions(region: DebateMysteryRegionV1): DebateMysteryRegionV1[] {
  if (region.polygon.length !== 4) return [];
  const [topLeft, topRight, bottomRight, bottomLeft] = region.polygon as [
    DebateMysteryPointV1,
    DebateMysteryPointV1,
    DebateMysteryPointV1,
    DebateMysteryPointV1,
  ];
  const bands = [
    ["upper", 0, 1 / 3],
    ["center", 1 / 3, 2 / 3],
    ["lower", 2 / 3, 1],
  ] as const;
  return bands.map(([part, start, end]) => semanticRoomRegion(
    `${region.id}:detail-${part}`,
    `${region.label} · ${part}`,
    `the ${part} portion of ${region.physicalAnchor}`,
    [
      interpolateMysteryPoint(topLeft, bottomLeft, start),
      interpolateMysteryPoint(topRight, bottomRight, start),
      interpolateMysteryPoint(topRight, bottomRight, end),
      interpolateMysteryPoint(topLeft, bottomLeft, end),
    ],
  ));
}

interface BundledRoomOverride {
  name: string;
  bundledAssetPath: string;
  regions: readonly DebateMysteryRegionV1[];
}

/**
 * These rooms are authored to the bundled production scenes rather than
 * the generic fallback geometry. Their regions are broad, outcome-neutral
 * anchors only; deterministic evidence assignment remains separate.
 */
const BUNDLED_ROOM_OVERRIDES: Readonly<Record<string, BundledRoomOverride>> = {
  kitchen: {
    name: "Kitchen",
    bundledAssetPath: "/debate/mystery/rooms/kitchen.webp",
    regions: [
      semanticRoomRegion("kitchen:window", "window", "the tall window and sill at the far left", [{ x: 0, y: 7 }, { x: 17, y: 8 }, { x: 18, y: 54 }, { x: 0, y: 57 }]),
      semanticRoomRegion("kitchen:wall-ovens", "wall ovens", "the built-in oven wall left of the counter", [{ x: 16, y: 19 }, { x: 31, y: 19 }, { x: 31, y: 57 }, { x: 15, y: 58 }]),
      semanticRoomRegion("kitchen:range-hood", "range hood", "the faceted hood above the back counter", [{ x: 28, y: 0 }, { x: 56, y: 0 }, { x: 59, y: 28 }, { x: 27, y: 29 }]),
      semanticRoomRegion("kitchen:back-counter", "back counter", "the long counter, sink, and backsplash", [{ x: 30, y: 25 }, { x: 75, y: 24 }, { x: 75, y: 48 }, { x: 28, y: 50 }]),
      semanticRoomRegion("kitchen:island", "island", "the large stone island in the foreground", [{ x: 13, y: 47 }, { x: 73, y: 45 }, { x: 76, y: 82 }, { x: 14, y: 87 }]),
      semanticRoomRegion("kitchen:pantry", "pantry shelves", "the open pantry shelving to the right", [{ x: 76, y: 17 }, { x: 91, y: 19 }, { x: 91, y: 58 }, { x: 75, y: 60 }]),
      semanticRoomRegion("kitchen:service-passage", "service passage", "the dark passage beyond the pantry", [{ x: 89, y: 33 }, { x: 100, y: 31 }, { x: 100, y: 79 }, { x: 88, y: 78 }]),
    ],
  },
  ballroom: {
    name: "Ballroom",
    bundledAssetPath: "/debate/mystery/rooms/ballroom.webp",
    regions: [
      semanticRoomRegion("ballroom:piano-stage", "piano stage", "the raised piano stage at the left", [{ x: 0, y: 27 }, { x: 30, y: 24 }, { x: 32, y: 61 }, { x: 0, y: 66 }]),
      semanticRoomRegion("ballroom:west-lounge", "west lounge", "the seating just below the piano stage", [{ x: 0, y: 56 }, { x: 29, y: 53 }, { x: 30, y: 98 }, { x: 0, y: 100 }]),
      semanticRoomRegion("ballroom:dance-floor", "dance floor", "the open polished floor at the center", [{ x: 25, y: 44 }, { x: 75, y: 43 }, { x: 82, y: 100 }, { x: 17, y: 100 }]),
      semanticRoomRegion("ballroom:chandeliers", "chandeliers", "the hanging lights above the central floor", [{ x: 42, y: 4 }, { x: 64, y: 4 }, { x: 66, y: 35 }, { x: 41, y: 36 }]),
      semanticRoomRegion("ballroom:glass-doors", "glass doors", "the tall glass doors at the back", [{ x: 58, y: 20 }, { x: 82, y: 19 }, { x: 83, y: 66 }, { x: 57, y: 67 }]),
      semanticRoomRegion("ballroom:sideboard", "sideboard", "the banquet sideboard along the right wall", [{ x: 81, y: 29 }, { x: 100, y: 28 }, { x: 100, y: 67 }, { x: 80, y: 68 }]),
      semanticRoomRegion("ballroom:east-tables", "east tables", "the small tables and chairs at the right", [{ x: 81, y: 57 }, { x: 100, y: 53 }, { x: 100, y: 100 }, { x: 77, y: 100 }]),
    ],
  },
  "dining-room": {
    name: "Dining Room",
    bundledAssetPath: "/debate/mystery/rooms/dining-room.webp",
    regions: [
      semanticRoomRegion("dining-room:buffet", "buffet", "the long buffet beneath the left shelves", [{ x: 0, y: 24 }, { x: 20, y: 22 }, { x: 21, y: 70 }, { x: 0, y: 74 }]),
      semanticRoomRegion("dining-room:wall-sconces", "wall sconces", "the paired wall lights left of the feature wall", [{ x: 19, y: 21 }, { x: 31, y: 20 }, { x: 31, y: 56 }, { x: 18, y: 57 }]),
      semanticRoomRegion("dining-room:feature-wall", "feature wall", "the illuminated panel behind the table", [{ x: 31, y: 0 }, { x: 82, y: 0 }, { x: 83, y: 42 }, { x: 30, y: 43 }]),
      semanticRoomRegion("dining-room:table", "dining table", "the long set dining table", [{ x: 25, y: 39 }, { x: 85, y: 37 }, { x: 89, y: 74 }, { x: 22, y: 77 }]),
      semanticRoomRegion("dining-room:place-settings", "place settings", "the place settings across the center of the table", [{ x: 36, y: 42 }, { x: 76, y: 40 }, { x: 79, y: 61 }, { x: 32, y: 64 }]),
      semanticRoomRegion("dining-room:rug", "dining rug", "the pale rug beneath the table and chairs", [{ x: 13, y: 60 }, { x: 94, y: 57 }, { x: 96, y: 96 }, { x: 9, y: 96 }]),
      semanticRoomRegion("dining-room:display-cabinet", "display cabinet", "the glass-front cabinet along the right wall", [{ x: 87, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 91 }, { x: 86, y: 91 }]),
    ],
  },
  parlor: {
    name: "Living Room",
    bundledAssetPath: "/debate/mystery/rooms/living-room.webp",
    regions: [
      semanticRoomRegion("parlor:window", "picture window", "the wide dark window at the back", [{ x: 36, y: 16 }, { x: 74, y: 15 }, { x: 75, y: 56 }, { x: 35, y: 57 }]),
      semanticRoomRegion("parlor:sofa", "sofa", "the deep sectional sofa at the left", [{ x: 0, y: 54 }, { x: 47, y: 54 }, { x: 48, y: 100 }, { x: 0, y: 100 }]),
      semanticRoomRegion("parlor:coffee-table", "coffee table", "the faceted coffee table at the center", [{ x: 34, y: 67 }, { x: 69, y: 64 }, { x: 75, y: 100 }, { x: 29, y: 100 }]),
      semanticRoomRegion("parlor:fireplace", "fireplace", "the lit fireplace along the right wall", [{ x: 76, y: 39 }, { x: 100, y: 36 }, { x: 100, y: 82 }, { x: 75, y: 83 }]),
      semanticRoomRegion("parlor:bookcase", "bookcase", "the high shelves over the fireplace", [{ x: 82, y: 3 }, { x: 100, y: 3 }, { x: 100, y: 43 }, { x: 81, y: 45 }]),
      semanticRoomRegion("parlor:side-console", "side console", "the low console and lamp at the far left", [{ x: 0, y: 38 }, { x: 26, y: 36 }, { x: 27, y: 62 }, { x: 0, y: 66 }]),
      semanticRoomRegion("parlor:reading-chair", "reading chair", "the angular chair in front of the fireplace", [{ x: 63, y: 63 }, { x: 89, y: 59 }, { x: 94, y: 100 }, { x: 59, y: 100 }]),
    ],
  },
  utility: {
    name: "Garage",
    bundledAssetPath: "/debate/mystery/rooms/garage.webp",
    regions: [
      semanticRoomRegion("utility:car", "car", "the parked car at the left", [{ x: 0, y: 39 }, { x: 33, y: 35 }, { x: 39, y: 100 }, { x: 0, y: 100 }]),
      semanticRoomRegion("utility:charging-cable", "charging cable", "the cable on the floor beside the car", [{ x: 14, y: 68 }, { x: 45, y: 65 }, { x: 50, y: 98 }, { x: 8, y: 100 }]),
      semanticRoomRegion("utility:garage-door", "garage door", "the wide segmented garage door", [{ x: 34, y: 18 }, { x: 67, y: 18 }, { x: 68, y: 73 }, { x: 32, y: 74 }]),
      semanticRoomRegion("utility:tool-wall", "tool wall", "the hanging tools above the workbench", [{ x: 68, y: 17 }, { x: 92, y: 16 }, { x: 93, y: 54 }, { x: 67, y: 56 }]),
      semanticRoomRegion("utility:workbench", "workbench", "the workbench along the right wall", [{ x: 64, y: 48 }, { x: 97, y: 46 }, { x: 98, y: 76 }, { x: 63, y: 78 }]),
      semanticRoomRegion("utility:storage-lockers", "storage lockers", "the tall storage cabinets at the right", [{ x: 91, y: 26 }, { x: 100, y: 25 }, { x: 100, y: 83 }, { x: 89, y: 83 }]),
      semanticRoomRegion("utility:rolling-toolbox", "rolling toolbox", "the rolling toolbox beneath the bench", [{ x: 55, y: 66 }, { x: 75, y: 65 }, { x: 76, y: 91 }, { x: 53, y: 93 }]),
    ],
  },
  cellar: {
    name: "Basement",
    bundledAssetPath: "/debate/mystery/rooms/basement.webp",
    regions: [
      semanticRoomRegion("cellar:storage-shelves", "storage shelves", "the stacked shelves along the far left", [{ x: 0, y: 2 }, { x: 22, y: 2 }, { x: 23, y: 73 }, { x: 0, y: 77 }]),
      semanticRoomRegion("cellar:side-door", "side door", "the plain door left of the stairs", [{ x: 22, y: 33 }, { x: 41, y: 32 }, { x: 42, y: 75 }, { x: 21, y: 76 }]),
      semanticRoomRegion("cellar:utility-appliances", "utility appliances", "the utility appliances along the back wall", [{ x: 41, y: 19 }, { x: 59, y: 18 }, { x: 60, y: 68 }, { x: 40, y: 70 }]),
      semanticRoomRegion("cellar:stairs", "stairs", "the staircase rising at center right", [{ x: 56, y: 18 }, { x: 74, y: 18 }, { x: 77, y: 76 }, { x: 55, y: 76 }]),
      semanticRoomRegion("cellar:worktable", "worktable", "the central worktable and stools", [{ x: 63, y: 47 }, { x: 88, y: 45 }, { x: 91, y: 79 }, { x: 60, y: 81 }]),
      semanticRoomRegion("cellar:kitchenette", "basement counter", "the counter and shelves at the far right", [{ x: 78, y: 25 }, { x: 100, y: 25 }, { x: 100, y: 69 }, { x: 77, y: 71 }]),
      semanticRoomRegion("cellar:floor-rug", "floor rug", "the large rug in the foreground", [{ x: 33, y: 69 }, { x: 86, y: 68 }, { x: 90, y: 100 }, { x: 28, y: 100 }]),
    ],
  },
  library: {
    name: "Library",
    bundledAssetPath: "/debate/mystery/rooms/library.webp",
    regions: [
      semanticRoomRegion("library:skylight", "skylight", "the tall faceted skylight at the back", [{ x: 39, y: 0 }, { x: 63, y: 0 }, { x: 65, y: 48 }, { x: 37, y: 49 }]),
      semanticRoomRegion("library:upper-bookcase", "upper bookcase", "the upper shelves beneath the skylight", [{ x: 26, y: 13 }, { x: 76, y: 13 }, { x: 78, y: 50 }, { x: 24, y: 51 }]),
      semanticRoomRegion("library:west-stacks", "west stacks", "the book stacks along the left wall", [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 31, y: 81 }, { x: 0, y: 85 }]),
      semanticRoomRegion("library:east-stacks", "east stacks", "the book stacks along the right wall", [{ x: 70, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 83 }, { x: 69, y: 82 }]),
      semanticRoomRegion("library:reading-table", "reading table", "the large reading table at the center", [{ x: 33, y: 58 }, { x: 69, y: 57 }, { x: 73, y: 88 }, { x: 30, y: 90 }]),
      semanticRoomRegion("library:west-chair", "west reading chair", "the armchair to the left of the table", [{ x: 13, y: 65 }, { x: 38, y: 64 }, { x: 40, y: 98 }, { x: 10, y: 100 }]),
      semanticRoomRegion("library:east-chair", "east reading chair", "the armchair to the right of the table", [{ x: 61, y: 66 }, { x: 88, y: 64 }, { x: 92, y: 99 }, { x: 58, y: 100 }]),
      semanticRoomRegion("library:book-piles", "book piles", "the loose stacks of books beside the table", [{ x: 41, y: 75 }, { x: 64, y: 73 }, { x: 67, y: 100 }, { x: 39, y: 100 }]),
    ],
  },
  theater: {
    name: "Theater",
    bundledAssetPath: "/debate/mystery/rooms/theater.webp",
    regions: [
      semanticRoomRegion("theater:screen", "projection screen", "the broad projection screen at the front of the theater", [{ x: 31, y: 19 }, { x: 68, y: 18 }, { x: 68, y: 53 }, { x: 31, y: 53 }]),
      semanticRoomRegion("theater:projector", "projector", "the ceiling-mounted projector above the seating", [{ x: 43, y: 0 }, { x: 57, y: 0 }, { x: 58, y: 17 }, { x: 42, y: 17 }]),
      semanticRoomRegion("theater:media-console", "media console", "the low console beneath the projection screen", [{ x: 30, y: 50 }, { x: 69, y: 49 }, { x: 70, y: 66 }, { x: 29, y: 66 }]),
      semanticRoomRegion("theater:wall-inset", "wall inset", "the inset panel along the left wall", [{ x: 0, y: 17 }, { x: 24, y: 16 }, { x: 25, y: 61 }, { x: 0, y: 64 }]),
      semanticRoomRegion("theater:doorway", "doorway", "the open doorway to the right of the screen", [{ x: 69, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 66 }, { x: 69, y: 66 }]),
      semanticRoomRegion("theater:concession-counter", "concession counter", "the snack counter along the right wall", [{ x: 80, y: 30 }, { x: 100, y: 29 }, { x: 100, y: 69 }, { x: 79, y: 69 }]),
      semanticRoomRegion("theater:seating", "theater seating", "the upholstered theater seating in the foreground", [{ x: 0, y: 59 }, { x: 100, y: 57 }, { x: 100, y: 100 }, { x: 0, y: 100 }]),
      semanticRoomRegion("theater:snack-table", "snack table", "the low table with popcorn and drinks between the seats", [{ x: 35, y: 68 }, { x: 61, y: 67 }, { x: 64, y: 91 }, { x: 33, y: 92 }]),
    ],
  },
  pool: {
    name: "Pool",
    bundledAssetPath: "/debate/mystery/rooms/pool.webp",
    regions: [
      semanticRoomRegion("pool:water", "pool", "the dark indoor pool at the center", [{ x: 35, y: 43 }, { x: 82, y: 41 }, { x: 75, y: 91 }, { x: 29, y: 89 }]),
      semanticRoomRegion("pool:hot-tub", "hot tub", "the raised hot tub against the far wall", [{ x: 20, y: 30 }, { x: 43, y: 30 }, { x: 43, y: 51 }, { x: 19, y: 51 }]),
      semanticRoomRegion("pool:window-wall", "window wall", "the glass wall overlooking the lake", [{ x: 57, y: 5 }, { x: 100, y: 5 }, { x: 100, y: 49 }, { x: 56, y: 50 }]),
      semanticRoomRegion("pool:towel-niche", "towel niche", "the towel niche along the left wall", [{ x: 0, y: 25 }, { x: 20, y: 24 }, { x: 20, y: 58 }, { x: 0, y: 59 }]),
      semanticRoomRegion("pool:west-bench", "west bench", "the low bench and folded blanket at the near left", [{ x: 0, y: 53 }, { x: 29, y: 51 }, { x: 31, y: 83 }, { x: 0, y: 85 }]),
      semanticRoomRegion("pool:east-loungers", "east loungers", "the lounge chairs beside the right edge of the pool", [{ x: 73, y: 48 }, { x: 100, y: 46 }, { x: 100, y: 87 }, { x: 72, y: 89 }]),
      semanticRoomRegion("pool:deck", "pool deck", "the pale stone deck around the water", [{ x: 0, y: 65 }, { x: 100, y: 63 }, { x: 100, y: 100 }, { x: 0, y: 100 }]),
      semanticRoomRegion("pool:far-bench", "far bench", "the long bench beneath the windows", [{ x: 40, y: 35 }, { x: 82, y: 34 }, { x: 83, y: 49 }, { x: 39, y: 50 }]),
    ],
  },
  "wine-room": {
    name: "Lounge",
    bundledAssetPath: "/debate/mystery/rooms/lounge.webp",
    regions: [
      semanticRoomRegion("wine-room:bar", "bar", "the illuminated bar and bottle shelves at the left", [{ x: 0, y: 19 }, { x: 30, y: 18 }, { x: 31, y: 66 }, { x: 0, y: 68 }]),
      semanticRoomRegion("wine-room:billiards-table", "billiards table", "the angular billiards table at the center", [{ x: 29, y: 46 }, { x: 77, y: 43 }, { x: 85, y: 85 }, { x: 24, y: 86 }]),
      semanticRoomRegion("wine-room:cue-rack", "cue rack", "the cue rack on the back wall", [{ x: 42, y: 23 }, { x: 62, y: 22 }, { x: 63, y: 52 }, { x: 41, y: 53 }]),
      semanticRoomRegion("wine-room:display-shelves", "display shelves", "the illuminated display shelves right of the cue rack", [{ x: 63, y: 17 }, { x: 78, y: 17 }, { x: 79, y: 54 }, { x: 62, y: 54 }]),
      semanticRoomRegion("wine-room:sofa", "lounge sofa", "the sectional sofa beneath the window", [{ x: 77, y: 38 }, { x: 100, y: 36 }, { x: 100, y: 72 }, { x: 75, y: 74 }]),
      semanticRoomRegion("wine-room:window", "picture window", "the dark lake window behind the sofa", [{ x: 78, y: 4 }, { x: 100, y: 4 }, { x: 100, y: 43 }, { x: 77, y: 44 }]),
      semanticRoomRegion("wine-room:card-table", "card table", "the round card table at the lower left", [{ x: 0, y: 59 }, { x: 29, y: 57 }, { x: 31, y: 94 }, { x: 0, y: 96 }]),
      semanticRoomRegion("wine-room:fallen-stool", "fallen stool", "the overturned stool in the foreground", [{ x: 70, y: 71 }, { x: 91, y: 70 }, { x: 93, y: 100 }, { x: 68, y: 100 }]),
    ],
  },
  "primary-bedroom": {
    name: "Bedroom",
    bundledAssetPath: "/debate/mystery/rooms/bedroom.webp",
    regions: [
      semanticRoomRegion("primary-bedroom:bed", "bed", "the large bed along the left wall", [{ x: 8, y: 42 }, { x: 57, y: 39 }, { x: 59, y: 81 }, { x: 7, y: 84 }]),
      semanticRoomRegion("primary-bedroom:nightstand", "nightstand", "the nightstand and open drawer beside the bed", [{ x: 0, y: 47 }, { x: 17, y: 46 }, { x: 18, y: 76 }, { x: 0, y: 79 }]),
      semanticRoomRegion("primary-bedroom:headboard", "headboard", "the illuminated headboard wall", [{ x: 0, y: 19 }, { x: 46, y: 18 }, { x: 48, y: 53 }, { x: 0, y: 55 }]),
      semanticRoomRegion("primary-bedroom:window-seat", "window seat", "the deep window seat at the back", [{ x: 41, y: 28 }, { x: 73, y: 27 }, { x: 73, y: 57 }, { x: 40, y: 58 }]),
      semanticRoomRegion("primary-bedroom:wardrobe", "wardrobe", "the glass wardrobe along the right wall", [{ x: 72, y: 16 }, { x: 91, y: 15 }, { x: 92, y: 69 }, { x: 71, y: 70 }]),
      semanticRoomRegion("primary-bedroom:dresser", "dresser", "the long dresser and artwork at the far right", [{ x: 89, y: 30 }, { x: 100, y: 29 }, { x: 100, y: 72 }, { x: 88, y: 74 }]),
      semanticRoomRegion("primary-bedroom:bench", "bed bench", "the bench and travel bag at the foot of the bed", [{ x: 48, y: 56 }, { x: 72, y: 54 }, { x: 73, y: 78 }, { x: 47, y: 80 }]),
      semanticRoomRegion("primary-bedroom:rug", "bedroom rug", "the rug and slippers across the foreground", [{ x: 7, y: 69 }, { x: 68, y: 67 }, { x: 69, y: 100 }, { x: 4, y: 100 }]),
    ],
  },
  conservatory: {
    name: "Arboretum",
    bundledAssetPath: "/debate/mystery/rooms/arboretum.webp",
    regions: [
      semanticRoomRegion("conservatory:left-planter", "left planter", "the dense raised planter along the left wall", [{ x: 0, y: 26 }, { x: 28, y: 24 }, { x: 29, y: 81 }, { x: 0, y: 84 }]),
      semanticRoomRegion("conservatory:hanging-vines", "hanging vines", "the climbing and hanging vines at the upper left", [{ x: 8, y: 0 }, { x: 37, y: 0 }, { x: 38, y: 48 }, { x: 7, y: 49 }]),
      semanticRoomRegion("conservatory:glass-roof", "glass roof", "the faceted glass roof overhead", [{ x: 21, y: 0 }, { x: 77, y: 0 }, { x: 76, y: 27 }, { x: 22, y: 28 }]),
      semanticRoomRegion("conservatory:garden-window", "garden window", "the broad glass wall overlooking the garden", [{ x: 28, y: 18 }, { x: 78, y: 17 }, { x: 79, y: 61 }, { x: 27, y: 62 }]),
      semanticRoomRegion("conservatory:chair", "garden chair", "the chair and side table near the center", [{ x: 22, y: 50 }, { x: 48, y: 48 }, { x: 49, y: 82 }, { x: 20, y: 84 }]),
      semanticRoomRegion("conservatory:potting-counter", "potting counter", "the sink and potting counter along the right wall", [{ x: 76, y: 22 }, { x: 100, y: 21 }, { x: 100, y: 64 }, { x: 75, y: 65 }]),
      semanticRoomRegion("conservatory:pot-shelves", "pot shelves", "the pots and soil bins beneath the counter", [{ x: 76, y: 56 }, { x: 100, y: 54 }, { x: 100, y: 88 }, { x: 75, y: 90 }]),
      semanticRoomRegion("conservatory:spilled-pot", "spilled pot", "the broken pot and loose soil on the floor", [{ x: 58, y: 69 }, { x: 88, y: 66 }, { x: 91, y: 100 }, { x: 55, y: 100 }]),
    ],
  },
  study: {
    name: "Office",
    bundledAssetPath: "/debate/mystery/rooms/office.webp",
    regions: [
      semanticRoomRegion("study:desk", "office desk", "the faceted desk at the center", [{ x: 27, y: 48 }, { x: 73, y: 45 }, { x: 78, y: 81 }, { x: 23, y: 84 }]),
      semanticRoomRegion("study:fireplace", "fireplace", "the lit fireplace along the left wall", [{ x: 0, y: 35 }, { x: 21, y: 34 }, { x: 22, y: 66 }, { x: 0, y: 68 }]),
      semanticRoomRegion("study:left-bookcase", "left bookcase", "the shelves beside the fireplace", [{ x: 12, y: 3 }, { x: 28, y: 3 }, { x: 29, y: 53 }, { x: 11, y: 55 }]),
      semanticRoomRegion("study:picture-window", "picture window", "the large window behind the desk", [{ x: 31, y: 20 }, { x: 70, y: 19 }, { x: 71, y: 51 }, { x: 30, y: 52 }]),
      semanticRoomRegion("study:desk-chair", "desk chair", "the high-backed chair behind the desk", [{ x: 38, y: 35 }, { x: 54, y: 34 }, { x: 56, y: 59 }, { x: 37, y: 60 }]),
      semanticRoomRegion("study:guest-chair", "guest chair", "the angular guest chair and briefcase at the right", [{ x: 63, y: 58 }, { x: 91, y: 55 }, { x: 94, y: 98 }, { x: 59, y: 100 }]),
      semanticRoomRegion("study:right-cabinet", "drinks cabinet", "the cabinet and bottles along the right wall", [{ x: 76, y: 20 }, { x: 100, y: 18 }, { x: 100, y: 68 }, { x: 75, y: 69 }]),
      semanticRoomRegion("study:wall-art", "wall art", "the faceted artwork above the drinks cabinet", [{ x: 78, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 35 }, { x: 77, y: 36 }]),
    ],
  },
  bathroom: {
    name: "Bathroom",
    bundledAssetPath: "/debate/mystery/rooms/bathroom.webp",
    regions: [
      semanticRoomRegion("bathroom:window", "bathroom window", "the tall lake window beside the bathtub", [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 25, y: 62 }, { x: 0, y: 65 }]),
      semanticRoomRegion("bathroom:bathtub", "bathtub", "the faceted stone bathtub at the left", [{ x: 0, y: 49 }, { x: 36, y: 46 }, { x: 37, y: 84 }, { x: 0, y: 89 }]),
      semanticRoomRegion("bathroom:shower", "shower enclosure", "the glass shower enclosure at the center", [{ x: 23, y: 3 }, { x: 53, y: 4 }, { x: 54, y: 70 }, { x: 22, y: 72 }]),
      semanticRoomRegion("bathroom:shower-niche", "shower niche", "the illuminated niche inside the shower", [{ x: 36, y: 29 }, { x: 48, y: 29 }, { x: 49, y: 51 }, { x: 35, y: 52 }]),
      semanticRoomRegion("bathroom:robes", "robes", "the hanging robes between the shower and door", [{ x: 47, y: 28 }, { x: 58, y: 27 }, { x: 59, y: 62 }, { x: 46, y: 63 }]),
      semanticRoomRegion("bathroom:door", "bathroom door", "the dark door at the back of the room", [{ x: 56, y: 20 }, { x: 68, y: 20 }, { x: 68, y: 64 }, { x: 56, y: 64 }]),
      semanticRoomRegion("bathroom:vanity", "double vanity", "the long double vanity along the right wall", [{ x: 68, y: 40 }, { x: 100, y: 38 }, { x: 100, y: 74 }, { x: 67, y: 76 }]),
      semanticRoomRegion("bathroom:mirror", "vanity mirror", "the broad mirror above the double vanity", [{ x: 73, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 47 }, { x: 72, y: 48 }]),
      semanticRoomRegion("bathroom:floor-linens", "floor linens", "the bath mat, towel, and open drawers across the floor", [{ x: 34, y: 62 }, { x: 100, y: 58 }, { x: 100, y: 100 }, { x: 31, y: 100 }]),
    ],
  },
  "rooftop-lounge": {
    name: "Rooftop Lounge",
    bundledAssetPath: "/debate/mystery/rooms/rooftop-lounge.webp",
    regions: [
      semanticRoomRegion("rooftop-lounge:pergola", "pergola", "the illuminated steel pergola overhead", [{ x: 0, y: 0 }, { x: 61, y: 0 }, { x: 58, y: 28 }, { x: 0, y: 29 }]),
      semanticRoomRegion("rooftop-lounge:bar", "rooftop bar", "the grill, counter, and stools along the left wall", [{ x: 0, y: 23 }, { x: 39, y: 22 }, { x: 40, y: 56 }, { x: 0, y: 58 }]),
      semanticRoomRegion("rooftop-lounge:sofa", "outdoor sofa", "the long sofa beneath the bar", [{ x: 0, y: 47 }, { x: 34, y: 45 }, { x: 36, y: 76 }, { x: 0, y: 79 }]),
      semanticRoomRegion("rooftop-lounge:fire-table", "fire table", "the lit fire table in front of the sofa", [{ x: 15, y: 59 }, { x: 45, y: 57 }, { x: 48, y: 85 }, { x: 12, y: 87 }]),
      semanticRoomRegion("rooftop-lounge:armchair", "outdoor armchair", "the armchair and side table beside the fire", [{ x: 40, y: 49 }, { x: 58, y: 47 }, { x: 59, y: 73 }, { x: 39, y: 75 }]),
      semanticRoomRegion("rooftop-lounge:elevator", "rooftop elevator", "the illuminated elevator doorway at the back", [{ x: 49, y: 27 }, { x: 62, y: 27 }, { x: 63, y: 57 }, { x: 49, y: 57 }]),
      semanticRoomRegion("rooftop-lounge:planters", "railing planters", "the planters lining the glass railing", [{ x: 58, y: 31 }, { x: 100, y: 31 }, { x: 100, y: 61 }, { x: 57, y: 62 }]),
      semanticRoomRegion("rooftop-lounge:terrace-floor", "terrace floor", "the open polished terrace and its wet marks", [{ x: 36, y: 55 }, { x: 100, y: 52 }, { x: 100, y: 100 }, { x: 31, y: 100 }]),
    ],
  },
  foyer: {
    name: "Foyer",
    bundledAssetPath: "/debate/mystery/rooms/foyer.webp",
    regions: [
      semanticRoomRegion("foyer:staircase", "staircase", "the broad staircase rising along the left", [{ x: 0, y: 9 }, { x: 36, y: 7 }, { x: 37, y: 78 }, { x: 0, y: 82 }]),
      semanticRoomRegion("foyer:stair-rail", "stair rail", "the faceted stair rail and landing", [{ x: 24, y: 19 }, { x: 50, y: 17 }, { x: 51, y: 63 }, { x: 23, y: 66 }]),
      semanticRoomRegion("foyer:entry-doors", "entry doors", "the glass entry doors at the back", [{ x: 43, y: 31 }, { x: 64, y: 30 }, { x: 65, y: 70 }, { x: 42, y: 71 }]),
      semanticRoomRegion("foyer:upper-landing", "upper landing", "the upper gallery and hanging lights", [{ x: 44, y: 0 }, { x: 75, y: 0 }, { x: 75, y: 35 }, { x: 43, y: 36 }]),
      semanticRoomRegion("foyer:console", "entry console", "the long console and coat hooks on the right", [{ x: 73, y: 26 }, { x: 100, y: 25 }, { x: 100, y: 60 }, { x: 72, y: 62 }]),
      semanticRoomRegion("foyer:bench", "entry bench", "the bench and shoes beneath the console", [{ x: 75, y: 54 }, { x: 100, y: 52 }, { x: 100, y: 81 }, { x: 73, y: 83 }]),
      semanticRoomRegion("foyer:umbrella-stand", "umbrella stand", "the umbrella stand at the lower right", [{ x: 88, y: 64 }, { x: 100, y: 62 }, { x: 100, y: 100 }, { x: 86, y: 100 }]),
      semanticRoomRegion("foyer:runner", "foyer runner", "the long rug across the entrance floor", [{ x: 35, y: 65 }, { x: 81, y: 63 }, { x: 83, y: 91 }, { x: 33, y: 92 }]),
    ],
  },
};

const ROOM_TEMPLATE_SPECS = [
  ["foyer", "Foyer", "🚪", ["console", "umbrella stand", "runner", "stair rail", "portrait", "chandelier", "coat hooks", "threshold"]],
  ["parlor", "Parlor", "🛋️", ["sideboard", "armchair", "sofa", "curtain", "painting", "mantel", "planter", "coffee table"]],
  ["library", "Library", "📚", ["reading desk", "globe", "bookcase", "ladder", "window seat", "fireplace", "display case", "rug"]],
  ["study", "Study", "✒️", ["writing desk", "wastebasket", "filing cabinet", "bookcase", "portrait", "lamp", "safe", "chair"]],
  ["dining-room", "Dining Room", "🍽️", ["sideboard", "place setting", "table", "curtain", "painting", "chandelier", "wine cart", "rug"]],
  ["kitchen", "Kitchen", "🍳", ["pantry", "sink", "island", "range", "upper cabinet", "window", "refrigerator", "prep board"]],
  ["conservatory", "Conservatory", "🌿", ["potting bench", "planter", "bench", "glass door", "hanging plant", "fountain", "tree", "tile"]],
  ["ballroom", "Ballroom Gallery", "🖼️", ["pedestal", "settee", "dance floor", "curtain", "portrait", "chandelier", "sculpture", "piano"]],
  ["primary-bedroom", "Primary Bedroom", "🛏️", ["dresser", "nightstand", "bed", "wardrobe", "mirror", "window", "chaise", "footlocker"]],
  ["guest-bedroom", "Guest Bedroom", "🕯️", ["luggage rack", "nightstand", "bed", "wardrobe", "picture frame", "window", "washstand", "rug"]],
  ["bathroom", "Bathroom", "🛁", ["vanity", "hamper", "bathtub", "linen cabinet", "mirror", "window", "medicine cabinet", "floor tile"]],
  ["attic", "Attic", "🕸️", ["trunk", "workbench", "covered furniture", "rafters", "old portrait", "dormer", "crate", "floorboards"]],
  ["cellar", "Cellar", "🧱", ["coal bin", "shelf", "work table", "boiler", "wall niche", "window well", "barrel", "drain"]],
  ["wine-room", "Wine Room", "🍷", ["case", "tasting table", "rack", "door", "label display", "sconce", "barrel", "stone floor"]],
  ["utility", "Utility & Storage", "🧰", ["tool chest", "laundry sink", "supply shelf", "service door", "fuse box", "high window", "locker", "floor drain"]],
  ["theater", "Theater", "🎬", ["screen", "projector", "media console", "wall inset", "doorway", "concession counter", "seating", "snack table"]],
  ["pool", "Pool", "🏊", ["pool", "hot tub", "window wall", "towel niche", "west bench", "east loungers", "pool deck", "far bench"]],
  ["rooftop-lounge", "Rooftop Lounge", "🌃", ["pergola", "bar", "sofa", "fire table", "armchair", "elevator", "planters", "terrace floor"]],
] as const;

const ROOM_PALETTES: readonly [string, string, string][] = [
  ["#25314b", "#9c7b62", "#d7c8b1"], ["#283c3a", "#a0685c", "#dbc5a4"],
  ["#352c45", "#82634a", "#c9b690"], ["#253541", "#765a4c", "#bda58a"],
  ["#3f2830", "#8f6b4c", "#d0b98a"],
] as const;

export const DEBATE_MYSTERY_ROOM_TEMPLATES: readonly DebateMysteryRoomTemplateV1[] =
  ROOM_TEMPLATE_SPECS.map(([id, defaultName, emoji, labels], templateIndex) => {
    const bundled = BUNDLED_ROOM_OVERRIDES[id];
    return {
      version: DEBATE_MYSTERY_SCHEMA_VERSION,
      id,
      name: bundled?.name ?? defaultName,
      emoji,
      nativeWidth: 1600,
      nativeHeight: 900,
      ...(bundled ? { bundledAssetPath: bundled.bundledAssetPath } : {}),
      palette: ROOM_PALETTES[templateIndex % ROOM_PALETTES.length]!,
      regions: (() => {
        const broadRegions = bundled
          ? bundled.regions.map((region) => ({
              ...region,
              keywords: [...region.keywords],
              polygon: region.polygon.map((point) => ({ ...point })),
            }))
          : labels.map((label, regionIndex) =>
              semanticRoomRegion(
                `${id}:${label.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
                label,
                `${label} and the immediately surrounding surface`,
                REGION_SHAPES[regionIndex % REGION_SHAPES.length]!,
              ),
            );
        return [...broadRegions, ...broadRegions.flatMap(mysteryDetailRegions)];
      })(),
    };
  });

/** Custom/accepted plates cannot honestly reuse object-level PRISM template
 * regions. These neutral scene regions preserve the same dense Examine grid. */
const GENERIC_PRESENTATION_ROOM_REGIONS: ReadonlyArray<{
  id: string;
  label: string;
  physicalAnchor: string;
  polygon: readonly DebateMysteryPointV1[];
}> = [
  { id: "scene-left-wall", label: "left wall", physicalAnchor: "the left wall of the room", polygon: [{ x: 0, y: 16 }, { x: 28, y: 14 }, { x: 29, y: 86 }, { x: 0, y: 88 }] },
  { id: "scene-center-surface", label: "center surface", physicalAnchor: "the center of the room", polygon: [{ x: 28, y: 24 }, { x: 73, y: 23 }, { x: 75, y: 79 }, { x: 26, y: 81 }] },
  { id: "scene-right-wall", label: "right wall", physicalAnchor: "the right wall of the room", polygon: [{ x: 72, y: 15 }, { x: 100, y: 14 }, { x: 100, y: 87 }, { x: 71, y: 88 }] },
  { id: "scene-foreground", label: "foreground", physicalAnchor: "the foreground of the room", polygon: [{ x: 12, y: 72 }, { x: 88, y: 71 }, { x: 91, y: 100 }, { x: 9, y: 100 }] },
];

/** One frozen decision drives art-aware click regions, authored observation
 * subjects, and deterministic placement fallbacks. */
export function debateMysteryRoomUsesBundledHotspotGeometryV1(room: Pick<
  DebateMysteryFloorplanRoomV1,
  "imageId" | "usesBundledHotspotGeometry"
> & {
  bundledAssetPath?: string | null;
  acceptedRoomAssetId?: string | null;
}): boolean {
  if (room.usesBundledHotspotGeometry !== undefined) {
    return room.usesBundledHotspotGeometry;
  }
  // The original deterministic scaffold did not carry presentation metadata.
  // Keep those compiled/portable V1 shapes on their historical templates.
  if (room.bundledAssetPath === undefined && room.acceptedRoomAssetId === undefined) {
    return true;
  }
  return !room.imageId && !room.acceptedRoomAssetId && Boolean(room.bundledAssetPath);
}

export function debateMysteryRoomPresentationRegionsV1(room: Pick<
  DebateMysteryFloorplanRoomV1,
  "templateId" | "imageId" | "usesBundledHotspotGeometry" | "presentationRegions"
> & {
  bundledAssetPath?: string | null;
  acceptedRoomAssetId?: string | null;
}): DebateMysteryRegionV1[] {
  if (room.presentationRegions?.length) {
    const authoredRegions = room.presentationRegions.map((region) => ({
      ...region,
      keywords: [...region.keywords],
      polygon: region.polygon.map((point) => ({ ...point })),
    }));
    if (authoredRegions.length >= 12) return authoredRegions;
    const authoredRegionIds = new Set(authoredRegions.map((region) => region.id));
    const neutralRegions = GENERIC_PRESENTATION_ROOM_REGIONS.map((region) =>
      semanticRoomRegion(
        `${room.templateId}:${region.id}`,
        region.label,
        region.physicalAnchor,
        region.polygon,
      )
    );
    return [
      ...authoredRegions,
      ...[...neutralRegions, ...neutralRegions.flatMap(mysteryDetailRegions)]
        .filter((region) => !authoredRegionIds.has(region.id)),
    ];
  }
  const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === room.templateId);
  if (template && debateMysteryRoomUsesBundledHotspotGeometryV1(room)) return template.regions;
  const broadRegions = GENERIC_PRESENTATION_ROOM_REGIONS.map((region) =>
    semanticRoomRegion(
      `${room.templateId}:${region.id}`,
      region.label,
      region.physicalAnchor,
      region.polygon,
    ));
  return [...broadRegions, ...broadRegions.flatMap(mysteryDetailRegions)];
}

export interface DebateMysteryResolvedRoomPresentationV1 {
  name: string;
  emoji: string;
  footprint: DebateMysteryRoomFootprintV1;
  regions: DebateMysteryRegionV1[];
  fixtureLabels: string[];
}

/** Shared legacy-or-venue presentation boundary. Consumers do not need to
 * assume that a venue room has a global mansion template. */
export function resolveDebateMysteryRoomPresentationV1(room: Pick<
  DebateMysteryFloorplanRoomV1,
  "templateId" | "imageId" | "usesBundledHotspotGeometry" | "presentationRegions"
> & {
  name?: string | null;
  emoji?: string | null;
  bundledAssetPath?: string | null;
  acceptedRoomAssetId?: string | null;
  venueContract?: { footprint: { width: number; height: number } } | null;
  placementAnchors?: readonly { name: string }[];
}): DebateMysteryResolvedRoomPresentationV1 {
  const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === room.templateId);
  const regions = debateMysteryRoomPresentationRegionsV1(room);
  const anchorLabels = (room.placementAnchors ?? []).map((anchor) => anchor.name.trim()).filter(Boolean);
  const fallbackName = room.templateId.replace(/^venue:/u, "").replaceAll("-", " ").trim() || "Room";
  const legacyFootprint = debateMysteryRoomFootprint(room.templateId);
  return {
    name: room.name?.trim() || template?.name || fallbackName,
    emoji: room.emoji?.trim() || template?.emoji || "◇",
    footprint: room.venueContract
      ? { roomTypeId: room.templateId, ...room.venueContract.footprint }
      : legacyFootprint,
    regions,
    fixtureLabels: [...new Set(anchorLabels.length > 0 ? anchorLabels : regions.map((region) => region.label))],
  };
}

export const DEBATE_MYSTERY_GROUND_FLOOR_ROOM_TYPE_IDS = [
  "foyer",
  "cellar",
  "utility",
] as const;
export const DEBATE_MYSTERY_TOP_FLOOR_ROOM_TYPE_IDS = [
  "attic",
  "rooftop-lounge",
] as const;

export type DebateMysteryRoomFloorRuleV1 = "ground-floor-only" | "top-floor-only" | null;

/** Architectural floor semantics shared by generated mansions, Mansion Editor,
 * package validation, and every UI that offers semantic room types. */
export function debateMysteryRoomFloorRuleV1(
  roomTypeId: string,
): DebateMysteryRoomFloorRuleV1 {
  const normalizedId = roomTypeId.trim().toLowerCase();
  if ((DEBATE_MYSTERY_GROUND_FLOOR_ROOM_TYPE_IDS as readonly string[]).includes(normalizedId)) {
    return "ground-floor-only";
  }
  if ((DEBATE_MYSTERY_TOP_FLOOR_ROOM_TYPE_IDS as readonly string[]).includes(normalizedId)) {
    return "top-floor-only";
  }
  return null;
}

export function debateMysteryRoomTypeIsAllowedOnFloorV1(
  roomTypeId: string,
  floor: number,
  topFloor: number,
): boolean {
  const rule = debateMysteryRoomFloorRuleV1(roomTypeId);
  if (rule === "ground-floor-only") return floor === 1;
  if (rule === "top-floor-only") return floor === topFloor;
  return true;
}

export interface DebateMysteryFloorplanRoomV1 {
  id: string;
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  neighborIds: string[];
  templateId: string;
  imageId: string | null;
  /** Frozen room presentation. Omitted compiled legacy cases retain their
   * original template hotspot geometry. */
  usesBundledHotspotGeometry?: boolean;
  /** Frozen venue anchor geometry. Server-owned physical planning derives it. */
  presentationRegions?: DebateMysteryRegionV1[];
  kind: DebateMysteryRoomKind;
  assignedSuspectSeatId: string | null;
}

/**
 * A room type is an authored mansion module; a floorplan room is its seeded
 * instance.  Keeping the two separate lets a Case Seed move a "Kitchen"
 * without turning its footprint into mutable session state.
 */
export interface DebateMysteryRoomFootprintV1 {
  roomTypeId: string;
  width: number;
  height: number;
}

export const DEBATE_MYSTERY_MANSION_GRID = { width: 28, height: 18 } as const;

const DEFAULT_ROOM_FOOTPRINT: Omit<DebateMysteryRoomFootprintV1, "roomTypeId"> = {
  width: 4,
  height: 3,
};

/** Stable normalized blueprint footprints, measured in mansion grid cells. */
export const DEBATE_MYSTERY_ROOM_FOOTPRINTS: readonly DebateMysteryRoomFootprintV1[] = [
  { roomTypeId: "bathroom", width: 2, height: 2 },
  { roomTypeId: "foyer", width: 3, height: 2 },
  { roomTypeId: "study", width: 3, height: 2 },
  { roomTypeId: "dining-room", width: 4, height: 2 },
  { roomTypeId: "kitchen", width: 4, height: 2 },
  { roomTypeId: "conservatory", width: 4, height: 2 },
  { roomTypeId: "library", width: 3, height: 3 },
  { roomTypeId: "parlor", width: 4, height: 3 },
  { roomTypeId: "primary-bedroom", width: 4, height: 3 },
  { roomTypeId: "guest-bedroom", width: 4, height: 3 },
  { roomTypeId: "cellar", width: 4, height: 3 },
  { roomTypeId: "theater", width: 4, height: 3 },
  { roomTypeId: "wine-room", width: 4, height: 3 },
  { roomTypeId: "ballroom", width: 5, height: 3 },
  { roomTypeId: "utility", width: 5, height: 3 },
  { roomTypeId: "pool", width: 5, height: 3 },
  { roomTypeId: "rooftop-lounge", width: 10, height: 6 },
] as const;

export function debateMysteryRoomFootprint(roomTypeId: string): DebateMysteryRoomFootprintV1 {
  const footprint = DEBATE_MYSTERY_ROOM_FOOTPRINTS.find((entry) => entry.roomTypeId === roomTypeId);
  return footprint ? { ...footprint } : { roomTypeId, ...DEFAULT_ROOM_FOOTPRINT };
}

export function debateMysteryRoomsShareEdge(
  left: Pick<DebateMysteryFloorplanRoomV1, "floor" | "x" | "y" | "width" | "height">,
  right: Pick<DebateMysteryFloorplanRoomV1, "floor" | "x" | "y" | "width" | "height">,
): boolean {
  if (left.floor !== right.floor) return false;
  const verticalTouch = left.x + left.width === right.x || right.x + right.width === left.x;
  const horizontalTouch = left.y + left.height === right.y || right.y + right.height === left.y;
  const verticalOverlap = Math.min(left.y + left.height, right.y + right.height) > Math.max(left.y, right.y);
  const horizontalOverlap = Math.min(left.x + left.width, right.x + right.width) > Math.max(left.x, right.x);
  return (verticalTouch && verticalOverlap) || (horizontalTouch && horizontalOverlap);
}

export interface DebateMysterySuspectSnapshotV1 {
  seatId: string;
  botId: string;
  exportHash: string | null;
  name: string;
  color: string | null;
  glyph: string | null;
  roomId: string;
}

export interface DebateMysteryPublicSuspectSnapshotV1 extends Omit<
  DebateMysterySuspectSnapshotV1,
  "roomId"
> {
  roomId: string | null;
}

export interface DebateMysteryEvidenceItemV1 {
  id: string;
  adjective: string;
  object: string;
  keywords: string[];
  title: string;
  observation: string;
  emoji: string;
  imageId: string | null;
  roomId: string;
  regionId: string;
  factTags: string[];
  /** Private relevance classification. It never reaches the public session until forensics. */
  relation: DebateMysteryEvidenceRelationV1;
  isPhysical: boolean;
  isCanonicalWeapon: boolean;
}

/** Evidence semantics used by the solver stay private. Players receive the
 * canonical observation, never route-scoring tags. */
export type DebateMysteryPublicEvidenceItemV1 = Omit<
  DebateMysteryEvidenceItemV1,
  "factTags" | "relation" | "isCanonicalWeapon"
>;

export interface DebateMysteryForensicFindingV1 {
  evidenceId: string;
  /** A deliberately narrow frozen finding: no route tags, actor knowledge, or other item data. */
  usedInMurder: boolean;
  contextualRelevance: "used" | "contextual" | "no_matching_trace";
  summary: string;
  completedAt: string;
}

export interface DebateMysteryInventoryItemV1 {
  id: string;
  title: string;
  description: string;
  emoji: string;
  keywords: string[];
  kind: DebateMysteryAccessItemKindV1;
  /** Player-facing material/form description, never the matching recipe. */
  accessStyle: string;
  sourceRoomId: string;
  sourceRegionId: string;
  evidenceId: string | null;
  usable: boolean;
  locked: boolean;
}

export interface DebateMysteryAccessResolutionV1 {
  id: string;
  accessItemTitle: string;
  targetKind: DebateMysteryLockTargetKindV1;
  targetLabel: string;
  success: boolean;
  observation: string;
  consumedItemTitles: string[];
  resultItemTitles: string[];
  resolvedAt: string;
}

/** A lock the player has physically found. The required access item remains
 * private so every recovered key, code, or remote stays a plausible choice. */
export interface DebateMysteryPublicAccessTargetV1 {
  targetKind: Extract<DebateMysteryLockTargetKindV1, "item" | "region">;
  targetId: string;
  targetLabel: string;
}

export interface DebateMysteryTestimonyExcerptV1 {
  id: string;
  speakerSeatId: string;
  exactQuote: string;
  factTags: string[];
  discovered: boolean;
}

export type DebateMysteryPublicTestimonyExcerptV1 = Omit<
  DebateMysteryTestimonyExcerptV1,
  "factTags"
>;

export interface DebateMysteryTheoryV1 {
  /** Charge-agnostic accusation. New V2 cases use this ordered, deduplicated
   * set; legacy cases derive it from culpritSeatId/accompliceSeatId. */
  accusedSeatIds?: string[];
  /** Public incident being prosecuted. Omitted by legacy homicide cases. */
  incidentId?: string;
  /** Player-authored concise theory of responsibility for the filed charge. */
  claim?: string;
  /** Legacy primary-defendant alias retained for saved V1/V2 murder cases. */
  culpritSeatId: string | null;
  method: string;
  motive: string;
  opportunity: string;
  accompliceSeatId: string | null;
  evidenceIds: string[];
  testimonyIds: string[];
}

export type DebateMysteryTheoryClaimKindV1 = "method" | "motive" | "opportunity";

/** A filing claim assembled from the player's public record. The value is
 * intentionally canonical so the API can reject hand-authored theory prose. */
export interface DebateMysteryTheoryClaimOptionV1 {
  id: string;
  value: string;
  sourceLabel: string;
}

export interface DebateMysteryVerdictV1 {
  grade: DebateMysteryRouteGrade;
  culpritCorrect: boolean;
  accompliceCorrect: boolean | null;
  matchedBundleId: string | null;
  credibilityRemaining: number;
  reason: string;
  deliveredAt: string;
}

export interface DebateMysteryCourtStateV1 {
  witnessTestimonyIds: string[];
  activeTestimonyId: string | null;
  examinedTestimonyIds: string[];
  sustainedTestimonyIds: string[];
  failedActions: number;
}

export interface DebateMysteryPublicObservationV1 {
  regionId: string;
  label: string;
  observation: string;
  outcomeKind: DebateMysteryRegionOutcomeKind;
  evidenceId: string | null;
  accessTargets: DebateMysteryPublicAccessTargetV1[];
}

export interface DebateMysteryInterviewMessageV1 {
  id: string;
  suspectSeatId: string;
  role: "investigator" | "suspect";
  content: string;
  evidenceId: string | null;
  createdAt: string;
}

export interface DebateMysteryPublicRoomV1 extends Omit<DebateMysteryFloorplanRoomV1, "templateId" | "imageId" | "kind" | "assignedSuspectSeatId"> {
  templateId: string | null;
  imageId: string | null;
  kind: DebateMysteryRoomKind | null;
  assignedSuspectSeatId: string | null;
  name: string | null;
  discovered: boolean;
  searched: boolean;
  /** Outcome-neutral semantic areas enabled for this frozen case. */
  activeRegionIds: string[];
  inspectedRegionIds: string[];
  inspectionCounts: Record<string, number>;
  observations: DebateMysteryPublicObservationV1[];
  locked: boolean;
  /** Legacy/latest aliases retained for version-one save compatibility. */
  activeRegionId: string | null;
  publicObservation: string | null;
  outcomeKind: DebateMysteryRegionOutcomeKind | null;
}

export interface DebateWhodunnitFormatStateV1 {
  version: typeof DEBATE_MYSTERY_SCHEMA_VERSION;
  format: "whodunnit";
  compileStage: DebateMysteryCompileStage;
  playPhase: DebateMysteryPlayPhase;
  /** Who owns the mansion phase before the public record is frozen for court. */
  investigationApproach: "undecided" | "player" | "partner";
  caseTitle: string;
  fictionLabel: "Fictional, non-canonical case";
  recipeSeed: string;
  caseSeedAvailable: boolean;
  /**
   * Version of the shared bot-Power projection already applied to every
   * bot-attributed string in this public state. Zero marks legacy saves that
   * still need a one-time transport-safe upgrade by the Debate runtime.
   */
  botSpeechProjectionVersion: number;
  config: DebateMysteryResolvedConfigV1;
  victim: { id: string; name: string };
  suspects: DebateMysteryPublicSuspectSnapshotV1[];
  rooms: DebateMysteryPublicRoomV1[];
  crimeSceneRoomId: string;
  currentRoomId: string;
  actionsRemaining: number;
  /** Public encounter ledger; reopening a met folder never costs an action. */
  metSuspectSeatIds: string[];
  activeActivity: DebateMysteryActiveActivityV1 | null;
  recoveredActionTokens: DebateMysteryRecoveredActionTokenV1[];
  inventoryItems: DebateMysteryInventoryItemV1[];
  accessHistory: DebateMysteryAccessResolutionV1[];
  discoveredEvidence: DebateMysteryPublicEvidenceItemV1[];
  forensicFindings: DebateMysteryForensicFindingV1[];
  testimony: DebateMysteryPublicTestimonyExcerptV1[];
  /** Public, Casekeeper-authored threads derived only from the discovered record. */
  leads: DebateMysteryPublicLeadV1[];
  partnerJournal: string[];
  partnerConsultations: DebateMysteryPartnerConsultationV1[];
  interviewLog: DebateMysteryInterviewMessageV1[];
  theory: DebateMysteryTheoryV1 | null;
  theoryFiledAt: string | null;
  credibilityRemaining: number;
  court: DebateMysteryCourtStateV1 | null;
  verdict: DebateMysteryVerdictV1 | null;
  spoilersRevealed: boolean;
}

export function debateMysteryTheoryClaimOptions(
  state: Pick<
    DebateWhodunnitFormatStateV1,
    "discoveredEvidence" | "forensicFindings" | "leads" | "rooms" | "suspects" | "testimony"
  >,
): Record<DebateMysteryTheoryClaimKindV1, DebateMysteryTheoryClaimOptionV1[]> {
  const evidence = state.discoveredEvidence.map((item) => ({
    id: `evidence:${item.id}`,
    value: `Evidence — ${item.title}: ${item.observation}`,
    sourceLabel: item.title,
  }));
  const forensics = state.forensicFindings.flatMap((finding) => {
    const item = state.discoveredEvidence.find((candidate) => candidate.id === finding.evidenceId);
    return item ? [{
      id: `forensics:${finding.evidenceId}`,
      value: `Forensics — ${item.title}: ${finding.summary}`,
      sourceLabel: `Forensics · ${item.title}`,
    }] : [];
  });
  const leads = state.leads.map((lead) => ({
    id: `lead:${lead.id}`,
    // Lead summaries revise as the public investigation advances. Filing uses
    // the stable public thread title so later lead revisions cannot invalidate
    // a point-and-click selection that the player already made.
    value: `Lead — ${lead.title}`,
    sourceLabel: lead.title,
  }));
  const testimony = state.testimony.map((item) => {
    const speaker = state.suspects.find((suspect) => suspect.seatId === item.speakerSeatId);
    const speakerName = speaker?.name ?? "Witness";
    return {
      id: `testimony:${item.id}`,
      value: `Testimony — ${speakerName}: “${item.exactQuote}”`,
      sourceLabel: `Testimony · ${speakerName}`,
    };
  });
  const observations = state.rooms.flatMap((room) => room.observations.map((observation) => ({
    id: `observation:${room.id}:${observation.regionId}`,
    value: `Room observation — ${room.name ?? "Discovered room"}: ${observation.observation}`,
    sourceLabel: `${room.name ?? "Discovered room"} · ${observation.label}`,
  })));

  return {
    method: [...forensics, ...evidence, ...leads],
    motive: [...leads, ...testimony, ...evidence],
    opportunity: [...testimony, ...observations, ...leads],
  };
}

export type DebateMysteryActionRequestV1 =
  | { expectedRevision: number; idempotencyKey: string; action: "choose_investigation_path"; path: "player" | "partner" }
  | { expectedRevision: number; idempotencyKey: string; action: "travel"; roomId: string }
  | { expectedRevision: number; idempotencyKey: string; action: "begin_investigation"; roomId: string }
  | { expectedRevision: number; idempotencyKey: string; action: "begin_interview"; suspectSeatId: string }
  | { expectedRevision: number; idempotencyKey: string; action: "end_activity" }
  | { expectedRevision: number; idempotencyKey: string; action: "inspect"; roomId: string; regionId: string }
  | { expectedRevision: number; idempotencyKey: string; action: "use_access_item"; accessItemId: string; targetKind: DebateMysteryLockTargetKindV1; targetId: string }
  | { expectedRevision: number; idempotencyKey: string; action: "forensic"; evidenceId: string }
  | { expectedRevision: number; idempotencyKey: string; action: "interview"; suspectSeatId: string; question: string; evidenceId?: string | null }
  | { expectedRevision: number; idempotencyKey: string; action: "consult_partner"; question: string }
  | { expectedRevision: number; idempotencyKey: string; action: "file_theory"; theory: DebateMysteryTheoryV1 }
  | { expectedRevision: number; idempotencyKey: string; action: "court_press"; testimonyId: string }
  | { expectedRevision: number; idempotencyKey: string; action: "court_present"; testimonyId: string; evidenceId: string }
  | { expectedRevision: number; idempotencyKey: string; action: "court_pass"; testimonyId: string }
  | { expectedRevision: number; idempotencyKey: string; action: "court_speak"; content: string }
  | { expectedRevision: number; idempotencyKey: string; action: "reveal_spoilers" };

export type DebateMysteryNotebookBlockKind =
  | "paragraph" | "heading" | "list" | "checkbox" | "reference" | "quote";

export interface DebateMysteryNotebookBlockV1 {
  id: string;
  kind: DebateMysteryNotebookBlockKind;
  text: string;
  checked?: boolean;
  referenceId?: string;
  referenceKind?: "room" | "evidence" | "testimony" | "lead";
  sourceBlockIds?: string[];
  /** Optional player annotation attached to the public revision they saw. */
  leadId?: string;
  leadRevision?: number;
}

export interface DebateMysteryNotebookPageV1 {
  id: string;
  title: string;
  blocks: DebateMysteryNotebookBlockV1[];
  createdAt: string;
  updatedAt: string;
}

export interface DebateMysteryNotebookV1 {
  version: 1;
  sessionId: string;
  revision: number;
  pages: DebateMysteryNotebookPageV1[];
  createdAt: string;
  updatedAt: string;
}

export interface DebateMysteryLeadAnnotationV2 {
  id: string;
  leadId: string;
  leadRevision: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface DebateMysterySuspectNoteV2 {
  seatId: string;
  text: string;
  updatedAt: string;
}

/** A player hypothesis. Pins do not become evidence or satisfy a theory. */
export interface DebateMysterySuspectPinV2 {
  id: string;
  referenceKind: "lead" | "evidence" | "testimony";
  referenceId: string;
  seatId: string;
  createdAt: string;
}

export interface DebateMysteryNotebookV2 {
  version: typeof DEBATE_MYSTERY_NOTEBOOK_VERSION;
  sessionId: string;
  revision: number;
  leadAnnotations: DebateMysteryLeadAnnotationV2[];
  suspectNotes: DebateMysterySuspectNoteV2[];
  suspectPins: DebateMysterySuspectPinV2[];
  createdAt: string;
  updatedAt: string;
}

export interface DebateMysteryNotebookCleanupPageV1 {
  pageId: string;
  proposedTitle: string;
  proposedBlocks: DebateMysteryNotebookBlockV1[];
}

export interface DebateMysteryNotebookCleanupProposalV1 {
  version: 1 | typeof DEBATE_MYSTERY_NOTEBOOK_VERSION;
  id: string;
  sessionId: string;
  sourceRevision: number;
  scopePageIds: string[];
  pages: DebateMysteryNotebookCleanupPageV1[];
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
}

export interface DebateMysteryCaseCodeV1 {
  version: typeof DEBATE_MYSTERY_SCHEMA_VERSION;
  /** Kept numeric so older, supported generators remain importable. */
  generatorVersion: number;
  encoding: "deflate-base64url";
  checksum: string;
  payload: string;
}

export interface DebateMysterySeatManifestV1 {
  seatId: string;
  exportHash: string | null;
}

export interface DebateMysteryPortableManifestV1 {
  version: typeof DEBATE_MYSTERY_SCHEMA_VERSION;
  generatorVersion: number;
  config: Omit<DebateMysteryResolvedConfigV1, "suspectBotIds" | "judgeBotId" | "prosecutorPartnerBotId" | "rivalDefenseBotId">;
  seats: DebateMysterySeatManifestV1[];
  case: Omit<DebateMysteryCaseBibleV1, "suspects" | "caseSeed">;
}

export interface DebateMysteryActiveRegionOutcomeV1 {
  roomId: string;
  regionId: string;
  kind: DebateMysteryRegionOutcomeKind;
  hidingMechanism: string;
  inspectionResponse: string;
  evidenceId: string | null;
  inventoryItemId: string | null;
  subplotResolution: string | null;
}

export interface DebateMysteryActionTokenPlacementV1 {
  id: string;
  roomId: string;
  regionId: string;
  amount: 1;
}

export interface DebateMysteryAccessLockV1 {
  id: string;
  targetKind: DebateMysteryLockTargetKindV1;
  /** Item ID, room ID, or `${roomId}:${regionId}`. */
  targetId: string;
  targetLabel: string;
  requiredAccessItemId: string;
  consumeAccessItem: boolean;
  consumeTargetItem: boolean;
  resultInventoryItemIds: string[];
  unlockObservation: string;
  failedAttemptResponses: string[];
  proofCritical: boolean;
}

export interface DebateMysteryActorKnowledgeV1 {
  seatId: string;
  role: "murderer" | "accomplice" | "innocent";
  relationshipToVictim: string;
  alibi: string;
  witnessedFacts: string[];
  beliefs: string[];
  secrets: string[];
  mistakes: string[];
  permittedLies: string[];
}

export interface DebateMysteryProofBundleV1 {
  id: "smoking-gun" | "strong-case" | "lucky-break";
  grade: Exclude<DebateMysteryRouteGrade, "incorrect">;
  culpritSeatId: string;
  requiredEvidenceIds: string[];
  requiredTestimonyIds: string[];
  requiredFactTags: string[];
  requiresAccomplice: boolean;
  requiredCourtContradictionId: string | null;
}

export type DebateMysteryLeadStatusV1 =
  | "active"
  | "advanced"
  | "reconciled"
  | "stalled"
  | "unresolved";

export interface DebateMysteryLeadStageV1 {
  status: DebateMysteryLeadStatusV1;
  summary: string;
  requiredEvidenceIds: string[];
  requiredTestimonyIds: string[];
  requiredForensicEvidenceIds: string[];
  /** Frozen `${roomId}:${regionId}` keys. Never projected to the client. */
  requiredObservationKeys: string[];
}

/** Server-private progression recipe. Its requirements can name canonical
 * facts, but the public projection below contains discovered references only. */
export interface DebateMysteryLeadDefinitionV1 {
  id: string;
  title: string;
  kind: "proof" | "subplot" | "dead_end" | "unresolved";
  stages: DebateMysteryLeadStageV1[];
}

export interface DebateMysteryPublicLeadV1 {
  id: string;
  title: string;
  status: DebateMysteryLeadStatusV1;
  summary: string;
  revision: number;
  linkedRoomIds: string[];
  linkedEvidenceIds: string[];
  linkedTestimonyIds: string[];
  addedAt: string;
  updatedAt: string;
}

export interface DebateMysteryCaseBibleV1 {
  version: typeof DEBATE_MYSTERY_SCHEMA_VERSION;
  generatorVersion: number;
  caseSeed: string;
  recipeSeed: string;
  title: string;
  victim: { id: string; name: string; description: string };
  culpritSeatId: string;
  accompliceSeatId: string | null;
  motive: string;
  method: string;
  weapon: {
    id: "canonical-weapon";
    category: DebateMysteryWeaponCategoryV1;
    /** For poison, this stays intentionally non-specific even inside public wording. */
    descriptor: string;
    revealedAtOpening: boolean;
  };
  timeline: Array<{ at: string; fact: string }>;
  suspects: DebateMysterySuspectSnapshotV1[];
  rooms: DebateMysteryFloorplanRoomV1[];
  crimeSceneRoomId: string;
  activeRegions: DebateMysteryActiveRegionOutcomeV1[];
  /** Frozen, server-private rewards. Only recovered tokens enter public state. */
  actionTokens?: DebateMysteryActionTokenPlacementV1[];
  inventoryItems: DebateMysteryInventoryItemV1[];
  accessLocks: DebateMysteryAccessLockV1[];
  evidence: DebateMysteryEvidenceItemV1[];
  testimony: DebateMysteryTestimonyExcerptV1[];
  actorKnowledge: DebateMysteryActorKnowledgeV1[];
  proofBundles: DebateMysteryProofBundleV1[];
  leadDefinitions: DebateMysteryLeadDefinitionV1[];
  publicOpening: string;
  fallbackProseUsed: boolean;
}

function debateMysteryLeadStageSatisfied(
  stage: DebateMysteryLeadStageV1,
  state: DebateWhodunnitFormatStateV1,
): boolean {
  const evidenceIds = new Set(state.discoveredEvidence.map((item) => item.id));
  const testimonyIds = new Set(state.testimony.map((item) => item.id));
  const forensicIds = new Set(state.forensicFindings.map((item) => item.evidenceId));
  const observationKeys = new Set(state.rooms.flatMap((room) =>
    room.observations.map((observation) => `${room.id}:${observation.regionId}`)));
  return stage.requiredEvidenceIds.every((id) => evidenceIds.has(id)) &&
    stage.requiredTestimonyIds.every((id) => testimonyIds.has(id)) &&
    stage.requiredForensicEvidenceIds.every((id) => forensicIds.has(id)) &&
    stage.requiredObservationKeys.every((key) => observationKeys.has(key));
}

/** Advances the automatic lead journal without projecting a definition's
 * undiscovered requirements. Existing timestamps remain stable for replay. */
export function updateDebateMysteryPublicLeads(
  bible: Pick<DebateMysteryCaseBibleV1, "leadDefinitions">,
  state: DebateWhodunnitFormatStateV1,
  occurredAt = new Date().toISOString(),
): DebateMysteryPublicLeadV1[] {
  const existingById = new Map((state.leads ?? []).map((lead) => [lead.id, lead]));
  return (bible.leadDefinitions ?? []).flatMap((definition) => {
    let stageIndex = -1;
    for (let index = 0; index < definition.stages.length; index += 1) {
      if (debateMysteryLeadStageSatisfied(definition.stages[index]!, state)) stageIndex = index;
    }
    if (stageIndex < 0) return [];
    const stage = definition.stages[stageIndex]!;
    const revision = stageIndex + 1;
    const existing = existingById.get(definition.id);
    const relevantStages = definition.stages.slice(0, stageIndex + 1);
    const discoveredRooms = new Set(state.rooms.filter((room) => room.discovered).map((room) => room.id));
    const discoveredEvidence = new Set(state.discoveredEvidence.map((item) => item.id));
    const discoveredTestimony = new Set(state.testimony.map((item) => item.id));
    const linkedObservationRooms = relevantStages.flatMap((entry) => entry.requiredObservationKeys.map((key) => key.split(":")[0] ?? ""));
    return [{
      id: definition.id,
      title: definition.title,
      status: stage.status,
      summary: stage.summary,
      revision,
      linkedRoomIds: [...new Set(linkedObservationRooms)].filter((id) => discoveredRooms.has(id)),
      linkedEvidenceIds: [...new Set(relevantStages.flatMap((entry) => entry.requiredEvidenceIds))].filter((id) => discoveredEvidence.has(id)),
      linkedTestimonyIds: [...new Set(relevantStages.flatMap((entry) => entry.requiredTestimonyIds))].filter((id) => discoveredTestimony.has(id)),
      addedAt: existing?.addedAt ?? occurredAt,
      updatedAt: existing && existing.revision === revision ? existing.updatedAt : occurredAt,
    }];
  });
}

function compact(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
}

function uniqueIds(values: unknown, max: number): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => compact(value, 200)).filter(Boolean))].slice(0, max);
}

function mysteryInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

export function resolveDebateMysteryConfig(
  value: DebateWhodunnitCreateConfigV1,
): DebateMysteryResolvedConfigV1 {
  const preset = DEBATE_MYSTERY_PRESETS.find((entry) => entry.id === value.preset);
  const suspectBotIds = uniqueIds(value.suspectBotIds, 8);
  const floors = preset ? preset.floors : mysteryInteger(value.floors, 1, 1, 3);
  const totalRooms = preset ? preset.rooms : mysteryInteger(value.totalRooms, floors * 5, 5, 18);
  if (suspectBotIds.length < 4 || suspectBotIds.length > 8) {
    throw new Error("Whodunnit requires between four and eight distinct suspects.");
  }
  if (totalRooms < suspectBotIds.length + 1) {
    throw new Error("Whodunnit requires at least one room beyond the suspect count.");
  }
  if (floors > totalRooms) throw new Error("Every mansion floor requires at least one room.");
  const prosecutorPartnerBotId = compact(value.prosecutorPartnerBotId, 200);
  const rivalDefenseBotId = compact(value.rivalDefenseBotId, 200);
  // Older saved recipes predate public Judge casting. Keep their PRISM seat
  // readable while every newly-authored Studio recipe supplies a Library bot.
  const judgeBotId = compact(value.judgeBotId, 200) || "prism:player-judge";
  if (!prosecutorPartnerBotId || !rivalDefenseBotId || prosecutorPartnerBotId === rivalDefenseBotId) {
    throw new Error("Choose distinct prosecutor partner and rival defense bots.");
  }
  if (suspectBotIds.includes(prosecutorPartnerBotId) || suspectBotIds.includes(rivalDefenseBotId)) {
    throw new Error("Counsel bots cannot also sit in the suspect ensemble.");
  }
  if (
    judgeBotId === prosecutorPartnerBotId
    || judgeBotId === rivalDefenseBotId
    || suspectBotIds.includes(judgeBotId)
  ) {
    throw new Error("The Judge must be distinct from every suspect and counsel bot.");
  }
  // Custom cases receive a broad discovery/search/interview baseline while
  // still requiring choices; preset budgets remain authored independently.
  const baseActions = preset?.classicActions ?? (2 * totalRooms + suspectBotIds.length + 2);
  const difficulty: DebateMysteryDifficulty = value.difficulty === "casual" || value.difficulty === "mastermind" ? value.difficulty : "classic";
  const actionBudget = difficulty === "casual" ? Math.ceil(baseActions * 1.25) : difficulty === "mastermind" ? Math.max(1, Math.floor(baseActions * 0.8)) : baseActions;
  return {
    version: DEBATE_MYSTERY_SCHEMA_VERSION,
    preset: preset?.id ?? "custom",
    difficulty,
    artMode: value.artMode === "generated" ? "generated" : "bundled",
    // Existing Whodunnit cases used the structured court without a Jury.
    formality: value.formality === undefined
      ? "structured"
      : normalizeDebateFormalityId(value.formality),
    juryEnabled: value.juryEnabled === true,
    playerRole: value.playerRole === "spectator" ? "spectator" : "participant",
    participationDifficulty:
      value.playerRole === "spectator"
        ? undefined
        : normalizeDebateParticipantDifficulty(value.participationDifficulty),
    inspiration: compact(value.inspiration, 240),
    nonce: compact(value.nonce, 160) || "surprise-me",
    floors,
    totalRooms,
    suspectBotIds,
    judgeBotId,
    prosecutorPartnerBotId,
    rivalDefenseBotId,
    actionBudget,
    accompliceChance: debateMysteryAccompliceChance(
      difficulty,
      preset?.id ?? "custom",
      suspectBotIds.length,
    ),
  };
}

function seedNumber(seed: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = seedNumber(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function choose<T>(values: readonly T[], random: () => number): T {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))]!;
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

/**
 * Builds one seed-stable room deck for the whole mansion. A bundled room is
 * deliberately held back from every case so even the largest mansion does not
 * automatically exhaust the visual catalog. Templates do not repeat until the
 * curated deck is exhausted (only possible for the largest custom cases).
 */
function mysteryRoomTemplateLineup(totalRooms: number, random: () => number): DebateMysteryRoomTemplateV1[] {
  const shuffledTemplates = shuffled(DEBATE_MYSTERY_ROOM_TEMPLATES, random);
  const bundledTemplates = shuffledTemplates.filter((template) => template.bundledAssetPath);
  const omittedBundledId = bundledTemplates.length > 0 ? choose(bundledTemplates, random).id : null;
  const availableTemplates = shuffledTemplates.filter((template) => template.id !== omittedBundledId);
  const lineup: DebateMysteryRoomTemplateV1[] = [];

  while (lineup.length < totalRooms) {
    const cycle = lineup.length === 0 ? availableTemplates : shuffled(availableTemplates, random);
    if (lineup.length > 0 && cycle.length > 1 && cycle[0]?.id === lineup[lineup.length - 1]?.id) {
      cycle.push(cycle.shift()!);
    }
    lineup.push(...cycle.slice(0, totalRooms - lineup.length));
  }

  return lineup;
}

export function debateMysteryRecipeSeed(config: DebateMysteryResolvedConfigV1): string {
  const stable = JSON.stringify({
    v: DEBATE_MYSTERY_GENERATOR_VERSION,
    nonce: config.nonce,
    preset: config.preset,
    difficulty: config.difficulty,
    artMode: config.artMode,
    formality: config.formality,
    juryEnabled: config.juryEnabled,
    playerRole: config.playerRole,
    participationDifficulty: config.participationDifficulty,
    inspiration: config.inspiration,
    floors: config.floors,
    totalRooms: config.totalRooms,
    suspects: config.suspectBotIds,
    judge: config.judgeBotId,
    prosecutor: config.prosecutorPartnerBotId,
    defense: config.rivalDefenseBotId,
  });
  return `recipe-v${DEBATE_MYSTERY_GENERATOR_VERSION}-${seedNumber(stable).toString(36).padStart(7, "0")}`;
}

function mansionRoomTypeLineup(config: DebateMysteryResolvedConfigV1, random: () => number): string[] {
  // The first five make a complete small house: entry circulation, catering,
  // and a private suite. Larger cases add the public wing before the quieter
  // rooms, so every architectural promise is either adjacent or deliberately
  // absent from a compact case.
  const architecturalOrder = config.totalRooms <= 5
    ? ["foyer", "dining-room", "kitchen", "primary-bedroom", "bathroom"]
    : [
        "foyer", "dining-room", "kitchen", "primary-bedroom", "bathroom",
        "library", "parlor", "study", "conservatory", "theater",
        "wine-room", "ballroom", "utility", "cellar", "pool",
        "guest-bedroom", "attic",
      ];
  const roofEligible = config.floors > 1 && config.totalRooms >= 12;
  if (roofEligible) architecturalOrder.push("rooftop-lounge");

  const criticalCount = config.totalRooms <= 5 ? 5 : 10;
  const selected = [
    ...architecturalOrder.slice(0, criticalCount),
    ...shuffled(architecturalOrder.slice(criticalCount), random),
  ].slice(0, config.totalRooms);
  const used = new Set(selected);
  const remaining = shuffled(
    mysteryRoomTemplateLineup(DEBATE_MYSTERY_ROOM_TEMPLATES.length, random)
      .map((template) => template.id)
      .filter((id) => !used.has(id) && id !== "rooftop-lounge"),
    random,
  );
  selected.push(...remaining.slice(0, config.totalRooms - selected.length));

  // Rooftop Lounge belongs on the top storey and is the final room on that
  // storey, reached through the same aligned vertical core as every other
  // floor. This preserves a reliable fallback when a custom case is too small
  // to include the roof at all.
  if (roofEligible && !selected.includes("rooftop-lounge")) {
    selected[selected.length - 1] = "rooftop-lounge";
  }
  return selected;
}

function mysteryRoomTypeClusters(roomTypeIds: readonly string[]): string[][] {
  const remaining = new Set(roomTypeIds);
  const clusters: string[][] = [];
  const takeCluster = (preferredOrder: readonly string[]) => {
    const cluster = preferredOrder.filter((roomTypeId) => remaining.delete(roomTypeId));
    if (cluster.length) clusters.push(cluster);
  };

  // Keep the authored adjacency groups contiguous and in their authored order.
  // The compact packer below still varies their spatial arrangement by seed,
  // without risking that a later room is boxed away from a required neighbor.
  takeCluster(["foyer", "ballroom"]);
  takeCluster(["dining-room", "kitchen", "utility"]);
  takeCluster(["primary-bedroom", "bathroom"]);
  for (const roomTypeId of remaining) clusters.push([roomTypeId]);
  return clusters;
}

function clusteredMysteryRoomTypes(roomTypeIds: readonly string[], random: () => number): string[] {
  const clusters = mysteryRoomTypeClusters(roomTypeIds);

  const foyerCluster = clusters.find((cluster) => cluster.includes("foyer"));
  const otherClusters = shuffled(
    clusters.filter((cluster) => cluster !== foyerCluster),
    random,
  );
  const orderedClusters = foyerCluster ? [foyerCluster, ...otherClusters] : otherClusters;
  return orderedClusters.flat();
}

function mansionFloorRoomTypes(
  roomTypeIds: readonly string[],
  floorCount: number,
  random: () => number,
): string[][] {
  const floors = Array.from({ length: floorCount }, () => [] as string[]);
  const clusters = mysteryRoomTypeClusters(roomTypeIds);
  const groundFloorClusters = clusters.filter((cluster) => cluster.some((roomTypeId) =>
    debateMysteryRoomFloorRuleV1(roomTypeId) === "ground-floor-only"));
  const topFloorClusters = clusters.filter((cluster) => cluster.some((roomTypeId) =>
    debateMysteryRoomFloorRuleV1(roomTypeId) === "top-floor-only"));
  const fixedFloorClusters = new Set([...groundFloorClusters, ...topFloorClusters]);
  const remaining = clusters.filter((cluster) => !fixedFloorClusters.has(cluster));
  const assign = (cluster: string[], floorIndex: number): void => {
    floors[floorIndex]!.push(...cluster);
    const index = remaining.indexOf(cluster);
    if (index >= 0) remaining.splice(index, 1);
  };

  for (const cluster of groundFloorClusters) floors[0]!.push(...cluster);
  for (const cluster of topFloorClusters) floors[floorCount - 1]!.push(...cluster);

  // Give every requested storey a real room group before balancing the rest.
  // Larger authored groups stay intact, so kitchen/dining, bedroom/bathroom,
  // and other promised adjacencies can never be split by an even room count.
  for (let floorIndex = floorCount - 1; floorIndex >= 0; floorIndex -= 1) {
    if (floors[floorIndex]!.length || remaining.length === 0) continue;
    const largestSize = Math.max(...remaining.map((cluster) => cluster.length));
    const largest = remaining.filter((cluster) => cluster.length === largestSize);
    const privateSuite = floorIndex > 0
      ? largest.find((cluster) => cluster.includes("primary-bedroom"))
      : undefined;
    assign(privateSuite ?? choose(largest, random), floorIndex);
  }

  for (const cluster of shuffled([...remaining], random)) {
    const lightestLoad = Math.min(...floors.map((floor) => floor.length));
    const lightestFloors = floors
      .map((floor, floorIndex) => ({ floor, floorIndex }))
      .filter(({ floor }) => floor.length === lightestLoad);
    const publicWing = cluster.some((roomTypeId) =>
      ["ballroom", "dining-room", "kitchen", "utility"].includes(roomTypeId));
    const privateWing = cluster.some((roomTypeId) =>
      ["primary-bedroom", "guest-bedroom", "bathroom"].includes(roomTypeId));
    const preference = (floorIndex: number): number =>
      publicWing ? (floorIndex === 0 ? 0 : 1) : privateWing ? (floorIndex === 0 ? 1 : 0) : 0;
    const preferredScore = Math.min(...lightestFloors.map(({ floorIndex }) => preference(floorIndex)));
    const preferredFloors = lightestFloors.filter(({ floorIndex }) => preference(floorIndex) === preferredScore);
    assign(cluster, choose(preferredFloors, random).floorIndex);
  }

  return floors.map((floorRoomTypeIds) => clusteredMysteryRoomTypes(floorRoomTypeIds, random));
}

const ARCHITECTURAL_ADJACENCY_PAIRS = [
  ["kitchen", "dining-room"],
  ["primary-bedroom", "bathroom"],
  ["foyer", "ballroom"],
  ["kitchen", "utility"],
] as const;

function mansionRoomCandidates(
  placedRooms: readonly DebateMysteryFloorplanRoomV1[],
  footprint: Pick<DebateMysteryRoomFootprintV1, "width" | "height">,
): Array<{ x: number; y: number }> {
  const candidates = new Map<string, { x: number; y: number }>();
  const add = (x: number, y: number) => candidates.set(`${x}:${y}`, { x, y });
  for (const room of placedRooms) {
    for (let x = room.x - footprint.width + 1; x < room.x + room.width; x += 1) {
      add(x, room.y - footprint.height);
      add(x, room.y + room.height);
    }
    for (let y = room.y - footprint.height + 1; y < room.y + room.height; y += 1) {
      add(room.x - footprint.width, y);
      add(room.x + room.width, y);
    }
  }
  return [...candidates.values()];
}

function roomsOverlap(
  left: Pick<DebateMysteryFloorplanRoomV1, "x" | "y" | "width" | "height">,
  right: Pick<DebateMysteryFloorplanRoomV1, "x" | "y" | "width" | "height">,
): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
}

function mansionRooms(config: DebateMysteryResolvedConfigV1, random: () => number): DebateMysteryFloorplanRoomV1[] {
  const roomTypeIds = mansionRoomTypeLineup(config, random);
  const roomTypesByFloor = mansionFloorRoomTypes(roomTypeIds, config.floors, random);
  const rooms: DebateMysteryFloorplanRoomV1[] = [];

  for (let floorIndex = 0; floorIndex < roomTypesByFloor.length; floorIndex += 1) {
    const floorRoomTypeIds = roomTypesByFloor[floorIndex]!;
    const count = floorRoomTypeIds.length;
    for (let index = 0; index < count; index += 1) {
      const globalIndex = rooms.length;
      const templateId = floorRoomTypeIds[index]!;
      const footprint = debateMysteryRoomFootprint(templateId);
      const placedOnFloor = rooms.filter((candidate) => candidate.floor === floorIndex + 1);
      const connectedTypes = new Set<string>(
        ARCHITECTURAL_ADJACENCY_PAIRS.flatMap(([left, right]) =>
          left === templateId ? [right] : right === templateId ? [left] : [],
        ),
      );
      const requiredNeighbors = placedOnFloor.filter((candidate) => connectedTypes.has(candidate.templateId));
      const roomPosition = placedOnFloor.length === 0
        ? { x: 0, y: 0 }
        : (() => {
            const candidates = mansionRoomCandidates(placedOnFloor, footprint)
              .filter((candidate) =>
                candidate.x >= 0 && candidate.y >= 0 &&
                candidate.x + footprint.width <= DEBATE_MYSTERY_MANSION_GRID.width &&
                candidate.y + footprint.height <= DEBATE_MYSTERY_MANSION_GRID.height &&
                !placedOnFloor.some((room) => roomsOverlap({ ...candidate, ...footprint }, room)),
              )
              .map((candidate) => {
                const roomShape = { floor: floorIndex + 1, ...candidate, ...footprint };
                const sharedNeighbors = placedOnFloor.filter((room) => debateMysteryRoomsShareEdge(room, roomShape));
                const allRequiredNeighborsConnected = requiredNeighbors.every((room) => sharedNeighbors.includes(room));
                const minX = Math.min(...placedOnFloor.map((room) => room.x), candidate.x);
                const minY = Math.min(...placedOnFloor.map((room) => room.y), candidate.y);
                const maxX = Math.max(...placedOnFloor.map((room) => room.x + room.width), candidate.x + footprint.width);
                const maxY = Math.max(...placedOnFloor.map((room) => room.y + room.height), candidate.y + footprint.height);
                const usesBothAxes = new Set([...placedOnFloor.map((room) => room.x), candidate.x]).size > 1 &&
                  new Set([...placedOnFloor.map((room) => room.y), candidate.y]).size > 1;
                return {
                  ...candidate,
                  sharedNeighbors,
                  allRequiredNeighborsConnected,
                  usesBothAxes,
                  // A short bounding-box side produces a building-shaped footprint,
                  // rather than extending a corridor whenever a side wall is free.
                  longestSide: Math.max(maxX - minX, maxY - minY),
                  area: (maxX - minX) * (maxY - minY),
                };
              })
              .filter((candidate) => candidate.allRequiredNeighborsConnected);
            if (candidates.length === 0) throw new Error(`Could not compactly place ${templateId} on floor ${floorIndex + 1}.`);
            candidates.sort((left, right) =>
              (placedOnFloor.length >= 2 ? Number(right.usesBothAxes) - Number(left.usesBothAxes) : 0) ||
              right.sharedNeighbors.length - left.sharedNeighbors.length ||
              left.longestSide - right.longestSide ||
              left.area - right.area ||
              left.x - right.x ||
              left.y - right.y,
            );
            const best = candidates.filter((candidate) =>
              (placedOnFloor.length < 2 || candidate.usesBothAxes === candidates[0]!.usesBothAxes) &&
              candidate.sharedNeighbors.length === candidates[0]!.sharedNeighbors.length &&
              candidate.longestSide === candidates[0]!.longestSide &&
              candidate.area === candidates[0]!.area,
            );
            return choose(best, random);
          })();
      const room: DebateMysteryFloorplanRoomV1 = {
        id: `room-${globalIndex + 1}`,
        floor: floorIndex + 1,
        x: roomPosition.x,
        y: roomPosition.y,
        width: footprint.width,
        height: footprint.height,
        neighborIds: [],
        templateId,
        imageId: null,
        kind: globalIndex === 0 ? "crime_scene" : globalIndex <= config.suspectBotIds.length ? "suspect" : "search",
        assignedSuspectSeatId: globalIndex > 0 && globalIndex <= config.suspectBotIds.length ? `suspect-${globalIndex}` : null,
      };
      for (const connection of placedOnFloor.filter((candidate) => debateMysteryRoomsShareEdge(candidate, room))) {
        connection.neighborIds.push(room.id);
        room.neighborIds.push(connection.id);
      }
      rooms.push(room);
    }
  }

  for (let floor = 2; floor <= config.floors; floor += 1) {
    const below = rooms.find((room) => room.floor === floor - 1)!;
    const above = rooms.find((room) => room.floor === floor)!;
    // Both room instances begin at (0, 0): a stable, aligned stairs/elevator
    // core. Cross-floor links are intentionally not drawn as same-floor doors.
    below.neighborIds.push(above.id);
    above.neighborIds.push(below.id);
  }
  return rooms;
}

function compileMansionRooms(
  config: DebateMysteryResolvedConfigV1,
  recipeSeed: string,
): DebateMysteryFloorplanRoomV1[] {
  let lastError: unknown;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    try {
      return mansionRooms(config, seededRandom(`${recipeSeed}:mansion:${attempt}`));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not arrange a connected mansion.");
}

const VICTIM_NAMES = ["Avery Vale", "Morgan Bell", "Dr. Rowan Glass", "Emery Thorne", "Quinn Marlowe"] as const;
const MOTIVES = ["to conceal a forged inheritance codicil", "to prevent the exposure of a long-running embezzlement", "to reclaim a reputation the victim had quietly destroyed", "to keep a secret partnership from becoming public", "to stop the victim from selling the estate and its hidden archive"] as const;
const ORDINARY_WEAPONS = ["a marble paperweight", "a heavy decanter", "a fireplace poker", "a brass letter opener"] as const;
const RECOGNIZABLE_WEAPONS = ["a revolver", "a hunting knife", "a ceremonial dagger", "a length of lead pipe"] as const;
const AUTHORED_SUBPLOTS = [
  "A pawn ticket tucked behind the frame shows that someone quietly sold a family heirloom last week; it explains their fear, not the killing.",
  "A half-finished apology reveals a private affair that ended before the storm; it makes the room tense, but does not touch the murder.",
  "Fresh paint hides a child’s height marks beneath the paneling. Someone was protecting a household memory, not a homicide secret.",
  "The sealed envelope is a notice of unpaid gambling debts. It is suspicious, personal, and raises new questions about the household.",
] as const;
const OBJECTS = [
  { adjective: "creased", object: "receipt", emoji: "🧾" },
  { adjective: "silvered", object: "key", emoji: "🗝️" },
  { adjective: "frayed", object: "thread", emoji: "🧵" },
  { adjective: "stained", object: "glass", emoji: "🥃" },
  { adjective: "stopped", object: "pocket watch", emoji: "⌚" },
  { adjective: "scorched", object: "letter", emoji: "✉️" },
] as const;
const HIDING_PATTERNS = [
  "taped beneath the {anchor}", "pressed into a narrow seam behind the {anchor}",
  "caught on the underside of the {anchor}", "concealed inside a false backing on the {anchor}",
  "mixed into the dust immediately below the {anchor}", "wedged between the {anchor} and the wall",
] as const;

const EMPTY_REGION_TEXTURES = {
  glass: [
    "Oblique light turns {anchor} into a map of wiped arcs and pale mineral bloom; the pattern stays broad and directionless.",
    "A breath of condensation clouds {anchor}, briefly revealing the uneven polish left by ordinary cleaning.",
    "The lens catches a faint double reflection in {anchor}; shifting a few inches resolves it into the room behind you.",
    "Along {anchor}, one wavering line looks like a scratch until the viewing angle reveals it as trapped light.",
  ],
  textile: [
    "The fibers of {anchor} change shade when brushed against the nap, then settle back without exposing a snag or seam.",
    "Close inspection of {anchor} finds dust held evenly through the weave and one harmless thread curled like a question mark.",
    "A slow pass over {anchor} releases the dry scent of fabric and cedar; the pile remains even beneath the lens.",
    "The edge of {anchor} lifts with a soft rasp, revealing the same faded backing from end to end.",
  ],
  wood: [
    "Raking light exposes a shallow swell in the grain of {anchor}, an old moisture mark that disappears when viewed head-on.",
    "A careful press along {anchor} produces a sequence of firm little creaks, each answered by solid joinery.",
    "The wax on {anchor} has pooled in the carved recesses, making the ornament look deeper than it is.",
    "One dark line across {anchor} resembles a gap until the lens resolves it into grain running beneath the finish.",
  ],
  metal: [
    "The metal around {anchor} holds a cold, dull shine and a crescent of limescale at its lowest edge.",
    "A light tap on {anchor} answers with a short, clean ring; nothing inside shifts or rattles.",
    "Fine polishing lines sweep across {anchor} in overlapping circles, catching the lens one band at a time.",
    "At close range, {anchor} reflects the room as a warped ribbon of light with no sharp mark interrupting it.",
  ],
  stone: [
    "One seam in {anchor} sits a fraction proud of the rest; pressure confirms that it is solid rather than loose.",
    "The surface of {anchor} cools the lens-side hand while tiny mica flecks wink and vanish under changing light.",
    "A hairline variation crosses {anchor}, but its softened edges show it belongs to the material rather than a fresh break.",
    "Knuckles draw a flat, dense note from {anchor}; the sound stays constant across the entire section.",
  ],
  paper: [
    "The edges along {anchor} form an uneven skyline of use and age, with settled dust continuing behind them.",
    "A dry paper-and-leather scent gathers around {anchor}; nothing in the visible sequence breaks its long-set rhythm.",
    "The lens follows a pale abrasion across {anchor} until it resolves into repeated contact from ordinary handling.",
    "A slight draft stirs the lightest edge of {anchor}, exposing only the shadowed surface immediately behind it.",
  ],
  general: [
    "A close pass over {anchor} catches a shift in texture that resolves into an old, carefully blended repair.",
    "From inches away, {anchor} gives up a quiet mixture of polish, cool air, and the room's settled stillness.",
    "The lens finds a tiny asymmetry in {anchor}; viewed from the other side, it becomes part of the original construction.",
    "A soft settling tick comes from {anchor} as the room cools, then the material falls silent again.",
  ],
} as const;

function emptyRegionTextureFamily(region: DebateMysteryRegionV1): keyof typeof EMPTY_REGION_TEXTURES {
  const material = `${region.label} ${region.physicalAnchor} ${region.keywords.join(" ")}`.toLocaleLowerCase();
  if (/\b(?:glass|mirror|window|shower)\b/u.test(material)) return "glass";
  if (/\b(?:rug|carpet|curtain|drape|linen|towel|bed|sofa|chair|cushion|upholster)\w*\b/u.test(material)) return "textile";
  if (/\b(?:book|paper|letter|ledger|magazine|shelf|spine)\w*\b/u.test(material)) return "paper";
  if (/\b(?:wood|cabinet|desk|table|door|panel|drawer|bookcase|sideboard|console)\w*\b/u.test(material)) return "wood";
  if (/\b(?:metal|faucet|handle|oven|range|sconce|rail|fixture|pipe)\w*\b/u.test(material)) return "metal";
  if (/\b(?:stone|floor|wall|tile|counter|bath|tub|hearth|fireplace|step|terrace)\w*\b/u.test(material)) return "stone";
  return "general";
}

function emptyRegionInspectionResponse(
  region: DebateMysteryRegionV1,
  random: () => number,
): string {
  const texture = choose(EMPTY_REGION_TEXTURES[emptyRegionTextureFamily(region)], random);
  return texture.replace("{anchor}", region.physicalAnchor.replace(/^the\s+/iu, "the "));
}

/** Boundary-stable for seed replay and direct probability tests. */
export function resolveDebateMysteryWeaponCategory(roll: number): DebateMysteryWeaponCategoryV1 {
  if (roll < 0.25) return "poison";
  if (roll < 0.75) return "ordinary_object";
  return "recognizable_weapon";
}

export function shouldRevealDebateMysteryWeaponAtOpening(roll: number): boolean {
  return roll < 0.5;
}

function compileCanonicalWeapon(random: () => number): DebateMysteryCaseBibleV1["weapon"] {
  const category = resolveDebateMysteryWeaponCategory(random());
  const descriptor = category === "poison"
    ? "an unknown poison"
    : category === "ordinary_object"
      ? choose(ORDINARY_WEAPONS, random)
      : choose(RECOGNIZABLE_WEAPONS, random);
  return { id: "canonical-weapon", category, descriptor, revealedAtOpening: shouldRevealDebateMysteryWeaponAtOpening(random()) };
}

function compileDebateMysteryLeadDefinitions(args: {
  config: DebateMysteryResolvedConfigV1;
  weapon: DebateMysteryCaseBibleV1["weapon"];
  evidence: DebateMysteryEvidenceItemV1[];
  testimony: DebateMysteryTestimonyExcerptV1[];
  activeRegions: DebateMysteryActiveRegionOutcomeV1[];
  suspects: DebateMysterySuspectSnapshotV1[];
  culpritSeatId: string;
}): DebateMysteryLeadDefinitionV1[] {
  const emptyRequirements = {
    requiredEvidenceIds: [] as string[],
    requiredTestimonyIds: [] as string[],
    requiredForensicEvidenceIds: [] as string[],
    requiredObservationKeys: [] as string[],
  };
  const canonicalWeapon = args.evidence.find((item) => item.isCanonicalWeapon)!;
  const unrelated = args.evidence.find((item) => item.relation === "unrelated") ?? null;
  const culpritTestimony = args.testimony.find((item) => item.speakerSeatId === args.culpritSeatId)!;
  const firstCorroboratingEvidence = args.evidence.find((item) => item.relation === "related") ?? canonicalWeapon;
  const subplotKeys = args.activeRegions
    .filter((outcome) => outcome.kind === "subplot")
    .map((outcome) => `${outcome.roomId}:${outcome.regionId}`);
  const definitions: DebateMysteryLeadDefinitionV1[] = [
    {
      id: "lead-final-hour",
      title: "The Victim’s Final Hour",
      kind: "unresolved",
      stages: [
        { ...emptyRequirements, status: "active", summary: "Reconstruct the victim’s last confirmed movements from rooms, objects, and witness accounts." },
        { ...emptyRequirements, requiredTestimonyIds: args.testimony.slice(0, 1).map((item) => item.id), status: "advanced", summary: "A witness account fixes one point in the evening. More of the timeline remains unconfirmed." },
        { ...emptyRequirements, requiredTestimonyIds: args.testimony.slice(0, 2).map((item) => item.id), status: "unresolved", summary: "The public accounts sketch the final hour, but they do not reconcile every movement." },
      ],
    },
    {
      id: "lead-method",
      title: args.weapon.revealedAtOpening ? "The Reported Murder Weapon" : "The Unidentified Method",
      kind: "proof",
      stages: [
        { ...emptyRequirements, status: "active", summary: args.weapon.revealedAtOpening ? "The opening report names a possible weapon, but its role still needs examination." : "Establish what caused the death and which recovered object, if any, belongs to that method." },
        { ...emptyRequirements, requiredEvidenceIds: [canonicalWeapon.id], status: "advanced", summary: "A recovered object now belongs in the method inquiry, but appearance alone does not prove its role." },
        { ...emptyRequirements, requiredEvidenceIds: [canonicalWeapon.id], requiredForensicEvidenceIds: [canonicalWeapon.id], status: "reconciled", summary: "Forensics has resolved the recovered object’s relationship to the murder method." },
      ],
    },
    {
      id: "lead-conflicting-accounts",
      title: "Conflicting Accounts",
      kind: "proof",
      stages: [
        { ...emptyRequirements, requiredTestimonyIds: args.testimony.slice(0, 2).map((item) => item.id), status: "active", summary: "Two statements now occupy the record. Compare their timing, locations, and points of uncertainty." },
        { ...emptyRequirements, requiredEvidenceIds: [firstCorroboratingEvidence.id], requiredTestimonyIds: [culpritTestimony.id], status: "advanced", summary: "One recorded denial is under pressure from the physical record." },
        { ...emptyRequirements, requiredEvidenceIds: [canonicalWeapon.id, firstCorroboratingEvidence.id], requiredTestimonyIds: [culpritTestimony.id], status: "reconciled", summary: "The discovered record now establishes a concrete contradiction to carry into court." },
      ],
    },
  ];
  if (subplotKeys.length > 0) {
    definitions.push({
      id: "lead-household-secret",
      title: "A Household Secret",
      kind: "subplot",
      stages: [
        { ...emptyRequirements, requiredObservationKeys: subplotKeys.slice(0, 1), status: "active", summary: "A private thread in the mansion may explain behavior without explaining the murder." },
        ...(subplotKeys.length > 1 ? [{ ...emptyRequirements, requiredObservationKeys: subplotKeys.slice(0, 2), status: "reconciled" as const, summary: "The private thread now makes sense on its own terms. It does not need to resolve the murder." }] : []),
      ],
    });
  }
  if (unrelated) {
    definitions.push({
      id: "lead-misplaced-object",
      title: "The Suspicious Object",
      kind: "dead_end",
      stages: [
        { ...emptyRequirements, requiredEvidenceIds: [unrelated.id], status: "active", summary: "A recovered object looks suspicious, but its significance has not been established." },
        { ...emptyRequirements, requiredEvidenceIds: [unrelated.id], requiredForensicEvidenceIds: [unrelated.id], status: "stalled", summary: "Examination did not connect this object to the known method. Its presence remains unexplained." },
      ],
    });
  }
  const desiredCount = args.config.preset === "compact" ? 5
    : args.config.preset === "standard" ? 7
      : args.config.preset === "grand" ? 9
        : Math.max(5, Math.min(10, Math.round(args.config.totalRooms / 2)));
  for (const statement of args.testimony) {
    if (definitions.length >= desiredCount) break;
    const suspect = args.suspects.find((item) => item.seatId === statement.speakerSeatId)!;
    definitions.push({
      id: `lead-account-${statement.speakerSeatId}`,
      title: `${suspect.name}’s Account`,
      kind: "unresolved",
      stages: [
        { ...emptyRequirements, requiredTestimonyIds: [statement.id], status: "active", summary: `${suspect.name} has committed an account to the record. It can be compared with later discoveries.` },
        { ...emptyRequirements, requiredEvidenceIds: [firstCorroboratingEvidence.id], requiredTestimonyIds: [statement.id], status: "advanced", summary: `${suspect.name}’s account can now be weighed against a discovered physical fact, without treating either as a conclusion.` },
      ],
    });
  }
  return definitions.slice(0, desiredCount);
}

export function compileDeterministicDebateMystery(args: {
  config: DebateMysteryResolvedConfigV1;
  suspects: Omit<DebateMysterySuspectSnapshotV1, "seatId" | "roomId">[];
  /** Optional aggregate-owned mansion layout. Story/clues remain newly compiled. */
  roomBlueprint?: readonly DebateMysteryFloorplanRoomV1[];
}): DebateMysteryCaseBibleV1 {
  const recipeSeed = debateMysteryRecipeSeed(args.config);
  const random = seededRandom(`${recipeSeed}:${args.config.inspiration}`);
  // Large custom floorplans can occasionally paint a greedy layout into a
  // corner. Retry from seed-derived candidates so generation stays stable and
  // never depends on runtime timing or an unseeded fallback.
  const compiledRooms = args.roomBlueprint
    ? args.roomBlueprint.map((room) => ({
        ...room,
        neighborIds: [...room.neighborIds],
      }))
    : compileMansionRooms(args.config, recipeSeed);
  if (args.roomBlueprint) {
    if (compiledRooms.length !== args.config.totalRooms) {
      throw new Error("The reusable mansion room count no longer matches this case setup.");
    }
    const roomIds = new Set(compiledRooms.map((room) => room.id));
    if (
      roomIds.size !== compiledRooms.length ||
      compiledRooms.some((room) =>
        (!DEBATE_MYSTERY_ROOM_TEMPLATES.some((template) => template.id === room.templateId) &&
          room.usesBundledHotspotGeometry !== false) ||
        !Number.isInteger(room.floor) || room.floor < 1 ||
        !Number.isFinite(room.x) || !Number.isFinite(room.y) ||
        !Number.isFinite(room.width) || room.width <= 0 ||
        !Number.isFinite(room.height) || room.height <= 0 ||
        room.neighborIds.some((neighborId) => !roomIds.has(neighborId)))
    ) {
      throw new Error("The reusable mansion layout failed structural validation.");
    }
    const assignedRooms = compiledRooms
      .filter((room) => room.assignedSuspectSeatId)
      .sort((left, right) =>
        (left.assignedSuspectSeatId ?? "").localeCompare(right.assignedSuspectSeatId ?? ""));
    if (assignedRooms.length !== args.suspects.length) {
      throw new Error("The reusable mansion requires the same number of suspect rooms.");
    }
    compiledRooms.forEach((room) => {
      room.assignedSuspectSeatId = null;
    });
    assignedRooms.forEach((room, index) => {
      room.assignedSuspectSeatId = `suspect-${index + 1}`;
    });
  }
  const authoredIncidentScene = args.roomBlueprint
    ? compiledRooms.find((room) => room.kind === "crime_scene") ?? null
    : null;
  const incidentSceneCandidates = compiledRooms.filter((room) =>
    room.templateId !== "foyer",
  );
  const incidentScene = authoredIncidentScene ?? choose(
    incidentSceneCandidates.length > 0
      ? incidentSceneCandidates
      : compiledRooms,
    seededRandom(`${recipeSeed}:incident-scene`),
  );
  const rooms = compiledRooms;
  rooms.forEach((room) => {
    room.kind = room.id === incidentScene.id
      ? "crime_scene"
      : room.assignedSuspectSeatId
        ? "suspect"
        : "search";
  });
  const suspects = args.suspects.map((suspect, index) => ({
    ...suspect,
    seatId: `suspect-${index + 1}`,
    roomId: rooms.find((room) => room.assignedSuspectSeatId === `suspect-${index + 1}`)!.id,
  }));
  const culprit = choose(suspects, random);
  const accomplice = random() < args.config.accompliceChance
    ? choose(suspects.filter((suspect) => suspect.seatId !== culprit.seatId), random)
    : null;
  const victimName = choose(VICTIM_NAMES, random);
  const weapon = compileCanonicalWeapon(random);
  const method = weapon.category === "poison"
    ? "an unknown poison administered in a restorative cordial"
    : `a fatal blow from ${weapon.descriptor}`;
  const motive = choose(MOTIVES, random);
  // A suspect room is still a real place in the mansion. Interviewing its
  // occupant and searching its outcome-neutral regions are separate,
  // player-controlled activities. Each room exposes several deterministic
  // areas so the same art supports different investigative texture per case.
  const searchableRooms = [
    incidentScene,
    ...rooms.filter((room) => room.id !== incidentScene.id),
  ];
  const activeRegions: DebateMysteryActiveRegionOutcomeV1[] = [];
  const evidence: DebateMysteryEvidenceItemV1[] = [];
  searchableRooms.forEach((room, index) => {
    const presentationRegions = debateMysteryRoomPresentationRegionsV1(room);
    const authoredRegionIds = new Set(
      room.presentationRegions?.map((region) => region.id) ?? [],
    );
    const detailRegions = presentationRegions.filter((region) =>
      region.id.includes(":detail-") || authoredRegionIds.has(region.id)
    );
    const shuffledRegions = shuffled(detailRegions.length ? detailRegions : presentationRegions, random);
    const region = shuffledRegions[0]!;
    const mustBeClue = index < Math.min(4, searchableRooms.length);
    const kind: DebateMysteryRegionOutcomeKind = mustBeClue ? "clue" : random() < 0.34 ? "subplot" : "empty";
    const hidingMechanism = choose(HIDING_PATTERNS, random).replace("{anchor}", region.label.toLowerCase());
    const object = OBJECTS[index % OBJECTS.length]!;
    const evidenceId = kind === "clue" ? `evidence-${index + 1}` : null;
    if (evidenceId) {
      const relation: DebateMysteryEvidenceRelationV1 = index === 0
        ? "canonical"
        : index === 2
          ? "unrelated"
          : "related";
      const factTags = relation === "unrelated"
        ? []
        : index === 0
        ? searchableRooms.length === 1
          ? ["identity", "method", "motive", "opportunity", "contradiction"]
          : ["identity", "opportunity", "contradiction"]
        : index === 1
          ? ["method", "timeline", ...(searchableRooms.length === 2 ? ["motive" as const] : [])]
          : index === 3
            ? ["motive"]
            : ["timeline"];
      const weaponEvidence = index === 0;
      const descriptor = weaponEvidence ? weapon.descriptor : object.object;
      const adjective = weaponEvidence ? "recovered" : object.adjective;
      evidence.push({
        id: evidenceId,
        adjective,
        object: descriptor,
        keywords: [adjective, descriptor, ...region.keywords],
        title: `${adjective[0]!.toUpperCase()}${adjective.slice(1)} ${descriptor}`,
        observation: weaponEvidence
          ? `The recovered ${descriptor} was hidden ${hidingMechanism}. Its place in the case has not yet been established.`
          : relation === "unrelated"
            ? `The ${object.adjective} ${object.object} looks incriminating at first glance, but its significance is still untested.`
            : index === 1
              ? `The ${object.adjective} ${object.object} carries a physical trace consistent with ${method}.`
              : index === 3
                ? `The ${object.adjective} ${object.object} records the private conflict that gave someone reason ${motive}.`
                : `The ${object.adjective} ${object.object} fixes an important movement in the mansion’s timeline.`,
        emoji: weaponEvidence
          ? weapon.category === "poison" ? "🧪" : weapon.category === "ordinary_object" ? "🪨" : "🗡️"
          : object.emoji,
        imageId: null,
        roomId: room.id,
        regionId: region.id,
        factTags,
        relation,
        isPhysical: true,
        isCanonicalWeapon: weaponEvidence,
      });
    }
    activeRegions.push({
      roomId: room.id,
      regionId: region.id,
      kind,
      hidingMechanism,
      inspectionResponse: kind === "clue"
        ? `There is something here: ${evidence.find((item) => item.id === evidenceId)?.title.toLowerCase() ?? `a ${object.adjective} ${object.object}`}, ${hidingMechanism}.`
        : kind === "subplot"
          ? choose(AUTHORED_SUBPLOTS, random)
          : emptyRegionInspectionResponse(region, random),
      evidenceId,
      inventoryItemId: null,
      subplotResolution: kind === "subplot" ? choose(AUTHORED_SUBPLOTS, random) : null,
    });
    const desiredRegionCount = args.config.difficulty === "casual" ? 12 : args.config.difficulty === "mastermind" ? 20 : 16;
    const contextualRegions = shuffledRegions.slice(1, Math.min(desiredRegionCount, shuffledRegions.length));
    for (const [contextIndex, contextualRegion] of contextualRegions.entries()) {
      const contextualKind: DebateMysteryRegionOutcomeKind =
        contextIndex === 0 && random() < 0.42 ? "subplot" : "empty";
      const contextualMechanism = choose(HIDING_PATTERNS, random).replace(
        "{anchor}",
        contextualRegion.label.toLowerCase(),
      );
      activeRegions.push({
        roomId: room.id,
        regionId: contextualRegion.id,
        kind: contextualKind,
        hidingMechanism: contextualMechanism,
        inspectionResponse:
          contextualKind === "subplot"
            ? choose(AUTHORED_SUBPLOTS, random)
            : emptyRegionInspectionResponse(contextualRegion, random),
        evidenceId: null,
        inventoryItemId: null,
        subplotResolution:
          contextualKind === "subplot"
            ? choose(AUTHORED_SUBPLOTS, random)
            : null,
      });
    }
  });
  const inventoryItems: DebateMysteryInventoryItemV1[] = [];
  const accessLocks: DebateMysteryAccessLockV1[] = [];
  const claimedInventoryRegions = new Set<string>();
  const claimInventoryOutcome = (
    preferredRoomIds: readonly string[],
    excludedRegionKeys: ReadonlySet<string> = new Set(),
  ): DebateMysteryActiveRegionOutcomeV1 => {
    const candidates = activeRegions.filter((outcome) => {
      const key = `${outcome.roomId}:${outcome.regionId}`;
      return preferredRoomIds.includes(outcome.roomId) &&
        !claimedInventoryRegions.has(key) &&
        !excludedRegionKeys.has(key) &&
        outcome.evidenceId === null &&
        outcome.inventoryItemId === null;
    });
    const outcome = candidates[0] ?? activeRegions.find((candidate) => {
      const key = `${candidate.roomId}:${candidate.regionId}`;
      return !claimedInventoryRegions.has(key) && !excludedRegionKeys.has(key) && candidate.evidenceId === null && candidate.inventoryItemId === null;
    });
    if (!outcome) throw new Error("The mansion does not contain enough independent access-item regions.");
    claimedInventoryRegions.add(`${outcome.roomId}:${outcome.regionId}`);
    return outcome;
  };
  const placeInventoryItem = (
    definition: Omit<DebateMysteryInventoryItemV1, "sourceRoomId" | "sourceRegionId">,
    outcome: DebateMysteryActiveRegionOutcomeV1,
  ): DebateMysteryInventoryItemV1 => {
    const item: DebateMysteryInventoryItemV1 = {
      ...definition,
      sourceRoomId: outcome.roomId,
      sourceRegionId: outcome.regionId,
    };
    inventoryItems.push(item);
    outcome.kind = "clue";
    outcome.inventoryItemId = item.id;
    outcome.inspectionResponse = `You recover ${item.title.toLowerCase()} ${outcome.hidingMechanism}. ${item.description}`;
    return item;
  };
  const crimeSceneRegionIds = [incidentScene.id];

  const goldKey = placeInventoryItem({
    id: "access-delicate-gold-key",
    title: "Delicate gold key",
    description: "Its tiny, finely cut teeth suggest a personal box rather than a door.",
    emoji: "🗝️",
    keywords: ["delicate", "gold", "key", "small lock"],
    kind: "key",
    accessStyle: "delicate gold key",
    evidenceId: null,
    usable: true,
    locked: false,
  }, claimInventoryOutcome(crimeSceneRegionIds));
  const jewelryBoxOutcome = claimInventoryOutcome(crimeSceneRegionIds);
  const jewelryBoxEvidenceId = "evidence-locked-jewelry-box";
  const jewelryBox = placeInventoryItem({
    id: "container-locked-jewelry-box",
    title: "Locked jewelry box",
    description: "The box is intact and sealed; whatever it contains remains unknown.",
    emoji: "🎁",
    keywords: ["locked", "jewelry", "box", "small lock"],
    kind: "container",
    accessStyle: "delicate gold lock",
    evidenceId: jewelryBoxEvidenceId,
    usable: false,
    locked: true,
  }, jewelryBoxOutcome);
  jewelryBoxOutcome.evidenceId = jewelryBoxEvidenceId;
  evidence.push({
    id: jewelryBoxEvidenceId,
    adjective: "locked",
    object: "jewelry box",
    keywords: [...jewelryBox.keywords],
    title: jewelryBox.title,
    observation: "The jewelry box is physically present, but its contents and significance cannot yet be established.",
    emoji: jewelryBox.emoji,
    imageId: null,
    roomId: jewelryBox.sourceRoomId,
    regionId: jewelryBox.sourceRegionId,
    factTags: [],
    relation: "unrelated",
    isPhysical: true,
    isCanonicalWeapon: false,
  });
  const heirloomJewels: DebateMysteryInventoryItemV1 = {
    id: "artifact-heirloom-jewels",
    title: "Heirloom jewels",
    description: "The opened box reveals a conspicuously incomplete heirloom collection.",
    emoji: "💎",
    keywords: ["heirloom", "jewels", "wealth", "inheritance"],
    kind: "artifact",
    accessStyle: "revealed contents",
    sourceRoomId: jewelryBox.sourceRoomId,
    sourceRegionId: jewelryBox.sourceRegionId,
    evidenceId: "evidence-heirloom-jewels",
    usable: false,
    locked: false,
  };
  inventoryItems.push(heirloomJewels);
  evidence.push({
    id: heirloomJewels.evidenceId!,
    adjective: "heirloom",
    object: "jewels",
    keywords: [...heirloomJewels.keywords],
    title: heirloomJewels.title,
    observation: "The opened box reveals missing heirloom pieces and records of a bitter dispute over the victim's wealth.",
    emoji: heirloomJewels.emoji,
    imageId: null,
    roomId: heirloomJewels.sourceRoomId,
    regionId: heirloomJewels.sourceRegionId,
    factTags: ["motive"],
    relation: "related",
    isPhysical: true,
    isCanonicalWeapon: false,
  });
  accessLocks.push({
    id: "lock-jewelry-box",
    targetKind: "item",
    targetId: jewelryBox.id,
    targetLabel: jewelryBox.title,
    requiredAccessItemId: goldKey.id,
    consumeAccessItem: true,
    consumeTargetItem: true,
    resultInventoryItemIds: [heirloomJewels.id],
    unlockObservation: "The delicate key turns cleanly. The jewelry box opens to reveal heirloom jewels and the gaps where several pieces once rested.",
    failedAttemptResponses: ["The mechanism resists without damage.", "The shapes meet, but the lock does not turn."],
    proofCritical: true,
  });

  const unoccupiedRooms = rooms.filter((room) => room.id !== incidentScene.id && !room.assignedSuspectSeatId);
  const lockableRoom = unoccupiedRooms.find((room) => room.templateId === "conservatory") ??
    unoccupiedRooms.find((room) => room.templateId === "utility") ??
    unoccupiedRooms.at(-1) ?? null;
  if (lockableRoom) {
    const roomUsesRemote = lockableRoom.templateId === "utility";
    const roomAccessItem = placeInventoryItem({
      id: roomUsesRemote ? "access-garage-remote" : "access-silver-key",
      title: roomUsesRemote ? "Garage door remote" : "Silver key",
      description: roomUsesRemote ? "A single raised button waits beneath a scuffed plastic cover." : "A long silver key bears the same geometric motif used on the mansion's private doors.",
      emoji: roomUsesRemote ? "📟" : "🗝️",
      keywords: roomUsesRemote ? ["garage", "remote", "door"] : ["silver", "key", "door"],
      kind: roomUsesRemote ? "remote" : "key",
      accessStyle: roomUsesRemote ? "remote garage control" : "silver architectural key",
      evidenceId: null,
      usable: true,
      locked: false,
    }, claimInventoryOutcome(crimeSceneRegionIds));
    accessLocks.push({
      id: "lock-mansion-room",
      targetKind: "room",
      targetId: lockableRoom.id,
      targetLabel: DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === lockableRoom.templateId)?.name ?? "Locked room",
      requiredAccessItemId: roomAccessItem.id,
      consumeAccessItem: true,
      consumeTargetItem: false,
      resultInventoryItemIds: [],
      unlockObservation: roomUsesRemote ? "The remote chirps. Somewhere beyond the wall, the garage door releases." : "The silver key turns and the private room's lock retracts.",
      failedAttemptResponses: ["Nothing in the mechanism responds.", "The room remains secured."],
      proofCritical: false,
    });
  }

  const safeRoom = rooms.find((room) => room.id !== incidentScene.id && room.id !== lockableRoom?.id) ?? incidentScene;
  const safeOutcome = claimInventoryOutcome([safeRoom.id]);
  safeOutcome.kind = "empty";
  safeOutcome.inspectionResponse = "A minute break in the surface suggests a concealed safe. Its keypad is dark, and no contents are visible.";
  const safeRegionTarget = `${safeRoom.id}:${safeOutcome.regionId}`;
  const safeCode = placeInventoryItem({
    id: "access-safe-code",
    title: "Safe code",
    description: "A short number sequence is written in deliberate groups, without naming what it opens.",
    emoji: "🔢",
    keywords: ["safe", "code", "numbers", "combination"],
    kind: "code",
    accessStyle: "written safe combination",
    evidenceId: null,
    usable: true,
    locked: false,
  }, claimInventoryOutcome(crimeSceneRegionIds, new Set([safeRegionTarget])));
  const privateLedger: DebateMysteryInventoryItemV1 = {
    id: "artifact-private-ledger",
    title: "Private ledger",
    description: "A narrow ledger rests inside the concealed safe.",
    emoji: "📕",
    keywords: ["private", "ledger", "safe", "accounts"],
    kind: "artifact",
    accessStyle: "revealed safe contents",
    sourceRoomId: safeRoom.id,
    sourceRegionId: safeOutcome.regionId,
    evidenceId: "evidence-private-ledger",
    usable: false,
    locked: false,
  };
  inventoryItems.push(privateLedger);
  evidence.push({
    id: privateLedger.evidenceId!,
    adjective: "private",
    object: "ledger",
    keywords: [...privateLedger.keywords],
    title: privateLedger.title,
    observation: "The private ledger records concealed transfers and appointments whose meaning must be weighed against the rest of the case.",
    emoji: privateLedger.emoji,
    imageId: null,
    roomId: privateLedger.sourceRoomId,
    regionId: privateLedger.sourceRegionId,
    factTags: [],
    relation: "unrelated",
    isPhysical: true,
    isCanonicalWeapon: false,
  });
  accessLocks.push({
    id: "lock-hidden-safe",
    targetKind: "region",
    targetId: safeRegionTarget,
    targetLabel: "concealed safe",
    requiredAccessItemId: safeCode.id,
    consumeAccessItem: true,
    consumeTargetItem: false,
    resultInventoryItemIds: [privateLedger.id],
    unlockObservation: "The code is accepted. A hidden safe opens flush with the wall, revealing a private ledger.",
    failedAttemptResponses: ["The panel remains flush and silent.", "No mechanism answers this item."],
    proofCritical: false,
  });

  if (args.config.difficulty !== "casual") {
    placeInventoryItem({
      id: "access-tarnished-key",
      title: "Tarnished key",
      description: "Its worn teeth and darkened bow could belong to something old in the house.",
      emoji: "🗝️",
      keywords: ["tarnished", "old", "key"],
      kind: "key",
      accessStyle: "tarnished old key",
      evidenceId: null,
      usable: true,
      locked: false,
    }, claimInventoryOutcome(rooms.map((room) => room.id)));
  }
  const actionTokenRandom = seededRandom(`${recipeSeed}:action-tokens`);
  const actionTokenCount = Math.max(1, Math.round(rooms.length / 5));
  const lockedActionTokenRoomIds = new Set(
    accessLocks.filter((lock) => lock.targetKind === "room").map((lock) => lock.targetId),
  );
  const actionTokenRooms = rooms.filter((room) => !lockedActionTokenRoomIds.has(room.id));
  const actionTokens: DebateMysteryActionTokenPlacementV1[] = shuffled(actionTokenRooms, actionTokenRandom)
    .slice(0, actionTokenCount)
    .map((room) => {
      const roomOutcomes = activeRegions.filter((outcome) => outcome.roomId === room.id);
      const preferred = roomOutcomes.filter((outcome) =>
        outcome.kind === "empty" && !outcome.evidenceId && !outcome.inventoryItemId);
      const outcome = shuffled(preferred.length ? preferred : roomOutcomes, actionTokenRandom)[0]!;
      return {
        id: `action-token-${seedNumber(`${recipeSeed}:${room.id}:${outcome.regionId}`).toString(36)}`,
        roomId: room.id,
        regionId: outcome.regionId,
        amount: 1 as const,
      };
    });
  const testimony: DebateMysteryTestimonyExcerptV1[] = suspects.map((suspect, index) => ({
    id: `testimony-${index + 1}`,
    speakerSeatId: suspect.seatId,
    exactQuote: suspect.seatId === culprit.seatId
      ? `“I did not enter the murder room after ten o’clock.”`
      : `“At ${10 + (index % 2)}:${index % 2 ? "15" : "00"}, I saw the corridor exactly as I described.”`,
    factTags: suspect.seatId === culprit.seatId ? ["contradiction", "opportunity"] : ["timeline"],
    discovered: false,
  }));
  const contradiction = testimony.find((entry) => entry.speakerSeatId === culprit.seatId)!;
  const relevantEvidence = evidence.filter((item) => item.relation !== "unrelated");
  const smokingEvidence = relevantEvidence.map((item) => item.id);
  const corroboratingTestimony = testimony
    .filter((entry) => entry.id !== contradiction.id)
    .slice(0, 1)
    .map((entry) => entry.id);
  const compactRoute = evidence.length === 1;
  const smokingTestimony = compactRoute
    ? corroboratingTestimony
    : [];
  const strongEvidence = compactRoute
    ? [evidence[0]!.id]
    : relevantEvidence.slice(0, 2).map((item) => item.id);
  const proofBundles: DebateMysteryProofBundleV1[] = [
    { id: "smoking-gun", grade: "smoking_gun", culpritSeatId: culprit.seatId, requiredEvidenceIds: smokingEvidence, requiredTestimonyIds: smokingTestimony, requiredFactTags: ["identity", "method", "motive", "opportunity", "timeline", "contradiction"], requiresAccomplice: accomplice !== null, requiredCourtContradictionId: contradiction.id },
    { id: "strong-case", grade: "strong_case", culpritSeatId: culprit.seatId, requiredEvidenceIds: strongEvidence, requiredTestimonyIds: corroboratingTestimony, requiredFactTags: ["identity", "method", "opportunity", "timeline"], requiresAccomplice: false, requiredCourtContradictionId: null },
    { id: "lucky-break", grade: "lucky_break", culpritSeatId: culprit.seatId, requiredEvidenceIds: [evidence[0]!.id], requiredTestimonyIds: [], requiredFactTags: ["identity", "contradiction"], requiresAccomplice: false, requiredCourtContradictionId: contradiction.id },
  ];
  const actorKnowledge = suspects.map((suspect, index): DebateMysteryActorKnowledgeV1 => ({
    seatId: suspect.seatId,
    role: suspect.seatId === culprit.seatId ? "murderer" : suspect.seatId === accomplice?.seatId ? "accomplice" : "innocent",
    relationshipToVictim: index % 2 ? "A trusted confidant whose loyalty had recently frayed." : "A household associate with an unresolved private grievance.",
    alibi: suspect.seatId === culprit.seatId
      ? "Claims to have remained in the drawing room, though the corridor record can contradict that account."
      : `Was near the ${rooms[index % rooms.length]!.templateId.replaceAll("-", " ")} when the corridor clock chimed.`,
    witnessedFacts: [`A corridor clock chimed at ${10 + (index % 2)}:${index % 2 ? "15" : "00"}.`],
    beliefs: [index % 2 ? "The victim expected a private visitor." : "The victim was unsettled before dinner."],
    secrets: [suspect.seatId === culprit.seatId ? `They used ${method}.` : "They concealed a private household embarrassment."],
    mistakes: [index % 2 ? "Misremembered which clock chimed first." : "Mistook an ordinary footstep for the victim's visitor."],
    permittedLies: suspect.seatId === culprit.seatId || suspect.seatId === accomplice?.seatId ? ["They may lie about their own movements and private actions, but not rewrite physical evidence."] : [],
  }));
  const leadDefinitions = compileDebateMysteryLeadDefinitions({
    config: args.config,
    weapon,
    evidence,
    testimony,
    activeRegions,
    suspects,
    culpritSeatId: culprit.seatId,
  });
  const caseSeed = `case-v${DEBATE_MYSTERY_GENERATOR_VERSION}-${seedNumber(JSON.stringify({ recipeSeed, culprit: culprit.seatId, accomplice: accomplice?.seatId, method, motive, regions: activeRegions, accessLocks, actionTokens, leadDefinitions })).toString(36).padStart(7, "0")}`;
  const titleNoun = choose(["Glass", "Midnight", "The Last Bell", "Ash", "The Locked Gallery"], random);
  return {
    version: DEBATE_MYSTERY_SCHEMA_VERSION,
    generatorVersion: DEBATE_MYSTERY_GENERATOR_VERSION,
    caseSeed,
    recipeSeed,
    title: args.config.inspiration ? `The ${titleNoun} Affair` : `The Mystery of ${titleNoun}`,
    victim: { id: "victim", name: victimName, description: "The mansion’s owner and the only case-authored member of the ensemble." },
    culpritSeatId: culprit.seatId,
    accompliceSeatId: accomplice?.seatId ?? null,
    motive,
    method,
    weapon,
    timeline: [
      { at: "9:30 PM", fact: `${victimName} withdrew from the gathering.` },
      { at: "10:00 PM", fact: `The culprit gained the necessary opportunity.` },
      { at: "10:15 PM", fact: `The murder was committed by ${method}.` },
      { at: "10:30 PM", fact: "The body was discovered and the mansion was sealed." },
    ],
    suspects,
    rooms,
    crimeSceneRoomId: incidentScene.id,
    activeRegions,
    actionTokens,
    inventoryItems,
    accessLocks,
    evidence,
    testimony,
    actorKnowledge,
    proofBundles,
    leadDefinitions,
    publicOpening: `A storm has closed the road to the estate. ${victimName} has been found dead${weapon.revealedAtOpening ? `; the first report names ${weapon.descriptor} as the weapon` : "; the murder weapon has not yet been identified"}, and every selected suspect remains inside. I am the lead investigator.`,
    fallbackProseUsed: true,
  };
}

export interface DebateMysteryValidationResultV1 { valid: boolean; errors: string[] }

export interface DebateMysteryCaseBibleValidationOptionsV1 {
  /**
   * MansionLayoutV2 owns physical adjacency through doors, corridors, and
   * vertical connectors. Its V1-compatible room projection is only a semantic
   * graph, so it must not be reinterpreted as a wall-to-wall floor plan.
   */
  architecture?: "legacy-room-grid" | "mansion-layout-v2";
}

export function validateDebateMysteryCaseBible(
  bible: DebateMysteryCaseBibleV1,
  actionBudget: number,
  options: DebateMysteryCaseBibleValidationOptionsV1 = {},
): DebateMysteryValidationResultV1 {
  const errors: string[] = [];
  const validateLegacyArchitecture = options.architecture !== "mansion-layout-v2";
  const actionTokens = bible.actionTokens ?? [];
  if (!bible.weapon || bible.weapon.id !== "canonical-weapon" || !bible.weapon.descriptor.trim()) errors.push("Case must contain exactly one canonical murder weapon.");
  if (bible.suspects.filter((suspect) => suspect.seatId === bible.culpritSeatId).length !== 1) errors.push("Case must contain exactly one culprit seat.");
  if (bible.accompliceSeatId === bible.culpritSeatId || (bible.accompliceSeatId && !bible.suspects.some((suspect) => suspect.seatId === bible.accompliceSeatId))) errors.push("Accomplice seat is invalid.");
  if (bible.proofBundles.length !== 3 || new Set(bible.proofBundles.map((bundle) => bundle.id)).size !== 3) errors.push("Case must contain exactly three distinct proof bundles.");
  if (new Set(bible.proofBundles.map((bundle) => bundle.grade)).size !== 3) errors.push("Each proof bundle must have a distinct route grade.");
  if (bible.rooms.filter((room) => room.kind === "crime_scene").length !== 1 || !bible.rooms.some((room) => room.id === bible.crimeSceneRoomId && room.kind === "crime_scene")) errors.push("Case must contain exactly one canonical crime scene.");
  if (bible.rooms.filter((room) => room.assignedSuspectSeatId).length !== bible.suspects.length) errors.push("Every suspect requires one fixed suspect room.");
  if (new Set(bible.suspects.map((suspect) => suspect.seatId)).size !== bible.suspects.length || new Set(bible.suspects.map((suspect) => suspect.roomId)).size !== bible.suspects.length) errors.push("Suspect seats and rooms must be unique.");
  if (!Array.isArray(bible.leadDefinitions) || bible.leadDefinitions.length < 3 || new Set(bible.leadDefinitions.map((lead) => lead.id)).size !== bible.leadDefinitions.length) errors.push("Case must contain multiple distinct lead definitions.");
  const evidenceIds = new Set(bible.evidence.map((item) => item.id));
  const testimonyIds = new Set(bible.testimony.map((item) => item.id));
  const observationKeys = new Set(bible.activeRegions.map((item) => `${item.roomId}:${item.regionId}`));
  const expectedActionTokenCount = Math.max(1, Math.round(bible.rooms.length / 5));
  if (
    bible.generatorVersion >= 3 &&
    (
      actionTokens.length !== expectedActionTokenCount ||
      new Set(actionTokens.map((token) => token.id)).size !== actionTokens.length ||
      new Set(actionTokens.map((token) => token.roomId)).size !== actionTokens.length ||
      actionTokens.some((token) =>
        token.amount !== 1 ||
        !observationKeys.has(`${token.roomId}:${token.regionId}`))
    )
  ) errors.push("Action-token caches must be deterministic, bounded, and attached to distinct searchable rooms.");
  for (const lead of bible.leadDefinitions ?? []) {
    if (!lead.title.trim() || lead.stages.length === 0) errors.push(`Lead ${lead.id} is incomplete.`);
    for (const stage of lead.stages) {
      if (stage.requiredEvidenceIds.some((id) => !evidenceIds.has(id)) || stage.requiredForensicEvidenceIds.some((id) => !evidenceIds.has(id))) errors.push(`Lead ${lead.id} references unavailable evidence.`);
      if (stage.requiredTestimonyIds.some((id) => !testimonyIds.has(id))) errors.push(`Lead ${lead.id} references unavailable testimony.`);
      if (stage.requiredObservationKeys.some((key) => !observationKeys.has(key))) errors.push(`Lead ${lead.id} references an unavailable room observation.`);
    }
  }
  if (
    bible.actorKnowledge.length !== bible.suspects.length ||
    new Set(bible.actorKnowledge.map((entry) => entry.seatId)).size !== bible.suspects.length ||
    bible.actorKnowledge.some((entry) =>
      !bible.suspects.some((suspect) => suspect.seatId === entry.seatId) ||
      !entry.relationshipToVictim.trim() ||
      !entry.alibi.trim(),
    )
  ) errors.push("Every suspect needs one compartmentalized relationship and alibi projection.");
  if (bible.actorKnowledge.some((entry) =>
    entry.role !== (
      entry.seatId === bible.culpritSeatId
        ? "murderer"
        : entry.seatId === bible.accompliceSeatId
          ? "accomplice"
          : "innocent"
    ),
  )) errors.push("Actor role projections must match the private canonical seat assignments.");
  if (bible.timeline.length < 3 || new Set(bible.timeline.map((entry) => entry.at)).size !== bible.timeline.length || bible.timeline.some((entry) => !entry.at.trim() || !entry.fact.trim())) errors.push("Case chronology must be complete and use unique time anchors.");
  const roomIds = new Set(bible.rooms.map((room) => room.id));
  const visited = new Set<string>();
  const queue = [bible.rooms[0]?.id].filter((id): id is string => Boolean(id));
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const room = bible.rooms.find((entry) => entry.id === id);
    for (const neighbor of room?.neighborIds ?? []) if (!visited.has(neighbor)) queue.push(neighbor);
  }
  if (visited.size !== roomIds.size) errors.push("Mansion graph must be connected.");
  for (let index = 0; index < bible.rooms.length; index += 1) {
    const left = bible.rooms[index]!;
    if (
      left.x < 0 || left.y < 0 ||
      left.x + left.width > DEBATE_MYSTERY_MANSION_GRID.width ||
      left.y + left.height > DEBATE_MYSTERY_MANSION_GRID.height
    ) errors.push(`Room ${left.id} exceeds the normalized mansion grid.`);
    for (const right of bible.rooms.slice(index + 1).filter((room) => room.floor === left.floor)) {
      const overlaps = left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
      if (overlaps) errors.push(`Rooms ${left.id} and ${right.id} overlap on floor ${left.floor}.`);
    }
    for (const neighborId of left.neighborIds) {
      const right = bible.rooms.find((room) => room.id === neighborId);
      if (!right) errors.push(`Room ${left.id} names a missing neighbor.`);
      else if (!right.neighborIds.includes(left.id)) errors.push(`Room connection ${left.id}/${right.id} is not reciprocal.`);
      else if (
        validateLegacyArchitecture &&
        right.floor === left.floor &&
        !debateMysteryRoomsShareEdge(left, right)
      ) errors.push(`Room connection ${left.id}/${right.id} does not share an architectural edge.`);
    }
  }
  if (validateLegacyArchitecture) {
    for (const floor of new Set(bible.rooms.map((room) => room.floor))) {
      const floorRooms = bible.rooms.filter((room) => room.floor === floor);
      if (floorRooms.length < 3) continue;
      const usesBothAxes = new Set(floorRooms.map((room) => room.x)).size > 1 &&
        new Set(floorRooms.map((room) => room.y)).size > 1;
      if (!usesBothAxes) errors.push(`Floor ${floor} must form a compact two-dimensional room cluster.`);
      const minimumBranchDegree = floorRooms.length >= 4 ? 3 : 2;
      const hasBranchingRoom = floorRooms.some((room) => room.neighborIds.filter((neighborId) =>
        bible.rooms.find((candidate) => candidate.id === neighborId)?.floor === floor,
      ).length >= minimumBranchDegree);
      if (!hasBranchingRoom) errors.push(`Floor ${floor} must include branching room adjacency.`);
    }
    for (let floor = 1; floor < Math.max(...bible.rooms.map((room) => room.floor)); floor += 1) {
      const crossings = bible.rooms.flatMap((room) => room.neighborIds
        .filter((neighborId) => {
          const neighbor = bible.rooms.find((entry) => entry.id === neighborId);
          return room.floor === floor && neighbor?.floor === floor + 1;
        })
        .map((neighborId) => ({ room, neighbor: bible.rooms.find((entry) => entry.id === neighborId)! })));
      if (crossings.length !== 1) errors.push(`Floors ${floor} and ${floor + 1} require exactly one stair connection.`);
      else if (crossings[0]!.room.x !== crossings[0]!.neighbor.x || crossings[0]!.room.y !== crossings[0]!.neighbor.y) {
        errors.push(`Floors ${floor} and ${floor + 1} require an aligned stair core.`);
      }
    }
    const roomForType = (roomTypeId: string) => bible.rooms.find((room) => room.templateId === roomTypeId);
    const foyer = roomForType("foyer");
    if (foyer && foyer.x !== 0 && foyer.y !== 0) errors.push("The foyer must touch the mansion exterior.");
    const requireTypeAdjacency = (leftTypeId: string, rightTypeId: string, label: string) => {
      const left = roomForType(leftTypeId);
      const right = roomForType(rightTypeId);
      if (left && right && !left.neighborIds.includes(right.id)) errors.push(`${label} must share an architectural edge.`);
    };
    requireTypeAdjacency("kitchen", "dining-room", "Kitchen and dining room");
    requireTypeAdjacency("primary-bedroom", "bathroom", "Bedroom and bathroom");
    requireTypeAdjacency("foyer", "ballroom", "Foyer and ballroom");
    requireTypeAdjacency("kitchen", "utility", "Kitchen and garage service access");
  }
  const topFloor = Math.max(1, ...bible.rooms.map((room) => room.floor));
  for (const room of bible.rooms) {
    if (debateMysteryRoomTypeIsAllowedOnFloorV1(room.templateId, room.floor, topFloor)) continue;
    const floorRule = debateMysteryRoomFloorRuleV1(room.templateId);
    if (floorRule === "ground-floor-only") {
      errors.push(`${room.templateId} must occupy Floor 1.`);
    } else if (floorRule === "top-floor-only") {
      errors.push(`${room.templateId} must occupy the mansion's highest level, Floor ${topFloor}.`);
    }
  }
  if (bible.rooms.some((room) => {
    const count = bible.activeRegions.filter((outcome) => outcome.roomId === room.id).length;
    const expectedMinimum = bible.generatorVersion >= 2 ? 12 : 2;
    return count < expectedMinimum || count > 24;
  })) errors.push("Every room must expose a dense but bounded set of active regions.");
  if (bible.rooms.some((room) => {
    const regionIds = bible.activeRegions.filter((outcome) => outcome.roomId === room.id).map((outcome) => outcome.regionId);
    return new Set(regionIds).size !== regionIds.length;
  })) errors.push("A room cannot activate the same semantic region twice.");
  if (bible.activeRegions.some((outcome) => {
    const room = bible.rooms.find((entry) => entry.id === outcome.roomId);
    return !room || !debateMysteryRoomPresentationRegionsV1(room)
      .some((region) => region.id === outcome.regionId);
  })) errors.push("Every active region must reference a declared semantic polygon in its room template.");
  const knownEvidence = new Set(bible.evidence.map((item) => item.id));
  const knownTestimony = new Set(bible.testimony.map((item) => item.id));
  if (knownEvidence.size !== bible.evidence.length || knownTestimony.size !== bible.testimony.length) errors.push("Evidence and testimony IDs must be unique.");
  const knownInventory = new Set(bible.inventoryItems.map((item) => item.id));
  if (knownInventory.size !== bible.inventoryItems.length) errors.push("Inventory item IDs must be unique.");
  if (bible.activeRegions.some((outcome) => {
    if (outcome.evidenceId && !knownEvidence.has(outcome.evidenceId)) return true;
    if (outcome.inventoryItemId && !knownInventory.has(outcome.inventoryItemId)) return true;
    return outcome.kind === "clue" && !outcome.evidenceId && !outcome.inventoryItemId;
  })) errors.push("Active-region outcomes, evidence, and inventory must agree.");
  if (bible.evidence.some((item) => {
    const outcome = bible.activeRegions.find((entry) => entry.evidenceId === item.id);
    const resultItem = bible.inventoryItems.find((entry) =>
      entry.evidenceId === item.id && bible.accessLocks.some((lock) => lock.resultInventoryItemIds.includes(entry.id)),
    );
    return !item.adjective.trim() || !item.object.trim() || !item.title.trim() || !item.observation.trim() ||
      (!outcome && !resultItem) ||
      Boolean(outcome && (outcome.roomId !== item.roomId || outcome.regionId !== item.regionId)) ||
      Boolean(resultItem && (resultItem.sourceRoomId !== item.roomId || resultItem.sourceRegionId !== item.regionId)) ||
      (item.relation !== "unrelated" && item.factTags.length === 0);
  })) errors.push("Every clue must preserve its canonical room, region, description, and proof semantics.");
  const lockIds = new Set(bible.accessLocks.map((lock) => lock.id));
  if (lockIds.size !== bible.accessLocks.length) errors.push("Access lock IDs must be unique.");
  for (const lock of bible.accessLocks) {
    const required = bible.inventoryItems.find((item) => item.id === lock.requiredAccessItemId);
    if (!required?.usable) errors.push(`${lock.id} requires a missing or unusable access item.`);
    if (lock.targetKind === "item" && !bible.inventoryItems.some((item) => item.id === lock.targetId && item.locked)) errors.push(`${lock.id} targets a missing locked item.`);
    if (lock.targetKind === "room" && (!roomIds.has(lock.targetId) || lock.targetId === bible.crimeSceneRoomId)) errors.push(`${lock.id} targets an invalid locked room.`);
    if (
      lock.targetKind === "region" &&
      !bible.activeRegions.some((outcome) =>
        `${outcome.roomId}:${outcome.regionId}` === lock.targetId)
    ) errors.push(`${lock.id} targets a missing active region.`);
    if (lock.resultInventoryItemIds.some((id) => !knownInventory.has(id))) errors.push(`${lock.id} creates a missing inventory item.`);
    if (lock.requiredAccessItemId === lock.targetId || lock.resultInventoryItemIds.includes(lock.requiredAccessItemId)) errors.push(`${lock.id} self-locks its required item.`);
  }
  const producingLockByItem = new Map<string, string>();
  for (const lock of bible.accessLocks) for (const itemId of lock.resultInventoryItemIds) producingLockByItem.set(itemId, lock.id);
  const dependencyForLock = new Map<string, string | null>(bible.accessLocks.map((lock) => [lock.id, producingLockByItem.get(lock.requiredAccessItemId) ?? null]));
  for (const lock of bible.accessLocks) {
    const visitedLocks = new Set<string>();
    let cursor: string | null = lock.id;
    while (cursor) {
      if (visitedLocks.has(cursor)) {
        errors.push(`Access lock dependency cycle includes ${lock.id}.`);
        break;
      }
      visitedLocks.add(cursor);
      cursor = dependencyForLock.get(cursor) ?? null;
    }
  }
  const lockedRoomIds = new Set(bible.accessLocks.filter((lock) => lock.targetKind === "room").map((lock) => lock.targetId));
  const obtainableItems = new Set(
    bible.inventoryItems.filter((item) => {
      const sourceOutcome = bible.activeRegions.find((outcome) => outcome.inventoryItemId === item.id);
      return sourceOutcome && !lockedRoomIds.has(sourceOutcome.roomId);
    }).map((item) => item.id),
  );
  const reachableLocks = new Set<string>();
  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (const lock of bible.accessLocks) {
      if (reachableLocks.has(lock.id) || !obtainableItems.has(lock.requiredAccessItemId)) continue;
      if (lock.targetKind === "item" && !obtainableItems.has(lock.targetId)) continue;
      if (
        lock.targetKind === "region" &&
        bible.activeRegions.some((outcome) =>
          `${outcome.roomId}:${outcome.regionId}` === lock.targetId &&
          lockedRoomIds.has(outcome.roomId))
      ) continue;
      reachableLocks.add(lock.id);
      if (lock.targetKind === "room") lockedRoomIds.delete(lock.targetId);
      for (const itemId of lock.resultInventoryItemIds) obtainableItems.add(itemId);
      madeProgress = true;
    }
    for (const item of bible.inventoryItems) {
      const sourceOutcome = bible.activeRegions.find((outcome) => outcome.inventoryItemId === item.id);
      if (sourceOutcome && !lockedRoomIds.has(sourceOutcome.roomId) && !obtainableItems.has(item.id)) {
        obtainableItems.add(item.id);
        madeProgress = true;
      }
    }
  }
  if (bible.accessLocks.some((lock) => !reachableLocks.has(lock.id))) errors.push("Every authored access lock must be reachable without circular or self-locking dependencies.");
  if (bible.evidence.filter((item) => item.isCanonicalWeapon).length !== 1 || bible.evidence.some((item) => item.isCanonicalWeapon && item.object !== bible.weapon.descriptor)) errors.push("The canonical weapon must exist exactly once as physical evidence.");
  const bundleSignatures = new Set<string>();
  for (const bundle of bible.proofBundles) {
    if (bundle.culpritSeatId !== bible.culpritSeatId) errors.push(`${bundle.id} points to the wrong culprit.`);
    if (bundle.requiredEvidenceIds.some((id) => !knownEvidence.has(id)) || bundle.requiredTestimonyIds.some((id) => !knownTestimony.has(id))) errors.push(`${bundle.id} references missing proof.`);
    const obtainableTags = new Set([
      ...bundle.requiredEvidenceIds.flatMap((id) => bible.evidence.find((item) => item.id === id)?.factTags ?? []),
      ...bundle.requiredTestimonyIds.flatMap((id) => bible.testimony.find((item) => item.id === id)?.factTags ?? []),
    ]);
    if (bundle.requiredFactTags.some((tag) => !obtainableTags.has(tag))) errors.push(`${bundle.id} requires a fact tag its own proof cannot establish.`);
    const signature = JSON.stringify({ evidence: [...bundle.requiredEvidenceIds].sort(), testimony: [...bundle.requiredTestimonyIds].sort(), facts: [...bundle.requiredFactTags].sort(), accomplice: bundle.requiresAccomplice, contradiction: bundle.requiredCourtContradictionId });
    if (bundleSignatures.has(signature)) errors.push(`${bundle.id} duplicates another proof route.`);
    bundleSignatures.add(signature);
    const requiredInvestigationRoomIds = new Set(
      bundle.requiredEvidenceIds
        .map((id) => bible.evidence.find((item) => item.id === id)!)
        .filter((item) => !(item.isCanonicalWeapon && bible.weapon.revealedAtOpening))
        .map((item) => item.roomId),
    );
    const testimonySeats = new Set(bundle.requiredTestimonyIds.map((id) => bible.testimony.find((item) => item.id === id)!.speakerSeatId));
    const requiredDiscoveryRoomIds = new Set(
      [...requiredInvestigationRoomIds].filter((id) => id !== bible.crimeSceneRoomId),
    );
    for (const seatId of testimonySeats) {
      const roomId = bible.suspects.find((suspect) => suspect.seatId === seatId)!.roomId;
      if (roomId !== bible.crimeSceneRoomId) requiredDiscoveryRoomIds.add(roomId);
    }
    const requiredActionCost = requiredDiscoveryRoomIds.size + requiredInvestigationRoomIds.size + testimonySeats.size;
    // Bonus caches make repetition possible, but no proof route may depend on
    // finding one. Validate each route against the starting budget alone.
    if (requiredActionCost > actionBudget) errors.push(`${bundle.id} is unreachable within the action budget.`);
  }
  return { valid: errors.length === 0, errors };
}

export function projectDebateMysteryCase(bible: DebateMysteryCaseBibleV1, config: DebateMysteryResolvedConfigV1): DebateWhodunnitFormatStateV1 {
  const openingWeapon = bible.weapon.revealedAtOpening
    ? bible.evidence.find((item) => item.isCanonicalWeapon) ?? null
    : null;
  const projected: DebateWhodunnitFormatStateV1 = {
    version: DEBATE_MYSTERY_SCHEMA_VERSION,
    format: "whodunnit",
    compileStage: "complete",
    playPhase: "investigation",
    investigationApproach: "undecided",
    caseTitle: bible.title,
    fictionLabel: "Fictional, non-canonical case",
    recipeSeed: bible.recipeSeed,
    caseSeedAvailable: true,
    botSpeechProjectionVersion: 0,
    config,
    victim: { id: bible.victim.id, name: bible.victim.name },
    // Suspect placement is public navigation state: the overhead board uses
    // each fixed room assignment to stage the bot's Mini form before entry.
    // Guilt, private knowledge, and the room's active outcome remain sealed.
    suspects: bible.suspects.map((suspect) => ({ ...suspect })),
    rooms: bible.rooms.map((room) => {
      const crimeScene = room.id === bible.crimeSceneRoomId;
      const activeRegionIds = crimeScene
        ? bible.activeRegions.filter((entry) => entry.roomId === room.id).map((entry) => entry.regionId)
        : [];
      // When the opening report presents the weapon, it is already bagged and
      // catalogued. Do not make the player rediscover the same object through
      // the room hotspot; the remaining frozen regions are still searchable.
      const presentedRegionId = crimeScene && openingWeapon?.roomId === room.id
        ? openingWeapon.regionId
        : null;
      const inspectedRegionIds = presentedRegionId ? [presentedRegionId] : [];
      return {
        ...room,
        // Room labels, types, and fixed suspect placement are navigation
        // information. Keep active outcomes and generated art sealed until
        // discovery.
        templateId: room.templateId,
        imageId: crimeScene ? room.imageId : null,
        kind: crimeScene ? room.kind : null,
        assignedSuspectSeatId: crimeScene ? room.assignedSuspectSeatId : null,
        name: DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === room.templateId)?.name ?? "Unnamed Room",
        discovered: crimeScene,
        searched: activeRegionIds.length > 0 && activeRegionIds.every((regionId) => inspectedRegionIds.includes(regionId)),
        activeRegionIds,
        inspectedRegionIds,
        inspectionCounts: Object.fromEntries(inspectedRegionIds.map((regionId) => [regionId, 1])),
        observations: [],
        locked: bible.accessLocks.some((lock) => lock.targetKind === "room" && lock.targetId === room.id),
        activeRegionId: activeRegionIds.find((regionId) => !inspectedRegionIds.includes(regionId)) ?? null,
        publicObservation: null,
        outcomeKind: null,
      };
    }),
    crimeSceneRoomId: bible.crimeSceneRoomId,
    currentRoomId: bible.crimeSceneRoomId,
    actionsRemaining: config.actionBudget,
    metSuspectSeatIds: [],
    activeActivity: null,
    recoveredActionTokens: [],
    inventoryItems: [],
    accessHistory: [],
    discoveredEvidence: openingWeapon ? [
      (({ factTags: _factTags, relation: _relation, isCanonicalWeapon: _isCanonicalWeapon, ...item }) => item)(openingWeapon),
    ] : [],
    forensicFindings: [],
    testimony: [],
    leads: [],
    partnerJournal: [bible.publicOpening],
    partnerConsultations: [],
    interviewLog: [],
    theory: null,
    theoryFiledAt: null,
    credibilityRemaining: DEBATE_MYSTERY_CREDIBILITY_STRIKES,
    court: null,
    verdict: null,
    spoilersRevealed: false,
  };
  projected.leads = updateDebateMysteryPublicLeads(bible, projected);
  return projected;
}

export function defaultDebateMysteryFormatStateV1(): DebateWhodunnitFormatStateV1 {
  return {
    version: DEBATE_MYSTERY_SCHEMA_VERSION,
    format: "whodunnit",
    compileStage: "casting",
    playPhase: "compiling",
    investigationApproach: "undecided",
    caseTitle: "Untitled Case",
    fictionLabel: "Fictional, non-canonical case",
    recipeSeed: "",
    caseSeedAvailable: false,
    botSpeechProjectionVersion: 0,
    config: {
      version: DEBATE_MYSTERY_SCHEMA_VERSION,
      preset: "custom",
      difficulty: "classic",
      artMode: "bundled",
      formality: "structured",
      juryEnabled: false,
      playerRole: "participant",
      participationDifficulty: "standard",
      inspiration: "",
      nonce: "",
      floors: 1,
      totalRooms: 5,
      suspectBotIds: [],
      judgeBotId: "prism:player-judge",
      prosecutorPartnerBotId: "",
      rivalDefenseBotId: "",
      actionBudget: 0,
      accompliceChance: 0,
    },
    victim: { id: "victim", name: "The victim" },
    suspects: [],
    rooms: [],
    crimeSceneRoomId: "",
    currentRoomId: "",
    actionsRemaining: 0,
    metSuspectSeatIds: [],
    activeActivity: null,
    recoveredActionTokens: [],
    inventoryItems: [],
    accessHistory: [],
    discoveredEvidence: [],
    forensicFindings: [],
    testimony: [],
    leads: [],
    partnerJournal: [],
    partnerConsultations: [],
    interviewLog: [],
    theory: null,
    theoryFiledAt: null,
    credibilityRemaining: DEBATE_MYSTERY_CREDIBILITY_STRIKES,
    court: null,
    verdict: null,
    spoilersRevealed: false,
  };
}

/** Saved mystery state is server-authored. This guard prevents an unrelated or
 * malformed format payload from being projected as a mystery while retaining
 * exact replay state for valid records. */
export function normalizeDebateMysteryFormatStateV1(
  value: unknown,
): DebateWhodunnitFormatStateV1 {
  if (!value || typeof value !== "object") return defaultDebateMysteryFormatStateV1();
  const source = value as Partial<DebateWhodunnitFormatStateV1>;
  if (
    source.format !== "whodunnit" ||
    source.version !== DEBATE_MYSTERY_SCHEMA_VERSION ||
    !source.config ||
    !Array.isArray(source.rooms) ||
    !Array.isArray(source.suspects) ||
    !Array.isArray(source.discoveredEvidence) ||
    !Array.isArray(source.testimony)
  ) {
    return defaultDebateMysteryFormatStateV1();
  }
  const legacyContinuance = (source as { playPhase?: unknown }).playPhase === "continuance";
  const normalized = source as DebateWhodunnitFormatStateV1;
  normalized.investigationApproach =
    normalized.investigationApproach === "undecided" ||
    normalized.investigationApproach === "player" ||
    normalized.investigationApproach === "partner"
      ? normalized.investigationApproach
      : "player";
  normalized.config = {
    ...normalized.config,
    // Pre-court-rules cases compiled as structured proceedings without a Jury.
    formality:
      normalized.config.formality === undefined
        ? "structured"
        : normalizeDebateFormalityId(normalized.config.formality),
    juryEnabled: normalized.config.juryEnabled === true,
  };
  if (legacyContinuance) {
    normalized.playPhase = "verdict";
    normalized.actionsRemaining = 0;
    normalized.activeActivity = null;
    normalized.court = null;
    normalized.verdict ??= {
      grade: "incorrect",
      culpritCorrect: false,
      accompliceCorrect: null,
      matchedBundleId: null,
      credibilityRemaining: 0,
      reason: "Court proceedings began. The filed accusation was not proved, and the investigation is permanently closed.",
      deliveredAt: normalized.theoryFiledAt ?? "1970-01-01T00:00:00.000Z",
    };
  }
  normalized.botSpeechProjectionVersion =
    typeof normalized.botSpeechProjectionVersion === "number" &&
    Number.isFinite(normalized.botSpeechProjectionVersion)
      ? Math.max(0, Math.floor(normalized.botSpeechProjectionVersion))
      : 0;
  normalized.victim = normalized.victim && typeof normalized.victim.name === "string"
    ? normalized.victim
    : { id: "victim", name: "The victim" };
  normalized.interviewLog = Array.isArray(normalized.interviewLog) ? normalized.interviewLog : [];
  normalized.partnerConsultations = Array.isArray(normalized.partnerConsultations) ? normalized.partnerConsultations : [];
  normalized.recoveredActionTokens = Array.isArray(normalized.recoveredActionTokens) ? normalized.recoveredActionTokens : [];
  normalized.leads = Array.isArray(normalized.leads) ? normalized.leads : [];
  normalized.forensicFindings = Array.isArray(normalized.forensicFindings) ? normalized.forensicFindings : [];
  normalized.inventoryItems = Array.isArray(normalized.inventoryItems) ? normalized.inventoryItems : [];
  normalized.accessHistory = Array.isArray(normalized.accessHistory) ? normalized.accessHistory : [];
  const activeActivity = normalized.activeActivity;
  normalized.activeActivity = activeActivity?.kind === "investigation" && typeof activeActivity.roomId === "string"
    ? {
        ...activeActivity,
        // Legacy saves charged every hotspot. If one is already inspected in
        // the currently open room, favor the player and treat that pass as paid.
        actionCommitted:
          typeof activeActivity.actionCommitted === "boolean"
            ? activeActivity.actionCommitted
            : normalized.rooms.some((room) =>
                room.id === activeActivity.roomId &&
                Array.isArray(room.inspectedRegionIds) &&
                room.inspectedRegionIds.length > 0),
      }
    : activeActivity?.kind === "interview" && typeof activeActivity.suspectSeatId === "string"
      ? activeActivity
      : null;
  const encounteredSeatIds = [
    ...(Array.isArray(normalized.metSuspectSeatIds) ? normalized.metSuspectSeatIds : []),
    ...normalized.interviewLog.map((message) => message?.suspectSeatId),
    ...(normalized.activeActivity?.kind === "interview" ? [normalized.activeActivity.suspectSeatId] : []),
  ];
  normalized.metSuspectSeatIds = [...new Set(encounteredSeatIds.filter(
    (seatId): seatId is string => typeof seatId === "string" && normalized.suspects.some((suspect) => suspect.seatId === seatId),
  ))];
  if (
    normalized.actionsRemaining <= 0 &&
    normalized.activeActivity === null &&
    normalized.playPhase === "investigation"
  ) normalized.playPhase = "theory";
  normalized.rooms = normalized.rooms.map((room) => ({
    ...room,
    activeRegionIds: Array.isArray(room.activeRegionIds)
      ? room.activeRegionIds
      : room.activeRegionId
        ? [room.activeRegionId]
        : [],
    inspectedRegionIds: Array.isArray(room.inspectedRegionIds)
      ? room.inspectedRegionIds
      : room.searched && room.activeRegionId
        ? [room.activeRegionId]
        : [],
    inspectionCounts: room.inspectionCounts && typeof room.inspectionCounts === "object"
      ? room.inspectionCounts
      : Object.fromEntries((Array.isArray(room.inspectedRegionIds) ? room.inspectedRegionIds : []).map((regionId) => [regionId, 1])),
    observations: Array.isArray(room.observations)
      ? room.observations.map((observation) => ({
          ...observation,
          accessTargets: Array.isArray(observation.accessTargets)
            ? observation.accessTargets
            : [],
        }))
      : room.publicObservation && room.activeRegionId && room.outcomeKind
        ? [{
            regionId: room.activeRegionId,
            label: "Inspected area",
            observation: room.publicObservation,
            outcomeKind: room.outcomeKind,
            evidenceId: null,
            accessTargets: [],
          }]
        : [],
    locked: room.locked === true,
  }));
  return normalized;
}

const NEGATION_TOKENS = /\b(?:no|not|never|none|neither|nor|without|cannot|can't|didn't|isn't|wasn't|won't)\b/giu;
const UNCERTAINTY_TOKENS = /\b(?:maybe|may|might|possibly|probably|perhaps|seems?|appears?|uncertain|unsure|suspect|think|believe)\b/giu;
const CONCLUSION_TOKENS = /\b(?:therefore|proves?|proven|definitely|certainly|confirmed|conclusive|culprit|guilty|murderer|accomplice)\b/giu;
const FACT_NUMBER_TOKENS = /\b\d+(?::\d+)?(?:\s?(?:am|pm))?\b/giu;
const PROTECTED_TOKEN = /(?:“[^”]*”|"[^"]*"|\[\[(?:room|evidence|testimony|lead):[^\]]+\]\])/gu;

function tokens(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}

export function debateMysteryNotebookCharacterCount(notebook: Pick<DebateMysteryNotebookV1, "pages">): number {
  return notebook.pages.reduce((total, page) => total + page.title.length + page.blocks.reduce((sum, block) => sum + block.text.length, 0), 0);
}

export function validateDebateMysteryNotebookCleanupProposal(
  notebook: DebateMysteryNotebookV1,
  proposal: DebateMysteryNotebookCleanupProposalV1,
): DebateMysteryValidationResultV1 {
  const errors: string[] = [];
  if (proposal.sessionId !== notebook.sessionId || proposal.sourceRevision !== notebook.revision) errors.push("Cleanup proposal is stale.");
  const pageById = new Map(notebook.pages.map((page) => [page.id, page]));
  for (const proposedPage of proposal.pages) {
    const sourcePage = pageById.get(proposedPage.pageId);
    if (!sourcePage || !proposal.scopePageIds.includes(proposedPage.pageId)) { errors.push(`Cleanup page ${proposedPage.pageId} is outside the selected scope.`); continue; }
    const expected = new Set(sourcePage.blocks.map((block) => block.id));
    const counts = new Map<string, number>();
    for (const block of proposedPage.proposedBlocks) {
      for (const sourceId of block.sourceBlockIds ?? []) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
    }
    for (const sourceId of expected) if (counts.get(sourceId) !== 1) errors.push(`Source block ${sourceId} must be represented exactly once.`);
    for (const sourceId of counts.keys()) if (!expected.has(sourceId)) errors.push(`Cleanup invented source block ${sourceId}.`);
    for (const source of sourcePage.blocks) {
      const proposed = proposedPage.proposedBlocks.filter((block) => block.sourceBlockIds?.includes(source.id)).map((block) => block.text).join("\n");
      const protectedSource = tokens(source.text, PROTECTED_TOKEN);
      for (const token of protectedSource) if (!proposed.includes(token)) errors.push(`Protected quote or reference from ${source.id} changed.`);
      for (const token of tokens(source.text, NEGATION_TOKENS)) if (!tokens(proposed, NEGATION_TOKENS).includes(token)) errors.push(`Negation from ${source.id} changed.`);
      for (const token of tokens(source.text, UNCERTAINTY_TOKENS)) if (!tokens(proposed, UNCERTAINTY_TOKENS).includes(token)) errors.push(`Uncertainty from ${source.id} changed.`);
      const sourceGroup = proposedPage.proposedBlocks
        .filter((block) => block.sourceBlockIds?.includes(source.id))
        .flatMap((block) => block.sourceBlockIds ?? [])
        .map((sourceId) => sourcePage.blocks.find((block) => block.id === sourceId)?.text ?? "")
        .join("\n");
      for (const token of tokens(proposed, CONCLUSION_TOKENS)) {
        if (!tokens(sourceGroup, CONCLUSION_TOKENS).includes(token)) errors.push(`Cleanup introduced a new conclusion in ${source.id}.`);
      }
      for (const token of tokens(proposed, FACT_NUMBER_TOKENS)) {
        if (!tokens(sourceGroup, FACT_NUMBER_TOKENS).includes(token)) errors.push(`Cleanup introduced a new factual number in ${source.id}.`);
      }
      if ((source.kind === "quote" || source.kind === "reference") && proposed !== source.text) errors.push(`Protected ${source.kind} block ${source.id} must remain byte-for-byte.`);
    }
  }
  const proposedNotebook = { pages: notebook.pages.map((page) => {
    const replacement = proposal.pages.find((entry) => entry.pageId === page.id);
    return replacement ? { ...page, title: replacement.proposedTitle, blocks: replacement.proposedBlocks } : page;
  }) };
  if (debateMysteryNotebookCharacterCount(proposedNotebook) > DEBATE_MYSTERY_NOTEBOOK_CHARACTER_LIMIT) errors.push("Cleanup exceeds the notebook character limit.");
  return { valid: errors.length === 0, errors };
}

export function gradeDebateMysteryTheory(args: {
  bible: DebateMysteryCaseBibleV1;
  theory: DebateMysteryTheoryV1;
  sustainedTestimonyIds: string[];
  /** A courtroom denial may satisfy the required contradiction without
   * pretending undiscovered scene testimony entered the record. */
  defendantDenialContradicted?: boolean;
  credibilityRemaining: number;
  deliveredAt: string;
}): DebateMysteryVerdictV1 {
  const culpritCorrect = args.theory.culpritSeatId === args.bible.culpritSeatId;
  const accompliceCorrect = args.bible.accompliceSeatId === args.theory.accompliceSeatId;
  if (!culpritCorrect || (args.theory.accompliceSeatId !== null && !accompliceCorrect)) {
    return { grade: "incorrect", culpritCorrect, accompliceCorrect, matchedBundleId: null, credibilityRemaining: args.credibilityRemaining, reason: !culpritCorrect ? "The filed culprit does not match the canonical case." : "A false accomplice allegation invalidates the theory.", deliveredAt: args.deliveredAt };
  }
  const evidence = new Set(args.theory.evidenceIds);
  const testimony = new Set([...args.theory.testimonyIds, ...args.sustainedTestimonyIds]);
  const factTags = new Set([
    ...args.bible.evidence.filter((item) => evidence.has(item.id)).flatMap((item) => item.factTags),
    ...args.bible.testimony.filter((item) => testimony.has(item.id)).flatMap((item) => item.factTags),
  ]);
  const hasMethod = args.theory.method.trim().length > 0;
  const hasMotive = args.theory.motive.trim().length > 0;
  const hasOpportunity = args.theory.opportunity.trim().length > 0;
  const matches = args.bible.proofBundles.filter((bundle) =>
    bundle.requiredEvidenceIds.every((id) => evidence.has(id)) &&
    bundle.requiredTestimonyIds.every((id) => testimony.has(id)) &&
    bundle.requiredFactTags.every((tag) => factTags.has(tag)) &&
    (!bundle.requiredCourtContradictionId ||
      testimony.has(bundle.requiredCourtContradictionId) ||
      args.defendantDenialContradicted === true) &&
    (!bundle.requiresAccomplice || accompliceCorrect) &&
    (bundle.grade !== "smoking_gun" || (hasMethod && hasMotive && hasOpportunity)) &&
    (bundle.grade !== "strong_case" || (hasMethod && hasOpportunity)),
  );
  const rank: Record<Exclude<DebateMysteryRouteGrade, "incorrect">, number> = { lucky_break: 1, strong_case: 2, smoking_gun: 3 };
  const match = matches.sort((a, b) => rank[b.grade] - rank[a.grade])[0] ?? null;
  let grade: DebateMysteryRouteGrade = match?.grade ?? "incorrect";
  if (grade === "smoking_gun" && args.bible.accompliceSeatId && !accompliceCorrect) grade = "strong_case";
  return { grade, culpritCorrect, accompliceCorrect, matchedBundleId: match?.id ?? null, credibilityRemaining: args.credibilityRemaining, reason: match ? `The filed record contains the ${match.id} proof bundle.` : "The theory matches none of the three valid proof bundles.", deliveredAt: args.deliveredAt };
}
