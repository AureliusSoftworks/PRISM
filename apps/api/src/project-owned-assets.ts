import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  PROJECT_OWNED_ASSET_MANIFEST_SCHEMA,
  projectOwnedAssetBlobArchivePathForChecksum,
  type ProjectOwnedAssetExportPayloadV1,
  type ProjectOwnedAssetManifestEntryV1,
  type ProjectOwnedAssetManifestV1,
  type SignalProjectAudioRestoreMetadataV1,
  type SignalProjectImageRestoreMetadataV1,
  type SignalProjectOwnedAssetSlotV1,
} from "@localai/shared";
import type { BackupSnapshot } from "./backup.ts";
import {
  buildGeneratedImageRelativePath,
  readGeneratedImageBytes,
  tryUnlinkGeneratedImageFile,
  writeGeneratedImageBytesExclusive,
} from "./image-storage.ts";
import { serializeImageRelatedBotIds } from "./image-provenance.ts";
import { randomId } from "./security.ts";

export const PROJECT_OWNED_IMAGE_MAX_BYTES = 16 * 1024 * 1024;
export const PROJECT_OWNED_AUDIO_MAX_BYTES = 4 * 1024 * 1024;
export const PROJECT_OWNED_ASSET_TOTAL_MAX_BYTES = 56 * 1024 * 1024;
export const PROJECT_OWNED_ASSET_MAX_ENTRIES = 512;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,256}$/u;
const SIGNAL_IMAGE_SLOTS = ["light-studio", "dark-studio", "logo"] as const;

interface SignalVisualReference {
  imageId: string | null;
  imageUrl: string | null;
}

interface SignalProjectAssetReferences {
  "light-studio": SignalVisualReference;
  "dark-studio": SignalVisualReference;
  logo: SignalVisualReference;
}

interface ExportImageRow {
  id: string;
  prompt: string;
  revised_prompt: string | null;
  size: string;
  quality: string;
  provider: string;
  model: string;
  local_rel_path: string | null;
  created_at: string;
}

interface ExportAudioRow {
  show_id: string;
  provider: "elevenlabs";
  model: string;
  prompt: string;
  content_type: string;
  audio_bytes: Uint8Array;
  duration_ms: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectOwnedAssetArchiveBundleV1 {
  manifest: ProjectOwnedAssetManifestV1;
  files: Record<string, Uint8Array>;
}

interface PreparedProjectImage {
  sourceImageId: string;
  restoredImageId: string;
  localRelPath: string;
  bytes: Buffer;
  hostBotId: string;
  restore: SignalProjectImageRestoreMetadataV1;
}

interface PreparedProjectImageReference {
  showId: string;
  slot: (typeof SIGNAL_IMAGE_SLOTS)[number];
  sourceImageId: string;
  restoredImageId: string;
}

interface PreparedProjectAudio {
  showId: string;
  slot: "intro-audio" | "atmosphere-audio";
  bytes: Buffer;
  contentType: "audio/mpeg";
  restore: SignalProjectAudioRestoreMetadataV1;
}

export interface PreparedProjectOwnedAssetImport {
  images: PreparedProjectImage[];
  imageReferences: PreparedProjectImageReference[];
  audio: PreparedProjectAudio[];
  stagedLocalRelPaths: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function optionalTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function signalVisualReference(value: unknown): SignalVisualReference | null {
  if (
    !isRecord(value) ||
    typeof value.seed !== "string" ||
    typeof value.prompt !== "string"
  ) {
    return null;
  }
  return {
    imageId: optionalTrimmedString(value.imageId),
    imageUrl: optionalTrimmedString(value.imageUrl),
  };
}

export function readSignalProjectAssetReferences(
  atmosphereJson: string,
): SignalProjectAssetReferences {
  try {
    const container = JSON.parse(atmosphereJson) as unknown;
    if (!isRecord(container)) throw new Error("invalid");
    const legacy = signalVisualReference(container) ?? {
      imageId: null,
      imageUrl: null,
    };
    return {
      "light-studio": signalVisualReference(container.dayAtmosphere) ?? legacy,
      "dark-studio": signalVisualReference(container.nightAtmosphere) ?? legacy,
      logo: signalVisualReference(container.logo) ?? {
        imageId: null,
        imageUrl: null,
      },
    };
  } catch {
    return {
      "light-studio": { imageId: null, imageUrl: null },
      "dark-studio": { imageId: null, imageUrl: null },
      logo: { imageId: null, imageUrl: null },
    };
  }
}

function isBundledSignalAssetUrl(value: string | null): boolean {
  return Boolean(value?.startsWith("/signal-studio/"));
}

function imageSlotLabel(slot: (typeof SIGNAL_IMAGE_SLOTS)[number]): string {
  if (slot === "light-studio") return "Light studio";
  if (slot === "dark-studio") return "Dark studio";
  return "logo";
}

function checksumFor(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function isPng(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength < 45 ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  ) {
    return false;
  }
  let offset = PNG_SIGNATURE.byteLength;
  let chunkIndex = 0;
  while (offset + 12 <= bytes.byteLength) {
    const length =
      ((bytes[offset]! << 24) |
        (bytes[offset + 1]! << 16) |
        (bytes[offset + 2]! << 8) |
        bytes[offset + 3]!) >>>
      0;
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const next = offset + 12 + length;
    if (next > bytes.byteLength) return false;
    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) return false;
      const width =
        ((bytes[offset + 8]! << 24) |
          (bytes[offset + 9]! << 16) |
          (bytes[offset + 10]! << 8) |
          bytes[offset + 11]!) >>>
        0;
      const height =
        ((bytes[offset + 12]! << 24) |
          (bytes[offset + 13]! << 16) |
          (bytes[offset + 14]! << 8) |
          bytes[offset + 15]!) >>>
        0;
      if (width === 0 || height === 0 || width * height > 40_000_000) return false;
    }
    if (type === "IEND") return length === 0 && next === bytes.byteLength;
    offset = next;
    chunkIndex += 1;
  }
  return false;
}

function isMpegAudio(bytes: Uint8Array): boolean {
  return (
    (bytes.byteLength >= 3 &&
      bytes[0] === 0x49 &&
      bytes[1] === 0x44 &&
      bytes[2] === 0x33) ||
    (bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
  );
}

function addDeduplicatedFile(
  files: Record<string, Uint8Array>,
  bytes: Buffer,
): { checksum: string; archivePath: string } {
  const checksum = checksumFor(bytes);
  const archivePath = projectOwnedAssetBlobArchivePathForChecksum(checksum);
  if (!archivePath) throw new Error("Could not address project asset backup bytes.");
  files[archivePath] ??= Uint8Array.from(bytes);
  return { checksum, archivePath };
}

function assertPortableSignalReference(
  showName: string,
  slot: (typeof SIGNAL_IMAGE_SLOTS)[number],
  reference: SignalVisualReference,
): void {
  if (
    reference.imageUrl &&
    !reference.imageId &&
    !isBundledSignalAssetUrl(reference.imageUrl)
  ) {
    throw new Error(
      `Account backup cannot include Signal ${imageSlotLabel(slot)} for “${showName}” because its active file has no durable image record.`,
    );
  }
}

function exportSignalImageEntry(args: {
  db: DatabaseSync;
  userId: string;
  showId: string;
  showName: string;
  slot: (typeof SIGNAL_IMAGE_SLOTS)[number];
  imageId: string;
  files: Record<string, Uint8Array>;
}): ProjectOwnedAssetManifestEntryV1 {
  const row = args.db
    .prepare(
      `SELECT id, prompt, revised_prompt, size, quality, provider, model,
              local_rel_path, created_at
         FROM images
        WHERE id = ? AND user_id = ?`,
    )
    .get(args.imageId, args.userId) as ExportImageRow | undefined;
  if (!row) {
    throw new Error(
      `Account backup cannot include Signal ${imageSlotLabel(args.slot)} for “${args.showName}” because its image record is unavailable.`,
    );
  }
  const localRelPath = row.local_rel_path?.trim();
  if (!localRelPath) {
    throw new Error(
      `Account backup cannot include Signal ${imageSlotLabel(args.slot)} for “${args.showName}” because its local file is unavailable.`,
    );
  }
  let bytes: Buffer;
  try {
    bytes = readGeneratedImageBytes(localRelPath);
  } catch {
    throw new Error(
      `Account backup cannot include Signal ${imageSlotLabel(args.slot)} for “${args.showName}” because its local file is missing.`,
    );
  }
  if (bytes.byteLength === 0 || bytes.byteLength > PROJECT_OWNED_IMAGE_MAX_BYTES) {
    throw new Error(
      `Account backup cannot include Signal ${imageSlotLabel(args.slot)} for “${args.showName}” because the image size is invalid.`,
    );
  }
  if (!isPng(bytes)) {
    throw new Error(
      `Account backup cannot include Signal ${imageSlotLabel(args.slot)} for “${args.showName}” because the image is not a valid PNG.`,
    );
  }
  const addressed = addDeduplicatedFile(args.files, bytes);
  return {
    ownerType: "signal-show",
    ownerId: args.showId,
    logicalSlot: args.slot,
    mediaType: "image",
    contentType: "image/png",
    checksum: addressed.checksum,
    byteLength: bytes.byteLength,
    archivePath: addressed.archivePath,
    restore: {
      schema: "prism-signal-image-restore-v1",
      sourceImageId: row.id,
      prompt: row.prompt,
      revisedPrompt: row.revised_prompt,
      size: row.size,
      quality: row.quality,
      provider: row.provider,
      model: row.model,
      createdAt: row.created_at,
    },
  };
}

function exportSignalAudioEntry(args: {
  showId: string;
  showName: string;
  slot: "intro-audio" | "atmosphere-audio";
  row: ExportAudioRow;
  files: Record<string, Uint8Array>;
}): ProjectOwnedAssetManifestEntryV1 {
  const bytes = Buffer.from(args.row.audio_bytes);
  if (bytes.byteLength === 0 || bytes.byteLength > PROJECT_OWNED_AUDIO_MAX_BYTES) {
    throw new Error(
      `Account backup cannot include Signal ${args.slot} for “${args.showName}” because its size is invalid.`,
    );
  }
  if (!/^audio\/(?:mpeg|mp3)$/iu.test(args.row.content_type) || !isMpegAudio(bytes)) {
    throw new Error(
      `Account backup cannot include Signal ${args.slot} for “${args.showName}” because its format is invalid.`,
    );
  }
  const addressed = addDeduplicatedFile(args.files, bytes);
  return {
    ownerType: "signal-show",
    ownerId: args.showId,
    logicalSlot: args.slot,
    mediaType: "audio",
    contentType: "audio/mpeg",
    checksum: addressed.checksum,
    byteLength: bytes.byteLength,
    archivePath: addressed.archivePath,
    restore: {
      schema: "prism-signal-audio-restore-v1",
      provider: "elevenlabs",
      model: args.row.model,
      prompt: args.row.prompt,
      durationMs: args.row.duration_ms,
      revision: args.row.revision,
      createdAt: args.row.created_at,
      updatedAt: args.row.updated_at,
    },
  };
}

/** Collect only files reached through durable project references. */
export function exportProjectOwnedAssets(
  db: DatabaseSync,
  userId: string,
): ProjectOwnedAssetArchiveBundleV1 {
  const shows = db
    .prepare(
      `SELECT id, name, atmosphere_json
         FROM botcast_shows
        WHERE user_id = ?
        ORDER BY id`,
    )
    .all(userId) as Array<{ id: string; name: string; atmosphere_json: string }>;
  const audioRows = db
    .prepare(
      `SELECT show_id, provider, model, prompt, content_type, audio_bytes,
              duration_ms, revision, created_at, updated_at
         FROM botcast_show_intro_audio
        WHERE user_id = ?`,
    )
    .all(userId) as unknown as ExportAudioRow[];
  const audioByShowId = new Map(audioRows.map((row) => [row.show_id, row] as const));
  const atmosphereAudioRows = db
    .prepare(
      `SELECT show_id, provider, model, prompt, content_type, audio_bytes,
              duration_ms, revision, created_at, updated_at
         FROM botcast_show_atmosphere_audio
        WHERE user_id = ?`,
    )
    .all(userId) as unknown as ExportAudioRow[];
  const atmosphereAudioByShowId = new Map(
    atmosphereAudioRows.map((row) => [row.show_id, row] as const),
  );
  const files: Record<string, Uint8Array> = {};
  const entries: ProjectOwnedAssetManifestEntryV1[] = [];

  for (const show of shows) {
    const references = readSignalProjectAssetReferences(show.atmosphere_json);
    for (const slot of SIGNAL_IMAGE_SLOTS) {
      const reference = references[slot];
      assertPortableSignalReference(show.name, slot, reference);
      if (!reference.imageId) continue;
      entries.push(
        exportSignalImageEntry({
          db,
          userId,
          showId: show.id,
          showName: show.name,
          slot,
          imageId: reference.imageId,
          files,
        }),
      );
    }
    const audio = audioByShowId.get(show.id);
    if (audio) {
      entries.push(
        exportSignalAudioEntry({
          showId: show.id,
          showName: show.name,
          slot: "intro-audio",
          row: audio,
          files,
        }),
      );
    }
    const atmosphereAudio = atmosphereAudioByShowId.get(show.id);
    if (atmosphereAudio) {
      entries.push(
        exportSignalAudioEntry({
          showId: show.id,
          showName: show.name,
          slot: "atmosphere-audio",
          row: atmosphereAudio,
          files,
        }),
      );
    }
  }

  if (entries.length > PROJECT_OWNED_ASSET_MAX_ENTRIES) {
    throw new Error("Account backup contains too many active project-owned assets.");
  }
  const uniqueBytes = Object.values(files).reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  );
  if (uniqueBytes > PROJECT_OWNED_ASSET_TOTAL_MAX_BYTES) {
    throw new Error("Active project-owned assets are too large to include safely.");
  }
  entries.sort(
    (left, right) =>
      left.ownerType.localeCompare(right.ownerType) ||
      left.ownerId.localeCompare(right.ownerId) ||
      left.logicalSlot.localeCompare(right.logicalSlot),
  );
  return {
    manifest: {
      schema: PROJECT_OWNED_ASSET_MANIFEST_SCHEMA,
      entries,
    },
    files,
  };
}

export function projectOwnedAssetExportPayload(
  bundle: ProjectOwnedAssetArchiveBundleV1,
): ProjectOwnedAssetExportPayloadV1 {
  return {
    manifest: bundle.manifest,
    files: Object.fromEntries(
      Object.entries(bundle.files).map(([path, bytes]) => [
        path,
        Buffer.from(bytes).toString("base64"),
      ]),
    ),
  };
}

/** New archives store cached audio as a deduplicated blob; legacy JSON stays readable. */
export function omitInlineProjectOwnedAssetBinaries(
  snapshot: BackupSnapshot,
  manifest: ProjectOwnedAssetManifestV1,
): void {
  const introAudioShowIds = new Set(
    manifest.entries
      .filter((entry) => entry.logicalSlot === "intro-audio")
      .map((entry) => entry.ownerId),
  );
  const atmosphereAudioShowIds = new Set(
    manifest.entries
      .filter((entry) => entry.logicalSlot === "atmosphere-audio")
      .map((entry) => entry.ownerId),
  );
  for (const show of snapshot.botcast?.shows ?? []) {
    if (show.introAudio && introAudioShowIds.has(show.id)) {
      delete show.introAudio.audioBase64;
    }
    if (show.atmosphereAudio && atmosphereAudioShowIds.has(show.id)) {
      delete show.atmosphereAudio.audioBase64;
    }
  }
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
  pattern?: RegExp,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    (pattern && !pattern.test(value))
  ) {
    throw new Error(`Project asset manifest contains an invalid ${label}.`);
  }
  return value;
}

function nullableString(value: unknown, label: string, maxLength: number): string | null {
  if (value === null) return null;
  return requiredString(value, label, maxLength);
}

function positiveInteger(
  value: unknown,
  label: string,
  maximum: number,
): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(`Project asset manifest contains an invalid ${label}.`);
  }
  return Number(value);
}

function normalizeImageRestore(value: unknown): SignalProjectImageRestoreMetadataV1 {
  if (!isRecord(value) || value.schema !== "prism-signal-image-restore-v1") {
    throw new Error("Project asset manifest contains invalid Signal image metadata.");
  }
  return {
    schema: "prism-signal-image-restore-v1",
    sourceImageId: requiredString(value.sourceImageId, "source image id", 256, SAFE_ID_PATTERN),
    prompt: requiredString(value.prompt, "image prompt", 100_000),
    revisedPrompt: nullableString(value.revisedPrompt, "revised image prompt", 100_000),
    size: requiredString(value.size, "image size", 40, /^\d{1,6}x\d{1,6}$/u),
    quality: requiredString(value.quality, "image quality", 120),
    provider: requiredString(value.provider, "image provider", 120),
    model: requiredString(value.model, "image model", 500),
    createdAt: requiredString(value.createdAt, "image timestamp", 100),
  };
}

function normalizeAudioRestore(value: unknown): SignalProjectAudioRestoreMetadataV1 {
  if (
    !isRecord(value) ||
    value.schema !== "prism-signal-audio-restore-v1" ||
    value.provider !== "elevenlabs"
  ) {
    throw new Error("Project asset manifest contains invalid Signal audio metadata.");
  }
  return {
    schema: "prism-signal-audio-restore-v1",
    provider: "elevenlabs",
    model: requiredString(value.model, "audio model", 500),
    prompt: requiredString(value.prompt, "audio prompt", 100_000),
    durationMs: positiveInteger(value.durationMs, "audio duration", 60 * 60 * 1000),
    revision: positiveInteger(value.revision, "audio revision", 1_000_000),
    createdAt: requiredString(value.createdAt, "audio created timestamp", 100),
    updatedAt: requiredString(value.updatedAt, "audio updated timestamp", 100),
  };
}

export function normalizeProjectOwnedAssetManifest(
  value: unknown,
): ProjectOwnedAssetManifestV1 {
  if (
    !isRecord(value) ||
    value.schema !== PROJECT_OWNED_ASSET_MANIFEST_SCHEMA ||
    !Array.isArray(value.entries) ||
    value.entries.length > PROJECT_OWNED_ASSET_MAX_ENTRIES
  ) {
    throw new Error("Project asset manifest is invalid or unsupported.");
  }
  const seenSlots = new Set<string>();
  const entries = value.entries.map((raw): ProjectOwnedAssetManifestEntryV1 => {
    if (!isRecord(raw) || raw.ownerType !== "signal-show") {
      throw new Error("Project asset manifest contains an unsupported owner.");
    }
    const ownerId = requiredString(raw.ownerId, "owner id", 256, SAFE_ID_PATTERN);
    const logicalSlot = raw.logicalSlot;
    if (
      logicalSlot !== "light-studio" &&
      logicalSlot !== "dark-studio" &&
      logicalSlot !== "logo" &&
      logicalSlot !== "intro-audio" &&
      logicalSlot !== "atmosphere-audio"
    ) {
      throw new Error("Project asset manifest contains an invalid logical slot.");
    }
    const slotKey = `signal-show\u0000${ownerId}\u0000${logicalSlot}`;
    if (seenSlots.has(slotKey)) {
      throw new Error("Project asset manifest repeats an owner slot.");
    }
    seenSlots.add(slotKey);
    const checksum = requiredString(
      raw.checksum,
      "checksum",
      71,
      /^sha256:[a-f0-9]{64}$/u,
    );
    const expectedPath = projectOwnedAssetBlobArchivePathForChecksum(checksum);
    const archivePath = requiredString(raw.archivePath, "archive path", 200);
    if (!expectedPath || archivePath !== expectedPath) {
      throw new Error("Project asset manifest contains an unsafe archive path.");
    }
    const imageSlot =
      logicalSlot !== "intro-audio" && logicalSlot !== "atmosphere-audio";
    if (
      (imageSlot && (raw.mediaType !== "image" || raw.contentType !== "image/png")) ||
      (!imageSlot && (raw.mediaType !== "audio" || raw.contentType !== "audio/mpeg"))
    ) {
      throw new Error("Project asset manifest contains an invalid content type.");
    }
    const byteLength = positiveInteger(
      raw.byteLength,
      "byte length",
      imageSlot ? PROJECT_OWNED_IMAGE_MAX_BYTES : PROJECT_OWNED_AUDIO_MAX_BYTES,
    );
    return {
      ownerType: "signal-show",
      ownerId,
      logicalSlot,
      mediaType: imageSlot ? "image" : "audio",
      contentType: imageSlot ? "image/png" : "audio/mpeg",
      checksum,
      byteLength,
      archivePath,
      restore: imageSlot
        ? normalizeImageRestore(raw.restore)
        : normalizeAudioRestore(raw.restore),
    };
  });
  return { schema: PROJECT_OWNED_ASSET_MANIFEST_SCHEMA, entries };
}

function entryKey(showId: string, slot: SignalProjectOwnedAssetSlotV1): string {
  return `${showId}\u0000${slot}`;
}

function assertBundleMatchesSnapshot(
  snapshot: BackupSnapshot,
  manifest: ProjectOwnedAssetManifestV1,
): Map<string, { showId: string; hostBotId: string; atmosphereJson: string }> {
  const shows = snapshot.botcast?.shows ?? [];
  const showsById = new Map(
    shows.map((show) => [
      show.id,
      { showId: show.id, hostBotId: show.hostBotId, atmosphereJson: show.atmosphereJson },
    ] as const),
  );
  const entriesBySlot = new Map(
    manifest.entries.map((entry) => [entryKey(entry.ownerId, entry.logicalSlot), entry] as const),
  );
  const expected = new Set<string>();

  for (const show of shows) {
    const references = readSignalProjectAssetReferences(show.atmosphereJson);
    for (const slot of SIGNAL_IMAGE_SLOTS) {
      const reference = references[slot];
      assertPortableSignalReference(show.name, slot, reference);
      if (!reference.imageId) continue;
      const key = entryKey(show.id, slot);
      expected.add(key);
      const entry = entriesBySlot.get(key);
      if (
        !entry ||
        entry.restore.schema !== "prism-signal-image-restore-v1" ||
        entry.restore.sourceImageId !== reference.imageId
      ) {
        throw new Error(
          `Project asset backup is missing Signal ${imageSlotLabel(slot)} for “${show.name}”.`,
        );
      }
    }
    if (show.introAudio) {
      const key = entryKey(show.id, "intro-audio");
      expected.add(key);
      if (!entriesBySlot.has(key)) {
        throw new Error(`Project asset backup is missing Signal intro audio for “${show.name}”.`);
      }
    }
    if (show.atmosphereAudio) {
      const key = entryKey(show.id, "atmosphere-audio");
      expected.add(key);
      if (!entriesBySlot.has(key)) {
        throw new Error(
          `Project asset backup is missing Signal atmosphere audio for “${show.name}”.`,
        );
      }
    }
  }
  for (const entry of manifest.entries) {
    const key = entryKey(entry.ownerId, entry.logicalSlot);
    if (!showsById.has(entry.ownerId) || !expected.has(key)) {
      throw new Error("Project asset manifest contains an unreferenced Signal asset.");
    }
  }
  return showsById;
}

export function prepareProjectOwnedAssetImport(
  userId: string,
  snapshot: BackupSnapshot,
  bundle: ProjectOwnedAssetArchiveBundleV1,
  options: {
    idFactory?: () => string;
    imageIdExists?: (imageId: string) => boolean;
  } = {},
): PreparedProjectOwnedAssetImport {
  const manifest = normalizeProjectOwnedAssetManifest(bundle.manifest);
  const showsById = assertBundleMatchesSnapshot(snapshot, manifest);
  const referencedPaths = new Set(manifest.entries.map((entry) => entry.archivePath));
  const actualPaths = Object.keys(bundle.files);
  if (
    actualPaths.length !== referencedPaths.size ||
    actualPaths.some((path) => !referencedPaths.has(path))
  ) {
    throw new Error("Project asset archive contains missing or unreferenced files.");
  }
  let totalBytes = 0;
  for (const path of referencedPaths) {
    const bytes = bundle.files[path];
    if (!(bytes instanceof Uint8Array)) {
      throw new Error(`Project asset archive is missing ${path}.`);
    }
    totalBytes += bytes.byteLength;
  }
  if (totalBytes > PROJECT_OWNED_ASSET_TOTAL_MAX_BYTES) {
    throw new Error("Project asset archive expands beyond its safe size limit.");
  }

  const restoredIdBySourceImageId = new Map<string, string>();
  const imageOwnerBySourceId = new Map<string, string>();
  const imageMetadataBySourceId = new Map<string, string>();
  const images: PreparedProjectImage[] = [];
  const imageReferences: PreparedProjectImageReference[] = [];
  const audio: PreparedProjectAudio[] = [];
  const generatedIds = new Set<string>();

  for (const entry of manifest.entries) {
    const fileBytes = bundle.files[entry.archivePath];
    if (!fileBytes || fileBytes.byteLength !== entry.byteLength) {
      throw new Error(`Project asset archive has the wrong size for ${entry.logicalSlot}.`);
    }
    if (checksumFor(fileBytes) !== entry.checksum) {
      throw new Error(`Project asset checksum failed for ${entry.logicalSlot}.`);
    }
    if (entry.mediaType === "image" && !isPng(fileBytes)) {
      throw new Error(`Project asset ${entry.logicalSlot} is not a valid PNG.`);
    }
    if (entry.mediaType === "audio" && !isMpegAudio(fileBytes)) {
      throw new Error("Project asset intro audio is not valid MPEG audio.");
    }
    const show = showsById.get(entry.ownerId)!;
    if (entry.restore.schema === "prism-signal-image-restore-v1") {
      const sourceImageId = entry.restore.sourceImageId;
      const existingOwner = imageOwnerBySourceId.get(sourceImageId);
      if (existingOwner && existingOwner !== show.hostBotId) {
        throw new Error("A Signal image cannot be restored for multiple project owners.");
      }
      imageOwnerBySourceId.set(sourceImageId, show.hostBotId);
      const metadataKey = JSON.stringify(entry.restore);
      const existingMetadata = imageMetadataBySourceId.get(sourceImageId);
      if (existingMetadata && existingMetadata !== metadataKey) {
        throw new Error("Project asset manifest conflicts on Signal image metadata.");
      }
      imageMetadataBySourceId.set(sourceImageId, metadataKey);
      let restoredImageId = restoredIdBySourceImageId.get(sourceImageId);
      if (!restoredImageId) {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const candidate = (options.idFactory ?? (() => randomId(12)))();
          if (
            SAFE_ID_PATTERN.test(candidate) &&
            !generatedIds.has(candidate) &&
            !options.imageIdExists?.(candidate)
          ) {
            restoredImageId = candidate;
            break;
          }
        }
        if (!restoredImageId) {
          throw new Error("Could not allocate a safe restored project image id.");
        }
        generatedIds.add(restoredImageId);
        restoredIdBySourceImageId.set(sourceImageId, restoredImageId);
        images.push({
          sourceImageId,
          restoredImageId,
          localRelPath: buildGeneratedImageRelativePath(userId, restoredImageId),
          bytes: Buffer.from(fileBytes),
          hostBotId: show.hostBotId,
          restore: entry.restore,
        });
      }
      imageReferences.push({
        showId: entry.ownerId,
        slot: entry.logicalSlot as PreparedProjectImageReference["slot"],
        sourceImageId,
        restoredImageId,
      });
    } else {
      audio.push({
        showId: entry.ownerId,
        slot: entry.logicalSlot as PreparedProjectAudio["slot"],
        bytes: Buffer.from(fileBytes),
        contentType: "audio/mpeg",
        restore: entry.restore,
      });
    }
  }

  return { images, imageReferences, audio, stagedLocalRelPaths: [] };
}

export function stagePreparedProjectOwnedAssetFiles(
  prepared: PreparedProjectOwnedAssetImport,
): void {
  try {
    for (const image of prepared.images) {
      writeGeneratedImageBytesExclusive(image.localRelPath, image.bytes);
      prepared.stagedLocalRelPaths.push(image.localRelPath);
    }
  } catch (error) {
    cleanupPreparedProjectOwnedAssetFiles(prepared);
    throw error;
  }
}

export function cleanupPreparedProjectOwnedAssetFiles(
  prepared: PreparedProjectOwnedAssetImport,
): void {
  for (const path of prepared.stagedLocalRelPaths.splice(0)) {
    tryUnlinkGeneratedImageFile(path);
  }
}

function setRestoredImageReference(
  value: unknown,
  sourceImageId: string,
  restoredImageId: string,
): boolean {
  if (!isRecord(value) || value.imageId !== sourceImageId) return false;
  value.imageId = restoredImageId;
  value.imageUrl = `/api/images/${encodeURIComponent(restoredImageId)}/file`;
  return true;
}

function remapSignalAtmosphereJson(
  raw: string,
  references: readonly PreparedProjectImageReference[],
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Restored Signal show metadata is not valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new Error("Restored Signal show metadata is invalid.");
  }
  for (const reference of references) {
    if (reference.slot === "light-studio") {
      setRestoredImageReference(
        parsed.dayAtmosphere,
        reference.sourceImageId,
        reference.restoredImageId,
      );
    } else if (reference.slot === "dark-studio") {
      setRestoredImageReference(
        parsed.nightAtmosphere,
        reference.sourceImageId,
        reference.restoredImageId,
      );
      setRestoredImageReference(
        parsed,
        reference.sourceImageId,
        reference.restoredImageId,
      );
    } else {
      setRestoredImageReference(
        parsed.logo,
        reference.sourceImageId,
        reference.restoredImageId,
      );
    }
  }
  const restored = readSignalProjectAssetReferences(JSON.stringify(parsed));
  for (const reference of references) {
    if (restored[reference.slot].imageId !== reference.restoredImageId) {
      throw new Error(`Could not remap restored Signal ${reference.slot}.`);
    }
  }
  return JSON.stringify(parsed);
}

/** Must run inside the same transaction that imports the owning project rows. */
export function applyPreparedProjectOwnedAssetsWithinTransaction(
  db: DatabaseSync,
  userId: string,
  prepared: PreparedProjectOwnedAssetImport,
): void {
  const insertImage = db.prepare(
    `INSERT INTO images
       (id, user_id, conversation_id, bot_id, related_bot_ids, origin,
        prompt, revised_prompt, url, size, quality, provider, model,
        local_rel_path, purpose, created_at)
     VALUES (?, ?, NULL, ?, ?, 'botcast', ?, ?, ?, ?, ?, ?, ?, ?, 'gallery', ?)`,
  );
  for (const image of prepared.images) {
    insertImage.run(
      image.restoredImageId,
      userId,
      image.hostBotId,
      serializeImageRelatedBotIds([image.hostBotId], image.hostBotId),
      image.restore.prompt,
      image.restore.revisedPrompt,
      `/api/images/${encodeURIComponent(image.restoredImageId)}/file`,
      image.restore.size,
      image.restore.quality,
      image.restore.provider,
      image.restore.model,
      image.localRelPath,
      image.restore.createdAt,
    );
  }

  const referencesByShow = new Map<string, PreparedProjectImageReference[]>();
  for (const reference of prepared.imageReferences) {
    const list = referencesByShow.get(reference.showId) ?? [];
    list.push(reference);
    referencesByShow.set(reference.showId, list);
  }
  for (const [showId, references] of referencesByShow) {
    const row = db
      .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ? AND user_id = ?")
      .get(showId, userId) as { atmosphere_json: string } | undefined;
    if (!row) throw new Error("Restored Signal show owner is missing.");
    const remapped = remapSignalAtmosphereJson(row.atmosphere_json, references);
    db.prepare(
      "UPDATE botcast_shows SET atmosphere_json = ? WHERE id = ? AND user_id = ?",
    ).run(remapped, showId, userId);
  }

  const insertIntroAudio = db.prepare(
    `INSERT OR REPLACE INTO botcast_show_intro_audio
       (show_id, user_id, provider, model, prompt, content_type, audio_bytes,
        duration_ms, revision, created_at, updated_at)
     VALUES (?, ?, 'elevenlabs', ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAtmosphereAudio = db.prepare(
    `INSERT OR REPLACE INTO botcast_show_atmosphere_audio
       (show_id, user_id, provider, model, prompt, content_type, audio_bytes,
        duration_ms, revision, created_at, updated_at)
     VALUES (?, ?, 'elevenlabs', ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const item of prepared.audio) {
    const insertAudio = item.slot === "intro-audio"
      ? insertIntroAudio
      : insertAtmosphereAudio;
    insertAudio.run(
      item.showId,
      userId,
      item.restore.model,
      item.restore.prompt,
      item.contentType,
      item.bytes,
      item.restore.durationMs,
      item.restore.revision,
      item.restore.createdAt,
      item.restore.updatedAt,
    );
  }
}
