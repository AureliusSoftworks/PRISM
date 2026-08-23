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
