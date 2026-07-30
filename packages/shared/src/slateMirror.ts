import type { SlateDocumentAnchor } from "./slateDocument.js";

export const SLATE_MIRROR_SCHEMA_VERSION = 1 as const;

export type SlateMirrorSampleSourceKind =
  | "writer_owned_sample"
  | "description_exercise"
  | "dialogue_exercise"
  | "interiority_action_exercise"
  | "direct_human_prose"
  | "substantially_rewritten_prose"
  | "direction"
  | "research"
  | "quotation"
  | "import"
  | "untouched_ai_prose";

export type SlateMirrorEligibilityReason =
  | "eligible"
  | "not_explicitly_included"
  | "rights_not_confirmed"
  | "contains_third_party_material"
  | "human_rewrite_not_confirmed"
  | "forbidden_source_kind";

export interface SlateMirrorSampleProvenance {
  sourceKind: SlateMirrorSampleSourceKind;
  projectId: string | null;
  sectionId: string | null;
  sectionRevision: number | null;
  anchor: SlateDocumentAnchor | null;
  originatingOperationId: string | null;
  writerOwnsRights: boolean;
  containsThirdPartyMaterial: boolean;
  humanRewriteConfirmed: boolean;
}

export interface SlateMirrorSample {
  schemaVersion: typeof SLATE_MIRROR_SCHEMA_VERSION;
  id: string;
  userId: string;
  profileId: string;
  text: string;
  textHash: string;
  provenance: SlateMirrorSampleProvenance;
  explicitlyIncluded: boolean;
  eligibilityReason: SlateMirrorEligibilityReason;
  createdAt: string;
}

export interface SlateMirrorSampleEligibility {
  eligible: boolean;
  reason: SlateMirrorEligibilityReason;
}

const ELIGIBLE_MIRROR_SOURCE_KINDS = new Set<SlateMirrorSampleSourceKind>([
  "writer_owned_sample",
  "description_exercise",
  "dialogue_exercise",
  "interiority_action_exercise",
  "direct_human_prose",
  "substantially_rewritten_prose",
]);

/**
 * Mirror eligibility is provenance-based and deliberately conservative.
 * Acceptance into the manuscript does not make AI prose or imported text
 * eligible.
 */
export function slateMirrorSampleEligibility(
  sample: Pick<
    SlateMirrorSample,
    "explicitlyIncluded" | "provenance"
  >,
): SlateMirrorSampleEligibility {
  if (!sample.explicitlyIncluded) {
    return { eligible: false, reason: "not_explicitly_included" };
  }
  if (!sample.provenance.writerOwnsRights) {
    return { eligible: false, reason: "rights_not_confirmed" };
  }
  if (sample.provenance.containsThirdPartyMaterial) {
    return { eligible: false, reason: "contains_third_party_material" };
  }
  if (!ELIGIBLE_MIRROR_SOURCE_KINDS.has(sample.provenance.sourceKind)) {
    return { eligible: false, reason: "forbidden_source_kind" };
  }
  if (
    sample.provenance.sourceKind === "substantially_rewritten_prose" &&
    !sample.provenance.humanRewriteConfirmed
  ) {
    return { eligible: false, reason: "human_rewrite_not_confirmed" };
  }
  return { eligible: true, reason: "eligible" };
}

export function isSlateMirrorSampleEligible(
  sample: Pick<SlateMirrorSample, "explicitlyIncluded" | "provenance">,
): boolean {
  return slateMirrorSampleEligibility(sample).eligible;
}

export interface SlateMirrorVoiceCard {
  narrativeDistance: string;
  diction: string[];
  rhythm: string[];
  imagery: string[];
  dialogueHabits: string[];
  exposition: string[];
  humor: string[];
  density: string[];
  preferences: string[];
  avoidances: string[];
  exemplars: string[];
}

export interface SlateMirrorProfile {
  schemaVersion: typeof SLATE_MIRROR_SCHEMA_VERSION;
  id: string;
  userId: string;
  name: string;
  penName: string | null;
  currentVersionId: string | null;
  frozen: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Published profile versions are immutable. A drift review prepares a new
 * version with `parentVersionId`; it never edits an existing project pin.
 */
export interface SlateMirrorProfileVersion {
  schemaVersion: typeof SLATE_MIRROR_SCHEMA_VERSION;
  id: string;
  profileId: string;
  version: number;
  parentVersionId: string | null;
  status: "draft" | "published" | "ignored";
  voiceCard: SlateMirrorVoiceCard;
  sampleIds: string[];
  sourceFingerprint: string;
  createdAt: string;
  publishedAt: string | null;
}

export interface SlateMirrorOverlay {
  id: string;
  kind: "project" | "pov";
  label: string;
  povCharacterId: string | null;
  direction: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A project always binds to a concrete immutable version, never a profile's
 * moving "current" pointer.
 */
export interface SlateMirrorBinding {
  schemaVersion: typeof SLATE_MIRROR_SCHEMA_VERSION;
  id: string;
  projectId: string;
  profileId: string;
  profileVersionId: string;
  projectOverlay: SlateMirrorOverlay | null;
  povOverlays: SlateMirrorOverlay[];
  pinnedAt: string;
  updatedAt: string;
}

export interface SlateMirrorBrief {
  profileVersionId: string;
  projectOverlayId: string | null;
  povOverlayId: string | null;
  renderedBrief: string;
  sourceFingerprint: string;
  tokenEstimate: number;
}
