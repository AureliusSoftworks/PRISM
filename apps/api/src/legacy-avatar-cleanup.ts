import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

const LEGACY_IMAGE_PURPOSE = "bot_accessory";
const BACKUP_SCHEMA = "prism-legacy-avatar-backup-v1";
const ACCESSORY_COLUMN_DEFAULTS = {
  accessory_x_pct: 0,
  accessory_y_pct: 0,
  accessory_size_pct: 100,
  accessory_layer: "front",
} as const;

export type LegacyAvatarCleanupMode = "dry-run" | "apply";

interface LegacyBotReference {
  botId: string;
  userId: string;
  imageId: string;
}

interface LegacyBotRow {
  botId: string;
  userId: string;
  imageId: string | null;
  accessoryXPct?: number | null;
  accessoryYPct?: number | null;
  accessorySizePct?: number | null;
  accessoryLayer?: string | null;
}

interface LegacyImageRow {
  id: string;
  userId: string;
  botId: string | null;
  purpose: string | null;
  localRelPath: string | null;
  selectedByPurpose: boolean;
  referencedByBotIds: string[];
}

interface LegacyFilePlan {
  kind: "image" | "thumbnail";
  sourceRelativePath: string;
  sourcePath: string;
  imageIds: string[];
  exists: boolean;
}

type InternalLegacyAvatarCleanupPlan = Omit<LegacyAvatarCleanupPlan, "files"> & {
  files: LegacyFilePlan[];
  botColumns: Set<string>;
  hasImagesTable: boolean;
};

export interface LegacyAvatarCleanupPlan {
  databasePath: string;
  dataRoot: string;
  botReferences: LegacyBotReference[];
  botRows: LegacyBotRow[];
  imageRows: LegacyImageRow[];
  files: Array<{
    kind: "image" | "thumbnail";
    sourceRelativePath: string;
    imageIds: string[];
    exists: boolean;
  }>;
}

export interface LegacyAvatarCleanupResult {
  mode: LegacyAvatarCleanupMode;
  plan: LegacyAvatarCleanupPlan;
  applied: boolean;
  backupDirectory: string | null;
  clearedBotReferences: number;
  deletedImageRows: number;
  deletedFiles: number;
  stagedFilesRemaining: string[];
}

export interface LegacyAvatarCleanupOptions {
  /** Required. This utility never falls back to DB_PATH, LOCALAI_DATA_DIR, or app defaults. */
  databasePath: string;
  mode: LegacyAvatarCleanupMode;
  /** Tests may redirect the workspace root; backups still use the required .codex/output subtree. */
  workspaceRoot?: string;
  now?: Date;
}

interface BackupArtifact {
  kind: "sqlite" | "image" | "thumbnail";
  backupRelativePath: string;
  sourceRelativePath?: string;
  imageIds?: string[];
  bytes: number;
  sha256: string;
}

const CLEANUP_STATE_SCHEMA = "prism-legacy-avatar-cleanup-state-v1";
type CleanupStateStatus =
  | "staging"
  | "staged"
  | "database-cleaned"
  | "files-pending"
  | "complete"
  | "recovered";

interface CleanupState {
  schema: typeof CLEANUP_STATE_SCHEMA;
  databasePath: string;
  backupDirectory: string;
  status: CleanupStateStatus;
  files: Array<{ sourcePath: string; stagedPath: string }>;
  updatedAt: string;
}

export async function cleanupLegacyAvatarData(
  options: LegacyAvatarCleanupOptions
): Promise<LegacyAvatarCleanupResult> {
  const databasePath = requireExplicitDatabasePath(options.databasePath);
  if (options.mode !== "dry-run" && options.mode !== "apply") {
    throw new Error("Legacy avatar cleanup mode must be dry-run or apply.");
  }
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const outputRoot = join(workspaceRoot, ".codex", "output", "avatar-details");

  const db = new DatabaseSync(databasePath, { readOnly: options.mode === "dry-run" });
  try {
    if (options.mode === "apply") {
      resumePendingLegacyAvatarCleanup(db, databasePath, outputRoot);
    }
    const internalPlan = inspectLegacyAvatarData(db, databasePath);
    const plan = publicPlan(internalPlan);
    if (options.mode === "dry-run") {
      return emptyResult("dry-run", plan);
    }
    if (plan.botRows.length === 0 && plan.imageRows.length === 0) {
      return emptyResult("apply", plan);
    }
    const missingPrimaryFiles = internalPlan.files.filter(
      (file) => file.kind === "image" && !file.exists
    );
    if (missingPrimaryFiles.length > 0) {
      throw new Error(
        `Legacy avatar cleanup cannot continue because ${missingPrimaryFiles.length} primary PNG file(s) are missing.`
      );
    }

    const createdAt = (options.now ?? new Date()).toISOString();
    mkdirSync(outputRoot, { recursive: true });
    const backupDirectory = join(outputRoot, `legacy-${utcPathStamp(createdAt)}`);
    if (existsSync(backupDirectory)) {
      throw new Error(`Legacy avatar backup directory already exists: ${backupDirectory}`);
    }
    mkdirSync(backupDirectory);

    const databaseBackupPath = join(backupDirectory, "legacy.sqlite3");
    db.exec(`VACUUM INTO '${databaseBackupPath.replaceAll("'", "''")}'`);
    verifySqliteBackup(databaseBackupPath, internalPlan);

    const artifacts: BackupArtifact[] = [
      artifactMetadata("sqlite", databaseBackupPath, "legacy.sqlite3"),
    ];
    for (const file of internalPlan.files) {
      if (!file.exists) continue;
      const backupRelativePath = join("legacy-files", file.sourceRelativePath);
      const backupPath = join(backupDirectory, backupRelativePath);
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(file.sourcePath, backupPath);
      const sourceSha = sha256File(file.sourcePath);
      const copiedSha = sha256File(backupPath);
      if (sourceSha !== copiedSha) {
        throw new Error(`Legacy avatar backup checksum mismatch: ${file.sourceRelativePath}`);
      }
      artifacts.push({
        ...artifactMetadata(file.kind, backupPath, backupRelativePath),
        sourceRelativePath: file.sourceRelativePath,
        imageIds: file.imageIds,
      });
    }

    const manifest = {
      schema: BACKUP_SCHEMA,
      createdAt,
      source: {
        databasePath,
        dataRoot: dirname(databasePath),
      },
      cleanup: {
        botReferences: plan.botReferences,
        botRows: plan.botRows,
        imageRows: plan.imageRows,
        missingFiles: plan.files
          .filter((file) => !file.exists)
          .map((file) => ({
            kind: file.kind,
            sourceRelativePath: file.sourceRelativePath,
            imageIds: file.imageIds,
          })),
      },
      checksums: {
        algorithm: "sha256",
        artifacts,
      },
      verification: {
        sqliteIntegrityCheck: "ok",
        copiedArtifactsVerified: true,
      },
    };
    const manifestPath = join(backupDirectory, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const manifestSha = sha256File(manifestPath);
    writeFileSync(join(backupDirectory, "manifest.sha256"), `${manifestSha}  manifest.json\n`);
    verifyBackupManifest(backupDirectory);
    const cleanupStatePath = join(backupDirectory, "cleanup-state.json");

    db.exec("BEGIN IMMEDIATE");
    let transactionOpen = true;
    const stagedFiles: Array<{ sourcePath: string; stagedPath: string }> = [];
    try {
      const currentPlan = inspectLegacyAvatarData(db, databasePath);
      if (planFingerprint(currentPlan) !== planFingerprint(internalPlan)) {
        throw new Error("Legacy avatar data changed during backup; no cleanup was applied.");
      }

      const stageToken = createHash("sha256")
        .update(backupDirectory)
        .digest("hex")
        .slice(0, 12);
      for (const [index, file] of currentPlan.files.entries()) {
        if (!file.exists) continue;
        const backedUp = artifacts.find(
          (artifact) =>
            artifact.kind === file.kind &&
            artifact.sourceRelativePath === file.sourceRelativePath
        );
        if (!backedUp || sha256File(file.sourcePath) !== backedUp.sha256) {
          throw new Error(
            `Legacy avatar file changed during backup; refusing to delete: ${file.sourceRelativePath}`
          );
        }
        const stagedPath = `${file.sourcePath}.prism-legacy-avatar-cleanup-${stageToken}-${index}.stage`;
        if (existsSync(stagedPath)) {
          throw new Error(`Legacy avatar cleanup staging path already exists: ${stagedPath}`);
        }
        stagedFiles.push({ sourcePath: file.sourcePath, stagedPath });
      }
      writeCleanupState(cleanupStatePath, {
        schema: CLEANUP_STATE_SCHEMA,
        databasePath,
        backupDirectory,
        status: "staging",
        files: stagedFiles,
        updatedAt: new Date().toISOString(),
      });
      for (const staged of stagedFiles) {
        renameSync(staged.sourcePath, staged.stagedPath);
      }
      writeCleanupState(cleanupStatePath, {
        schema: CLEANUP_STATE_SCHEMA,
        databasePath,
        backupDirectory,
        status: "staged",
        files: stagedFiles,
        updatedAt: new Date().toISOString(),
      });

      const resetBotRows = resetLegacyBotColumns(
        db,
        currentPlan.botColumns,
        currentPlan.botRows
      );
      if (resetBotRows !== currentPlan.botRows.length) {
        throw new Error("Legacy avatar bot row count changed during cleanup.");
      }
      const clearedBotReferences = currentPlan.botReferences.length;
      const deleteImage = currentPlan.hasImagesTable
        ? db.prepare("DELETE FROM images WHERE id = ?")
        : null;
      let deletedImageRows = 0;
      for (const row of currentPlan.imageRows) {
        deletedImageRows += Number(deleteImage?.run(row.id).changes ?? 0);
      }
      if (deletedImageRows !== currentPlan.imageRows.length) {
        throw new Error("Legacy avatar image row count changed during cleanup.");
      }
      const remainingPlan = inspectLegacyAvatarData(db, databasePath);
      if (remainingPlan.botRows.length > 0 || remainingPlan.imageRows.length > 0) {
        throw new Error("Legacy avatar cleanup did not remove the complete database inventory.");
      }

      db.exec("COMMIT");
      transactionOpen = false;
      writeCleanupState(cleanupStatePath, {
        schema: CLEANUP_STATE_SCHEMA,
        databasePath,
        backupDirectory,
        status: "database-cleaned",
        files: stagedFiles,
        updatedAt: new Date().toISOString(),
      });
      let deletedFiles = 0;
      const stagedFilesRemaining: string[] = [];
      for (const staged of stagedFiles) {
        try {
          if (existsSync(staged.stagedPath)) {
            unlinkSync(staged.stagedPath);
            deletedFiles += 1;
          }
        } catch (error) {
          console.warn(
            `Legacy avatar cleanup left a staged file after commit: ${staged.stagedPath}`,
            error
          );
          if (existsSync(staged.stagedPath)) {
            stagedFilesRemaining.push(staged.stagedPath);
          }
        }
      }
      const result: LegacyAvatarCleanupResult = {
        mode: "apply",
        plan,
        applied: true,
        backupDirectory,
        clearedBotReferences,
        deletedImageRows,
        deletedFiles,
        stagedFilesRemaining,
      };
      writeCleanupState(cleanupStatePath, {
        schema: CLEANUP_STATE_SCHEMA,
        databasePath,
        backupDirectory,
        status: stagedFilesRemaining.length > 0 ? "files-pending" : "complete",
        files: stagedFiles,
        updatedAt: new Date().toISOString(),
      });
      writeFileSync(
        join(backupDirectory, "cleanup-result.json"),
        `${JSON.stringify({ ...result, completedAt: new Date().toISOString() }, null, 2)}\n`
      );
      return result;
    } catch (error) {
      const recoveryErrors: unknown[] = [];
      if (transactionOpen) {
        try {
          db.exec("ROLLBACK");
        } catch (rollbackError) {
          recoveryErrors.push(rollbackError);
        }
        try {
          restoreStagedLegacyFiles(stagedFiles);
          writeCleanupState(cleanupStatePath, {
            schema: CLEANUP_STATE_SCHEMA,
            databasePath,
            backupDirectory,
            status: "recovered",
            files: stagedFiles,
            updatedAt: new Date().toISOString(),
          });
        } catch (restoreError) {
          recoveryErrors.push(restoreError);
        }
      }
      if (recoveryErrors.length > 0) {
        throw new AggregateError(
          [error, ...recoveryErrors],
          "Legacy avatar cleanup failed and recovery was incomplete. The verified backup is intact."
        );
      }
      throw error;
    }
  } finally {
    db.close();
  }
}

function restoreStagedLegacyFiles(
  stagedFiles: Array<{ sourcePath: string; stagedPath: string }>
): void {
  for (const staged of [...stagedFiles].reverse()) {
    if (!existsSync(staged.stagedPath)) continue;
    if (existsSync(staged.sourcePath)) {
      throw new Error(`Refusing to overwrite restored legacy avatar file: ${staged.sourcePath}`);
    }
    renameSync(staged.stagedPath, staged.sourcePath);
  }
}

function writeCleanupState(path: string, state: CleanupState): void {
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

function readCleanupState(path: string): CleanupState {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CleanupState>;
  const statuses: readonly CleanupStateStatus[] = [
    "staging",
    "staged",
    "database-cleaned",
    "files-pending",
    "complete",
    "recovered",
  ];
  if (
    parsed.schema !== CLEANUP_STATE_SCHEMA ||
    typeof parsed.databasePath !== "string" ||
    typeof parsed.backupDirectory !== "string" ||
    !statuses.includes(parsed.status as CleanupStateStatus) ||
    !Array.isArray(parsed.files)
  ) {
    throw new Error(`Legacy avatar cleanup state is invalid: ${path}`);
  }
  return parsed as CleanupState;
}

function validateCleanupStatePaths(
  state: CleanupState,
  databasePath: string,
  outputRoot: string
): void {
  if (resolve(state.databasePath) !== databasePath) {
    throw new Error("Legacy avatar cleanup state points to a different database.");
  }
  const backupDirectory = resolve(state.backupDirectory);
  const backupRelative = relative(resolve(outputRoot), backupDirectory);
  if (
    !backupRelative ||
    backupRelative === ".." ||
    backupRelative.startsWith(`..${sep}`)
  ) {
    throw new Error("Legacy avatar cleanup state has an unsafe backup directory.");
  }
  const dataRoot = dirname(databasePath);
  for (const file of state.files) {
    if (
      !file ||
      typeof file.sourcePath !== "string" ||
      typeof file.stagedPath !== "string"
    ) {
      throw new Error("Legacy avatar cleanup state contains an invalid file entry.");
    }
    const sourcePath = resolve(file.sourcePath);
    const sourceRelative = relative(resolve(dataRoot), sourcePath);
    if (
      !sourceRelative ||
      sourceRelative === ".." ||
      sourceRelative.startsWith(`..${sep}`) ||
      sourcePath === databasePath ||
      resolve(file.stagedPath) !== file.stagedPath ||
      !file.stagedPath.startsWith(
        `${sourcePath}.prism-legacy-avatar-cleanup-`
      ) ||
      !file.stagedPath.endsWith(".stage")
    ) {
      throw new Error("Legacy avatar cleanup state contains an unsafe file path.");
    }
  }
}

function resumePendingLegacyAvatarCleanup(
  db: DatabaseSync,
  databasePath: string,
  outputRoot: string
): void {
  if (!existsSync(outputRoot)) return;
  const statePaths = readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("legacy-"))
    .map((entry) => join(outputRoot, entry.name, "cleanup-state.json"))
    .filter((path) => existsSync(path))
    .sort();
  for (const statePath of statePaths) {
    const state = readCleanupState(statePath);
    if (resolve(state.databasePath) !== databasePath) continue;
    if (state.status === "complete" || state.status === "recovered") continue;
    if (resolve(state.backupDirectory) !== dirname(statePath)) {
      throw new Error("Legacy avatar cleanup state directory does not match its backup.");
    }
    validateCleanupStatePaths(state, databasePath, outputRoot);
    verifyBackupManifest(state.backupDirectory);
    const currentPlan = inspectLegacyAvatarData(db, databasePath);
    const databaseStillHasLegacyData =
      currentPlan.botRows.length > 0 || currentPlan.imageRows.length > 0;

    if (databaseStillHasLegacyData) {
      if (
        state.status === "database-cleaned" ||
        state.status === "files-pending"
      ) {
        throw new Error(
          "Legacy avatar cleanup state conflicts with the current database; no files were changed."
        );
      }
      restoreStagedLegacyFiles(state.files);
      for (const file of state.files) {
        if (!existsSync(file.sourcePath)) {
          throw new Error(
            `Legacy avatar staged-file recovery is incomplete: ${file.sourcePath}`
          );
        }
      }
      writeCleanupState(statePath, {
        ...state,
        status: "recovered",
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    for (const file of state.files) {
      if (existsSync(file.sourcePath)) {
        throw new Error(
          `Refusing to remove an unstaged file after database cleanup: ${file.sourcePath}`
        );
      }
      if (existsSync(file.stagedPath)) unlinkSync(file.stagedPath);
    }
    writeCleanupState(statePath, {
      ...state,
      status: "complete",
      updatedAt: new Date().toISOString(),
    });
  }
}

function requireExplicitDatabasePath(input: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("An explicit SQLite database path is required.");
  }
  if (!isAbsolute(input.trim())) {
    throw new Error("The explicit SQLite database path must be absolute.");
  }
  const databasePath = resolve(input.trim());
  if (!existsSync(databasePath) || !lstatSync(databasePath).isFile()) {
    throw new Error(`SQLite database does not exist: ${databasePath}`);
  }
  return databasePath;
}

function inspectLegacyAvatarData(
  db: DatabaseSync,
  databasePath: string
): InternalLegacyAvatarCleanupPlan {
  const schema = legacySchema(db);
  const botRows = readLegacyBotRows(db, schema.botColumns, schema.hasBotsTable);
  const botReferences = botRows
    .filter((row): row is LegacyBotRow & { imageId: string } => Boolean(row.imageId))
    .map((row) => ({ botId: row.botId, userId: row.userId, imageId: row.imageId }));
  const referencesByImageId = new Map<string, string[]>();
  for (const ref of botReferences) {
    const ids = referencesByImageId.get(ref.imageId) ?? [];
    ids.push(ref.botId);
    referencesByImageId.set(ref.imageId, ids);
  }

  const rawRows = schema.hasImagesTable
    ? (db
        .prepare(
          `SELECT id, user_id, bot_id, purpose, local_rel_path
           FROM images
           WHERE purpose = ?
           ORDER BY id`
        )
        .all(LEGACY_IMAGE_PURPOSE) as Array<{
    id: string;
    user_id: string;
    bot_id: string | null;
    purpose: string | null;
    local_rel_path: string | null;
  }>)
    : [];
  const imageRows: LegacyImageRow[] = rawRows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    botId: row.bot_id,
    purpose: row.purpose,
    localRelPath: row.local_rel_path?.trim() || null,
    selectedByPurpose: row.purpose === LEGACY_IMAGE_PURPOSE,
    referencedByBotIds: referencesByImageId.get(row.id) ?? [],
  }));

  const dataRoot = dirname(databasePath);
  const retainedArtifactIdentities = new Set<string>();
  if (schema.hasImagesTable) {
    const retainedPaths = db
      .prepare(
        `SELECT DISTINCT local_rel_path
         FROM images
         WHERE (purpose IS NULL OR purpose <> ?)
           AND local_rel_path IS NOT NULL
           AND TRIM(local_rel_path) <> ''`
      )
      .all(LEGACY_IMAGE_PURPOSE) as Array<{ local_rel_path: string }>;
    for (const row of retainedPaths) {
      const retainedPath = row.local_rel_path.trim().replaceAll("\\", "/");
      addPathIdentities(retainedArtifactIdentities, dataRoot, retainedPath);
      if (retainedPath.endsWith(".png")) {
        addPathIdentities(
          retainedArtifactIdentities,
          dataRoot,
          `${retainedPath.slice(0, -4)}.thumb.webp`
        );
      }
    }
  }
  const filesByRelativePath = new Map<string, LegacyFilePlan>();
  for (const row of imageRows) {
    if (!row.localRelPath) continue;
    const imagePathIsRetained = pathMatchesRetainedArtifact(
      retainedArtifactIdentities,
      dataRoot,
      row.localRelPath
    );
    if (!imagePathIsRetained) {
      addFilePlan(
        filesByRelativePath,
        dataRoot,
        databasePath,
        row.localRelPath,
        "image",
        row.id
      );
    }
    if (row.localRelPath.endsWith(".png")) {
      const thumbPath = `${row.localRelPath.slice(0, -4)}.thumb.webp`;
      if (
        !imagePathIsRetained &&
        !pathMatchesRetainedArtifact(retainedArtifactIdentities, dataRoot, thumbPath)
      ) {
        addFilePlan(
          filesByRelativePath,
          dataRoot,
          databasePath,
          thumbPath,
          "thumbnail",
          row.id
        );
      }
    }
  }

  return {
    databasePath,
    dataRoot,
    botReferences,
    botRows,
    imageRows,
    files: [...filesByRelativePath.values()].sort((a, b) =>
      a.sourceRelativePath.localeCompare(b.sourceRelativePath)
    ),
    botColumns: schema.botColumns,
    hasImagesTable: schema.hasImagesTable,
  };
}

function addPathIdentities(
  identities: Set<string>,
  dataRoot: string,
  localRelPath: string
): void {
  for (const identity of pathIdentities(dataRoot, localRelPath)) {
    identities.add(identity);
  }
}

function pathMatchesRetainedArtifact(
  retainedIdentities: Set<string>,
  dataRoot: string,
  localRelPath: string
): boolean {
  return pathIdentities(dataRoot, localRelPath).some((identity) =>
    retainedIdentities.has(identity)
  );
}

function pathIdentities(dataRoot: string, localRelPath: string): string[] {
  const normalized = localRelPath.trim().replaceAll("\\", "/");
  const absolute = resolve(dataRoot, normalized);
  const identities = new Set([`resolved:${absolute}`]);
  if (existsSync(absolute)) {
    try {
      identities.add(`real:${realpathSync(absolute)}`);
    } catch {
      // The resolved identity still provides a conservative lexical comparison.
    }
  }
  return [...identities];
}

function addFilePlan(
  files: Map<string, LegacyFilePlan>,
  dataRoot: string,
  databasePath: string,
  sourceRelativePath: string,
  kind: LegacyFilePlan["kind"],
  imageId: string
): void {
  const normalized = sourceRelativePath.replaceAll("\\", "/");
  if (
    (kind === "image" && !normalized.toLowerCase().endsWith(".png")) ||
    (kind === "thumbnail" && !normalized.toLowerCase().endsWith(".thumb.webp"))
  ) {
    throw new Error(`Unexpected legacy avatar file type: ${sourceRelativePath}`);
  }
  const existing = files.get(normalized);
  if (existing) {
    if (!existing.imageIds.includes(imageId)) existing.imageIds.push(imageId);
    return;
  }
  if (isAbsolute(sourceRelativePath) || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe legacy avatar file path: ${sourceRelativePath}`);
  }
  const sourcePath = resolve(dataRoot, sourceRelativePath);
  const rel = relative(resolve(dataRoot), sourcePath);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || sourcePath === databasePath) {
    throw new Error(`Unsafe legacy avatar file path: ${sourceRelativePath}`);
  }
  const exists = existsSync(sourcePath);
  if (exists) {
    const info = lstatSync(sourcePath);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Legacy avatar path is not a regular file: ${sourceRelativePath}`);
    }
    const realRoot = realpathSync(dataRoot);
    const realSource = realpathSync(sourcePath);
    const realRel = relative(realRoot, realSource);
    if (!realRel || realRel === ".." || realRel.startsWith(`..${sep}`)) {
      throw new Error(`Unsafe legacy avatar file path: ${sourceRelativePath}`);
    }
  }
  files.set(normalized, {
    kind,
    sourceRelativePath: normalized,
    sourcePath,
    imageIds: [imageId],
    exists,
  });
}

function legacySchema(db: DatabaseSync): {
  hasBotsTable: boolean;
  hasImagesTable: boolean;
  botColumns: Set<string>;
} {
  const tableNames = new Set(
    (db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('bots', 'images')")
      .all() as Array<{ name: string }>).map((row) => row.name)
  );
  const hasBotsTable = tableNames.has("bots");
  const hasImagesTable = tableNames.has("images");
  const botColumns = hasBotsTable
    ? new Set(
        (db.prepare("PRAGMA table_info(bots)").all() as Array<{ name: string }>).map(
          (row) => row.name
        )
      )
    : new Set<string>();
  if (hasBotsTable && (!botColumns.has("id") || !botColumns.has("user_id"))) {
    throw new Error("bots table is missing id or user_id.");
  }
  if (hasImagesTable) {
    const imageColumns = new Set(
      (db.prepare("PRAGMA table_info(images)").all() as Array<{ name: string }>).map(
        (row) => row.name
      )
    );
    for (const column of ["id", "user_id", "bot_id", "purpose", "local_rel_path"]) {
      if (!imageColumns.has(column)) throw new Error(`images table is missing ${column}.`);
    }
  }
  return { hasBotsTable, hasImagesTable, botColumns };
}

function readLegacyBotRows(
  db: DatabaseSync,
  botColumns: Set<string>,
  hasBotsTable: boolean
): LegacyBotRow[] {
  if (!hasBotsTable) return [];
  const accessoryColumns = [
    "accessory_image_id",
    "accessory_x_pct",
    "accessory_y_pct",
    "accessory_size_pct",
    "accessory_layer",
  ].filter((column) => botColumns.has(column));
  if (accessoryColumns.length === 0) return [];
  const rows = db
    .prepare(`SELECT id, user_id, ${accessoryColumns.join(", ")} FROM bots ORDER BY id`)
    .all() as Array<Record<string, unknown> & { id: string; user_id: string }>;
  return rows
    .map((row) => ({
      botId: row.id,
      userId: row.user_id,
      imageId:
        typeof row.accessory_image_id === "string" && row.accessory_image_id.trim()
          ? row.accessory_image_id.trim()
          : null,
      ...(botColumns.has("accessory_x_pct")
        ? { accessoryXPct: numberOrNull(row.accessory_x_pct) }
        : {}),
      ...(botColumns.has("accessory_y_pct")
        ? { accessoryYPct: numberOrNull(row.accessory_y_pct) }
        : {}),
      ...(botColumns.has("accessory_size_pct")
        ? { accessorySizePct: numberOrNull(row.accessory_size_pct) }
        : {}),
      ...(botColumns.has("accessory_layer")
        ? { accessoryLayer: typeof row.accessory_layer === "string" ? row.accessory_layer : null }
        : {}),
    }))
    .filter((row) =>
      Boolean(
        row.imageId ||
          ("accessoryXPct" in row && row.accessoryXPct !== ACCESSORY_COLUMN_DEFAULTS.accessory_x_pct) ||
          ("accessoryYPct" in row && row.accessoryYPct !== ACCESSORY_COLUMN_DEFAULTS.accessory_y_pct) ||
          ("accessorySizePct" in row && row.accessorySizePct !== ACCESSORY_COLUMN_DEFAULTS.accessory_size_pct) ||
          ("accessoryLayer" in row && row.accessoryLayer !== ACCESSORY_COLUMN_DEFAULTS.accessory_layer)
      )
    );
}

function resetLegacyBotColumns(
  db: DatabaseSync,
  botColumns: Set<string>,
  botRows: LegacyBotRow[]
): number {
  if (botRows.length === 0) return 0;
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  if (botColumns.has("accessory_image_id")) {
    assignments.push("accessory_image_id = ?");
    values.push(null);
  }
  for (const [column, value] of Object.entries(ACCESSORY_COLUMN_DEFAULTS)) {
    if (botColumns.has(column)) {
      assignments.push(`${column} = ?`);
      values.push(value);
    }
  }
  if (assignments.length === 0) return 0;
  const update = db.prepare(`UPDATE bots SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`);
  let updated = 0;
  for (const row of botRows) {
    const changes = Number(update.run(...values, row.botId, row.userId).changes ?? 0);
    if (changes !== 1) {
      throw new Error(`Legacy avatar bot row changed during cleanup: ${row.botId}`);
    }
    updated += changes;
  }
  return updated;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function verifySqliteBackup(
  databaseBackupPath: string,
  plan: ReturnType<typeof inspectLegacyAvatarData>
): void {
  const backupDb = new DatabaseSync(databaseBackupPath, { readOnly: true });
  try {
    const integrity = backupDb.prepare("PRAGMA integrity_check").get() as
      | { integrity_check?: string }
      | undefined;
    if (integrity?.integrity_check !== "ok") {
      throw new Error("Legacy avatar SQLite backup failed integrity verification.");
    }
    const backupPlan = inspectLegacyAvatarData(backupDb, databaseBackupPath);
    if (
      databaseInventoryFingerprint(backupPlan) !==
      databaseInventoryFingerprint(plan)
    ) {
      throw new Error("Legacy avatar SQLite backup inventory does not match the source.");
    }
  } finally {
    backupDb.close();
  }
}

function artifactMetadata(
  kind: BackupArtifact["kind"],
  path: string,
  backupRelativePath: string
): BackupArtifact {
  return {
    kind,
    backupRelativePath: backupRelativePath.replaceAll("\\", "/"),
    bytes: statSync(path).size,
    sha256: sha256File(path),
  };
}

function verifyBackupManifest(backupDirectory: string): void {
  const manifestPath = join(backupDirectory, "manifest.json");
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    schema?: string;
    checksums?: { artifacts?: BackupArtifact[] };
  };
  if (parsed.schema !== BACKUP_SCHEMA || !Array.isArray(parsed.checksums?.artifacts)) {
    throw new Error("Legacy avatar backup manifest could not be verified.");
  }
  for (const artifact of parsed.checksums.artifacts) {
    const path = resolve(backupDirectory, artifact.backupRelativePath);
    const rel = relative(resolve(backupDirectory), path);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) {
      throw new Error("Legacy avatar backup manifest contains an unsafe artifact path.");
    }
    if (
      !existsSync(path) ||
      statSync(path).size !== artifact.bytes ||
      sha256File(path) !== artifact.sha256
    ) {
      throw new Error(`Legacy avatar backup artifact failed verification: ${artifact.backupRelativePath}`);
    }
  }
  const expectedManifestSha = readFileSync(join(backupDirectory, "manifest.sha256"), "utf8")
    .trim()
    .split(/\s+/u)[0];
  if (expectedManifestSha !== sha256File(manifestPath)) {
    throw new Error("Legacy avatar backup manifest checksum failed verification.");
  }
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function utcPathStamp(iso: string): string {
  return iso.replaceAll(":", "-").replaceAll(".", "-");
}

function publicPlan(
  plan: ReturnType<typeof inspectLegacyAvatarData>
): LegacyAvatarCleanupPlan {
  return {
    databasePath: plan.databasePath,
    dataRoot: plan.dataRoot,
    botReferences: plan.botReferences,
    botRows: plan.botRows,
    imageRows: plan.imageRows,
    files: plan.files.map(({ kind, sourceRelativePath, imageIds, exists }) => ({
      kind,
      sourceRelativePath,
      imageIds,
      exists,
    })),
  };
}

function planFingerprint(plan: ReturnType<typeof inspectLegacyAvatarData>): string {
  return JSON.stringify({
    botReferences: plan.botReferences,
    botRows: plan.botRows,
    imageRows: plan.imageRows,
    files: plan.files.map(({ kind, sourceRelativePath, imageIds }) => ({
      kind,
      sourceRelativePath,
      imageIds,
    })),
  });
}

function databaseInventoryFingerprint(
  plan: ReturnType<typeof inspectLegacyAvatarData>
): string {
  return JSON.stringify({
    botReferences: plan.botReferences,
    botRows: plan.botRows,
    imageRows: plan.imageRows,
  });
}

function emptyResult(
  mode: LegacyAvatarCleanupMode,
  plan: LegacyAvatarCleanupPlan
): LegacyAvatarCleanupResult {
  return {
    mode,
    plan,
    applied: false,
    backupDirectory: null,
    clearedBotReferences: 0,
    deletedImageRows: 0,
    deletedFiles: 0,
    stagedFilesRemaining: [],
  };
}
