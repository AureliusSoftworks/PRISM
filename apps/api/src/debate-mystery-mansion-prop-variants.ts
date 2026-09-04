import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  WHODUNNIT_PROP_ARCHETYPE_IDS_V1,
  WHODUNNIT_PROP_REGISTRY_VERSION_V1,
  isWhodunnitPropArchetypeIdV1,
  type MansionPropThemeProgressV1,
  type MansionPropThemeV1,
  type MansionPropVariantGenerationStatusV1,
  type WhodunnitPropArchetypeIdV1,
} from "@localai/shared";
import sharp from "sharp";
import { encryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";

const PROP_THEME_LOGICAL_PREFIX_V1 = "theme:";
const MAX_PROP_SOURCE_BYTES_V1 = 12 * 1024 * 1024;

interface MansionPropVariantRowV1 {
  archetype_id: string;
  status: MansionPropVariantGenerationStatusV1;
  display_name: string;
  appearance_description: string;
  asset_id: string | null;
  attempt_count: number;
  failure_code: string | null;
  candidate_status: MansionPropVariantGenerationStatusV1 | null;
  candidate_asset_id: string | null;
  candidate_attempt_count: number;
  candidate_failure_code: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
}

export type MansionPropVariantLaneV1 = "primary" | "candidate";

export interface DebateMysteryMansionPropThemeStateV1 {
  propTheme: MansionPropThemeV1 | null;
  progress: MansionPropThemeProgressV1;
}

export interface SaveDebateMysteryMansionPropVariantInputV1 {
  archetypeId: WhodunnitPropArchetypeIdV1;
  displayName: string;
  appearanceDescription: string;
  bytes: Buffer;
  mimeType: "image/png" | "image/webp";
  provider?: string | null;
  model?: string | null;
  /** "candidate" parks the sprite beside the ready one until the author saves. */
  lane?: MansionPropVariantLaneV1;
}

function assertOwnedMansionBundleV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): void {
  if (!db.prepare(
    "SELECT 1 FROM debate_mystery_mansion_bundles WHERE id = ? AND user_id = ? LIMIT 1",
  ).get(bundleId, userId)) {
    throw new HttpError(404, "That saved mansion was not found.");
  }
}

function assertArchetypeIdV1(value: unknown): asserts value is WhodunnitPropArchetypeIdV1 {
  if (!isWhodunnitPropArchetypeIdV1(value)) {
    throw new HttpError(400, "That Whodunnit prop role is not supported.");
  }
}

function normalizedVariantTextV1(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new HttpError(400, `${label} is required.`);
  const normalized = value.replace(/\s+/gu, " ").trim().slice(0, maxLength);
  if (!normalized) throw new HttpError(400, `${label} is required.`);
  return normalized;
}

function normalizedFailureCodeV1(value: unknown): string {
  if (typeof value !== "string") return "generation_failed";
  return value.replace(/[^a-z0-9:_-]+/giu, "_").replace(/^_+|_+$/gu, "")
    .slice(0, 160) || "generation_failed";
}

function rowsForBundleV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): MansionPropVariantRowV1[] {
  return db.prepare(
    `SELECT variants.archetype_id, variants.status, variants.display_name,
            variants.appearance_description, variants.asset_id,
            variants.attempt_count, variants.failure_code,
            variants.candidate_status, variants.candidate_asset_id,
            variants.candidate_attempt_count, variants.candidate_failure_code,
            assets.mime_type, assets.width, assets.height
       FROM debate_mystery_mansion_prop_variants AS variants
       LEFT JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = variants.asset_id AND assets.user_id = variants.user_id
      WHERE variants.user_id = ? AND variants.bundle_id = ?
        AND variants.registry_version = ?
      ORDER BY variants.archetype_id`,
  ).all(userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1) as unknown as MansionPropVariantRowV1[];
}

function validReadyRowV1(row: MansionPropVariantRowV1): boolean {
  return row.status === "ready" &&
    Boolean(row.asset_id) &&
    (row.mime_type === "image/png" || row.mime_type === "image/webp") &&
    typeof row.width === "number" && row.width > 0 &&
    typeof row.height === "number" && row.height > 0 &&
    Boolean(row.display_name.trim()) && Boolean(row.appearance_description.trim());
}

/** Reads mutable local progress and exposes a portable theme only at exact 16/16 coverage. */
export function getDebateMysteryMansionPropThemeStateV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): DebateMysteryMansionPropThemeStateV1 {
  assertOwnedMansionBundleV1(db, userId, bundleId);
  const rowByArchetype = new Map(
    rowsForBundleV1(db, userId, bundleId)
      .filter((row) => isWhodunnitPropArchetypeIdV1(row.archetype_id))
      .map((row) => [row.archetype_id as WhodunnitPropArchetypeIdV1, row]),
  );
  const variants = WHODUNNIT_PROP_ARCHETYPE_IDS_V1.map((archetypeId) => {
    const row = rowByArchetype.get(archetypeId);
    return {
      archetypeId,
      status: row?.status ?? "pending",
      attemptCount: row?.attempt_count ?? 0,
      failureCode: row?.failure_code ?? null,
      displayName: row?.display_name ?? "",
      appearanceDescription: row?.appearance_description ?? "",
      assetId: row && validReadyRowV1(row) ? row.asset_id : null,
      candidateStatus: row?.candidate_status ?? null,
      candidateAssetId: row?.candidate_status === "ready" ? row.candidate_asset_id : null,
      candidateAttemptCount: row?.candidate_attempt_count ?? 0,
    };
  });
  const candidatePendingCount = variants.filter((variant) => variant.candidateStatus === "pending").length;
  const readyRows = WHODUNNIT_PROP_ARCHETYPE_IDS_V1.flatMap((archetypeId) => {
    const row = rowByArchetype.get(archetypeId);
    return row && validReadyRowV1(row) ? [{ archetypeId, row }] : [];
  });
  const readyCount = readyRows.length;
  const failedCount = variants.filter((variant) => variant.status === "failed").length;
  const pendingCount = variants.length - readyCount - failedCount;
  const complete = readyCount === WHODUNNIT_PROP_ARCHETYPE_IDS_V1.length &&
    new Set(readyRows.map(({ row }) => row.asset_id)).size === WHODUNNIT_PROP_ARCHETYPE_IDS_V1.length;
  return {
    propTheme: complete ? {
      version: 1,
      registryVersion: WHODUNNIT_PROP_REGISTRY_VERSION_V1,
      variants: readyRows.map(({ archetypeId, row }) => ({
        archetypeId,
        displayName: row.display_name,
        appearanceDescription: row.appearance_description,
        packageAssetId: row.asset_id!,
      })),
    } : null,
    progress: {
      version: 1,
      registryVersion: WHODUNNIT_PROP_REGISTRY_VERSION_V1,
      totalCount: 16,
      readyCount,
      pendingCount,
      failedCount,
      complete,
      candidatePendingCount,
      variants,
    },
  };
}

/** Makes every missing role visible to the restartable worker without overwriting accepted work. */
export function ensureDebateMysteryMansionPropVariantsV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): MansionPropThemeProgressV1 {
  assertOwnedMansionBundleV1(db, userId, bundleId);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO debate_mystery_mansion_prop_variants
       (user_id, bundle_id, registry_version, archetype_id, status,
        display_name, appearance_description, asset_id, attempt_count,
        failure_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', '', '', NULL, 0, NULL, ?, ?)`,
  );
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    let inserted = 0;
    for (const archetypeId of WHODUNNIT_PROP_ARCHETYPE_IDS_V1) {
      inserted += Number(insert.run(
        userId,
        bundleId,
        WHODUNNIT_PROP_REGISTRY_VERSION_V1,
        archetypeId,
        now,
        now,
      ).changes);
    }
    if (inserted > 0) {
      db.prepare(
        "UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?",
      ).run(now, bundleId, userId);
    }
    if (ownsTransaction) db.exec("COMMIT");
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionPropThemeStateV1(db, userId, bundleId).progress;
}

/** Claims one of the two automatic generation attempts for a pending role. */
export function beginDebateMysteryMansionPropVariantAttemptV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  archetypeId: WhodunnitPropArchetypeIdV1,
  lane: MansionPropVariantLaneV1 = "primary",
): number {
  assertArchetypeIdV1(archetypeId);
  ensureDebateMysteryMansionPropVariantsV1(db, userId, bundleId);
  const now = new Date().toISOString();
  if (lane === "candidate") {
    const claimed = db.prepare(
      `UPDATE debate_mystery_mansion_prop_variants
          SET candidate_attempt_count = candidate_attempt_count + 1, candidate_failure_code = NULL, updated_at = ?
        WHERE user_id = ? AND bundle_id = ? AND registry_version = ?
          AND archetype_id = ? AND candidate_status = 'pending' AND candidate_attempt_count < 2`,
    ).run(now, userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1, archetypeId);
    if (Number(claimed.changes) !== 1) throw new HttpError(409, "That themed prop has no redraw waiting.");
    const row = rowsForBundleV1(db, userId, bundleId).find((candidate) => candidate.archetype_id === archetypeId);
    return row?.candidate_attempt_count ?? 0;
  }
  const result = db.prepare(
    `UPDATE debate_mystery_mansion_prop_variants
        SET attempt_count = attempt_count + 1, failure_code = NULL, updated_at = ?
      WHERE user_id = ? AND bundle_id = ? AND registry_version = ?
        AND archetype_id = ? AND status = 'pending' AND attempt_count < 2`,
  ).run(now, userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1, archetypeId);
  if (Number(result.changes) !== 1) {
    const row = rowsForBundleV1(db, userId, bundleId).find(
      (candidate) => candidate.archetype_id === archetypeId,
    );
    if (row?.status === "ready") throw new HttpError(409, "That themed prop is already ready.");
    if (row?.status === "failed") {
      throw new HttpError(409, "Retry this themed prop before generating it again.");
    }
    throw new HttpError(409, "That themed prop has used both generation attempts.");
  }
  db.prepare(
    "UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(now, bundleId, userId);
  const row = rowsForBundleV1(db, userId, bundleId).find(
    (candidate) => candidate.archetype_id === archetypeId,
  );
  return row?.attempt_count ?? 0;
}

/** Records a failed attempt. The second failure pauses this role until explicit Retry. */
export function failDebateMysteryMansionPropVariantAttemptV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  archetypeId: WhodunnitPropArchetypeIdV1,
  failureCode: string,
  lane: MansionPropVariantLaneV1 = "primary",
): MansionPropThemeProgressV1 {
  assertArchetypeIdV1(archetypeId);
  assertOwnedMansionBundleV1(db, userId, bundleId);
  const now = new Date().toISOString();
  if (lane === "candidate") {
    db.prepare(
      `UPDATE debate_mystery_mansion_prop_variants
          SET candidate_status = CASE WHEN candidate_attempt_count >= 2 THEN 'failed' ELSE 'pending' END,
              candidate_asset_id = NULL, candidate_failure_code = ?, updated_at = ?
        WHERE user_id = ? AND bundle_id = ? AND registry_version = ?
          AND archetype_id = ? AND candidate_status = 'pending' AND candidate_attempt_count > 0`,
    ).run(normalizedFailureCodeV1(failureCode), now, userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1, archetypeId);
    return getDebateMysteryMansionPropThemeStateV1(db, userId, bundleId).progress;
  }
  const result = db.prepare(
    `UPDATE debate_mystery_mansion_prop_variants
        SET status = CASE WHEN attempt_count >= 2 THEN 'failed' ELSE 'pending' END,
            asset_id = NULL, failure_code = ?, updated_at = ?
      WHERE user_id = ? AND bundle_id = ? AND registry_version = ?
        AND archetype_id = ? AND status = 'pending' AND attempt_count > 0`,
  ).run(
    normalizedFailureCodeV1(failureCode),
    now,
    userId,
    bundleId,
    WHODUNNIT_PROP_REGISTRY_VERSION_V1,
    archetypeId,
  );
  if (Number(result.changes) !== 1) {
    throw new HttpError(409, "That themed prop has no active generation attempt.");
  }
  db.prepare(
    "UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(now, bundleId, userId);
  return getDebateMysteryMansionPropThemeStateV1(db, userId, bundleId).progress;
}

/** Player-initiated Retry starts a fresh bounded pair after an exhausted role. */
export function retryDebateMysteryMansionPropVariantV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  archetypeId: WhodunnitPropArchetypeIdV1,
): MansionPropThemeProgressV1 {
  assertArchetypeIdV1(archetypeId);
  assertOwnedMansionBundleV1(db, userId, bundleId);
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE debate_mystery_mansion_prop_variants
        SET status = 'pending', attempt_count = 0, failure_code = NULL, updated_at = ?
      WHERE user_id = ? AND bundle_id = ? AND registry_version = ?
        AND archetype_id = ? AND status = 'failed'`,
  ).run(
    now,
    userId,
    bundleId,
    WHODUNNIT_PROP_REGISTRY_VERSION_V1,
    archetypeId,
  );
  if (Number(result.changes) !== 1) {
    throw new HttpError(409, "That themed prop does not need a retry.");
  }
  db.prepare(
    "UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(now, bundleId, userId);
  return getDebateMysteryMansionPropThemeStateV1(db, userId, bundleId).progress;
}

const PROP_DISPLAY_NAME_MAX_LENGTH = 80;
const PROP_APPEARANCE_MAX_LENGTH = 600;

function cleanPropIdentityText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const text = value.replace(/\s+/gu, " ").trim();
  if (/[<>{}]/u.test(text)) throw new HttpError(400, "Prop names and descriptions cannot contain markup.");
  return text.slice(0, maxLength);
}

/** The author names and describes one role before any image exists. The
 * worker draws to that identity and Case Forge reads it verbatim, so the
 * writer knows exactly which object each role is. */
export function updateDebateMysteryMansionPropVariantIdentityV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  archetypeId: WhodunnitPropArchetypeIdV1,
  input: { displayName?: unknown; appearanceDescription?: unknown },
): MansionPropThemeProgressV1 {
  assertArchetypeIdV1(archetypeId);
  assertOwnedMansionBundleV1(db, userId, bundleId);
  ensureDebateMysteryMansionPropVariantsV1(db, userId, bundleId);
  const row = rowsForBundleV1(db, userId, bundleId).find((entry) => entry.archetype_id === archetypeId);
  const displayName = cleanPropIdentityText(input.displayName, row?.display_name ?? "", PROP_DISPLAY_NAME_MAX_LENGTH);
  const appearanceDescription = cleanPropIdentityText(
    input.appearanceDescription, row?.appearance_description ?? "", PROP_APPEARANCE_MAX_LENGTH,
  );
  if (row?.status === "ready" && (!displayName || !appearanceDescription)) {
    throw new HttpError(409, "A ready prop keeps a name and a description. Regenerate it to start over.");
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE debate_mystery_mansion_prop_variants
        SET display_name = ?, appearance_description = ?, updated_at = ?
      WHERE user_id = ? AND bundle_id = ? AND registry_version = ? AND archetype_id = ?`,
  ).run(displayName, appearanceDescription, now, userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1, archetypeId);
  db.prepare(
    "UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(now, bundleId, userId);
  return getDebateMysteryMansionPropThemeStateV1(db, userId, bundleId).progress;
}

/** Sends one role back to the worker regardless of its state, keeping the
 * authored identity. The previous sprite stays referenced until the new one
 * replaces it, so a failed redraw never leaves the pack without an image. */
export function regenerateDebateMysteryMansionPropVariantV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  archetypeId: WhodunnitPropArchetypeIdV1,
): MansionPropThemeProgressV1 {
  assertArchetypeIdV1(archetypeId);
  assertOwnedMansionBundleV1(db, userId, bundleId);
  ensureDebateMysteryMansionPropVariantsV1(db, userId, bundleId);
  const now = new Date().toISOString();
  const current = rowsForBundleV1(db, userId, bundleId).find((row) => row.archetype_id === archetypeId);
  const result = current && validReadyRowV1(current)
    // A ready sprite stays in place; the redraw lands beside it as a candidate.
    ? db.prepare(
        `UPDATE debate_mystery_mansion_prop_variants
            SET candidate_status = 'pending', candidate_attempt_count = 0, candidate_failure_code = NULL,
                candidate_asset_id = NULL, updated_at = ?
          WHERE user_id = ? AND bundle_id = ? AND registry_version = ? AND archetype_id = ?`,
      ).run(now, userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1, archetypeId)
    : db.prepare(
        `UPDATE debate_mystery_mansion_prop_variants
            SET status = 'pending', attempt_count = 0, failure_code = NULL, asset_id = NULL, updated_at = ?
          WHERE user_id = ? AND bundle_id = ? AND registry_version = ? AND archetype_id = ?`,
      ).run(now, userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1, archetypeId);
  if (Number(result.changes) !== 1) throw new HttpError(404, "That themed prop role was not found.");
  db.prepare(
    "UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(now, bundleId, userId);
  return getDebateMysteryMansionPropThemeStateV1(db, userId, bundleId).progress;
}

/** Save makes the redraw the role's sprite; the previous one is released. */
export function acceptDebateMysteryMansionPropCandidateV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  archetypeId: WhodunnitPropArchetypeIdV1,
): MansionPropThemeProgressV1 {
  assertArchetypeIdV1(archetypeId);
  assertOwnedMansionBundleV1(db, userId, bundleId);
  const row = rowsForBundleV1(db, userId, bundleId).find((entry) => entry.archetype_id === archetypeId);
  if (!row || row.candidate_status !== "ready" || !row.candidate_asset_id) {
    throw new HttpError(409, "That themed prop has no finished redraw to use.");
  }
  const now = new Date().toISOString();
  const primary = `${PROP_THEME_LOGICAL_PREFIX_V1}${archetypeId}`;
  const candidate = `${primary}:candidate`;
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ? AND role = 'prop' AND logical_id = ?`,
    ).run(bundleId, userId, primary);
    db.prepare(
      `UPDATE debate_mystery_mansion_asset_refs SET logical_id = ?, created_at = ?
        WHERE bundle_id = ? AND user_id = ? AND role = 'prop' AND logical_id = ?`,
    ).run(primary, now, bundleId, userId, candidate);
    db.prepare(
      `UPDATE debate_mystery_mansion_prop_variants
          SET status = 'ready', asset_id = candidate_asset_id, attempt_count = 0, failure_code = NULL,
              candidate_status = NULL, candidate_asset_id = NULL, candidate_attempt_count = 0,
              candidate_failure_code = NULL, updated_at = ?
        WHERE user_id = ? AND bundle_id = ? AND registry_version = ? AND archetype_id = ?`,
    ).run(now, userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1, archetypeId);
    db.prepare(
      "UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?",
    ).run(now, bundleId, userId);
    cleanupUnreferencedDebateMysteryMansionAssetsV1(db, userId);
    if (ownsTransaction) db.exec("COMMIT");
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionPropThemeStateV1(db, userId, bundleId).progress;
}

/** Drops a waiting or finished redraw; the ready sprite was never touched. */
export function discardDebateMysteryMansionPropCandidateV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  archetypeId: WhodunnitPropArchetypeIdV1,
): MansionPropThemeProgressV1 {
  assertArchetypeIdV1(archetypeId);
  assertOwnedMansionBundleV1(db, userId, bundleId);
  const now = new Date().toISOString();
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `UPDATE debate_mystery_mansion_prop_variants
          SET candidate_status = NULL, candidate_asset_id = NULL, candidate_attempt_count = 0,
              candidate_failure_code = NULL, updated_at = ?
        WHERE user_id = ? AND bundle_id = ? AND registry_version = ? AND archetype_id = ?`,
    ).run(now, userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1, archetypeId);
    db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ? AND role = 'prop' AND logical_id = ?`,
    ).run(bundleId, userId, `${PROP_THEME_LOGICAL_PREFIX_V1}${archetypeId}:candidate`);
    db.prepare(
      "UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?",
    ).run(now, bundleId, userId);
    cleanupUnreferencedDebateMysteryMansionAssetsV1(db, userId);
    if (ownsTransaction) db.exec("COMMIT");
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionPropThemeStateV1(db, userId, bundleId).progress;
}

/** Encrypts and content-deduplicates one accepted alpha sprite, then atomically binds its role. */
export async function saveReadyDebateMysteryMansionPropVariantV1(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
  bundleId: string,
  input: SaveDebateMysteryMansionPropVariantInputV1,
): Promise<DebateMysteryMansionPropThemeStateV1> {
  assertArchetypeIdV1(input.archetypeId);
  assertOwnedMansionBundleV1(db, userId, bundleId);
  const displayName = normalizedVariantTextV1(input.displayName, "Themed prop name", 180);
  const appearanceDescription = normalizedVariantTextV1(
    input.appearanceDescription,
    "Themed prop appearance",
    1_200,
  );
  if (!Buffer.isBuffer(input.bytes) || input.bytes.byteLength < 1 ||
      input.bytes.byteLength > MAX_PROP_SOURCE_BYTES_V1) {
    throw new HttpError(400, "The themed prop image is empty or too large.");
  }
  if (input.mimeType !== "image/png" && input.mimeType !== "image/webp") {
    throw new HttpError(400, "Themed props must be PNG or WebP images.");
  }
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(input.bytes, { failOn: "error" }).metadata();
  } catch {
    throw new HttpError(400, "The themed prop image could not be inspected.");
  }
  if (metadata.format !== "png" && metadata.format !== "webp") {
    throw new HttpError(400, "Themed props must be PNG or WebP images.");
  }
  if ((input.mimeType === "image/png") !== (metadata.format === "png")) {
    throw new HttpError(400, "The themed prop image type does not match its bytes.");
  }
  if (!metadata.hasAlpha || !metadata.width || !metadata.height ||
      metadata.width > 4_096 || metadata.height > 4_096) {
    throw new HttpError(400, "Themed props need a compatible transparent alpha image.");
  }
  ensureDebateMysteryMansionPropVariantsV1(db, userId, bundleId);
  const current = rowsForBundleV1(db, userId, bundleId).find(
    (row) => row.archetype_id === input.archetypeId,
  );
  if (current?.status === "failed") {
    throw new HttpError(409, "Retry this themed prop before accepting new artwork.");
  }
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const encrypted = encryptBytes(input.bytes, userKey);
  const now = new Date().toISOString();
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
       ON CONFLICT(user_id, sha256) DO UPDATE SET
         width = COALESCE(debate_mystery_mansion_assets.width, excluded.width),
         height = COALESCE(debate_mystery_mansion_assets.height, excluded.height),
         updated_at = excluded.updated_at`,
    ).run(
      randomUUID(),
      userId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      hash,
      input.bytes.byteLength,
      input.mimeType,
      metadata.width,
      metadata.height,
      input.provider?.trim().slice(0, 120) || null,
      input.model?.trim().slice(0, 180) || null,
      now,
      now,
    );
    const stored = db.prepare(
      "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
    ).get(userId, hash) as { id: string };
    const logicalId = input.lane === "candidate"
      ? `${PROP_THEME_LOGICAL_PREFIX_V1}${input.archetypeId}:candidate`
      : `${PROP_THEME_LOGICAL_PREFIX_V1}${input.archetypeId}`;
    db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = ? AND user_id = ? AND role = 'prop' AND logical_id = ?`,
    ).run(bundleId, userId, logicalId);
    db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES (?, ?, ?, 'prop', ?, ?)`,
    ).run(bundleId, userId, stored.id, logicalId, now);
    if (input.lane === "candidate") {
      db.prepare(
        `UPDATE debate_mystery_mansion_prop_variants
            SET candidate_status = 'ready', candidate_asset_id = ?, candidate_failure_code = NULL, updated_at = ?
          WHERE user_id = ? AND bundle_id = ? AND registry_version = ? AND archetype_id = ?`,
      ).run(stored.id, now, userId, bundleId, WHODUNNIT_PROP_REGISTRY_VERSION_V1, input.archetypeId);
    } else db.prepare(
      `INSERT INTO debate_mystery_mansion_prop_variants
         (user_id, bundle_id, registry_version, archetype_id, status,
          display_name, appearance_description, asset_id, attempt_count,
          failure_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, 0, NULL, ?, ?)
       ON CONFLICT(user_id, bundle_id, registry_version, archetype_id) DO UPDATE SET
         status = 'ready', display_name = excluded.display_name,
         appearance_description = excluded.appearance_description,
         asset_id = excluded.asset_id, failure_code = NULL,
         updated_at = excluded.updated_at`,
    ).run(
      userId,
      bundleId,
      WHODUNNIT_PROP_REGISTRY_VERSION_V1,
      input.archetypeId,
      displayName,
      appearanceDescription,
      stored.id,
      now,
      now,
    );
    db.prepare(
      "UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?",
    ).run(now, bundleId, userId);
    cleanupUnreferencedDebateMysteryMansionAssetsV1(db, userId);
    if (ownsTransaction) db.exec("COMMIT");
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionPropThemeStateV1(db, userId, bundleId);
}

export function cloneDebateMysteryMansionPropVariantsV1(
  db: DatabaseSync,
  userId: string,
  sourceBundleId: string,
  destinationBundleId: string,
  createdAt = new Date().toISOString(),
): void {
  db.prepare(
    `INSERT INTO debate_mystery_mansion_prop_variants
       (user_id, bundle_id, registry_version, archetype_id, status,
        display_name, appearance_description, asset_id, attempt_count,
        failure_code, created_at, updated_at)
     SELECT user_id, ?, registry_version, archetype_id, status,
            display_name, appearance_description, asset_id, attempt_count,
            failure_code, ?, ?
       FROM debate_mystery_mansion_prop_variants
      WHERE user_id = ? AND bundle_id = ?`,
  ).run(destinationBundleId, createdAt, createdAt, userId, sourceBundleId);
}

/** Deletes only bytes that have neither ordinary bundle refs nor a theme binding. */
export function cleanupUnreferencedDebateMysteryMansionAssetsV1(
  db: DatabaseSync,
  userId: string,
): void {
  const hasPropVariantTable = Boolean(
    db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'debate_mystery_mansion_prop_variants'",
    ).get(),
  );
  db.prepare(
    `DELETE FROM debate_mystery_mansion_assets
      WHERE user_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM debate_mystery_mansion_asset_refs AS refs
           WHERE refs.user_id = debate_mystery_mansion_assets.user_id
             AND refs.asset_id = debate_mystery_mansion_assets.id
        )${hasPropVariantTable ? `
        AND NOT EXISTS (
          SELECT 1 FROM debate_mystery_mansion_prop_variants AS variants
           WHERE variants.user_id = debate_mystery_mansion_assets.user_id
             AND variants.asset_id = debate_mystery_mansion_assets.id
        )` : ""}`,
  ).run(userId);
}
