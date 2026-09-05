import type { DebateEvidenceSourceV1 } from "@localai/shared";

export interface DebateUrlEvidenceDraft {
  url: string;
  title: string;
  snippet: string;
  publishedAt: string | null;
  fetched: boolean;
}

export type DebateUrlEvidenceDraftResult =
  | { source: DebateEvidenceSourceV1; error: null }
  | { source: null; error: string };

export function canonicalDebateUrlEvidenceUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    const expectedPort = parsed.protocol === "https:" ? "443" : "80";
    if (parsed.port && parsed.port !== expectedPort) return null;
    parsed.hash = "";
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

export function emptyDebateUrlEvidenceDraft(): DebateUrlEvidenceDraft {
  return {
    url: "",
    title: "",
    snippet: "",
    publishedAt: null,
    fetched: false,
  };
}

function nextUrlEvidenceSourceId(
  current: readonly DebateEvidenceSourceV1[],
): string {
  const used = new Set(current.map((source) => source.id));
  let index = 1;
  while (used.has(`url-${index}`)) index += 1;
  return `url-${index}`;
}

export function debateUrlEvidenceSourceFromDraft(args: {
  draft: DebateUrlEvidenceDraft;
  current: readonly DebateEvidenceSourceV1[];
  itemLimitReached: boolean;
}): DebateUrlEvidenceDraftResult {
  if (args.itemLimitReached) {
    return {
      source: null,
      error: "Remove an evidence item before adding another source.",
    };
  }
  const canonicalUrl = canonicalDebateUrlEvidenceUrl(args.draft.url);
  if (!canonicalUrl) {
    return {
      source: null,
      error: "Enter a complete public HTTP or HTTPS URL.",
    };
  }
  if (
    args.current.some(
      (source) => canonicalDebateUrlEvidenceUrl(source.url) === canonicalUrl,
    )
  ) {
    return {
      source: null,
      error: "That URL is already in the evidence record.",
    };
  }
  const title = args.draft.title.replace(/\s+/gu, " ").trim().slice(0, 240);
  if (!title) {
    return { source: null, error: "Add a title for this source." };
  }
  const snippet = args.draft.snippet.replace(/\s+/gu, " ").trim().slice(0, 800);
  if (!snippet) {
    return {
      source: null,
      error: "Summarize what the debaters should take from this source.",
    };
  }
  return {
    source: {
      id: nextUrlEvidenceSourceId(args.current),
      title,
      url: canonicalUrl,
      snippet,
      publishedAt: args.draft.publishedAt?.trim().slice(0, 64) || null,
    },
    error: null,
  };
}
