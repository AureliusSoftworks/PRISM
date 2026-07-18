import type { PromptWildcardRunMetadata } from "./promptShortcut.js";
import type { ContinuityProducerVersions } from "./continuityVersion.js";

export type SlateProjectPhase = "shape" | "draft" | "refine";
export type SlateProseMode = "auto" | "online" | "offline";
export type SlateAiProvider = "local" | "openai" | "anthropic";

export type SlateStructureKind = "act" | "chapter" | "scene";
export type SlateStructureStatus = "planned" | "drafted";

export interface SlateStructureItem {
  id: string;
  kind: SlateStructureKind;
  title: string;
  summary: string;
  direction: string;
  status: SlateStructureStatus;
  locked: boolean;
}

export interface SlateCharacter {
  id: string;
  name: string;
  role: string;
  voice: string;
  locked: boolean;
}

export interface SlateUnresolvedThread {
  id: string;
  label: string;
  resolved: boolean;
  locked: boolean;
}

export interface SlateLockedRange {
  id: string;
  start: number;
  end: number;
  label: string;
}

interface SlateTextReplacementSpan {
  start: number;
  previousEnd: number;
  nextEnd: number;
}

/**
 * Finds the smallest single replacement that turns previousText into nextText.
 * A textarea autosave may contain more than one keystroke; enclosing all of
 * them in one deterministic span keeps lock movement conservative.
 */
function slateTextReplacementSpan(
  previousText: string,
  nextText: string,
): SlateTextReplacementSpan {
  const sharedLimit = Math.min(previousText.length, nextText.length);
  let start = 0;
  while (
    start < sharedLimit &&
    previousText.charCodeAt(start) === nextText.charCodeAt(start)
  ) {
    start += 1;
  }

  let previousEnd = previousText.length;
  let nextEnd = nextText.length;
  while (
    previousEnd > start &&
    nextEnd > start &&
    previousText.charCodeAt(previousEnd - 1) ===
      nextText.charCodeAt(nextEnd - 1)
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }
  return { start, previousEnd, nextEnd };
}

/**
 * Re-anchors half-open manuscript locks after a direct human edit.
 *
 * Inserts immediately before a lock move it; inserts immediately after do
 * not. Edits inside a lock keep the replacement protected. If one coarse
 * autosave replacement crosses multiple locks, overlapping results collapse
 * to the first lock so the protected material cannot silently drift away.
 */
export function transformSlateLockedRangesForTextEdit(
  previousText: string,
  nextText: string,
  lockedRanges: readonly SlateLockedRange[],
): SlateLockedRange[] {
  if (previousText === nextText || lockedRanges.length === 0) {
    return lockedRanges.map((range) => ({ ...range }));
  }
  const replacement = slateTextReplacementSpan(previousText, nextText);
  const replacementLength = replacement.nextEnd - replacement.start;
  const removedLength = replacement.previousEnd - replacement.start;
  const delta = replacementLength - removedLength;

  const transformed = lockedRanges
    .map((range): SlateLockedRange | null => {
      if (replacement.previousEnd <= range.start) {
        return {
          ...range,
          start: range.start + delta,
          end: range.end + delta,
        };
      }
      if (replacement.start >= range.end) return { ...range };

      const keepsProtectedPrefix = range.start < replacement.start;
      const protectedSuffixLength = Math.max(
        0,
        range.end - replacement.previousEnd,
      );
      const start = keepsProtectedPrefix ? range.start : replacement.start;
      const end = replacement.nextEnd + protectedSuffixLength;
      if (end <= start) return null;
      return { ...range, start, end };
    })
    .filter((range): range is SlateLockedRange => range !== null)
    .map((range) => ({
      ...range,
      start: Math.max(0, Math.min(nextText.length, range.start)),
      end: Math.max(0, Math.min(nextText.length, range.end)),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const nonOverlapping: SlateLockedRange[] = [];
  for (const range of transformed) {
    const previous = nonOverlapping.at(-1);
    if (!previous || range.start >= previous.end) {
      nonOverlapping.push(range);
      continue;
    }
    previous.end = Math.max(previous.end, range.end);
    if (!previous.label && range.label) previous.label = range.label;
  }
  return nonOverlapping;
}

export type SlateRevisionAction =
  | "deepen"
  | "condense"
  | "rewrite"
  | "reframe"
  | "cut"
  | "direct";

export type SlateRevisionScope = "project" | "scene" | "selection";
export type SlateRevisionStatus = "pending" | "accepted" | "rejected";

export interface SlateRevision {
  id: string;
  projectId: string;
  action: SlateRevisionAction;
  scope: SlateRevisionScope;
  structureItemId: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  direction: string;
  originalText: string;
  proposedText: string;
  status: SlateRevisionStatus;
  provider: "local" | "openai" | "anthropic";
  model: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface SlateVersionSummary {
  id: string;
  reason: string;
  createdAt: string;
}

export interface SlateProjectCover {
  seed: string;
  prompt: string;
  imageUrl: string | null;
  imageId: string | null;
  revision: number;
  status: "fallback" | "generating" | "ready" | "failed";
}

export type SlateProjectTitleOrigin = "writer" | "spark" | "material";

export interface SlateProjectSummary {
  id: string;
  seriesId: string;
  bookOrdinal: number;
  title: string;
  titleOrigin: SlateProjectTitleOrigin;
  spark: string;
  premise: string;
  phase: SlateProjectPhase;
  cover: SlateProjectCover;
  manuscriptLength: number;
  createdAt: string;
  updatedAt: string;
}

export interface SlateProjectDetail extends SlateProjectSummary {
  sparkWildcards: PromptWildcardRunMetadata | null;
  voice: string;
  nonNegotiables: string[];
  structure: SlateStructureItem[];
  characters: SlateCharacter[];
  unresolvedThreads: SlateUnresolvedThread[];
  manuscript: string;
  direction: string;
  lockedRanges: SlateLockedRange[];
  lastProvider: "local" | "openai" | "anthropic" | null;
  lastModel: string | null;
  proseMode: SlateProseMode;
  proseModel: string | null;
  proseProvider: SlateAiProvider | null;
  titleSuggestion: SlateTitleSuggestion | null;
  revisions: SlateRevision[];
  versions: SlateVersionSummary[];
}

export interface SlateTitleSuggestion {
  id: string;
  title: string;
  reason: string;
  provider: SlateAiProvider;
  model: string;
  createdAt: string;
}

export interface SlateProjectListResponse {
  ok: true;
  projects: SlateProjectSummary[];
}

export interface SlateProjectResponse {
  ok: true;
  project: SlateProjectDetail;
}

export interface SlateProjectDeleteResponse {
  ok: true;
}

export interface SlateCreateProjectRequest {
  title: string;
  titleOrigin?: SlateProjectTitleOrigin;
  spark: string;
  seriesId?: string;
  sparkWildcards?: PromptWildcardRunMetadata;
}

export interface SlateResolveSparkWildcardsRequest {
  template: string;
}

export interface SlateResolveSparkWildcardsResponse {
  ok: true;
  spark: string;
  sparkWildcards: PromptWildcardRunMetadata;
}

export type SlateProjectPatchRequest = Partial<
  Pick<
    SlateProjectDetail,
    | "title"
    | "spark"
    | "sparkWildcards"
    | "premise"
    | "phase"
    | "voice"
    | "nonNegotiables"
    | "structure"
    | "characters"
    | "unresolvedThreads"
    | "manuscript"
    | "direction"
    | "lockedRanges"
    | "proseMode"
    | "proseModel"
    | "proseProvider"
  >
>;

export interface SlateLivingSummary {
  projectId: string;
  text: string;
  tail: string;
  sourceFingerprint: string;
  updatedAt: string;
}

export interface SlateLivingSummaryResponse {
  ok: true;
  summary: SlateLivingSummary;
}

export interface SlateProjectChatMessage {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  provider: SlateAiProvider | null;
  model: string | null;
  createdAt: string;
}

export interface SlateProjectChatResponse {
  ok: true;
  /** Chronological crash-recovery buffer; never more than three messages. */
  messages: SlateProjectChatMessage[];
}

export interface SlateTitleSuggestionResponse {
  ok: true;
  project: SlateProjectDetail;
}

export interface SlateGenerateTitleRequest {
  source: string;
  sourceKind: "spark" | "material";
  currentTitle?: string;
}

export interface SlateGenerateTitleResponse {
  ok: true;
  title: string;
  reason: string;
  provider: SlateAiProvider;
  model: string;
}

export interface SlateTitleSuggestionRequest {
  force?: boolean;
}

export interface SlateDraftRequest {
  structureItemId: string;
  direction?: string;
}

export interface SlateRevisionRequest {
  action: SlateRevisionAction;
  scope: SlateRevisionScope;
  structureItemId?: string;
  selectionStart?: number;
  selectionEnd?: number;
  direction?: string;
}

// Novel-scale manuscript contracts. Existing SlateProject records remain the
// book-level compatibility object while sections become authoritative prose.

export const SLATE_SECTION_CONTRACT_VERSION = 1;

export type SlateSectionKind = "act" | "chapter" | "scene" | "imported";
export type SlateSectionStatus =
  | "planned"
  | "drafting"
  | "drafted"
  | "revising"
  | "complete";

export interface SlateSeriesSummary {
  id: string;
  title: string;
  description: string;
  bookCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SlateBookSummary {
  projectId: string;
  seriesId: string;
  ordinal: number;
  title: string;
  phase: SlateProjectPhase;
  sectionCount: number;
  manuscriptLength: number;
  createdAt: string;
  updatedAt: string;
}

export interface SlateSectionSummary {
  id: string;
  projectId: string;
  seriesId: string;
  parentSectionId: string | null;
  structureItemId: string | null;
  kind: SlateSectionKind;
  ordinal: number;
  title: string;
  summary: string;
  direction: string;
  locked: boolean;
  status: SlateSectionStatus;
  revision: number;
  proseLength: number;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlateSectionDetail extends SlateSectionSummary {
  prose: string;
  lockedRanges: SlateLockedRange[];
}

export interface SlateSectionSaveRequest {
  expectedRevision: number;
  mutationId: string;
  prose: string;
  title?: string;
  summary?: string;
  direction?: string;
  status?: SlateSectionStatus;
  locked?: boolean;
  lockedRanges?: SlateLockedRange[];
}

export interface SlateSectionListResponse {
  ok: true;
  sections: SlateSectionSummary[];
}

export interface SlateSectionResponse {
  ok: true;
  section: SlateSectionDetail;
}

export interface SlateManuscriptPageResponse {
  ok: true;
  sections: SlateSectionDetail[];
  nextCursor: string | null;
  totalProseLength: number;
}

export interface SlateSeriesDetail extends SlateSeriesSummary {
  books: SlateBookSummary[];
}

export interface SlateSeriesListResponse {
  ok: true;
  series: SlateSeriesSummary[];
}

export interface SlateSeriesResponse {
  ok: true;
  series: SlateSeriesDetail;
}

export interface SlateCreateSeriesRequest {
  title: string;
  description?: string;
}

// Continuity is private model-facing narrative state. These contracts are
// inspectable for support/export, but they are not a writer-facing wiki.

export type SlateContinuityScopeKind = "series" | "book" | "section";
export type SlateContinuitySourceKind =
  | "human_edit"
  | "ai_draft"
  | "accepted_revision"
  | "import"
  | "story_snapshot"
  | "rehearsal_discovery"
  | "review_direction";
export type SlateContinuityAuthority = "human" | "ai" | "procedural";
export type SlateContinuityEpistemicStatus =
  | "fact"
  | "belief"
  | "rumor"
  | "mystery"
  | "ambiguity"
  | "intention"
  | "superseded";
export type SlateContinuityEntityKind =
  | "character"
  | "location"
  | "object"
  | "group"
  | "event"
  | "concept"
  | "world_rule";
export type SlateContinuityConcernKind =
  | "factual_contradiction"
  | "timeline_impossibility"
  | "knowledge_leak"
  | "state_conflict"
  | "relationship_conflict"
  | "world_rule_conflict"
  | "non_negotiable_conflict"
  | "due_thread"
  | "ambiguous_extraction";
export type SlateContinuityConcernSeverity = "note" | "important" | "critical";
export type SlateContinuityConcernStatus =
  | "open"
  | "intentional"
  | "deferred"
  | "resolved"
  | "dismissed";
export type SlateContinuityResolutionKind =
  | "update_canon"
  | "revise_prose"
  | "mark_belief"
  | "mark_rumor"
  | "mark_mystery"
  | "preserve_ambiguity"
  | "defer_thread"
  | "dismiss_extraction";

export interface SlateContinuityScope {
  kind: SlateContinuityScopeKind;
  seriesId: string;
  projectId: string | null;
  sectionId: string | null;
}

export interface SlateContinuitySourceAnchor {
  sourceId: string;
  sectionId: string | null;
  sectionRevision: number | null;
  start: number;
  end: number;
  quoteHash: string;
}

export interface SlateContinuityProvenance {
  authority: SlateContinuityAuthority;
  provider: "local" | "openai" | "anthropic" | null;
  model: string | null;
  producerVersions: ContinuityProducerVersions;
  createdAt: string;
}

export interface SlateContinuitySource {
  id: string;
  scope: SlateContinuityScope;
  kind: SlateContinuitySourceKind;
  sourceRevision: number;
  contentHash: string;
  supersedesSourceId: string | null;
  provenance: SlateContinuityProvenance;
}

export interface SlateContinuityEntity {
  id: string;
  seriesId: string;
  kind: SlateContinuityEntityKind;
  canonicalName: string;
  aliases: string[];
  description: string;
  locked: boolean;
  anchors: SlateContinuitySourceAnchor[];
  provenance: SlateContinuityProvenance;
}

export interface SlateContinuityClaim {
  id: string;
  scope: SlateContinuityScope;
  subjectEntityId: string | null;
  predicate: string;
  objectEntityId: string | null;
  value: string;
  epistemicStatus: SlateContinuityEpistemicStatus;
  perspectiveEntityId: string | null;
  confidence: number;
  anchors: SlateContinuitySourceAnchor[];
  supersedesClaimId: string | null;
  provenance: SlateContinuityProvenance;
}

export interface SlateContinuityEvent {
  id: string;
  scope: SlateContinuityScope;
  title: string;
  description: string;
  chronologyKey: string | null;
  participantEntityIds: string[];
  locationEntityId: string | null;
  anchors: SlateContinuitySourceAnchor[];
  provenance: SlateContinuityProvenance;
}

export interface SlateContinuityRelationship {
  id: string;
  seriesId: string;
  fromEntityId: string;
  toEntityId: string;
  kind: string;
  state: string;
  epistemicStatus: SlateContinuityEpistemicStatus;
  anchors: SlateContinuitySourceAnchor[];
  provenance: SlateContinuityProvenance;
}

export interface SlateContinuityKnowledgeState {
  id: string;
  seriesId: string;
  characterEntityId: string;
  claimId: string;
  learnedEventId: string | null;
  status: "knows" | "believes" | "suspects" | "does_not_know";
  anchors: SlateContinuitySourceAnchor[];
  provenance: SlateContinuityProvenance;
}

export interface SlateContinuityThread {
  id: string;
  scope: SlateContinuityScope;
  label: string;
  status: "open" | "due" | "resolved" | "abandoned" | "intentional";
  dueSectionId: string | null;
  anchors: SlateContinuitySourceAnchor[];
  provenance: SlateContinuityProvenance;
}

export interface SlateContinuityConcern {
  id: string;
  scope: SlateContinuityScope;
  kind: SlateContinuityConcernKind;
  severity: SlateContinuityConcernSeverity;
  status: SlateContinuityConcernStatus;
  summary: string;
  explanation: string;
  claimIds: string[];
  anchors: SlateContinuitySourceAnchor[];
  recommendedResolution: SlateContinuityResolutionKind | null;
  createdAt: string;
  resolvedAt: string | null;
  producerVersions: ContinuityProducerVersions;
}

export interface SlateContinuityConcernPassage {
  sourceId: string;
  sectionId: string | null;
  sectionTitle: string | null;
  quote: string;
  start: number;
  end: number;
}

/** The single writer-facing concern card. The private ledger stays hidden. */
export interface SlateContinuityConcernCard extends SlateContinuityConcern {
  passages: SlateContinuityConcernPassage[];
  suggestedAction: {
    kind: SlateContinuityResolutionKind;
    label: string;
  };
  directionPrompt: string;
}

export interface SlateContinuityConcernNextResponse {
  ok: true;
  concern: SlateContinuityConcernCard | null;
}

export interface SlateContinuityConcernResolveRequest {
  direction?: string;
  resolutionKind?: SlateContinuityResolutionKind;
}

export interface SlateContinuityConcernResolveResponse {
  ok: true;
  project: SlateProjectDetail;
  appliedResolution: SlateContinuityResolutionKind;
  revisionId: string | null;
  nextConcern: SlateContinuityConcernCard | null;
}

export interface SlateContinuityGeneration {
  id: string;
  projectId: string;
  generation: number;
  status: "building" | "ready" | "active" | "deferred" | "failed" | "superseded";
  targetVersion: string;
  sourceFingerprint: string;
  comparisonSummary: string | null;
  createdAt: string;
  completedAt: string | null;
  producerVersions: ContinuityProducerVersions;
}

export interface SlateContinuityStatus {
  projectId: string;
  activeVersion: string;
  targetVersion: string;
  activeGeneration: number;
  previousGeneration: number | null;
  upgradeStatus: "current" | "building" | "review" | "deferred" | "failed";
  pendingJobCount: number;
  openConcernCount: number;
  lastSuccessfulAt: string | null;
  producerVersions: ContinuityProducerVersions;
}

export interface SlateContinuityContextBrief {
  projectId: string;
  sectionId: string;
  sectionRevision: number;
  adjacentSectionIds: string[];
  relevantClaimIds: string[];
  relevantEntityIds: string[];
  relevantEventIds: string[];
  relevantRelationshipIds: string[];
  relevantKnowledgeStateIds: string[];
  dueThreadIds: string[];
  lockedInstructions: string[];
  renderedBrief: string;
  tokenEstimate: number;
  sourceFingerprint: string;
  producerVersions: ContinuityProducerVersions;
}

// Return sessions are version-keyed, deterministic project-opening recaps.
// The UI presents exactly one next card rather than a dashboard of choices.

export const SLATE_RETURN_SESSION_SCHEMA_VERSION = 1 as const;

export type SlateReturnNextCardKind =
  | "canon_risk"
  | "due_thread"
  | "continuity_upgrade"
  | "review_revision"
  | "draft_section"
  | "refine_section"
  | "shape_story";

export interface SlateReturnSectionReference {
  id: string;
  title: string;
  summary: string;
  direction: string;
  kind: SlateSectionKind;
  status: SlateSectionStatus;
  ordinal: number;
  wordCount: number;
}

export interface SlateReturnThreadReference {
  id: string;
  label: string;
  status: "open" | "due";
  dueSectionId: string | null;
}

export interface SlateReturnNextCard {
  kind: SlateReturnNextCardKind;
  priority: 1 | 2 | 3 | 4;
  title: string;
  body: string;
  actionLabel: string;
  target: {
    kind:
      | "concern"
      | "thread"
      | "generation"
      | "revision"
      | "section"
      | "project";
    id: string;
  };
}

export interface SlateReturnSessionSynopsis {
  schemaVersion: typeof SLATE_RETURN_SESSION_SCHEMA_VERSION;
  producerVersions: ContinuityProducerVersions;
  sourceFingerprint: string;
  generatedAt: string;
  projectId: string;
  seriesId: string;
  title: string;
  premise: string;
  storySoFar: string;
  draftedProgress: string;
  trajectory: string;
  mostRecentSection: SlateReturnSectionReference | null;
  nextPlannedSection: SlateReturnSectionReference | null;
  threads: {
    open: SlateReturnThreadReference[];
    due: SlateReturnThreadReference[];
  };
  counts: {
    sectionCount: number;
    draftedSectionCount: number;
    plannedSectionCount: number;
    wordCount: number;
    openThreadCount: number;
    dueThreadCount: number;
    openConcernCount: number;
    canonRiskCount: number;
    pendingRevisionCount: number;
    entityCount: number;
    characterCount: number;
    claimCount: number;
    eventCount: number;
  };
  continuity: {
    activeVersion: string;
    targetVersion: string;
    activeGeneration: number;
    upgradeStatus: SlateContinuityStatus["upgradeStatus"];
    lastSuccessfulAt: string | null;
  };
  nextCard: SlateReturnNextCard;
}

export interface SlateReturnSession {
  id: string;
  projectId: string;
  sourceFingerprint: string;
  synopsis: SlateReturnSessionSynopsis;
  createdAt: string;
  reused: boolean;
  isCurrent: boolean;
}

export interface SlateReturnSessionResponse {
  ok: true;
  session: SlateReturnSession;
}

export interface SlateReturnSessionListResponse {
  ok: true;
  sessions: SlateReturnSession[];
}
