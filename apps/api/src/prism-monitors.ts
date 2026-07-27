import type { DatabaseSync } from "node:sqlite";
import {
  PRISM_ORCHESTRATION_VERSION,
  type PrismMonitorV1,
} from "@localai/shared";
import type { ElevenLabsCreditBalance } from "./elevenlabs-subscription.ts";
import { randomId } from "./security.ts";

export const PRISM_MONITOR_INTERVAL_MS = 6 * 60 * 60 * 1_000;

interface MonitorRow {
  id: string;
  kind: "elevenlabs-credit-threshold";
  status: PrismMonitorV1["status"];
  threshold_ratio: number;
  last_observed_ratio: number | null;
  billing_cycle_key: string | null;
  last_checked_at: string | null;
  triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

function monitorFromRow(row: MonitorRow): PrismMonitorV1 {
  return {
    schemaVersion: PRISM_ORCHESTRATION_VERSION,
    id: row.id,
    kind: row.kind,
    status: row.status,
    thresholdRatio: row.threshold_ratio,
    lastObservedRatio: row.last_observed_ratio,
    billingCycleKey: row.billing_cycle_key,
    lastCheckedAt: row.last_checked_at,
    triggeredAt: row.triggered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readMonitor(
  db: DatabaseSync,
  userId: string,
): PrismMonitorV1 | null {
  const row = db
    .prepare(
      `SELECT id, kind, status, threshold_ratio, last_observed_ratio,
              billing_cycle_key, last_checked_at, triggered_at, created_at,
              updated_at
         FROM prism_monitors
        WHERE user_id = ? AND kind = 'elevenlabs-credit-threshold'`,
    )
    .get(userId) as MonitorRow | undefined;
  return row ? monitorFromRow(row) : null;
}

export function upsertElevenLabsCreditMonitor(args: {
  db: DatabaseSync;
  userId: string;
  thresholdRatio: number;
  hardLocal: boolean;
  now?: Date;
}): PrismMonitorV1 {
  const thresholdRatio = Math.min(
    0.99,
    Math.max(0.01, args.thresholdRatio),
  );
  const now = args.now ?? new Date();
  const existing = readMonitor(args.db, args.userId);
  if (existing) {
    args.db
      .prepare(
        `UPDATE prism_monitors
            SET threshold_ratio = ?,
                status = ?,
                updated_at = ?
          WHERE id = ? AND user_id = ?`,
      )
      .run(
        thresholdRatio,
        args.hardLocal ? "paused-local" : "active",
        now.toISOString(),
        existing.id,
        args.userId,
      );
  } else {
    args.db
      .prepare(
        `INSERT INTO prism_monitors
          (id, user_id, kind, status, threshold_ratio, created_at, updated_at)
         VALUES (?, ?, 'elevenlabs-credit-threshold', ?, ?, ?, ?)`,
      )
      .run(
        `monitor-${randomId()}`,
        args.userId,
        args.hardLocal ? "paused-local" : "active",
        thresholdRatio,
        now.toISOString(),
        now.toISOString(),
      );
  }
  const monitor = readMonitor(args.db, args.userId);
  if (!monitor) throw new Error("Prism could not save the credit reminder.");
  return monitor;
}

function billingCycleKey(balance: ElevenLabsCreditBalance): string {
  return (
    balance.resetAt ??
    `${balance.totalCredits}:${balance.tier ?? "unknown"}:${balance.status ?? "unknown"}`
  );
}

export async function checkElevenLabsCreditMonitor(args: {
  db: DatabaseSync;
  userId: string;
  hardLocal: boolean;
  readBalance: () => Promise<ElevenLabsCreditBalance>;
  now?: Date;
  force?: boolean;
}): Promise<{
  monitor: PrismMonitorV1 | null;
  balance: ElevenLabsCreditBalance | null;
  notificationCreated: boolean;
}> {
  const existing = readMonitor(args.db, args.userId);
  if (!existing) {
    return { monitor: null, balance: null, notificationCreated: false };
  }
  const now = args.now ?? new Date();
  if (args.hardLocal) {
    args.db
      .prepare(
        `UPDATE prism_monitors
            SET status = 'paused-local', updated_at = ?
          WHERE id = ? AND user_id = ?`,
      )
      .run(now.toISOString(), existing.id, args.userId);
    return {
      monitor: readMonitor(args.db, args.userId),
      balance: null,
      notificationCreated: false,
    };
  }
  if (
    !args.force &&
    existing.lastCheckedAt &&
    now.getTime() - new Date(existing.lastCheckedAt).getTime() <
      PRISM_MONITOR_INTERVAL_MS
  ) {
    return {
      monitor: existing,
      balance: null,
      notificationCreated: false,
    };
  }

  const balance = await args.readBalance();
  const ratio =
    balance.totalCredits > 0
      ? balance.remainingCredits / balance.totalCredits
      : 0;
  const cycleKey = billingCycleKey(balance);
  const sameCycle = existing.billingCycleKey === cycleKey;
  const alreadyTriggered =
    sameCycle && existing.status === "triggered";
  const shouldTrigger =
    !alreadyTriggered && ratio <= existing.thresholdRatio;
  const nextStatus = shouldTrigger || alreadyTriggered ? "triggered" : "active";
  const triggeredAt = shouldTrigger
    ? now.toISOString()
    : alreadyTriggered
      ? existing.triggeredAt
      : null;

  args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db
      .prepare(
        `UPDATE prism_monitors
            SET status = ?,
                last_observed_ratio = ?,
                billing_cycle_key = ?,
                last_checked_at = ?,
                triggered_at = ?,
                updated_at = ?
          WHERE id = ? AND user_id = ?`,
      )
      .run(
        nextStatus,
        ratio,
        cycleKey,
        now.toISOString(),
        triggeredAt,
        now.toISOString(),
        existing.id,
        args.userId,
      );
    if (shouldTrigger) {
      const percent = Math.round(ratio * 100);
      args.db
        .prepare(
          `INSERT INTO prism_notifications
            (id, user_id, monitor_id, kind, title, body, created_at)
           VALUES (?, ?, ?, 'elevenlabs-credit-threshold', ?, ?, ?)`,
        )
        .run(
          `notification-${randomId()}`,
          args.userId,
          existing.id,
          "ElevenLabs credits are running low",
          `${balance.remainingCredits.toLocaleString()} of ${balance.totalCredits.toLocaleString()} credits remain (${percent}%).`,
          now.toISOString(),
        );
    }
    args.db.exec("COMMIT");
  } catch (error) {
    args.db.exec("ROLLBACK");
    throw error;
  }
  return {
    monitor: readMonitor(args.db, args.userId),
    balance,
    notificationCreated: shouldTrigger,
  };
}

export function listPrismMonitors(
  db: DatabaseSync,
  userId: string,
): PrismMonitorV1[] {
  const monitor = readMonitor(db, userId);
  return monitor ? [monitor] : [];
}

export function listPrismNotifications(
  db: DatabaseSync,
  userId: string,
  limit = 20,
): Array<{
  id: string;
  monitorId: string | null;
  kind: string;
  title: string;
  body: string;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}> {
  const rows = db
    .prepare(
      `SELECT id, monitor_id, kind, title, body, delivered_at, read_at, created_at
         FROM prism_notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all(userId, Math.min(100, Math.max(1, Math.floor(limit)))) as unknown as Array<{
    id: string;
    monitor_id: string | null;
    kind: string;
    title: string;
    body: string;
    delivered_at: string | null;
    read_at: string | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    monitorId: row.monitor_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

