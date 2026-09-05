export interface ProtectedSpeechRange {
  start: number;
  end: number;
}

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Spans of a spoken line that no accent transformation may touch: authored
 * name pronunciations and self-referrals, initialisms, code-like tokens, and
 * anything carrying a digit. Offsets are absolute into the text passed in.
 *
 * Engine-neutral on purpose. Local phonemization and the Premium respelling
 * pass both consume it, so a name stays a name in either lane.
 */
export function protectedSpeechRanges(
  text: string,
  phrases: readonly string[] | undefined,
): ProtectedSpeechRange[] {
  const ranges: ProtectedSpeechRange[] = [];
  const normalizedPhrases = [...new Set(
    (phrases ?? [])
      .map((phrase) => phrase.replace(/\s+/gu, " ").trim())
      .filter((phrase) => phrase.length > 0 && phrase.length <= 160),
  )].sort((left, right) => right.length - left.length);
  if (normalizedPhrases.length > 0) {
    const phrasePattern = new RegExp(
      normalizedPhrases.map(escapedPattern).join("|"),
      "giu",
    );
    for (const match of text.matchAll(phrasePattern)) {
      if (match.index === undefined) continue;
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  const tokenPattern = /\b[\p{L}\p{N}]+(?:[-_/\\][\p{L}\p{N}_/\\-]+)+\b|\b[A-Z]{2,}\b|\b[\p{L}\p{N}]*\d[\p{L}\p{N}]*\b/gu;
  for (const match of text.matchAll(tokenPattern)) {
    if (match.index === undefined) continue;
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .reduce<ProtectedSpeechRange[]>((merged, range) => {
      const previous = merged.at(-1);
      if (!previous || range.start > previous.end) {
        merged.push({ ...range });
      } else {
        previous.end = Math.max(previous.end, range.end);
      }
      return merged;
    }, []);
}
