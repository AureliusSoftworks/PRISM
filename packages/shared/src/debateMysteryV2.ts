import type {
  DebateMysteryArtMode,
  DebateMysteryDifficulty,
  DebateMysteryPointV1,
  DebateMysteryPresetId,
  DebateMysteryPublicEvidenceItemV1,
  DebateMysteryPublicSuspectSnapshotV1,
  DebateMysteryTheoryV1,
} from "./debateMystery.js";
import type { BotFaceStyle } from "./botAvatar.js";
import type { BotAvatarDetailsV1 } from "./botAvatarDetails.js";
import type {
  MansionAmbienceManifestV1,
  MansionAtmosphereContractV1,
  PortableMansionInstallationMetadataV1,
} from "./portableMysteryPackage.js";
import type {
  MansionMusicIdentityV1,
  MansionMusicLibraryStateV1,
  MansionMusicLoopV1,
  MansionAtmosphereLibraryStateV1,
} from "./mansionMusic.js";
import type { MansionLayoutV2 } from "./mansionLayoutV2.js";
import type {
  EvidencePropBindingV1,
  MansionPropThemeV1,
  MansionPropThemeProgressV1,
} from "./whodunnitProps.js";
import {
  MYSTERY_INCIDENT_KINDS_V1,
  resolveMysteryCaseTitleV1,
  type MysteryIncidentKindV1,
  type MysteryPublicChargeV1,
} from "./mysteryIncidentPlan.ts";
import {
  botIdentityMirrorAvatarDetailsV1,
  botIdentityMirrorFaceV1,
} from "./botIdentityMirror.ts";

export const DEBATE_MYSTERY_V2_SCHEMA_VERSION = 2 as const;
export const DEBATE_MYSTERY_AUDIO_MANIFEST_VERSION = 1 as const;
export const DEBATE_MYSTERY_PLAY_READINESS_VERSION = 5 as const;
export const DEBATE_MYSTERY_V2_JUROR_COUNT = 4 as const;
export const DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1 = "mansion-exterior-v1" as const;

/**
 * The silhouette family for a mansion's one exterior establishing shot. This
 * is public topology/presentation data only; it must never be inferred from
 * case facts or silently changed underneath a selected cover.
 */
export const DEBATE_MYSTERY_MANSION_EXTERIOR_SCALE_CLASSES_V1 = [
  "compact",
  "standard",
  "grand",
] as const;
export type DebateMysteryMansionExteriorScaleClassV1 =
  typeof DEBATE_MYSTERY_MANSION_EXTERIOR_SCALE_CLASSES_V1[number];

export interface DebateMysteryMansionExteriorTopologyV1 {
  preset?: DebateMysteryPresetId;
  floors: number;
  totalRooms: number;
}

/**
 * Resolves a stable exterior silhouette from frozen public topology. Presets
 * are exact; Custom never depends on mutable story direction or private case
 * content. Three floors or thirteen-plus rooms read as Grand, while eight to
 * twelve rooms read as Standard.
 */
export function resolveDebateMysteryMansionExteriorScaleClassV1(
  topology: DebateMysteryMansionExteriorTopologyV1,
): DebateMysteryMansionExteriorScaleClassV1 {
  if (topology.preset === "compact") return "compact";
  if (topology.preset === "standard") return "standard";
  if (topology.preset === "grand") return "grand";
  const floors = Number.isFinite(topology.floors) ? Math.floor(topology.floors) : 1;
  const totalRooms = Number.isFinite(topology.totalRooms)
    ? Math.floor(topology.totalRooms)
    : 0;
  if (floors >= 3 || totalRooms >= 13) return "grand";
  if (totalRooms >= 8) return "standard";
  return "compact";
}

/**
 * Lets a topology editor expose a deliberate regenerate decision. Callers
 * retain the current exterior asset until the player explicitly replaces it.
 */
export function debateMysteryMansionExteriorScaleIsStaleV1(args: {
  exteriorScaleClass: DebateMysteryMansionExteriorScaleClassV1 | null | undefined;
  topology: DebateMysteryMansionExteriorTopologyV1;
}): boolean {
  return Boolean(args.exteriorScaleClass) &&
    args.exteriorScaleClass !== resolveDebateMysteryMansionExteriorScaleClassV1(args.topology);
}

export interface DebateMysteryPresetV2 {
  id: Exclude<DebateMysteryPresetId, "custom">;
  floors: number;
  rooms: number;
  suspects: number;
}

/** New mansions always establish a real upstairs. Legacy V1 recipes and
 * imported one-floor mansion blueprints keep their frozen topology. */
export const DEBATE_MYSTERY_V2_PRESETS: readonly DebateMysteryPresetV2[] = [
  { id: "compact", floors: 2, rooms: 5, suspects: 4 },
  { id: "standard", floors: 2, rooms: 10, suspects: 6 },
  { id: "grand", floors: 3, rooms: 15, suspects: 8 },
] as const;

export interface DebateMysteryAssetSynthesisV2 {
  evidence: boolean;
  /** ONLINE-only template edits. LOCAL cases retain bundled room art. */
  rooms: boolean;
  /** Upgrade the complete synthesized room pack from Pixel Art to Realistic before play. */
  illustratedRooms: boolean;
  /** ONLINE-only instrumental mansion theme. Failure keeps the bundled bed. */
  music: boolean;
  /** Optional mansion identity. LOCAL uses deterministic procedural/shared acoustics only. */
  ambience: boolean;
}

export type DebateMysterySealedAssetKindV1 = "evidence" | "room";
export type DebateMysterySealedAssetStatusV1 =
  | "pending"
  | "ready"
  | "fallback";

/**
 * Spoiler-safe public handle for a case-scoped encrypted visual. The binary is
 * never embedded in the session or ordinary Images storage. Its semantic file
 * route remains server-gated until `revealed` becomes true.
 */
export interface DebateMysterySealedAssetRefV1 {
  version: 1;
  kind: DebateMysterySealedAssetKindV1;
  status: DebateMysterySealedAssetStatusV1;
  source: "synthesized" | "bundled" | "mansion" | "asset_library";
  revealed: boolean;
  mimeType: "image/png" | "image/webp";
}

/**
 * Frozen visual direction shared by evidence now and room generation later.
 * It is presentation-only and contains no sealed case facts.
 */
export interface DebateMysteryHouseStyleV2 {
  version: 1;
  id: string;
  label: string;
  promptContract: string;
  atmosphere: MansionAtmosphereContractV1;
  acousticThemePaletteId: string;
  bespokeAmbienceRequested: boolean;
  /** Present on imported mansions so bespoke references and room mixes survive. */
  ambience?: MansionAmbienceManifestV1 | null;
  /** Additive: legacy mansions derive this from their public style and atmosphere. */
  musicIdentity?: MansionMusicIdentityV1;
}

export interface DebateMysteryMansionBundleRoomV1 {
  id: string;
  templateId: string;
  name: string;
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  neighborIds: string[];
  assignedSuspectSeatId: string | null;
  emoji: string;
  imageId: string | null;
  bundledAssetPath: string | null;
}

export const DEBATE_MYSTERY_MANSION_EDITOR_MIN_FLOORS_V1 = 2;
export const DEBATE_MYSTERY_MANSION_EDITOR_MAX_FLOORS_V1 = 3;
export const DEBATE_MYSTERY_MANSION_EDITOR_MIN_ROOMS_V1 = 5;
export const DEBATE_MYSTERY_MANSION_EDITOR_MAX_ROOMS_V1 = 18;
export const DEBATE_MYSTERY_MANSION_EDITOR_MIN_SECOND_FLOOR_ROOMS_FOR_THIRD_V1 = 4;
export const DEBATE_MYSTERY_MANSION_EDITOR_GRID_COLUMNS_V1 = 16;
export const DEBATE_MYSTERY_MANSION_EDITOR_GRID_ROWS_V1 = 12;

export function canAddDebateMysteryMansionEditorThirdFloorV1(
  rooms: readonly DebateMysteryMansionBundleRoomV1[],
): boolean {
  return rooms.filter((room) => room.floor === 2).length >=
    DEBATE_MYSTERY_MANSION_EDITOR_MIN_SECOND_FLOOR_ROOMS_FOR_THIRD_V1;
}

export interface DebateMysteryMansionDerivationV1 {
  version: 1;
  /** Null only for a tenant-owned blank draft created directly in Mansion Editor. */
  sourceBundleId: string | null;
  sourceTitle: string;
  sourcePackageId: string | null;
  /** Scale for which a retained one-off exterior was accepted. */
  acceptedExteriorScaleClass: DebateMysteryMansionExteriorScaleClassV1;
  createdAt: string;
}

/** Shared client/server validation for explicitly edited mansion topology.
 * Legacy packages remain readable; these constraints apply only when saving a
 * new local derivative through Mansion Editor. */
export function validateDebateMysteryMansionEditorTopologyV1(
  rooms: readonly DebateMysteryMansionBundleRoomV1[],
  suspectCount = 1,
): string[] {
  const errors: string[] = [];
  if (
    rooms.length < DEBATE_MYSTERY_MANSION_EDITOR_MIN_ROOMS_V1 ||
    rooms.length > DEBATE_MYSTERY_MANSION_EDITOR_MAX_ROOMS_V1
  ) {
    errors.push(
      `Use ${DEBATE_MYSTERY_MANSION_EDITOR_MIN_ROOMS_V1}–${DEBATE_MYSTERY_MANSION_EDITOR_MAX_ROOMS_V1} rooms.`,
    );
  }
  if (rooms.length < suspectCount) {
    errors.push(`Keep at least ${suspectCount} rooms for this mansion's supported cast.`);
  }

  const ids = new Set<string>();
  for (const room of rooms) {
    if (!room.id.trim() || ids.has(room.id)) errors.push("Every room needs a unique identity.");
    ids.add(room.id);
    if (!room.name.trim()) errors.push("Every room needs a name.");
    if (
      !Number.isInteger(room.floor) ||
      room.floor < 1 ||
      room.floor > DEBATE_MYSTERY_MANSION_EDITOR_MAX_FLOORS_V1
    ) errors.push(`${room.name || "A room"} is on an unsupported floor.`);
    if (
      !Number.isInteger(room.x) || !Number.isInteger(room.y) ||
      !Number.isInteger(room.width) || !Number.isInteger(room.height) ||
      room.x < 0 || room.y < 0 || room.width < 1 || room.height < 1 ||
      room.x + room.width > DEBATE_MYSTERY_MANSION_EDITOR_GRID_COLUMNS_V1 ||
      room.y + room.height > DEBATE_MYSTERY_MANSION_EDITOR_GRID_ROWS_V1
    ) errors.push(`${room.name || "A room"} must fit inside the floor grid.`);
  }

  const floors = new Set(rooms.map((room) => room.floor));
  if (!floors.has(1) || !floors.has(2)) {
    errors.push("Every edited mansion needs occupied ground and upper floors.");
  }
  if (floors.has(3) && !canAddDebateMysteryMansionEditorThirdFloorV1(rooms)) {
    errors.push(
      `Floor 2 needs at least ${DEBATE_MYSTERY_MANSION_EDITOR_MIN_SECOND_FLOOR_ROOMS_FOR_THIRD_V1} rooms before Floor 3 can be used.`,
    );
  }
  const highestFloor = Math.max(0, ...floors);
  for (let floor = 1; floor <= highestFloor; floor += 1) {
    if (!floors.has(floor)) errors.push("Mansion floors must remain consecutive.");
  }

  for (let index = 0; index < rooms.length; index += 1) {
    const room = rooms[index]!;
    for (let otherIndex = index + 1; otherIndex < rooms.length; otherIndex += 1) {
      const other = rooms[otherIndex]!;
      if (room.floor !== other.floor) continue;
      const overlaps =
        room.x < other.x + other.width &&
        room.x + room.width > other.x &&
        room.y < other.y + other.height &&
        room.y + room.height > other.y;
      if (overlaps) errors.push(`${room.name} overlaps ${other.name} on floor ${room.floor}.`);
    }
  }

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  for (const room of rooms) {
    const neighbors = new Set(room.neighborIds);
    if (neighbors.size !== room.neighborIds.length) {
      errors.push(`${room.name} has a duplicate connection.`);
    }
    for (const neighborId of neighbors) {
      const neighbor = roomById.get(neighborId);
      if (!neighbor || neighborId === room.id) {
        errors.push(`${room.name} has an invalid connection.`);
      } else if (!neighbor.neighborIds.includes(room.id)) {
        errors.push(`${room.name} and ${neighbor.name} must share a two-way connection.`);
      }
    }
  }

  const foyer = rooms.find((room) => room.floor === 1 && room.templateId === "foyer");
  if (!foyer) {
    errors.push("Keep a foyer on the ground floor.");
  } else if (!foyer.neighborIds.some((id) => (roomById.get(id)?.floor ?? 1) > 1)) {
    errors.push("Connect the foyer staircase to an upstairs room.");
  }

  if (foyer) {
    const visited = new Set<string>();
    const queue = [foyer.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const neighborId of roomById.get(id)?.neighborIds ?? []) {
        if (roomById.has(neighborId) && !visited.has(neighborId)) queue.push(neighborId);
      }
    }
    if (visited.size !== rooms.length) errors.push("Connect every room to the mansion's walkable plan.");
  }

  return [...new Set(errors)];
}

export type DebateMysteryMansionAssetRoleV1 =
  | "room"
  | "prop"
  | "music"
  | "presentation";

/** Protected aggregate-owned bytes. `logicalId` is presentation-only: prop
 * ids are anonymous and never preserve their source evidence identity. */
export interface DebateMysteryMansionAssetV1 {
  id: string;
  role: DebateMysteryMansionAssetRoleV1;
  logicalId: string;
  mimeType: "image/png" | "image/webp" | "audio/mpeg" | "audio/ogg" | "audio/wav";
  sha256: string;
  byteLength: number;
  durationMs?: number | null;
}

export interface DebateMysteryMansionLibraryPresentationV1 {
  version: 1;
  defaults: {
    title: string;
    description: string;
    thumbnailAssetId: string | null;
  };
  /** Local, tenant-scoped presentation. Title/description never rewrite source
   * metadata; an active custom thumbnail is copied as package preview art on
   * export so the mansion keeps its visual identity on another installation. */
  overrides: {
    title: string | null;
    description: string | null;
    thumbnailAssetId: string | null;
  };
}

export interface DebateMysteryMansionBundleSummaryV1 {
  version: 1;
  id: string;
  name: string;
  sourceSessionId: string | null;
  floors: number;
  totalRooms: number;
  /** Derived from the frozen public layout; legacy bundles derive it on read. */
  scaleClass: DebateMysteryMansionExteriorScaleClassV1;
  suspectCount: number;
  houseStyle: DebateMysteryHouseStyleV2;
  rooms: DebateMysteryMansionBundleRoomV1[];
  /** Additive connected planner state. Legacy V1 bundles omit this and keep
   * their exact compatibility rooms readable/playable. */
  layoutV2?: MansionLayoutV2 | null;
  /** Absent only on pre-aggregate API snapshots. */
  assets?: DebateMysteryMansionAssetV1[];
  /** Present when this mansion was installed from a portable package. */
  portable?: PortableMansionInstallationMetadataV1 | null;
  /** Present only on a source-preserving local Mansion Editor derivative. */
  derivation?: DebateMysteryMansionDerivationV1 | null;
  /** Present on current API snapshots; older snapshots fall back to name and
   * portable/house-style metadata on the client. */
  library?: DebateMysteryMansionLibraryPresentationV1;
  /** Current Mansion Library soundtrack state. Only active exports or plays in Investigation. */
  music?: MansionMusicLibraryStateV1;
  /** Current Mansion Library environmental world-bed state. */
  atmosphere?: MansionAtmosphereLibraryStateV1;
  /** Complete portable archetype pack. Partial generation is exposed separately by the API. */
  propTheme?: MansionPropThemeV1 | null;
  /** Mutable generation status; not copied into case snapshots or portable exports. */
  propThemeProgress?: MansionPropThemeProgressV1;
  createdAt: string;
  updatedAt: string;
}

export interface DebateMysteryMansionPresentationSnapshotV2 {
  version: 2;
  name: string;
  title: string;
  description: string;
  thumbnailAssetId: string | null;
  scaleClass: DebateMysteryMansionExteriorScaleClassV1;
  houseStyle: DebateMysteryHouseStyleV2;
  assets: DebateMysteryMansionAssetV1[];
  /** Frozen with the accepted theme so replay never reads mutable Library timing. */
  investigationThemeLoop?: MansionMusicLoopV1 | null;
  /** Frozen themed identities and local protected asset references. */
  propTheme?: MansionPropThemeV1 | null;
}

/** Captured once when Case Forge creates a session. Mutable Library metadata
 * and topology can no longer race later compilation, Archive, or replay. */
export interface DebateMysteryMansionSnapshotV2 {
  version: 2;
  sourceBundleId: string;
  /** V1-compatible semantic projection used by the existing case compiler. */
  rooms: DebateMysteryMansionBundleRoomV1[];
  /** Current Case Forge projects V1 sources into a decorated V2 snapshot;
   * null remains readable only for older stored snapshots. */
  layoutV2: MansionLayoutV2 | null;
  layoutSha256: string;
  presentation: DebateMysteryMansionPresentationSnapshotV2;
  presentationSha256: string;
  capturedAt: string;
}

export type DebateMysteryTrialTypeV2 = "jury" | "bench";
/** Frozen at compilation: full mansion investigation, or court from the title card. */
export type DebateMysteryInvestigationModeV2 = "full" | "court_only";
export const DEBATE_MYSTERY_V2_MAX_AUTHOR_ATTEMPTS = 5;

/**
 * Clamp stale or malformed public progress copy to its own declared budget.
 * This operates only on spoiler-safe presentation text and never inspects
 * sealed case state.
 */
export function normalizeDebateMysteryV2ForgeProgressMessage(
  message: string,
): string {
  return message.replace(
    /\battempt\s+(\d+)\s+of\s+(\d+)\b/giu,
    (label, attemptText: string, maxText: string) => {
      const attempt = Number.parseInt(attemptText, 10);
      const maxAttempts = Number.parseInt(maxText, 10);
      if (
        !Number.isSafeInteger(attempt) ||
        !Number.isSafeInteger(maxAttempts) ||
        maxAttempts < 1 ||
        attempt <= maxAttempts
      ) return label;
      return `attempt ${maxAttempts} of ${maxAttempts}`;
    },
  );
}

export type DebateMysteryCompilationStageV2 =
  | "writing_case"
  | "testing_contradictions"
  | "directing_performances"
  | "preparing_local_voices"
  | "verifying_case_audio"
  | "complete"
  | "needs_attention"
  | "cancelled";
/** A spoiler-safe, resumable unit of the active Case Forge stage. */
export interface DebateMysteryCompilationSubstepV2 {
  /** Stable public identifier; never derived from sealed case content. */
  id: string;
  label: string;
  state: "complete" | "active" | "upcoming" | "attention";
}
export type DebateMysteryPlayPhaseV2 =
  | "case_forge"
  | "title_card"
  /** The embodied player's pre-authored internal briefing before scene arrival. */
  | "case_opening"
  | "investigation"
  | "theory"
  | "trial"
  | "verdict";
export type DebateMysteryLineModeV2 =
  | "spoken"
  | "text_only"
  | "player_selected"
  /** The player's frozen embodied bot performs an internal thought through
   * Babble while remaining publicly identified as the speaker. */
  | "persona_babble"
  /** A real frozen bot performs this line through Babble, while its identity
   * remains absent from the public dialogue projection. Legacy only. */
  | "anonymous_babble";
export type DebateMysteryRecordKindV2 = "evidence" | "testimony";
export type DebateMysteryCourtCalloutV2 =
  | "hold_it"
  | "objection"
  | "order"
  | "sustained"
  | "overruled"
  | "testimony_revised"
  | "guilty"
  | "not_guilty";
export type DebateMysteryDialogueNodeKindV2 =
  | "briefing"
  | "room_introduction"
  | "talk_topic"
  | "present_reaction"
  | "examination_result"
  | "testimony_statement"
  | "press_result"
  | "testimony_revision"
  | "prosecution_choice"
  | "choice_reaction"
  | "court_reaction"
  | "defense_reaction"
  | "defendant_reaction"
  | "prosecutor_strategy"
  | "verdict";

export interface DebateWhodunnitCreateConfigV2 {
  version: typeof DEBATE_MYSTERY_V2_SCHEMA_VERSION;
  preset: DebateMysteryPresetId;
  difficulty: DebateMysteryDifficulty;
  artMode: DebateMysteryArtMode;
  trialType: DebateMysteryTrialTypeV2;
  /** Skip the mansion and compile the finite court act only. */
  investigationMode?: DebateMysteryInvestigationModeV2;
  inspiration: string;
  /** Frozen freeform Theme / Spark. `inspiration` remains its V2 compatibility alias. */
  spark?: string;
  assetSynthesis?: Partial<DebateMysteryAssetSynthesisV2>;
  /** Default-off permission to freeze up to two compatible personal prop cameos. */
  useRelevantAssetLibraryProps?: boolean;
  /** Minimal setup seam for an aggregate-owned saved mansion. */
  mansionBundleId?: string | null;
  /** Accepted, tenant-owned exterior draft for a newly created mansion. */
  mansionExteriorImageId?: string | null;
  /** The Mansion-step direction frozen with that accepted exterior. */
  mansionExteriorDirection?: string | null;
  nonce: string;
  floors?: number;
  totalRooms?: number;
  suspectBotIds: string[];
  judgeBotId?: string;
  prosecutorBotId?: string;
  /** Legacy V2 setup alias. It is accepted only while loading old cases and is
   * normalized to prosecutorBotId before the setup becomes public. */
  prosecutorPartnerBotId?: string;
  rivalDefenseBotId: string;
  jurorBotIds: string[];
  playerRole?: "participant" | "spectator";
  participationDifficulty?: "coach" | "standard" | "immersive";
}

export interface DebateMysteryResolvedConfigV2
  extends Omit<
    DebateWhodunnitCreateConfigV2,
    | "floors"
    | "totalRooms"
    | "judgeBotId"
    | "prosecutorBotId"
    | "prosecutorPartnerBotId"
    | "investigationMode"
    | "spark"
    | "assetSynthesis"
    | "useRelevantAssetLibraryProps"
    | "mansionBundleId"
    | "mansionExteriorImageId"
    | "mansionExteriorDirection"
  > {
  floors: number;
  totalRooms: number;
  /** Frozen with the public topology when Case Forge begins. */
  scaleClass: DebateMysteryMansionExteriorScaleClassV1;
  judgeBotId: string;
  prosecutorBotId: string;
  investigationMode: DebateMysteryInvestigationModeV2;
  spark: string;
  assetSynthesis: DebateMysteryAssetSynthesisV2;
  useRelevantAssetLibraryProps: boolean;
  mansionBundleId: string | null;
  /** Canonical immutable aggregate snapshot. Legacy archived cases omit it. */
  mansionSnapshot: DebateMysteryMansionSnapshotV2 | null;
  houseStyle: DebateMysteryHouseStyleV2;
  jurorBotIds: [string, string, string, string] | [];
  eyewitnessChance: number;
}

export interface DebateMysteryRecordReferenceV2 {
  kind: DebateMysteryRecordKindV2;
  id: string;
}

export type DebateMysteryTalkSubjectV2 =
  | { category: "general" }
  | { category: "motive" }
  | { category: "alibi" }
  | { category: "person"; personId: string }
  | { category: "room"; roomId: string };

export type DebateMysteryPresentationUnlockTargetV2 =
  | { kind: "topic"; topicNodeId: string }
  | { kind: "room"; roomId: string }
  | { kind: "hotspot"; roomId: string; hotspotId: string; nodeId: string }
  | { kind: "location_discovery"; discoveryId: string }
  | { kind: "record_discovery"; record: DebateMysteryRecordReferenceV2 }
  | { kind: "record_description"; record: DebateMysteryRecordReferenceV2; description: string };

/** Private frozen rule. It is stored with the dialogue graph and is never
 * projected into the public session payload. */
export interface DebateMysteryPresentationGateV2 {
  id: string;
  requiredRecord: DebateMysteryRecordReferenceV2;
  requiredSuspectSeatId: string;
  correctPresentNodeId: string;
  unlocks: DebateMysteryPresentationUnlockTargetV2[];
  requiredForProgression: boolean;
}

export interface DebateMysteryPerformanceDirectionV2 {
  mood: string;
  pace: "measured" | "natural" | "urgent";
  intensity: 0 | 1 | 2 | 3;
  actorNote: string;
}

export interface DebateMysteryStageCueFactV1 {
  id: string;
  /** The only case-bearing statement the runtime actor may receive for this
   * cue. Sealed forbidden facts are validated locally and are never copied
   * into an ONLINE prompt. */
  statement: string;
  /** At least one fragment must appear when this fact is required on stage. */
  mentionFragments: string[];
  required: boolean;
}

export interface DebateMysteryStageCueBeatV1 {
  id: string;
  instruction: string;
  /** Small deterministic receipt for a semantic beat. This is intentionally
   * stricter than asking another model to judge testimony after the fact. */
  acceptedTextFragments: string[];
}

/** Private performance contract. The compiler remains the author of the
 * mystery; a runtime model may only act inside these sealed rails. */
export interface DebateMysteryStageCueV1 {
  version: 1;
  id: string;
  objective: string;
  emotionalState: string;
  knownFactIds: string[];
  allowedFacts: DebateMysteryStageCueFactV1[];
  requiredBeats: DebateMysteryStageCueBeatV1[];
  /** Checked locally, but never sent to a provider prompt. */
  forbiddenDisclosures: string[];
  contradictionTrigger: {
    record: DebateMysteryRecordReferenceV2;
    instruction: string;
  } | null;
  exitCondition: string;
  deterministicFallbackText: string;
  maxCharacters: number;
}

export interface DebateMysteryStageCuePerformanceValidationV1 {
  valid: boolean;
  normalizedText: string;
  errors: string[];
}

function normalizeMysteryStageCueTextV1(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function mysteryStageCueContainsV1(text: string, fragment: string): boolean {
  const normalizedFragment = normalizeMysteryStageCueTextV1(fragment);
  return Boolean(normalizedFragment) && text.includes(normalizedFragment);
}

export function validateDebateMysteryStageCuePerformanceV1(args: {
  cue: DebateMysteryStageCueV1;
  text: string;
}): DebateMysteryStageCuePerformanceValidationV1 {
  const text = args.text.trim().replace(/\s+/gu, " ");
  const normalizedText = normalizeMysteryStageCueTextV1(text);
  const errors: string[] = [];
  if (!text) errors.push("The performed line is empty.");
  if (text.length > args.cue.maxCharacters) {
    errors.push(`The performed line exceeds ${args.cue.maxCharacters} characters.`);
  }
  for (const fact of args.cue.allowedFacts) {
    if (
      fact.required &&
      !fact.mentionFragments.some((fragment) =>
        mysteryStageCueContainsV1(normalizedText, fragment))
    ) {
      errors.push(`The performed line omits required fact ${fact.id}.`);
    }
  }
  for (const beat of args.cue.requiredBeats) {
    if (
      !beat.acceptedTextFragments.some((fragment) =>
        mysteryStageCueContainsV1(normalizedText, fragment))
    ) {
      errors.push(`The performed line omits required beat ${beat.id}.`);
    }
  }
  for (const disclosure of args.cue.forbiddenDisclosures) {
    if (mysteryStageCueContainsV1(normalizedText, disclosure)) {
      errors.push("The performed line contains a forbidden disclosure.");
      break;
    }
  }
  return { valid: errors.length === 0, normalizedText: text, errors };
}

export interface DebateMysterySpokenLineV2 {
  id: string;
  nodeId: string;
  speakerKind: "bot" | "judge" | "player" | "narrator";
  /** For persona_babble this is the public embodied speaker. For legacy
   * anonymous_babble it remains the private carrier and projects as null. */
  speakerBotId: string | null;
  stageActionText: string | null;
  visibleText: string;
  spokenText: string;
  performance: DebateMysteryPerformanceDirectionV2;
  /** Additive for hybrid runtime performances. Older frozen lines remain
   * fully playable through their deterministic authored text. */
  stageCue?: DebateMysteryStageCueV1 | null;
  mode: DebateMysteryLineModeV2;
  reusableCalloutKey: DebateMysteryCourtCalloutV2 | null;
}

export interface DebateMysteryDialogueRequirementV2 {
  discoveryIds: string[];
  unlockedTopicIds: string[];
  admittedRecordIds: string[];
  choices: Array<{ choiceId: string; optionId: string }>;
}

export interface DebateMysteryDialogueMutationV2 {
  discoverIds: string[];
  unlockTopicIds: string[];
  admitRecordIds: string[];
  /** Additive V2 bridge for the deterministic mansion access-item graph.
   * Older frozen cases omit it and continue with an empty Case Kit. */
  acquireItemIds?: string[];
  choices: Array<{ choiceId: string; optionId: string }>;
}

export interface DebateMysteryDialogueNodeV2 {
  id: string;
  kind: DebateMysteryDialogueNodeKindV2;
  scene: "investigation" | "court" | "verdict";
  speakerSeatId: string | null;
  intendedRecipientSeatId: string | null;
  /** Optional explicit bot recipient for a sealed direct-address exchange.
   * This preserves presentation and copied-Power routing without inferring it
   * from turn order during replay. */
  intendedRecipientBotId?: string | null;
  lineId: string | null;
  label: string | null;
  /** Public investigation location, when this interaction is spatially bound. */
  locationId?: string | null;
  /** Present only on player-selectable Talk roots. */
  talkSubject?: DebateMysteryTalkSubjectV2 | null;
  requirements: DebateMysteryDialogueRequirementV2;
  mutations: DebateMysteryDialogueMutationV2;
  recordReferences: DebateMysteryRecordReferenceV2[];
  nextNodeIds: string[];
  terminalOutcome: "return_to_room" | "chapter_complete" | "case_complete" | null;
}

export interface DebateMysteryStatementVersionV2 {
  id: string;
  statementId: string;
  witnessSeatId: string;
  version: number;
  lineId: string;
  pressNodeId: string;
  correctPresentations: DebateMysteryRecordReferenceV2[];
  rebuttalNodeId: string;
  objectionNodeId?: string;
  revisionNodeId: string | null;
  nextStatementId: string | null;
}

export interface DebateMysteryWitnessChapterV2 {
  id: string;
  witnessSeatId: string;
  ordinal: number;
  pivotal: boolean;
  recall: boolean;
  checkpointNodeId: string;
  initialStatementIds: string[];
  statementVersions: DebateMysteryStatementVersionV2[];
  completionNodeId: string;
}

export interface DebateMysteryProsecutionChoiceV2 {
  id: string;
  promptLineId: string;
  options: Array<{ id: string; lineId: string; responseNodeId: string }>;
}

export interface DebateMysteryDialogueGraphV2 {
  version: typeof DEBATE_MYSTERY_V2_SCHEMA_VERSION;
  caseId: string;
  initialDiscoveryIds: string[];
  initialAdmittedRecordIds: string[];
  interactionRootNodeIds: string[];
  nodes: DebateMysteryDialogueNodeV2[];
  lines: DebateMysterySpokenLineV2[];
  witnessChapters: DebateMysteryWitnessChapterV2[];
  prosecutionChoices: DebateMysteryProsecutionChoiceV2[];
  /** One finite reveal for each occupied room. `casekeeperNodeId` is the legacy
   * storage key for the embodied player's opening thought. Older graphs move
   * directly from the text-only tableau to the persona node. Current graphs add a
   * frozen Prosecution -> occupant -> Prosecution opening exchange while
   * retaining personaNodeId as the occupant-response compatibility alias. */
  roomIntroductionNodeIdsByRoom?: Record<string, {
    casekeeperNodeId: string;
    personaNodeId: string;
    suspectSeatId: string;
    openingExchangeNodeIds?: {
      prosecutionOpeningNodeId: string;
      occupantResponseNodeId: string;
      prosecutionHandoffNodeId: string;
    };
  }>;
  talkTopicNodeIdsBySuspect: Record<string, string[]>;
  /** Private, exact Present routes and their bounded public unlocks. */
  presentationGates?: DebateMysteryPresentationGateV2[];
  /** Compatibility-only Talk nodes retained byte-for-byte after an old
   * evidence-mirroring topic is removed from the playable Talk menu. */
  retiredTalkNodeIds?: string[];
  /** Optional for compatibility with cases frozen before repeat Talk delivery.
   * Each entry contains finite suspect-owned response nodes selected after a
   * topic has already been completed. */
  repeatResponseNodeIdsByTopic?: Record<string, string[]>;
  presentNodeIdsBySuspect: Record<string, string[]>;
  prosecutorStrategyNodeId?: string;
  /** Compatibility-only nodes retained by cases compiled before Court
   * argument ownership moved entirely to Defense Counsel. Current runtime
   * never inserts these generic defendant interjections. */
  defendantReactionNodeIdsBySeat?: Record<
    string,
    { testimony: string; objection: string; evidence: string }
  >;
  verdictNodeIds: string[];
}

export interface DebateMysteryCompilationStatusV2 {
  version: typeof DEBATE_MYSTERY_V2_SCHEMA_VERSION;
  jobId: string;
  stage: DebateMysteryCompilationStageV2;
  attempt: number;
  completedPasses: number;
  totalPasses: number;
  preparedAudioCount: number;
  requiredAudioCount: number;
  /**
   * Granular progress derived from durable authoring checkpoints, deterministic
   * passes, or local-audio counters. It intentionally contains no case facts.
   */
  substeps: DebateMysteryCompilationSubstepV2[];
  retryable: boolean;
  /** Stable public diagnostic code. Never derived from the private compiler error. */
  publicFailureCode?: "CASE_FORGE_COMPILATION_STOPPED" | "CASE_FORGE_LOCAL_AUDIO_FAILED" | null;
  /** Last spoiler-safe work stage before recovery. Optional for frozen legacy cases. */
  publicFailureStage?: Exclude<
    DebateMysteryCompilationStageV2,
    "complete" | "needs_attention" | "cancelled"
  > | null;
  spoilerSafeMessage: string;
  /** Stable start time used for a live elapsed clock across reloads/restarts. */
  startedAt: string;
  /** Server snapshot; clients may advance it from startedAt while work is active. */
  elapsedMs: number;
  /** Spoiler-safe estimate derived only from completed durable pass history. */
  approximateRemainingMs: number | null;
  etaBasisPasses: number;
  updatedAt: string;
}

export interface DebateMysteryAudioManifestEntryV1 {
  lineId: string;
  textHash: string;
  /** Hash of the performed text; differs from textHash for Babble carriers. */
  synthesisTextHash?: string;
  botId: string | null;
  /** Additive for compatibility: legacy entries without this field are English. */
  voiceTreatment?: "english" | "babble";
  voiceProfileHash: string;
  performanceDirectionHash: string;
  clipPath: string;
  mimeType: string;
  durationMs: number;
  byteSize: number;
  sha256: string;
  alignment: Array<{ startMs: number; endMs: number; start: number; end: number }> | null;
  reusableCalloutKey: DebateMysteryCourtCalloutV2 | null;
  verifiedAt: string;
}

export interface DebateMysteryAudioManifestV1 {
  version: typeof DEBATE_MYSTERY_AUDIO_MANIFEST_VERSION;
  /** Legacy packs eagerly contain every reachable branch. Stage-cue cases
   * keep a verified sparse manifest and attach clips only after a line is
   * actually accepted into the canonical transcript. */
  preparationMode?: "eager-v1" | "lazy-on-demand-v1";
  caseId: string;
  caseHash: string;
  scriptHash: string;
  dialogueGraphHash: string;
  engine: "prism-instant-local";
  model: string;
  modelVersion: string;
  entries: DebateMysteryAudioManifestEntryV1[];
  complete: boolean;
  completedAt: string | null;
  verifiedAt: string | null;
}

export type DebateMysteryVerdictClassificationV2 =
  | "just_conviction"
  | "unsafe_conviction"
  | "wrongful_conviction"
  | "acquittal_despite_proof"
  | "failed_prosecution";

export interface DebateMysteryJurorBallotV2 {
  jurorBotId: string;
  /** Defendant this ballot concerns. Missing on legacy single-defendant trials. */
  defendantSeatId?: string;
  vote: "guilty" | "not_guilty";
  reason: string;
  powerAffected: boolean;
}

export interface DebateMysteryVerdictV2 {
  legalResult: "guilty" | "not_guilty";
  classification: DebateMysteryVerdictClassificationV2;
  /** Charge-agnostic correctness. Missing on legacy homicide verdicts. */
  accusationCorrect?: boolean;
  /** Per-defendant legal results allow one filed accusation to name several
   * people without collapsing mixed outcomes into one factual answer. */
  defendantVerdicts?: Array<{
    seatId: string;
    legalResult: "guilty" | "not_guilty";
    factuallyResponsible: boolean;
    classification: DebateMysteryVerdictClassificationV2;
  }>;
  /** Legacy homicide alias retained for Archive/package compatibility. */
  sealedCulpritCorrect: boolean;
  proofGrade: "proved" | "unsafe" | "failed";
  jurorBallots: DebateMysteryJurorBallotV2[];
  deliveredAt: string;
}

export interface DebateMysteryRoomV2 {
  id: string;
  /** Frozen room module identity; optional only for legacy V2 cases. */
  templateId?: string;
  name: string;
  floor: number;
  /** Frozen mansion footprint. Optional only for V2 cases compiled before the
   * spatial board contract shipped; clients derive a stable fallback layout. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  neighborIds?: string[];
  emoji: string;
  imageId: string | null;
  bundledAssetPath: string | null;
  sealedAsset?: DebateMysterySealedAssetRefV1 | null;
  /** Spoiler-safe doorway state. Vault identity and review detail never appear here. */
  accessState?: "hidden" | "being_secured" | "ready_to_enter" | "visited";
  unlocked: boolean;
  visited: boolean;
  hotspots: Array<{
    id: string;
    label: string;
    polygon: DebateMysteryPointV1[];
    examined: boolean;
    unlocked: boolean;
  }>;
}

/** Persisted room-entry choreography. A reload during `persona` repeats the
 * same frozen local performance; only `complete` restores room controls. */
export type DebateMysteryRoomIntroductionPhaseV2 =
  | "unseen"
  | "casekeeper"
  | "persona"
  | "complete";

export interface DebateMysteryRoomNarrationAppearanceV2 {
  description?: string | null;
  style?: string | null;
  presence?: string | null;
  pronouns?: string | null;
}

const MYSTERY_NARRATION_NAME_TOKEN_STOPWORDS_V2 = new Set([
  "a", "an", "captain", "doctor", "dr", "lady", "lord", "mr", "mrs", "ms", "sir", "the",
]);

function mysteryNarrationNamePartsV2(
  personaName: string | null | undefined,
): string[] {
  const name = personaName?.replace(/\s+/gu, " ").trim() ?? "";
  if (!name) return [];
  const tokens = name.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? [];
  return [
    name,
    ...tokens.filter((token) =>
      !MYSTERY_NARRATION_NAME_TOKEN_STOPWORDS_V2.has(token.toLocaleLowerCase())),
  ].sort((left, right) => right.length - left.length);
}

export function debateMysteryRoomNarrationNamesPersonaV2(
  value: string | null | undefined,
  personaName: string | null | undefined,
): boolean {
  const text = value?.replace(/\s+/gu, " ").trim() ?? "";
  return Boolean(text) && mysteryNarrationNamePartsV2(personaName).some((part) => {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?:['’]s)?(?![\\p{L}\\p{N}])`, "iu").test(text);
  });
}

function cleanMysteryNarrationFragmentV2(
  value: string | null | undefined,
  personaName: string | null | undefined,
  maxLength = 240,
): string {
  let text = (value ?? "")
    .replace(/[\r\n]+/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/^[-–—\s]+/u, "")
    .trim();
  for (const part of mysteryNarrationNamePartsV2(personaName)) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    text = text.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?:['’]s)?(?![\\p{L}\\p{N}])`, "giu"),
      "",
    );
  }
  text = text
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/^(?:has|had|wears?|wore)\s+/iu, "")
    .replace(/^(?:is|was)\s+(?:an?\s+)?/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return text
    .slice(0, maxLength)
    .replace(/[.!?;:\s]+$/u, "")
    .trim();
}

function mysteryNarrationDescriptionV2(
  appearance: DebateMysteryRoomNarrationAppearanceV2 | null | undefined,
  personaName: string | null | undefined,
): string {
  const description = cleanMysteryNarrationFragmentV2(
    appearance?.description,
    personaName,
  ).split(/[.;]/u)[0]?.trim() ?? "";
  if (!description) return "A solitary figure";

  const details = description
    .split(",")
    .map((detail) => detail.trim())
    .filter((detail, index) => Boolean(detail) && (
      index === 0 || !/^(?:always|commonly|often|typically|usually)\b/iu.test(detail)
    ))
    .slice(0, 3)
    .join(", ");
  if (!details) return "A solitary figure";
  if (/^(?:a|an|the)\b/iu.test(details)) {
    return `${details.charAt(0).toLocaleUpperCase()}${details.slice(1)}`;
  }
  if (
    /\b(?:android|animal|artist|attorney|being|boy|cat|child|creature|detective|doctor|dog|engineer|figure|ghost|girl|human|inventor|lawyer|man|person|professor|raccoon|robot|scientist|spirit|sponge|teacher|woman)\b/iu.test(details)
  ) {
    const article = /^[aeiou]/iu.test(details) ? "An" : "A";
    const trailingModifier = details.split(",").at(-1)?.trim() ?? "";
    const closingComma = /^(?:aged|clad|dressed|marked|scarred|weathered|worn)\b/iu.test(trailingModifier)
      ? ","
      : "";
    return `${article} ${details}${closingComma}`;
  }
  return `A figure with ${details.charAt(0).toLocaleLowerCase()}${details.slice(1)}`;
}

type MysteryNarrationPresenceV2 = "focused" | "restless" | "solemn" | "unreadable" | "watchful";

function mysteryNarrationPresenceV2(
  appearance: DebateMysteryRoomNarrationAppearanceV2 | null | undefined,
): MysteryNarrationPresenceV2 {
  const cues = `${appearance?.presence ?? ""} ${appearance?.description ?? ""}`.toLocaleLowerCase();
  if (/\b(?:animated|energetic|fidget|nervous|playful|quick|restless)\b/u.test(cues)) return "restless";
  if (/\b(?:distant|enigmatic|haunting|mysterious|shadowed|unreadable)\b/u.test(cues)) return "unreadable";
  if (/\b(?:calm|composed|gentle|patient|quiet|reserved|soft|solemn|steady)\b/u.test(cues)) return "solemn";
  if (/\b(?:authoritative|commanding|confident|formidable|intense|severe|sharp|uncompromising)\b/u.test(cues)) return "focused";
  return "watchful";
}

function mysteryNarrationActionV2(
  fixtureLabels: readonly string[],
  presence: MysteryNarrationPresenceV2,
): string {
  const fixtures = fixtureLabels.join(" ").toLocaleLowerCase();
  if (/\bwindow\b/u.test(fixtures)) {
    if (presence === "restless") return "watches the window's reflection, never quite holding still";
    if (presence === "unreadable") return "watches the dark beyond the window without moving";
    if (presence === "focused") return "stands framed by the window, surveying the room in silence";
    if (presence === "solemn") return "stares solemnly through the window";
    return "looks out through the window in thoughtful silence";
  }
  if (/\bmirror\b/u.test(fixtures)) {
    if (presence === "restless") return "catches the mirror's reflection, then looks quickly away";
    if (presence === "unreadable") return "studies the mirror with an unreadable expression";
    if (presence === "focused") return "meets the mirror's reflection without flinching";
    if (presence === "solemn") return "studies the mirror in grave silence";
    return "pauses before the mirror, lost in thought";
  }
  if (/\b(?:fireplace|mantel|hearth)\b/u.test(fixtures)) {
    if (presence === "restless") return "paces once before the fireplace, then turns sharply back";
    if (presence === "focused") return "holds their ground beside the fireplace";
    return "waits beside the fireplace as the room settles around them";
  }
  if (/\b(?:desk|table|workbench)\b/u.test(fixtures)) {
    if (presence === "restless") return "traces the edge of the nearest table, attention moving everywhere at once";
    if (presence === "focused") return "stands at the nearest table, posture fixed and deliberate";
    if (presence === "unreadable") return "rests one hand near the table and gives nothing away";
    return "waits beside the nearest table in measured silence";
  }
  if (/\b(?:bookcase|bookshelf|shelf|stacks)\b/u.test(fixtures)) {
    if (presence === "restless") return "moves between the shelves, then stops at the sound of your approach";
    if (presence === "focused") return "stands motionless between the shelves, already watching you";
    return "lingers among the shelves in quiet contemplation";
  }
  if (/\bdoor\b/u.test(fixtures)) {
    if (presence === "restless") return "keeps close to the door, listening for movement beyond it";
    if (presence === "focused") return "stands between you and the door, perfectly composed";
    return "waits near the closed door, listening to the house breathe";
  }
  if (presence === "restless") return "turns at your approach, restless attention snapping into focus";
  if (presence === "unreadable") return "lingers at the room's edge in unreadable silence";
  if (presence === "focused") return "stands perfectly still, watching your approach";
  if (presence === "solemn") return "waits in composed silence";
  return "turns slowly to acknowledge your arrival";
}

/**
 * A stable, name-free first impression assembled only from the frozen/public
 * appearance profile and visible room fixtures. It contains no case facts and
 * is safe to persist as the embodied player's thought before the occupant speaks.
 */
export function debateMysteryRoomNarrationTextV2(args: {
  appearance?: DebateMysteryRoomNarrationAppearanceV2 | null;
  fixtureLabels?: readonly string[];
  personaName?: string | null;
}): string {
  const subject = mysteryNarrationDescriptionV2(args.appearance, args.personaName);
  const presence = mysteryNarrationPresenceV2(args.appearance);
  const action = mysteryNarrationActionV2(args.fixtureLabels ?? [], presence);
  const presenceDetail = cleanMysteryNarrationFragmentV2(
    args.appearance?.presence,
    args.personaName,
    100,
  ).split(/[.;]/u)[0]?.trim() ?? "";
  const adjectivePresence = /^(?:authoritative|calm|commanding|composed|confident|distant|enigmatic|formidable|gentle|intense|mysterious|patient|quiet|reserved|severe|sharp|soft|solemn|steady|uncompromising|unreadable)\b/iu.test(presenceDetail)
    ? presenceDetail
    : "";
  const ending = adjectivePresence
    ? `—${adjectivePresence.charAt(0).toLocaleLowerCase()}${adjectivePresence.slice(1)}.`
    : ".";
  return `${subject} ${action}${ending}`.slice(0, 420);
}

export interface DebateMysteryPublicRecordItemV2 {
  reference: DebateMysteryRecordReferenceV2;
  title: string;
  description: string;
  emoji: string;
  visualKind?: "emoji" | "upload" | "synthesized";
  imageId?: string | null;
  sealedAsset?: DebateMysterySealedAssetRefV1 | null;
  /** Immutable object identity chosen before authoring. Missing on legacy cases. */
  evidencePropBinding?: EvidencePropBindingV1 | null;
  admitted: boolean;
  updatedAt: string;
}

export interface DebateMysteryCaseKitItemV2 {
  id: string;
  title: string;
  description: string;
  emoji: string;
  kind: "key" | "code" | "remote" | "container" | "artifact";
  usable: boolean;
  locked: boolean;
  sourceRoomId: string;
  acquiredAt: string;
}

export interface DebateMysteryPublicTopicV2 {
  nodeId: string;
  suspectSeatId: string;
  label: string;
  subject: DebateMysteryTalkSubjectV2;
  unlocked: boolean;
  completed: boolean;
}

export interface DebateMysteryPublicDialogueEntryV2 {
  nodeId: string;
  lineId: string | null;
  /** Text-only delivery is intentionally silent even when an older frozen case
   * still has a local audio clip for the authored line. */
  delivery?: "spoken" | "text_only" | "persona_babble" | "anonymous_babble";
  stageActionText?: string | null;
  visibleText: string;
  speakerSeatId: string | null;
  speakerBotId: string | null;
  /** Frozen provenance distinguishes a player-authored Prosecutor line from
   * an automated cast-bot line that uses the same public bot identity. */
  speakerKind?: "bot" | "player" | "judge" | "narrator";
  /** Recorded only when the authored graph explicitly addresses a bot. */
  intendedRecipientSeatId?: string | null;
  intendedRecipientBotId?: string | null;
  /**
   * Spoiler-safe projection for an Examine result that changed durable public
   * investigation state (a record, Case Kit item, or unlocked public lead).
   * It intentionally carries no sealed graph or truth data.
   */
  caseFileRelevant?: boolean;
  occurredAt: string;
}

/** Minimal immutable public form needed to replay Identity Crisis without
 * consulting a mutable Library bot after Case Forge. */
export interface DebateMysteryIdentityMirrorTargetSnapshotV1 {
  version: 1;
  botId: string;
  name: string;
  faceStyle: BotFaceStyle;
  avatarDetails: BotAvatarDetailsV1 | null;
  glyph: string | null;
}

const DEBATE_MYSTERY_STAGE_ACTION_VERB_RE = /^(?:adjusts?|blinks?|braces?|clenches?|draws?|examines?|folds?|frowns?|gestures?|glances?|glares?|grimaces?|hesitates?|holds?|leans?|looks?|lowers?|nods?|paces?|pauses?|performs?|places?|points?|raises?|reaches?|recoils?|relaxes?|sets?|shakes?|shifts?|shrugs?|sighs?|scoffs?|smirks?|stares?|steadies?|straightens?|studies?|swallows?|takes?|taps?|tenses?|tilts?|turns?|unfolds?|winces?)\b/iu;

function mysterySpeakerAliases(
  value?: string | readonly string[] | null,
): string[] {
  const names = (Array.isArray(value) ? value : value ? [value] : [])
    .map((name) => name.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  for (const name of [...names]) {
    const parts = name.split(/\s+/u);
    if (parts[0]) names.push(parts[0]);
    if (parts.length > 1 && parts.at(-1)) names.push(parts.at(-1)!);
  }
  return [...new Set(names)].sort((left, right) => right.length - left.length);
}

function mysteryStageActionDisplayText(
  value: string,
  speakerNames?: string | readonly string[] | null,
  allowAnyVerb = false,
): string | null {
  let action = value.replace(/\s+/gu, " ").replace(/[.!?;:\s]+$/u, "").trim();
  if (!action || action.length > 180 || /["“”]/u.test(action)) return null;
  for (const speakerName of mysterySpeakerAliases(speakerNames)) {
    const escapedName = speakerName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const stripped = action.replace(
      new RegExp(`^${escapedName}(?:['’]s)?(?:\\s+|,\\s*)`, "iu"),
      "",
    );
    if (stripped !== action) {
      action = stripped;
      break;
    }
  }
  // Older frozen packs sometimes retain the authoring-time witness name while
  // the current cast supplies a different displayed profile. A narrated quote
  // still has an unambiguous visual prefix, so strip that stale proper-name
  // label before deciding whether it is an action.
  const staleNamePrefix = action.match(
    /^(?:[\p{Lu}][\p{L}'’.-]*\s+){1,3}((?:adjusts?|blinks?|braces?|clenches?|draws?|examines?|folds?|frowns?|gestures?|glances?|glares?|grimaces?|hesitates?|holds?|leans?|looks?|lowers?|nods?|paces?|pauses?|performs?|places?|points?|raises?|reaches?|recoils?|relaxes?|sets?|shakes?|shifts?|shrugs?|sighs?|scoffs?|smirks?|stares?|steadies?|straightens?|studies?|swallows?|takes?|taps?|tenses?|tilts?|turns?|unfolds?|winces?)\b[\s\S]*)$/u,
  );
  if (staleNamePrefix?.[1]) action = staleNamePrefix[1].trim();
  action = action.replace(/^(?:he|she|they|the witness|the suspect)\s+/iu, "").trim();
  if (!action || (!allowAnyVerb && !DEBATE_MYSTERY_STAGE_ACTION_VERB_RE.test(action))) {
    return null;
  }
  return `${action.charAt(0).toLocaleUpperCase()}${action.slice(1)}`;
}

/** Separates a nonverbal performance beat from the words a Whodunnit actor speaks. */
export function splitDebateMysteryStageActionTextV2(
  value: string,
  speakerNames?: string | readonly string[] | null,
): { stageActionText: string | null; spokenText: string } {
  const text = value.replace(/\s+/gu, " ").trim();
  if (!text) return { stageActionText: null, spokenText: "" };

  const marked = text.match(/^\*([^*\n]{2,180})\*\s+([\s\S]+)$/u);
  if (marked?.[1] && marked[2]) {
    const stageActionText = mysteryStageActionDisplayText(marked[1], speakerNames, true);
    if (stageActionText) return { stageActionText, spokenText: marked[2].trim() };
  }

  const narrated = text.match(/^(.{2,180}?)[.!?]?\s*[“"]([\s\S]+)[”"]$/u);
  if (narrated?.[1] && narrated[2]) {
    const stageActionText = mysteryStageActionDisplayText(narrated[1], speakerNames, true);
    if (stageActionText) return { stageActionText, spokenText: narrated[2].trim() };
  }

  return { stageActionText: null, spokenText: text };
}

function stableMysteryActionIndex(value: string, length: number): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash) % Math.max(1, length);
}

/** Stable, visual-only fallback for legacy lines that never authored a
 * physical beat. It is intentionally derived from frozen line/performance
 * data and never enters spoken text or audio. */
export function fallbackDebateMysteryStageActionTextV2(args: {
  stableId: string;
  performance: Pick<DebateMysteryPerformanceDirectionV2, "mood" | "intensity">;
}): string {
  const mood = args.performance.mood.toLocaleLowerCase();
  const candidates = /angry|defiant|insistent|sharp|tense/u.test(mood)
    ? ["Squares their shoulders", "Holds their ground", "Tenses, then steadies"]
    : /nervous|guarded|uneasy|afraid|hesitant/u.test(mood)
      ? ["Hesitates for a beat", "Glances aside, then back", "Steadies their breath"]
      : /probing|precise|thoughtful|measured|curious/u.test(mood)
        ? ["Studies the response", "Pauses to consider", "Tilts their head slightly"]
        : args.performance.intensity >= 2
          ? ["Leans into the moment", "Holds the room's attention", "Gestures with emphasis"]
          : ["Pauses for a beat", "Shifts their stance", "Meets the moment steadily"];
  return candidates[stableMysteryActionIndex(`${args.stableId}:${mood}:${args.performance.intensity}`, candidates.length)]!;
}

/** Resolves the canonical speech/action split. An explicit authored action
 * always wins; legacy narration is split next; deterministic fallback is last. */
export function resolveDebateMysteryLineDeliveryV2(args: {
  value: string;
  explicitStageActionText?: string | null;
  speakerNames?: string | readonly string[] | null;
  stableId: string;
  performance: DebateMysteryPerformanceDirectionV2;
  materializeFallback?: boolean;
}): { stageActionText: string | null; spokenText: string } {
  const legacy = splitDebateMysteryStageActionTextV2(args.value, args.speakerNames);
  const explicit = args.explicitStageActionText?.trim()
    ? mysteryStageActionDisplayText(
        args.explicitStageActionText,
        args.speakerNames,
        true,
      )
    : null;
  return {
    stageActionText:
      explicit ??
      legacy.stageActionText ??
      (args.materializeFallback
        ? fallbackDebateMysteryStageActionTextV2({
            stableId: args.stableId,
            performance: args.performance,
          })
        : null),
    spokenText: legacy.spokenText,
  };
}

export interface DebateMysteryPublicStatementV2 {
  statementId: string;
  versionId: string;
  witnessSeatId: string;
  version: number;
  lineId: string;
  visibleText: string;
  stageActionText?: string | null;
  pressed: boolean;
}

export interface DebateMysteryWitnessCheckpointV2 {
  chapterId: string;
  publicStateJson: string;
  createdAt: string;
}

export interface DebateMysteryCourtStateV2 {
  witnessOrder: string[];
  defendantSeatId: string | null;
  completedChapterIds: string[];
  activeChapterId: string | null;
  activeStatementId: string | null;
  statements: DebateMysteryPublicStatementV2[];
  credibilityRemaining: number;
  credibilityMaximum: number;
  checkpoint: DebateMysteryWitnessCheckpointV2 | null;
}

export interface DebateMysteryPlayReadinessV1 {
  version: typeof DEBATE_MYSTERY_PLAY_READINESS_VERSION;
  status: "repair_required" | "repairing" | "ready" | "failed";
  spoilerSafeMessage: string;
  contractHash: string | null;
  checkedAt: string | null;
}

export interface DebateWhodunnitFormatStateV2 {
  version: typeof DEBATE_MYSTERY_V2_SCHEMA_VERSION;
  format: "whodunnit";
  playPhase: DebateMysteryPlayPhaseV2;
  compilation: DebateMysteryCompilationStatusV2;
  caseTitle: string | null;
  fictionLabel: "Fictional, non-canonical case";
  /** Public charge only. Responsible parties and linked incidents stay sealed. */
  caseCharge?: MysteryPublicChargeV1 | null;
  config: DebateMysteryResolvedConfigV2;
  victim: { id: string; name: string } | null;
  suspects: DebateMysteryPublicSuspectSnapshotV1[];
  rooms: DebateMysteryRoomV2[];
  /** Immediate, spoiler-safe exterior establishing shot for the title card. */
  mansionExterior?: DebateMysterySealedAssetRefV1 | null;
  /** Public because the opening scene is visible; never derived from a clue. */
  crimeSceneRoomId?: string | null;
  /** Finite first-room sweep required before the mansion map unlocks. */
  openingSweepComplete?: boolean;
  roomIntroductions: Record<string, DebateMysteryRoomIntroductionPhaseV2>;
  currentRoomId: string | null;
  roomView: "mansion" | "room";
  metSuspectSeatIds: string[];
  discoveryIds: string[];
  record: DebateMysteryPublicRecordItemV2[];
  /** Physical access items recovered during Examine. Additive for archived
   * cases compiled before the V2 Case Kit bridge. */
  caseKit?: DebateMysteryCaseKitItemV2[];
  topics: DebateMysteryPublicTopicV2[];
  dialogueHistory: DebateMysteryPublicDialogueEntryV2[];
  /** Frozen visual/name targets for exact live, Archive, and play-again replay. */
  identityMirrorTargetSnapshots: Record<
    string,
    DebateMysteryIdentityMirrorTargetSnapshotV1
  >;
  activeDialogueNodeId: string | null;
  theoryAvailable: boolean;
  theory: DebateMysteryTheoryV1 | null;
  theoryFiledAt: string | null;
  court: DebateMysteryCourtStateV2 | null;
  verdict: DebateMysteryVerdictV2 | null;
  readiness: DebateMysteryPlayReadinessV1;
  audioReady: boolean;
  voicesEnabled: boolean;
  localAudioFailure: string | null;
  calloutHistory: Array<{
    id: string;
    callout: DebateMysteryCourtCalloutV2;
    actorColor: string | null;
    occurredAt: string;
  }>;
  pendingCallout: { id: string; callout: DebateMysteryCourtCalloutV2; actorColor: string | null } | null;
  pendingProsecutionChoice: {
    id: string;
    prompt: string;
    options: Array<{ id: string; text: string }>;
  } | null;
}

export interface DebateMysteryPlayAgainRequestV2 {
  version: 2;
  idempotencyKey: string;
  audioMode?: "reuse" | "silent";
}

export type DebateMysteryActionRequestV2 =
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "move"; roomId?: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "enter_mansion" }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "dismiss_case_opening" }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "advance_room_introduction"; roomId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "complete_room_introduction"; roomId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "examine"; roomId: string; hotspotId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "talk"; suspectSeatId: string; topicNodeId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "present_to_suspect"; suspectSeatId: string; record: DebateMysteryRecordReferenceV2 }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "file_theory"; theory: DebateMysteryTheoryV1 }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "focus_statement"; statementId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "press_statement"; statementId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "present_record"; statementId: string; record: DebateMysteryRecordReferenceV2 }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "object_statement"; statementId: string; record: DebateMysteryRecordReferenceV2 }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "choose_prosecution_response"; choiceId: string; optionId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "review_strategy"; contextNodeId?: string | null }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "advance_spectator_trial" }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "retry_witness_checkpoint" };

export interface DebateMysteryGraphValidationResultV2 {
  valid: boolean;
  errors: string[];
  reachableNodeIds: string[];
  reachableSpokenLineIds: string[];
}

interface SolverState {
  nodeId: string;
  discoveries: Set<string>;
  topics: Set<string>;
  records: Set<string>;
  choices: Map<string, string>;
}

function recordKey(reference: DebateMysteryRecordReferenceV2): string {
  return `${reference.kind}:${reference.id}`;
}

function mysterySubjectPhrase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(?:a|an|the)\s+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function mysterySubjectWords(value: string): string[] {
  return mysterySubjectPhrase(value)
    .split(" ")
    .filter((word) => word.length > 1 && !["about", "regarding", "what", "which", "with"].includes(word));
}

export function normalizeDebateMysteryTalkSubjectV2(args: {
  value: unknown;
  label: string;
  question?: string;
  rooms?: readonly { id: string; name: string }[];
  people?: readonly { id: string; name: string }[];
}): DebateMysteryTalkSubjectV2 {
  const source = args.value && typeof args.value === "object"
    ? args.value as Record<string, unknown>
    : {};
  const category = typeof source.category === "string" ? source.category : "";
  const subjectId = typeof source.subjectId === "string" ? source.subjectId.trim() : "";
  const roomId = typeof source.roomId === "string" ? source.roomId.trim() : subjectId;
  const personId = typeof source.personId === "string" ? source.personId.trim() : subjectId;
  if (category === "room" && args.rooms?.some((room) => room.id === roomId)) {
    return { category: "room", roomId };
  }
  if (category === "person" && args.people?.some((person) => person.id === personId)) {
    return { category: "person", personId };
  }
  if (category === "motive" || category === "alibi" || category === "general") {
    return { category };
  }

  const subjectText = mysterySubjectPhrase(`${args.label} ${args.question ?? ""}`);
  const room = args.rooms?.find((candidate) => {
    const name = mysterySubjectPhrase(candidate.name);
    return candidate.id === subjectId || (name.length > 2 && subjectText.includes(name));
  });
  if (room) return { category: "room", roomId: room.id };
  if (/\b(?:alibi|movements?|timeline|whereabouts?|where (?:were|was)|when (?:did|were|was))\b/iu.test(subjectText)) {
    return { category: "alibi" };
  }
  if (/\b(?:motive|reason|resent|grudge|gain|benefit|why)\b/iu.test(subjectText)) {
    return { category: "motive" };
  }
  const person = args.people?.find((candidate) => {
    const name = mysterySubjectPhrase(candidate.name);
    return candidate.id === subjectId || (name.length > 2 && subjectText.includes(name));
  });
  return person ? { category: "person", personId: person.id } : { category: "general" };
}

/** Conservative compatibility filter. Explicit room/person/motive/alibi
 * semantics win; a general or legacy topic is retired only when its ID or
 * wording unmistakably mirrors a Case File record. */
export function debateMysteryTalkTopicMirrorsRecordV2(args: {
  topicId: string;
  label: string;
  question?: string;
  subject?: DebateMysteryTalkSubjectV2 | null;
  records: readonly { reference: DebateMysteryRecordReferenceV2; title: string }[];
}): DebateMysteryRecordReferenceV2 | null {
  if (args.subject?.category === "room") return null;
  const topicId = mysterySubjectPhrase(args.topicId.replace(/^talk(?:-response)?-/u, ""));
  const label = mysterySubjectPhrase(args.label);
  const question = mysterySubjectPhrase(args.question ?? "");
  const general = !args.subject || args.subject.category === "general";
  for (const item of args.records) {
    const referenceId = mysterySubjectPhrase(item.reference.id);
    const title = mysterySubjectPhrase(item.title);
    if (!title) continue;
    if (topicId && (topicId === referenceId || topicId === title)) return item.reference;
    if (label === title) return item.reference;
    const labelWords = mysterySubjectWords(label);
    const titleWords = new Set(mysterySubjectWords(title));
    if (labelWords.length >= 2 && labelWords.every((word) => titleWords.has(word))) {
      return item.reference;
    }
    if (!general) continue;
    if (question && question.includes(title)) return item.reference;
  }
  return null;
}

/**
 * Spectator automation may admit only physical evidence that the frozen trial
 * graph actually requires. Testimony becomes public later, when it is heard in
 * court; unused clues and every sealed-case field remain outside this list.
 */
export function debateMysterySpectatorEvidenceReferencesV2(
  graph: Pick<
    DebateMysteryDialogueGraphV2,
    "initialAdmittedRecordIds" | "witnessChapters"
  >,
): DebateMysteryRecordReferenceV2[] {
  const references = [
    ...graph.initialAdmittedRecordIds.flatMap((value) => {
      const [kind, ...idParts] = value.split(":");
      return kind === "evidence" && idParts.length > 0
        ? [{ kind: "evidence" as const, id: idParts.join(":") }]
        : [];
    }),
    ...graph.witnessChapters.flatMap((chapter) =>
      chapter.statementVersions.flatMap((statement) =>
        statement.correctPresentations.filter(
          (reference) => reference.kind === "evidence",
        ),
      ),
    ),
  ];
  return [
    ...new Map(references.map((reference) => [recordKey(reference), reference])).values(),
  ];
}

function duplicateIds(values: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates];
}

function requirementsSatisfied(
  requirements: DebateMysteryDialogueRequirementV2,
  state: Omit<SolverState, "nodeId">,
): boolean {
  return requirements.discoveryIds.every((id) => state.discoveries.has(id)) &&
    requirements.unlockedTopicIds.every((id) => state.topics.has(id)) &&
    requirements.admittedRecordIds.every((id) => state.records.has(id)) &&
    requirements.choices.every((choice) => state.choices.get(choice.choiceId) === choice.optionId);
}

function applyMutations(node: DebateMysteryDialogueNodeV2, state: SolverState): SolverState {
  const next: SolverState = {
    nodeId: state.nodeId,
    discoveries: new Set(state.discoveries),
    topics: new Set(state.topics),
    records: new Set(state.records),
    choices: new Map(state.choices),
  };
  for (const id of node.mutations.discoverIds) next.discoveries.add(id);
  for (const id of node.mutations.unlockTopicIds) next.topics.add(id);
  for (const id of node.mutations.admitRecordIds) next.records.add(id);
  for (const choice of node.mutations.choices) next.choices.set(choice.choiceId, choice.optionId);
  return next;
}

function solverSignature(state: SolverState): string {
  return [
    state.nodeId,
    [...state.discoveries].sort().join(","),
    [...state.topics].sort().join(","),
    [...state.records].sort().join(","),
    [...state.choices].sort(([a], [b]) => a.localeCompare(b)).map(([id, option]) => `${id}:${option}`).join(","),
  ].join("|");
}

export function validateDebateMysteryDialogueGraphV2(args: {
  graph: DebateMysteryDialogueGraphV2;
  suspectSeatIds: readonly string[];
  recordReferences: readonly DebateMysteryRecordReferenceV2[];
  playerRole?: "participant" | "spectator";
  roomIds?: readonly string[];
  personIds?: readonly string[];
  hotspotIdsByRoom?: Readonly<Record<string, readonly string[]>>;
  prosecutorBotId?: string | null;
  rivalDefenseBotId?: string | null;
  eyewitnessSeatId?: string | null;
  accusedAlibiSupportDiscoveryIds?: readonly string[];
}): DebateMysteryGraphValidationResultV2 {
  const { graph } = args;
  const errors: string[] = [];
  for (const id of duplicateIds(graph.nodes)) errors.push(`Duplicate dialogue node ID: ${id}.`);
  for (const id of duplicateIds(graph.lines)) errors.push(`Duplicate spoken line ID: ${id}.`);
  for (const id of duplicateIds(graph.witnessChapters)) errors.push(`Duplicate witness chapter ID: ${id}.`);
  const presentationGates = Array.isArray(graph.presentationGates) ? graph.presentationGates : [];
  for (const id of duplicateIds(presentationGates)) errors.push(`Duplicate presentation gate ID: ${id}.`);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const lineById = new Map(graph.lines.map((line) => [line.id, line]));
  const recordIds = new Set(args.recordReferences.map(recordKey));
  const roomIds = new Set(args.roomIds ?? []);
  const personIds = new Set(args.personIds ?? []);
  const retiredTalkNodeIds = new Set(graph.retiredTalkNodeIds ?? []);
  const roomIntroductions = graph.roomIntroductionNodeIdsByRoom ?? {};

  for (const node of graph.nodes) {
    if (node.lineId && !lineById.has(node.lineId)) errors.push(`Node ${node.id} references missing line ${node.lineId}.`);
    for (const nextId of node.nextNodeIds) {
      if (!nodeById.has(nextId)) errors.push(`Node ${node.id} transitions to missing node ${nextId}.`);
    }
    for (const reference of node.recordReferences) {
      if (!recordIds.has(recordKey(reference))) errors.push(`Node ${node.id} references missing record ${recordKey(reference)}.`);
    }
  }
  for (const line of graph.lines) {
    if (!nodeById.has(line.nodeId)) errors.push(`Line ${line.id} references missing node ${line.nodeId}.`);
    if (!line.visibleText.trim()) errors.push(`Line ${line.id} has no visible text.`);
    if (line.mode !== "text_only" && !line.spokenText.trim()) errors.push(`Spoken line ${line.id} has no performance text.`);
    if (line.stageCue) {
      const cue = line.stageCue;
      if (line.mode !== "spoken" || !line.speakerBotId) {
        errors.push(`Stage cue ${cue.id || line.id} is not attached to a spoken bot line.`);
      }
      if (
        cue.version !== 1 ||
        !cue.id.trim() ||
        !cue.objective.trim() ||
        !cue.emotionalState.trim() ||
        !cue.exitCondition.trim() ||
        !cue.deterministicFallbackText.trim() ||
        !Number.isInteger(cue.maxCharacters) ||
        cue.maxCharacters < 80 ||
        cue.maxCharacters > 1_200
      ) {
        errors.push(`Stage cue ${cue.id || line.id} has an incomplete performance contract.`);
      }
      for (const id of duplicateIds(cue.allowedFacts)) {
        errors.push(`Stage cue ${cue.id} repeats allowed fact ${id}.`);
      }
      for (const id of duplicateIds(cue.requiredBeats)) {
        errors.push(`Stage cue ${cue.id} repeats required beat ${id}.`);
      }
      const knownFactIds = new Set(cue.knownFactIds);
      for (const fact of cue.allowedFacts) {
        if (
          !fact.id.trim() ||
          !fact.statement.trim() ||
          !fact.mentionFragments.some((fragment) => fragment.trim()) ||
          !knownFactIds.has(fact.id)
        ) {
          errors.push(`Stage cue ${cue.id} has an invalid allowed fact ${fact.id || "unknown"}.`);
        }
      }
      for (const beat of cue.requiredBeats) {
        if (
          !beat.id.trim() ||
          !beat.instruction.trim() ||
          !beat.acceptedTextFragments.some((fragment) => fragment.trim())
        ) {
          errors.push(`Stage cue ${cue.id} has an invalid required beat ${beat.id || "unknown"}.`);
        }
      }
      if (
        cue.contradictionTrigger &&
        !recordIds.has(recordKey(cue.contradictionTrigger.record))
      ) {
        errors.push(`Stage cue ${cue.id} references a missing contradiction record.`);
      }
      const fallback = validateDebateMysteryStageCuePerformanceV1({
        cue,
        text: cue.deterministicFallbackText,
      });
      if (!fallback.valid) {
        errors.push(`Stage cue ${cue.id} has an invalid deterministic fallback: ${fallback.errors.join(" ")}`);
      }
    }
    if (
      line.mode === "anonymous_babble" &&
      (line.speakerKind !== "narrator" || !line.speakerBotId)
    ) {
      errors.push(`Anonymous Babble line ${line.id} has no private bot carrier.`);
    }
    if (
      line.mode === "persona_babble" &&
      (line.speakerKind !== "player" || !line.speakerBotId)
    ) {
      errors.push(`Player thought ${line.id} has no embodied bot speaker.`);
    }
    if (
      args.prosecutorBotId &&
      line.mode !== "text_only" &&
      line.mode !== "persona_babble" &&
      line.mode !== "anonymous_babble" &&
      line.speakerBotId &&
      !line.stageActionText?.trim()
    ) {
      errors.push(`Spoken bot line ${line.id} has no materialized visual performance beat.`);
    }
    if (
      line.speakerKind === "player" &&
      args.prosecutorBotId &&
      line.speakerBotId !== args.prosecutorBotId
    ) {
      errors.push(`Player-selected prosecution line ${line.id} is not owned by the selected Prosecutor bot.`);
    }
  }
  for (const [roomId, introduction] of Object.entries(roomIntroductions)) {
    if (args.roomIds && !roomIds.has(roomId)) {
      errors.push(`Room introduction references missing room ${roomId}.`);
      continue;
    }
    const casekeeper = nodeById.get(introduction.casekeeperNodeId);
    const persona = nodeById.get(introduction.personaNodeId);
    const casekeeperLine = casekeeper?.lineId ? lineById.get(casekeeper.lineId) : null;
    const personaLine = persona?.lineId ? lineById.get(persona.lineId) : null;
    const openingExchange = introduction.openingExchangeNodeIds;
    const prosecutionOpening = openingExchange
      ? nodeById.get(openingExchange.prosecutionOpeningNodeId)
      : null;
    const occupantResponse = openingExchange
      ? nodeById.get(openingExchange.occupantResponseNodeId)
      : null;
    const prosecutionHandoff = openingExchange
      ? nodeById.get(openingExchange.prosecutionHandoffNodeId)
      : null;
    const prosecutionOpeningLine = prosecutionOpening?.lineId
      ? lineById.get(prosecutionOpening.lineId)
      : null;
    const occupantResponseLine = occupantResponse?.lineId
      ? lineById.get(occupantResponse.lineId)
      : null;
    const prosecutionHandoffLine = prosecutionHandoff?.lineId
      ? lineById.get(prosecutionHandoff.lineId)
      : null;
    const expectedCasekeeperNextNodeId = openingExchange?.prosecutionOpeningNodeId ??
      introduction.personaNodeId;
    const playerThoughtIsValid = Boolean(
      casekeeperLine?.mode === "persona_babble" &&
      casekeeperLine.speakerKind === "player" &&
      casekeeperLine.speakerBotId &&
      (!args.prosecutorBotId || casekeeperLine.speakerBotId === args.prosecutorBotId),
    );
    const legacyTableauIsValid = Boolean(
      casekeeperLine?.mode === "text_only" &&
      casekeeperLine.speakerKind === "narrator" &&
      casekeeperLine.speakerBotId === null,
    );
    if (
      casekeeper?.kind !== "room_introduction" ||
      (!playerThoughtIsValid && !legacyTableauIsValid) ||
      !casekeeperLine ||
      !casekeeperLine.visibleText.trim() ||
      casekeeperLine.visibleText !== casekeeperLine.spokenText ||
      Boolean(casekeeperLine.stageActionText?.trim()) ||
      casekeeper.nextNodeIds.length !== 1 ||
      casekeeper.nextNodeIds[0] !== expectedCasekeeperNextNodeId
    ) {
      errors.push(`Room introduction ${roomId} has no exact embodied-player thought.`);
    }
    if (
      persona?.kind !== "room_introduction" ||
      persona?.speakerSeatId !== introduction.suspectSeatId ||
      personaLine?.mode !== "spoken" ||
      personaLine.speakerBotId === null ||
      !personaLine.stageActionText?.trim()
    ) {
      errors.push(`Room introduction ${roomId} has no finite voiced persona reveal.`);
    }
    if (openingExchange && (
      openingExchange.occupantResponseNodeId !== introduction.personaNodeId ||
      prosecutionOpening?.kind !== "room_introduction" ||
      prosecutionOpening?.locationId !== roomId ||
      prosecutionOpening?.speakerSeatId !== null ||
      prosecutionOpening?.intendedRecipientSeatId !== introduction.suspectSeatId ||
      prosecutionOpeningLine?.mode !== "spoken" ||
      prosecutionOpeningLine.speakerKind !== "player" ||
      prosecutionOpeningLine.speakerBotId !== args.prosecutorBotId ||
      !prosecutionOpeningLine.stageActionText?.trim() ||
      prosecutionOpening.nextNodeIds.length !== 1 ||
      prosecutionOpening.nextNodeIds[0] !== openingExchange.occupantResponseNodeId ||
      occupantResponse?.id !== introduction.personaNodeId ||
      occupantResponse?.nextNodeIds.length !== 1 ||
      occupantResponse.nextNodeIds[0] !== openingExchange.prosecutionHandoffNodeId ||
      occupantResponseLine?.speakerBotId !== personaLine?.speakerBotId ||
      prosecutionHandoff?.kind !== "room_introduction" ||
      prosecutionHandoff?.locationId !== roomId ||
      prosecutionHandoff?.speakerSeatId !== null ||
      prosecutionHandoff?.intendedRecipientSeatId !== introduction.suspectSeatId ||
      prosecutionHandoffLine?.mode !== "spoken" ||
      prosecutionHandoffLine.speakerKind !== "player" ||
      prosecutionHandoffLine.speakerBotId !== args.prosecutorBotId ||
      !prosecutionHandoffLine.stageActionText?.trim() ||
      prosecutionHandoff.nextNodeIds.length !== 0
    )) {
      errors.push(`Room introduction ${roomId} has no exact frozen Prosecution opening exchange.`);
    }
    if (!graph.interactionRootNodeIds.includes(introduction.casekeeperNodeId)) {
      errors.push(`Room introduction ${roomId} is not reachable from the finite graph.`);
    }
  }

  const activeTalkTopicIds = new Set<string>();
  for (const [suspectSeatId, topicNodeIds] of Object.entries(graph.talkTopicNodeIdsBySuspect)) {
    if (!args.suspectSeatIds.includes(suspectSeatId)) {
      errors.push(`Talk menu ${suspectSeatId} belongs to a missing suspect.`);
    }
    for (const topicNodeId of topicNodeIds) {
      const topic = nodeById.get(topicNodeId);
      activeTalkTopicIds.add(topicNodeId);
      if (
        topic?.kind !== "talk_topic" ||
        topic.intendedRecipientSeatId !== suspectSeatId ||
        !topic.label?.trim()
      ) {
        errors.push(`Talk topic ${topicNodeId} is not an authored player-selectable subject for ${suspectSeatId}.`);
        continue;
      }
      const subject = topic.talkSubject;
      if (!subject) {
        errors.push(`Talk topic ${topicNodeId} has no explicit subject semantics.`);
      } else if (subject.category === "room") {
        if (!subject.roomId || (args.roomIds && !roomIds.has(subject.roomId))) {
          errors.push(`Talk topic ${topicNodeId} references missing room ${subject.roomId || "(blank)"}.`);
        }
      } else if (subject.category === "person") {
        if (!subject.personId || (args.personIds && !personIds.has(subject.personId))) {
          errors.push(`Talk topic ${topicNodeId} references missing person ${subject.personId || "(blank)"}.`);
        }
      } else if (
        subject.category !== "general" &&
        subject.category !== "motive" &&
        subject.category !== "alibi"
      ) {
        errors.push(`Talk topic ${topicNodeId} has an unsupported subject category.`);
      }
      if (topic.recordReferences.length || topic.requirements.admittedRecordIds.length) {
        errors.push(`Talk topic ${topicNodeId} mirrors a Case File interaction; evidence and testimony belong only in Present.`);
      }
    }
  }

  const presentRoute = (
    suspectSeatId: string,
    reference: DebateMysteryRecordReferenceV2,
    exactNodeId?: string,
  ): DebateMysteryDialogueNodeV2 | null => {
    const key = recordKey(reference);
    return (graph.presentNodeIdsBySuspect[suspectSeatId] ?? [])
      .map((nodeId) => nodeById.get(nodeId))
      .find((node) =>
        node?.kind === "present_reaction" &&
        (!exactNodeId || node.id === exactNodeId) &&
        node.intendedRecipientSeatId === suspectSeatId &&
        node.recordReferences.length === 1 &&
        recordKey(node.recordReferences[0]!) === key) ?? null;
  };
  for (const gate of presentationGates) {
    const requiredRecordKey = recordKey(gate.requiredRecord);
    if (!gate.id?.trim()) errors.push("A presentation gate has no ID.");
    if (!recordIds.has(requiredRecordKey)) {
      errors.push(`Presentation gate ${gate.id} requires missing record ${requiredRecordKey}.`);
    }
    if (!args.suspectSeatIds.includes(gate.requiredSuspectSeatId)) {
      errors.push(`Presentation gate ${gate.id} requires missing suspect ${gate.requiredSuspectSeatId}.`);
    }
    const correctRoute = presentRoute(
      gate.requiredSuspectSeatId,
      gate.requiredRecord,
      gate.correctPresentNodeId,
    );
    if (
      !correctRoute ||
      !graph.interactionRootNodeIds.includes(gate.correctPresentNodeId) ||
      correctRoute.nextNodeIds.length !== 1 ||
      nodeById.get(correctRoute.nextNodeIds[0]!)?.kind !== "present_reaction"
    ) {
      errors.push(`Presentation gate ${gate.id} has no exact finite Present route for ${gate.requiredSuspectSeatId} + ${requiredRecordKey}.`);
    }
    if (!Array.isArray(gate.unlocks) || gate.unlocks.length === 0) {
      errors.push(`Presentation gate ${gate.id} has no bounded public unlock target.`);
      continue;
    }
    for (const target of gate.unlocks as DebateMysteryPresentationUnlockTargetV2[]) {
      if (target.kind === "topic") {
        const targetNode = nodeById.get(target.topicNodeId);
        if (targetNode?.kind !== "talk_topic" || !activeTalkTopicIds.has(target.topicNodeId)) {
          errors.push(`Presentation gate ${gate.id} targets missing Talk topic ${target.topicNodeId}.`);
        }
        if (graph.nodes.some((node) =>
          !retiredTalkNodeIds.has(node.id) &&
          node.mutations.unlockTopicIds.includes(target.topicNodeId))) {
          errors.push(`Presentation gate ${gate.id} has a non-Present bypass to Talk topic ${target.topicNodeId}.`);
        }
      } else if (target.kind === "room") {
        if (!target.roomId || (args.roomIds && !roomIds.has(target.roomId))) {
          errors.push(`Presentation gate ${gate.id} targets missing room ${target.roomId || "(blank)"}.`);
        }
      } else if (target.kind === "hotspot") {
        const hotspotIds = args.hotspotIdsByRoom?.[target.roomId];
        const targetNode = nodeById.get(target.nodeId);
        if (
          !target.roomId ||
          !target.hotspotId ||
          (args.roomIds && !roomIds.has(target.roomId)) ||
          (hotspotIds && !hotspotIds.includes(target.hotspotId)) ||
          targetNode?.kind !== "examination_result" ||
          targetNode.locationId !== target.roomId
        ) {
          errors.push(`Presentation gate ${gate.id} targets invalid hotspot ${target.roomId}:${target.hotspotId}.`);
        }
      } else if (target.kind === "location_discovery") {
        if (!target.discoveryId?.trim()) {
          errors.push(`Presentation gate ${gate.id} has a blank location discovery target.`);
        }
        if (graph.nodes.some((node) =>
          !retiredTalkNodeIds.has(node.id) &&
          node.mutations.discoverIds.includes(target.discoveryId))) {
          errors.push(`Presentation gate ${gate.id} has a non-Present bypass to discovery ${target.discoveryId}.`);
        }
      } else if (target.kind === "record_discovery" || target.kind === "record_description") {
        const targetRecordKey = recordKey(target.record);
        if (!recordIds.has(targetRecordKey)) {
          errors.push(`Presentation gate ${gate.id} targets missing record ${targetRecordKey}.`);
        }
        if (targetRecordKey === requiredRecordKey) {
          errors.push(`Presentation gate ${gate.id} self-locks on required record ${requiredRecordKey}.`);
        }
        if (target.kind === "record_description" && !target.description?.trim()) {
          errors.push(`Presentation gate ${gate.id} has an empty record-description revision.`);
        }
        if (
          target.kind === "record_discovery" &&
          graph.nodes.some((node) =>
            !retiredTalkNodeIds.has(node.id) &&
            node.mutations.admitRecordIds.includes(targetRecordKey))
        ) {
          errors.push(`Presentation gate ${gate.id} has a non-Present bypass to record ${targetRecordKey}.`);
        }
      } else {
        errors.push(`Presentation gate ${gate.id} has an unsupported unlock target type.`);
      }
    }
  }
  if (presentationGates.length) {
    for (const suspectSeatId of args.suspectSeatIds) {
      for (const reference of args.recordReferences) {
        if (!presentRoute(suspectSeatId, reference)) {
          errors.push(`Present fallback ${suspectSeatId} + ${recordKey(reference)} is not finite and precompiled.`);
        }
      }
    }
  }

  const chaptersByWitness = new Map<string, DebateMysteryWitnessChapterV2[]>();
  for (const chapter of graph.witnessChapters) {
    const witnessChapters = chaptersByWitness.get(chapter.witnessSeatId) ?? [];
    witnessChapters.push(chapter);
    chaptersByWitness.set(chapter.witnessSeatId, witnessChapters);
    if (!nodeById.has(chapter.checkpointNodeId)) errors.push(`Chapter ${chapter.id} has a missing checkpoint node.`);
    if (!nodeById.has(chapter.completionNodeId)) errors.push(`Chapter ${chapter.id} has a missing completion node.`);
    const statementIds = new Set(chapter.statementVersions.map((statement) => statement.statementId));
    for (const statementId of chapter.initialStatementIds) {
      if (!statementIds.has(statementId)) errors.push(`Chapter ${chapter.id} starts with missing statement ${statementId}.`);
    }
    for (const statement of chapter.statementVersions) {
      if (statement.witnessSeatId !== chapter.witnessSeatId) errors.push(`Statement ${statement.id} belongs to the wrong witness.`);
      if (!lineById.has(statement.lineId)) errors.push(`Statement ${statement.id} references missing line ${statement.lineId}.`);
      if (!nodeById.has(statement.pressNodeId)) errors.push(`Statement ${statement.id} has no Press result.`);
      if (!nodeById.has(statement.rebuttalNodeId)) errors.push(`Statement ${statement.id} has no incorrect-presentation rebuttal.`);
      if (statement.objectionNodeId && !nodeById.has(statement.objectionNodeId)) errors.push(`Statement ${statement.id} has no Defense objection.`);
      if (statement.revisionNodeId && !nodeById.has(statement.revisionNodeId)) errors.push(`Statement ${statement.id} has a missing revision node.`);
      if (statement.nextStatementId && !statementIds.has(statement.nextStatementId)) errors.push(`Statement ${statement.id} points to missing statement ${statement.nextStatementId}.`);
      for (const proof of statement.correctPresentations) {
        if (!recordIds.has(recordKey(proof))) errors.push(`Statement ${statement.id} contradicts with missing record ${recordKey(proof)}.`);
      }
    }
  }
  for (const seatId of args.suspectSeatIds) {
    if (!(chaptersByWitness.get(seatId)?.length)) errors.push(`Suspect ${seatId} has no cross-examination chapter.`);
  }
  for (const witnessSeatId of chaptersByWitness.keys()) {
    if (!args.suspectSeatIds.includes(witnessSeatId)) {
      errors.push(`Witness ${witnessSeatId} is not a frozen suspect.`);
    }
  }
  const ordinals = graph.witnessChapters.map((chapter) => chapter.ordinal);
  if (new Set(ordinals).size !== ordinals.length) errors.push("Witness chapter order contains duplicate ordinals.");
  if (graph.witnessChapters.length !== args.suspectSeatIds.length) {
    errors.push("Every suspect, including any accused suspect, must testify exactly once.");
  }
  if (args.prosecutorBotId) {
    const strategyNode = graph.prosecutorStrategyNodeId
      ? nodeById.get(graph.prosecutorStrategyNodeId)
      : null;
    const strategyLine = strategyNode?.lineId ? lineById.get(strategyNode.lineId) : null;
    if (
      !strategyNode ||
      strategyNode.kind !== "prosecutor_strategy" ||
      strategyLine?.speakerBotId !== args.prosecutorBotId
    ) {
      errors.push("The selected Prosecutor has no authored internal strategy line.");
    }
  }
  if (args.rivalDefenseBotId) {
    for (const node of graph.nodes.filter((entry) => entry.kind === "defense_reaction")) {
      const line = node.lineId ? lineById.get(node.lineId) : null;
      if (line?.speakerBotId !== args.rivalDefenseBotId) {
        errors.push(`Defense reaction ${node.id} is not owned by Defense Counsel.`);
      }
    }
  }
  if (graph.defendantReactionNodeIdsBySeat) {
    for (const seatId of args.suspectSeatIds) {
      const reactions = graph.defendantReactionNodeIdsBySeat[seatId];
      for (const nodeId of reactions
        ? [reactions.testimony, reactions.objection, reactions.evidence]
        : []) {
        const node = nodeById.get(nodeId);
        if (node?.kind !== "defendant_reaction" || node.speakerSeatId !== seatId) {
          errors.push(`Potential defendant ${seatId} has an invalid authored reaction ${nodeId}.`);
        }
      }
      if (!reactions) errors.push(`Potential defendant ${seatId} has no finite authored court reactions.`);
    }
  }
  const repeatTalkNodes = new Set<string>();
  for (const [topicNodeId, repeatNodeIds] of Object.entries(graph.repeatResponseNodeIdsByTopic ?? {})) {
    const topic = nodeById.get(topicNodeId);
    const suspectSeatId = topic?.intendedRecipientSeatId ?? topic?.speakerSeatId ?? null;
    if (topic?.kind !== "talk_topic" || !suspectSeatId) {
      errors.push(`Repeat Talk mapping ${topicNodeId} has no authored topic.`);
      continue;
    }
    if (!repeatNodeIds.length) errors.push(`Talk topic ${topicNodeId} has no repeat response.`);
    for (const repeatNodeId of repeatNodeIds) {
      const repeatNode = nodeById.get(repeatNodeId);
      const repeatLine = repeatNode?.lineId ? lineById.get(repeatNode.lineId) : null;
      if (
        repeatNode?.kind !== "talk_topic" ||
        repeatNode.speakerSeatId !== suspectSeatId ||
        repeatLine?.speakerKind !== "bot"
      ) {
        errors.push(`Repeat Talk response ${repeatNodeId} is not a suspect-owned authored line.`);
        continue;
      }
      repeatTalkNodes.add(repeatNodeId);
    }
  }

  const initial: Omit<SolverState, "nodeId"> = {
    discoveries: new Set(graph.initialDiscoveryIds),
    topics: new Set<string>(),
    records: new Set(graph.initialAdmittedRecordIds),
    choices: new Map<string, string>(),
  };
  const queue: SolverState[] = [];
  const resolvedPresentationGateIds = new Set<string>();
  const nodeBlockedByPresentationGate = (node: DebateMysteryDialogueNodeV2): boolean =>
    presentationGates.some((gate) =>
      !resolvedPresentationGateIds.has(gate.id) &&
      gate.unlocks.some((target) =>
        (target.kind === "topic" && target.topicNodeId === node.id) ||
        (target.kind === "hotspot" && target.nodeId === node.id) ||
        (target.kind === "room" && target.roomId === node.locationId)));
  const enqueueEligibleRoot = (
    rootId: string,
    state: Omit<SolverState, "nodeId">,
  ): boolean => {
    const root = nodeById.get(rootId);
    if (!root) return false;
    if (nodeBlockedByPresentationGate(root)) return false;
    if (requirementsSatisfied(root.requirements, state)) {
      queue.push({ nodeId: rootId, ...state });
      return true;
    }
    if (root.kind !== "choice_reaction" || root.requirements.choices.length !== 1) return false;
    const requiredChoice = root.requirements.choices[0]!;
    const choice = graph.prosecutionChoices.find((entry) =>
      entry.id === requiredChoice.choiceId && entry.options.some((option) => option.id === requiredChoice.optionId));
    const promptNodeId = choice ? lineById.get(choice.promptLineId)?.nodeId : null;
    if (!choice || !promptNodeId || !reachableNodes.has(promptNodeId)) return false;
    const withoutChoice: DebateMysteryDialogueRequirementV2 = {
      ...root.requirements,
      choices: [],
    };
    if (!requirementsSatisfied(withoutChoice, state)) return false;
    const choices = new Map(state.choices);
    choices.set(requiredChoice.choiceId, requiredChoice.optionId);
    queue.push({ nodeId: rootId, ...state, choices });
    return true;
  };
  const reachableNodes = new Set<string>();
  const reachableLines = new Set<string>();
  for (const rootId of graph.interactionRootNodeIds) {
    const root = nodeById.get(rootId);
    if (!root) {
      errors.push(`Missing interaction root ${rootId}.`);
      continue;
    }
    enqueueEligibleRoot(rootId, initial);
  }
  const visited = new Set<string>();
  const accumulated = {
    discoveries: new Set(initial.discoveries),
    topics: new Set(initial.topics),
    records: new Set(initial.records),
    choices: new Map(initial.choices),
  };
  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    while (queue.length) {
      const state = queue.shift()!;
      const signature = solverSignature(state);
      if (visited.has(signature)) continue;
      visited.add(signature);
      const node = nodeById.get(state.nodeId);
      if (
        !node ||
        nodeBlockedByPresentationGate(node) ||
        !requirementsSatisfied(node.requirements, state)
      ) continue;
      reachableNodes.add(node.id);
      if (node.lineId && lineById.get(node.lineId)?.mode !== "text_only") reachableLines.add(node.lineId);
      const nextState = applyMutations(node, state);
      for (const id of nextState.discoveries) accumulated.discoveries.add(id);
      for (const id of nextState.topics) accumulated.topics.add(id);
      for (const id of nextState.records) accumulated.records.add(id);
      for (const [id, option] of nextState.choices) accumulated.choices.set(id, option);
      for (const nextId of node.nextNodeIds) queue.push({ ...nextState, nodeId: nextId });
      madeProgress = true;
    }
    for (const gate of presentationGates) {
      if (resolvedPresentationGateIds.has(gate.id)) continue;
      if (
        !accumulated.records.has(recordKey(gate.requiredRecord)) ||
        !reachableNodes.has(gate.correctPresentNodeId)
      ) continue;
      resolvedPresentationGateIds.add(gate.id);
      for (const target of gate.unlocks) {
        if (target.kind === "topic") accumulated.topics.add(target.topicNodeId);
        else if (target.kind === "location_discovery") accumulated.discoveries.add(target.discoveryId);
        else if (target.kind === "record_discovery") accumulated.records.add(recordKey(target.record));
      }
      madeProgress = true;
    }
    for (const rootId of graph.interactionRootNodeIds) {
      if (reachableNodes.has(rootId)) continue;
      if (enqueueEligibleRoot(rootId, accumulated)) madeProgress = true;
    }
  }
  // Repeat responses are invoked only by a completed-topic action, rather
  // than by a graph edge. Treat validated mappings as audio-reachable without
  // changing the frozen graph's normal interaction roots or transitions.
  for (const nodeId of repeatTalkNodes) {
    const node = nodeById.get(nodeId)!;
    reachableNodes.add(nodeId);
    if (node.lineId && lineById.get(node.lineId)?.mode !== "text_only") reachableLines.add(node.lineId);
  }
  // Retired evidence-mirroring Talk exchanges stay in the finite local audio
  // contract so existing active history remains playable, but their mutations
  // never participate in progression after migration.
  for (const nodeId of retiredTalkNodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) {
      errors.push(`Retired Talk node ${nodeId} is missing.`);
      continue;
    }
    if (node.kind !== "talk_topic") errors.push(`Retired Talk node ${nodeId} has the wrong node type.`);
    reachableNodes.add(nodeId);
    if (node.lineId && lineById.get(node.lineId)?.mode !== "text_only") reachableLines.add(node.lineId);
  }
  for (const gate of presentationGates) {
    if (resolvedPresentationGateIds.has(gate.id)) continue;
    const requiredRecordKey = recordKey(gate.requiredRecord);
    if (!accumulated.records.has(requiredRecordKey)) {
      errors.push(`Presentation gate ${gate.id} requires ${requiredRecordKey}, but that record is unreachable before the gate.`);
    } else if (gate.requiredForProgression) {
      errors.push(`Presentation gate ${gate.id} has no reachable correct Present route.`);
    }
  }
  for (const node of graph.nodes) {
    // Modern cases map every public Case File record to a finite Present
    // exchange. The old per-suspect default remains serialized only as a
    // compatibility anchor and is deliberately not playable or pre-voiced.
    const dormantPresentDefault =
      node.kind === "present_reaction" && /-default$/u.test(node.id);
    if (!reachableNodes.has(node.id) && !dormantPresentDefault) {
      errors.push(`Dialogue node ${node.id} is unreachable.`);
    }
  }
  for (const choice of graph.prosecutionChoices) {
    for (const option of choice.options) {
      if (reachableNodes.has(option.responseNodeId)) reachableLines.add(option.lineId);
    }
  }
  for (const chapter of graph.witnessChapters) {
    if (!reachableNodes.has(chapter.completionNodeId)) errors.push(`Witness chapter ${chapter.id} cannot reach completion.`);
    const hasReachableProof = chapter.statementVersions.some((statement) =>
      statement.correctPresentations.length > 0 &&
      statement.correctPresentations.some((reference) => accumulated.records.has(recordKey(reference))));
    if (!hasReachableProof) errors.push(`Witness chapter ${chapter.id} has no admitted statement-level proof route.`);
  }
  if (args.eyewitnessSeatId) {
    const chapter = graph.witnessChapters.find((entry) => entry.witnessSeatId === args.eyewitnessSeatId);
    if (!chapter) errors.push("The eyewitness has no exact statement-level resolution chapter.");
    if (args.playerRole !== "spectator") {
      if ((args.accusedAlibiSupportDiscoveryIds?.length ?? 0) < 2) errors.push("An eyewitness case requires two outwardly independent alibi supports.");
      for (const id of args.accusedAlibiSupportDiscoveryIds ?? []) {
        if (!accumulated.discoveries.has(id)) errors.push(`Accused alibi support ${id} is not discoverable.`);
      }
    }
  }
  for (const choice of graph.prosecutionChoices) {
    if (!lineById.has(choice.promptLineId)) errors.push(`Prosecution choice ${choice.id} has no prompt line.`);
    const minimumOptions = args.playerRole === "spectator" ? 1 : 2;
    if (choice.options.length < minimumOptions) {
      errors.push(
        `Prosecution choice ${choice.id} needs at least ${minimumOptions === 1 ? "one" : "two"} authored option${minimumOptions === 1 ? "" : "s"}.`,
      );
    }
    for (const option of choice.options) {
      const optionId = option.id;
      const optionLine = lineById.get(option.lineId);
      if (!optionLine || optionLine.mode !== "player_selected") {
        errors.push(`Prosecution choice ${choice.id} option ${optionId} has no player-selected line.`);
      }
      if (!nodeById.has(option.responseNodeId)) {
        errors.push(`Prosecution choice ${choice.id} option ${optionId} has no response node.`);
      }
      const responseExists = graph.nodes.some((node) =>
        node.kind === "choice_reaction" &&
        node.requirements.choices.some((choiceRequirement) =>
          choiceRequirement.choiceId === choice.id && choiceRequirement.optionId === optionId));
      if (!responseExists) errors.push(`Prosecution choice ${choice.id} option ${optionId} has no authored response.`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    reachableNodeIds: [...reachableNodes],
    reachableSpokenLineIds: [...reachableLines],
  };
}

export function validateDebateMysteryAudioManifestV1(args: {
  graph: DebateMysteryDialogueGraphV2;
  manifest: DebateMysteryAudioManifestV1;
  reachableSpokenLineIds: readonly string[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const required = new Set(args.reachableSpokenLineIds);
  const entries = new Map(args.manifest.entries.map((entry) => [entry.lineId, entry]));
  const graphLineIds = new Set(args.graph.lines.map((line) => line.id));
  if (args.manifest.preparationMode !== "lazy-on-demand-v1") {
    for (const lineId of required) {
      const entry = entries.get(lineId);
      if (!entry) {
        errors.push(`Reachable spoken line ${lineId} is missing from the local audio pack.`);
        continue;
      }
    }
  }
  for (const entry of args.manifest.entries) {
    if (!graphLineIds.has(entry.lineId)) errors.push(`Audio entry ${entry.lineId} is not in the dialogue graph.`);
    if (!required.has(entry.lineId)) errors.push(`Unreachable spoken line ${entry.lineId} was needlessly prepared.`);
    if (!entry.sha256 || entry.byteSize <= 0 || entry.durationMs <= 0 || !entry.clipPath) {
      errors.push(`Audio entry ${entry.lineId} is incomplete.`);
    }
  }
  if (!args.manifest.complete) errors.push("The local audio manifest is not complete.");
  if (args.manifest.complete && !args.manifest.verifiedAt) errors.push("The completed local audio manifest has not been verified.");
  return { valid: errors.length === 0, errors };
}

export function debateMysteryCredibilityMaximumV2(difficulty: DebateMysteryDifficulty): number {
  return difficulty === "casual" ? 5 : difficulty === "mastermind" ? 3 : 4;
}

export function debateMysteryEyewitnessChanceV2(
  difficulty: DebateMysteryDifficulty,
  preset: DebateMysteryPresetId,
): number {
  const base = difficulty === "casual" ? 0.1 : difficulty === "mastermind" ? 0.4 : 0.25;
  const modifier = preset === "grand" ? 0.1 : preset === "compact" ? -0.05 : 0;
  return Math.min(0.5, Math.max(0, base + modifier));
}

export function debateMysteryPremiumAvailableV2(): false {
  return false;
}

/** Case Forge may add evidence and music to an installed mansion, but never
 * replace that reusable mansion's rooms or ambience. */
export function resolveDebateMysteryAssetSynthesisV2(input: {
  assetSynthesis?: Partial<DebateMysteryAssetSynthesisV2> | Record<string, unknown>;
  investigationMode?: DebateMysteryInvestigationModeV2;
  mansionBundleId?: string | null;
}): DebateMysteryAssetSynthesisV2 {
  const hasInstalledMansion = Boolean(input.mansionBundleId?.trim());
  const includesInvestigation = input.investigationMode !== "court_only";
  return {
    evidence: input.assetSynthesis?.evidence === true,
    rooms:
      includesInvestigation &&
      !hasInstalledMansion &&
      input.assetSynthesis?.rooms === true,
    illustratedRooms:
      includesInvestigation &&
      !hasInstalledMansion &&
      input.assetSynthesis?.rooms === true &&
      input.assetSynthesis?.illustratedRooms === true,
    music:
      includesInvestigation &&
      input.assetSynthesis?.music === true,
    ambience:
      includesInvestigation &&
      !hasInstalledMansion &&
      input.assetSynthesis?.ambience === true,
  };
}

export function resolveDebateMysteryConfigV2(
  value: DebateWhodunnitCreateConfigV2,
): DebateMysteryResolvedConfigV2 {
  if (!value || value.version !== DEBATE_MYSTERY_V2_SCHEMA_VERSION) {
    throw new Error("Whodunnit V2 requires a version 2 setup.");
  }
  const preset = value.preset;
  const presetDefaults = DEBATE_MYSTERY_V2_PRESETS.find(
    (entry) => entry.id === preset,
  ) ?? { floors: 2, rooms: 10, suspects: 6 };
  const suspectBotIds = value.suspectBotIds.map((id) => id.trim()).filter(Boolean);
  if (suspectBotIds.length < 4 || suspectBotIds.length > 8) {
    throw new Error("Whodunnit V2 requires four to eight suspects.");
  }
  if (preset !== "custom" && suspectBotIds.length !== presetDefaults.suspects) {
    throw new Error(`${preset} Whodunnit requires ${presetDefaults.suspects} suspects.`);
  }
  const trialType: DebateMysteryTrialTypeV2 = value.trialType === "bench" ? "bench" : "jury";
  const jurorBotIds = value.jurorBotIds.map((id) => id.trim()).filter(Boolean);
  if (trialType === "jury" && jurorBotIds.length !== DEBATE_MYSTERY_V2_JUROR_COUNT) {
    throw new Error("A Whodunnit Jury Trial requires exactly four cast jurors.");
  }
  if (trialType === "bench" && jurorBotIds.length > 0) {
    throw new Error("Bench Trial cannot freeze juror bot IDs.");
  }
  const prosecutorBotId =
    value.prosecutorBotId?.trim() || value.prosecutorPartnerBotId?.trim() || "";
  if (!prosecutorBotId) {
    throw new Error("Whodunnit V2 requires a selected Prosecutor bot.");
  }
  const castIds = [
    ...suspectBotIds,
    prosecutorBotId,
    value.rivalDefenseBotId.trim(),
    ...(value.judgeBotId && value.judgeBotId !== "prism:player-judge" ? [value.judgeBotId.trim()] : []),
    ...jurorBotIds,
  ].filter(Boolean);
  if (new Set(castIds).size !== castIds.length) {
    throw new Error("Every Whodunnit cast role must use a distinct bot.");
  }
  const floors = preset === "custom"
    ? Math.min(3, Math.max(2, Math.floor(value.floors ?? 2)))
    : presetDefaults.floors;
  const totalRooms = preset === "custom"
    ? Math.min(18, Math.max(suspectBotIds.length + 1, Math.floor(value.totalRooms ?? 10)))
    : presetDefaults.rooms;
  const {
    prosecutorPartnerBotId: _legacyProsecutorPartnerBotId,
    prosecutorBotId: _inputProsecutorBotId,
    mansionExteriorImageId: _mansionExteriorImageId,
    mansionExteriorDirection: _mansionExteriorDirection,
    ...publicValue
  } = value;
  const spark = (value.spark?.trim() || value.inspiration.trim()).slice(0, 2_000);
  const investigationMode: DebateMysteryInvestigationModeV2 =
    value.investigationMode === "court_only" ? "court_only" : "full";
  const mansionBundleId =
    typeof value.mansionBundleId === "string" && value.mansionBundleId.trim()
      ? value.mansionBundleId.trim().slice(0, 200)
      : null;
  const assetSynthesis = resolveDebateMysteryAssetSynthesisV2({
    assetSynthesis: value.assetSynthesis,
    investigationMode,
    mansionBundleId,
  });
  return {
    ...publicValue,
    trialType,
    suspectBotIds,
    jurorBotIds: trialType === "jury"
      ? jurorBotIds as [string, string, string, string]
      : [],
    judgeBotId: value.judgeBotId?.trim() || "prism:player-judge",
    prosecutorBotId,
    rivalDefenseBotId: value.rivalDefenseBotId.trim(),
    inspiration: spark,
    spark,
    assetSynthesis,
    useRelevantAssetLibraryProps: value.useRelevantAssetLibraryProps === true,
    investigationMode,
    mansionBundleId,
    mansionSnapshot: null,
    houseStyle: {
      ...debateMysteryHouseStyleV2(
        typeof value.mansionExteriorImageId === "string" && value.mansionExteriorImageId.trim()
          ? value.mansionExteriorDirection?.trim().slice(0, 800) || spark
          : spark,
      ),
      bespokeAmbienceRequested: assetSynthesis.ambience,
    },
    nonce: value.nonce.trim().slice(0, 200),
    floors,
    totalRooms,
    scaleClass: resolveDebateMysteryMansionExteriorScaleClassV1({
      preset,
      floors,
      totalRooms,
    }),
    playerRole: value.playerRole === "spectator" ? "spectator" : "participant",
    participationDifficulty:
      value.participationDifficulty === "coach" || value.participationDifficulty === "immersive"
        ? value.participationDifficulty
        : "standard",
    eyewitnessChance: investigationMode === "court_only"
      ? 0
      : debateMysteryEyewitnessChanceV2(value.difficulty, value.preset),
  };
}

export function debateMysteryClassifyVerdictV2(args: {
  legalResult: "guilty" | "not_guilty";
  accusedIsCulprit: boolean;
  proofEstablished: boolean;
  proofSafe: boolean;
}): DebateMysteryVerdictClassificationV2 {
  if (args.legalResult === "guilty") {
    if (!args.accusedIsCulprit) return "wrongful_conviction";
    return args.proofEstablished && args.proofSafe ? "just_conviction" : "unsafe_conviction";
  }
  if (args.proofEstablished && args.accusedIsCulprit) return "acquittal_despite_proof";
  return "failed_prosecution";
}

/** Ordered, deduplicated filed defendants with legacy murder compatibility. */
export function debateMysteryTheoryAccusedSeatIdsV2(
  theory: DebateMysteryTheoryV1 | null | undefined,
): string[] {
  if (!theory) return [];
  const explicit = Array.isArray(theory.accusedSeatIds)
    ? theory.accusedSeatIds
    : [];
  const legacyAliases = [theory.culpritSeatId, theory.accompliceSeatId].flatMap((seatId) =>
    typeof seatId === "string" && seatId.trim() ? [seatId.trim()] : []);
  const explicitNormalized = explicit.flatMap((seatId) =>
    typeof seatId === "string" && seatId.trim() ? [seatId.trim()] : []);
  // An older client may edit only culpritSeatId/accompliceSeatId after reading
  // a newer state that also contains accusedSeatIds. Treat a disagreement as
  // a legacy alias edit; current clients always update both representations.
  const candidates = explicitNormalized.length &&
    explicitNormalized.join("\0") === legacyAliases.join("\0")
    ? explicitNormalized
    : legacyAliases.length
      ? legacyAliases
      : explicitNormalized;
  return [...new Set(candidates.flatMap((seatId) =>
    typeof seatId === "string" && seatId.trim() ? [seatId.trim()] : []))];
}

export function debateMysteryTheoryWithAccusedSeatIdsV2(
  theory: DebateMysteryTheoryV1,
  accusedSeatIds: readonly string[],
): DebateMysteryTheoryV1 {
  const normalized = [...new Set(accusedSeatIds.map((seatId) => seatId.trim()).filter(Boolean))];
  return {
    ...theory,
    accusedSeatIds: normalized,
    culpritSeatId: normalized[0] ?? null,
    accompliceSeatId: normalized[1] ?? null,
  };
}

export function debateMysteryAccusationMatchesV2(
  accusedSeatIds: readonly string[],
  responsibleSeatIds: readonly string[],
): boolean {
  const accused = new Set(accusedSeatIds);
  const responsible = new Set(responsibleSeatIds);
  return accused.size === responsible.size &&
    [...accused].every((seatId) => responsible.has(seatId));
}

export function emptyDebateMysteryRequirementsV2(): DebateMysteryDialogueRequirementV2 {
  return { discoveryIds: [], unlockedTopicIds: [], admittedRecordIds: [], choices: [] };
}

export function emptyDebateMysteryMutationsV2(): DebateMysteryDialogueMutationV2 {
  return { discoverIds: [], unlockTopicIds: [], admitRecordIds: [], choices: [] };
}

export function publicEvidenceRecordV2(
  evidence: DebateMysteryPublicEvidenceItemV1,
  updatedAt: string,
): DebateMysteryPublicRecordItemV2 {
  return {
    reference: { kind: "evidence", id: evidence.id },
    title: evidence.title,
    description: evidence.observation,
    emoji: evidence.emoji,
    visualKind: evidence.imageId ? "synthesized" : "emoji",
    imageId: evidence.imageId,
    admitted: true,
    updatedAt,
  };
}

export function normalizeDebateMysteryFormatStateV2(
  value: unknown,
): DebateWhodunnitFormatStateV2 | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<DebateWhodunnitFormatStateV2>;
  if (
    source.version !== DEBATE_MYSTERY_V2_SCHEMA_VERSION ||
    source.format !== "whodunnit" ||
    !source.compilation ||
    source.compilation.version !== DEBATE_MYSTERY_V2_SCHEMA_VERSION ||
    !source.config ||
    source.config.version !== DEBATE_MYSTERY_V2_SCHEMA_VERSION ||
    !Array.isArray(source.suspects) ||
    !Array.isArray(source.rooms) ||
    !Array.isArray(source.record) ||
    !Array.isArray(source.topics) ||
    !Array.isArray(source.dialogueHistory)
  ) {
    return null;
  }
  const configSource = source.config as unknown as Record<string, unknown>;
  const prosecutorBotId =
    (typeof configSource.prosecutorBotId === "string"
      ? configSource.prosecutorBotId.trim()
      : "") ||
    (typeof configSource.prosecutorPartnerBotId === "string"
      ? configSource.prosecutorPartnerBotId.trim()
      : "");
  if (!prosecutorBotId) return null;
  const { prosecutorPartnerBotId: _legacyProsecutorPartnerBotId, ...config } =
    configSource;
  const spark =
    (typeof configSource.spark === "string" ? configSource.spark.trim() : "") ||
    (typeof configSource.inspiration === "string"
      ? configSource.inspiration.trim()
      : "");
  const publicCharge = source.caseCharge as unknown;
  const normalizedCaseTitle = (() => {
    const authoredTitle =
      typeof source.caseTitle === "string" ? source.caseTitle : null;
    if (!publicCharge || typeof publicCharge !== "object" || Array.isArray(publicCharge)) {
      return authoredTitle;
    }
    const charge = publicCharge as Record<string, unknown>;
    const kind = typeof charge.kind === "string" ? charge.kind : "";
    const subject = typeof charge.subject === "string" ? charge.subject.trim() : "";
    if (
      charge.version !== 1 ||
      !MYSTERY_INCIDENT_KINDS_V1.includes(kind as MysteryIncidentKindV1) ||
      !subject
    ) {
      return authoredTitle;
    }
    const incidentId =
      typeof charge.incidentId === "string" && charge.incidentId.trim()
        ? charge.incidentId.trim()
        : "legacy-incident";
    const nonce =
      typeof configSource.nonce === "string" && configSource.nonce.trim()
        ? configSource.nonce.trim()
        : "legacy-case";
    return resolveMysteryCaseTitleV1({
      authoredTitle,
      plan: {
        sourceHash: `${incidentId}:${nonce}`,
        primary: {
          kind: kind as MysteryIncidentKindV1,
          subject,
        },
      },
    });
  })();
  const assetSynthesisSource =
    configSource.assetSynthesis && typeof configSource.assetSynthesis === "object"
      ? configSource.assetSynthesis as Record<string, unknown>
      : {};
  const mansionBundleId =
    typeof configSource.mansionBundleId === "string" &&
    configSource.mansionBundleId.trim()
      ? configSource.mansionBundleId.trim()
      : null;
  const houseStyleSource =
    configSource.houseStyle && typeof configSource.houseStyle === "object"
      ? configSource.houseStyle as Partial<DebateMysteryHouseStyleV2>
      : null;
  const houseStyle =
    houseStyleSource?.version === 1 &&
    typeof houseStyleSource.id === "string" &&
    typeof houseStyleSource.label === "string" &&
    typeof houseStyleSource.promptContract === "string"
      ? {
          version: 1 as const,
          id: houseStyleSource.id,
          label: houseStyleSource.label,
          promptContract: houseStyleSource.promptContract,
          atmosphere: normalizeDebateMysteryAtmosphereContractV1(
            houseStyleSource.atmosphere,
            `${houseStyleSource.label} ${houseStyleSource.promptContract}`,
          ),
          acousticThemePaletteId:
            typeof houseStyleSource.acousticThemePaletteId === "string" &&
            houseStyleSource.acousticThemePaletteId.trim()
              ? houseStyleSource.acousticThemePaletteId.trim().slice(0, 200)
              : debateMysteryAcousticThemePaletteV1(
                  `${houseStyleSource.label} ${houseStyleSource.promptContract}`,
                ),
          bespokeAmbienceRequested: houseStyleSource.bespokeAmbienceRequested === true,
          ambience:
            houseStyleSource.ambience &&
            typeof houseStyleSource.ambience === "object" &&
            houseStyleSource.ambience.version === 1
              ? houseStyleSource.ambience
              : null,
        }
      : debateMysteryHouseStyleV2(spark);
  const readinessSource = source.readiness as
    | Partial<DebateMysteryPlayReadinessV1>
    | undefined;
  const readiness: DebateMysteryPlayReadinessV1 =
    readinessSource?.version === DEBATE_MYSTERY_PLAY_READINESS_VERSION &&
    (
      readinessSource.status === "repair_required" ||
      readinessSource.status === "repairing" ||
      readinessSource.status === "ready" ||
      readinessSource.status === "failed"
    )
      ? {
          version: DEBATE_MYSTERY_PLAY_READINESS_VERSION,
          status: readinessSource.status,
          spoilerSafeMessage:
            typeof readinessSource.spoilerSafeMessage === "string"
              ? readinessSource.spoilerSafeMessage
              : "Checking the local case pack",
          contractHash:
            typeof readinessSource.contractHash === "string"
              ? readinessSource.contractHash
              : null,
          checkedAt:
            typeof readinessSource.checkedAt === "string"
              ? readinessSource.checkedAt
              : null,
        }
      : {
          version: DEBATE_MYSTERY_PLAY_READINESS_VERSION,
          status: "repair_required",
          spoilerSafeMessage: "Preparing this local case for the current player-role contract",
          contractHash: null,
          checkedAt: null,
        };
  const rawCompilationSubsteps = (
    source.compilation as unknown as Record<string, unknown>
  ).substeps;
  const compilationSubsteps = Array.isArray(rawCompilationSubsteps)
    ? rawCompilationSubsteps.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const candidate = value as Record<string, unknown>;
        const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
        const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
        const state = candidate.state;
        return id && label &&
          (state === "complete" || state === "active" || state === "upcoming" || state === "attention")
          ? [{ id, label, state } satisfies DebateMysteryCompilationSubstepV2]
          : [];
      })
    : [];
  const normalizedCompilationSubsteps = compilationSubsteps.length
    ? compilationSubsteps
    : [{
        id: `legacy-${source.compilation.stage}`,
        label:
          typeof source.compilation.spoilerSafeMessage === "string" &&
          source.compilation.spoilerSafeMessage.trim()
            ? source.compilation.spoilerSafeMessage.trim()
            : "Case preparation",
        state:
          source.compilation.stage === "complete"
            ? "complete" as const
            : source.compilation.stage === "needs_attention" ||
                source.compilation.stage === "cancelled"
              ? "attention" as const
              : "active" as const,
      }];
  const subjectRooms = source.rooms.map((room) => ({ id: room.id, name: room.name }));
  const subjectPeople = [
    ...(source.victim ? [{ id: source.victim.id, name: source.victim.name }] : []),
    ...source.suspects.map((suspect) => ({ id: suspect.seatId, name: suspect.name })),
  ];
  const identityMirrorTargetSnapshots = Object.fromEntries(
    Object.entries(source.identityMirrorTargetSnapshots ?? {}).flatMap(
      ([botId, value]) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return [];
        }
        const candidate = value as Partial<DebateMysteryIdentityMirrorTargetSnapshotV1>;
        const normalizedBotId = botId.trim();
        const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
        if (
          candidate.version !== 1 ||
          !normalizedBotId ||
          candidate.botId !== normalizedBotId ||
          !name ||
          !candidate.faceStyle ||
          typeof candidate.faceStyle !== "object" ||
          Array.isArray(candidate.faceStyle)
        ) {
          return [];
        }
        return [[normalizedBotId, {
          version: 1 as const,
          botId: normalizedBotId,
          name: name.slice(0, 120),
          faceStyle: botIdentityMirrorFaceV1(candidate.faceStyle),
          avatarDetails: botIdentityMirrorAvatarDetailsV1(
            candidate.avatarDetails,
          ),
          glyph:
            typeof candidate.glyph === "string" && candidate.glyph.trim()
              ? candidate.glyph.trim().slice(0, 120)
              : null,
        } satisfies DebateMysteryIdentityMirrorTargetSnapshotV1]];
      },
    ),
  );
  return {
    ...(source as DebateWhodunnitFormatStateV2),
    caseTitle: normalizedCaseTitle,
    rooms: source.rooms.map((room) => ({
      ...room,
      accessState: room.visited
        ? "visited"
        : room.sealedAsset?.status === "pending"
          ? "being_secured"
          : room.sealedAsset?.status === "ready" || room.sealedAsset?.status === "fallback"
            ? "ready_to_enter"
            : "hidden",
    })),
    config: {
      ...config,
      prosecutorBotId,
      inspiration: spark,
      spark,
      assetSynthesis: resolveDebateMysteryAssetSynthesisV2({
        assetSynthesis: assetSynthesisSource,
        investigationMode:
          configSource.investigationMode === "court_only" ? "court_only" : "full",
        mansionBundleId,
      }),
      useRelevantAssetLibraryProps:
        configSource.useRelevantAssetLibraryProps === true,
      investigationMode:
        configSource.investigationMode === "court_only" ? "court_only" : "full",
      mansionBundleId,
      mansionSnapshot:
        configSource.mansionSnapshot &&
        typeof configSource.mansionSnapshot === "object" &&
        !Array.isArray(configSource.mansionSnapshot) &&
        (configSource.mansionSnapshot as { version?: unknown }).version === 2
          ? configSource.mansionSnapshot as unknown as DebateMysteryMansionSnapshotV2
          : null,
      scaleClass:
        configSource.scaleClass === "compact" ||
        configSource.scaleClass === "standard" ||
        configSource.scaleClass === "grand"
          ? configSource.scaleClass
          : resolveDebateMysteryMansionExteriorScaleClassV1({
              preset: configSource.preset as DebateMysteryPresetId | undefined,
              floors: typeof configSource.floors === "number" ? configSource.floors : 2,
              totalRooms: typeof configSource.totalRooms === "number" ? configSource.totalRooms : 10,
            }),
      houseStyle,
    } as unknown as DebateMysteryResolvedConfigV2,
    compilation: {
      ...source.compilation,
      substeps: normalizedCompilationSubsteps,
      startedAt:
        typeof source.compilation.startedAt === "string"
          ? source.compilation.startedAt
          : source.compilation.updatedAt,
      elapsedMs:
        typeof source.compilation.elapsedMs === "number" &&
        Number.isFinite(source.compilation.elapsedMs)
          ? Math.max(0, Math.round(source.compilation.elapsedMs))
          : 0,
      approximateRemainingMs:
        typeof source.compilation.approximateRemainingMs === "number" &&
        Number.isFinite(source.compilation.approximateRemainingMs)
          ? Math.max(0, Math.round(source.compilation.approximateRemainingMs))
          : null,
      etaBasisPasses:
        typeof source.compilation.etaBasisPasses === "number" &&
        Number.isFinite(source.compilation.etaBasisPasses)
          ? Math.max(0, Math.round(source.compilation.etaBasisPasses))
          : 0,
    },
    identityMirrorTargetSnapshots,
    crimeSceneRoomId:
      typeof source.crimeSceneRoomId === "string" &&
      source.rooms.some((room) => room.id === source.crimeSceneRoomId)
        ? source.crimeSceneRoomId
        : source.currentRoomId ?? source.rooms[0]?.id ?? null,
    openingSweepComplete:
      typeof source.openingSweepComplete === "boolean"
        ? source.openingSweepComplete
        : true,
    record: source.record.map((item) => ({
      ...item,
      visualKind:
        item.visualKind === "upload" || item.visualKind === "synthesized"
          ? item.visualKind
          : "emoji",
      imageId:
        typeof item.imageId === "string" && item.imageId.trim()
          ? item.imageId.trim()
          : null,
    })),
    dialogueHistory: source.dialogueHistory.map((entry) => ({
      ...entry,
      speakerBotId:
        typeof (entry as Partial<DebateMysteryPublicDialogueEntryV2>).speakerBotId ===
        "string"
          ? (entry as Partial<DebateMysteryPublicDialogueEntryV2>).speakerBotId!
          : null,
      ...(
        entry.speakerKind === "bot" ||
        entry.speakerKind === "player" ||
        entry.speakerKind === "judge" ||
        entry.speakerKind === "narrator"
          ? { speakerKind: entry.speakerKind }
          : {}
      ),
    })),
    roomIntroductions: Object.fromEntries(source.rooms.map((room) => {
      const phase = source.roomIntroductions?.[room.id];
      return [room.id, phase === "unseen" || phase === "casekeeper" || phase === "persona" || phase === "complete"
        ? phase
        : "complete"];
    })),
    topics: source.topics.flatMap((topic) => {
      if (!topic || typeof topic !== "object") return [];
      const candidate = topic as Partial<DebateMysteryPublicTopicV2>;
      if (
        typeof candidate.nodeId !== "string" ||
        typeof candidate.suspectSeatId !== "string" ||
        typeof candidate.label !== "string"
      ) return [];
      return [{
        ...candidate,
        nodeId: candidate.nodeId,
        suspectSeatId: candidate.suspectSeatId,
        label: candidate.label,
        subject: normalizeDebateMysteryTalkSubjectV2({
          value: candidate.subject,
          label: candidate.label,
          rooms: subjectRooms,
          people: subjectPeople,
        }),
        unlocked: candidate.unlocked === true,
        completed: candidate.completed === true,
      }];
    }),
    court: source.court
      ? {
          ...source.court,
          defendantSeatId:
            typeof source.court.defendantSeatId === "string"
              ? source.court.defendantSeatId
              : source.theory?.culpritSeatId ?? null,
        }
      : null,
    readiness,
  };
}

function mysteryStyleHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function debateMysteryAcousticThemePaletteV1(directionInput: string): string {
  const direction = directionInput.toLocaleLowerCase();
  if (/\b(?:space|spacecraft|starship|spaceship|orbital|airlock|reactor|hull)\b/u.test(direction)) {
    return "spacecraft-industrial-v1";
  }
  if (/\b(?:jungle|wilderness|canopy|rainforest|foliage|swamp|hut)\b/u.test(direction)) {
    return "jungle-wilderness-v1";
  }
  if (/\b(?:gothic|haunted|victorian|blackwood|old house|manor|séance|seance)\b/u.test(direction)) {
    return "gothic-old-house-v1";
  }
  return "neutral-mansion-v1";
}

/**
 * Spoiler-safe visual contract for the single image that introduces and
 * represents a mansion. It is intentionally derived only from public house
 * direction: the case truth never enters an exterior-generation prompt.
 */
export function debateMysteryMansionExteriorPromptV1(
  houseStyle: DebateMysteryHouseStyleV2,
  scaleClass: DebateMysteryMansionExteriorScaleClassV1 = "standard",
): string {
  const atmosphere = houseStyle.atmosphere;
  const scaleDirection: Record<DebateMysteryMansionExteriorScaleClassV1, string> = {
    compact:
      "Compact silhouette: a visibly small two-story footprint with one principal volume, few or no major wings, and intimate grounds.",
    standard:
      "Standard silhouette: a materially broader two-story estate with a central block, evident side massing or wings, and a larger approach.",
    grand:
      "Grand silhouette: an unmistakably taller three-story and/or dramatically wider compound with multiple major wings, towers or roof volumes, and expansive grounds.",
  };
  return [
    `Create one premium 16:9 exterior establishing shot for ${houseStyle.label}.`,
    `Exterior scale family: ${scaleClass}.`,
    scaleDirection[scaleClass],
    houseStyle.promptContract,
    `Geography and world: ${atmosphere.exteriorSetting}.`,
    `Weather: ${atmosphere.weather}. Time of day: ${atmosphere.timeOfDay}.`,
    `House condition: ${atmosphere.houseCondition}. Mood: ${atmosphere.mood}.`,
    "Show the complete mansion from outside, including its approach or entrance, scale-appropriate vertical floor massing, architecture, surrounding terrain, and how the building occupies its geography.",
    "Use a single continuous cinematic view with a readable silhouette and premium high-detail game key-art quality.",
    "Do not use camera zoom or cropping to make different scale families occupy the same apparent size; the silhouette must read Small, Medium, or Large at library-card size.",
    "No interiors, cutaways, room montages, collages, mosaics, split panels, floor plans, people, bodies, evidence, clues, weapons, text, logos, or UI.",
    "The mansion exterior is the hero and must remain legible when cropped to a library card.",
  ].join("\n");
}

/** Deterministic and spoiler-safe: this reads only the public house direction. */
export function debateMysteryAtmosphereContractV1(
  directionInput: string,
): MansionAtmosphereContractV1 {
  const direction = directionInput.replace(/\s+/gu, " ").trim().slice(0, 1_200);
  const lower = direction.toLocaleLowerCase();
  const isSpace = /\b(?:space|spacecraft|starship|spaceship|orbital|airlock|reactor|hull)\b/u.test(lower);
  const isJungle = /\b(?:jungle|wilderness|canopy|rainforest|foliage|swamp)\b/u.test(lower);
  const weather: MansionAtmosphereContractV1["weather"] =
    /\b(?:storm|thunder|tempest|rain-lashed)\b/u.test(lower) ? "storm"
      : /\b(?:rain|drizzle|downpour)\b/u.test(lower) ? "rain"
        : /\b(?:snow|blizzard|sleet)\b/u.test(lower) ? "snow"
          : /\b(?:fog|mist)\b/u.test(lower) ? "fog"
            : /\b(?:wind|gust|gale)\b/u.test(lower) ? "wind"
              : "clear";
  const timeOfDay: MansionAtmosphereContractV1["timeOfDay"] =
    /\b(?:night|midnight|moon|moonlight|candlelit)\b/u.test(lower) ? "night"
      : /\b(?:dawn|sunrise)\b/u.test(lower) ? "dawn"
        : /\b(?:dusk|sunset|twilight)\b/u.test(lower) ? "dusk"
          : /\b(?:day|daylight|noon|sunlit)\b/u.test(lower) ? "day"
            : "unknown";
  return {
    version: 1,
    weather,
    timeOfDay,
    exteriorSetting: isSpace
      ? "a sealed vessel beyond a planetary atmosphere"
      : isJungle
        ? "dense wet wilderness surrounding the structure"
        : "the mansion grounds and surrounding landscape",
    houseCondition: isSpace
      ? "operational pressure vessel with lived-in mechanical systems"
      : /\b(?:ruin|decay|derelict|abandoned|crumbling)\b/u.test(lower)
        ? "weathered structure with audible age"
        : "lived-in structure with coherent materials",
    mood: /\b(?:elegant dread|ominous|haunted|horror|uneasy)\b/u.test(lower)
      ? "restrained unease"
      : isSpace
        ? "isolated technological calm"
        : isJungle
          ? "humid watchfulness"
          : "cinematic mystery",
  };
}

export function normalizeDebateMysteryAtmosphereContractV1(
  value: unknown,
  fallbackDirection: string,
): MansionAtmosphereContractV1 {
  if (value && typeof value === "object") {
    const source = value as Partial<MansionAtmosphereContractV1>;
    if (source.version === 1 &&
        ["clear", "fog", "rain", "snow", "storm", "wind"].includes(String(source.weather)) &&
        ["dawn", "day", "dusk", "night", "unknown"].includes(String(source.timeOfDay)) &&
        typeof source.exteriorSetting === "string" && source.exteriorSetting.trim() &&
        typeof source.houseCondition === "string" && source.houseCondition.trim() &&
        typeof source.mood === "string" && source.mood.trim()) {
      return {
        version: 1,
        weather: source.weather!,
        timeOfDay: source.timeOfDay!,
        exteriorSetting: source.exteriorSetting.trim().slice(0, 400),
        houseCondition: source.houseCondition.trim().slice(0, 400),
        mood: source.mood.trim().slice(0, 400),
      };
    }
  }
  return debateMysteryAtmosphereContractV1(fallbackDirection);
}

/** A deterministic, spoiler-safe one-house contract shared by all visuals. */
export function debateMysteryHouseStyleV2(sparkInput: string): DebateMysteryHouseStyleV2 {
  const spark = sparkInput.replace(/\s+/gu, " ").trim().slice(0, 600);
  const direction = spark || "an original, lived-in mansion with restrained cinematic mystery";
  return {
    version: 1,
    id: `house-${mysteryStyleHash(direction.toLocaleLowerCase())}`,
    label: spark || "PRISM house style",
    promptContract: [
      "One-house continuity contract: every generated asset belongs to the same mansion, era, material palette, weather, lighting logic, and illustration language.",
      `Frozen Theme / Spark: ${direction}.`,
      "Preserve this identity for future room generation; do not introduce a second architecture, era, or palette.",
    ].join(" "),
    atmosphere: debateMysteryAtmosphereContractV1(direction),
    acousticThemePaletteId: debateMysteryAcousticThemePaletteV1(direction),
    bespokeAmbienceRequested: false,
    ambience: null,
  };
}

export function debateMysteryMansionBundleEligibleV2(
  state: Pick<DebateWhodunnitFormatStateV2, "rooms">,
): boolean {
  return state.rooms.length > 0 && state.rooms.every(
    (room) => room.unlocked && room.visited && room.hotspots.every((hotspot) => hotspot.examined),
  );
}
