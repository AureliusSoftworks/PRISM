const DEBATE_LIVE_CAPTION_DEFAULT_LIMIT = 156;
const DEBATE_LIVE_CAPTION_MIN_LIMIT = 72;

function preferredCaptionBreakIndex(
  value: string,
  minimumIndex: number,
): number | null {
  const sentenceBoundary = /[.!?…](?:["”’')\]]*)\s+/gu;
  let preferred: number | null = null;

  for (const match of value.matchAll(sentenceBoundary)) {
    const boundary = (match.index ?? 0) + match[0].length;
    if (boundary >= minimumIndex) preferred = boundary;
  }

  return preferred;
}

export function normalizeDebateLiveCaptionText(value: string): string {
  return value
    .replace(/!?\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/```(?:\w+)?|```/gu, "")
    .replace(/[*_~`]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function debateLiveCaptionPages(
  value: string,
  requestedLimit = DEBATE_LIVE_CAPTION_DEFAULT_LIMIT,
): string[] {
  const normalized = normalizeDebateLiveCaptionText(value);
  if (!normalized) return [];

  const limit = Math.max(
    DEBATE_LIVE_CAPTION_MIN_LIMIT,
    Math.floor(requestedLimit),
  );
  const preferredBreakFloor = Math.floor(limit * 0.48);
  const pages: string[] = [];
  let current = "";

  for (const word of normalized.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || candidate.length <= limit) {
      current = candidate;
      continue;
    }

    const preferredBreak = preferredCaptionBreakIndex(
      current,
      preferredBreakFloor,
    );
    if (preferredBreak !== null) {
      const completedPage = current.slice(0, preferredBreak).trim();
      const carriedWords = current.slice(preferredBreak).trim();
      if (completedPage) pages.push(completedPage);
      current = carriedWords ? `${carriedWords} ${word}` : word;
      continue;
    }

    pages.push(current);
    current = word;
  }

  if (current) pages.push(current);
  return pages;
}

export function debateLiveCaptionPage(
  value: string,
  requestedLimit = DEBATE_LIVE_CAPTION_DEFAULT_LIMIT,
): {
  pageIndex: number;
  pageCount: number;
  text: string;
} {
  const pages = debateLiveCaptionPages(value, requestedLimit);
  const pageIndex = Math.max(0, pages.length - 1);
  return {
    pageIndex,
    pageCount: pages.length,
    text: pages[pageIndex] ?? "",
  };
}

/** Signal reuses Debate's caption paging verbatim: Debate's page limit is the
 * source of truth for how many subtitle lines any stage may stack. */
export const signalLiveCaptionPage = debateLiveCaptionPage;
