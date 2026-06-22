const RESET_REFERENCE_PATTERN =
  "(?:that|this|it|the\\s+(?:previous|last)\\s+(?:thing|topic|message|bit|session|context)|what\\s+we\\s+were\\s+(?:talking\\s+about|doing))";
const OPTIONAL_LEAD_IN_PATTERN = "(?:ok(?:ay)?\\s*,?\\s*)?";
const RESET_SEPARATOR_PATTERN = "(?:\\s*(?:[,;:.!?-]+|[\\u2013\\u2014])\\s+)";
const FOLLOW_ON_SEPARATOR_PATTERN =
  "(?:\\s*(?:[,;:.!?-]+|[\\u2013\\u2014])\\s+|\\s+(?:and|to)\\s+)";

const STANDALONE_CONTEXT_RESET_PATTERNS = [
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}(?:never\\s*mind|nevermind)(?:\\s+${RESET_REFERENCE_PATTERN})?\\s*[.!?]*$`,
    "iu"
  ),
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}(?:don['\\u2019]?t|do\\s+not)\\s+worry\\s+about\\s+${RESET_REFERENCE_PATTERN}\\s*[.!?]*$`,
    "iu"
  ),
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}(?:forget|ignore|scratch|drop)\\s+${RESET_REFERENCE_PATTERN}\\s*[.!?]*$`,
    "iu"
  ),
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}let['\\u2019]?s\\s+(?:talk\\s+about\\s+something\\s+else|change\\s+topics|switch\\s+topics|move\\s+on)\\s*[.!?]*$`,
    "iu"
  ),
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}(?:new|different)\\s+topic\\s*[.!?]*$`,
    "iu"
  ),
];

const PREFIX_CONTEXT_RESET_PATTERNS = [
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}(?:never\\s*mind|nevermind)(?:\\s+${RESET_REFERENCE_PATTERN})?${RESET_SEPARATOR_PATTERN}\\S`,
    "iu"
  ),
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}(?:don['\\u2019]?t|do\\s+not)\\s+worry\\s+about\\s+${RESET_REFERENCE_PATTERN}${RESET_SEPARATOR_PATTERN}\\S`,
    "iu"
  ),
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}(?:forget|ignore|scratch|drop)\\s+${RESET_REFERENCE_PATTERN}${RESET_SEPARATOR_PATTERN}\\S`,
    "iu"
  ),
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}let['\\u2019]?s\\s+(?:talk\\s+about\\s+something\\s+else|change\\s+topics|switch\\s+topics|move\\s+on)${FOLLOW_ON_SEPARATOR_PATTERN}\\S`,
    "iu"
  ),
  new RegExp(
    `^${OPTIONAL_LEAD_IN_PATTERN}(?:new|different)\\s+topic${FOLLOW_ON_SEPARATOR_PATTERN}\\S`,
    "iu"
  ),
];

function normalizeContextResetCandidate(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function shouldResetPreviousSessionContext(text: string): boolean {
  const normalized = normalizeContextResetCandidate(text);
  if (!normalized) return false;
  return (
    STANDALONE_CONTEXT_RESET_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    PREFIX_CONTEXT_RESET_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}
