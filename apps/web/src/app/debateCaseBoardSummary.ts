import type {
  DebateCaseCardV1,
  DebateSessionV1,
} from "@localai/shared";

const DEBATE_ROUND_SUMMARY_MAX_SENTENCES = 5;

export const DEBATE_ROUND_SUMMARY_EMPTY =
  "The Debate has not finished a round yet. Claims will collect here once the first exchange closes.";

export const DEBATE_ROUND_SUMMARY_NO_CLAIMS =
  "No claims were heard. The Living Case Board stayed empty, so there is nothing to summarize yet.";

/**
 * Stable round marker used to freeze the bottom Summary module between
 * rounds (not after every advocate turn).
 */
export function debateCaseBoardRoundKey(session: DebateSessionV1): string {
  if (session.formatState.format === "turnabout") {
    return `turnabout:${session.formatState.round}`;
  }
  if (session.formatState.format === "forum") {
    const step = session.stepKey;
    if (
      step.includes("closing") ||
      step.startsWith("ballot_") ||
      step === "moderator_to_closing" ||
      step === "judge_closing_moderator" ||
      step === "jury_closing_moderator" ||
      step === "moderator_to_jury" ||
      session.status === "completed"
    ) {
      return `forum:closing:${session.formatState.rebuttalRound}`;
    }
    if (
      step.includes("rebuttal") ||
      step === "moderator_to_rebuttal" ||
      step.includes("challenge")
    ) {
      return `forum:rebuttal:${session.formatState.rebuttalRound}`;
    }
    return "forum:opening";
  }
  return `${session.format}:${session.stepKey}`;
}

/**
 * Cards feeding the Summary module. Prefer the presentation-gated board;
 * fall back to the live session board so return / gallery loading never
 * leaves the module empty after the Debate has already left opening.
 */
export function debateRoundSummarySourceCards(
  session: DebateSessionV1,
  gatedCards: readonly DebateCaseCardV1[],
): DebateCaseCardV1[] {
  if (gatedCards.length > 0) return [...gatedCards];
  return session.caseBoard.length > 0 ? [...session.caseBoard] : [];
}

/**
 * Opening stays quiet until the first round boundary. Past opening, hydrate
 * even when returning mid-Debate or while the gallery is still loading.
 */
export function debateRoundSummaryShouldHydrate(roundKey: string): boolean {
  return roundKey !== "forum:opening";
}

/**
 * Chronological Living Case Board order for the SMS-style stream.
 */
export function debateCaseBoardChronological(
  session: DebateSessionV1,
  cards: readonly DebateCaseCardV1[],
): DebateCaseCardV1[] {
  const sequenceByEventId = new Map(
    session.events.map((event) => [event.id, event.sequence] as const),
  );
  return [...cards].sort((left, right) => {
    const leftSequence = sequenceByEventId.get(left.createdEventId) ?? 0;
    const rightSequence = sequenceByEventId.get(right.createdEventId) ?? 0;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
    return left.updatedAt.localeCompare(right.updatedAt);
  });
}

function sentenceFromCard(
  card: DebateCaseCardV1,
  forLabel: string,
  againstLabel: string,
): string {
  const sideLabel = card.sideId === "for" ? forLabel : againstLabel;
  const statusNote =
    card.status === "challenged"
      ? " (now challenged)"
      : card.status === "conceded"
        ? " (conceded)"
        : "";
  const body = card.summary.trim().replace(/\s+/g, " ");
  const withSide = `${sideLabel} holds that ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
  const punctuated = /[.!?]$/.test(withSide) ? withSide : `${withSide}.`;
  return punctuated.replace(/\.$/, `${statusNote}.`).replace(/\s+\./g, ".");
}

/**
 * Build a short round-boundary paragraph (≤5 sentences) from the visible
 * case board. Pure text — no network — so LOCAL Debates stay private.
 */
export function composeDebateRoundSummary(input: {
  session: DebateSessionV1;
  cards: readonly DebateCaseCardV1[];
}): string {
  const cards = debateCaseBoardChronological(input.session, input.cards);
  if (cards.length === 0) {
    const roundKey = debateCaseBoardRoundKey(input.session);
    const sealedOrPastOpening =
      input.session.status === "completed" ||
      input.session.stepKey === "completed" ||
      debateRoundSummaryShouldHydrate(roundKey);
    return sealedOrPastOpening
      ? DEBATE_ROUND_SUMMARY_NO_CLAIMS
      : DEBATE_ROUND_SUMMARY_EMPTY;
  }

  const forLabel = input.session.motion.forSide.label.trim() || "For";
  const againstLabel = input.session.motion.againstSide.label.trim() || "Against";
  const recent = cards.slice(-DEBATE_ROUND_SUMMARY_MAX_SENTENCES);
  const sentences = recent.map((card) =>
    sentenceFromCard(card, forLabel, againstLabel),
  );
  return sentences.join(" ").replace(/\s+/g, " ").trim();
}

export const DEBATE_CASE_BOARD_TRANSCRIPT_EMPTY =
  "No public case-board claims have been heard yet.";

/**
 * Plain-text clipboard record of the Living Case Board SMS stream.
 * Uses the same chronological, presentation-gated cards shown in the rail.
 */
export function formatDebateCaseBoardTranscript(input: {
  session: DebateSessionV1;
  cards: readonly DebateCaseCardV1[];
}): string {
  const session = input.session;
  const forLabel = session.motion.forSide.label.trim() || "For";
  const againstLabel = session.motion.againstSide.label.trim() || "Against";
  const thread = debateCaseBoardChronological(session, input.cards);
  const lines = [
    "# PRISM Debate — Living Case Board",
    "",
    `- Session: ${session.id}`,
    `- Status: ${session.status}`,
    `- Format: ${session.format} v${session.formatVersion}`,
    `- Title: ${session.motion.title}`,
    "",
    "## Motion",
    "",
    session.motion.motion,
    "",
    "## Claims (heard speech only)",
    "",
  ];
  if (thread.length === 0) {
    lines.push(DEBATE_CASE_BOARD_TRANSCRIPT_EMPTY, "");
    return lines.join("\n").trimEnd() + "\n";
  }
  for (const card of thread) {
    const sideLabel = card.sideId === "for" ? forLabel : againstLabel;
    const body = card.summary.trim().replace(/\s+/g, " ");
    lines.push(`${sideLabel} · ${card.status}`);
    lines.push(body || "(empty claim)");
    if (card.sourceIds.length > 0) {
      lines.push(`Exhibits: ${card.sourceIds.join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
