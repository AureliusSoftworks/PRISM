export interface YouTubeVideoEmbed {
  videoId: string;
  canonicalUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  startSeconds?: number;
}

export type YouTubeMarkdownPart =
  | { kind: "markdown"; markdown: string }
  | { kind: "youtube"; video: YouTubeVideoEmbed; source: string; label?: string };

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/u;
const YOUTUBE_URL_CANDIDATE_RE =
  /(?:https?:\/\/|\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/[^\s<>()\]]+/giu;
const MARKDOWN_LINK_CANDIDATE_RE =
  /\[([^\]\n]+)\]\((\s*(?:https?:\/\/|\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/[^)\s]+)\s*(?:["'][^)]*["']\s*)?\)/giu;

function parseUrl(rawUrl: string): URL | null {
  const trimmed = trimUrlCandidateSource(rawUrl);
  if (!trimmed) return null;
  const normalized =
    trimmed.startsWith("//")
      ? `https:${trimmed}`
      : /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function trimUrlCandidateSource(rawUrl: string): string {
  return rawUrl.trim().replace(/[.,;!?]+$/u, "");
}

function youtubeHostKind(hostname: string): "youtube" | "short" | null {
  const host = hostname.toLowerCase().replace(/^www\./u, "");
  if (host === "youtu.be") return "short";
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    return "youtube";
  }
  return null;
}

function cleanVideoId(raw: string | null | undefined): string | null {
  const id = raw?.trim().split(/[?&#/]/u)[0] ?? "";
  return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
}

function parseDurationToken(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (/^\d+$/u.test(normalized)) return Math.max(0, Number.parseInt(normalized, 10));
  const match = normalized.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/u);
  if (!match) return null;
  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseInt(match[3] ?? "0", 10);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function resolveStartSeconds(url: URL): number | undefined {
  const start = parseDurationToken(url.searchParams.get("start"));
  const t = parseDurationToken(url.searchParams.get("t"));
  const value = start ?? t;
  return value && value > 0 ? value : undefined;
}

function resolveVideoId(url: URL): string | null {
  const hostKind = youtubeHostKind(url.hostname);
  if (!hostKind) return null;
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (hostKind === "short") return cleanVideoId(pathParts[0]);
  const first = pathParts[0]?.toLowerCase() ?? "";
  if (first === "watch") return cleanVideoId(url.searchParams.get("v"));
  if (first === "shorts" || first === "live" || first === "embed") {
    return cleanVideoId(pathParts[1]);
  }
  return null;
}

export function resolveYouTubeVideoLink(rawUrl: string): YouTubeVideoEmbed | null {
  const url = parseUrl(rawUrl);
  if (!url) return null;
  const videoId = resolveVideoId(url);
  if (!videoId) return null;
  const startSeconds = resolveStartSeconds(url);
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  embed.searchParams.set("autoplay", "1");
  embed.searchParams.set("playsinline", "1");
  embed.searchParams.set("rel", "0");
  embed.searchParams.set("modestbranding", "1");
  if (startSeconds) embed.searchParams.set("start", String(startSeconds));
  const canonical = new URL("https://www.youtube.com/watch");
  canonical.searchParams.set("v", videoId);
  if (startSeconds) canonical.searchParams.set("t", String(startSeconds));
  return {
    videoId,
    canonicalUrl: canonical.toString(),
    embedUrl: embed.toString(),
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    ...(startSeconds ? { startSeconds } : {}),
  };
}

export function resolveYouTubeVideoEmbedForLink(
  rawUrl: string | null | undefined,
  enabled: boolean
): YouTubeVideoEmbed | null {
  if (!enabled || !rawUrl) return null;
  return resolveYouTubeVideoLink(rawUrl);
}

export function messageContainsYouTubeVideoLink(markdown: string): boolean {
  if (!markdown.trim()) return false;
  for (const match of markdown.matchAll(YOUTUBE_URL_CANDIDATE_RE)) {
    if (resolveYouTubeVideoLink(match[0])) return true;
  }
  return false;
}

interface YouTubeMarkdownMatch {
  start: number;
  end: number;
  source: string;
  label?: string;
  video: YouTubeVideoEmbed;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function splitMarkdownByYouTubeVideoLinks(markdown: string): YouTubeMarkdownPart[] {
  if (!markdown.trim()) return [{ kind: "markdown", markdown }];
  const matches: YouTubeMarkdownMatch[] = [];

  for (const match of markdown.matchAll(MARKDOWN_LINK_CANDIDATE_RE)) {
    const start = match.index ?? 0;
    const source = match[0] ?? "";
    const label = match[1]?.trim();
    const url = match[2]?.trim() ?? "";
    const video = resolveYouTubeVideoLink(url);
    if (!video) continue;
    matches.push({
      start,
      end: start + source.length,
      source,
      ...(label ? { label } : {}),
      video,
    });
  }

  for (const match of markdown.matchAll(YOUTUBE_URL_CANDIDATE_RE)) {
    const rawSource = match[0] ?? "";
    const trimmedSource = trimUrlCandidateSource(rawSource);
    if (!trimmedSource) continue;
    const start = match.index ?? 0;
    const end = start + trimmedSource.length;
    if (matches.some((candidate) => rangesOverlap(start, end, candidate.start, candidate.end))) {
      continue;
    }
    const video = resolveYouTubeVideoLink(trimmedSource);
    if (!video) continue;
    matches.push({
      start,
      end,
      source: trimmedSource,
      video,
    });
  }

  matches.sort((a, b) => a.start - b.start || a.end - b.end);
  if (matches.length === 0) return [{ kind: "markdown", markdown }];

  const parts: YouTubeMarkdownPart[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      const before = markdown.slice(cursor, match.start);
      if (before.trim()) parts.push({ kind: "markdown", markdown: before });
    }
    parts.push({
      kind: "youtube",
      video: match.video,
      source: match.source,
      ...(match.label ? { label: match.label } : {}),
    });
    cursor = Math.max(cursor, match.end);
  }
  if (cursor < markdown.length) {
    const after = markdown.slice(cursor);
    if (after.trim()) parts.push({ kind: "markdown", markdown: after });
  }

  return parts.length > 0 ? parts : [{ kind: "markdown", markdown }];
}
