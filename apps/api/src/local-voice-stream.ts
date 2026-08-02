const FIRST_PHRASE_MIN_TOKENS = 3;
const FIRST_PHRASE_TARGET_TOKENS = 12;
const CONTINUATION_MIN_TOKENS = 20;
const CONTINUATION_TARGET_TOKENS = 48;
const CONTINUATION_MAX_TOKENS = 80;
const STRONG_ENDING = /[.!?]["')\]]?$/u;
const CLAUSE_ENDING = /[,;:—]["')\]]?$/u;

/**
 * Splits completed local speech into a short first phrase followed by
 * sentence-aware 40–80-token continuations. The first phrase lowers audible
 * latency; longer later chunks prevent the prosody resets caused by the old
 * fixed 56-character window.
 */
export function splitLocalVoiceStreamText(text: string): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  let current: string[] = [];

  const commit = () => {
    const value = current.join(" ").trim();
    if (value) chunks.push(value);
    current = [];
  };

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    current.push(word);
    const firstPhrase = chunks.length === 0;
    if (firstPhrase) {
      const phraseBreak =
        current.length >= FIRST_PHRASE_MIN_TOKENS &&
        (STRONG_ENDING.test(word) || CLAUSE_ENDING.test(word));
      if (phraseBreak || current.length >= FIRST_PHRASE_TARGET_TOKENS) commit();
      continue;
    }

    const remainingTokens = words.length - index - 1;
    const naturalBreak = STRONG_ENDING.test(word) || CLAUSE_ENDING.test(word);
    const continuationReady = current.length >= CONTINUATION_MIN_TOKENS;
    const avoidTinyTail =
      remainingTokens === 0 || remainingTokens >= CONTINUATION_MIN_TOKENS;
    if (
      current.length >= CONTINUATION_MAX_TOKENS ||
      (naturalBreak && continuationReady && avoidTinyTail) ||
      (current.length >= CONTINUATION_TARGET_TOKENS && naturalBreak)
    ) {
      commit();
    }
  }
  commit();

  // Avoid a tiny final prosody fragment; 80 tokens is the continuation ceiling.
  if (chunks.length >= 3) {
    const tail = chunks.at(-1)!;
    const previous = chunks.at(-2)!;
    const tailTokens = tail.split(/\s+/u).length;
    const previousTokens = previous.split(/\s+/u).length;
    if (
      tailTokens < CONTINUATION_MIN_TOKENS &&
      previousTokens + tailTokens <= CONTINUATION_MAX_TOKENS
    ) {
      chunks.splice(-2, 2, `${previous} ${tail}`);
    }
  }
  return chunks;
}
