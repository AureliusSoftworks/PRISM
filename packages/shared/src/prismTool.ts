/**
 * Inline assistant tool payloads (e.g. AskQuestion chips) appended after prose.
 *
 * Mirrors the BOT_META sentinel pattern: delimited blocks the server strips so
 * `messages.content` stays human-readable while structured UI state lives in
 * `tool_payload` (and is re-attached at read time as `chatMessage.askQuestion`).
 */

export const PRISM_TOOL_START = "<<<PRISM_TOOL>>>";
export const PRISM_TOOL_END = "<<<END_PRISM_TOOL>>>";

// Models often interpolate spaces or odd breaks; anchored patterns keep false positives unlikely.
const PRISM_TOOL_START_PATTERN = /<<<\s*PRISM\s*_?\s*TOOL\s*>>>/gi;
const PRISM_TOOL_END_PATTERN = /<<<\s*END\s*_?\s*PRISM\s*_?\s*TOOL\s*>>>/gi;

export interface AskQuestionOption {
  id: string;
  label: string;
}

export interface AskQuestionPayload {
  v: 1;
  name: "AskQuestion";
  prompt: string;
  options: AskQuestionOption[];
}

export type StoredMoodKey = "joyful" | "warm" | "neutral" | "guarded" | "strained";

export interface StoredAssistantMoodPayload {
  key: StoredMoodKey;
  confidence?: number;
}

export interface StoredAssistantToolEnvelope {
  v: 1;
  askQuestion?: AskQuestionPayload;
  mood?: StoredAssistantMoodPayload;
}

/** Narrow storage shape for SQLite `messages.tool_payload` rows. */
export type StoredAssistantToolPayload = AskQuestionPayload | StoredAssistantToolEnvelope;

export interface ParsedAssistantTurn {
  /** Text shown in the transcript and fed back into the LLM prompt. */
  displayContent: string;
  /** Parsed AskQuestion when the envelope was valid and complete. */
  askQuestion?: AskQuestionPayload;
}

export interface ParsedStoredAssistantToolPayload {
  askQuestion?: AskQuestionPayload;
  moodKey?: StoredMoodKey;
  moodConfidence?: number;
}

/// Many models wrap the envelope in a markdown fence; raw fences make JSON.parse fail
/// while delimiters still match—prose strips but AskQuestion drops (empty chip rail).
function stripMarkdownFences(blob: string): string {
  let s = blob.trim();
  if (!s.startsWith("```")) return s;

  const firstLineBreak = s.indexOf("\n");
  if (firstLineBreak === -1) {
    return s.replace(/^```[a-zA-Z0-9]*\s*/, "").replace(/```$/, "").trim();
  }
  s = s.slice(firstLineBreak + 1);
  const fenceClose = s.lastIndexOf("```");
  if (fenceClose !== -1) {
    s = s.slice(0, fenceClose);
  }
  return s.trim();
}

function normalizeAskQuestionEnvelope(parsed: unknown): AskQuestionPayload | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const row = parsed as Record<string, unknown>;
  const parsedVersion =
    typeof row.v === "number"
      ? row.v
      : typeof row.v === "string"
        ? Number(row.v.trim())
        : Number.NaN;
  if (!Number.isNaN(parsedVersion) && parsedVersion !== 1) return undefined;

  const rawName = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
  if (rawName && rawName !== "askquestion") return undefined;

  const prompt = [
    row.prompt,
    row.question,
    row.title,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
  if (!prompt) return undefined;
  if (!Array.isArray(row.options)) return undefined;

  const labels = row.options
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const opt = item as Record<string, unknown>;
      if (typeof opt.label === "string") return opt.label.trim();
      if (typeof opt.text === "string") return opt.text.trim();
      if (typeof opt.title === "string") return opt.title.trim();
      if (typeof opt.value === "string") return opt.value.trim();
      return "";
    })
    .filter((label) => label.length > 0);

  // Keep UX deterministic: PRISM chips always expect 3 options.
  if (labels.length < 3) return undefined;

  return {
    v: 1,
    name: "AskQuestion",
    prompt,
    options: [
      { id: "a", label: labels[0]! },
      { id: "b", label: labels[1]! },
      { id: "c", label: labels[2]! },
    ],
  };
}

/** Locate the last Prism tool opener; prefers flexible pattern, then exact sentinel. */
function findLastFlexibleStart(raw: string): {
  matchStart: number;
  innerBegin: number;
} | null {
  let chosen: RegExpExecArray | null = null;
  PRISM_TOOL_START_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRISM_TOOL_START_PATTERN.exec(raw)) !== null) {
    chosen = m;
  }
  if (!chosen?.[0]) {
    const exactIdx = raw.lastIndexOf(PRISM_TOOL_START);
    if (exactIdx === -1) return null;
    const afterExact = exactIdx + PRISM_TOOL_START.length;
    let innerBegin = afterExact;
    if (raw.slice(afterExact).startsWith("\r\n")) innerBegin += 2;
    else if (raw.slice(afterExact).startsWith("\n")) innerBegin += 1;
    return { matchStart: exactIdx, innerBegin };
  }
  const idx = chosen.index!;
  let innerBegin = idx + chosen[0].length;
  const sliceAfter = raw.slice(innerBegin);
  if (sliceAfter.startsWith("\r\n")) innerBegin += 2;
  else if (sliceAfter.startsWith("\n")) innerBegin += 1;
  return { matchStart: idx, innerBegin };
}

/** First flexible closer at or after innerBegin — returns span end for prose splice. */
function findFlexibleClosingSpan(
  raw: string,
  innerBegin: number
): { innerEnd: number; closeEndExclusive: number } | null {
  PRISM_TOOL_END_PATTERN.lastIndex = 0;
  const tail = raw.slice(innerBegin);
  const m = PRISM_TOOL_END_PATTERN.exec(tail);
  if (!m || m.index === undefined) {
    const exactIdx = raw.indexOf(PRISM_TOOL_END, innerBegin);
    if (exactIdx === -1) return null;
    return {
      innerEnd: exactIdx,
      closeEndExclusive: exactIdx + PRISM_TOOL_END.length,
    };
  }
  const innerEnd = innerBegin + m.index;
  return {
    innerEnd,
    closeEndExclusive: innerEnd + m[0].length,
  };
}

/** Extract prose + inner JSON blob when both delimiters appear in order (last block wins). */
function extractLastToolBlock(raw: string): {
  prose: string;
  innerJson: string | null;
} {
  const startInfo = findLastFlexibleStart(raw);
  if (!startInfo) return { prose: raw, innerJson: null };

  const closing = findFlexibleClosingSpan(raw, startInfo.innerBegin);
  if (!closing) {
    // Incomplete — keep full raw content so streamed/partial tails never truncate real prose prematurely.
    return { prose: raw, innerJson: null };
  }
  const innerJson = raw.slice(startInfo.innerBegin, closing.innerEnd).trim();
  const prose =
    `${raw.slice(0, startInfo.matchStart)}${raw.slice(closing.closeEndExclusive)}`.trimEnd();
  return { prose, innerJson };
}

/// True when `content` still embeds Prism tool framing (markers may have sloppy spacing).
export function assistantContentHasPrismToolFraming(raw: string | undefined | null): boolean {
  if (typeof raw !== "string" || raw.length < 16) return false;
  PRISM_TOOL_START_PATTERN.lastIndex = 0;
  return PRISM_TOOL_START_PATTERN.test(raw) || raw.includes(PRISM_TOOL_START);
}

/// Strip `<<<PRISM_TOOL>>>` … markers and optionally parse AskQuestion payloads from model output.
export function parseAssistantPrismTools(rawAssistantText: string): ParsedAssistantTurn {
  const trimmed = typeof rawAssistantText === "string" ? rawAssistantText : "";
  const { prose, innerJson } = extractLastToolBlock(trimmed);
  if (!innerJson) {
    return { displayContent: trimmed };
  }
  const jsonText = stripMarkdownFences(innerJson);
  try {
    const normalized = normalizeAskQuestionEnvelope(JSON.parse(jsonText) as unknown);
    if (!normalized) {
      return { displayContent: prose };
    }
    return {
      displayContent: prose,
      askQuestion: normalized,
    };
  } catch {
    return { displayContent: prose };
  }
}

/** Deserialize stored `messages.tool_payload` JSON into typed AskQuestion metadata. */
export function parseStoredToolPayload(
  raw: string | null | undefined
): AskQuestionPayload | undefined {
  return parseStoredAssistantToolPayload(raw).askQuestion;
}

/** Deserialize stored `messages.tool_payload` into AskQuestion + mood metadata. */
export function parseStoredAssistantToolPayload(
  raw: string | null | undefined
): ParsedStoredAssistantToolPayload {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const normalizedAsk = normalizeAskQuestionEnvelope(parsed);
    if (normalizedAsk) {
      return { askQuestion: normalizedAsk };
    }
    if (!parsed || typeof parsed !== "object") return {};
    const row = parsed as Record<string, unknown>;
    const askQuestion = normalizeAskQuestionEnvelope(row.askQuestion);
    const moodRow = row.mood;
    let moodKey: StoredMoodKey | undefined;
    let moodConfidence: number | undefined;
    if (moodRow && typeof moodRow === "object") {
      const moodRecord = moodRow as Record<string, unknown>;
      const key = typeof moodRecord.key === "string" ? moodRecord.key.trim() : "";
      if (
        key === "joyful" ||
        key === "warm" ||
        key === "neutral" ||
        key === "guarded" ||
        key === "strained"
      ) {
        moodKey = key;
      }
      const confidenceRaw = moodRecord.confidence;
      if (typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)) {
        moodConfidence = Math.max(0, Math.min(1, confidenceRaw));
      }
    }
    return {
      ...(askQuestion ? { askQuestion } : {}),
      ...(moodKey ? { moodKey } : {}),
      ...(moodConfidence !== undefined ? { moodConfidence } : {}),
    };
  } catch {
    return {};
  }
}

export function hydrateAssistantMessageParts(args: {
  content: string;
  toolPayload: string | null | undefined;
}): {
  content: string;
  askQuestion?: AskQuestionPayload;
  moodKey?: StoredMoodKey;
  moodConfidence?: number;
} {
  const stored = parseStoredAssistantToolPayload(args.toolPayload);
  if (!assistantContentHasPrismToolFraming(args.content)) {
    return {
      content: args.content,
      ...(stored.askQuestion ? { askQuestion: stored.askQuestion } : {}),
      ...(stored.moodKey ? { moodKey: stored.moodKey } : {}),
      ...(stored.moodConfidence !== undefined
        ? { moodConfidence: stored.moodConfidence }
        : {}),
    };
  }
  const reparsed = parseAssistantPrismTools(args.content);
  const askQuestion = stored.askQuestion ?? reparsed.askQuestion;
  return {
    content: reparsed.displayContent,
    ...(askQuestion ? { askQuestion } : {}),
    ...(stored.moodKey ? { moodKey: stored.moodKey } : {}),
    ...(stored.moodConfidence !== undefined
      ? { moodConfidence: stored.moodConfidence }
      : {}),
  };
}


/// Serialize validated AskQuestion for SQLite `messages.tool_payload`.
export function serializeAskQuestionTool(payload: AskQuestionPayload): string {
  return JSON.stringify(payload);
}

export function serializeAssistantToolPayload(args: {
  askQuestion?: AskQuestionPayload;
  moodKey?: StoredMoodKey;
  moodConfidence?: number;
}): string | null {
  const hasAsk = args.askQuestion !== undefined;
  const hasMood = args.moodKey !== undefined;
  if (!hasAsk && !hasMood) return null;
  if (hasAsk && !hasMood) {
    return serializeAskQuestionTool(args.askQuestion!);
  }
  const payload: StoredAssistantToolEnvelope = {
    v: 1,
    ...(args.askQuestion ? { askQuestion: args.askQuestion } : {}),
    ...(args.moodKey
      ? {
          mood: {
            key: args.moodKey,
            ...(typeof args.moodConfidence === "number" &&
            Number.isFinite(args.moodConfidence)
              ? { confidence: Math.max(0, Math.min(1, args.moodConfidence)) }
              : {}),
          },
        }
      : {}),
  };
  return JSON.stringify(payload);
}
