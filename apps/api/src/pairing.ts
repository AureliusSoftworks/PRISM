import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";

export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_SEGMENT_LENGTH = 4;
const PAIRING_CODE_SEGMENTS = 3;

export interface PairingCode {
  code: string;
  expiresAt: string;
}

export interface ConsumedPairingCode {
  userId: string;
}

export function normalizePairingCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function hashPairingCode(code: string): string {
  return createHash("sha256").update(normalizePairingCode(code)).digest("hex");
}

export function generatePairingCode(): string {
  const length = PAIRING_CODE_SEGMENT_LENGTH * PAIRING_CODE_SEGMENTS;
  const bytes = randomBytes(length);
  const characters = Array.from(bytes, (byte) => {
    return PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length];
  }).join("");

  return characters
    .match(new RegExp(`.{1,${PAIRING_CODE_SEGMENT_LENGTH}}`, "g"))
    ?.join("-") ?? characters;
}

export function timingSafePairingCodeEqual(
  expectedHash: string,
  providedCode: string
): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const provided = Buffer.from(hashPairingCode(providedCode), "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function createPairingCode(
  db: DatabaseSync,
  userId: string,
  now = new Date()
): PairingCode {
  const code = generatePairingCode();
  const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS).toISOString();
  const createdAt = now.toISOString();

  db.prepare(
    "INSERT INTO pairing_codes (id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(randomId(12), userId, hashPairingCode(code), expiresAt, createdAt);

  return { code, expiresAt };
}

export function consumePairingCode(
  db: DatabaseSync,
  code: string,
  now = new Date()
): ConsumedPairingCode {
  const normalizedCode = normalizePairingCode(code);
  if (!normalizedCode) {
    throw new Error("Pairing code is required.");
  }

  const codeHash = hashPairingCode(normalizedCode);
  const row = db
    .prepare(
      "SELECT id, user_id, code_hash, expires_at, used_at FROM pairing_codes WHERE code_hash = ?"
    )
    .get(codeHash) as
    | {
        id?: string;
        user_id?: string;
        code_hash?: string;
        expires_at?: string;
        used_at?: string | null;
      }
    | undefined;

  if (!row?.id || !row.user_id || !row.code_hash || !row.expires_at) {
    throw new Error("Invalid pairing code.");
  }
  if (!timingSafePairingCodeEqual(row.code_hash, normalizedCode)) {
    throw new Error("Invalid pairing code.");
  }
  if (row.used_at) {
    throw new Error("Pairing code has already been used.");
  }
  if (new Date(row.expires_at).getTime() < now.getTime()) {
    throw new Error("Pairing code has expired.");
  }

  db.prepare("UPDATE pairing_codes SET used_at = ? WHERE id = ?").run(
    now.toISOString(),
    row.id
  );

  return { userId: row.user_id };
}
