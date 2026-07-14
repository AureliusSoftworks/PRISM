import type { WebSearchPayload, WebSearchResult } from "@localai/shared";
import { recordDeveloperTranscriptEvent } from "./usage.ts";

const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const WEB_SEARCH_RESULT_LIMIT = 5;
const WEB_SEARCH_QUERY_MAX_CHARS = 500;
const WEB_SEARCH_SNIPPET_MAX_CHARS = 360;
const WEB_SEARCH_TITLE_MAX_CHARS = 140;

function compactText(value: unknown, maxLength: number): string {
  if (Array.isArray(value)) {
    return compactText(
      value.filter((item) => typeof item === "string").join(" "),
      maxLength
    );
  }
  if (typeof value !== "string") return "";
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength
    ? compacted.slice(0, maxLength).trimEnd()
    : compacted;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function sourceFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return undefined;
  }
}

function normalizeBraveResult(value: unknown): WebSearchResult | null {
  const row = readRecord(value);
  if (!row) return null;
  const title = compactText(row.title, WEB_SEARCH_TITLE_MAX_CHARS);
  const url = readUrl(row.url);
  if (!title || !url) return null;
  const profile = readRecord(row.profile);
  const thumbnail = readRecord(row.thumbnail);
  const metaUrl = readRecord(row.meta_url);
  const source =
    compactText(profile?.name, 120) ||
    compactText(metaUrl?.hostname, 120) ||
    compactText(metaUrl?.netloc, 120) ||
    sourceFromUrl(url);
  const displayUrl =
    compactText(metaUrl?.path, 160) ||
    compactText(metaUrl?.netloc, 160) ||
    sourceFromUrl(url);
  const snippet =
    compactText(row.description, WEB_SEARCH_SNIPPET_MAX_CHARS) ||
    compactText(row.extra_snippets, WEB_SEARCH_SNIPPET_MAX_CHARS);
  const thumbnailUrl = readUrl(thumbnail?.src) ?? readUrl(profile?.img);
  const faviconUrl = readUrl(metaUrl?.favicon);
  const publishedAt =
    compactText(row.age, 80) ||
    compactText(row.page_age, 80) ||
    compactText(row.published, 80);
  return {
    title,
    url,
    ...(displayUrl ? { displayUrl } : {}),
    ...(source ? { source } : {}),
    ...(snippet ? { snippet } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
}

export function normalizeBraveWebSearchPayload(
  queryRaw: string,
  responseBody: unknown,
  fetchedAt = new Date().toISOString()
): WebSearchPayload {
  const query = compactText(queryRaw, WEB_SEARCH_QUERY_MAX_CHARS);
  if (!query) {
    throw new Error("Search query cannot be empty.");
  }
  const root = readRecord(responseBody);
  const web = readRecord(root?.web);
  const results = Array.isArray(web?.results)
    ? web.results
        .map(normalizeBraveResult)
        .filter((result): result is WebSearchResult => Boolean(result))
        .slice(0, WEB_SEARCH_RESULT_LIMIT)
    : [];
  if (results.length === 0) {
    throw new Error("Brave Search returned no usable results.");
  }
  return {
    v: 1,
    name: "WebSearch",
    provider: "brave",
    query,
    fetchedAt,
    results,
  };
}

export async function searchWebWithBrave(args: {
  query: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<WebSearchPayload> {
  const startedAt = Date.now();
  const apiKey = args.apiKey?.trim();
  if (!apiKey) {
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "web_search",
      provider: "brave",
      model: "web-search",
      request: { query: args.query },
      error: "Brave Search is not configured.",
      durationMs: Date.now() - startedAt,
    });
    throw new Error("BRAVE_SEARCH_API_KEY is required for WebSearch.");
  }
  const query = compactText(args.query, WEB_SEARCH_QUERY_MAX_CHARS);
  if (!query) {
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "web_search",
      provider: "brave",
      model: "web-search",
      request: { query: args.query },
      error: "Search query was empty.",
      durationMs: Date.now() - startedAt,
    });
    throw new Error("Search query cannot be empty.");
  }
  const url = new URL(BRAVE_WEB_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(WEB_SEARCH_RESULT_LIMIT));
  url.searchParams.set("text_decorations", "false");
  url.searchParams.set("spellcheck", "true");
  const diagnosticRequest = {
    method: "GET",
    url: url.toString(),
    query,
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": "[REDACTED]",
    },
  };
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: args.signal,
    });
  } catch (error) {
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "web_search",
      provider: "brave",
      model: "web-search",
      request: diagnosticRequest,
      error: args.signal?.aborted
        ? "Brave Search was aborted by the caller."
        : "Brave Search could not reach the provider.",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
  if (!response.ok) {
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "web_search",
      provider: "brave",
      model: "web-search",
      request: diagnosticRequest,
      error: `Brave Search failed with HTTP ${response.status}.`,
      durationMs: Date.now() - startedAt,
    });
    throw new Error(`Brave Search failed with HTTP ${response.status}.`);
  }
  const rawOutput = await response.json();
  try {
    const parsedOutput = normalizeBraveWebSearchPayload(query, rawOutput);
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "web_search",
      provider: "brave",
      model: "web-search",
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
      purpose: "web_search",
      provider: "brave",
      model: "web-search",
      request: diagnosticRequest,
      rawOutput,
      error: error instanceof Error ? error.message : "Brave Search result parsing failed.",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export function formatWebSearchForModel(payload: WebSearchPayload): string {
  return [
    `Web search results for: ${payload.query}`,
    `Fetched at: ${payload.fetchedAt}`,
    ...payload.results.map((result, index) => {
      const lines = [
        `${index + 1}. ${result.title}`,
        `URL: ${result.url}`,
      ];
      if (result.source) lines.push(`Source: ${result.source}`);
      if (result.publishedAt) lines.push(`Published: ${result.publishedAt}`);
      if (result.snippet) lines.push(`Snippet: ${result.snippet}`);
      return lines.join("\n");
    }),
    "Use these results as fresh context. Cite source names or URLs where useful. If results are insufficient, say so plainly.",
  ].join("\n\n");
}
