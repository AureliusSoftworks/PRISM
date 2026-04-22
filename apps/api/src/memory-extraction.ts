export interface MemoryCandidate {
  text: string;
  confidence: number;
}

export function extractMemoryCandidates(message: string): MemoryCandidate[] {
  const lines = message
    .split(/[.!?\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 12);
  const candidates: MemoryCandidate[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    const looksPersonal =
      lower.includes("i am") ||
      lower.includes("i'm") ||
      lower.includes("my ") ||
      lower.includes("i prefer") ||
      lower.includes("i like");
    if (!looksPersonal) {
      continue;
    }
    const confidence = Math.min(0.95, 0.55 + line.length / 220);
    candidates.push({ text: line, confidence: Number(confidence.toFixed(2)) });
  }
  return candidates.slice(0, 3);
}
