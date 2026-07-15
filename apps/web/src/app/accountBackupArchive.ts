import { unzipSync } from "fflate";

export const ACCOUNT_BACKUP_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;
export const ACCOUNT_BACKUP_EXPANDED_JSON_MAX_BYTES = 60 * 1024 * 1024;
export const ACCOUNT_BACKUP_JSON_ENTRY_MAX_COUNT = 8;

export interface AccountBackupArchiveLimits {
  maxArchiveBytes?: number;
  maxExpandedJsonBytes?: number;
  maxJsonEntries?: number;
}

export function unzipAccountBackupJsonEntries(
  archiveBytes: Uint8Array,
  limits: AccountBackupArchiveLimits = {},
): Record<string, Uint8Array> {
  const maxArchiveBytes =
    limits.maxArchiveBytes ?? ACCOUNT_BACKUP_ARCHIVE_MAX_BYTES;
  const maxExpandedJsonBytes =
    limits.maxExpandedJsonBytes ?? ACCOUNT_BACKUP_EXPANDED_JSON_MAX_BYTES;
  const maxJsonEntries =
    limits.maxJsonEntries ?? ACCOUNT_BACKUP_JSON_ENTRY_MAX_COUNT;
  if (archiveBytes.byteLength === 0 || archiveBytes.byteLength > maxArchiveBytes) {
    throw new Error(".prism account backup archive is too large.");
  }

  let expandedJsonBytes = 0;
  let jsonEntryCount = 0;
  let unsupportedEntry = false;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archiveBytes, {
      filter: (file) => {
        const isJson = file.name.trim().toLowerCase().endsWith(".json");
        if (!isJson) {
          unsupportedEntry = true;
          return false;
        }
        jsonEntryCount += 1;
        expandedJsonBytes += file.originalSize;
        if (
          jsonEntryCount > maxJsonEntries ||
          expandedJsonBytes > maxExpandedJsonBytes
        ) {
          throw new Error(".prism account backup payload is too large.");
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && /account backup/u.test(error.message)) {
      throw error;
    }
    throw new Error("Could not read .prism archive.");
  }
  if (unsupportedEntry) {
    throw new Error(
      ".prism account backups cannot contain PNG, SVG, accessory, or other asset files.",
    );
  }
  if (Object.keys(entries).length === 0) {
    throw new Error(".prism file does not contain a JSON backup payload.");
  }
  return entries;
}
