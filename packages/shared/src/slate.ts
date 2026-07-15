export type SlateProjectPhase = "shape" | "draft" | "refine";

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

export interface SlateProjectSummary {
  id: string;
  title: string;
  spark: string;
  premise: string;
  phase: SlateProjectPhase;
  manuscriptLength: number;
  createdAt: string;
  updatedAt: string;
}

export interface SlateProjectDetail extends SlateProjectSummary {
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
  revisions: SlateRevision[];
  versions: SlateVersionSummary[];
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
  spark: string;
}

export type SlateProjectPatchRequest = Partial<
  Pick<
    SlateProjectDetail,
    | "title"
    | "spark"
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
  >
>;

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
