const CONTINUATION_MAX_TOKENS = 80;
const STRONG_ENDING = /[.!?]["')\]]?$/u;
const CLAUSE_ENDING = /[,;:—]["')\]]?$/u;
const ELLIPSIS_ENDING = /(?:\.{3}|…)$/u;

function endsForProsodyPause(word: string): boolean {
  return (
    STRONG_ENDING.test(word) ||
    CLAUSE_ENDING.test(word) ||
    ELLIPSIS_ENDING.test(word)
  );
}

/**
 * Splits completed local speech into punctuation-bounded synthesis clauses.
 *
 * Kokoro invents its own mid-phrase pauses when commas and periods stay inside
 * one generate() call — e.g. "The sponges, they are…" can sound like the breath
 * landed after "are". Speaking each punctuated clause separately lets English
 * playback insert the real pause that matches the on-screen mark.
 *
 * Long unpunctuated runs still pack into <=80-token windows so a wall of words
 * without commas does not become a single huge synthesis job.
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

  for (const word of words) {
    current.push(word);
    if (endsForProsodyPause(word) || current.length >= CONTINUATION_MAX_TOKENS) {
      commit();
    }
  }
  commit();
  return chunks;
}

export function splitLocalVoiceStreamSegments(
  text: string,
  sourceOffset = 0,
): Array<{ text: string; sourceStart: number; sourceEnd: number }> {
  const chunks = splitLocalVoiceStreamText(text);
  const words = [...text.matchAll(/\S+/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  let wordCursor = 0;
  return chunks.map((chunk) => {
    const tokenCount = chunk.split(/\s+/u).filter(Boolean).length;
    const first = words[wordCursor];
    const last = words[wordCursor + tokenCount - 1];
    wordCursor += tokenCount;
    return {
      text: chunk,
      sourceStart: sourceOffset + (first?.start ?? 0),
      sourceEnd: sourceOffset + (last?.end ?? text.length),
    };
  });
}
