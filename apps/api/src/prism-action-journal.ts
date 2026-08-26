import type { DatabaseSync } from "node:sqlite";
import {
  PRISM_ACTION_UNDO_RETENTION_MS,
  PRISM_CONTEXT_TOKEN_TTL_MS,
  PRISM_ORCHESTRATION_VERSION,
  type PrismActionPreviewV1,
  type PrismActionProposalV1,
  type PrismActionRunStatusV1,
  type PrismActionRunV1,
  type PrismCapabilityDescriptorV1,
  type PrismContextTokenV1,
  type PrismEntityReferenceV1,
  type PrismJsonObject,
  type PrismJsonValue,
} from "@localai/shared";
import { decryptJson, encryptJson, randomId } from "./security.ts";

interface ProposalRow {
  id: string;
  capability_id: string;
  capability_version: number;
  input_json: string;
  preview_json: string;
  risk: PrismActionProposalV1["risk"];
  confirmation_policy: PrismActionProposalV1["confirmation"];
  status: "ready" | "stale" | "expired" | "executed";
  created_at: string;
  expires_at: string;
}

interface RunRow {
  id: string;
  parent_run_id: string | null;
  capability_id: string;
  capability_version: number;
  source: "prism" | "ui";
  status: PrismActionRunStatusV1;
  result_json: string | null;
  affected_entities_json: string;
  inverse_ciphertext: string | null;
  inverse_iv: string | null;
  inverse_tag: string | null;
  cost_micro_usd: number | null;
  non_reversible_json: string;
  error: string | null;
  created_at: string;
  committed_at: string | null;
  undone_at: string | null;
  undo_expires_at: string | null;
}

interface ContextTokenRow {
  id: string;
  purpose: string;
  entities_json: string;
  created_at: string;
  expires_at: string;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isoAfter(now: Date, durationMs: number): string {
  return new Date(now.getTime() + durationMs).toISOString();
}

function encryptedInputJson(
  input: PrismJsonObject,
  userKey: Buffer,
): string {
  const encrypted = encryptJson(input, userKey);
  return JSON.stringify({
    __prismEncryptedInputV1: {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
    },
  });
}

function decryptedInputJson(
  value: string,
  userKey: Buffer,
): PrismJsonObject {
  const stored = parseJson<{
    __prismEncryptedInputV1?: {
      ciphertext?: unknown;
      iv?: unknown;
      tag?: unknown;
    };
  }>(value, {});
  const envelope = stored.__prismEncryptedInputV1;
  if (
    envelope &&
    typeof envelope.ciphertext === "string" &&
    typeof envelope.iv === "string" &&
    typeof envelope.tag === "string"
  ) {
    const decrypted = decryptJson(
      {
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        tag: envelope.tag,
      },
      userKey,
    );
    return decrypted &&
      typeof decrypted === "object" &&
      !Array.isArray(decrypted)
      ? (decrypted as PrismJsonObject)
      : {};
  }
  // Compatibility for proposals written before encrypted action inputs.
  return parseJson<PrismJsonObject>(value, {});
}

function proposalFromRow(
  row: ProposalRow,
  userKey: Buffer,
): PrismActionProposalV1 {
  const decryptedPreview = decryptedInputJson(
    row.preview_json,
    userKey,
  ) as unknown as Partial<PrismActionPreviewV1>;
  return {
    schemaVersion: PRISM_ORCHESTRATION_VERSION,
    id: row.id,
    capabilityId: row.capability_id,
    capabilityVersion: row.capability_version,
    input: decryptedInputJson(row.input_json, userKey),
    preview: {
      summary:
        typeof decryptedPreview.summary === "string"
          ? decryptedPreview.summary
          : "",
      consequences: Array.isArray(decryptedPreview.consequences)
        ? decryptedPreview.consequences
        : [],
      targets: Array.isArray(decryptedPreview.targets)
        ? decryptedPreview.targets
        : [],
      diffs: Array.isArray(decryptedPreview.diffs)
        ? decryptedPreview.diffs
        : [],
      provider:
        typeof decryptedPreview.provider === "string"
          ? decryptedPreview.provider
          : null,
      model:
        typeof decryptedPreview.model === "string"
          ? decryptedPreview.model
          : null,
      estimatedCostMicroUsd:
        typeof decryptedPreview.estimatedCostMicroUsd === "number"
          ? decryptedPreview.estimatedCostMicroUsd
          : null,
    },
    risk: row.risk,
    confirmation: row.confirmation_policy,
    status:
      row.status === "executed"
        ? "expired"
        : row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function runFromRow(row: RunRow, now = new Date()): PrismActionRunV1 {
  const undoAvailable =
    row.status === "committed" &&
    Boolean(
      row.inverse_ciphertext &&
        row.inverse_iv &&
        row.inverse_tag &&
        row.undo_expires_at &&
        new Date(row.undo_expires_at).getTime() > now.getTime(),
    );
  return {
    schemaVersion: PRISM_ORCHESTRATION_VERSION,
    id: row.id,
    parentRunId: row.parent_run_id,
    capabilityId: row.capability_id,
    capabilityVersion: row.capability_version,
    source: row.source,
    status: row.status,
    affectedEntities: parseJson<PrismEntityReferenceV1[]>(
      row.affected_entities_json,
      [],
    ),
    result: parseJson<PrismJsonValue | null>(row.result_json, null),
    error: row.error,
    costMicroUsd: row.cost_micro_usd,
    undoAvailable,
    nonReversibleConsequences: parseJson<string[]>(
      row.non_reversible_json,
      [],
    ),
    createdAt: row.created_at,
    committedAt: row.committed_at,
    undoneAt: row.undone_at,
    undoExpiresAt: row.undo_expires_at,
  };
}

export function createPrismActionProposal(args: {
  db: DatabaseSync;
  userId: string;
  descriptor: PrismCapabilityDescriptorV1;
  input: PrismJsonObject;
  preview: PrismActionPreviewV1;
  userKey: Buffer;
  now?: Date;
  ttlMs?: number;
}): PrismActionProposalV1 {
  const now = args.now ?? new Date();
  const proposal: PrismActionProposalV1 = {
    schemaVersion: PRISM_ORCHESTRATION_VERSION,
    id: `proposal-${randomId()}`,
    capabilityId: args.descriptor.id,
    capabilityVersion: args.descriptor.version,
    input: args.input,
    preview: args.preview,
    risk: args.descriptor.risk,
    confirmation: args.descriptor.confirmation,
    status: "ready",
    createdAt: now.toISOString(),
    expiresAt: isoAfter(now, args.ttlMs ?? PRISM_CONTEXT_TOKEN_TTL_MS),
  };
  args.db
    .prepare(
      `INSERT INTO prism_action_proposals
        (id, user_id, capability_id, capability_version, input_json,
         preview_json, risk, confirmation_policy, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
    )
    .run(
      proposal.id,
      args.userId,
      proposal.capabilityId,
      proposal.capabilityVersion,
      encryptedInputJson(proposal.input, args.userKey),
      encryptedInputJson(
        proposal.preview as unknown as PrismJsonObject,
        args.userKey,
      ),
      proposal.risk,
      proposal.confirmation,
      proposal.createdAt,
      proposal.expiresAt,
    );
  return proposal;
}

export function readPrismActionProposal(
  db: DatabaseSync,
  userId: string,
  proposalId: string,
  userKey: Buffer,
): PrismActionProposalV1 | null {
  const row = db
    .prepare(
      `SELECT id, capability_id, capability_version, input_json, preview_json,
              risk, confirmation_policy, status, created_at, expires_at
         FROM prism_action_proposals
        WHERE id = ? AND user_id = ?`,
    )
    .get(proposalId, userId) as ProposalRow | undefined;
  return row ? proposalFromRow(row, userKey) : null;
}

export function markPrismActionProposalExecuted(
  db: DatabaseSync,
  userId: string,
  proposalId: string,
  runId: string,
): void {
  db.prepare(
    `UPDATE prism_action_proposals
        SET status = 'executed', executed_run_id = ?
      WHERE id = ? AND user_id = ?`,
  ).run(runId, proposalId, userId);
}

export function readPrismActionRunByIdempotency(
  db: DatabaseSync,
  userId: string,
  idempotencyKey: string,
  now = new Date(),
): PrismActionRunV1 | null {
  const row = db
    .prepare(
      `SELECT id, parent_run_id, capability_id, capability_version, source,
              status, result_json, affected_entities_json, inverse_ciphertext,
              inverse_iv, inverse_tag, cost_micro_usd, non_reversible_json,
              error, created_at, committed_at, undone_at, undo_expires_at
         FROM prism_action_runs
        WHERE user_id = ? AND idempotency_key = ?`,
    )
    .get(userId, idempotencyKey) as RunRow | undefined;
  return row ? runFromRow(row, now) : null;
}

export function beginPrismActionRun(args: {
  db: DatabaseSync;
  userId: string;
  descriptor: PrismCapabilityDescriptorV1;
  source: "prism" | "ui";
  idempotencyKey: string;
  input: PrismJsonObject;
  userKey: Buffer;
  parentRunId?: string | null;
  now?: Date;
}): PrismActionRunV1 {
  const existing = readPrismActionRunByIdempotency(
    args.db,
    args.userId,
    args.idempotencyKey,
    args.now,
  );
  if (existing) return existing;
  const createdAt = (args.now ?? new Date()).toISOString();
  const id = `run-${randomId()}`;
  args.db
    .prepare(
      `INSERT INTO prism_action_runs
        (id, user_id, parent_run_id, capability_id, capability_version, source,
         status, idempotency_key, input_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
    )
    .run(
      id,
      args.userId,
      args.parentRunId ?? null,
      args.descriptor.id,
      args.descriptor.version,
      args.source,
      args.idempotencyKey,
      encryptedInputJson(args.input, args.userKey),
      createdAt,
    );
  return {
    schemaVersion: PRISM_ORCHESTRATION_VERSION,
    id,
    parentRunId: args.parentRunId ?? null,
    capabilityId: args.descriptor.id,
    capabilityVersion: args.descriptor.version,
    source: args.source,
    status: "running",
    affectedEntities: [],
    result: null,
    error: null,
    costMicroUsd: null,
    undoAvailable: false,
    nonReversibleConsequences: [],
    createdAt,
    committedAt: null,
    undoneAt: null,
    undoExpiresAt: null,
  };
}

export function commitPrismActionRun(args: {
  db: DatabaseSync;
  userId: string;
  runId: string;
  result: PrismJsonValue | null;
  affectedEntities: PrismEntityReferenceV1[];
  inverse: PrismJsonObject | null;
  userKey: Buffer;
  costMicroUsd?: number | null;
  nonReversibleConsequences?: string[];
  now?: Date;
}): PrismActionRunV1 {
  const now = args.now ?? new Date();
  const encrypted = args.inverse ? encryptJson(args.inverse, args.userKey) : null;
  const undoExpiresAt = encrypted
    ? isoAfter(now, PRISM_ACTION_UNDO_RETENTION_MS)
    : null;
  args.db
    .prepare(
      `UPDATE prism_action_runs
          SET status = 'committed',
              result_json = ?,
              affected_entities_json = ?,
              inverse_ciphertext = ?,
              inverse_iv = ?,
              inverse_tag = ?,
              cost_micro_usd = ?,
              non_reversible_json = ?,
              error = NULL,
              committed_at = ?,
              undo_expires_at = ?
        WHERE id = ? AND user_id = ? AND status = 'running'`,
    )
    .run(
      args.result === null ? null : JSON.stringify(args.result),
      JSON.stringify(args.affectedEntities),
      encrypted?.ciphertext ?? null,
      encrypted?.iv ?? null,
      encrypted?.tag ?? null,
      args.costMicroUsd ?? null,
      JSON.stringify(args.nonReversibleConsequences ?? []),
      now.toISOString(),
      undoExpiresAt,
      args.runId,
      args.userId,
    );
  const run = readPrismActionRun(args.db, args.userId, args.runId, now);
  if (!run) throw new Error("Prism could not record the committed action.");
  return run;
}

export function failPrismActionRun(
  db: DatabaseSync,
  userId: string,
  runId: string,
  error: string,
): PrismActionRunV1 {
  db.prepare(
    `UPDATE prism_action_runs
        SET status = 'failed', error = ?
      WHERE id = ? AND user_id = ? AND status = 'running'`,
  ).run(error.slice(0, 1_000), runId, userId);
  const run = readPrismActionRun(db, userId, runId);
  if (!run) throw new Error("Prism could not record the failed action.");
  return run;
}

export function readPrismActionRun(
  db: DatabaseSync,
  userId: string,
  runId: string,
  now = new Date(),
): PrismActionRunV1 | null {
  const row = db
    .prepare(
      `SELECT id, parent_run_id, capability_id, capability_version, source,
              status, result_json, affected_entities_json, inverse_ciphertext,
              inverse_iv, inverse_tag, cost_micro_usd, non_reversible_json,
              error, created_at, committed_at, undone_at, undo_expires_at
         FROM prism_action_runs
        WHERE id = ? AND user_id = ?`,
    )
    .get(runId, userId) as RunRow | undefined;
  return row ? runFromRow(row, now) : null;
}

export function listRecentPrismActionRuns(
  db: DatabaseSync,
  userId: string,
  limit = 20,
): PrismActionRunV1[] {
  const rows = db
    .prepare(
      `SELECT id, parent_run_id, capability_id, capability_version, source,
              status, result_json, affected_entities_json, inverse_ciphertext,
              inverse_iv, inverse_tag, cost_micro_usd, non_reversible_json,
              error, created_at, committed_at, undone_at, undo_expires_at
         FROM prism_action_runs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all(userId, Math.max(1, Math.min(100, Math.floor(limit)))) as unknown as RunRow[];
  return rows.map((row) => runFromRow(row));
}

export function latestUndoablePrismActionRun(
  db: DatabaseSync,
  userId: string,
  now = new Date(),
): PrismActionRunV1 | null {
  const row = db
    .prepare(
      `SELECT id, parent_run_id, capability_id, capability_version, source,
              status, result_json, affected_entities_json, inverse_ciphertext,
              inverse_iv, inverse_tag, cost_micro_usd, non_reversible_json,
              error, created_at, committed_at, undone_at, undo_expires_at
         FROM prism_action_runs
        WHERE user_id = ?
          AND status = 'committed'
          AND inverse_ciphertext IS NOT NULL
          AND undo_expires_at > ?
        ORDER BY committed_at DESC, created_at DESC
        LIMIT 1`,
    )
    .get(userId, now.toISOString()) as RunRow | undefined;
  return row ? runFromRow(row, now) : null;
}

export function readPrismActionInverse(
  db: DatabaseSync,
  userId: string,
  runId: string,
  userKey: Buffer,
  now = new Date(),
): PrismJsonObject | null {
  const row = db
    .prepare(
      `SELECT inverse_ciphertext, inverse_iv, inverse_tag, undo_expires_at
         FROM prism_action_runs
        WHERE id = ? AND user_id = ? AND status = 'committed'`,
    )
    .get(runId, userId) as
    | {
        inverse_ciphertext: string | null;
        inverse_iv: string | null;
        inverse_tag: string | null;
        undo_expires_at: string | null;
      }
    | undefined;
  if (
    !row?.inverse_ciphertext ||
    !row.inverse_iv ||
    !row.inverse_tag ||
    !row.undo_expires_at ||
    new Date(row.undo_expires_at).getTime() <= now.getTime()
  ) {
    return null;
  }
  return decryptJson(
    {
      ciphertext: row.inverse_ciphertext,
      iv: row.inverse_iv,
      tag: row.inverse_tag,
    },
    userKey,
  ) as PrismJsonObject;
}

export function markPrismActionUndone(
  db: DatabaseSync,
  userId: string,
  runId: string,
  now = new Date(),
): PrismActionRunV1 {
  db.prepare(
    `UPDATE prism_action_runs
        SET status = 'undone', undone_at = ?, error = NULL
      WHERE id = ? AND user_id = ? AND status = 'committed'`,
  ).run(now.toISOString(), runId, userId);
  const run = readPrismActionRun(db, userId, runId);
  if (!run) throw new Error("Prism could not record the undo.");
  return run;
}

export function markPrismActionUndoFailed(
  db: DatabaseSync,
  userId: string,
  runId: string,
  error: string,
): PrismActionRunV1 {
  db.prepare(
    `UPDATE prism_action_runs
        SET status = 'undo-failed', error = ?
      WHERE id = ? AND user_id = ? AND status = 'committed'`,
  ).run(error.slice(0, 1_000), runId, userId);
  const run = readPrismActionRun(db, userId, runId);
  if (!run) throw new Error("Prism could not record the failed undo.");
  return run;
}

export function createPrismContextToken(args: {
  db: DatabaseSync;
  userId: string;
  purpose: string;
  entities: PrismEntityReferenceV1[];
  now?: Date;
}): PrismContextTokenV1 {
  const now = args.now ?? new Date();
  const token: PrismContextTokenV1 = {
    schemaVersion: PRISM_ORCHESTRATION_VERSION,
    id: `context-${randomId()}`,
    purpose: args.purpose.slice(0, 160),
    entities: args.entities.slice(0, 100),
    createdAt: now.toISOString(),
    expiresAt: isoAfter(now, PRISM_CONTEXT_TOKEN_TTL_MS),
  };
  args.db
    .prepare(
      `INSERT INTO prism_context_tokens
        (id, user_id, purpose, entities_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      token.id,
      args.userId,
      token.purpose,
      JSON.stringify(token.entities),
      token.createdAt,
      token.expiresAt,
    );
  return token;
}

export function readPrismContextToken(
  db: DatabaseSync,
  userId: string,
  tokenId: string,
): PrismContextTokenV1 | null {
  const row = db
    .prepare(
      `SELECT id, purpose, entities_json, created_at, expires_at
         FROM prism_context_tokens
        WHERE id = ? AND user_id = ? AND expires_at > ?`,
    )
    .get(tokenId, userId, new Date().toISOString()) as
    | ContextTokenRow
    | undefined;
  return row
    ? {
        schemaVersion: PRISM_ORCHESTRATION_VERSION,
        id: row.id,
        purpose: row.purpose,
        entities: parseJson<PrismEntityReferenceV1[]>(
          row.entities_json,
          [],
        ),
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }
    : null;
}

export function purgeExpiredPrismOrchestrationState(
  db: DatabaseSync,
  now = new Date(),
): Array<{ userId: string; replayRecordingIds: string[] }> {
  const timestamp = now.toISOString();
  db.prepare("DELETE FROM prism_context_tokens WHERE expires_at <= ?").run(
    timestamp,
  );
  db.prepare(
    `UPDATE prism_action_proposals
        SET status = 'expired'
      WHERE status = 'ready' AND expires_at <= ?`,
  ).run(timestamp);
  db.prepare(
    `UPDATE prism_action_runs
        SET inverse_ciphertext = NULL,
            inverse_iv = NULL,
            inverse_tag = NULL
      WHERE undo_expires_at IS NOT NULL AND undo_expires_at <= ?`,
  ).run(timestamp);
  db.prepare(
    `DELETE FROM prism_action_proposals
      WHERE expires_at <= ?`,
  ).run(
    new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString(),
  );
  const expiredReplayQuarantines = db
    .prepare(
      `SELECT user_id, entity_id
         FROM prism_quarantine
        WHERE expires_at <= ?
          AND entity_type = 'signal-episode-set'
          AND restored_at IS NULL`,
    )
    .all(timestamp) as unknown as Array<{
    user_id: string;
    entity_id: string;
  }>;
  db.prepare("DELETE FROM prism_quarantine WHERE expires_at <= ?").run(
    timestamp,
  );
  return expiredReplayQuarantines.map((row) => ({
    userId: row.user_id,
    replayRecordingIds: parseJson<unknown[]>(row.entity_id, []).flatMap(
      (entry) => (typeof entry === "string" ? [entry] : []),
    ),
  }));
}
