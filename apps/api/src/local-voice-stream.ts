const CONTINUATION_MAX_TOKENS = 80;

/**
 * Splits completed local speech into synthesis windows for streaming.
 *
 * No Kokoro-specific punctuation chopping — commas and periods stay inside the
 * same generate() call so delivery follows the engine plus any bot English
 * pacing profile applied between stream windows on the client.
 *
 * Long unpunctuated runs still pack into <=80-token windows so a wall of words
 * does not become a single huge synthesis job.
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
    if (current.length >= CONTINUATION_MAX_TOKENS) {
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
