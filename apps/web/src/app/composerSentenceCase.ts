/**
 * Live Composer sentence capitalization for desktop (where HTML
 * `autocapitalize="sentences"` is ignored) and as a send-time safety net.
 */

import { promptInsertionStartsSentence } from "./promptRandomization.ts";

const LETTER_RE = /\p{L}/u;

/**
 * Capitalize the first letter of `inserted` when `before` ends a sentence
 * (or is empty). Leaves mid-sentence inserts and already-cased letters alone.
 */
export function applyComposerSentenceCaseInsertion(
  before: string,
  inserted: string,
): string {
  if (!inserted || !promptInsertionStartsSentence(before)) return inserted;
  const chars = Array.from(inserted);
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    if (!LETTER_RE.test(char)) continue;
    const next = char.toLocaleUpperCase();
    if (next === char) return inserted;
    chars[index] = next;
    return chars.join("");
  }
  return inserted;
}

/**
 * Capitalize sentence starts across a full draft. Skips backtick code spans.
 * A period only starts a new sentence when whitespace follows (so `example.com`
 * stays intact). Leading `@/#/!/?/` tokens are left lowercase.
 */
export function applyComposerSentenceCaseToDraft(text: string): string {
  if (!text) return text;
  const chars = Array.from(text);
  let capitalizeNext = true;
  let inCodeSpan = false;
  let suppressToken = false;
  let pendingSentenceEnd = false;
  let changed = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    if (char === "`") {
      inCodeSpan = !inCodeSpan;
      continue;
    }
    if (inCodeSpan) continue;
    if (/[\r\n]/u.test(char)) {
      capitalizeNext = true;
      suppressToken = false;
      pendingSentenceEnd = false;
      continue;
    }
    if (/\s/u.test(char)) {
      if (pendingSentenceEnd) {
        capitalizeNext = true;
        pendingSentenceEnd = false;
      }
      suppressToken = false;
      continue;
    }
    if (suppressToken) continue;
    if (
      capitalizeNext &&
      (char === "@" ||
        char === "#" ||
        char === "/" ||
        char === "!" ||
        char === "?" ||
        char === "$")
    ) {
      suppressToken = true;
      capitalizeNext = false;
      continue;
    }
    if (LETTER_RE.test(char)) {
      pendingSentenceEnd = false;
      if (capitalizeNext) {
        const upper = char.toLocaleUpperCase();
        if (upper !== char) {
          chars[index] = upper;
          changed = true;
        }
        capitalizeNext = false;
      }
      continue;
    }
    if (/[.!?]/u.test(char)) {
      pendingSentenceEnd = true;
      capitalizeNext = false;
      continue;
    }
    pendingSentenceEnd = false;
  }
  return changed ? chars.join("") : text;
}
