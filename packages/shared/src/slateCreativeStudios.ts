import type { SlateAiProvider } from "./slate.js";
import type { SlateDocumentAnchor } from "./slateDocument.js";
import type {
  PrismReviewArtifactV1,
  PrismReviewResultV1,
  PrismReviewerSnapshotV1,
} from "./review.js";

export const SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION = 1 as const;

export type SlateVisualReferenceKind =
  | "character_study"
  | "expression"
  | "costume"
  | "location"
  | "prop"
  | "motif"
  | "scene_keyframe"
  | "blocking";
export type SlateVisualReferenceStatus = "study" | "pinned" | "rejected";

export interface SlateVisualEntityState {
  entityId: string;
  state: string;
  sourceIds: string[];
}

/**
 * Generated visuals begin as non-canon studies. `pinned` makes the image a
 * visual authority only; textual canon still requires a separate writer-made
 * Continuity source.
 */
export interface SlateVisualReference {
  schemaVersion: typeof SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION;
  id: string;
  seriesId: string;
  projectId: string;
  sectionId: string | null;
  kind: SlateVisualReferenceKind;
  status: SlateVisualReferenceStatus;
  assetId: string;
  prompt: string;
  negativePrompt: string | null;
  referenceAssetIds: string[];
  passageAnchor: SlateDocumentAnchor | null;
  entityStates: SlateVisualEntityState[];
  continuityGeneration: number;
  visualStyleVersionId: string;
  provider: SlateAiProvider | "comfyui";
  model: string;
  seed: string | null;
  /** Non-null only after a distinct writer-confirmed textual promotion. */
  textualCanonSourceId: string | null;
  createdAt: string;
  pinnedAt: string | null;
}

export type SlateMomentumKind =
  | "desire"
  | "obstacle"
  | "approaching_payoff"
  | "urgent_thread";

export interface SlateMomentumTarget {
  kind: SlateMomentumKind;
  label: string;
  summary: string;
  entityId: string | null;
  threadId: string | null;
  sourceIds: string[];
  anchors: SlateDocumentAnchor[];
}

export interface SlateLitMatch {
  intention: string;
  unfinishedPressure: string;
  sourceSectionId: string;
  capturedAt: string;
}

export interface SlateMomentumSnapshot {
  schemaVersion: typeof SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION;
  id: string;
  projectId: string;
  sectionId: string;
  sectionRevision: number;
  continuityGeneration: number;
  sourceFingerprint: string;
  liveWire: SlateMomentumTarget | null;
  litMatch: SlateLitMatch | null;
  createdAt: string;
  supersededAt: string | null;
}

export type SlateSourceShelfKind = "note" | "research";

/**
 * Source Shelf material is deliberately outside manuscript evidence, Canon,
 * and Mirror. Promotion creates a separate writer-authority Continuity source;
 * it never changes the source item's Mirror eligibility.
 */
export interface SlateSourceShelfItem {
  schemaVersion: typeof SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION;
  id: string;
  projectId: string;
  title: string;
  kind: SlateSourceShelfKind;
  content: string;
  metadata: Record<string, string>;
  promotedSourceId: string | null;
  mirrorEligible: false;
  createdAt: string;
  updatedAt: string;
}

export type SlateReviewVerdict =
  | "ready"
  | "promising"
  | "needs_attention";

export interface SlateReviewCircleVerdict {
  verdict: SlateReviewVerdict;
  headline: string;
  strongestElement: string;
  primaryConcern: string;
  nextMove: string;
}

export interface SlateReviewCircleRoomNote {
  verdict: SlateReviewVerdict;
  headline: string;
  consensus: string;
  tensions: string[];
  nextMove: string;
}

export interface SlateReviewCircleGuest {
  name: string;
  readerBrief: string;
}

/**
 * A completed room is immutable. It freezes the exact readable artifact,
 * section revisions, Continuity identity, reviewer personas, independent
 * verdicts, and one verdict-first synthesis.
 */
export interface SlateReviewCircleSession {
  schemaVersion: typeof SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION;
  id: string;
  projectId: string;
  sectionId: string;
  artifact: PrismReviewArtifactV1;
  sectionRevisions: Record<string, number>;
  continuityVersion: string;
  continuityGeneration: number;
  reviewerSnapshots: PrismReviewerSnapshotV1[];
  reviews: PrismReviewResultV1<SlateReviewCircleVerdict>[];
  roomNote: SlateReviewCircleRoomNote;
  provider: string;
  model: string | null;
  createdAt: string;
}
