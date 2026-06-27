import { COMPOSER_GHOST_LEXICON } from "./composerGhostLexicon.generated.ts";

const DEFAULT_MIN_PREFIX_LENGTH = 4;
const DEFAULT_MIN_SUFFIX_LENGTH = 2;

export interface ComposerGhostSuggestion {
  prefixStart: number;
  prefixEnd: number;
  prefix: string;
  word: string;
  suffix: string;
}

export interface ComposerGhostCompletionInput {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  lexicon?: readonly string[];
  suppressed?: boolean;
  minPrefixLength?: number;
  minSuffixLength?: number;
}

export interface ComposerGhostCompletionApplyResult {
  value: string;
  caret: number;
}

function isAsciiLetter(char: string | undefined): boolean {
  return typeof char === "string" && /^[a-z]$/iu.test(char);
}

function isAllCaps(value: string): boolean {
  return /[A-Z]/u.test(value) && value === value.toUpperCase();
}

function isTitleCase(value: string): boolean {
  if (value.length === 0) return false;
  const first = value[0] ?? "";
  const rest = value.slice(1);
  return first === first.toUpperCase() && rest === rest.toLowerCase();
}

function formatCandidateForPrefix(candidate: string, prefix: string): string {
  if (isAllCaps(prefix)) return candidate.toUpperCase();
  if (isTitleCase(prefix)) {
    return `${candidate.slice(0, 1).toUpperCase()}${candidate.slice(1)}`;
  }
  if (prefix === prefix.toLowerCase()) return candidate.toLowerCase();
  return candidate;
}

function startsFromSuppressedToken(text: string, prefixStart: number): boolean {
  const previous = text[prefixStart - 1];
  return previous === "/" || previous === "!" || previous === "@" || previous === "{";
}

export function resolveComposerGhostCompletion(
  input: ComposerGhostCompletionInput
): ComposerGhostSuggestion | null {
  if (input.suppressed) return null;
  const text = input.text;
  const selectionStart = Math.max(0, Math.min(input.selectionStart, text.length));
  const selectionEnd = Math.max(0, Math.min(input.selectionEnd, text.length));
  if (selectionStart !== selectionEnd) return null;
  if (isAsciiLetter(text[selectionStart])) return null;

  let prefixStart = selectionStart;
  while (prefixStart > 0 && isAsciiLetter(text[prefixStart - 1])) {
    prefixStart -= 1;
  }
  if (prefixStart === selectionStart) return null;
  if (startsFromSuppressedToken(text, prefixStart)) return null;

  const prefix = text.slice(prefixStart, selectionStart);
  const minPrefixLength = input.minPrefixLength ?? DEFAULT_MIN_PREFIX_LENGTH;
  const minSuffixLength = input.minSuffixLength ?? DEFAULT_MIN_SUFFIX_LENGTH;
  if (prefix.length < minPrefixLength) return null;

  const normalizedPrefix = prefix.toLowerCase();
  const lexicon = input.lexicon ?? COMPOSER_GHOST_LEXICON;
  for (const candidate of lexicon) {
    const normalizedCandidate = candidate.toLowerCase();
    if (normalizedCandidate === normalizedPrefix) continue;
    if (!normalizedCandidate.startsWith(normalizedPrefix)) continue;
    if (normalizedCandidate.length - normalizedPrefix.length < minSuffixLength) continue;
    const word = formatCandidateForPrefix(candidate, prefix);
    return {
      prefixStart,
      prefixEnd: selectionStart,
      prefix,
      word,
      suffix: word.slice(prefix.length),
    };
  }
  return null;
}

export function applyComposerGhostCompletion(
  text: string,
  suggestion: ComposerGhostSuggestion
): ComposerGhostCompletionApplyResult | null {
  if (text.slice(suggestion.prefixStart, suggestion.prefixEnd) !== suggestion.prefix) {
    return null;
  }
  const value = `${text.slice(0, suggestion.prefixEnd)}${suggestion.suffix}${text.slice(
    suggestion.prefixEnd
  )}`;
  return {
    value,
    caret: suggestion.prefixEnd + suggestion.suffix.length,
  };
}
