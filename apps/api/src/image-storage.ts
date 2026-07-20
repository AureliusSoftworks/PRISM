import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { resolveDbPath } from "./db.ts";

const GENERATED_SUBDIR = "generated-images";
const ASSET_CLEANUP_TRASH_SUBDIR = "asset-cleanup-trash";

export interface QuarantinedGeneratedImageFile {
  sourceRelativePath: string;
  quarantineRelativePath: string;
}

export interface GeneratedImageQuarantineResult {
  recoveryId: string;
  recoveryRelativePath: string;
  manifestRelativePath?: string;
  movedFiles: QuarantinedGeneratedImageFile[];
  missingPrimaryRelativePaths: string[];
}

export interface GeneratedImageRecoveryJournal {
  journalVersion: 1;
  state: "prepared" | "committed" | "restoring";
  recoveryId: string;
  userId: string;
  quarantinedAt: string;
  plannedFiles: QuarantinedGeneratedImageFile[];
  images: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface GeneratedImageRecoveryBatch {
  journal: GeneratedImageRecoveryJournal;
  quarantine: GeneratedImageQuarantineResult;
  sizeBytes: number;
  fileCount: number;
}

/** Directory containing `localai.db` — generated images live alongside it. */
export function resolveLocalAiDataRoot(): string {
  return dirname(resolveDbPath());
}

/**
 * Relative path stored in SQLite (POSIX-style segments), never absolute.
 * Example: `generated-images/{userId}/{imageId}.png`
 */
export function buildGeneratedImageRelativePath(userId: string, imageId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId) || !/^[a-zA-Z0-9_-]+$/.test(imageId)) {
    throw new Error("Invalid image path segment.");
  }
  return `${GENERATED_SUBDIR}/${userId}/${imageId}.png`;
}

/**
 * Sidecar WebP thumbnail for a stored PNG (`*.png` → `*.thumb.webp`).
 */
export function thumbWebpRelativePathFromPngRelativePath(localRelPath: string): string {
  const t = localRelPath.trim();
  if (!t.endsWith(".png")) {
    throw new Error("Expected generated image path to end with .png.");
  }
  return `${t.slice(0, -".png".length)}.thumb.webp`;
}

/**
 * Resolves a DB-relative path to an absolute path under the data root.
 * Rejects values that escape the root (path traversal).
 */
export function resolveAbsoluteUnderDataRoot(localRelPath: string): string {
  const trimmed = localRelPath.trim();
  if (!trimmed || trimmed.includes("..")) {
    throw new Error("Invalid stored image path.");
  }
  const root = resolve(resolveLocalAiDataRoot());
  const candidate = resolve(root, trimmed);
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || rel === "") {
    throw new Error("Resolved path escapes data directory.");
  }
  return candidate;
}

export function writeGeneratedImageBytes(localRelPath: string, bytes: Buffer): void {
  const absolute = resolveAbsoluteUnderDataRoot(localRelPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
}

/** Restore/import writes must never replace an existing file on an id collision. */
export function writeGeneratedImageBytesExclusive(
  localRelPath: string,
  bytes: Buffer,
): void {
  const absolute = resolveAbsoluteUnderDataRoot(localRelPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes, { flag: "wx" });
}

export function readGeneratedImageBytes(localRelPath: string): Buffer {
  const absolute = resolveAbsoluteUnderDataRoot(localRelPath);
  return readFileSync(absolute);
}

function writeJsonAtomically(
  absolutePath: string,
  value: unknown,
  exclusive: boolean,
): void {
  mkdirSync(dirname(absolutePath), { recursive: true });
  if (exclusive && existsSync(absolutePath)) {
    throw new Error("Asset cleanup recovery destination already exists.");
  }
  const temporaryPath =
    `${absolutePath}.${randomBytes(8).toString("hex")}.tmp`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, JSON.stringify(value, null, 2), "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    if (exclusive && existsSync(absolutePath)) {
      throw new Error("Asset cleanup recovery destination already exists.");
    }
    renameSync(temporaryPath, absolutePath);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

/** Best-effort delete of stored PNG and its `.thumb.webp` sidecar; ignores missing files. */
export function tryUnlinkGeneratedImageFile(localRelPath: string | null | undefined): void {
  if (!localRelPath?.trim()) return;
  const rel = localRelPath.trim();
  try {
    const absolute = resolveAbsoluteUnderDataRoot(rel);
    if (existsSync(absolute)) {
      unlinkSync(absolute);
    }
  } catch {
    // Caller logs persistence cleanup failures.
  }
  try {
    const thumbRel = thumbWebpRelativePathFromPngRelativePath(rel);
    const thumbAbs = resolveAbsoluteUnderDataRoot(thumbRel);
    if (existsSync(thumbAbs)) {
      unlinkSync(thumbAbs);
    }
  } catch {
    // ignore
  }
}

/**
 * Moves generated PNGs and any thumbnail sidecars into a recovery folder.
 * The move is same-volume and reversible; callers can safely pair it with a
 * database transaction instead of permanently unlinking cleanup candidates.
 */
export function quarantineGeneratedImageFiles(
  userId: string,
  localRelPaths: readonly string[],
  recoveryId: string,
  recoveryManifest?: string,
): GeneratedImageQuarantineResult {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(userId) ||
    !/^[a-zA-Z0-9_-]+$/.test(recoveryId)
  ) {
    throw new Error("Invalid asset cleanup recovery id.");
  }
  const recoveryRelativePath =
    `${ASSET_CLEANUP_TRASH_SUBDIR}/${userId}/${recoveryId}`;
  const movedFiles: QuarantinedGeneratedImageFile[] = [];
  const missingPrimaryRelativePaths: string[] = [];
  const manifestRelativePath = recoveryManifest
    ? `${recoveryRelativePath}/manifest.json`
    : undefined;
  const uniquePaths = [...new Set(localRelPaths.map((value) => value.trim()))]
    .filter(Boolean);
  const generatedOwnerPrefix = `${GENERATED_SUBDIR}/${userId}/`;
  if (
    uniquePaths.some(
      (localRelPath) =>
        !localRelPath.startsWith(generatedOwnerPrefix) ||
        localRelPath.slice(generatedOwnerPrefix.length).includes("/"),
    )
  ) {
    throw new Error("Asset cleanup can quarantine only this account's generated images.");
  }
  const plannedFiles = uniquePaths.flatMap((primaryRelativePath) =>
    [
      primaryRelativePath,
      thumbWebpRelativePathFromPngRelativePath(primaryRelativePath),
    ].map((sourceRelativePath) => ({
      sourceRelativePath,
      quarantineRelativePath: `${recoveryRelativePath}/${sourceRelativePath}`,
    })),
  );

  try {
    if (manifestRelativePath && recoveryManifest !== undefined) {
      const parsed = JSON.parse(recoveryManifest) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid asset cleanup recovery manifest.");
      }
      if (
        typeof parsed.quarantinedAt !== "string" ||
        !Array.isArray(parsed.images)
      ) {
        throw new Error("Invalid asset cleanup recovery manifest metadata.");
      }
      const manifestAbsolutePath = resolveAbsoluteUnderDataRoot(
        manifestRelativePath,
      );
      const journal: GeneratedImageRecoveryJournal = {
        ...parsed,
        journalVersion: 1,
        state: "prepared",
        recoveryId,
        userId,
        quarantinedAt: parsed.quarantinedAt,
        images: parsed.images as Array<Record<string, unknown>>,
        plannedFiles,
      };
      writeJsonAtomically(
        manifestAbsolutePath,
        journal,
        true,
      );
    }
    for (const primaryRelativePath of uniquePaths) {
      const primaryAbsolutePath = resolveAbsoluteUnderDataRoot(primaryRelativePath);
      if (!existsSync(primaryAbsolutePath)) {
        missingPrimaryRelativePaths.push(primaryRelativePath);
      }
      const relatedPaths = [
        primaryRelativePath,
        thumbWebpRelativePathFromPngRelativePath(primaryRelativePath),
      ];
      for (const sourceRelativePath of relatedPaths) {
        const sourceAbsolutePath = resolveAbsoluteUnderDataRoot(sourceRelativePath);
        if (!existsSync(sourceAbsolutePath)) continue;
        const quarantineRelativePath = `${recoveryRelativePath}/${sourceRelativePath}`;
        const quarantineAbsolutePath = resolveAbsoluteUnderDataRoot(
          quarantineRelativePath,
        );
        if (existsSync(quarantineAbsolutePath)) {
          throw new Error("Asset cleanup recovery destination already exists.");
        }
        mkdirSync(dirname(quarantineAbsolutePath), { recursive: true });
        renameSync(sourceAbsolutePath, quarantineAbsolutePath);
        movedFiles.push({ sourceRelativePath, quarantineRelativePath });
      }
    }
  } catch (error) {
    restoreQuarantinedGeneratedImageFiles({
      recoveryId,
      recoveryRelativePath,
      manifestRelativePath,
      movedFiles,
      missingPrimaryRelativePaths,
    });
    throw error;
  }

  return {
    recoveryId,
    recoveryRelativePath,
    manifestRelativePath,
    movedFiles,
    missingPrimaryRelativePaths,
  };
}

export function markGeneratedImageQuarantineCommitted(
  quarantine: GeneratedImageQuarantineResult,
): void {
  if (!quarantine.manifestRelativePath) return;
  const manifestAbsolutePath = resolveAbsoluteUnderDataRoot(
    quarantine.manifestRelativePath,
  );
  const parsed = JSON.parse(
    readFileSync(manifestAbsolutePath, "utf8"),
  ) as GeneratedImageRecoveryJournal;
  writeJsonAtomically(
    manifestAbsolutePath,
    { ...parsed, state: "committed" } satisfies GeneratedImageRecoveryJournal,
    false,
  );
}

export function markGeneratedImageRecoveryBatchRestoring(
  batch: GeneratedImageRecoveryBatch,
): void {
  if (!batch.quarantine.manifestRelativePath) {
    throw new Error("Recovery batch has no journal.");
  }
  const manifestAbsolutePath = resolveAbsoluteUnderDataRoot(
    batch.quarantine.manifestRelativePath,
  );
  const next = {
    ...batch.journal,
    state: "restoring" as const,
  } satisfies GeneratedImageRecoveryJournal;
  writeJsonAtomically(manifestAbsolutePath, next, false);
  batch.journal = next;
}

/** Returns only validated owner-scoped recovery journals. Invalid batches stay untouched. */
export function listGeneratedImageRecoveryBatchesForUser(
  userId: string,
): GeneratedImageRecoveryBatch[] {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) return [];
  const ownerRelativePath = `${ASSET_CLEANUP_TRASH_SUBDIR}/${userId}`;
  const ownerAbsolutePath = resolveAbsoluteUnderDataRoot(ownerRelativePath);
  if (!existsSync(ownerAbsolutePath)) return [];
  const batches: GeneratedImageRecoveryBatch[] = [];
  for (const entry of readdirSync(ownerAbsolutePath, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]+$/.test(entry.name)) continue;
    const recoveryRelativePath = `${ownerRelativePath}/${entry.name}`;
    const manifestRelativePath = `${recoveryRelativePath}/manifest.json`;
    const manifestAbsolutePath = resolveAbsoluteUnderDataRoot(
      manifestRelativePath,
    );
    if (!existsSync(manifestAbsolutePath)) continue;
    try {
      const journal = JSON.parse(
        readFileSync(manifestAbsolutePath, "utf8"),
      ) as GeneratedImageRecoveryJournal;
      if (
        journal.journalVersion !== 1 ||
        (journal.state !== "prepared" &&
          journal.state !== "committed" &&
          journal.state !== "restoring") ||
        journal.userId !== userId ||
        journal.recoveryId !== entry.name ||
        typeof journal.quarantinedAt !== "string" ||
        !Array.isArray(journal.images) ||
        !Array.isArray(journal.plannedFiles)
      ) {
        continue;
      }
      const plannedFiles = journal.plannedFiles.map((planned) => ({
        sourceRelativePath: String(planned.sourceRelativePath ?? ""),
        quarantineRelativePath: String(planned.quarantineRelativePath ?? ""),
      }));
      if (
        plannedFiles.some(
          (planned) =>
            !planned.sourceRelativePath.startsWith(
              `${GENERATED_SUBDIR}/${userId}/`,
            ) ||
            planned.sourceRelativePath.includes("..") ||
            planned.quarantineRelativePath !==
              `${recoveryRelativePath}/${planned.sourceRelativePath}`,
        )
      ) {
        continue;
      }
      let sizeBytes = statSync(manifestAbsolutePath).size;
      let fileCount = 0;
      for (const planned of plannedFiles) {
        const absolute = resolveAbsoluteUnderDataRoot(
          planned.quarantineRelativePath,
        );
        if (existsSync(absolute)) {
          sizeBytes += statSync(absolute).size;
          fileCount += 1;
        }
      }
      batches.push({
        journal: { ...journal, plannedFiles },
        quarantine: {
          recoveryId: entry.name,
          recoveryRelativePath,
          manifestRelativePath,
          movedFiles: plannedFiles,
          missingPrimaryRelativePaths: [],
        },
        sizeBytes,
        fileCount,
      });
    } catch {
      // Invalid or unreadable recovery journals remain untouched for inspection.
    }
  }
  return batches.sort((a, b) =>
    b.journal.quarantinedAt.localeCompare(a.journal.quarantinedAt),
  );
}

export function purgeGeneratedImageRecoveryBatch(
  batch: GeneratedImageRecoveryBatch,
): void {
  const expected =
    `${ASSET_CLEANUP_TRASH_SUBDIR}/${batch.journal.userId}/${batch.journal.recoveryId}`;
  if (batch.quarantine.recoveryRelativePath !== expected) {
    throw new Error("Invalid asset cleanup recovery batch path.");
  }
  const absolute = resolveAbsoluteUnderDataRoot(expected);
  if (existsSync(absolute)) rmSync(absolute, { recursive: true, force: true });
}

/** Restore a quarantine batch when the paired database transaction fails. */
export function restoreQuarantinedGeneratedImageFiles(
  quarantine: GeneratedImageQuarantineResult,
  options: { keepManifest?: boolean } = {},
): void {
  for (const moved of [...quarantine.movedFiles].reverse()) {
    const sourceAbsolutePath = resolveAbsoluteUnderDataRoot(
      moved.sourceRelativePath,
    );
    const quarantineAbsolutePath = resolveAbsoluteUnderDataRoot(
      moved.quarantineRelativePath,
    );
    if (!existsSync(quarantineAbsolutePath)) continue;
    if (existsSync(sourceAbsolutePath)) {
      throw new Error("Cannot restore quarantined image over an existing file.");
    }
    mkdirSync(dirname(sourceAbsolutePath), { recursive: true });
    renameSync(quarantineAbsolutePath, sourceAbsolutePath);
  }
  if (quarantine.manifestRelativePath && !options.keepManifest) {
    const manifestAbsolutePath = resolveAbsoluteUnderDataRoot(
      quarantine.manifestRelativePath,
    );
    if (existsSync(manifestAbsolutePath)) unlinkSync(manifestAbsolutePath);
  }
}

/** Reverses a partial user restore while retaining its recovery journal. */
export function requarantineGeneratedImageRecoveryBatch(
  batch: GeneratedImageRecoveryBatch,
): void {
  for (const planned of batch.quarantine.movedFiles) {
    const sourceAbsolutePath = resolveAbsoluteUnderDataRoot(
      planned.sourceRelativePath,
    );
    const quarantineAbsolutePath = resolveAbsoluteUnderDataRoot(
      planned.quarantineRelativePath,
    );
    const sourceExists = existsSync(sourceAbsolutePath);
    const quarantineExists = existsSync(quarantineAbsolutePath);
    if (sourceExists && quarantineExists) {
      throw new Error("Recovery batch has conflicting source and quarantine files.");
    }
    if (!sourceExists || quarantineExists) continue;
    mkdirSync(dirname(quarantineAbsolutePath), { recursive: true });
    renameSync(sourceAbsolutePath, quarantineAbsolutePath);
  }
}

/**
 * Removes `generated-images/{userId}/` after DB rows are gone (account deletion).
 */
export function removeGeneratedImagesDirectoryForUser(userId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return;
  }
  const root = resolve(resolveLocalAiDataRoot());
  const dir = resolve(root, GENERATED_SUBDIR, userId);
  const rel = relative(root, dir);
  if (rel.startsWith("..") || rel === "") {
    return;
  }
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Removes recoverable Asset Cleanup batches owned by one account. New batches
 * are stored below an owner-scoped directory. Direct child manifests are also
 * checked so cleanup batches made by the earlier unscoped layout do not outlive
 * an account deletion or factory reset.
 */
export function removeAssetCleanupTrashDirectoryForUser(userId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) return;
  const root = resolve(resolveLocalAiDataRoot());
  const trashRoot = resolve(root, ASSET_CLEANUP_TRASH_SUBDIR);
  const ownerDirectory = resolve(trashRoot, userId);
  const ownerRelative = relative(root, ownerDirectory);
  if (ownerRelative.startsWith("..") || ownerRelative === "") return;
  if (existsSync(ownerDirectory)) {
    rmSync(ownerDirectory, { recursive: true, force: true });
  }
  if (!existsSync(trashRoot)) return;

  for (const entry of readdirSync(trashRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === userId) continue;
    const legacyBatchDirectory = resolve(trashRoot, entry.name);
    const legacyRelative = relative(trashRoot, legacyBatchDirectory);
    if (legacyRelative.startsWith("..") || legacyRelative === "") continue;
    const manifestPath = resolve(legacyBatchDirectory, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        userId?: unknown;
      };
      if (manifest.userId === userId) {
        rmSync(legacyBatchDirectory, { recursive: true, force: true });
      }
    } catch {
      // An unreadable or invalid legacy manifest cannot prove ownership.
    }
  }
}

/** Fetch remote image bytes after provider returns a temporary URL. */
export async function downloadRemoteImage(
  url: string,
  options?: { signal?: AbortSignal }
): Promise<Buffer> {
  const res = await fetch(url, { signal: options?.signal });
  if (!res.ok) {
    throw new Error(`Failed to persist generated image (download ${res.status}).`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error("Persisted image download was empty.");
  }
  return buf;
}
