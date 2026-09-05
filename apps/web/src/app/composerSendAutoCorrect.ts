/**
 * Send-time autocorrect for composers that disable live writing assist.
 *
 * Coffee and Signal keep the composer itself free of native spell-check and
 * autocorrect (live squiggles and OS text substitution are expensive inside
 * the rich editor and distract from the table). When the account-level
 * writing-assist setting is on, outgoing text is corrected here instead —
 * right before it reaches the Coffee table or the Signal producer queue.
 *
 * The correction pass is deliberately conservative: a curated map of
 * unambiguous typos plus standalone-pronoun capitalization. Tokens attached
 * to mentions (@), slash commands (/), paths, or hashtags are never touched,
 * and backtick code spans are left verbatim.
 */

import { applyComposerSentenceCaseToDraft } from "./composerSentenceCase.ts";

const COMPOSER_SEND_AUTOCORRECT_WORDS: ReadonlyMap<string, string> = new Map([
  ["teh", "the"],
  ["hte", "the"],
  ["taht", "that"],
  ["adn", "and"],
  ["nad", "and"],
  ["waht", "what"],
  ["wich", "which"],
  ["thier", "their"],
  ["recieve", "receive"],
  ["seperate", "separate"],
  ["definately", "definitely"],
  ["becuase", "because"],
  ["beleive", "believe"],
  ["wierd", "weird"],
  ["freind", "friend"],
  ["untill", "until"],
  ["tommorow", "tomorrow"],
  ["tomorow", "tomorrow"],
  ["alot", "a lot"],
  ["dont", "don't"],
  ["cant", "can't"],
  ["wont", "won't"],
  ["isnt", "isn't"],
  ["wasnt", "wasn't"],
  ["didnt", "didn't"],
  ["doesnt", "doesn't"],
  ["couldnt", "couldn't"],
  ["shouldnt", "shouldn't"],
  ["wouldnt", "wouldn't"],
  ["havent", "haven't"],
  ["hasnt", "hasn't"],
  ["arent", "aren't"],
  ["werent", "weren't"],
  ["youre", "you're"],
  ["theyre", "they're"],
  ["im", "I'm"],
  ["ive", "I've"],
  ["i", "I"],
]);

/**
 * Word tokens eligible for correction: preceded by start-of-text, whitespace,
 * an opening bracket/quote, or markdown emphasis. This excludes tokens glued
 * to mention (@), command (/), hashtag (#), or path characters.
 */
const COMPOSER_SEND_AUTOCORRECT_TOKEN_PATTERN =
  /(^|[\s([{"'“”‘’*_>])([A-Za-z']+)/gu;

function preserveTokenCase(original: string, replacement: string): string {
  // Corrections built around "I" keep their fixed capitalization.
  if (replacement.startsWith("I")) return replacement;
  if (original.length > 1 && original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  const firstChar = original.charAt(0);
  if (firstChar === firstChar.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function correctSegment(segment: string): string {
  return segment.replace(
    COMPOSER_SEND_AUTOCORRECT_TOKEN_PATTERN,
    (match, prefix: string, token: string) => {
      const replacement = COMPOSER_SEND_AUTOCORRECT_WORDS.get(
        token.toLocaleLowerCase(),
      );
      if (replacement === undefined) return match;
      return `${prefix}${preserveTokenCase(token, replacement)}`;
    },
  );
}

/**
 * Apply the conservative typo/capitalization pass to outgoing composer text.
 * Backtick code spans are preserved verbatim. Sentence starts are capitalized
 * so desktop composers (which ignore HTML autocapitalize) still ship clean prose.
 */
export function applyComposerSendAutoCorrect(text: string): string {
  if (text.length === 0) return text;
  const typoFixed = !text.includes("`")
    ? correctSegment(text)
    : text
        .split("`")
        .map((segment, index) =>
          // Odd-indexed segments live inside backtick pairs; leave them alone.
          index % 2 === 0 ? correctSegment(segment) : segment,
        )
        .join("`");
  return applyComposerSentenceCaseToDraft(typoFixed);
}
