import {
  parseStoredToolPayload,
  type PrismMoodIgnoredQuestionPenaltyLevel,
} from "@localai/shared";

export type AskQuestionTimeoutMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  tool_payload: string | null;
};

export type AskQuestionTimeoutLaterMessage = {
  id: string;
  role: string;
  created_at: string;
};

export type AskQuestionTimeoutApplicability =
  | { applies: true; messageId: string }
  | { applies: false; reason: "not_askquestion" | "answered" | "stale" };

const LIGHT_CONTENT_MAX_CHARS = 220;
const LIGHT_PROMPT_MAX_CHARS = 140;
const LIGHT_OPTION_MAX_CHARS = 80;
const LIGHT_WORD_MAX = 48;
const ELEVATED_CONTENT_MIN_CHARS = 720;
const ELEVATED_PROMPT_MIN_CHARS = 220;
const ELEVATED_OPTION_TEXT_MIN_CHARS = 260;
const ELEVATED_WORD_MIN = 130;

const STORY_CONTEXT_PATTERN =
  /\b(?:story|fiction|fictional|narrative|chapter|scene|character|roleplay|role-play|campaign|quest|dialogue|prologue|epilogue)\b/i;
const EMOTIONAL_CONTEXT_PATTERN =
  /\b(?:grief|hurt|lonely|relationship|breakup|betrayal|trauma|ashamed|vulnerable|afraid|depressed|anxious|conflict|argument|apology|forgive|wound|heartbroken)\b/i;

function normalizeTimeoutText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function timeoutWordCount(value: string): number {
  if (!value) return 0;
  return value.split(/\s+/).filter(Boolean).length;
}

export function classifyAskQuestionTimeoutPenalty(
  message: AskQuestionTimeoutMessage
): PrismMoodIgnoredQuestionPenaltyLevel {
  const askQuestion = parseStoredToolPayload(message.tool_payload);
  if (!askQuestion) return "normal";

  const content = normalizeTimeoutText(message.content);
  const prompt = normalizeTimeoutText(askQuestion.prompt);
  const optionLabels = askQuestion.options.map((option) =>
    normalizeTimeoutText(option.label)
  );
  const optionText = normalizeTimeoutText(optionLabels.join(" "));
  const combined = normalizeTimeoutText(`${content} ${prompt} ${optionText}`);
  const wordCount = timeoutWordCount(combined);
  const involvedContext =
    content.length >= 180 &&
    (STORY_CONTEXT_PATTERN.test(combined) || EMOTIONAL_CONTEXT_PATTERN.test(combined));

  if (
    content.length >= ELEVATED_CONTENT_MIN_CHARS ||
    prompt.length >= ELEVATED_PROMPT_MIN_CHARS ||
    optionText.length >= ELEVATED_OPTION_TEXT_MIN_CHARS ||
    wordCount >= ELEVATED_WORD_MIN ||
    involvedContext
  ) {
    return "elevated";
  }

  const simpleOptions = optionLabels.every(
    (label) => label.length > 0 && label.length <= LIGHT_OPTION_MAX_CHARS
  );
  if (
    content.length <= LIGHT_CONTENT_MAX_CHARS &&
    prompt.length <= LIGHT_PROMPT_MAX_CHARS &&
    wordCount <= LIGHT_WORD_MAX &&
    simpleOptions
  ) {
    return "light";
  }

  return "normal";
}

export function resolveAskQuestionTimeoutApplicability(
  message: AskQuestionTimeoutMessage | undefined,
  laterMessage: AskQuestionTimeoutLaterMessage | undefined
): AskQuestionTimeoutApplicability {
  if (!message || message.role !== "assistant" || !parseStoredToolPayload(message.tool_payload)) {
    return { applies: false, reason: "not_askquestion" };
  }
  if (laterMessage?.role === "user") {
    return { applies: false, reason: "answered" };
  }
  if (laterMessage) {
    return { applies: false, reason: "stale" };
  }
  return { applies: true, messageId: message.id };
}
