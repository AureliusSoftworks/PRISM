import type { DatabaseSync } from "node:sqlite";
import { decryptJson } from "./security.ts";
import { persistedMemorySummaryProse } from "./memory-summarizer.ts";
import { deleteVector } from "./qdrant.ts";
import {
  ensureMemoryEcologyMemorySchema,
  materializeShortTermMemoryDecay,
} from "./memory-ecology.ts";

export type MemoryProseClass = "long_term" | "short_term";

export interface MemoryProseUsage {
  recordCount: number;
  proseBytes: number;
}

export interface MemoryProseOverview {
  longTerm: MemoryProseUsage;
  shortTerm: MemoryProseUsage;
  derived: MemoryProseUsage;
  total: MemoryProseUsage;
}

export interface ClearMemoryProseResult {
  memoryClass: MemoryProseClass;
  deletedRecords: number;
  deletedFacts: number;
  deletedSummaries: number;
  deletedZenCheckpoints: number;
  deletedDerived: number;
  vectorCleanup: {
    attempted: number;
    deleted: number;
    failed: number;
  };
}

type EncryptedProseRow = {
  tier?: string | null;
  source?: string | null;
  lifecycle?: string | null;
  ciphertext: string;
  iv: string;
  tag: string;
};

type SummaryRow = { id: string; summary: string };

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function memoryFactText(row: EncryptedProseRow, userKey: Buffer): string {
  try {
    const payload = decryptJson(
      { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag },
      userKey,
    ) as { text?: unknown };
    return typeof payload.text === "string" ? payload.text : "";
  } catch {
    return "";
  }
}

function zenCheckpointProse(row: EncryptedProseRow, userKey: Buffer): string {
  try {
    const payload = decryptJson(
      { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag },
      userKey,
    ) as { title?: unknown; text?: unknown; trigger?: unknown };
    return [payload.title, payload.text, payload.trigger]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join("\n");
  } catch {
    return "";
  }
}

function addUsage(target: MemoryProseUsage, prose: string): void {
  target.recordCount += 1;
  target.proseBytes += utf8Bytes(prose);
}

function emptyUsage(): MemoryProseUsage {
  return { recordCount: 0, proseBytes: 0 };
}

export function getMemoryProseOverview(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
): MemoryProseOverview {
  ensureMemoryEcologyMemorySchema(db);
  materializeShortTermMemoryDecay(db, userId);
  const longTerm = emptyUsage();
  const shortTerm = emptyUsage();
  const derived = emptyUsage();

  const factRows = db
    .prepare(
      `SELECT tier, source, lifecycle, ciphertext, iv, tag
         FROM memories
        WHERE user_id = ?`,
    )
    .all(userId) as EncryptedProseRow[];
  for (const row of factRows) {
    const target =
      row.lifecycle === "derived" || row.source === "inferred"
        ? derived
        : row.tier === "long_term"
          ? longTerm
          : shortTerm;
    addUsage(target, memoryFactText(row, userKey));
  }

  const summaryRows = db
    .prepare(
      `SELECT id, summary
         FROM memory_summaries
        WHERE user_id = ?`,
    )
    .all(userId) as SummaryRow[];
  for (const row of summaryRows) {
    const summary = persistedMemorySummaryProse(row.summary);
    addUsage(
      summary.memoryClass === "long_term" ? longTerm : shortTerm,
      summary.prose,
    );
  }

  const zenRows = db
    .prepare(
      `SELECT ciphertext, iv, tag
         FROM zen_session_memories
        WHERE user_id = ?`,
    )
    .all(userId) as EncryptedProseRow[];
  for (const row of zenRows) {
    addUsage(shortTerm, zenCheckpointProse(row, userKey));
  }

  return {
    longTerm,
    shortTerm,
    derived,
    total: {
      recordCount:
        longTerm.recordCount + shortTerm.recordCount + derived.recordCount,
      proseBytes: longTerm.proseBytes + shortTerm.proseBytes + derived.proseBytes,
    },
  };
}

export async function clearMemoryProseClass(
  db: DatabaseSync,
  userId: string,
  memoryClass: MemoryProseClass,
  options: {
    deleteVectorById?: (id: string) => Promise<void>;
  } = {},
): Promise<ClearMemoryProseResult> {
  ensureMemoryEcologyMemorySchema(db);
  materializeShortTermMemoryDecay(db, userId);
  let summaryIds: string[] = [];
  let deletedFacts = 0;
  let deletedSummaries = 0;
  let deletedZenCheckpoints = 0;
  let deletedDerived = 0;
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const summaryRows = db
      .prepare(
        `SELECT id, summary
           FROM memory_summaries
          WHERE user_id = ?`,
      )
      .all(userId) as SummaryRow[];
    summaryIds = summaryRows
      .filter(
        (row) =>
          persistedMemorySummaryProse(row.summary).memoryClass === memoryClass,
      )
      .map((row) => row.id);

    const factsResult = db
      .prepare(
        memoryClass === "long_term"
          ? "DELETE FROM memories WHERE user_id = ? AND lifecycle != 'derived' AND tier = 'long_term'"
          : "DELETE FROM memories WHERE user_id = ? AND lifecycle != 'derived' AND COALESCE(tier, 'short_term') != 'long_term'",
      )
      .run(userId);
    deletedFacts = Number(factsResult.changes ?? 0);

    const deleteSummary = db.prepare(
      "DELETE FROM memory_summaries WHERE id = ? AND user_id = ?",
    );
    for (const id of summaryIds) {
      deletedSummaries += Number(deleteSummary.run(id, userId).changes ?? 0);
    }

    if (memoryClass === "short_term") {
      const zenResult = db
        .prepare("DELETE FROM zen_session_memories WHERE user_id = ?")
        .run(userId);
      deletedZenCheckpoints = Number(zenResult.changes ?? 0);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const derivedBefore = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM memories WHERE user_id = ? AND lifecycle = 'derived'",
      )
      .get(userId) as { count: number }
  ).count;
  materializeShortTermMemoryDecay(db, userId);
  const derivedAfter = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM memories WHERE user_id = ? AND lifecycle = 'derived'",
      )
      .get(userId) as { count: number }
  ).count;
  deletedDerived = Math.max(0, derivedBefore - derivedAfter);

  const vectorIds = memoryClass === "long_term" ? summaryIds : [];
  const removeVector = options.deleteVectorById ?? deleteVector;
  let deletedVectors = 0;
  let failedVectors = 0;
  for (const id of vectorIds) {
    try {
      await removeVector(id);
      deletedVectors += 1;
    } catch {
      failedVectors += 1;
    }
  }

  return {
    memoryClass,
    deletedRecords:
      deletedFacts + deletedSummaries + deletedZenCheckpoints + deletedDerived,
    deletedFacts,
    deletedSummaries,
    deletedZenCheckpoints,
    deletedDerived,
    vectorCleanup: {
      attempted: vectorIds.length,
      deleted: deletedVectors,
      failed: failedVectors,
    },
  };
}
