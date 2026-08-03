import {
  DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT,
  type DebateEvidenceSourceV1,
  type WebSearchResult,
} from "@localai/shared";
import { recordDeveloperTranscriptEvent } from "./usage.ts";

const CROSSREF_WORKS_URL = "https://api.crossref.org/works";
const SEARCH_QUERY_MAX_LENGTH = 500;
const SOURCE_TITLE_MAX_LENGTH = 200;
const SOURCE_SNIPPET_MAX_LENGTH = 360;

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function compactText(value: unknown, maxLength: number): string {
  if (Array.isArray(value)) {
    return compactText(
      value.filter((item) => typeof item === "string").join(" "),
      maxLength,
    );
  }
  if (typeof value !== "string") return "";
  const compacted = value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
  return compacted.length > maxLength
    ? compacted.slice(0, maxLength).trimEnd()
    : compacted;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function yearFromDateParts(value: unknown): string | null {
  const row = readRecord(value);
  const dateParts = row?.["date-parts"];
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) return null;
  const year = dateParts[0][0];
  return typeof year === "number" && Number.isFinite(year)
    ? String(Math.trunc(year))
    : null;
}

function scholarPublishedAt(row: Record<string, unknown>): string | null {
  return (
    yearFromDateParts(row["published-print"]) ??
    yearFromDateParts(row["published-online"]) ??
    yearFromDateParts(row.published) ??
    yearFromDateParts(row.issued)
  );
}

function scholarAuthors(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const names = value
    .slice(0, 3)
    .map((author) => {
      const row = readRecord(author);
      if (!row) return "";
      return compactText([row.given, row.family], 80);
    })
    .filter(Boolean);
  if (value.length > names.length && names.length > 0) names.push("et al.");
  return names.join(", ");
}

function scholarSnippet(row: Record<string, unknown>): string {
  const abstract = compactText(row.abstract, SOURCE_SNIPPET_MAX_LENGTH);
  if (abstract) return abstract;
  const details = [
    scholarAuthors(row.author),
    compactText(row["container-title"], 120),
    compactText(row.publisher, 120),
  ].filter(Boolean);
  return compactText(details.join(" · "), SOURCE_SNIPPET_MAX_LENGTH);
}

function normalizeScholarWork(
  value: unknown,
  index: number,
): DebateEvidenceSourceV1 | null {
  const row = readRecord(value);
  if (!row) return null;
  const title = compactText(row.title, SOURCE_TITLE_MAX_LENGTH);
  const doi = compactText(row.DOI, 240);
  const url = doi
    ? safeHttpUrl(`https://doi.org/${doi}`)
    : safeHttpUrl(row.URL);
  if (!title || !url) return null;
  return {
    id: `scholar-${index + 1}`,
    title,
    url,
    snippet: scholarSnippet(row),
    publishedAt: scholarPublishedAt(row),
  };
}

export function debateEvidenceSourcesFromWebResults(
  results: readonly WebSearchResult[],
): DebateEvidenceSourceV1[] {
  const seenUrls = new Set<string>();
  const sources: DebateEvidenceSourceV1[] = [];
  for (const result of results) {
    const url = safeHttpUrl(result.url);
    if (!result.title.trim() || !url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    sources.push({
      id: `brave-${sources.length + 1}`,
      title: compactText(result.title, SOURCE_TITLE_MAX_LENGTH),
      url,
      snippet: compactText(result.snippet, SOURCE_SNIPPET_MAX_LENGTH),
      publishedAt: compactText(result.publishedAt, 80) || null,
    });
    if (sources.length >= DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT) break;
  }
  return sources;
}

export function normalizeCrossrefScholarResults(
  responseBody: unknown,
): DebateEvidenceSourceV1[] {
  const root = readRecord(responseBody);
  const message = readRecord(root?.message);
  const items = Array.isArray(message?.items) ? message.items : [];
  const seenUrls = new Set<string>();
  const sources: DebateEvidenceSourceV1[] = [];
  for (const item of items) {
    const source = normalizeScholarWork(item, sources.length);
    if (!source || seenUrls.has(source.url)) continue;
    seenUrls.add(source.url);
    sources.push(source);
    if (sources.length >= DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT) break;
  }
  if (sources.length === 0) {
    throw new Error("Scholar Search returned no usable results.");
  }
  return sources;
}

export async function searchScholarWithCrossref(args: {
  query: string;
  signal?: AbortSignal;
}): Promise<DebateEvidenceSourceV1[]> {
  const startedAt = Date.now();
  const query = compactText(args.query, SEARCH_QUERY_MAX_LENGTH);
  if (!query) throw new Error("Scholar Search query cannot be empty.");
  const url = new URL(CROSSREF_WORKS_URL);
  url.searchParams.set("query.bibliographic", query);
  url.searchParams.set("rows", String(DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT));
  const diagnosticRequest = { method: "GET", url: url.toString(), query };
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: args.signal,
    });
  } catch (error) {
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "debate_scholar_search",
      provider: "crossref",
      model: "works",
      request: diagnosticRequest,
      error: args.signal?.aborted
        ? "Scholar Search was aborted by the caller."
        : "Scholar Search could not reach Crossref.",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
  if (!response.ok) {
    const message = `Scholar Search failed with HTTP ${response.status}.`;
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "debate_scholar_search",
      provider: "crossref",
      model: "works",
      request: diagnosticRequest,
      error: message,
      durationMs: Date.now() - startedAt,
    });
    throw new Error(message);
  }
  const rawOutput = await response.json();
  try {
    const parsedOutput = normalizeCrossrefScholarResults(rawOutput);
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "debate_scholar_search",
      provider: "crossref",
      model: "works",
      request: diagnosticRequest,
      rawOutput,
      parsedOutput,
      streaming: false,
      durationMs: Date.now() - startedAt,
    });
    return parsedOutput;
  } catch (error) {
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "debate_scholar_search",
      provider: "crossref",
      model: "works",
      request: diagnosticRequest,
      rawOutput,
      error:
        error instanceof Error
          ? error.message
          : "Scholar Search result parsing failed.",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
