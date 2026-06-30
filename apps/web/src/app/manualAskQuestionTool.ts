export const MANUAL_ASK_QUESTION_OPTION_COUNT_MIN = 2;
export const MANUAL_ASK_QUESTION_OPTION_COUNT_MAX = 4;
export const MANUAL_ASK_QUESTION_OPTION_PLACEHOLDERS = [
  "Choice A",
  "Choice B",
  "Choice C",
  "Choice D",
] as const;

export type ManualAskQuestionDraft = {
  question: string;
  options: string[];
};

export type ManualAskQuestionPayload = {
  question: string;
  options?: string[];
};

function normalizeManualAskQuestionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function manualAskQuestionOptionKey(option: string): string {
  return normalizeManualAskQuestionText(option).toLowerCase();
}

export function splitManualAskQuestionOptionText(text: string): string[] {
  return text
    .split(/[|\r\n]+/u)
    .map(normalizeManualAskQuestionText)
    .filter(Boolean);
}

export function normalizeManualAskQuestionOptions(
  options: readonly string[]
): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawOption of options) {
    const option = normalizeManualAskQuestionText(rawOption);
    const key = manualAskQuestionOptionKey(option);
    if (!option || !key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(option);
    if (normalized.length >= MANUAL_ASK_QUESTION_OPTION_COUNT_MAX) break;
  }
  return normalized;
}

export function buildDefaultManualAskQuestionOptionDraft(): string[] {
  return Array.from({ length: MANUAL_ASK_QUESTION_OPTION_COUNT_MIN }, () => "");
}

export function ensureManualAskQuestionOptionRows(
  options: readonly string[]
): string[] {
  const normalized = normalizeManualAskQuestionOptions(options);
  if (normalized.length >= MANUAL_ASK_QUESTION_OPTION_COUNT_MIN) {
    return normalized;
  }
  return [
    ...normalized,
    ...Array.from(
      { length: MANUAL_ASK_QUESTION_OPTION_COUNT_MIN - normalized.length },
      () => ""
    ),
  ];
}

function parseManualAskQuestionLines(draft: string): ManualAskQuestionDraft | null {
  const lines = draft
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;
  const optionLines = lines.slice(1);
  const options = normalizeManualAskQuestionOptions(optionLines);
  if (options.length < MANUAL_ASK_QUESTION_OPTION_COUNT_MIN) return null;
  return {
    question: normalizeManualAskQuestionText(lines[0] ?? ""),
    options,
  };
}

export function parseManualAskQuestionDraft(draft: string): ManualAskQuestionDraft {
  const normalizedDraft = draft.trim();
  if (!normalizedDraft) return { question: "", options: [] };

  const lines = normalizedDraft
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstPipeLineIndex = lines.findIndex((line) => line.includes("|"));
  if (firstPipeLineIndex > 0) {
    const question = normalizeManualAskQuestionText(
      lines.slice(0, firstPipeLineIndex).join(" ")
    );
    const optionText = lines.slice(firstPipeLineIndex).join("\n");
    const options = normalizeManualAskQuestionOptions(
      splitManualAskQuestionOptionText(optionText)
    );
    if (question && options.length >= MANUAL_ASK_QUESTION_OPTION_COUNT_MIN) {
      return { question, options };
    }
  }

  if (normalizedDraft.includes("|")) {
    const parts = splitManualAskQuestionOptionText(normalizedDraft);
    if (parts.length >= 3) {
      return {
        question: normalizeManualAskQuestionText(parts[0] ?? ""),
        options: normalizeManualAskQuestionOptions(parts.slice(1)),
      };
    }
  }

  const lineDraft = parseManualAskQuestionLines(normalizedDraft);
  if (lineDraft) return lineDraft;

  return { question: normalizeManualAskQuestionText(normalizedDraft), options: [] };
}

export function buildManualAskQuestionPayload(
  questionDraft: string,
  optionDrafts: readonly string[]
): ManualAskQuestionPayload | null {
  const question = normalizeManualAskQuestionText(questionDraft);
  if (!question) return null;
  const options = normalizeManualAskQuestionOptions(optionDrafts);
  if (options.length < MANUAL_ASK_QUESTION_OPTION_COUNT_MIN) {
    return { question };
  }
  return { question, options };
}
