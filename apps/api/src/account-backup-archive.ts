import { strFromU8, unzipSync } from "fflate";
import {
  PROJECT_OWNED_ASSET_MANIFEST_PATH,
  isProjectOwnedAssetBlobArchivePath,
  type ProjectOwnedAssetManifestV1,
} from "@localai/shared";
import type { BackupSnapshot } from "./backup.ts";
import {
  PROJECT_OWNED_ASSET_TOTAL_MAX_BYTES,
  type ProjectOwnedAssetArchiveBundleV1,
} from "./project-owned-assets.ts";

export const ACCOUNT_BACKUP_ARCHIVE_CONTENT_TYPE =
  "application/vnd.prism.backup+zip";
export const ACCOUNT_BACKUP_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;
export const ACCOUNT_BACKUP_EXPANDED_JSON_MAX_BYTES = 60 * 1024 * 1024;
const ACCOUNT_BACKUP_MANIFEST_MAX_BYTES = 1024 * 1024;
const ACCOUNT_BACKUP_JSON_ENTRY_MAX_COUNT = 8;
const ACCOUNT_BACKUP_ASSET_ENTRY_MAX_COUNT = 512;

export interface DecodedAccountBackupArchive {
  snapshot: BackupSnapshot;
  projectOwnedAssets?: ProjectOwnedAssetArchiveBundleV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSafeArchivePath(path: string): boolean {
  if (!path || path !== path.trim() || path.startsWith("/") || path.includes("\\")) {
    return false;
  }
  const segments = path.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

function isLegacyRootJsonPath(path: string): boolean {
  return /^[a-zA-Z0-9._-]+\.json$/u.test(path);
}

function parseJsonEntry(bytes: Uint8Array, label: string): unknown {
  let raw: string;
  try {
    raw = strFromU8(bytes);
  } catch {
    throw new Error(`${label} is not UTF-8.`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

export function decodeAccountBackupArchive(
  payload: Uint8Array,
): DecodedAccountBackupArchive {
  if (
    !(payload instanceof Uint8Array) ||
    payload.byteLength === 0 ||
    payload.byteLength > ACCOUNT_BACKUP_ARCHIVE_MAX_BYTES
  ) {
    throw new Error(".prism account backup archive is too large.");
  }

  let jsonBytes = 0;
  let jsonCount = 0;
  let assetBytes = 0;
  let assetCount = 0;
  const seenPaths = new Set<string>();
  let validationError: Error | null = null;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(payload, {
      filter: (file) => {
        try {
          const path = file.name;
          if (!isSafeArchivePath(path) || seenPaths.has(path)) {
            throw new Error(".prism archive contains an unsafe or repeated path.");
          }
          seenPaths.add(path);
          if (path === PROJECT_OWNED_ASSET_MANIFEST_PATH) {
            if (file.originalSize > ACCOUNT_BACKUP_MANIFEST_MAX_BYTES) {
              throw new Error("Project asset manifest is too large.");
            }
            return true;
          }
          if (isProjectOwnedAssetBlobArchivePath(path)) {
            assetCount += 1;
            assetBytes += file.originalSize;
            if (
              assetCount > ACCOUNT_BACKUP_ASSET_ENTRY_MAX_COUNT ||
              assetBytes > PROJECT_OWNED_ASSET_TOTAL_MAX_BYTES
            ) {
              throw new Error("Project asset archive expands beyond its safe limit.");
            }
            return true;
          }
          if (isLegacyRootJsonPath(path)) {
            jsonCount += 1;
            jsonBytes += file.originalSize;
            if (
              jsonCount > ACCOUNT_BACKUP_JSON_ENTRY_MAX_COUNT ||
              jsonBytes > ACCOUNT_BACKUP_EXPANDED_JSON_MAX_BYTES
            ) {
              throw new Error(".prism account backup payload is too large.");
            }
            return true;
          }
          throw new Error(".prism archive contains an unsupported file path.");
        } catch (error) {
          validationError =
            error instanceof Error ? error : new Error(".prism archive is invalid.");
          throw validationError;
        }
      },
    });
  } catch {
    if (validationError) throw validationError;
    throw new Error("Could not read .prism archive.");
  }

  const jsonEntries = Object.entries(entries).filter(([path]) =>
    isLegacyRootJsonPath(path),
  );
  const preferred = jsonEntries.find(([path]) => path.toLowerCase() === "backup.json");
  const backupEntry = preferred ?? jsonEntries[0];
  if (!backupEntry) {
    throw new Error(".prism file does not contain a JSON backup payload.");
  }
  const parsed = parseJsonEntry(backupEntry[1], ".prism backup JSON");
  if (!isRecord(parsed)) {
    throw new Error("Backup file is not a valid JSON object.");
  }

  let snapshot: unknown;
  let expectsProjectAssets = false;
  if (parsed.schema === "prism-account-backup-v1") {
    if (!("snapshot" in parsed)) throw new Error("Backup file is missing snapshot data.");
    snapshot = parsed.snapshot;
    if ("projectOwnedAssets" in parsed) {
      if (
        !isRecord(parsed.projectOwnedAssets) ||
        parsed.projectOwnedAssets.manifestPath !== PROJECT_OWNED_ASSET_MANIFEST_PATH
      ) {
        throw new Error("Backup file contains an invalid project asset reference.");
      }
      expectsProjectAssets = true;
    }
  } else if (
    parsed.version === 1 &&
    Array.isArray(parsed.conversations) &&
    Array.isArray(parsed.memories)
  ) {
    snapshot = parsed;
  } else {
    throw new Error("Unsupported .prism backup format.");
  }

  const manifestBytes = entries[PROJECT_OWNED_ASSET_MANIFEST_PATH];
  if (expectsProjectAssets !== Boolean(manifestBytes)) {
    throw new Error(
      expectsProjectAssets
        ? "Project asset manifest is missing from this backup."
        : "Backup contains an unreferenced project asset manifest.",
    );
  }

  if (!manifestBytes) {
    return { snapshot: snapshot as BackupSnapshot };
  }
  if (manifestBytes.byteLength > ACCOUNT_BACKUP_MANIFEST_MAX_BYTES) {
    throw new Error("Project asset manifest is too large.");
  }
  const manifest = parseJsonEntry(
    manifestBytes,
    "Project asset manifest",
  ) as ProjectOwnedAssetManifestV1;
  const files = Object.fromEntries(
    Object.entries(entries).filter(([path]) =>
      isProjectOwnedAssetBlobArchivePath(path),
    ),
  );
  const actualAssetBytes = Object.values(files).reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  );
  if (actualAssetBytes > PROJECT_OWNED_ASSET_TOTAL_MAX_BYTES) {
    throw new Error("Project asset archive expands beyond its safe limit.");
  }
  return {
    snapshot: snapshot as BackupSnapshot,
    projectOwnedAssets: { manifest, files },
  };
}

