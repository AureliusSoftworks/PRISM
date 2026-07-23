import type { ProviderMessage } from "./providers.ts";

export const ZEN_PROGRESSIVE_FIRST_BEAT_MAX_TOKENS = 220;
export const ZEN_PROGRESSIVE_CONTINUATION_BEAT_MAX_TOKENS = 280;
export const ZEN_PROGRESSIVE_MIN_CONTINUATION_TOKENS = 120;
export const ZEN_PROGRESSIVE_MAX_BEATS = 6;

export interface ZenProgressiveBeat {
  speech: string;
  continue: boolean;
  remainingPlan: string;
}

export const ZEN_PROGRESSIVE_BEAT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    speech: { type: "string" },
    continue: { type: "boolean" },
    remainingPlan: { type: "string" },
  },
  required: ["speech", "continue", "remainingPlan"],
} as const;

const FIRST_BEAT_INSTRUCTION = [
  "Deliver this Zen reply as a sequence of natural spoken beats.",
  "Return JSON only with speech, continue, and remainingPlan.",
  "speech must be the first self-contained conversational beat: complete sentences, no more than about 100 spoken words, and no reference to parts, segments, continuation, or these instructions.",
  "continue is true only when meaningful substance still remains. Do not create filler merely to continue.",
  "remainingPlan is a private compact plan for what remains, at most 320 characters. Use an empty string when continue is false.",
  "Do not call Prism tools, request web search, generate images, emit XML/tool framing, or wrap the JSON in Markdown.",
].join("\n");

export function buildZenProgressiveFirstBeatMessages(
  promptMessages: readonly ProviderMessage[],
): ProviderMessage[] {
  return [
    ...promptMessages,
    { role: "system", content: FIRST_BEAT_INSTRUCTION },
  ];
}

export function buildZenProgressiveContinuationMessages(args: {
  promptMessages: readonly ProviderMessage[];
  spokenText: string;
  remainingPlan: string;
  beatIndex: number;
}): ProviderMessage[] {
  return [
    ...args.promptMessages,
    {
      role: "assistant",
      content: args.spokenText,
    },
    {
      role: "system",
      content: [
        `Continue the same Zen reply with spoken beat ${args.beatIndex + 1}.`,
        "Return JSON only with speech, continue, and remainingPlan.",
        "Write one self-contained continuation of no more than about 140 spoken words.",
        "Continue directly from what was already spoken. Do not recap, restart, repeat phrases, add headings, or mention parts or continuation.",
        "Preserve the same voice, position, and answer. End on a natural sentence boundary.",
        "Set continue true only when meaningful substance still remains. Do not create filler.",
        "Keep remainingPlan private and under 320 characters; use an empty string when done.",
        "Do not call Prism tools or emit Markdown fences.",
        `Private remaining plan: ${args.remainingPlan || "Finish the answer naturally."}`,
      ].join("\n"),
    },
  ];
}

function unwrapJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return match?.[1]?.trim() ?? trimmed;
}

function compactSpeech(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, 4_000);
}

function compactPlan(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/gu, " ").trim().slice(0, 320);
}

export function parseZenProgressiveBeat(raw: string): ZenProgressiveBeat | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJsonFence(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const speech = compactSpeech(record.speech);
  if (!speech || typeof record.continue !== "boolean") return null;
  const remainingPlan = compactPlan(record.remainingPlan);
  return {
    speech,
    continue: record.continue && remainingPlan.length > 0,
    remainingPlan,
  };
}

export function joinZenProgressiveSpeech(
  beats: readonly Pick<ZenProgressiveBeat, "speech">[],
): string {
  return beats
    .map((beat) => beat.speech.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function zenProgressiveBeatLimit(maxTokens: number | undefined): number {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens)) {
    return ZEN_PROGRESSIVE_MAX_BEATS;
  }
  const safeBudget = Math.max(1, Math.round(maxTokens));
  const continuationBudget = Math.max(
    0,
    safeBudget - ZEN_PROGRESSIVE_FIRST_BEAT_MAX_TOKENS,
  );
  const fullContinuationBeats = Math.floor(
    continuationBudget / ZEN_PROGRESSIVE_CONTINUATION_BEAT_MAX_TOKENS,
  );
  const trailingTokens =
    continuationBudget % ZEN_PROGRESSIVE_CONTINUATION_BEAT_MAX_TOKENS;
  return Math.max(
    1,
    Math.min(
      ZEN_PROGRESSIVE_MAX_BEATS,
      1 +
        fullContinuationBeats +
        (trailingTokens >= ZEN_PROGRESSIVE_MIN_CONTINUATION_TOKENS ? 1 : 0),
    ),
  );
}

export function zenProgressiveContinuationTokenBudget(
  maxTokens: number | undefined,
  segmentIndex: number,
): number {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens)) {
    return ZEN_PROGRESSIVE_CONTINUATION_BEAT_MAX_TOKENS;
  }
  const tokensBeforeSegment =
    ZEN_PROGRESSIVE_FIRST_BEAT_MAX_TOKENS +
    Math.max(0, Math.round(segmentIndex) - 1) *
      ZEN_PROGRESSIVE_CONTINUATION_BEAT_MAX_TOKENS;
  return Math.max(
    1,
    Math.min(
      ZEN_PROGRESSIVE_CONTINUATION_BEAT_MAX_TOKENS,
      Math.round(maxTokens) - tokensBeforeSegment,
    ),
  );
}
