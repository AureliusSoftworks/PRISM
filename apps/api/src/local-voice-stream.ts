const MIN_STRONG_BREAK_CHARACTERS = 18;
const MIN_CLAUSE_BREAK_CHARACTERS = 24;
const MAX_CHUNK_CHARACTERS = 56;
const STRONG_ENDING = /[.!?]["')\]]?$/u;
const CLAUSE_ENDING = /[,;:—]["')\]]?$/u;

/**
 * Splits completed local speech into short, natural chunks. Kokoro prepares the
 * next chunk while the browser plays the current one, cutting first-audio
 * latency without overlapping model inference or changing spoken text.
 */
export function splitLocalVoiceStreamText(text: string): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  let current = "";

  const commit = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > MAX_CHUNK_CHARACTERS) {
      commit();
      current = word;
    } else {
      current = candidate;
    }

    const strongNaturalBreak =
      current.length >= MIN_STRONG_BREAK_CHARACTERS &&
      STRONG_ENDING.test(word);
    const clauseNaturalBreak =
      current.length >= MIN_CLAUSE_BREAK_CHARACTERS &&
      CLAUSE_ENDING.test(word);
    if (strongNaturalBreak || clauseNaturalBreak) commit();
  }
  commit();

  // Avoid a tiny final fragment when it can safely ride with the prior chunk.
  if (chunks.length >= 2) {
    const tail = chunks.at(-1)!;
    const previous = chunks.at(-2)!;
    if (tail.length < 18 && previous.length + 1 + tail.length <= 80) {
      chunks.splice(-2, 2, `${previous} ${tail}`);
    }
  }
  return chunks;
}
