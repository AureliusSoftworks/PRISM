const DEBATE_EVIDENCE_QUERY_MAX_LENGTH = 500;

export const DEBATE_EVIDENCE_QUERY_LENSES = [
  "strongest evidence and counterevidence from both sides",
  "recent studies statistics and expert analysis",
  "real-world case studies outcomes and unintended consequences",
  "historical precedents comparisons and counterexamples",
  "costs benefits tradeoffs and distributional effects",
  "expert consensus major critiques and unresolved questions",
] as const;

function compactQueryText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function randomDebateEvidenceQuery(
  motion: string,
  topic = "",
  random: () => number = Math.random,
): string {
  const subject = compactQueryText(motion) || compactQueryText(topic);
  if (!subject) return "";
  const sampled = random();
  const roll = Number.isFinite(sampled) ? sampled : 0;
  const index = Math.min(
    DEBATE_EVIDENCE_QUERY_LENSES.length - 1,
    Math.max(0, Math.floor(roll * DEBATE_EVIDENCE_QUERY_LENSES.length)),
  );
  return compactQueryText(
    `${subject} ${DEBATE_EVIDENCE_QUERY_LENSES[index]}`,
  ).slice(0, DEBATE_EVIDENCE_QUERY_MAX_LENGTH);
}
