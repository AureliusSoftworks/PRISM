/** Versioned, frame-domain diagnostics for the production voice/mouth path. */
export const VOICE_ALIGNMENT_TRACE_VERSION = 1 as const;

export const VOICE_ALIGNMENT_ORIGINS_V1 = [
  "engine",
  "provider",
  "generated",
  "measured",
  "forced-aligner",
  "heuristic",
] as const;
export type VoiceAlignmentOriginV1 =
  (typeof VOICE_ALIGNMENT_ORIGINS_V1)[number];

/**
 * These timing sources either came from the synthesizer itself, its provider,
 * or the exact schedule that generated the synthesized audio. Measured PCM
 * activity, post-hoc forced alignment, and text heuristics are useful
 * diagnostics, but are not engine symbol authority and can never establish an
 * `aligned` trace by themselves.
 */
export const VOICE_ALIGNMENT_AUTHORITATIVE_ORIGINS_V1 = [
  "engine",
  "provider",
  "generated",
] as const satisfies readonly VoiceAlignmentOriginV1[];

export const VOICE_ALIGNMENT_STATUSES_V1 = [
  "aligned",
  "partial",
  "unaligned",
] as const;
export type VoiceAlignmentStatusV1 =
  (typeof VOICE_ALIGNMENT_STATUSES_V1)[number];

export const VOICE_ALIGNMENT_SURFACES_V1 = [
  "chat",
  "zen",
  "coffee",
  "signal",
  "debate",
  "sandbox",
  "replay",
  "avatar-studio",
  "voice-sync-lab",
  "unknown",
] as const;
export type VoiceAlignmentSurfaceV1 =
  (typeof VOICE_ALIGNMENT_SURFACES_V1)[number];

export interface VoiceAlignmentFrameBoundsV1 {
  /** Inclusive PCM frame. */
  startFrame: number;
  /** Exclusive PCM frame. */
  endFrame: number;
}

export interface VoiceAlignmentEngineV1 {
  requested: string | null;
  resolved: string;
  provider: string | null;
  model: string | null;
}

interface VoiceAlignmentTimedSpanV1 extends VoiceAlignmentFrameBoundsV1 {
  origin: VoiceAlignmentOriginV1;
  confidence: number | null;
}

interface VoiceAlignmentSymbolSpanV1 extends VoiceAlignmentTimedSpanV1 {
  /** Inclusive Unicode-code-point offset in `spokenText`, when known. */
  sourceStart: number | null;
  /** Exclusive Unicode-code-point offset in `spokenText`, when known. */
  sourceEnd: number | null;
}

export interface VoiceAlignmentPhonemeSpanV1
  extends VoiceAlignmentSymbolSpanV1 {
  phoneme: string;
}

export interface VoiceAlignmentCharacterSpanV1
  extends VoiceAlignmentSymbolSpanV1 {
  character: string;
}

export interface VoiceAlignmentVisemeSpanV1 extends VoiceAlignmentSymbolSpanV1 {
  viseme: string;
}

export interface VoiceAlignmentActivitySpanV1
  extends VoiceAlignmentTimedSpanV1 {}

export type VoiceAlignmentSpeechSpanV1 = VoiceAlignmentActivitySpanV1;
export type VoiceAlignmentSilenceSpanV1 = VoiceAlignmentActivitySpanV1;

export interface VoiceAlignmentMouthTransitionV1 {
  /** PCM presentation frame at which the rendered state changed. */
  atFrame: number;
  from: string | null;
  to: string;
  /** Whether the rendered destination shape exposes an open mouth. */
  open: boolean;
}

export interface VoiceAlignmentMetricsV1 {
  speechStartFrame: number | null;
  speechEndFrame: number | null;
  /** First frame at which the rendered mouth is in an open pose. */
  mouthStartFrame: number | null;
  /** Exclusive end of the last rendered open-mouth interval. */
  mouthEndFrame: number | null;
  /**
   * First open-mouth frame minus audible speech onset. This is an audibility
   * gate metric, not a phoneme-match score: a correct closed consonant can
   * begin after speech without representing visual lag. Negative means the
   * mouth opens before the audio; positive means it opens after speech begins.
   */
  onsetDeltaFrames: number | null;
  onsetDeltaMs: number | null;
  /**
   * Last open-mouth frame minus audible speech offset. Negative means the mouth
   * closes before speech ends; positive means it remains open after speech.
   */
  offsetDeltaFrames: number | null;
  offsetDeltaMs: number | null;
  /** Offset delta minus onset delta; positive means error moved later. */
  driftFrames: number | null;
  driftMs: number | null;
  speechFrameCount: number;
  mouthOpenFrameCount: number;
  silenceFrameCount: number;
  silenceOpenFrameCount: number;
  silenceOpenMs: number;
  silenceOpenViolationCount: number;
}

export interface VoiceAlignmentTraceV1 {
  v: typeof VOICE_ALIGNMENT_TRACE_VERSION;
  utteranceId: string;
  surface: VoiceAlignmentSurfaceV1;
  engine: VoiceAlignmentEngineV1;
  alignmentStatus: VoiceAlignmentStatusV1;
  alignmentReason: string | null;
  sourceText: string;
  spokenText: string;
  /** PCM sample rate. All frame positions in this trace use this clock. */
  sampleRate: number;
  /** Final rendered PCM frame count, after effects and presentation padding. */
  frameCount: number;
  /** Bounds containing audible articulation in the final PCM clock. */
  articulation: VoiceAlignmentFrameBoundsV1;
  /** Bounds actually presented to the playback surface. */
  presentation: VoiceAlignmentFrameBoundsV1;
  /** Provider/engine character timing, kept separate from phoneme truth. */
  characterSpans: VoiceAlignmentCharacterSpanV1[];
  phonemeSpans: VoiceAlignmentPhonemeSpanV1[];
  visemeSpans: VoiceAlignmentVisemeSpanV1[];
  speechSpans: VoiceAlignmentSpeechSpanV1[];
  silenceSpans: VoiceAlignmentSilenceSpanV1[];
  mouthTransitions: VoiceAlignmentMouthTransitionV1[];
  metrics: VoiceAlignmentMetricsV1;
}

export type VoiceAlignmentValidationIssueCodeV1 =
  | "type"
  | "required"
  | "version"
  | "enum"
  | "range"
  | "order"
  | "invariant"
  | "metrics";

export interface VoiceAlignmentValidationIssueV1 {
  path: string;
  code: VoiceAlignmentValidationIssueCodeV1;
  message: string;
}

export interface VoiceAlignmentValidationResultV1 {
  valid: boolean;
  issues: VoiceAlignmentValidationIssueV1[];
  trace: VoiceAlignmentTraceV1 | null;
}

type VoiceAlignmentStatusInputV1 = Partial<Pick<
  VoiceAlignmentTraceV1,
  "characterSpans" | "phonemeSpans" | "visemeSpans" | "speechSpans"
>>;

type VoiceAlignmentMetricsInputV1 = Pick<
  VoiceAlignmentTraceV1,
  | "sampleRate"
  | "frameCount"
  | "presentation"
  | "speechSpans"
  | "silenceSpans"
  | "mouthTransitions"
>;

type UnknownRecord = Record<string, unknown>;

const DEFAULT_VOICE_ALIGNMENT_SAMPLE_RATE = 48_000;
const AUTHORITATIVE_ORIGINS = new Set<VoiceAlignmentOriginV1>(
  VOICE_ALIGNMENT_AUTHORITATIVE_ORIGINS_V1,
);
const STATUS_RANK: Readonly<Record<VoiceAlignmentStatusV1, number>> = {
  unaligned: 0,
  partial: 1,
  aligned: 2,
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0
    ? number
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : nonEmptyString(value);
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function clampInteger(value: unknown, minimum: number, maximum: number): number {
  const number = finiteNumber(value);
  if (number === null) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function normalizedConfidence(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number === null) return null;
  return Math.min(1, Math.max(0, number));
}

function normalizedOrigin(value: unknown): VoiceAlignmentOriginV1 {
  return oneOf(value, VOICE_ALIGNMENT_ORIGINS_V1) ? value : "heuristic";
}

function normalizedBounds(
  value: unknown,
  frameCount: number,
  fallback: VoiceAlignmentFrameBoundsV1,
): VoiceAlignmentFrameBoundsV1 {
  if (!isRecord(value)) return fallback;
  const left = clampInteger(value.startFrame, 0, frameCount);
  const right = clampInteger(value.endFrame, 0, frameCount);
  return {
    startFrame: Math.min(left, right),
    endFrame: Math.max(left, right),
  };
}

function inferFrameCount(value: UnknownRecord): number {
  const explicit = nonNegativeInteger(value.frameCount);
  if (explicit !== null) return explicit;

  let maximum = 0;
  const collectBounds = (candidate: unknown) => {
    if (!isRecord(candidate)) return;
    const endFrame = nonNegativeInteger(candidate.endFrame);
    if (endFrame !== null) maximum = Math.max(maximum, endFrame);
  };
  collectBounds(value.articulation);
  collectBounds(value.presentation);
  for (const key of [
    "phonemeSpans",
    "characterSpans",
    "visemeSpans",
    "speechSpans",
    "silenceSpans",
  ] as const) {
    const spans = value[key];
    if (!Array.isArray(spans)) continue;
    for (const span of spans) collectBounds(span);
  }
  if (Array.isArray(value.mouthTransitions)) {
    for (const transition of value.mouthTransitions) {
      if (!isRecord(transition)) continue;
      const atFrame = nonNegativeInteger(transition.atFrame);
      if (atFrame !== null) maximum = Math.max(maximum, atFrame);
    }
  }
  return maximum;
}

function normalizedSourceRange(
  value: UnknownRecord,
  sourceLength: number,
): Pick<VoiceAlignmentSymbolSpanV1, "sourceStart" | "sourceEnd"> {
  const rawStart = nonNegativeInteger(value.sourceStart);
  const rawEnd = nonNegativeInteger(value.sourceEnd);
  if (rawStart === null || rawEnd === null) {
    return { sourceStart: null, sourceEnd: null };
  }
  const start = Math.min(sourceLength, rawStart);
  const end = Math.min(sourceLength, rawEnd);
  return {
    sourceStart: Math.min(start, end),
    sourceEnd: Math.max(start, end),
  };
}

function normalizedSymbolSpans<K extends "character" | "phoneme" | "viseme">(
  value: unknown,
  symbolKey: K,
  frameCount: number,
  sourceLength: number,
): Array<
  K extends "phoneme"
    ? VoiceAlignmentPhonemeSpanV1
    : K extends "character"
      ? VoiceAlignmentCharacterSpanV1
      : VoiceAlignmentVisemeSpanV1
> {
  if (!Array.isArray(value)) return [];
  const spans: Array<VoiceAlignmentSymbolSpanV1 & Record<K, string>> = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const symbol = nonEmptyString(candidate[symbolKey]);
    if (!symbol) continue;
    const bounds = normalizedBounds(candidate, frameCount, {
      startFrame: 0,
      endFrame: 0,
    });
    if (bounds.endFrame <= bounds.startFrame) continue;
    spans.push({
      ...bounds,
      origin: normalizedOrigin(candidate.origin),
      confidence: normalizedConfidence(candidate.confidence),
      ...normalizedSourceRange(candidate, sourceLength),
      [symbolKey]: symbol,
    } as VoiceAlignmentSymbolSpanV1 & Record<K, string>);
  }
  spans.sort(
    (left, right) =>
      left.startFrame - right.startFrame ||
      left.endFrame - right.endFrame ||
      left[symbolKey].localeCompare(right[symbolKey]),
  );
  return spans as Array<
    K extends "phoneme"
      ? VoiceAlignmentPhonemeSpanV1
      : K extends "character"
        ? VoiceAlignmentCharacterSpanV1
        : VoiceAlignmentVisemeSpanV1
  >;
}

function normalizedActivitySpans(
  value: unknown,
  frameCount: number,
): VoiceAlignmentActivitySpanV1[] {
  if (!Array.isArray(value)) return [];
  const spans: VoiceAlignmentActivitySpanV1[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const bounds = normalizedBounds(candidate, frameCount, {
      startFrame: 0,
      endFrame: 0,
    });
    if (bounds.endFrame <= bounds.startFrame) continue;
    spans.push({
      ...bounds,
      origin: normalizedOrigin(candidate.origin),
      confidence: normalizedConfidence(candidate.confidence),
    });
  }
  spans.sort(
    (left, right) =>
      left.startFrame - right.startFrame || left.endFrame - right.endFrame,
  );
  return spans;
}

function inferredOpenState(shape: string): boolean {
  return !/^(?:closed|speech-closed|rest|silence)$/iu.test(shape);
}

function normalizedMouthTransitions(
  value: unknown,
  frameCount: number,
): VoiceAlignmentMouthTransitionV1[] {
  if (!Array.isArray(value)) return [];
  const transitions: Array<VoiceAlignmentMouthTransitionV1 & {
    inputIndex: number;
  }> = [];
  for (const [inputIndex, candidate] of value.entries()) {
    if (!isRecord(candidate)) continue;
    const to = nonEmptyString(candidate.to);
    if (!to) continue;
    transitions.push({
      atFrame: clampInteger(candidate.atFrame, 0, frameCount),
      from: nullableString(candidate.from),
      to,
      open:
        typeof candidate.open === "boolean"
          ? candidate.open
          : inferredOpenState(to),
      inputIndex,
    });
  }
  transitions.sort(
    (left, right) =>
      left.atFrame - right.atFrame || left.inputIndex - right.inputIndex,
  );

  // Multiple render writes at one frame have one observable final state.
  const byFrame = new Map<number, VoiceAlignmentMouthTransitionV1>();
  for (const { inputIndex: _inputIndex, ...transition } of transitions) {
    byFrame.set(transition.atFrame, transition);
  }
  return [...byFrame.values()];
}

function mergedIntervals(
  bounds: readonly VoiceAlignmentFrameBoundsV1[],
): VoiceAlignmentFrameBoundsV1[] {
  const sorted = bounds
    .filter((span) => span.endFrame > span.startFrame)
    .map((span) => ({ ...span }))
    .sort(
      (left, right) =>
        left.startFrame - right.startFrame || left.endFrame - right.endFrame,
    );
  const merged: VoiceAlignmentFrameBoundsV1[] = [];
  for (const span of sorted) {
    const previous = merged.at(-1);
    if (!previous || span.startFrame > previous.endFrame) {
      merged.push(span);
    } else {
      previous.endFrame = Math.max(previous.endFrame, span.endFrame);
    }
  }
  return merged;
}

function intervalFrameCount(
  intervals: readonly VoiceAlignmentFrameBoundsV1[],
): number {
  return intervals.reduce(
    (total, span) => total + span.endFrame - span.startFrame,
    0,
  );
}

function intersectIntervals(
  left: readonly VoiceAlignmentFrameBoundsV1[],
  right: readonly VoiceAlignmentFrameBoundsV1[],
): VoiceAlignmentFrameBoundsV1[] {
  const intersections: VoiceAlignmentFrameBoundsV1[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftSpan = left[leftIndex]!;
    const rightSpan = right[rightIndex]!;
    const startFrame = Math.max(leftSpan.startFrame, rightSpan.startFrame);
    const endFrame = Math.min(leftSpan.endFrame, rightSpan.endFrame);
    if (endFrame > startFrame) intersections.push({ startFrame, endFrame });
    if (leftSpan.endFrame <= rightSpan.endFrame) leftIndex += 1;
    else rightIndex += 1;
  }
  return mergedIntervals(intersections);
}

function coversEveryTargetFrame(
  targets: readonly VoiceAlignmentFrameBoundsV1[],
  coverage: readonly VoiceAlignmentFrameBoundsV1[],
): boolean {
  const mergedTargets = mergedIntervals(targets);
  if (mergedTargets.length === 0) return false;
  const coveredTargets = intersectIntervals(
    mergedTargets,
    mergedIntervals(coverage),
  );
  return (
    intervalFrameCount(coveredTargets) === intervalFrameCount(mergedTargets)
  );
}

function mouthOpenIntervals(
  input: Pick<
    VoiceAlignmentMetricsInputV1,
    "frameCount" | "presentation" | "mouthTransitions"
  >,
): VoiceAlignmentFrameBoundsV1[] {
  const presentationStart = Math.max(0, input.presentation.startFrame);
  const presentationEnd = Math.min(
    input.frameCount,
    input.presentation.endFrame,
  );
  if (presentationEnd <= presentationStart) return [];

  const transitions = input.mouthTransitions
    .filter((transition) => transition.atFrame <= presentationEnd)
    .sort((left, right) => left.atFrame - right.atFrame);
  const openIntervals: VoiceAlignmentFrameBoundsV1[] = [];
  let open = false;
  let cursor = presentationStart;
  for (const transition of transitions) {
    if (transition.atFrame <= presentationStart) {
      open = transition.open;
      continue;
    }
    if (open && transition.atFrame > cursor) {
      openIntervals.push({ startFrame: cursor, endFrame: transition.atFrame });
    }
    open = transition.open;
    cursor = transition.atFrame;
  }
  if (open && presentationEnd > cursor) {
    openIntervals.push({ startFrame: cursor, endFrame: presentationEnd });
  }
  return mergedIntervals(openIntervals);
}

function framesToMs(frames: number, sampleRate: number): number {
  const milliseconds = (frames / sampleRate) * 1_000;
  return Math.round(milliseconds * 1_000) / 1_000;
}

export function voiceAlignmentOriginIsAuthoritativeV1(
  origin: VoiceAlignmentOriginV1,
): boolean {
  return AUTHORITATIVE_ORIGINS.has(origin);
}

/**
 * Returns the highest status that span provenance and speech-frame coverage
 * are allowed to claim. Silence never requires phoneme or viseme coverage.
 */
export function deriveVoiceAlignmentStatusV1(
  input: VoiceAlignmentStatusInputV1,
): VoiceAlignmentStatusV1 {
  const characters = input.characterSpans ?? [];
  const phonemes = input.phonemeSpans ?? [];
  const visemes = input.visemeSpans ?? [];
  const speech = input.speechSpans ?? [];
  const all = [...characters, ...phonemes, ...visemes];
  const hasAuthoritativeSpan = all.some((span) =>
    voiceAlignmentOriginIsAuthoritativeV1(span.origin),
  );
  if (!hasAuthoritativeSpan) return "unaligned";

  const everyRequiredSpanIsAuthoritative =
    phonemes.length > 0 &&
    visemes.length > 0 &&
    phonemes.every((span) =>
      voiceAlignmentOriginIsAuthoritativeV1(span.origin),
    ) &&
    visemes.every((span) =>
      voiceAlignmentOriginIsAuthoritativeV1(span.origin),
    ) &&
    coversEveryTargetFrame(speech, phonemes) &&
    coversEveryTargetFrame(speech, visemes);
  return everyRequiredSpanIsAuthoritative ? "aligned" : "partial";
}

/**
 * Measures rendered mouth state against final PCM activity. Deltas are signed
 * in one consistent direction: mouth frame minus audible speech frame.
 */
export function measureVoiceAlignmentTraceV1(
  input: VoiceAlignmentMetricsInputV1,
): VoiceAlignmentMetricsV1 {
  const sampleRate =
    Number.isFinite(input.sampleRate) && input.sampleRate > 0
      ? input.sampleRate
      : DEFAULT_VOICE_ALIGNMENT_SAMPLE_RATE;
  const speech = mergedIntervals(input.speechSpans);
  const silence = mergedIntervals(input.silenceSpans);
  const mouthOpen = mouthOpenIntervals(input);
  const silenceOpen = intersectIntervals(silence, mouthOpen);
  const speechStartFrame = speech[0]?.startFrame ?? null;
  const speechEndFrame = speech.at(-1)?.endFrame ?? null;
  const mouthStartFrame = mouthOpen[0]?.startFrame ?? null;
  const mouthEndFrame = mouthOpen.at(-1)?.endFrame ?? null;
  const onsetDeltaFrames =
    speechStartFrame === null || mouthStartFrame === null
      ? null
      : mouthStartFrame - speechStartFrame;
  const offsetDeltaFrames =
    speechEndFrame === null || mouthEndFrame === null
      ? null
      : mouthEndFrame - speechEndFrame;
  const driftFrames =
    onsetDeltaFrames === null || offsetDeltaFrames === null
      ? null
      : offsetDeltaFrames - onsetDeltaFrames;
  const silenceOpenFrameCount = intervalFrameCount(silenceOpen);

  return {
    speechStartFrame,
    speechEndFrame,
    mouthStartFrame,
    mouthEndFrame,
    onsetDeltaFrames,
    onsetDeltaMs:
      onsetDeltaFrames === null
        ? null
        : framesToMs(onsetDeltaFrames, sampleRate),
    offsetDeltaFrames,
    offsetDeltaMs:
      offsetDeltaFrames === null
        ? null
        : framesToMs(offsetDeltaFrames, sampleRate),
    driftFrames,
    driftMs:
      driftFrames === null ? null : framesToMs(driftFrames, sampleRate),
    speechFrameCount: intervalFrameCount(speech),
    mouthOpenFrameCount: intervalFrameCount(mouthOpen),
    silenceFrameCount: intervalFrameCount(silence),
    silenceOpenFrameCount,
    silenceOpenMs: framesToMs(silenceOpenFrameCount, sampleRate),
    silenceOpenViolationCount: silenceOpen.length,
  };
}

/**
 * Produces a canonical, serializable trace and recomputes derived status and
 * metrics. A caller may deliberately downgrade a trace, but never upgrade it
 * beyond what authoritative phoneme and viseme spans support.
 */
export function normalizeVoiceAlignmentTraceV1(
  value: unknown,
): VoiceAlignmentTraceV1 {
  const input = isRecord(value) ? value : {};
  const inputSampleRate = nonNegativeInteger(input.sampleRate);
  const sampleRate =
    inputSampleRate !== null && inputSampleRate > 0
      ? inputSampleRate
      : DEFAULT_VOICE_ALIGNMENT_SAMPLE_RATE;
  const frameCount = inferFrameCount(input);
  const spokenText =
    typeof input.spokenText === "string" ? input.spokenText : "";
  const sourceLength = Array.from(spokenText).length;
  const characterSpans = normalizedSymbolSpans(
    input.characterSpans,
    "character",
    frameCount,
    sourceLength,
  );
  const phonemeSpans = normalizedSymbolSpans(
    input.phonemeSpans,
    "phoneme",
    frameCount,
    sourceLength,
  );
  const visemeSpans = normalizedSymbolSpans(
    input.visemeSpans,
    "viseme",
    frameCount,
    sourceLength,
  );
  const speechSpans = normalizedActivitySpans(
    input.speechSpans,
    frameCount,
  );
  const silenceSpans = normalizedActivitySpans(
    input.silenceSpans,
    frameCount,
  );
  const mouthTransitions = normalizedMouthTransitions(
    input.mouthTransitions,
    frameCount,
  );
  const speechBounds = mergedIntervals(speechSpans);
  const articulationFallback = speechBounds.length
    ? {
        startFrame: speechBounds[0]!.startFrame,
        endFrame: speechBounds.at(-1)!.endFrame,
      }
    : { startFrame: 0, endFrame: 0 };
  const articulation = normalizedBounds(
    input.articulation,
    frameCount,
    articulationFallback,
  );
  const rawPresentation = normalizedBounds(
    input.presentation,
    frameCount,
    { startFrame: 0, endFrame: frameCount },
  );
  const presentation = {
    startFrame: Math.min(rawPresentation.startFrame, articulation.startFrame),
    endFrame: Math.max(rawPresentation.endFrame, articulation.endFrame),
  };
  const authorityStatus = deriveVoiceAlignmentStatusV1({
    characterSpans,
    phonemeSpans,
    visemeSpans,
    speechSpans,
  });
  const reportedStatus = oneOf(input.alignmentStatus, VOICE_ALIGNMENT_STATUSES_V1)
    ? input.alignmentStatus
    : authorityStatus;
  const alignmentStatus =
    STATUS_RANK[reportedStatus] <= STATUS_RANK[authorityStatus]
      ? reportedStatus
      : authorityStatus;
  const engineInput = isRecord(input.engine) ? input.engine : {};
  const measurementInput: VoiceAlignmentMetricsInputV1 = {
    sampleRate,
    frameCount,
    presentation,
    speechSpans,
    silenceSpans,
    mouthTransitions,
  };

  return {
    v: VOICE_ALIGNMENT_TRACE_VERSION,
    utteranceId: nonEmptyString(input.utteranceId) ?? "unknown",
    surface: oneOf(input.surface, VOICE_ALIGNMENT_SURFACES_V1)
      ? input.surface
      : "unknown",
    engine: {
      requested: nullableString(engineInput.requested),
      resolved: nonEmptyString(engineInput.resolved) ?? "unknown",
      provider: nullableString(engineInput.provider),
      model: nullableString(engineInput.model),
    },
    alignmentStatus,
    alignmentReason: nullableString(input.alignmentReason),
    sourceText: typeof input.sourceText === "string" ? input.sourceText : "",
    spokenText,
    sampleRate,
    frameCount,
    articulation,
    presentation,
    characterSpans,
    phonemeSpans,
    visemeSpans,
    speechSpans,
    silenceSpans,
    mouthTransitions,
    metrics: measureVoiceAlignmentTraceV1(measurementInput),
  };
}

function pushIssue(
  issues: VoiceAlignmentValidationIssueV1[],
  path: string,
  code: VoiceAlignmentValidationIssueCodeV1,
  message: string,
): void {
  issues.push({ path, code, message });
}

function validateStringOrNull(
  issues: VoiceAlignmentValidationIssueV1[],
  value: unknown,
  path: string,
  options: { requiredString?: boolean } = {},
): void {
  if (value === null) {
    if (options.requiredString) {
      pushIssue(issues, path, "required", `${path} must be a non-empty string.`);
    }
    return;
  }
  if (typeof value !== "string") {
    pushIssue(issues, path, "type", `${path} must be a string or null.`);
    return;
  }
  if (options.requiredString && !value.trim()) {
    pushIssue(issues, path, "required", `${path} must be a non-empty string.`);
  }
}

function validateBounds(
  issues: VoiceAlignmentValidationIssueV1[],
  value: unknown,
  path: string,
  frameCount: number | null,
): void {
  if (!isRecord(value)) {
    pushIssue(issues, path, "type", `${path} must be frame bounds.`);
    return;
  }
  const startFrame = nonNegativeInteger(value.startFrame);
  const endFrame = nonNegativeInteger(value.endFrame);
  if (startFrame === null) {
    pushIssue(
      issues,
      `${path}.startFrame`,
      "range",
      `${path}.startFrame must be a non-negative integer.`,
    );
  }
  if (endFrame === null) {
    pushIssue(
      issues,
      `${path}.endFrame`,
      "range",
      `${path}.endFrame must be a non-negative integer.`,
    );
  }
  if (startFrame !== null && endFrame !== null && endFrame < startFrame) {
    pushIssue(
      issues,
      path,
      "order",
      `${path}.endFrame must not precede startFrame.`,
    );
  }
  if (
    frameCount !== null &&
    ((startFrame !== null && startFrame > frameCount) ||
      (endFrame !== null && endFrame > frameCount))
  ) {
    pushIssue(
      issues,
      path,
      "range",
      `${path} must stay within frameCount.`,
    );
  }
}

function validateTimedSpans(
  issues: VoiceAlignmentValidationIssueV1[],
  value: unknown,
  path: string,
  frameCount: number | null,
  symbolKey?: "character" | "phoneme" | "viseme",
): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, path, "type", `${path} must be an array.`);
    return;
  }
  for (const [index, span] of value.entries()) {
    const spanPath = `${path}[${index}]`;
    validateBounds(issues, span, spanPath, frameCount);
    if (!isRecord(span)) continue;
    const spanStartFrame = nonNegativeInteger(span.startFrame);
    const spanEndFrame = nonNegativeInteger(span.endFrame);
    if (
      spanStartFrame !== null &&
      spanEndFrame !== null &&
      spanEndFrame <= spanStartFrame
    ) {
      pushIssue(
        issues,
        spanPath,
        "range",
        `${spanPath} must contain at least one frame.`,
      );
    }
    if (!oneOf(span.origin, VOICE_ALIGNMENT_ORIGINS_V1)) {
      pushIssue(
        issues,
        `${spanPath}.origin`,
        "enum",
        `${spanPath}.origin is not a supported alignment origin.`,
      );
    }
    if (
      span.confidence !== null &&
      (finiteNumber(span.confidence) === null ||
        (span.confidence as number) < 0 ||
        (span.confidence as number) > 1)
    ) {
      pushIssue(
        issues,
        `${spanPath}.confidence`,
        "range",
        `${spanPath}.confidence must be null or between 0 and 1.`,
      );
    }
    if (!symbolKey) continue;
    if (!nonEmptyString(span[symbolKey])) {
      pushIssue(
        issues,
        `${spanPath}.${symbolKey}`,
        "required",
        `${spanPath}.${symbolKey} must be a non-empty string.`,
      );
    }
    const sourceStart = span.sourceStart;
    const sourceEnd = span.sourceEnd;
    const bothNull = sourceStart === null && sourceEnd === null;
    const bothValid =
      nonNegativeInteger(sourceStart) !== null &&
      nonNegativeInteger(sourceEnd) !== null &&
      (sourceEnd as number) >= (sourceStart as number);
    if (!bothNull && !bothValid) {
      pushIssue(
        issues,
        spanPath,
        "range",
        `${spanPath} source offsets must both be null or ordered non-negative integers.`,
      );
    }
  }
}

function validateMouthTransitions(
  issues: VoiceAlignmentValidationIssueV1[],
  value: unknown,
  frameCount: number | null,
): void {
  const path = "mouthTransitions";
  if (!Array.isArray(value)) {
    pushIssue(issues, path, "type", `${path} must be an array.`);
    return;
  }
  let previousFrame = -1;
  for (const [index, transition] of value.entries()) {
    const transitionPath = `${path}[${index}]`;
    if (!isRecord(transition)) {
      pushIssue(
        issues,
        transitionPath,
        "type",
        `${transitionPath} must be an object.`,
      );
      continue;
    }
    const atFrame = nonNegativeInteger(transition.atFrame);
    if (
      atFrame === null ||
      (frameCount !== null && atFrame > frameCount)
    ) {
      pushIssue(
        issues,
        `${transitionPath}.atFrame`,
        "range",
        `${transitionPath}.atFrame must be within frameCount.`,
      );
    } else if (atFrame <= previousFrame) {
      pushIssue(
        issues,
        `${transitionPath}.atFrame`,
        "order",
        "Mouth transitions must use strictly increasing frames.",
      );
    } else {
      previousFrame = atFrame;
    }
    validateStringOrNull(issues, transition.from, `${transitionPath}.from`);
    validateStringOrNull(issues, transition.to, `${transitionPath}.to`, {
      requiredString: true,
    });
    if (typeof transition.open !== "boolean") {
      pushIssue(
        issues,
        `${transitionPath}.open`,
        "type",
        `${transitionPath}.open must be boolean.`,
      );
    }
  }
}

function metricsEqual(
  left: VoiceAlignmentMetricsV1,
  right: VoiceAlignmentMetricsV1,
): boolean {
  for (const key of Object.keys(right) as Array<keyof VoiceAlignmentMetricsV1>) {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) continue;
    if (
      typeof leftValue === "number" &&
      typeof rightValue === "number" &&
      Math.abs(leftValue - rightValue) <= 0.001
    ) {
      continue;
    }
    return false;
  }
  return true;
}

/** Strictly validates a trace without hiding false authority behind defaults. */
export function validateVoiceAlignmentTraceV1(
  value: unknown,
): VoiceAlignmentValidationResultV1 {
  const issues: VoiceAlignmentValidationIssueV1[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [
        {
          path: "$",
          code: "type",
          message: "Voice alignment trace must be an object.",
        },
      ],
      trace: null,
    };
  }

  if (value.v !== VOICE_ALIGNMENT_TRACE_VERSION) {
    pushIssue(issues, "v", "version", "Voice alignment trace version must be 1.");
  }
  validateStringOrNull(issues, value.utteranceId, "utteranceId", {
    requiredString: true,
  });
  if (!oneOf(value.surface, VOICE_ALIGNMENT_SURFACES_V1)) {
    pushIssue(issues, "surface", "enum", "surface is not supported.");
  }
  if (!isRecord(value.engine)) {
    pushIssue(issues, "engine", "type", "engine must be an object.");
  } else {
    validateStringOrNull(issues, value.engine.requested, "engine.requested");
    validateStringOrNull(issues, value.engine.resolved, "engine.resolved", {
      requiredString: true,
    });
    validateStringOrNull(issues, value.engine.provider, "engine.provider");
    validateStringOrNull(issues, value.engine.model, "engine.model");
  }
  if (!oneOf(value.alignmentStatus, VOICE_ALIGNMENT_STATUSES_V1)) {
    pushIssue(
      issues,
      "alignmentStatus",
      "enum",
      "alignmentStatus is not supported.",
    );
  }
  validateStringOrNull(
    issues,
    value.alignmentReason,
    "alignmentReason",
  );
  if (typeof value.sourceText !== "string") {
    pushIssue(issues, "sourceText", "type", "sourceText must be a string.");
  }
  if (typeof value.spokenText !== "string") {
    pushIssue(issues, "spokenText", "type", "spokenText must be a string.");
  }
  const sampleRate = nonNegativeInteger(value.sampleRate);
  if (sampleRate === null || sampleRate === 0) {
    pushIssue(
      issues,
      "sampleRate",
      "range",
      "sampleRate must be a positive integer.",
    );
  }
  const frameCount = nonNegativeInteger(value.frameCount);
  if (frameCount === null) {
    pushIssue(
      issues,
      "frameCount",
      "range",
      "frameCount must be a non-negative integer.",
    );
  }
  validateBounds(issues, value.articulation, "articulation", frameCount);
  validateBounds(issues, value.presentation, "presentation", frameCount);
  if (isRecord(value.articulation) && isRecord(value.presentation)) {
    const articulationStart = nonNegativeInteger(value.articulation.startFrame);
    const articulationEnd = nonNegativeInteger(value.articulation.endFrame);
    const presentationStart = nonNegativeInteger(value.presentation.startFrame);
    const presentationEnd = nonNegativeInteger(value.presentation.endFrame);
    if (
      articulationStart !== null &&
      articulationEnd !== null &&
      presentationStart !== null &&
      presentationEnd !== null &&
      (articulationStart < presentationStart ||
        articulationEnd > presentationEnd)
    ) {
      pushIssue(
        issues,
        "presentation",
        "invariant",
        "presentation must contain articulation bounds.",
      );
    }
  }
  validateTimedSpans(
    issues,
    value.characterSpans,
    "characterSpans",
    frameCount,
    "character",
  );
  validateTimedSpans(
    issues,
    value.phonemeSpans,
    "phonemeSpans",
    frameCount,
    "phoneme",
  );
  validateTimedSpans(
    issues,
    value.visemeSpans,
    "visemeSpans",
    frameCount,
    "viseme",
  );
  validateTimedSpans(
    issues,
    value.speechSpans,
    "speechSpans",
    frameCount,
  );
  validateTimedSpans(
    issues,
    value.silenceSpans,
    "silenceSpans",
    frameCount,
  );
  validateMouthTransitions(issues, value.mouthTransitions, frameCount);

  const normalized = normalizeVoiceAlignmentTraceV1(value);
  if (
    oneOf(value.alignmentStatus, VOICE_ALIGNMENT_STATUSES_V1) &&
    STATUS_RANK[value.alignmentStatus] >
      STATUS_RANK[
        deriveVoiceAlignmentStatusV1({
          characterSpans: normalized.characterSpans,
          phonemeSpans: normalized.phonemeSpans,
          visemeSpans: normalized.visemeSpans,
          speechSpans: normalized.speechSpans,
        })
      ]
  ) {
    pushIssue(
      issues,
      "alignmentStatus",
      "invariant",
      "alignmentStatus exceeds authoritative phoneme/viseme coverage.",
    );
  }
  if (!isRecord(value.metrics)) {
    pushIssue(issues, "metrics", "type", "metrics must be an object.");
  } else if (
    !metricsEqual(
      value.metrics as unknown as VoiceAlignmentMetricsV1,
      normalized.metrics,
    )
  ) {
    pushIssue(
      issues,
      "metrics",
      "metrics",
      "metrics do not match the frame-domain trace.",
    );
  }

  return {
    valid: issues.length === 0,
    issues,
    trace: issues.length === 0 ? normalized : null,
  };
}

/** Canonical JSON export with normalized provenance, status, and metrics. */
export function exportVoiceAlignmentTraceJsonV1(
  value: unknown,
  space = 2,
): string {
  const indentation = Math.min(10, Math.max(0, Math.round(space)));
  return JSON.stringify(
    normalizeVoiceAlignmentTraceV1(value),
    null,
    indentation,
  );
}
