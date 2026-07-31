import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const SOURCE_FETCH_TIMEOUT_MS = 8_000;
const SOURCE_FETCH_MAX_BYTES = 1_048_576;
const SOURCE_REDIRECT_MAX = 3;
const SOURCE_TITLE_MAX_LENGTH = 240;
const SOURCE_SNIPPET_MAX_LENGTH = 800;
const SOURCE_PUBLISHED_AT_MAX_LENGTH = 64;

const TEXT_CONTENT_TYPES = new Set([
  "text/html",
  "text/plain",
  "application/xhtml+xml",
]);

export interface DebateSourceInspectionDraft {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
}

export interface DebateSourceInspectionResult {
  source: DebateSourceInspectionDraft;
  fetched: boolean;
}

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

interface SourceTransportResponse {
  status: number;
  contentType: string;
  location: string | null;
  body: Uint8Array;
}

export interface DebateSourceInspectionDependencies {
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  transport?: (
    url: URL,
    addresses: readonly ResolvedAddress[],
    signal: AbortSignal,
  ) => Promise<SourceTransportResponse>;
  timeoutMs?: number;
}

export class DebateSourceInspectionError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DebateSourceInspectionError";
    this.statusCode = statusCode;
  }
}

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/gu, " ").trim();
  return compacted.length > maxLength
    ? compacted.slice(0, maxLength).trimEnd()
    : compacted;
}

function parsedSourceUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new DebateSourceInspectionError(
      "Enter a complete HTTP or HTTPS URL.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new DebateSourceInspectionError(
      "Source URLs must use HTTP or HTTPS.",
    );
  }
  if (parsed.username || parsed.password) {
    throw new DebateSourceInspectionError(
      "Source URLs cannot contain a username or password.",
    );
  }
  const expectedPort = parsed.protocol === "https:" ? "443" : "80";
  if (parsed.port && parsed.port !== expectedPort) {
    throw new DebateSourceInspectionError(
      "Source URLs must use the standard HTTP or HTTPS port.",
    );
  }
  parsed.hash = "";
  return parsed;
}

function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  return parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function ipv4IsPublic(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [first, second, third] = octets;
  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  ) {
    return false;
  }
  if (
    (first === 192 && second === 0 && third <= 2) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  ) {
    return false;
  }
  return true;
}

function mappedIpv4Address(address: string): string | null {
  const normalized = address.toLowerCase();
  const mapped = normalized.match(/^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/u);
  return mapped?.[1] ?? null;
}

function ipv6IsPublic(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/gu, "");
  const mapped = mappedIpv4Address(normalized);
  if (mapped) return ipv4IsPublic(mapped);
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("::ffff:") ||
    /^fe[89ab][0-9a-f]:/u.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

export function debateSourceAddressIsPublic(address: string): boolean {
  const version = isIP(address.trim());
  return version === 4
    ? ipv4IsPublic(address.trim())
    : version === 6
      ? ipv6IsPublic(address.trim())
      : false;
}

function hostnameIsObviouslyPrivate(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/gu, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    (isIP(normalized) !== 0 && !debateSourceAddressIsPublic(normalized))
  );
}

function manualSourceDraft(url: URL): DebateSourceInspectionResult {
  if (hostnameIsObviouslyPrivate(url.hostname)) {
    throw new DebateSourceInspectionError(
      "Source URLs must point to a public website.",
    );
  }
  return {
    source: {
      title: url.hostname.replace(/^www\./iu, ""),
      url: url.toString(),
      snippet: "",
      publishedAt: null,
    },
    fetched: false,
  };
}

async function resolvePublicAddresses(
  hostname: string,
  resolve: NonNullable<DebateSourceInspectionDependencies["resolve"]>,
): Promise<ResolvedAddress[]> {
  if (hostnameIsObviouslyPrivate(hostname)) {
    throw new DebateSourceInspectionError(
      "Source URLs must point to a public website.",
    );
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolve(hostname);
  } catch {
    throw new DebateSourceInspectionError(
      "PRISM could not resolve that source URL.",
      422,
    );
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !debateSourceAddressIsPublic(address))
  ) {
    throw new DebateSourceInspectionError(
      "Source URLs must resolve only to public internet addresses.",
    );
  }
  return addresses;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

async function nodeTransport(
  url: URL,
  addresses: readonly ResolvedAddress[],
  signal: AbortSignal,
): Promise<SourceTransportResponse> {
  const selected = addresses[0]!;
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return await new Promise<SourceTransportResponse>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: {
          Accept: "text/html, application/xhtml+xml, text/plain;q=0.9",
          "Accept-Encoding": "identity",
          "User-Agent": "PRISM-Debate-Source/1.0",
        },
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all) {
            callback(null, [...addresses]);
            return;
          }
          callback(null, selected.address, selected.family);
        },
        signal,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > SOURCE_FETCH_MAX_BYTES) {
            req.destroy(
              new DebateSourceInspectionError(
                "That page is too large to inspect safely.",
                422,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 500,
            contentType: headerValue(response.headers, "content-type"),
            location: headerValue(response.headers, "location") || null,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/gu, (_match, decimal: string) =>
      String.fromCodePoint(Number(decimal)),
    )
    .replace(/&#x([0-9a-f]+);/giu, (_match, hexadecimal: string) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16)),
    )
    .replace(
      /&(amp|apos|gt|lt|nbsp|quot);/giu,
      (_match, entity: string) =>
        ({
          amp: "&",
          apos: "'",
          gt: ">",
          lt: "<",
          nbsp: " ",
          quot: '"',
        })[entity.toLowerCase()] ?? "",
    );
}

function htmlAttribute(tag: string, attribute: string): string {
  const match = tag.match(
    new RegExp(
      `\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "iu",
    ),
  );
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function htmlMetaContent(html: string, names: readonly string[]): string {
  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const key = htmlAttribute(tag, "name") || htmlAttribute(tag, "property");
    if (!names.some((name) => key.toLowerCase() === name.toLowerCase())) {
      continue;
    }
    const content = htmlAttribute(tag, "content");
    if (content) return content;
  }
  return "";
}

function visibleHtmlText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/giu, " ")
      .replace(/<!--[\s\S]*?-->/gu, " ")
      .replace(/<[^>]+>/gu, " "),
  );
}

export function debateSourceDraftFromDocument(args: {
  url: URL;
  contentType: string;
  body: Uint8Array;
}): DebateSourceInspectionDraft {
  const mediaType = args.contentType.split(";", 1)[0]!.trim().toLowerCase();
  if (!TEXT_CONTENT_TYPES.has(mediaType)) {
    throw new DebateSourceInspectionError(
      "That URL does not point to a readable web page or text document.",
      422,
    );
  }
  if (args.body.byteLength > SOURCE_FETCH_MAX_BYTES) {
    throw new DebateSourceInspectionError(
      "That page is too large to inspect safely.",
      422,
    );
  }
  const document = new TextDecoder("utf-8", { fatal: false }).decode(args.body);
  const isHtml = mediaType !== "text/plain";
  const titleFromTag = isHtml
    ? decodeHtmlEntities(
        document.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? "",
      )
    : "";
  const title = compactText(
    (isHtml
      ? htmlMetaContent(document, ["og:title", "twitter:title"]) || titleFromTag
      : document.split(/\r?\n/u).find((line) => line.trim()) || "") ||
      args.url.hostname.replace(/^www\./iu, ""),
    SOURCE_TITLE_MAX_LENGTH,
  );
  const description = isHtml
    ? htmlMetaContent(document, [
        "description",
        "og:description",
        "twitter:description",
      ])
    : "";
  const snippet = compactText(
    description || (isHtml ? visibleHtmlText(document) : document),
    SOURCE_SNIPPET_MAX_LENGTH,
  );
  const publishedAt = isHtml
    ? compactText(
        htmlMetaContent(document, [
          "article:published_time",
          "date",
          "datepublished",
          "publication_date",
        ]),
        SOURCE_PUBLISHED_AT_MAX_LENGTH,
      ) || null
    : null;
  return {
    title,
    url: args.url.toString(),
    snippet,
    publishedAt,
  };
}

async function defaultResolver(hostname: string): Promise<ResolvedAddress[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.flatMap((result) =>
    result.family === 4 || result.family === 6
      ? [{ address: result.address, family: result.family }]
      : [],
  );
}

async function withAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  return await new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("The operation was aborted.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export async function inspectDebateSourceUrl(
  rawUrl: string,
  options: {
    allowNetwork: boolean;
    dependencies?: DebateSourceInspectionDependencies;
  },
): Promise<DebateSourceInspectionResult> {
  let current = parsedSourceUrl(rawUrl);
  if (!options.allowNetwork) return manualSourceDraft(current);

  const resolve = options.dependencies?.resolve ?? defaultResolver;
  const transport = options.dependencies?.transport ?? nodeTransport;
  const timeoutMs = Math.max(
    250,
    options.dependencies?.timeoutMs ?? SOURCE_FETCH_TIMEOUT_MS,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let redirect = 0; redirect <= SOURCE_REDIRECT_MAX; redirect += 1) {
      let addresses: ResolvedAddress[];
      try {
        addresses = await withAbort(
          resolvePublicAddresses(current.hostname, resolve),
          controller.signal,
        );
      } catch (error) {
        if (error instanceof DebateSourceInspectionError) throw error;
        throw new DebateSourceInspectionError(
          controller.signal.aborted
            ? "The source took too long to respond."
            : "PRISM could not resolve that source URL.",
          422,
        );
      }
      let response: SourceTransportResponse;
      try {
        response = await withAbort(
          transport(current, addresses, controller.signal),
          controller.signal,
        );
      } catch (error) {
        if (error instanceof DebateSourceInspectionError) throw error;
        throw new DebateSourceInspectionError(
          controller.signal.aborted
            ? "The source took too long to respond."
            : "PRISM could not read that source. You can enter its details manually.",
          422,
        );
      }
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.location
      ) {
        if (redirect === SOURCE_REDIRECT_MAX) {
          throw new DebateSourceInspectionError(
            "That source redirected too many times.",
            422,
          );
        }
        current = parsedSourceUrl(
          new URL(response.location, current).toString(),
        );
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new DebateSourceInspectionError(
          `That source returned HTTP ${response.status}. You can enter its details manually.`,
          422,
        );
      }
      return {
        source: debateSourceDraftFromDocument({
          url: current,
          contentType: response.contentType,
          body: response.body,
        }),
        fetched: true,
      };
    }
    throw new DebateSourceInspectionError(
      "That source redirected too many times.",
      422,
    );
  } finally {
    clearTimeout(timeout);
  }
}
