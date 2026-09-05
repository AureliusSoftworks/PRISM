import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const DIAGNOSTIC_CIPHER = "aes-256-gcm";
const DIAGNOSTIC_NONCE_BYTES = 12;
const DIAGNOSTIC_ENVELOPE_KIND = "prism-owner-encrypted-diagnostic";
export const DEVELOPER_TRANSCRIPT_VAULT_MIGRATION_VERSION_V1 = 1 as const;

interface DeveloperTranscriptEnvelopeV1 {
  v: 1;
  kind: typeof DIAGNOSTIC_ENVELOPE_KIND;
  alg: "A256GCM";
  nonce: string;
  tag: string;
  ciphertext: string;
}

function diagnosticAad(userId: string, eventId: string): Buffer {
  return Buffer.from(
    `prism:developer-transcript:v1:${userId}:${eventId}`,
    "utf8",
  );
}

function parseEnvelope(value: string): DeveloperTranscriptEnvelopeV1 | null {
  try {
    const parsed = JSON.parse(value) as Partial<DeveloperTranscriptEnvelopeV1>;
    return parsed.v === 1 &&
      parsed.kind === DIAGNOSTIC_ENVELOPE_KIND &&
      parsed.alg === "A256GCM" &&
      typeof parsed.nonce === "string" &&
      typeof parsed.tag === "string" &&
      typeof parsed.ciphertext === "string"
      ? (parsed as DeveloperTranscriptEnvelopeV1)
      : null;
  } catch {
    return null;
  }
}

export function developerTranscriptPayloadIsSealedV1(value: string): boolean {
  return parseEnvelope(value) !== null;
}

/** Whether this owner's one-time legacy transcript sealing pass completed. */
export function developerTranscriptVaultMigrationIsCompleteV1(args: {
  db: DatabaseSync;
  userId: string;
}): boolean {
  const row = args.db
    .prepare(
      `SELECT migration_version
         FROM developer_transcript_vault_migrations
        WHERE user_id = ?`,
    )
    .get(args.userId) as { migration_version?: unknown } | undefined;
  return (
    row?.migration_version ===
    DEVELOPER_TRANSCRIPT_VAULT_MIGRATION_VERSION_V1
  );
}

function markDeveloperTranscriptVaultMigrationCompleteV1(args: {
  db: DatabaseSync;
  userId: string;
}): void {
  args.db
    .prepare(
      `INSERT INTO developer_transcript_vault_migrations (
         user_id, migration_version, completed_at
       ) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         migration_version = excluded.migration_version,
         completed_at = excluded.completed_at`,
    )
    .run(
      args.userId,
      DEVELOPER_TRANSCRIPT_VAULT_MIGRATION_VERSION_V1,
      new Date().toISOString(),
    );
}

export function sealDeveloperTranscriptPayloadV1(args: {
  userId: string;
  eventId: string;
  payloadJson: string;
  userKey: Buffer;
}): string {
  const nonce = randomBytes(DIAGNOSTIC_NONCE_BYTES);
  const cipher = createCipheriv(DIAGNOSTIC_CIPHER, args.userKey, nonce);
  cipher.setAAD(diagnosticAad(args.userId, args.eventId));
  const ciphertext = Buffer.concat([
    cipher.update(args.payloadJson, "utf8"),
    cipher.final(),
  ]);
  const envelope: DeveloperTranscriptEnvelopeV1 = {
    v: 1,
    kind: DIAGNOSTIC_ENVELOPE_KIND,
    alg: "A256GCM",
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope);
}

export function openDeveloperTranscriptPayloadV1(args: {
  userId: string;
  eventId: string;
  payloadJson: string;
  userKey: Buffer;
}): string {
  const envelope = parseEnvelope(args.payloadJson);
  if (!envelope) return args.payloadJson;
  const decipher = createDecipheriv(
    DIAGNOSTIC_CIPHER,
    args.userKey,
    Buffer.from(envelope.nonce, "base64"),
  );
  decipher.setAAD(diagnosticAad(args.userId, args.eventId));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Encrypt legacy plaintext diagnostic payloads once their owner authenticates.
 * The owner predicate is repeated on every update so a row cannot be migrated
 * with a key belonging to another account.
 */
export function migrateDeveloperTranscriptPayloadsForOwnerV1(args: {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer;
}): number {
  if (developerTranscriptVaultMigrationIsCompleteV1(args)) return 0;
  const rows = args.db
    .prepare(
      `SELECT id, payload_json
         FROM developer_transcript_events
        WHERE user_id = ?`,
    )
    .all(args.userId) as Array<{ id: string; payload_json: string }>;
  let migrated = 0;
  const update = args.db.prepare(
    `UPDATE developer_transcript_events
        SET payload_json = ?
      WHERE id = ? AND user_id = ? AND payload_json = ?`,
  );
  for (const row of rows) {
    if (developerTranscriptPayloadIsSealedV1(row.payload_json)) continue;
    const sealed = sealDeveloperTranscriptPayloadV1({
      userId: args.userId,
      eventId: row.id,
      payloadJson: row.payload_json,
      userKey: args.userKey,
    });
    const result = update.run(sealed, row.id, args.userId, row.payload_json);
    migrated += Number(result.changes ?? 0);
  }
  markDeveloperTranscriptVaultMigrationCompleteV1(args);
  return migrated;
}
