import { voiceSpokenText } from "./voiceSpokenText.ts";

export const VOICE_VOCAL_ACTIONS = [
  "laugh",
  "chuckle",
  "sigh",
  "exhale",
  "gasp",
  "cough",
  "throat-clear",
  "snort",
  "groan",
  "sob",
  "yawn",
] as const;

export type VoiceVocalAction = (typeof VOICE_VOCAL_ACTIONS)[number];

export const VOICE_VOCAL_ACTION_MODIFIERS = [
  "soft",
  "nervous",
  "dry",
  "brief",
  "loud",
  "restrained",
  "relieved",
] as const;

export type VoiceVocalActionModifier =
  (typeof VOICE_VOCAL_ACTION_MODIFIERS)[number];

export interface VoicePerformanceSpeechSegmentV1 {
  kind: "speech";
  text: string;
  sourceStart: number;
  sourceEnd: number;
}

export interface VoicePerformanceVocalActionSegmentV1 {
  kind: "vocal-action";
  action: VoiceVocalAction;
  modifiers: VoiceVocalActionModifier[];
  authoredText: string;
  sourceStart: number;
  sourceEnd: number;
}

export type VoicePerformanceSegmentV1 =
  | VoicePerformanceSpeechSegmentV1
  | VoicePerformanceVocalActionSegmentV1;

/** Presentation-only performance data. It must never replace canonical text. */
export interface VoicePerformancePlanV1 {
  v: 1;
  sourceLength: number;
  spokenText: string;
  segments: VoicePerformanceSegmentV1[];
}

export const VOICE_PERFORMANCE_PLAN_V2 = 2 as const;
export const VOICE_PERFORMANCE_RATE_MIN_V2 = 0.93 as const;
export const VOICE_PERFORMANCE_RATE_MAX_V2 = 1.07 as const;
export const VOICE_PERFORMANCE_HESITATION_CHANCE_V2 = 1 / 3;

export const VOICE_PERFORMANCE_RATE_ENVELOPES_V2 = {
  opening: [1.02, 1.04],
  ordinary: [0.96, 1.04],
  post_hesitation: [1.04, 1.07],
  short_emphasis: [0.93, 0.97],
  long_turn_catch_up: [1.03, 1.06],
} as const;

export type VoicePerformanceRateIntentV2 =
  keyof typeof VOICE_PERFORMANCE_RATE_ENVELOPES_V2;

export interface VoicePerformanceRateKeyframeV2 {
  /** Source-relative progress. Media playback interpolates between keyframes. */
  progress: number;
  /** Pitch-preserving presentation rate. Canonical/source audio is unchanged. */
  rate: number;
  /**
   * Public semantic reason for a newly authored keyframe. Optional so already
   * saved early-V2 plans without the field remain replayable.
   */
  intent?: VoicePerformanceRateIntentV2;
}

export interface VoicePerformanceHesitationV2 {
  kind: "silence" | "filler";
  /** Boundary inside the untouched canonical source string. */
  sourceOffset: number;
  sourceProgress: number;
  durationMs: number;
  /** Public audible caption. Silent hesitations deliberately carry no text. */
  caption: "uh" | "um" | "uhh" | null;
}

export interface VoicePerformanceSpeechSegmentV2 {
  kind: "speech";
  text: string;
  sourceStart: number;
  sourceEnd: number;
}

export interface VoicePerformanceSilentPauseSegmentV2 {
  kind: "silent-pause";
  sourceOffset: number;
  durationMs: number;
}

export interface VoicePerformanceFillerSegmentV2 {
  kind: "filler";
  text: Exclude<VoicePerformanceHesitationV2["caption"], null>;
  sourceOffset: number;
  durationMs: number;
}

/** V1 authored vocal actions remain valid inside the V2 segment sequence. */
export type VoicePerformanceVocalActionSegmentV2 =
  VoicePerformanceVocalActionSegmentV1;

export type VoicePerformanceSegmentV2 =
  | VoicePerformanceSpeechSegmentV2
  | VoicePerformanceSilentPauseSegmentV2
  | VoicePerformanceFillerSegmentV2
  | VoicePerformanceVocalActionSegmentV2;

/**
 * Signal-only presentation metadata. V1 remains the authored vocal-action
 * contract; V2 adds deterministic cadence without changing canonical text.
 */
export interface VoicePerformancePlanV2 {
  v: typeof VOICE_PERFORMANCE_PLAN_V2;
  name: "voicePerformance";
  provenance: "signal_organic_presentation";
  canonicalImpact: "none";
  messageId: string;
  seed: string;
  sourceLength: number;
  segments: VoicePerformanceSegmentV2[];
  rateKeyframes: VoicePerformanceRateKeyframeV2[];
  hesitation: VoicePerformanceHesitationV2 | null;
}

export type SignalVoicePerformanceExclusionV2 =
  | "not_signal_bot_pair"
  | "opening_or_closing"
  | "canonical_silence"
  | "producer_or_power_precedence"
  | "unsafe_source";

function performanceStableUnit(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function boundedPerformanceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 160);
  return normalized || null;
}

function signalQuotedSourceRanges(source: string): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  let straightQuoteStart: number | null = null;
  let smartQuoteStart: number | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (straightQuoteStart === null) straightQuoteStart = index;
      else {
        ranges.push([straightQuoteStart, index + 1]);
        straightQuoteStart = null;
      }
    } else if (character === "“") {
      smartQuoteStart = index;
    } else if (character === "”" && smartQuoteStart !== null) {
      ranges.push([smartQuoteStart, index + 1]);
      smartQuoteStart = null;
    }
  }
  if (straightQuoteStart !== null) ranges.push([straightQuoteStart, source.length]);
  if (smartQuoteStart !== null) ranges.push([smartQuoteStart, source.length]);
  return ranges;
}

function safeSignalHesitationBoundaries(
  source: string,
  protectedSourceRanges: readonly (readonly [number, number])[] = [],
): number[] {
  const boundaries = new Set<number>();
  const protectedRanges = [
    ...signalQuotedSourceRanges(source),
    ...protectedSourceRanges,
  ];
  for (const match of source.matchAll(/[,;:]\s+|\s+[—–-]\s+|[.!?]\s+/gu)) {
    const offset = (match.index ?? 0) + match[0].length;
    const progress = offset / Math.max(1, source.length);
    const protectedBoundary = protectedRanges.some(
      ([start, end]) => offset > start && offset < end,
    );
    if (
      progress >= 0.22 &&
      progress <= 0.78 &&
      !protectedBoundary
    ) boundaries.add(offset);
  }
  return [...boundaries].sort((left, right) => left - right);
}

export function signalVoicePerformanceSourceIsSafeV2(source: string): boolean {
  const normalized = source.replace(/\s+/gu, " ").trim();
  return (
    normalized.length >= 48 &&
    normalized.length <= 2_400 &&
    !/https?:\/\/|www\.|\b\S+@\S+\.\S+\b|```|\[[^\]]+\]\([^\)]+\)/iu.test(
      normalized,
    ) &&
    safeSignalHesitationBoundaries(normalized).length > 0
  );
}

function signalPerformanceSegmentsV2(
  source: string,
  hesitation: VoicePerformanceHesitationV2 | null,
): VoicePerformanceSegmentV2[] {
  if (!hesitation) {
    return [{ kind: "speech", text: source, sourceStart: 0, sourceEnd: source.length }];
  }
  const before = source.slice(0, hesitation.sourceOffset);
  const after = source.slice(hesitation.sourceOffset);
  return [
    ...(before
      ? [{
          kind: "speech" as const,
          text: before,
          sourceStart: 0,
          sourceEnd: hesitation.sourceOffset,
        }]
      : []),
    hesitation.kind === "silence"
      ? {
          kind: "silent-pause" as const,
          sourceOffset: hesitation.sourceOffset,
          durationMs: hesitation.durationMs,
        }
      : {
          kind: "filler" as const,
          text: hesitation.caption!,
          sourceOffset: hesitation.sourceOffset,
          durationMs: hesitation.durationMs,
        },
    ...(after
      ? [{
          kind: "speech" as const,
          text: after,
          sourceStart: hesitation.sourceOffset,
          sourceEnd: source.length,
        }]
      : []),
  ];
}

function signalPerformanceRate(
  seed: string,
  envelope: readonly [number, number],
): number {
  const [minimum, maximum] = envelope;
  const rate = minimum + performanceStableUnit(seed) * (maximum - minimum);
  return Number(rate.toFixed(3));
}

function signalShortEmphasisProgress(
  source: string,
  boundaries: readonly number[],
  seed: string,
): number | null {
  let priorOffset = 0;
  const candidates: number[] = [];
  for (const offset of boundaries) {
    const phrase = source.slice(priorOffset, offset).trim();
    const wordCount = phrase.split(/\s+/u).filter(Boolean).length;
    const progress = ((priorOffset + offset) / 2) / source.length;
    if (wordCount >= 2 && wordCount <= 8 && progress >= 0.24 && progress <= 0.72) {
      candidates.push(progress);
    }
    priorOffset = offset;
  }
  if (candidates.length === 0) return null;
  return candidates[
    Math.floor(performanceStableUnit(`${seed}:short-emphasis`) * candidates.length) %
      candidates.length
  ] ?? null;
}

function signalPerformanceKeyframesV2(args: {
  source: string;
  seed: string;
  boundaries: readonly number[];
  hesitation: VoicePerformanceHesitationV2 | null;
}): VoicePerformanceRateKeyframeV2[] {
  const frames: VoicePerformanceRateKeyframeV2[] = [
    {
      progress: 0,
      rate: signalPerformanceRate(
        `${args.seed}:rate:opening`,
        VOICE_PERFORMANCE_RATE_ENVELOPES_V2.opening,
      ),
      intent: "opening",
    },
    {
      progress: 0.18,
      rate: signalPerformanceRate(
        `${args.seed}:rate:ordinary:opening-release`,
        VOICE_PERFORMANCE_RATE_ENVELOPES_V2.ordinary,
      ),
      intent: "ordinary",
    },
  ];
  const emphasisProgress = signalShortEmphasisProgress(
    args.source,
    args.boundaries,
    args.seed,
  );
  if (emphasisProgress !== null) {
    frames.push({
      progress: Number(emphasisProgress.toFixed(4)),
      rate: signalPerformanceRate(
        `${args.seed}:rate:short-emphasis`,
        VOICE_PERFORMANCE_RATE_ENVELOPES_V2.short_emphasis,
      ),
      intent: "short_emphasis",
    });
  }
  if (args.hesitation) {
    frames.push({
      progress: Number(
        Math.min(0.88, args.hesitation.sourceProgress + 0.012).toFixed(4),
      ),
      rate: signalPerformanceRate(
        `${args.seed}:rate:post-hesitation`,
        VOICE_PERFORMANCE_RATE_ENVELOPES_V2.post_hesitation,
      ),
      intent: "post_hesitation",
    });
  }
  const wordCount = args.source.split(/\s+/u).filter(Boolean).length;
  const longTurn = wordCount >= 40 || args.source.length >= 300;
  if (longTurn) {
    const catchUpProgress = Math.min(
      0.9,
      Math.max(0.78, (args.hesitation?.sourceProgress ?? 0) + 0.1),
    );
    frames.push({
      progress: Number(catchUpProgress.toFixed(4)),
      rate: signalPerformanceRate(
        `${args.seed}:rate:long-turn-catch-up`,
        VOICE_PERFORMANCE_RATE_ENVELOPES_V2.long_turn_catch_up,
      ),
      intent: "long_turn_catch_up",
    });
  }
  frames.push({
    progress: 1,
    rate: signalPerformanceRate(
      `${args.seed}:rate:${longTurn ? "long-turn-finish" : "ordinary-finish"}`,
      longTurn
        ? VOICE_PERFORMANCE_RATE_ENVELOPES_V2.long_turn_catch_up
        : VOICE_PERFORMANCE_RATE_ENVELOPES_V2.ordinary,
    ),
    intent: longTurn ? "long_turn_catch_up" : "ordinary",
  });
  frames.sort((left, right) => left.progress - right.progress);
  return frames.filter(
    (frame, index) =>
      index === 0 || frame.progress - frames[index - 1]!.progress >= 0.008,
  );
}

/** Build the deterministic public plan only after Producer/Power exclusions. */
export function buildSignalVoicePerformancePlanV2(args: {
  messageId: string;
  seed: string;
  canonicalText: string;
  /** Source ranges protected by pronunciation or exact-quotation contracts. */
  protectedSourceRanges?: readonly (readonly [number, number])[];
  exclusion?: SignalVoicePerformanceExclusionV2 | null;
}): VoicePerformancePlanV2 | null {
  const messageId = boundedPerformanceId(args.messageId);
  const seed = boundedPerformanceId(args.seed);
  const source = args.canonicalText.replace(/\s+/gu, " ").trim();
  if (
    !messageId ||
    !seed ||
    args.exclusion ||
    !signalVoicePerformanceSourceIsSafeV2(source)
  ) {
    return null;
  }
  const boundaries = safeSignalHesitationBoundaries(
    source,
    args.protectedSourceRanges,
  );
  const hesitationEligible =
    boundaries.length > 0 &&
    performanceStableUnit(`${seed}:hesitation`) <
    VOICE_PERFORMANCE_HESITATION_CHANCE_V2;
  const sourceOffset = hesitationEligible
    ? boundaries[
        Math.floor(
          performanceStableUnit(`${seed}:boundary`) * boundaries.length,
        ) % boundaries.length
      ]!
    : 0;
  const filler = performanceStableUnit(`${seed}:hesitation-kind`) >= 0.75;
  const fillerRoll = performanceStableUnit(`${seed}:filler`);
  const caption = filler
    ? fillerRoll < 0.42
      ? "uh"
      : fillerRoll < 0.84
        ? "um"
        : "uhh"
    : null;
  const hesitation: VoicePerformanceHesitationV2 | null = hesitationEligible
    ? {
        kind: filler ? "filler" : "silence",
        sourceOffset,
        sourceProgress: Number((sourceOffset / source.length).toFixed(4)),
        durationMs: filler
          ? 180 + Math.floor(performanceStableUnit(`${seed}:filler-ms`) * 121)
          : 220 + Math.floor(performanceStableUnit(`${seed}:silence-ms`) * 181),
        caption,
      }
    : null;
  return {
    v: VOICE_PERFORMANCE_PLAN_V2,
    name: "voicePerformance",
    provenance: "signal_organic_presentation",
    canonicalImpact: "none",
    messageId,
    seed,
    sourceLength: source.length,
    segments: signalPerformanceSegmentsV2(source, hesitation),
    rateKeyframes: signalPerformanceKeyframesV2({
      source,
      seed,
      boundaries,
      hesitation,
    }),
    hesitation,
  };
}

function normalizeVoicePerformanceSegmentsV2(
  value: unknown,
  sourceLength: number,
): VoicePerformanceSegmentV2[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    return null;
  }
  const actions = new Set<string>(VOICE_VOCAL_ACTIONS);
  const modifiers = new Set<string>(VOICE_VOCAL_ACTION_MODIFIERS);
  const segments: VoicePerformanceSegmentV2[] = [];
  let sourceCursor = 0;
  let insertedSegmentCount = 0;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }
    const row = candidate as Record<string, unknown>;
    if (row.kind === "speech") {
      const text = typeof row.text === "string" ? row.text : null;
      const sourceStart = Number(row.sourceStart);
      const sourceEnd = Number(row.sourceEnd);
      if (
        text === null ||
        !Number.isInteger(sourceStart) ||
        !Number.isInteger(sourceEnd) ||
        sourceStart !== sourceCursor ||
        sourceEnd <= sourceStart ||
        sourceEnd > sourceLength ||
        text.length !== sourceEnd - sourceStart
      ) return null;
      segments.push({ kind: "speech", text, sourceStart, sourceEnd });
      sourceCursor = sourceEnd;
      continue;
    }
    if (row.kind === "silent-pause" || row.kind === "filler") {
      const sourceOffset = Number(row.sourceOffset);
      const durationMs = Number(row.durationMs);
      if (
        insertedSegmentCount > 0 ||
        !Number.isInteger(sourceOffset) ||
        sourceOffset !== sourceCursor ||
        sourceOffset < 1 ||
        sourceOffset >= sourceLength ||
        !Number.isInteger(durationMs) ||
        durationMs < 160 ||
        durationMs > 450
      ) return null;
      insertedSegmentCount += 1;
      if (row.kind === "silent-pause") {
        segments.push({ kind: "silent-pause", sourceOffset, durationMs });
      } else {
        if (row.text !== "uh" && row.text !== "um" && row.text !== "uhh") {
          return null;
        }
        segments.push({
          kind: "filler",
          text: row.text,
          sourceOffset,
          durationMs,
        });
      }
      continue;
    }
    if (row.kind === "vocal-action") {
      const sourceStart = Number(row.sourceStart);
      const sourceEnd = Number(row.sourceEnd);
      const action = typeof row.action === "string" && actions.has(row.action)
        ? row.action as VoiceVocalAction
        : null;
      const authoredText = typeof row.authoredText === "string"
        ? row.authoredText.trim().slice(0, 240)
        : "";
      const normalizedModifiers = Array.isArray(row.modifiers)
        ? row.modifiers.filter(
            (entry): entry is VoiceVocalActionModifier =>
              typeof entry === "string" && modifiers.has(entry),
          )
        : [];
      if (
        !action ||
        !authoredText ||
        normalizedModifiers.length !== (row.modifiers as unknown[])?.length ||
        !Number.isInteger(sourceStart) ||
        !Number.isInteger(sourceEnd) ||
        sourceStart !== sourceCursor ||
        sourceEnd <= sourceStart ||
        sourceEnd > sourceLength
      ) return null;
      segments.push({
        kind: "vocal-action",
        action,
        modifiers: normalizedModifiers,
        authoredText,
        sourceStart,
        sourceEnd,
      });
      sourceCursor = sourceEnd;
      continue;
    }
    return null;
  }
  return sourceCursor === sourceLength ? segments : null;
}

export function normalizeVoicePerformancePlanV2(
  value: unknown,
): VoicePerformancePlanV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const messageId = boundedPerformanceId(row.messageId);
  const seed = boundedPerformanceId(row.seed);
  const sourceLength = Number(row.sourceLength);
  if (
    row.v !== VOICE_PERFORMANCE_PLAN_V2 ||
    row.name !== "voicePerformance" ||
    row.provenance !== "signal_organic_presentation" ||
    row.canonicalImpact !== "none" ||
    !messageId ||
    !seed ||
    !Number.isInteger(sourceLength) ||
    sourceLength < 1 ||
    sourceLength > 2_400 ||
    !Array.isArray(row.rateKeyframes) ||
    row.rateKeyframes.length < 2 ||
    row.rateKeyframes.length > 7
  ) {
    return null;
  }
  const rateKeyframes: VoicePerformanceRateKeyframeV2[] = [];
  let previousProgress = -1;
  for (const candidate of row.rateKeyframes) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }
    const keyframe = candidate as Record<string, unknown>;
    const progress = Number(keyframe.progress);
    const rate = Number(keyframe.rate);
    const intent = typeof keyframe.intent === "string" &&
        Object.prototype.hasOwnProperty.call(
          VOICE_PERFORMANCE_RATE_ENVELOPES_V2,
          keyframe.intent,
        )
      ? keyframe.intent as VoicePerformanceRateIntentV2
      : undefined;
    if (
      !Number.isFinite(progress) ||
      progress < 0 ||
      progress > 1 ||
      progress <= previousProgress ||
      !Number.isFinite(rate) ||
      rate < VOICE_PERFORMANCE_RATE_MIN_V2 ||
      rate > VOICE_PERFORMANCE_RATE_MAX_V2 ||
      (keyframe.intent !== undefined && !intent)
    ) {
      return null;
    }
    previousProgress = progress;
    rateKeyframes.push({
      progress: Number(progress.toFixed(4)),
      rate: Number(rate.toFixed(3)),
      ...(intent ? { intent } : {}),
    });
  }
  if (
    rateKeyframes[0]?.progress !== 0 ||
    rateKeyframes.at(-1)?.progress !== 1
  ) {
    return null;
  }
  let hesitation: VoicePerformanceHesitationV2 | null = null;
  if (row.hesitation !== null && row.hesitation !== undefined) {
    if (
      !row.hesitation ||
      typeof row.hesitation !== "object" ||
      Array.isArray(row.hesitation)
    ) {
      return null;
    }
    const candidate = row.hesitation as Record<string, unknown>;
    const kind = candidate.kind;
    const sourceOffset = Number(candidate.sourceOffset);
    const sourceProgress = Number(candidate.sourceProgress);
    const durationMs = Number(candidate.durationMs);
    const caption = candidate.caption;
    if (
      (kind !== "silence" && kind !== "filler") ||
      !Number.isInteger(sourceOffset) ||
      sourceOffset < 1 ||
      sourceOffset >= sourceLength ||
      !Number.isFinite(sourceProgress) ||
      sourceProgress < 0.2 ||
      sourceProgress > 0.8 ||
      !Number.isInteger(durationMs) ||
      durationMs < 160 ||
      durationMs > 450 ||
      (kind === "silence"
        ? caption !== null
        : caption !== "uh" && caption !== "um" && caption !== "uhh")
    ) {
      return null;
    }
    hesitation = {
      kind,
      sourceOffset,
      sourceProgress: Number(sourceProgress.toFixed(4)),
      durationMs,
      caption: caption as VoicePerformanceHesitationV2["caption"],
    };
  }
  const segments = normalizeVoicePerformanceSegmentsV2(
    row.segments,
    sourceLength,
  );
  const insertedSegment = segments?.find(
    (segment) => segment.kind === "silent-pause" || segment.kind === "filler",
  );
  if (
    !segments ||
    (hesitation === null) !== (insertedSegment === undefined) ||
    (hesitation && insertedSegment &&
      (insertedSegment.sourceOffset !== hesitation.sourceOffset ||
        insertedSegment.durationMs !== hesitation.durationMs ||
        (hesitation.kind === "silence"
          ? insertedSegment.kind !== "silent-pause"
          : insertedSegment.kind !== "filler" ||
            insertedSegment.text !== hesitation.caption)))
  ) return null;
  return {
    v: VOICE_PERFORMANCE_PLAN_V2,
    name: "voicePerformance",
    provenance: "signal_organic_presentation",
    canonicalImpact: "none",
    messageId,
    seed,
    sourceLength,
    segments,
    rateKeyframes,
    hesitation,
  };
}

export function voicePerformanceRateAtProgressV2(
  plan: Pick<VoicePerformancePlanV2, "rateKeyframes">,
  progress: number,
): number {
  const keyframes = plan.rateKeyframes;
  const clamped = Math.max(0, Math.min(1, progress));
  const rightIndex = keyframes.findIndex((entry) => entry.progress >= clamped);
  if (rightIndex <= 0) return keyframes[0]?.rate ?? 1;
  const right = keyframes[rightIndex] ?? keyframes.at(-1)!;
  const left = keyframes[rightIndex - 1] ?? right;
  const span = Math.max(0.0001, right.progress - left.progress);
  const ratio = (clamped - left.progress) / span;
  return Number((left.rate + (right.rate - left.rate) * ratio).toFixed(3));
}

/** Audio-only source projection; callers must retain the canonical message. */
export function voicePerformanceSynthesisTextV2(
  canonicalText: string,
  plan: VoicePerformancePlanV2 | null | undefined,
): string {
  const source = canonicalText.replace(/\s+/gu, " ").trim();
  const normalized = normalizeVoicePerformancePlanV2(plan);
  const hesitation = normalized?.hesitation;
  if (
    !normalized ||
    normalized.sourceLength !== source.length ||
    !hesitation ||
    hesitation.kind !== "filler" ||
    !hesitation.caption
  ) {
    return source;
  }
  const before = source.slice(0, hesitation.sourceOffset).trimEnd();
  const after = source.slice(hesitation.sourceOffset).trimStart();
  return `${before} ${hesitation.caption}, ${after}`.replace(/\s+/gu, " ").trim();
}

const MARKED_ACTION_PATTERN =
  /(\*{1,3})([^*\r\n]{1,240})\1|(?<![\\[])(\[)([^\[\]\r\n]{1,240})\](?!\])(?!\s*\()/gu;

const MODIFIER_ALIASES = new Map<string, VoiceVocalActionModifier>([
  ["soft", "soft"],
  ["softly", "soft"],
  ["quiet", "soft"],
  ["quietly", "soft"],
  ["nervous", "nervous"],
  ["nervously", "nervous"],
  ["dry", "dry"],
  ["dryly", "dry"],
  ["brief", "brief"],
  ["briefly", "brief"],
  ["quick", "brief"],
  ["quickly", "brief"],
  ["loud", "loud"],
  ["loudly", "loud"],
  ["hard", "loud"],
  ["uncontrollably", "loud"],
  ["uproariously", "loud"],
  ["hysterically", "loud"],
  ["heartily", "loud"],
  ["restrained", "restrained"],
  ["restrainedly", "restrained"],
  ["relieved", "relieved"],
  ["with relief", "relieved"],
]);

const ACTION_ALIASES: readonly (readonly [RegExp, VoiceVocalAction])[] = [
  [/^(?:(?:burst|bursts|bursting) out )?(?:lol|laugh|laughs|laughing|laughter)$/u, "laugh"],
  [/^(?:chuckle|chuckles|chuckling|giggle|giggles|giggling|snicker|snickers|snickering)$/u, "chuckle"],
  [/^(?:sigh|sighs|sighing)$/u, "sigh"],
  [
    /^(?:exhale|exhales|exhaling|breath|breaths|breathe|breathes|breathing|breathes? out|takes? (?:a )?breath)$/u,
    "exhale",
  ],
  [/^(?:gasp|gasps|gasping)$/u, "gasp"],
  [/^(?:cough|coughs|coughing|hack|hacks|hacking)$/u, "cough"],
  [/^(?:ahem|ahems|clears? (?:the |his |her |their |its )?throat|clearing (?:the |his |her |their |its )?throat)$/u, "throat-clear"],
  [/^(?:snort|snorts|snorting)$/u, "snort"],
  [/^(?:groan|groans|groaning|moan|moans|moaning)$/u, "groan"],
  [/^(?:sob|sobs|sobbing|whimper|whimpers|whimpering)$/u, "sob"],
  [/^(?:yawn|yawns|yawning)$/u, "yawn"],
];

function normalizeActionWords(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[.,!?…]+$/gu, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Resolves only an explicitly marked, tightly controlled vocal action. */
export function voiceVocalActionFromMarkedText(
  value: unknown,
): Pick<VoicePerformanceVocalActionSegmentV1, "action" | "modifiers"> | null {
  if (typeof value !== "string") return null;
  let actionText = normalizeActionWords(value);
  if (!actionText) return null;

  const modifiers: VoiceVocalActionModifier[] = [];
  for (const [alias, modifier] of MODIFIER_ALIASES) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern = new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "gu");
    if (!pattern.test(actionText)) continue;
    actionText = actionText.replace(pattern, " ").replace(/\s+/gu, " ").trim();
    if (!modifiers.includes(modifier)) modifiers.push(modifier);
  }

  const action = ACTION_ALIASES.find(([pattern]) => pattern.test(actionText))?.[1];
  return action ? { action, modifiers } : null;
}

function appendSpeechSegment(
  segments: VoicePerformanceSegmentV1[],
  source: string,
  sourceStart: number,
  sourceEnd: number,
): void {
  if (sourceEnd <= sourceStart) return;
  const text = voiceSpokenText(source.slice(sourceStart, sourceEnd));
  if (!text) return;
  segments.push({ kind: "speech", text, sourceStart, sourceEnd });
}

/**
 * Splits authored text into ordered speech and cached vocal-action segments.
 * Source ranges always refer to the untouched canonical string.
 */
export function voicePerformancePlanFromText(value: unknown): VoicePerformancePlanV1 {
  const source = typeof value === "string" ? value : "";
  const segments: VoicePerformanceSegmentV1[] = [];
  let speechStart = 0;

  for (const match of source.matchAll(MARKED_ACTION_PATTERN)) {
    const authoredText = match[2] ?? match[4] ?? "";
    const resolved = voiceVocalActionFromMarkedText(authoredText);
    if (!resolved || match.index === undefined) continue;
    appendSpeechSegment(segments, source, speechStart, match.index);
    segments.push({
      kind: "vocal-action",
      ...resolved,
      authoredText,
      sourceStart: match.index,
      sourceEnd: match.index + match[0].length,
    });
    speechStart = match.index + match[0].length;
  }

  appendSpeechSegment(segments, source, speechStart, source.length);
  return {
    v: 1,
    sourceLength: source.length,
    spokenText: voiceSpokenText(source),
    segments,
  };
}
