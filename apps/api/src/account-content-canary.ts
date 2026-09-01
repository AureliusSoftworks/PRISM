import { createHash } from "node:crypto";

export const ZERO_PLAINTEXT_CANARY_SCANNER_VERSION = 1 as const;

export type CanarySurfaceKind =
  | "sqlite-main"
  | "sqlite-wal"
  | "sqlite-shm"
  | "filesystem"
  | "browser-local-storage"
  | "browser-session-storage"
  | "browser-indexed-db"
  | "search-index"
  | "runtime-cache"
  | "log-diagnostic"
  | "backup-export";

export interface PlaintextCanaryFixture {
  /** Produced by createOpaqueCanarySurfaceId; paths/account IDs are never reported. */
  opaqueSurfaceId: string;
  kind: CanarySurfaceKind;
  bytes: string | Uint8Array | ArrayBuffer;
}

export interface PlaintextCanaryMatch {
  opaqueSurfaceId: string;
  matchCount: number;
}

export interface PlaintextCanaryScanReport {
  version: typeof ZERO_PLAINTEXT_CANARY_SCANNER_VERSION;
  scannedSurfaceCount: number;
  matchedSurfaceCount: number;
  totalMatchCount: number;
  matches: readonly PlaintextCanaryMatch[];
}

const OPAQUE_SURFACE_ID = /^surface:[a-f0-9]{24}$/u;
const MIN_CANARY_BYTES = 12;

/**
 * Turns a path/key/fixture label into a stable opaque identifier. The source
 * locator is intentionally absent from scan reports and errors.
 */
export function createOpaqueCanarySurfaceId(
  namespace: string,
  stableLocator: string,
): string {
  const normalizedNamespace = namespace.trim().toLowerCase();
  if (!/^[a-z][a-z-]{1,31}$/u.test(normalizedNamespace)) {
    throw new TypeError("Canary surface namespace is invalid.");
  }
  const digest = createHash("sha256")
    .update(normalizedNamespace)
    .update("\0")
    .update(stableLocator)
    .digest("hex");
  return `surface:${digest.slice(0, 24)}`;
}

function bytesOf(value: string | Uint8Array | ArrayBuffer): Buffer {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("Canary scan payload must be bytes or a string.");
}

function countMatches(haystack: Buffer, needle: Buffer): number {
  let count = 0;
  let offset = 0;
  while (offset <= haystack.byteLength - needle.byteLength) {
    const match = haystack.indexOf(needle, offset);
    if (match < 0) break;
    count += 1;
    // Advance one byte so overlapping byte fixtures are also detected.
    offset = match + 1;
  }
  return count;
}

/**
 * Exact byte scanner for release fixtures and migration verification.
 *
 * It deliberately knows nothing about the artifact format: callers can feed
 * SQLite/WAL snapshots, files, serialized browser stores, Qdrant/FTS payloads,
 * logs, queues, and backup archives through the same non-disclosing boundary.
 */
export function scanForPlaintextCanary(
  canary: string | Uint8Array | ArrayBuffer,
  fixtures: readonly PlaintextCanaryFixture[],
): PlaintextCanaryScanReport {
  const needle = bytesOf(canary);
  if (needle.byteLength < MIN_CANARY_BYTES) {
    throw new TypeError("Canary value is too short for a reliable scan.");
  }

  const matches: PlaintextCanaryMatch[] = [];
  for (const fixture of fixtures) {
    if (!OPAQUE_SURFACE_ID.test(fixture.opaqueSurfaceId)) {
      throw new TypeError("Canary fixture surface identifier is not opaque.");
    }
    const matchCount = countMatches(bytesOf(fixture.bytes), needle);
    if (matchCount === 0) continue;
    matches.push(
      Object.freeze({
        opaqueSurfaceId: fixture.opaqueSurfaceId,
        matchCount,
      }),
    );
  }

  matches.sort((left, right) =>
    left.opaqueSurfaceId.localeCompare(right.opaqueSurfaceId),
  );
  const totalMatchCount = matches.reduce(
    (total, match) => total + match.matchCount,
    0,
  );
  return Object.freeze({
    version: ZERO_PLAINTEXT_CANARY_SCANNER_VERSION,
    scannedSurfaceCount: fixtures.length,
    matchedSurfaceCount: matches.length,
    totalMatchCount,
    matches: Object.freeze(matches),
  });
}
