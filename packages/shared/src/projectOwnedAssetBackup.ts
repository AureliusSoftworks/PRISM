export const PROJECT_OWNED_ASSET_MANIFEST_SCHEMA =
  "prism-project-owned-assets-v1" as const;
export const PROJECT_OWNED_ASSET_MANIFEST_PATH =
  "project-assets/manifest.json" as const;
export const PROJECT_OWNED_ASSET_BLOB_PREFIX =
  "project-assets/blobs/sha256/" as const;

export type ProjectOwnedAssetOwnerTypeV1 = "signal-show";
export type ProjectOwnedAssetMediaTypeV1 = "image" | "audio";
export type SignalProjectOwnedAssetSlotV1 =
  | "light-studio"
  | "dark-studio"
  | "logo"
  | "intro-audio"
  | "atmosphere-audio";

export interface SignalProjectImageRestoreMetadataV1 {
  schema: "prism-signal-image-restore-v1";
  sourceImageId: string;
  prompt: string;
  revisedPrompt: string | null;
  size: string;
  quality: string;
  provider: string;
  model: string;
  createdAt: string;
}

export interface SignalProjectAudioRestoreMetadataV1 {
  schema: "prism-signal-audio-restore-v1";
  provider: "elevenlabs";
  model: string;
  prompt: string;
  durationMs: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectOwnedAssetRestoreMetadataV1 =
  | SignalProjectImageRestoreMetadataV1
  | SignalProjectAudioRestoreMetadataV1;

/**
 * Common, owner-addressed contract for durable applet files. Owner-specific
 * restore metadata is versioned independently so future applets can add their
 * own covers, backgrounds, audio, and similar project-grade assets without
 * widening account backup selection to the whole Images library.
 */
export interface ProjectOwnedAssetManifestEntryV1 {
  ownerType: ProjectOwnedAssetOwnerTypeV1;
  ownerId: string;
  logicalSlot: SignalProjectOwnedAssetSlotV1;
  mediaType: ProjectOwnedAssetMediaTypeV1;
  contentType: string;
  checksum: string;
  byteLength: number;
  archivePath: string;
  restore: ProjectOwnedAssetRestoreMetadataV1;
}

export interface ProjectOwnedAssetManifestV1 {
  schema: typeof PROJECT_OWNED_ASSET_MANIFEST_SCHEMA;
  entries: ProjectOwnedAssetManifestEntryV1[];
}

/** JSON-safe transport returned by the API while the web app assembles `.prism`. */
export interface ProjectOwnedAssetExportPayloadV1 {
  manifest: ProjectOwnedAssetManifestV1;
  files: Record<string, string>;
}

export interface ProjectOwnedAssetBackupReferenceV1 {
  manifestPath: typeof PROJECT_OWNED_ASSET_MANIFEST_PATH;
}

const SHA256_CHECKSUM_PATTERN = /^sha256:([a-f0-9]{64})$/u;

export function projectOwnedAssetBlobArchivePathForChecksum(
  checksum: string,
): string | null {
  const match = SHA256_CHECKSUM_PATTERN.exec(checksum);
  return match?.[1]
    ? `${PROJECT_OWNED_ASSET_BLOB_PREFIX}${match[1]}`
    : null;
}

export function isProjectOwnedAssetBlobArchivePath(path: string): boolean {
  return /^project-assets\/blobs\/sha256\/[a-f0-9]{64}$/u.test(path);
}
