import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import type {
  DebateMysterySealedAssetKindV1,
  DebateMysterySealedAssetRefV1,
  DebateMysterySealedAssetStatusV1,
} from "@localai/shared";
import {
  buildGeneratedImageRelativePath,
  tryUnlinkGeneratedImageFile,
  writeGeneratedImageBytes,
} from "./image-storage.ts";
import { decryptBytes, encryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";

interface MysteryAssetVaultRow {
  id: string;
  user_id: string;
  session_id: string;
  kind: DebateMysterySealedAssetKindV1;
  subject_id: string;
  status: DebateMysterySealedAssetStatusV1;
  source: "synthesized" | "bundled";
  mime_type: "image/png" | "image/webp";
  ciphertext: Buffer | null;
  cipher_iv: Buffer | null;
  cipher_tag: Buffer | null;
  sha256: string | null;
  byte_size: number | null;
  provider: string | null;
  model: string | null;
  review_json: string;
  revealed_at: string | null;
  saved_image_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DebateMysteryAssetPixelValidationV1 {
  width: number;
  height: number;
  visibleRatio: number;
  transparentRatio: number;
  magentaRatio: number;
}

export interface DebateMysteryAssetVisionReviewV1 {
  approved: boolean;
  reasons: string[];
  reviewer: string;
}

const SPECULATIVE_MYSTERY_ASSET_REVIEW_REASON =
  /\b(?:could(?!\s+not\b)|may|might|perhaps|possib(?:le|ly)|potential(?:ly)?|seem(?:s|ed)?|suggest(?:s|ed)?|uncertain(?:ty)?)\b/iu;
const CONCRETE_MYSTERY_ASSET_REVIEW_FINDING =
  /\b(?:appear(?:s|ed)?|cannot|can['’]t|could\s+not|couldn['’]t|did\s+not|does\s+not|do\s+not|fail(?:s|ed)?\s+to|contain(?:s|ed)?|include(?:s|d)?|show(?:s|ed)?|depict(?:s|ed)?|has|visible|cropped|rotated|misaligned|distorted|duplicated|pixelated)\b/iu;

/**
 * Vision reviewers sometimes contradict the validation contract by returning a
 * negative decision whose only reasons are hedged possibilities. Treat those
 * as non-findings while preserving every concrete, observable defect.
 */
export function normalizeDebateMysteryAssetVisionReviewV1(
  review: DebateMysteryAssetVisionReviewV1,
): DebateMysteryAssetVisionReviewV1 {
  if (review.approved) {
    return { ...review, approved: true, reasons: [] };
  }
  const reasons = review.reasons.filter(
    (reason) =>
      !SPECULATIVE_MYSTERY_ASSET_REVIEW_REASON.test(reason) ||
      CONCRETE_MYSTERY_ASSET_REVIEW_FINDING.test(reason),
  );
  if (review.reasons.length > 0 && reasons.length === 0) {
    return { ...review, approved: true, reasons: [] };
  }
  return { ...review, approved: false, reasons };
}

export interface DebateMysteryAssetVaultBackupV1 {
  version: 1;
  assets: Array<{
    sessionId: string;
    kind: DebateMysterySealedAssetKindV1;
    subjectId: string;
    status: DebateMysterySealedAssetStatusV1;
    source: "synthesized" | "bundled";
    mimeType: "image/png" | "image/webp";
    bytesBase64: string | null;
    sha256: string | null;
    provider: string | null;
    model: string | null;
    reviewJson: string;
    revealedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

const MAGENTA_DISTANCE = 20;
const MAX_ASSET_BYTES = 32 * 1024 * 1024;

function rowRef(row: MysteryAssetVaultRow): DebateMysterySealedAssetRefV1 {
  return {
    version: 1,
    kind: row.kind,
    status: row.status,
    source: row.source,
    revealed: Boolean(row.revealed_at),
    mimeType: row.mime_type,
  };
}

function assetRow(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  kind: DebateMysterySealedAssetKindV1,
  subjectId: string,
): MysteryAssetVaultRow | null {
  return (db.prepare(
    `SELECT * FROM debate_mystery_asset_vault
      WHERE user_id = ? AND session_id = ? AND kind = ? AND subject_id = ?`,
  ).get(userId, sessionId, kind, subjectId) as MysteryAssetVaultRow | undefined) ?? null;
}

function compactReviewJson(review: Record<string, unknown>): string {
  const attempt = Number.isInteger(review.attempt) ? Number(review.attempt) : null;
  const pixelsSource = review.pixels && typeof review.pixels === "object"
    ? review.pixels as Record<string, unknown>
    : {};
  const visionSource = review.vision && typeof review.vision === "object"
    ? review.vision as Record<string, unknown>
    : {};
  const number = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const reasons = Array.isArray(visionSource.reasons)
    ? visionSource.reasons.filter((value): value is string => typeof value === "string")
    : [];
  return JSON.stringify({
    attempt,
    pixels: {
      width: number(pixelsSource.width),
      height: number(pixelsSource.height),
      visibleRatio: number(pixelsSource.visibleRatio),
      transparentRatio: number(pixelsSource.transparentRatio),
      magentaRatio: number(pixelsSource.magentaRatio),
    },
    vision: {
      approved: visionSource.approved === true,
      reviewer:
        typeof visionSource.reviewer === "string"
          ? visionSource.reviewer.slice(0, 80)
          : null,
      reasonCount: reasons.length,
    },
  });
}

function retryCountFromReviewJson(reviewJson: string): number {
  try {
    const parsed = JSON.parse(reviewJson) as { retryCount?: unknown };
    return Number.isInteger(parsed.retryCount) && Number(parsed.retryCount) >= 0
      ? Number(parsed.retryCount)
      : 0;
  } catch {
    return 0;
  }
}

function fallbackReasonCode(reason: string): string {
  const normalized = reason.toLocaleLowerCase();
  if (normalized.includes("local") || normalized.includes("authorized")) return "provider_unavailable";
  if (normalized.includes("vision") || normalized.includes("review")) return "review_rejected";
  if (
    normalized.includes("magenta") ||
    normalized.includes("alpha") ||
    normalized.includes("opaque") ||
    normalized.includes("dimension") ||
    normalized.includes("geometry") ||
    normalized.includes("subject")
  ) return "validation_failed";
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("too long")
  ) return "timed_out";
  return "generation_failed";
}

const RETRYABLE_FALLBACK_REASON_CODES = new Set([
  "generation_failed",
  "review_rejected",
  "timed_out",
  "validation_failed",
]);

export interface DebateMysteryRequeuedAssetV1 {
  kind: DebateMysterySealedAssetKindV1;
  subjectId: string;
  asset: DebateMysterySealedAssetRefV1;
}

/**
 * Gives transient ONLINE synthesis failures one durable recovery pass. The
 * retry count lives in spoiler-safe review metadata so reopening a case cannot
 * create an unbounded generation loop.
 */
export function requeueRetryableDebateMysteryAssetFallbacksV1(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  maxRetryCount = 1,
  allowedKinds: readonly DebateMysterySealedAssetKindV1[] = ["evidence", "room"],
): DebateMysteryRequeuedAssetV1[] {
  const rows = db.prepare(
    `SELECT * FROM debate_mystery_asset_vault
      WHERE user_id = ? AND session_id = ? AND status = 'fallback'
      ORDER BY kind, subject_id`,
  ).all(userId, sessionId) as unknown as MysteryAssetVaultRow[];
  const allowedKindSet = new Set(allowedKinds);
  const requeued: DebateMysteryRequeuedAssetV1[] = [];
  const update = db.prepare(
    `UPDATE debate_mystery_asset_vault
        SET status = 'pending', source = 'synthesized',
            ciphertext = NULL, cipher_iv = NULL, cipher_tag = NULL,
            sha256 = NULL, byte_size = NULL, provider = NULL, model = NULL,
            review_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND session_id = ? AND status = 'fallback'`,
  );
  for (const row of rows) {
    let reasonCode = "generation_failed";
    try {
      const parsed = JSON.parse(row.review_json) as { reasonCode?: unknown };
      if (typeof parsed.reasonCode === "string") reasonCode = parsed.reasonCode;
    } catch {
      // Old fallback rows predate structured spoiler-safe diagnostics.
    }
    const retryCount = retryCountFromReviewJson(row.review_json);
    if (
      !allowedKindSet.has(row.kind) ||
      retryCount >= maxRetryCount ||
      !RETRYABLE_FALLBACK_REASON_CODES.has(reasonCode)
    ) continue;
    const nextRetryCount = retryCount + 1;
    const updated = update.run(
      JSON.stringify({ retryCount: nextRetryCount }),
      new Date().toISOString(),
      row.id,
      userId,
      sessionId,
    );
    if (Number(updated.changes) !== 1) continue;
    requeued.push({
      kind: row.kind,
      subjectId: row.subject_id,
      asset: rowRef(assetRow(db, userId, sessionId, row.kind, row.subject_id)!),
    });
  }
  return requeued;
}

export function getDebateMysterySealedAssetRefV1(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  kind: DebateMysterySealedAssetKindV1,
  subjectId: string,
): DebateMysterySealedAssetRefV1 | null {
  const row = assetRow(db, userId, sessionId, kind, subjectId);
  return row ? rowRef(row) : null;
}

export function listDebateMysterySealedAssetRefsV1(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateMysterySealedAssetRefV1[] {
  return (db.prepare(
    `SELECT * FROM debate_mystery_asset_vault
      WHERE user_id = ? AND session_id = ?
      ORDER BY kind, subject_id`,
  ).all(userId, sessionId) as unknown as MysteryAssetVaultRow[]).map(rowRef);
}

export function setDebateMysteryAssetPendingV1(
  db: DatabaseSync,
  args: {
    userId: string;
    sessionId: string;
    kind: DebateMysterySealedAssetKindV1;
    subjectId: string;
    mimeType?: "image/png" | "image/webp";
  },
): DebateMysterySealedAssetRefV1 {
  const existing = assetRow(
    db,
    args.userId,
    args.sessionId,
    args.kind,
    args.subjectId,
  );
  if (existing?.status === "ready" || existing?.status === "fallback") {
    return rowRef(existing);
  }
  const now = new Date().toISOString();
  const id = existing?.id ?? randomUUID();
  const retryCount = existing ? retryCountFromReviewJson(existing.review_json) : 0;
  const pendingReviewJson = retryCount > 0
    ? JSON.stringify({ retryCount })
    : "{}";
  db.prepare(
    `INSERT INTO debate_mystery_asset_vault
       (id, user_id, session_id, kind, subject_id, status, source, mime_type,
        review_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 'synthesized', ?, ?, ?, ?)
     ON CONFLICT(user_id, session_id, kind, subject_id) DO UPDATE SET
       status = 'pending', source = 'synthesized', mime_type = excluded.mime_type,
       ciphertext = NULL, cipher_iv = NULL, cipher_tag = NULL, sha256 = NULL,
       byte_size = NULL, provider = NULL, model = NULL,
       review_json = excluded.review_json,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    args.userId,
    args.sessionId,
    args.kind,
    args.subjectId,
    args.mimeType ?? "image/png",
    pendingReviewJson,
    existing?.created_at ?? now,
    now,
  );
  return rowRef(assetRow(db, args.userId, args.sessionId, args.kind, args.subjectId)!);
}

export function sealDebateMysteryAssetBytesV1(
  db: DatabaseSync,
  userKey: Buffer,
  args: {
    userId: string;
    sessionId: string;
    kind: DebateMysterySealedAssetKindV1;
    subjectId: string;
    bytes: Buffer;
    mimeType?: "image/png" | "image/webp";
    provider: string;
    model: string;
    review: Record<string, unknown>;
  },
): DebateMysterySealedAssetRefV1 {
  if (!args.bytes.length || args.bytes.length > MAX_ASSET_BYTES) {
    throw new Error("Sealed case visual bytes are outside the supported size boundary.");
  }
  const encrypted = encryptBytes(args.bytes, userKey);
  const now = new Date().toISOString();
  const existing = assetRow(db, args.userId, args.sessionId, args.kind, args.subjectId);
  const id = existing?.id ?? randomUUID();
  const sha256 = createHash("sha256").update(args.bytes).digest("hex");
  db.prepare(
    `INSERT INTO debate_mystery_asset_vault
       (id, user_id, session_id, kind, subject_id, status, source, mime_type,
        ciphertext, cipher_iv, cipher_tag, sha256, byte_size, provider, model,
        review_json, revealed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ready', 'synthesized', ?, ?, ?, ?, ?, ?, ?, ?, ?,
             NULL, ?, ?)
     ON CONFLICT(user_id, session_id, kind, subject_id) DO UPDATE SET
       status = 'ready', source = 'synthesized', mime_type = excluded.mime_type,
       ciphertext = excluded.ciphertext, cipher_iv = excluded.cipher_iv,
       cipher_tag = excluded.cipher_tag, sha256 = excluded.sha256,
       byte_size = excluded.byte_size, provider = excluded.provider,
       model = excluded.model, review_json = excluded.review_json,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    args.userId,
    args.sessionId,
    args.kind,
    args.subjectId,
    args.mimeType ?? "image/png",
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    sha256,
    args.bytes.length,
    args.provider.slice(0, 80),
    args.model.slice(0, 160),
    compactReviewJson(args.review),
    existing?.created_at ?? now,
    now,
  );
  return rowRef(assetRow(db, args.userId, args.sessionId, args.kind, args.subjectId)!);
}

export function setDebateMysteryAssetFallbackV1(
  db: DatabaseSync,
  args: {
    userId: string;
    sessionId: string;
    kind: DebateMysterySealedAssetKindV1;
    subjectId: string;
    mimeType?: "image/png" | "image/webp";
    reason: string;
  },
): DebateMysterySealedAssetRefV1 {
  const now = new Date().toISOString();
  const existing = assetRow(db, args.userId, args.sessionId, args.kind, args.subjectId);
  const id = existing?.id ?? randomUUID();
  const retryCount = existing ? retryCountFromReviewJson(existing.review_json) : 0;
  db.prepare(
    `INSERT INTO debate_mystery_asset_vault
       (id, user_id, session_id, kind, subject_id, status, source, mime_type,
        review_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'fallback', 'bundled', ?, ?, ?, ?)
     ON CONFLICT(user_id, session_id, kind, subject_id) DO UPDATE SET
       status = 'fallback', source = 'bundled', mime_type = excluded.mime_type,
       ciphertext = NULL, cipher_iv = NULL, cipher_tag = NULL, sha256 = NULL,
       byte_size = NULL, provider = NULL, model = NULL,
       review_json = excluded.review_json,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    args.userId,
    args.sessionId,
    args.kind,
    args.subjectId,
    args.mimeType ?? "image/webp",
    JSON.stringify({
      fallback: true,
      reasonCode: fallbackReasonCode(args.reason),
      ...(retryCount > 0 ? { retryCount } : {}),
    }),
    existing?.created_at ?? now,
    now,
  );
  return rowRef(assetRow(db, args.userId, args.sessionId, args.kind, args.subjectId)!);
}

export function revealDebateMysteryAssetV1(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  kind: DebateMysterySealedAssetKindV1,
  subjectId: string,
): DebateMysterySealedAssetRefV1 | null {
  const existing = assetRow(db, userId, sessionId, kind, subjectId);
  if (!existing || existing.status === "pending") return existing ? rowRef(existing) : null;
  if (!existing.revealed_at) {
    db.prepare(
      `UPDATE debate_mystery_asset_vault
          SET revealed_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND session_id = ?`,
    ).run(new Date().toISOString(), new Date().toISOString(), existing.id, userId, sessionId);
  }
  return rowRef(assetRow(db, userId, sessionId, kind, subjectId)!);
}

export function resetDebateMysteryAssetRevealsV1(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): number {
  return Number(db.prepare(
    `UPDATE debate_mystery_asset_vault
        SET revealed_at = NULL, updated_at = ?
      WHERE user_id = ? AND session_id = ? AND revealed_at IS NOT NULL`,
  ).run(new Date().toISOString(), userId, sessionId).changes);
}

export function deleteDebateMysterySealedAssetsV1(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): number {
  return Number(db.prepare(
    "DELETE FROM debate_mystery_asset_vault WHERE user_id = ? AND session_id = ?",
  ).run(userId, sessionId).changes);
}

/** Play Again keeps byte-identical encrypted art under the new case owner while
 * resetting reveal/save authorization. Ciphertext never leaves SQLite. */
export function cloneDebateMysterySealedAssetsForReplayV1(
  db: DatabaseSync,
  userId: string,
  sourceSessionId: string,
  targetSessionId: string,
): number {
  const rows = db.prepare(
    `SELECT * FROM debate_mystery_asset_vault
      WHERE user_id = ? AND session_id = ?
      ORDER BY kind, subject_id`,
  ).all(userId, sourceSessionId) as unknown as MysteryAssetVaultRow[];
  const insert = db.prepare(
    `INSERT INTO debate_mystery_asset_vault
       (id, user_id, session_id, kind, subject_id, status, source, mime_type,
        ciphertext, cipher_iv, cipher_tag, sha256, byte_size, provider, model,
        review_json, revealed_at, saved_image_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  );
  const now = new Date().toISOString();
  for (const row of rows) {
    insert.run(
      randomUUID(),
      userId,
      targetSessionId,
      row.kind,
      row.subject_id,
      row.status,
      row.source,
      row.mime_type,
      row.ciphertext,
      row.cipher_iv,
      row.cipher_tag,
      row.sha256,
      row.byte_size,
      row.provider,
      row.model,
      row.review_json,
      now,
      now,
    );
  }
  return rows.length;
}

export function getRevealedDebateMysteryAssetFileV1(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
  sessionId: string,
  kind: DebateMysterySealedAssetKindV1,
  subjectId: string,
): { bytes: Buffer; mimeType: "image/png" | "image/webp"; sha256: string } {
  const row = assetRow(db, userId, sessionId, kind, subjectId);
  if (!row) throw new HttpError(404, "That sealed case visual was not found.");
  if (!row.revealed_at || row.status !== "ready") {
    throw new HttpError(404, "That case visual has not been revealed.");
  }
  if (!row.ciphertext || !row.cipher_iv || !row.cipher_tag || !row.sha256) {
    throw new HttpError(409, "That case visual is using its bundled fallback.");
  }
  const bytes = decryptBytes(
    { ciphertext: row.ciphertext, iv: row.cipher_iv, tag: row.cipher_tag },
    userKey,
  );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== row.sha256 || bytes.length !== row.byte_size) {
    throw new Error("Sealed case visual integrity validation failed.");
  }
  return { bytes, mimeType: row.mime_type, sha256 };
}

export function saveRevealedDebateMysteryAssetV1(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
  sessionId: string,
  kind: DebateMysterySealedAssetKindV1,
  subjectId: string,
  title: string,
): { imageId: string; url: string } {
  const row = assetRow(db, userId, sessionId, kind, subjectId);
  if (!row) throw new HttpError(404, "That sealed case visual was not found.");
  if (row.saved_image_id) {
    const owned = db.prepare("SELECT id FROM images WHERE id = ? AND user_id = ?")
      .get(row.saved_image_id, userId) as { id?: string } | undefined;
    if (owned?.id) {
      return { imageId: owned.id, url: `/api/images/${encodeURIComponent(owned.id)}/file` };
    }
  }
  const file = getRevealedDebateMysteryAssetFileV1(
    db,
    userKey,
    userId,
    sessionId,
    kind,
    subjectId,
  );
  const imageId = randomUUID();
  const localRelPath = buildGeneratedImageRelativePath(userId, imageId);
  const now = new Date().toISOString();
  writeGeneratedImageBytes(localRelPath, file.bytes);
  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare(
      `INSERT INTO images
         (id, user_id, conversation_id, bot_id, related_bot_ids, origin, prompt,
          revised_prompt, url, size, quality, provider, model, local_rel_path,
          purpose, created_at)
       VALUES (?, ?, NULL, NULL, '[]', 'debate_mystery_saved', ?, NULL, ?, ?,
               'standard', 'sealed_case_copy', 'sealed-case-v1', ?, ?, ?)`,
    ).run(
      imageId,
      userId,
      title.trim().slice(0, 500) || "Saved Whodunnit visual",
      `/api/images/${encodeURIComponent(imageId)}/file`,
      row.kind === "room" ? "1536x1024" : "1024x1024",
      localRelPath,
      row.kind === "room" ? "whodunnit_room" : "debate_exhibit",
      now,
    );
    db.prepare(
      `UPDATE debate_mystery_asset_vault
          SET saved_image_id = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND session_id = ?`,
    ).run(imageId, now, row.id, userId, sessionId);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    tryUnlinkGeneratedImageFile(localRelPath);
    throw error;
  }
  return { imageId, url: `/api/images/${encodeURIComponent(imageId)}/file` };
}

export async function validateDebateMysteryAssetPixelsV1(
  kind: DebateMysterySealedAssetKindV1,
  bytes: Buffer,
): Promise<DebateMysteryAssetPixelValidationV1> {
  const prepared = await sharp(bytes, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = prepared.info;
  if (channels !== 4) throw new Error("Case visual could not be inspected as RGBA.");
  if (kind === "room" && (width !== 1536 || height !== 1024)) {
    throw new Error("Room synthesis must preserve the 1536×1024 template.");
  }
  if (kind === "evidence" && (width !== 1024 || height !== 1024)) {
    throw new Error("Evidence synthesis must normalize to 1024×1024.");
  }
  let visible = 0;
  let transparent = 0;
  let magenta = 0;
  for (let offset = 0; offset < prepared.data.length; offset += 4) {
    const alpha = prepared.data[offset + 3]!;
    if (alpha > 16) visible += 1;
    if (alpha < 245) transparent += 1;
    if (
      alpha > 16 &&
      Math.abs(prepared.data[offset]! - 255) <= MAGENTA_DISTANCE &&
      prepared.data[offset + 1]! <= MAGENTA_DISTANCE &&
      Math.abs(prepared.data[offset + 2]! - 255) <= MAGENTA_DISTANCE
    ) magenta += 1;
  }
  const pixels = Math.max(1, width * height);
  const result = {
    width,
    height,
    visibleRatio: visible / pixels,
    transparentRatio: transparent / pixels,
    magentaRatio: magenta / pixels,
  };
  if (kind === "evidence") {
    if (result.visibleRatio < 0.01 || result.visibleRatio > 0.82) {
      throw new Error("Evidence synthesis needs one isolated visible subject.");
    }
    if (result.transparentRatio < 0.18) {
      throw new Error("Evidence synthesis retained an opaque background.");
    }
    if (result.magentaRatio > 0.002) {
      throw new Error("Evidence synthesis retained visible magenta key pixels.");
    }
  } else {
    if (result.visibleRatio < 0.98 || result.transparentRatio > 0.002) {
      throw new Error("Room synthesis must remain a fully opaque scene.");
    }
    if (result.magentaRatio > 0.001) {
      throw new Error("Room synthesis contains the reserved magenta key color.");
    }
    const stats = await sharp(bytes).stats();
    if (stats.channels.every((channel) => channel.stdev < 2)) {
      throw new Error("Room synthesis failed the structural detail check.");
    }
  }
  return result;
}

export function exportDebateMysteryAssetVaultBackupV1(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
): DebateMysteryAssetVaultBackupV1 {
  const rows = db.prepare(
    `SELECT vault.* FROM debate_mystery_asset_vault AS vault
       JOIN debate_sessions AS session ON session.id = vault.session_id
      WHERE vault.user_id = ? AND session.status != 'cancelled'
      ORDER BY vault.session_id, vault.kind, vault.subject_id`,
  ).all(userId) as unknown as MysteryAssetVaultRow[];
  return {
    version: 1,
    assets: rows.map((row) => {
      const bytes = row.status === "ready" && row.ciphertext && row.cipher_iv && row.cipher_tag
        ? decryptBytes(
            { ciphertext: row.ciphertext, iv: row.cipher_iv, tag: row.cipher_tag },
            userKey,
          )
        : null;
      if (bytes && createHash("sha256").update(bytes).digest("hex") !== row.sha256) {
        throw new Error("Sealed case visual is corrupt and cannot be backed up.");
      }
      return {
        sessionId: row.session_id,
        kind: row.kind,
        subjectId: row.subject_id,
        status: row.status,
        source: row.source,
        mimeType: row.mime_type,
        bytesBase64: bytes?.toString("base64") ?? null,
        sha256: row.sha256,
        provider: row.provider,
        model: row.model,
        reviewJson: row.review_json,
        revealedAt: row.revealed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }),
  };
}

export function importDebateMysteryAssetVaultBackupV1(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  backup: DebateMysteryAssetVaultBackupV1,
  allowedSessionIds: ReadonlySet<string>,
): void {
  if (backup.version !== 1 || !Array.isArray(backup.assets)) {
    throw new Error("Account backup contains an invalid sealed mystery asset vault.");
  }
  for (const asset of backup.assets) {
    if (
      !allowedSessionIds.has(asset.sessionId) ||
      (asset.kind !== "evidence" && asset.kind !== "room") ||
      !asset.subjectId?.trim() ||
      !["pending", "ready", "fallback"].includes(asset.status) ||
      (asset.source !== "synthesized" && asset.source !== "bundled") ||
      (asset.mimeType !== "image/png" && asset.mimeType !== "image/webp")
    ) throw new Error("Account backup contains an invalid sealed mystery asset.");
    const bytes = asset.bytesBase64 ? Buffer.from(asset.bytesBase64, "base64") : null;
    if (asset.status === "ready") {
      if (!bytes?.length || bytes.length > MAX_ASSET_BYTES) {
        throw new Error("Account backup is missing sealed mystery asset bytes.");
      }
      if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
        throw new Error("Account backup contains a corrupted sealed mystery asset.");
      }
    } else if (bytes) {
      throw new Error("Only ready sealed mystery assets may carry bytes.");
    }
    const encrypted = bytes ? encryptBytes(bytes, userKey) : null;
    db.prepare(
      `INSERT OR REPLACE INTO debate_mystery_asset_vault
         (id, user_id, session_id, kind, subject_id, status, source, mime_type,
          ciphertext, cipher_iv, cipher_tag, sha256, byte_size, provider, model,
          review_json, revealed_at, saved_image_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      randomUUID(),
      userId,
      asset.sessionId,
      asset.kind,
      asset.subjectId,
      asset.status,
      asset.source,
      asset.mimeType,
      encrypted?.ciphertext ?? null,
      encrypted?.iv ?? null,
      encrypted?.tag ?? null,
      bytes ? asset.sha256 : null,
      bytes?.length ?? null,
      asset.provider,
      asset.model,
      (() => {
        try {
          const parsed = JSON.parse(asset.reviewJson) as Record<string, unknown>;
          if (asset.status === "ready") return compactReviewJson(parsed);
          if (asset.status === "fallback") {
            const code = parsed.reasonCode;
            return JSON.stringify({
              fallback: true,
              reasonCode: typeof code === "string" ? code.slice(0, 80) : "generation_failed",
            });
          }
          return "{}";
        } catch {
          throw new Error("Account backup contains invalid sealed mystery review metadata.");
        }
      })(),
      asset.revealedAt,
      asset.createdAt,
      asset.updatedAt,
    );
  }
}
