import type { DatabaseSync } from "node:sqlite";
import type {
  MemoryAcquisitionReceiptKind,
  MemoryAcquisitionSensitivity,
  MemoryEcologySettings,
} from "@localai/shared";
import { randomId } from "./security.ts";

export const DEFAULT_MEMORY_ECOLOGY_SETTINGS: MemoryEcologySettings = {
  learnAboutPlayer: true,
  learnAboutBots: true,
  acquisitionSensitivity: "balanced",
  shortTermRetentionDays: 30,
  longTermPromotionThreshold: 0.9,
  inferredMinEvidenceCount: 3,
  inferredConfidenceThreshold: 0.8,
};

export const MEMORY_ACQUISITION_THRESHOLDS: Record<
  MemoryAcquisitionSensitivity,
  number
> = {
  cautious: 0.7,
  balanced: 0.55,
  curious: 0.4,
};

export const MIN_SHORT_TERM_RETENTION_DAYS = 1;
export const MAX_SHORT_TERM_RETENTION_DAYS = 365;
export const MIN_LONG_TERM_PROMOTION_THRESHOLD = 0.7;
export const MAX_LONG_TERM_PROMOTION_THRESHOLD = 1;
export const MIN_INFERRED_EVIDENCE_COUNT = 2;
export const MAX_INFERRED_EVIDENCE_COUNT = 8;
export const MIN_INFERRED_CONFIDENCE_THRESHOLD = 0.6;
export const MAX_INFERRED_CONFIDENCE_THRESHOLD = 0.95;

const DAY_MS = 24 * 60 * 60 * 1_000;

type MemoryEcologyUserRow = {
  auto_memory?: number | null;
  memory_learn_about_player?: number | null;
  memory_learn_about_bots?: number | null;
  memory_acquisition_sensitivity?: string | null;
  memory_short_term_days?: number | null;
  memory_long_term_threshold?: number | null;
  memory_inferred_min_evidence?: number | null;
  memory_inferred_threshold?: number | null;
};

type DecayMemoryRow = {
  id: string;
  confidence: number;
  base_confidence: number | null;
  tier: string | null;
  lifecycle: string | null;
  source: string | null;
  certainty: number | null;
  last_reinforced_at: string | null;
  created_at: string;
};

export type MemoryAcquisitionReceiptRow = {
  id: string;
  user_id: string;
  memory_id: string;
  learner_bot_id: string | null;
  target_bot_id: string | null;
  conversation_id: string | null;
  kind: MemoryAcquisitionReceiptKind;
  created_at: string;
  read_at: string | null;
};

export class MemoryEcologySettingsInputError extends Error {}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function unit(value: number): number {
  return clamp(value, 0, 1);
}

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sensitivity(value: unknown): MemoryAcquisitionSensitivity {
  return value === "cautious" || value === "curious" || value === "balanced"
    ? value
    : "balanced";
}

function tableColumns(db: DatabaseSync, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
}

/** Keeps focused unit-test databases compatible with the production migrations. */
export function ensureMemoryEcologyMemorySchema(db: DatabaseSync): void {
  const columns = tableColumns(db, "memories");
  if (columns.size === 0) return;
  if (!columns.has("target_bot_id")) {
    db.exec("ALTER TABLE memories ADD COLUMN target_bot_id TEXT;");
  }
  if (!columns.has("base_confidence")) {
    db.exec("ALTER TABLE memories ADD COLUMN base_confidence REAL;");
  }
  if (!columns.has("lifecycle")) {
    db.exec(
      "ALTER TABLE memories ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'short_term';",
    );
  }
  if (!columns.has("evidence_lineage_known")) {
    db.exec(
      "ALTER TABLE memories ADD COLUMN evidence_lineage_known INTEGER NOT NULL DEFAULT 0;",
    );
  }
  if (!columns.has("last_reinforced_at")) {
    db.exec("ALTER TABLE memories ADD COLUMN last_reinforced_at TEXT;");
  }
  db.exec(`
    UPDATE memories
       SET base_confidence = COALESCE(base_confidence, confidence),
           last_reinforced_at = COALESCE(last_reinforced_at, created_at),
           lifecycle = CASE
             WHEN source = 'inferred' THEN 'derived'
             WHEN tier = 'long_term' THEN 'long_term'
             ELSE 'short_term'
           END
     WHERE base_confidence IS NULL
        OR last_reinforced_at IS NULL
        OR lifecycle IS NULL
        OR trim(lifecycle) = '';
    CREATE TABLE IF NOT EXISTS memory_evidence_links (
      user_id TEXT NOT NULL,
      inferred_memory_id TEXT NOT NULL,
      evidence_memory_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, inferred_memory_id, evidence_memory_id)
    );
    CREATE TABLE IF NOT EXISTS memory_acquisition_receipts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      learner_bot_id TEXT,
      target_bot_id TEXT,
      conversation_id TEXT,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT
    );
    CREATE TABLE IF NOT EXISTS memory_relationship_projections (
      user_id TEXT NOT NULL,
      source_bot_id TEXT NOT NULL,
      target_bot_id TEXT NOT NULL,
      base_score REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, source_bot_id, target_bot_id)
    );
    UPDATE memories
       SET evidence_lineage_known = 1
     WHERE EXISTS (
       SELECT 1
         FROM memory_evidence_links AS links
        WHERE links.user_id = memories.user_id
          AND links.inferred_memory_id = memories.id
     );
  `);
}

export function normalizeMemoryEcologySettings(
  row: MemoryEcologyUserRow | null | undefined,
): MemoryEcologySettings {
  const legacyEnabled = row?.auto_memory !== 0;
  return {
    learnAboutPlayer:
      row?.memory_learn_about_player === undefined ||
      row.memory_learn_about_player === null
        ? legacyEnabled
        : row.memory_learn_about_player !== 0,
    learnAboutBots:
      row?.memory_learn_about_bots === undefined || row.memory_learn_about_bots === null
        ? legacyEnabled
        : row.memory_learn_about_bots !== 0,
    acquisitionSensitivity: sensitivity(row?.memory_acquisition_sensitivity),
    shortTermRetentionDays: clamp(
      integer(
        row?.memory_short_term_days,
        DEFAULT_MEMORY_ECOLOGY_SETTINGS.shortTermRetentionDays,
      ),
      MIN_SHORT_TERM_RETENTION_DAYS,
      MAX_SHORT_TERM_RETENTION_DAYS,
    ),
    longTermPromotionThreshold: clamp(
      finite(
        row?.memory_long_term_threshold,
        DEFAULT_MEMORY_ECOLOGY_SETTINGS.longTermPromotionThreshold,
      ),
      MIN_LONG_TERM_PROMOTION_THRESHOLD,
      MAX_LONG_TERM_PROMOTION_THRESHOLD,
    ),
    inferredMinEvidenceCount: clamp(
      integer(
        row?.memory_inferred_min_evidence,
        DEFAULT_MEMORY_ECOLOGY_SETTINGS.inferredMinEvidenceCount,
      ),
      MIN_INFERRED_EVIDENCE_COUNT,
      MAX_INFERRED_EVIDENCE_COUNT,
    ),
    inferredConfidenceThreshold: clamp(
      finite(
        row?.memory_inferred_threshold,
        DEFAULT_MEMORY_ECOLOGY_SETTINGS.inferredConfidenceThreshold,
      ),
      MIN_INFERRED_CONFIDENCE_THRESHOLD,
      MAX_INFERRED_CONFIDENCE_THRESHOLD,
    ),
  };
}

export function readMemoryEcologySettings(
  db: DatabaseSync,
  userId: string,
  legacyAutoMemory?: boolean,
): MemoryEcologySettings {
  const fallback = {
    ...DEFAULT_MEMORY_ECOLOGY_SETTINGS,
    ...(legacyAutoMemory === undefined
      ? {}
      : {
          learnAboutPlayer: legacyAutoMemory,
          learnAboutBots: legacyAutoMemory,
        }),
  };
  const columns = tableColumns(db, "users");
  if (columns.size === 0) return fallback;
  const availableFields = [
    "auto_memory",
    "memory_learn_about_player",
    "memory_learn_about_bots",
    "memory_acquisition_sensitivity",
    "memory_short_term_days",
    "memory_long_term_threshold",
    "memory_inferred_min_evidence",
    "memory_inferred_threshold",
  ].filter((field) => columns.has(field));
  if (availableFields.length === 0) {
    return fallback;
  }
  const row = db
    .prepare(
      `SELECT ${availableFields.join(", ")}
         FROM users
        WHERE id = ?`,
    )
    .get(userId) as MemoryEcologyUserRow | undefined;
  return row ? normalizeMemoryEcologySettings(row) : fallback;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new MemoryEcologySettingsInputError(`${field} must be true or false.`);
  }
  return value;
}

function requireNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  whole = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (whole && !Number.isInteger(value))
  ) {
    throw new MemoryEcologySettingsInputError(
      `${field} must be ${whole ? "a whole number" : "a number"} from ${min} to ${max}.`,
    );
  }
  return value;
}

export function resolveMemoryEcologySettingsPatch(
  body: Record<string, unknown>,
  current: MemoryEcologySettings,
): MemoryEcologySettings {
  const next = { ...current };
  if (body.learnAboutPlayer !== undefined) {
    next.learnAboutPlayer = requireBoolean(body.learnAboutPlayer, "learnAboutPlayer");
  }
  if (body.learnAboutBots !== undefined) {
    next.learnAboutBots = requireBoolean(body.learnAboutBots, "learnAboutBots");
  }
  if (body.acquisitionSensitivity !== undefined) {
    if (
      body.acquisitionSensitivity !== "cautious" &&
      body.acquisitionSensitivity !== "balanced" &&
      body.acquisitionSensitivity !== "curious"
    ) {
      throw new MemoryEcologySettingsInputError(
        "acquisitionSensitivity must be cautious, balanced, or curious.",
      );
    }
    next.acquisitionSensitivity = body.acquisitionSensitivity;
  }
  if (body.shortTermRetentionDays !== undefined) {
    next.shortTermRetentionDays = requireNumber(
      body.shortTermRetentionDays,
      "shortTermRetentionDays",
      MIN_SHORT_TERM_RETENTION_DAYS,
      MAX_SHORT_TERM_RETENTION_DAYS,
      true,
    );
  }
  if (body.longTermPromotionThreshold !== undefined) {
    next.longTermPromotionThreshold = requireNumber(
      body.longTermPromotionThreshold,
      "longTermPromotionThreshold",
      MIN_LONG_TERM_PROMOTION_THRESHOLD,
      MAX_LONG_TERM_PROMOTION_THRESHOLD,
    );
  }
  if (body.inferredMinEvidenceCount !== undefined) {
    next.inferredMinEvidenceCount = requireNumber(
      body.inferredMinEvidenceCount,
      "inferredMinEvidenceCount",
      MIN_INFERRED_EVIDENCE_COUNT,
      MAX_INFERRED_EVIDENCE_COUNT,
      true,
    );
  }
  if (body.inferredConfidenceThreshold !== undefined) {
    next.inferredConfidenceThreshold = requireNumber(
      body.inferredConfidenceThreshold,
      "inferredConfidenceThreshold",
      MIN_INFERRED_CONFIDENCE_THRESHOLD,
      MAX_INFERRED_CONFIDENCE_THRESHOLD,
    );
  }
  return next;
}

export function writeMemoryEcologySettings(
  db: DatabaseSync,
  userId: string,
  settings: MemoryEcologySettings,
): void {
  db.prepare(
    `UPDATE users
        SET memory_learn_about_player = ?,
            memory_learn_about_bots = ?,
            memory_acquisition_sensitivity = ?,
            memory_short_term_days = ?,
            memory_long_term_threshold = ?,
            memory_inferred_min_evidence = ?,
            memory_inferred_threshold = ?,
            auto_memory = ?
      WHERE id = ?`,
  ).run(
    settings.learnAboutPlayer ? 1 : 0,
    settings.learnAboutBots ? 1 : 0,
    settings.acquisitionSensitivity,
    settings.shortTermRetentionDays,
    settings.longTermPromotionThreshold,
    settings.inferredMinEvidenceCount,
    settings.inferredConfidenceThreshold,
    settings.learnAboutPlayer || settings.learnAboutBots ? 1 : 0,
    userId,
  );
}

export function memoryAcquisitionThreshold(
  settings: Pick<MemoryEcologySettings, "acquisitionSensitivity">,
): number {
  return MEMORY_ACQUISITION_THRESHOLDS[settings.acquisitionSensitivity];
}

export function memoryCategoryCanBeLearned(
  settings: MemoryEcologySettings,
  category: string | null | undefined,
): boolean {
  return category === "bot_relation"
    ? settings.learnAboutBots
    : settings.learnAboutPlayer;
}

export function memoryCandidatePassesAcquisition(
  settings: MemoryEcologySettings,
  category: string | null | undefined,
  confidence: number,
): boolean {
  return (
    memoryCategoryCanBeLearned(settings, category) &&
    confidence >= memoryAcquisitionThreshold(settings)
  );
}

export function memoryExpiryAt(
  lastReinforcedAt: string,
  retentionDays: number,
): string {
  const start = Date.parse(lastReinforcedAt);
  return new Date(
    (Number.isFinite(start) ? start : Date.now()) + retentionDays * DAY_MS,
  ).toISOString();
}

export function effectiveShortTermConfidence(args: {
  baseConfidence: number;
  lastReinforcedAt: string;
  retentionDays: number;
  now?: Date;
}): number {
  const start = Date.parse(args.lastReinforcedAt);
  const now = (args.now ?? new Date()).getTime();
  const elapsedDays = Number.isFinite(start)
    ? Math.max(0, Math.floor((now - start) / DAY_MS))
    : 0;
  const remaining = Math.max(0, 1 - elapsedDays / args.retentionDays);
  return unit(args.baseConfidence) * remaining;
}

function recomputeDerivedMemoryRows(
  db: DatabaseSync,
  userId: string,
  settings: MemoryEcologySettings,
): number {
  const derivedRows = db
    .prepare(
      `SELECT id, confidence, base_confidence, certainty,
              evidence_lineage_known
         FROM memories
        WHERE user_id = ? AND (lifecycle = 'derived' OR source = 'inferred')`,
    )
    .all(userId) as Array<{
      id: string;
      confidence: number;
      base_confidence: number | null;
      certainty: number | null;
      evidence_lineage_known: number;
    }>;
  const evidenceRows = db.prepare(
    `SELECT m.id, m.confidence, m.base_confidence, m.tier, m.lifecycle
       FROM memory_evidence_links l
       JOIN memories m ON m.id = l.evidence_memory_id AND m.user_id = l.user_id
      WHERE l.user_id = ? AND l.inferred_memory_id = ?`,
  );
  const update = db.prepare(
    "UPDATE memories SET confidence = ?, lifecycle = 'derived', tier = 'short_term' WHERE id = ? AND user_id = ?",
  );
  const remove = db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?");
  let removed = 0;
  for (const derived of derivedRows) {
    const evidence = evidenceRows.all(userId, derived.id) as Array<{
      id: string;
      confidence: number;
      base_confidence: number | null;
      tier: string | null;
      lifecycle: string | null;
    }>;
    // Historical inferred rows have no reconstructable lineage. Preserve them.
    if (evidence.length === 0) {
      if (derived.evidence_lineage_known !== 0) {
        removed += Number(remove.run(derived.id, userId).changes ?? 0);
      }
      continue;
    }
    if (evidence.length < settings.inferredMinEvidenceCount) {
      removed += Number(remove.run(derived.id, userId).changes ?? 0);
      continue;
    }
    const support =
      evidence.reduce((sum, row) => {
        if (row.tier === "long_term" || row.lifecycle === "long_term") return sum + 1;
        const base = Math.max(0.0001, row.base_confidence ?? row.confidence);
        return sum + unit(row.confidence / base);
      }, 0) / evidence.length;
    const inferenceCertainty = unit(
      derived.certainty ?? derived.base_confidence ?? derived.confidence,
    );
    update.run(inferenceCertainty * support, derived.id, userId);
  }
  return removed;
}

function relationshipBand(score: number): "tense" | "neutral" | "warm" {
  if (score >= 66) return "warm";
  if (score <= 34) return "tense";
  return "neutral";
}

function relationshipMood(
  score: number,
): "joyful" | "warm" | "neutral" | "guarded" | "strained" {
  if (score >= 76) return "joyful";
  if (score >= 60) return "warm";
  if (score <= 24) return "strained";
  if (score <= 40) return "guarded";
  return "neutral";
}

export function recordRelationshipProjectionBase(args: {
  db: DatabaseSync;
  userId: string;
  sourceBotId: string;
  targetBotId: string;
  baseScore: number;
  updatedAt?: string;
}): void {
  ensureMemoryEcologyMemorySchema(args.db);
  const sourceBotId = args.sourceBotId.trim();
  const targetBotId = args.targetBotId.trim();
  if (!sourceBotId || !targetBotId || sourceBotId === targetBotId) return;
  args.db
    .prepare(
      `INSERT INTO memory_relationship_projections
        (user_id, source_bot_id, target_bot_id, base_score, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, source_bot_id, target_bot_id) DO UPDATE SET
         base_score = excluded.base_score,
         updated_at = excluded.updated_at`,
    )
    .run(
      args.userId,
      sourceBotId,
      targetBotId,
      clamp(args.baseScore, 0, 100),
      args.updatedAt ?? new Date().toISOString(),
    );
}

function recomputeRelationshipProjections(
  db: DatabaseSync,
  userId: string,
): number {
  if (tableColumns(db, "bot_relationships").size === 0) return 0;
  const projections = db
    .prepare(
      `SELECT source_bot_id, target_bot_id, base_score
         FROM memory_relationship_projections
        WHERE user_id = ?`,
    )
    .all(userId) as Array<{
      source_bot_id: string;
      target_bot_id: string;
      base_score: number;
    }>;
  const evidenceQuery = db.prepare(
    `SELECT confidence, base_confidence, tier, lifecycle
       FROM memories
      WHERE user_id = ? AND bot_id = ? AND target_bot_id = ?
        AND category = 'bot_relation'
        AND COALESCE(lifecycle, 'short_term') != 'derived'`,
  );
  const relationshipQuery = db.prepare(
    `SELECT last_reason, recent_reasons
       FROM bot_relationships
      WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
  );
  const activeDerivedQuery = db.prepare(
    `SELECT COUNT(*) AS count
       FROM memories
      WHERE user_id = ? AND bot_id = ? AND target_bot_id = ?
        AND category = 'bot_relation'
        AND (lifecycle = 'derived' OR source = 'inferred')`,
  );
  const updateRelationship = db.prepare(
    `UPDATE bot_relationships
        SET score = ?, band = ?, mood_key = ?, last_reason = ?, updated_at = ?
      WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
  );
  const deleteRelationship = db.prepare(
    `DELETE FROM bot_relationships
      WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
  );
  const deleteProjection = db.prepare(
    `DELETE FROM memory_relationship_projections
      WHERE user_id = ? AND source_bot_id = ? AND target_bot_id = ?`,
  );
  let removed = 0;
  for (const projection of projections) {
    const evidence = evidenceQuery.all(
      userId,
      projection.source_bot_id,
      projection.target_bot_id,
    ) as Array<{
      confidence: number;
      base_confidence: number | null;
      tier: string | null;
      lifecycle: string | null;
    }>;
    if (evidence.length === 0) {
      removed += Number(
        deleteRelationship.run(
          userId,
          projection.source_bot_id,
          projection.target_bot_id,
        ).changes ?? 0,
      );
      deleteProjection.run(
        userId,
        projection.source_bot_id,
        projection.target_bot_id,
      );
      continue;
    }
    const support =
      evidence.reduce((sum, row) => {
        if (row.tier === "long_term" || row.lifecycle === "long_term") return sum + 1;
        const base = Math.max(0.0001, row.base_confidence ?? row.confidence);
        return sum + unit(row.confidence / base);
      }, 0) / evidence.length;
    const score = Math.round(50 + (projection.base_score - 50) * support);
    const relationship = relationshipQuery.get(
      userId,
      projection.source_bot_id,
      projection.target_bot_id,
    ) as { last_reason: string; recent_reasons: string } | undefined;
    const activeDerived = activeDerivedQuery.get(
      userId,
      projection.source_bot_id,
      projection.target_bot_id,
    ) as { count: number } | undefined;
    let lastReason = relationship?.last_reason ?? "";
    if (Number(activeDerived?.count ?? 0) === 0) {
      try {
        const reasons = JSON.parse(relationship?.recent_reasons ?? "[]") as unknown;
        lastReason = Array.isArray(reasons) && typeof reasons[0] === "string"
          ? reasons[0]
          : "Current memory evidence is neutral.";
      } catch {
        lastReason = "Current memory evidence is neutral.";
      }
    }
    updateRelationship.run(
      score,
      relationshipBand(score),
      relationshipMood(score),
      lastReason,
      new Date().toISOString(),
      userId,
      projection.source_bot_id,
      projection.target_bot_id,
    );
  }
  return removed;
}

/** Materializes wall-clock decay and removes fully forgotten memories. */
export function materializeShortTermMemoryDecay(
  db: DatabaseSync,
  userId: string,
  now = new Date(),
): { updated: number; expired: number; removedDerived: number } {
  ensureMemoryEcologyMemorySchema(db);
  const settings = readMemoryEcologySettings(db, userId);
  const rows = db
    .prepare(
      `SELECT id, confidence, base_confidence, tier, lifecycle, source, certainty,
              last_reinforced_at, created_at
         FROM memories
        WHERE user_id = ?`,
    )
    .all(userId) as DecayMemoryRow[];
  const update = db.prepare(
    "UPDATE memories SET confidence = ? WHERE id = ? AND user_id = ?",
  );
  const remove = db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?");
  let updated = 0;
  let expired = 0;
  for (const row of rows) {
    if (
      row.source === "inferred" ||
      row.lifecycle === "derived" ||
      row.tier === "long_term" ||
      row.lifecycle === "long_term"
    ) {
      continue;
    }
    const effective = effectiveShortTermConfidence({
      baseConfidence: row.base_confidence ?? row.confidence,
      lastReinforcedAt: row.last_reinforced_at ?? row.created_at,
      retentionDays: settings.shortTermRetentionDays,
      now,
    });
    if (effective <= 0) {
      expired += Number(remove.run(row.id, userId).changes ?? 0);
    } else if (Math.abs(effective - row.confidence) > 0.000_001) {
      updated += Number(update.run(effective, row.id, userId).changes ?? 0);
    }
  }
  const removedDerived = recomputeDerivedMemoryRows(db, userId, settings);
  recomputeRelationshipProjections(db, userId);
  return { updated, expired, removedDerived };
}

export function linkDerivedMemoryEvidence(args: {
  db: DatabaseSync;
  userId: string;
  inferredMemoryId: string;
  evidenceMemoryIds: readonly string[];
  createdAt?: string;
}): void {
  ensureMemoryEcologyMemorySchema(args.db);
  const insert = args.db.prepare(
    `INSERT OR IGNORE INTO memory_evidence_links
      (user_id, inferred_memory_id, evidence_memory_id, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  const createdAt = args.createdAt ?? new Date().toISOString();
  let linked = false;
  for (const evidenceId of new Set(args.evidenceMemoryIds)) {
    if (!evidenceId || evidenceId === args.inferredMemoryId) continue;
    insert.run(args.userId, args.inferredMemoryId, evidenceId, createdAt);
    linked = true;
  }
  if (linked) {
    args.db
      .prepare(
        "UPDATE memories SET evidence_lineage_known = 1 WHERE id = ? AND user_id = ?",
      )
      .run(args.inferredMemoryId, args.userId);
  }
}

export function memoryEvidenceIds(
  db: DatabaseSync,
  userId: string,
  inferredMemoryId: string,
): string[] {
  ensureMemoryEcologyMemorySchema(db);
  return (
    db
      .prepare(
        `SELECT evidence_memory_id
           FROM memory_evidence_links
          WHERE user_id = ? AND inferred_memory_id = ?
          ORDER BY created_at, evidence_memory_id`,
      )
      .all(userId, inferredMemoryId) as Array<{ evidence_memory_id: string }>
  ).map((row) => row.evidence_memory_id);
}

export function createMemoryAcquisitionReceipt(args: {
  db: DatabaseSync;
  userId: string;
  memoryId: string;
  learnerBotId?: string | null;
  targetBotId?: string | null;
  conversationId?: string | null;
  kind: MemoryAcquisitionReceiptKind;
  createdAt?: string;
}): MemoryAcquisitionReceiptRow {
  ensureMemoryEcologyMemorySchema(args.db);
  const receipt: MemoryAcquisitionReceiptRow = {
    id: randomId(12),
    user_id: args.userId,
    memory_id: args.memoryId,
    learner_bot_id: args.learnerBotId ?? null,
    target_bot_id: args.targetBotId ?? null,
    conversation_id: args.conversationId ?? null,
    kind: args.kind,
    created_at: args.createdAt ?? new Date().toISOString(),
    read_at: null,
  };
  args.db
    .prepare(
      `INSERT INTO memory_acquisition_receipts
        (id, user_id, memory_id, learner_bot_id, target_bot_id,
         conversation_id, kind, created_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      receipt.id,
      receipt.user_id,
      receipt.memory_id,
      receipt.learner_bot_id,
      receipt.target_bot_id,
      receipt.conversation_id,
      receipt.kind,
      receipt.created_at,
    );
  return receipt;
}

export function listUnreadMemoryAcquisitionReceipts(
  db: DatabaseSync,
  userId: string,
  kind?: MemoryAcquisitionReceiptKind,
): MemoryAcquisitionReceiptRow[] {
  ensureMemoryEcologyMemorySchema(db);
  const kindFilter = kind ? " AND kind = ?" : "";
  return db
    .prepare(
      `SELECT id, user_id, memory_id, learner_bot_id, target_bot_id,
              conversation_id, kind, created_at, read_at
         FROM memory_acquisition_receipts
        WHERE user_id = ? AND read_at IS NULL${kindFilter}
        ORDER BY created_at DESC`,
    )
    .all(...(kind ? [userId, kind] : [userId])) as MemoryAcquisitionReceiptRow[];
}

export function markMemoryAcquisitionReceiptRead(
  db: DatabaseSync,
  userId: string,
  receiptId: string,
  readAt = new Date().toISOString(),
): boolean {
  ensureMemoryEcologyMemorySchema(db);
  return (
    Number(
      db
        .prepare(
          `UPDATE memory_acquisition_receipts
              SET read_at = COALESCE(read_at, ?)
            WHERE id = ? AND user_id = ?`,
        )
        .run(readAt, receiptId, userId).changes ?? 0,
    ) === 1
  );
}

/**
 * Resolves the transient bot-to-bot notifications owned by one completed
 * applet session. The underlying memories remain intact; only their unread
 * presentation receipts are consumed.
 */
export function markSessionBotRelationMemoryReceiptsRead(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  readAt = new Date().toISOString(),
): number {
  ensureMemoryEcologyMemorySchema(db);
  const sessionId = conversationId.trim();
  if (!sessionId) return 0;
  return Number(
    db
      .prepare(
        `UPDATE memory_acquisition_receipts
            SET read_at = COALESCE(read_at, ?)
          WHERE user_id = ?
            AND conversation_id = ?
            AND kind = 'bot_relation'
            AND read_at IS NULL`,
      )
      .run(readAt, userId, sessionId).changes ?? 0,
  );
}

export function latestPlayerMemoryReceipt(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  botId?: string | null;
}): MemoryAcquisitionReceiptRow | null {
  ensureMemoryEcologyMemorySchema(args.db);
  const botId = args.botId?.trim() || null;
  const rows = args.db
    .prepare(
      `SELECT id, user_id, memory_id, learner_bot_id, target_bot_id,
              conversation_id, kind, created_at, read_at
         FROM memory_acquisition_receipts
        WHERE user_id = ?
          AND conversation_id = ?
          AND kind = 'player_memory'
          AND ((? IS NULL AND learner_bot_id IS NULL) OR learner_bot_id = ?)
        ORDER BY created_at DESC
        LIMIT 2`,
    )
    .all(args.userId, args.conversationId, botId, botId) as
    MemoryAcquisitionReceiptRow[];
  if (rows.length === 0) return null;
  if (rows[1]?.created_at === rows[0]?.created_at) return null;
  return rows[0] ?? null;
}

export function forgetMemoryFromLatestReceipt(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  botId?: string | null;
}): string | null {
  const receipt = latestPlayerMemoryReceipt(args);
  if (!receipt) return null;
  const result = args.db
    .prepare("DELETE FROM memories WHERE id = ? AND user_id = ?")
    .run(receipt.memory_id, args.userId);
  if (Number(result.changes ?? 0) !== 1) return null;
  materializeShortTermMemoryDecay(args.db, args.userId);
  return receipt.memory_id;
}
