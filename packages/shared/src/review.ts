export type PrismReviewPerspectiveV1 =
  | "audience"
  | "reader"
  | "player"
  | "participant"
  | "creator";

export type PrismReviewContextValueV1 = string | number | boolean | null;

export type PrismReviewEvidenceV1 =
  | Readonly<{
      id: string;
      channel: "text";
      label: string;
      content: string;
    }>
  | Readonly<{
      id: string;
      channel: "audio";
      label: string;
      transcript: string;
    }>
  | Readonly<{
      id: string;
      channel: "visual";
      label: string;
      description: string;
    }>
  | Readonly<{
      id: string;
      channel: "event";
      label: string;
      description: string;
    }>;

/**
 * Immutable, perspective-specific input to every PRISM review. Applets own the
 * projection into this shape; reviewers must never receive raw runtime state.
 */
export interface PrismReviewArtifactV1 {
  readonly version: 1;
  readonly appletId: string;
  readonly subjectId: string;
  readonly subjectTitle: string;
  readonly perspective: PrismReviewPerspectiveV1;
  readonly perspectiveLabel: string;
  readonly context: Readonly<Record<string, PrismReviewContextValueV1>>;
  readonly evidence: readonly PrismReviewEvidenceV1[];
  readonly createdAt: string;
}

/** Persona state frozen for one review instead of read again mid-generation. */
export interface PrismReviewerSnapshotV1 {
  readonly version: 1;
  readonly reviewerId: string;
  readonly reviewerName: string;
  readonly systemPrompt: string;
}

export interface PrismReviewResultV1<TOutput> {
  version: 1;
  artifactHash: string;
  reviewerSnapshotHash: string;
  reviewerSnapshot: PrismReviewerSnapshotV1;
  rubricId: string;
  rubricVersion: number;
  provider: string;
  model: string | null;
  createdAt: string;
  output: TOutput;
}
