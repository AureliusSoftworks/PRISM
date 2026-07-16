import { strToU8, unzipSync } from "fflate";
import {
  PROJECT_OWNED_ASSET_MANIFEST_PATH,
  PROJECT_OWNED_ASSET_MANIFEST_SCHEMA,
  isProjectOwnedAssetBlobArchivePath,
  type ProjectOwnedAssetExportPayloadV1,
} from "@localai/shared";

export const ACCOUNT_BACKUP_ARCHIVE_CONTENT_TYPE =
  "application/vnd.prism.backup+zip";
export const ACCOUNT_BACKUP_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;
export const ACCOUNT_BACKUP_EXPANDED_JSON_MAX_BYTES = 60 * 1024 * 1024;
export const ACCOUNT_BACKUP_JSON_ENTRY_MAX_COUNT = 8;
export const ACCOUNT_BACKUP_PROJECT_ASSET_MAX_BYTES = 56 * 1024 * 1024;
export const ACCOUNT_BACKUP_PROJECT_ASSET_MAX_COUNT = 512;
const ACCOUNT_BACKUP_PROJECT_ASSET_MANIFEST_MAX_BYTES = 1024 * 1024;

export interface AccountBackupArchiveLimits {
  maxArchiveBytes?: number;
  maxExpandedJsonBytes?: number;
  maxJsonEntries?: number;
  maxProjectAssetBytes?: number;
  maxProjectAssetEntries?: number;
}

function isSafeArchivePath(path: string): boolean {
  if (!path || path !== path.trim() || path.startsWith("/") || path.includes("\\")) {
    return false;
  }
  return path
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isLegacyRootJsonPath(path: string): boolean {
  return /^[a-zA-Z0-9._-]+\.json$/u.test(path);
}

export function projectOwnedAssetArchiveEntries(
  payload: ProjectOwnedAssetExportPayloadV1,
): Record<string, Uint8Array> {
  if (
    !payload ||
    payload.manifest?.schema !== PROJECT_OWNED_ASSET_MANIFEST_SCHEMA ||
    !Array.isArray(payload.manifest.entries) ||
    payload.manifest.entries.length > ACCOUNT_BACKUP_PROJECT_ASSET_MAX_COUNT ||
    !payload.files ||
    typeof payload.files !== "object"
  ) {
    throw new Error("Backup export returned invalid project asset data.");
  }
  const manifestPaths = new Set(
    payload.manifest.entries.map((entry) => entry.archivePath),
  );
  const encodedPaths = Object.keys(payload.files);
  if (
    encodedPaths.length !== manifestPaths.size ||
    encodedPaths.some(
      (path) =>
        !isProjectOwnedAssetBlobArchivePath(path) || !manifestPaths.has(path),
    )
  ) {
    throw new Error("Backup export returned incomplete project asset files.");
  }

  let totalBytes = 0;
  const files: Record<string, Uint8Array> = {};
  for (const path of encodedPaths) {
    const encoded = payload.files[path];
    if (
      typeof encoded !== "string" ||
      encoded.length === 0 ||
      !/^[a-zA-Z0-9+/]+={0,2}$/u.test(encoded)
    ) {
      throw new Error("Backup export returned an invalid project asset file.");
    }
    let binary: string;
    try {
      binary = atob(encoded);
    } catch {
      throw new Error("Backup export returned an unreadable project asset file.");
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    totalBytes += bytes.byteLength;
    if (totalBytes > ACCOUNT_BACKUP_PROJECT_ASSET_MAX_BYTES) {
      throw new Error("Project assets are too large to include safely.");
    }
    files[path] = bytes;
  }

  const manifestBytes = strToU8(
    `${JSON.stringify(payload.manifest, null, 2)}\n`,
  );
  if (manifestBytes.byteLength > ACCOUNT_BACKUP_PROJECT_ASSET_MANIFEST_MAX_BYTES) {
    throw new Error("Project asset manifest is too large to include safely.");
  }
  return {
    [PROJECT_OWNED_ASSET_MANIFEST_PATH]: manifestBytes,
    ...files,
  };
}

export function unzipAccountBackupEntries(
  archiveBytes: Uint8Array,
  limits: AccountBackupArchiveLimits = {},
): Record<string, Uint8Array> {
  const maxArchiveBytes =
    limits.maxArchiveBytes ?? ACCOUNT_BACKUP_ARCHIVE_MAX_BYTES;
  const maxExpandedJsonBytes =
    limits.maxExpandedJsonBytes ?? ACCOUNT_BACKUP_EXPANDED_JSON_MAX_BYTES;
  const maxJsonEntries =
    limits.maxJsonEntries ?? ACCOUNT_BACKUP_JSON_ENTRY_MAX_COUNT;
  const maxProjectAssetBytes =
    limits.maxProjectAssetBytes ?? ACCOUNT_BACKUP_PROJECT_ASSET_MAX_BYTES;
  const maxProjectAssetEntries =
    limits.maxProjectAssetEntries ?? ACCOUNT_BACKUP_PROJECT_ASSET_MAX_COUNT;
  if (archiveBytes.byteLength === 0 || archiveBytes.byteLength > maxArchiveBytes) {
    throw new Error(".prism account backup archive is too large.");
  }

  let expandedJsonBytes = 0;
  let jsonEntryCount = 0;
  let projectAssetBytes = 0;
  let projectAssetEntryCount = 0;
  const seenPaths = new Set<string>();
  let validationError: Error | null = null;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archiveBytes, {
      filter: (file) => {
        try {
          const path = file.name;
          if (!isSafeArchivePath(path) || seenPaths.has(path)) {
            throw new Error(".prism archive contains an unsafe or repeated path.");
          }
          seenPaths.add(path);
          if (path === PROJECT_OWNED_ASSET_MANIFEST_PATH) {
            if (file.originalSize > ACCOUNT_BACKUP_PROJECT_ASSET_MANIFEST_MAX_BYTES) {
              throw new Error("Project asset manifest is too large.");
            }
            return true;
          }
          if (isProjectOwnedAssetBlobArchivePath(path)) {
            projectAssetEntryCount += 1;
            projectAssetBytes += file.originalSize;
            if (
              projectAssetEntryCount > maxProjectAssetEntries ||
              projectAssetBytes > maxProjectAssetBytes
            ) {
              throw new Error("Project asset archive expands beyond its safe limit.");
            }
            return true;
          }
          if (isLegacyRootJsonPath(path)) {
            jsonEntryCount += 1;
            expandedJsonBytes += file.originalSize;
            if (
              jsonEntryCount > maxJsonEntries ||
              expandedJsonBytes > maxExpandedJsonBytes
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
  if (!Object.keys(entries).some((path) => isLegacyRootJsonPath(path))) {
    throw new Error(".prism file does not contain a JSON backup payload.");
  }
  return entries;
}

/** Legacy export retained for callers that only need the JSON entries. */
export function unzipAccountBackupJsonEntries(
  archiveBytes: Uint8Array,
  limits: AccountBackupArchiveLimits = {},
): Record<string, Uint8Array> {
  return Object.fromEntries(
    Object.entries(unzipAccountBackupEntries(archiveBytes, limits)).filter(
      ([path]) => isLegacyRootJsonPath(path),
    ),
  );
}
