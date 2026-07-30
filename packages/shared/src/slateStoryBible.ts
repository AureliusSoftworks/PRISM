import type { SlateAiProvider } from "./slate.js";
import type { SlateDocumentAnchor } from "./slateDocument.js";

export const SLATE_STORY_BIBLE_SCHEMA_VERSION = 1 as const;

export type SlateStoryBibleLayer =
  | "evidence"
  | "canon"
  | "plans"
  | "interpretations";
export type SlateStoryBibleAuthority = "writer" | "manuscript" | "ai";

export interface SlateStoryBibleProvenance {
  generationId: string;
  sourceIds: string[];
  anchors: SlateDocumentAnchor[];
  authority: SlateStoryBibleAuthority;
  provider: SlateAiProvider | null;
  model: string | null;
  createdAt: string;
}

export interface SlateCharacterProfileField<T> {
  value: T;
  layer: SlateStoryBibleLayer;
  writerLocked: boolean;
  provenance: SlateStoryBibleProvenance;
}

export interface SlateCharacterRelationshipState {
  relationshipId: string;
  otherCharacterId: string;
  kind: string;
  state: string;
  storyPointId: string | null;
  layer: SlateStoryBibleLayer;
  provenance: SlateStoryBibleProvenance;
}

export interface SlateCharacterKnowledgeProjection {
  claimId: string;
  status: "knows" | "believes" | "suspects" | "does_not_know";
  storyPointId: string | null;
  layer: SlateStoryBibleLayer;
  provenance: SlateStoryBibleProvenance;
}

/**
 * A source-anchored character projection, not a bot/persona definition.
 * Writer locks live at field level so extraction cannot silently rewrite
 * intent.
 */
export interface SlateCharacterProfile {
  schemaVersion: typeof SLATE_STORY_BIBLE_SCHEMA_VERSION;
  id: string;
  seriesId: string;
  entityId: string;
  generationId: string;
  identity: SlateCharacterProfileField<string>;
  aliases: SlateCharacterProfileField<string[]>;
  roles: SlateCharacterProfileField<string[]>;
  publicPersona: SlateCharacterProfileField<string>;
  privatePressure: SlateCharacterProfileField<string>;
  wants: SlateCharacterProfileField<string[]>;
  needs: SlateCharacterProfileField<string[]>;
  fears: SlateCharacterProfileField<string[]>;
  wounds: SlateCharacterProfileField<string[]>;
  beliefs: SlateCharacterProfileField<string[]>;
  values: SlateCharacterProfileField<string[]>;
  secrets: SlateCharacterProfileField<string[]>;
  contradictions: SlateCharacterProfileField<string[]>;
  dialogueMarkers: SlateCharacterProfileField<string[]>;
  competencies: SlateCharacterProfileField<string[]>;
  limitations: SlateCharacterProfileField<string[]>;
  appearance: SlateCharacterProfileField<string>;
  currentState: SlateCharacterProfileField<string>;
  relationships: SlateCharacterRelationshipState[];
  knowledge: SlateCharacterKnowledgeProjection[];
  updatedAt: string;
}

export type SlateCharacterArcTrackKind = "intended" | "observed";
export type SlateCharacterArcBeatStatus =
  | "planned"
  | "seeded"
  | "landed"
  | "missed"
  | "revised"
  | "abandoned"
  | "intentional";

export interface SlateCharacterArcBeat {
  id: string;
  label: string;
  description: string;
  expectedSectionId: string | null;
  observedSectionId: string | null;
  manuscriptOrder: number | null;
  storyTimeKey: string | null;
  status: SlateCharacterArcBeatStatus;
  layer: SlateStoryBibleLayer;
  provenance: SlateStoryBibleProvenance;
}

export interface SlateCharacterArcTrack {
  kind: SlateCharacterArcTrackKind;
  startState: string;
  destinationState: string;
  beats: SlateCharacterArcBeat[];
  writerLocked: boolean;
}

export interface SlateCharacterArcBridgeSuggestion {
  id: string;
  fromBeatId: string | null;
  toBeatId: string | null;
  kind: "missing_bridge" | "setup" | "payoff" | "intentional_divergence";
  summary: string;
  adopted: boolean;
  provenance: SlateStoryBibleProvenance;
}

/** Intended and observed tracks stay synchronized but never overwrite each other. */
export interface SlateCharacterArc {
  schemaVersion: typeof SLATE_STORY_BIBLE_SCHEMA_VERSION;
  id: string;
  seriesId: string;
  characterEntityId: string;
  generationId: string;
  intended: SlateCharacterArcTrack;
  observed: SlateCharacterArcTrack;
  bridgeSuggestions: SlateCharacterArcBridgeSuggestion[];
  updatedAt: string;
}

export type SlateNarrativeThreadKind =
  | "setup"
  | "promise"
  | "mystery"
  | "goal"
  | "foreshadowing"
  | "obligation";
export type SlateNarrativeThreadStatus =
  | "open"
  | "due"
  | "landed"
  | "missed"
  | "deferred"
  | "abandoned"
  | "intentional";

export interface SlateNarrativeThread {
  schemaVersion: typeof SLATE_STORY_BIBLE_SCHEMA_VERSION;
  id: string;
  seriesId: string;
  generationId: string;
  kind: SlateNarrativeThreadKind;
  label: string;
  description: string;
  status: SlateNarrativeThreadStatus;
  openedSectionId: string | null;
  expectedPayoffStartSectionId: string | null;
  expectedPayoffEndSectionId: string | null;
  resolvedSectionId: string | null;
  layer: SlateStoryBibleLayer;
  provenance: SlateStoryBibleProvenance;
}

export type SlateNarrativeEdgeKind =
  | "before"
  | "after"
  | "causes"
  | "requires"
  | "prevents"
  | "reveals"
  | "resolves";
export type SlateNarrativeNodeKind =
  | "event"
  | "claim"
  | "thread"
  | "arc_beat"
  | "section";

export interface SlateNarrativeEdgeEndpoint {
  kind: SlateNarrativeNodeKind;
  id: string;
}

export interface SlateNarrativeEdge {
  schemaVersion: typeof SLATE_STORY_BIBLE_SCHEMA_VERSION;
  id: string;
  seriesId: string;
  generationId: string;
  kind: SlateNarrativeEdgeKind;
  from: SlateNarrativeEdgeEndpoint;
  to: SlateNarrativeEdgeEndpoint;
  branchId: string;
  storyTimeKey: string | null;
  manuscriptOrder: number | null;
  layer: SlateStoryBibleLayer;
  provenance: SlateStoryBibleProvenance;
}

export type SlateTimelineBranchKind =
  | "main"
  | "flashback"
  | "dream"
  | "unreliable_narration"
  | "alternate_timeline"
  | "resurrection"
  | "other";

export interface SlateTimelineBranch {
  schemaVersion: typeof SLATE_STORY_BIBLE_SCHEMA_VERSION;
  id: string;
  seriesId: string;
  generationId: string;
  kind: SlateTimelineBranchKind;
  label: string;
  parentBranchId: string | null;
  description: string;
  provenance: SlateStoryBibleProvenance;
}

export interface SlateStoryBibleProjection {
  schemaVersion: typeof SLATE_STORY_BIBLE_SCHEMA_VERSION;
  seriesId: string;
  generationId: string;
  characters: SlateCharacterProfile[];
  arcs: SlateCharacterArc[];
  threads: SlateNarrativeThread[];
  edges: SlateNarrativeEdge[];
  timelineBranches: SlateTimelineBranch[];
  world: Array<{
    id: string;
    label: string;
    description: string;
    layer: SlateStoryBibleLayer;
    writerLocked: boolean;
    provenance: SlateStoryBibleProvenance;
  }>;
}
