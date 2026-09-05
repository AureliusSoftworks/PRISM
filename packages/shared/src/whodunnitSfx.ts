import type { DebateMysteryMansionAssetV1 } from "./debateMysteryV2.ts";

/**
 * Whodunnit's interaction sound effects as a venue-owned pack.
 *
 * Every cue the investigation plays has a bundled PRISM voice. A venue may
 * carry its own clip for any cue; when it does, that clip plays in place of
 * the bundled one for cases forged from the venue. The registry below is the
 * contract both sides share: the web palette keeps these exact ids, the API
 * synthesizes to these prompts, and the portable package lists the cues it
 * ships. Clips are short, dry, one-shot effects; music and the environmental
 * bed are separate venue assets.
 */
export const WHODUNNIT_SFX_CUE_IDS_V1 = [
  "map",
  "navigate",
  "enter",
  "return",
  "dialogue-dismiss",
  "theory",
  "evidence",
  "paper",
  "paper-pickup",
  "paper-place",
  "folder",
  "clip",
  "pencil",
  "room-complete",
] as const;

export type WhodunnitSfxCueIdV1 = (typeof WHODUNNIT_SFX_CUE_IDS_V1)[number];

export interface WhodunnitSfxCueDefinitionV1 {
  id: WhodunnitSfxCueIdV1;
  label: string;
  /** Where the investigation plays it; shown to authors and read by the model. */
  purpose: string;
  /** What the synthesized clip should be, before the venue's style is added. */
  prompt: string;
  /** Requested clip length; the provider clamps to its own bounds. */
  durationSeconds: number;
  /** Playback gain relative to the shared SFX volume, matched to the bundled voice. */
  gain: number;
}

export const WHODUNNIT_SFX_CUES_V1: Readonly<Record<WhodunnitSfxCueIdV1, WhodunnitSfxCueDefinitionV1>> = {
  map: {
    id: "map",
    label: "Map",
    purpose: "Opening the venue map from a room.",
    prompt: "A soft unfolding of a paper or cloth map with a faint settling rustle.",
    durationSeconds: 0.9,
    gain: 0.12,
  },
  navigate: {
    id: "navigate",
    label: "Navigate",
    purpose: "Choosing a room to walk to on the map.",
    prompt: "A short muted footstep and a soft cloth brush, close and dry, one movement.",
    durationSeconds: 1,
    gain: 0.18,
  },
  enter: {
    id: "enter",
    label: "Enter room",
    purpose: "Arriving in a room.",
    prompt: "A single interior door opening with a latch release and a gentle swing, no slam.",
    durationSeconds: 1.3,
    gain: 0.2,
  },
  return: {
    id: "return",
    label: "Return",
    purpose: "Stepping back out of a room to the map.",
    prompt: "A single interior door closing softly with a light latch click.",
    durationSeconds: 1,
    gain: 0.15,
  },
  "dialogue-dismiss": {
    id: "dialogue-dismiss",
    label: "Dialogue dismiss",
    purpose: "Dismissing a line of dialogue.",
    prompt: "A tiny soft tap of a fingertip on wood, one quiet click.",
    durationSeconds: 0.6,
    gain: 0.14,
  },
  theory: {
    id: "theory",
    label: "Theory board",
    purpose: "Opening the theory board.",
    prompt: "A brief pin pressed into a cork board with a small firm push.",
    durationSeconds: 0.9,
    gain: 0.2,
  },
  evidence: {
    id: "evidence",
    label: "Evidence found",
    purpose: "Discovering a piece of evidence.",
    prompt: "A short bright three-note discovery chime on glass or a small bell, descending, delicate.",
    durationSeconds: 1.5,
    gain: 0.2,
  },
  paper: {
    id: "paper",
    label: "Case file open",
    purpose: "Opening the case file.",
    prompt: "A single sheet of heavy paper lifted and turned once, close and soft.",
    durationSeconds: 0.9,
    gain: 0.12,
  },
  "paper-pickup": {
    id: "paper-pickup",
    label: "Paper pickup",
    purpose: "Picking up a page or item from the desk.",
    prompt: "A sheet of paper picked up from a wooden desk, one quick light lift.",
    durationSeconds: 0.7,
    gain: 0.34,
  },
  "paper-place": {
    id: "paper-place",
    label: "Paper place",
    purpose: "Setting a page or item down on the desk.",
    prompt: "A sheet of paper set down flat on a wooden desk, one soft pat.",
    durationSeconds: 0.7,
    gain: 0.38,
  },
  folder: {
    id: "folder",
    label: "Folder",
    purpose: "Closing a folder in the case file.",
    prompt: "A cardboard folder flap closing with a low soft thump.",
    durationSeconds: 0.9,
    gain: 0.18,
  },
  clip: {
    id: "clip",
    label: "Clip",
    purpose: "Fastening a note in the case file.",
    prompt: "A small metal paper clip snapping onto paper, one crisp tick.",
    durationSeconds: 0.5,
    gain: 0.14,
  },
  pencil: {
    id: "pencil",
    label: "Pencil",
    purpose: "Marking a note in the case file.",
    prompt: "A quick pencil tick mark on paper, one short scratch.",
    durationSeconds: 0.6,
    gain: 0.09,
  },
  "room-complete": {
    id: "room-complete",
    label: "Room complete",
    purpose: "Finishing every clue in a room.",
    prompt: "A warm resolved two-chord musical flourish, short and satisfying, ending clean.",
    durationSeconds: 2,
    gain: 0.35,
  },
};

export function isWhodunnitSfxCueIdV1(value: unknown): value is WhodunnitSfxCueIdV1 {
  return typeof value === "string" &&
    (WHODUNNIT_SFX_CUE_IDS_V1 as readonly string[]).includes(value);
}

/** Asset refs for a venue's effects use role `sfx` and these logical ids. */
export const MANSION_SFX_LOGICAL_PREFIX_V1 = "cue:";

export type MansionSfxLaneV1 = "active" | "candidate" | "previous";

export function mansionSfxLogicalIdV1(cueId: WhodunnitSfxCueIdV1, lane: MansionSfxLaneV1 = "active"): string {
  return lane === "active"
    ? `${MANSION_SFX_LOGICAL_PREFIX_V1}${cueId}`
    : `${MANSION_SFX_LOGICAL_PREFIX_V1}${cueId}:${lane}`;
}

export function parseMansionSfxLogicalIdV1(
  logicalId: string,
): { cueId: WhodunnitSfxCueIdV1; lane: MansionSfxLaneV1 } | null {
  if (!logicalId.startsWith(MANSION_SFX_LOGICAL_PREFIX_V1)) return null;
  const [cueId, lane = "active", ...rest] = logicalId.slice(MANSION_SFX_LOGICAL_PREFIX_V1.length).split(":");
  if (rest.length > 0 || !isWhodunnitSfxCueIdV1(cueId)) return null;
  if (lane !== "active" && lane !== "candidate" && lane !== "previous") return null;
  return { cueId, lane };
}

export interface MansionSfxCueStateV1 {
  cueId: WhodunnitSfxCueIdV1;
  active: { assetId: string } | null;
  /** A synthesized clip waiting for the author to save the venue. */
  candidate: { assetId: string } | null;
  /** The clip the last accept replaced; Undo restores it. */
  previous: { assetId: string } | null;
}

/** Library view of a venue's effects; only `active` clips play or export. */
export interface MansionSfxPackLibraryStateV1 {
  version: 1;
  cues: MansionSfxCueStateV1[];
  readyCount: number;
  candidateCount: number;
  /** Every cue carries a venue clip. */
  complete: boolean;
}

export function mansionSfxPackStateFromAssetsV1(
  assets: readonly Pick<DebateMysteryMansionAssetV1, "id" | "role" | "logicalId">[],
): MansionSfxPackLibraryStateV1 {
  const cues = WHODUNNIT_SFX_CUE_IDS_V1.map((cueId): MansionSfxCueStateV1 => ({
    cueId,
    active: null,
    candidate: null,
    previous: null,
  }));
  for (const asset of assets) {
    if (asset.role !== "sfx") continue;
    const parsed = parseMansionSfxLogicalIdV1(asset.logicalId);
    if (!parsed) continue;
    const cue = cues.find((entry) => entry.cueId === parsed.cueId)!;
    cue[parsed.lane] = { assetId: asset.id };
  }
  const readyCount = cues.filter((cue) => cue.active !== null).length;
  return {
    version: 1,
    cues,
    readyCount,
    candidateCount: cues.filter((cue) => cue.candidate !== null).length,
    complete: readyCount === cues.length,
  };
}

/** Active clips only, addressed by cue, for a snapshot's or package's assets. */
export function mansionSfxActiveAssetIdsV1(
  assets: readonly Pick<DebateMysteryMansionAssetV1, "id" | "role" | "logicalId">[],
): Partial<Record<WhodunnitSfxCueIdV1, string>> {
  const result: Partial<Record<WhodunnitSfxCueIdV1, string>> = {};
  for (const asset of assets) {
    if (asset.role !== "sfx") continue;
    const parsed = parseMansionSfxLogicalIdV1(asset.logicalId);
    if (parsed?.lane === "active") result[parsed.cueId] = asset.id;
  }
  return result;
}

/** Portable form: the venue's active clips, addressed by package asset id. */
export interface MansionSfxPackV1 {
  version: 1;
  cues: Array<{ cueId: WhodunnitSfxCueIdV1; packageAssetId: string }>;
}
