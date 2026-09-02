import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  VaultAuthenticationError,
  VaultKeyLifecycleError,
  VaultUnknownKeyIdError,
  assertVaultKeyIdV2,
  assertVaultOwnerUserIdV2,
  decryptParsedVaultContentV2,
  encryptVaultContentV2,
  generateVaultKeyIdV2,
  parseVaultEnvelopeV2,
  type VaultContentBindingV2,
} from "./vault-envelope-v2.ts";

const VAULT_DEK_WRAP_CIPHER = "aes-256-gcm";
const VAULT_DEK_WRAP_AAD_PREFIX = Buffer.from(
  "PRISM\0VAULT-DEK-WRAP\0V1\0",
  "utf8",
);
const VAULT_MASTER_KDF_DOMAIN = Buffer.from(
  "PRISM\0VAULT-MASTER-KDF\0V1\0",
  "utf8",
);
const VAULT_INSTALLATION_BINDING_DOMAIN = Buffer.from(
  "PRISM\0VAULT-INSTALLATION\0V1\0",
  "utf8",
);
const VAULT_INSTALLATION_SALT_BYTES = 32;
const VAULT_DEK_BYTES = 32;
const VAULT_WRAP_NONCE_BYTES = 12;
const VAULT_WRAP_TAG_BYTES = 16;

export const VAULT_INSTALLATION_KDF_VERSION_V1 = 1 as const;
export const VAULT_DEK_WRAP_VERSION_V1 = 1 as const;

export type UserVaultKeyStateV2 = "active" | "retired";

export interface VaultInstallationKdfConfigV1 {
  kdfVersion: typeof VAULT_INSTALLATION_KDF_VERSION_V1;
  salt: Buffer;
}

/**
 * Opaque, process-local result of deriving the installation wrapping key. The
 * actual key and installation binding live in a WeakMap so callers cannot
 * serialize or accidentally reconstruct a context from public fields.
 */
export interface VaultMasterKeyContextV2 {
  readonly kind: "vault-master-key-context-v2";
  readonly kdfVersion: typeof VAULT_INSTALLATION_KDF_VERSION_V1;
}

interface VaultMasterKeyContextDetails {
  wrappingKey: Buffer;
  installationBinding: Buffer;
  kdfVersion: typeof VAULT_INSTALLATION_KDF_VERSION_V1;
}

const MASTER_KEY_CONTEXT_DETAILS = new WeakMap<
  VaultMasterKeyContextV2,
  VaultMasterKeyContextDetails
>();

export interface UserVaultKeyMetadataV2 {
  ownerUserId: string;
  keyId: string;
  state: UserVaultKeyStateV2;
  createdAt: string;
  rotatedAt: string | null;
  wrapVersion: typeof VAULT_DEK_WRAP_VERSION_V1;
  wrappingKdfVersion: typeof VAULT_INSTALLATION_KDF_VERSION_V1;
}

export interface ResolvedUserVaultKeyV2 extends UserVaultKeyMetadataV2 {
  dek: Buffer;
}

export interface UserVaultKeyRotationV2 {
  retiredKeyId: string;
  activeKey: UserVaultKeyMetadataV2;
}

interface UserVaultKeyRow {
  user_id: unknown;
  key_id: unknown;
  state: unknown;
  created_at: unknown;
  rotated_at: unknown;
  wrap_version: unknown;
  wrapping_kdf_version: unknown;
  wrapped_dek_ciphertext: unknown;
  wrapped_dek_nonce: unknown;
  wrapped_dek_tag: unknown;
}

interface CheckedUserVaultKeyRow {
  userId: string;
  keyId: string;
  state: UserVaultKeyStateV2;
  createdAt: string;
  rotatedAt: string | null;
  wrapVersion: typeof VAULT_DEK_WRAP_VERSION_V1;
  wrappingKdfVersion: typeof VAULT_INSTALLATION_KDF_VERSION_V1;
  wrappedDekCiphertext: Buffer;
  wrappedDekNonce: Buffer;
  wrappedDekTag: Buffer;
}

interface WrappedDekV1 {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
}

export interface VaultKeyringMigrationContextV2 {
  readonly kind: "vault-keyring-migration-context-v2";
}

/** Required explicitly by migration code before a retired DEK can be read. */
export const VAULT_KEYRING_MIGRATION_CONTEXT_V2: VaultKeyringMigrationContextV2 =
  Object.freeze({ kind: "vault-keyring-migration-context-v2" });

export function ensureUserVaultKeyringSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_installation_config (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      kdf_salt BLOB NOT NULL
        CHECK(typeof(kdf_salt) = 'blob' AND length(kdf_salt) = 32),
      kdf_version INTEGER NOT NULL
        CHECK(kdf_version >= 1 AND kdf_version <= 65535)
    );

    CREATE TABLE IF NOT EXISTS user_vault_keys (
      user_id TEXT NOT NULL,
      key_id TEXT NOT NULL
        CHECK(length(key_id) = 36 AND substr(key_id, 1, 4) = 'vk2_'),
      state TEXT NOT NULL CHECK(state IN ('active', 'retired')),
      created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 40),
      rotated_at TEXT CHECK(rotated_at IS NULL OR length(rotated_at) BETWEEN 20 AND 40),
      wrap_version INTEGER NOT NULL
        CHECK(wrap_version >= 1 AND wrap_version <= 65535),
      wrapping_kdf_version INTEGER NOT NULL
        CHECK(wrapping_kdf_version >= 1 AND wrapping_kdf_version <= 65535),
      wrapped_dek_ciphertext BLOB NOT NULL
        CHECK(typeof(wrapped_dek_ciphertext) = 'blob' AND length(wrapped_dek_ciphertext) = 32),
      wrapped_dek_nonce BLOB NOT NULL
        CHECK(typeof(wrapped_dek_nonce) = 'blob' AND length(wrapped_dek_nonce) = 12),
      wrapped_dek_tag BLOB NOT NULL
        CHECK(typeof(wrapped_dek_tag) = 'blob' AND length(wrapped_dek_tag) = 16),
      PRIMARY KEY(user_id, key_id),
      CHECK(
        (state = 'active' AND rotated_at IS NULL) OR
        (state = 'retired' AND rotated_at IS NOT NULL)
      ),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) WITHOUT ROWID;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_vault_keys_one_active
      ON user_vault_keys(user_id)
      WHERE state = 'active';
  `);
  db.prepare(
    `INSERT OR IGNORE INTO vault_installation_config (
       singleton, kdf_salt, kdf_version
     ) VALUES (1, ?, ?)`,
  ).run(randomBytes(VAULT_INSTALLATION_SALT_BYTES), VAULT_INSTALLATION_KDF_VERSION_V1);
  loadVaultInstallationKdfConfigV1(db);
}

function checkedBlob(value: unknown, expectedBytes: number): Buffer {
  if (!(value instanceof Uint8Array) || value.length !== expectedBytes) {
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  return Buffer.from(value);
}

export function loadVaultInstallationKdfConfigV1(
  db: DatabaseSync,
): VaultInstallationKdfConfigV1 {
  const rows = db
    .prepare(
      `SELECT kdf_salt, kdf_version
         FROM vault_installation_config
        WHERE singleton = 1`,
    )
    .all() as Array<{ kdf_salt: unknown; kdf_version: unknown }>;
  if (rows.length !== 1) {
    throw new VaultKeyLifecycleError("invalid_installation_config");
  }
  const row = rows[0];
  if (row.kdf_version !== VAULT_INSTALLATION_KDF_VERSION_V1) {
    throw new VaultKeyLifecycleError("invalid_installation_config");
  }
  let salt: Buffer;
  try {
    salt = checkedBlob(row.kdf_salt, VAULT_INSTALLATION_SALT_BYTES);
  } catch {
    throw new VaultKeyLifecycleError("invalid_installation_config");
  }
  return Object.freeze({
    kdfVersion: VAULT_INSTALLATION_KDF_VERSION_V1,
    salt,
  });
}

function installationBinding(config: VaultInstallationKdfConfigV1): Buffer {
  const version = Buffer.allocUnsafe(2);
  version.writeUInt16BE(config.kdfVersion, 0);
  return createHash("sha256")
    .update(VAULT_INSTALLATION_BINDING_DOMAIN)
    .update(version)
    .update(config.salt)
    .digest();
}

export function deriveVaultMasterKeyContextV2(
  db: DatabaseSync,
  masterSecret: string,
): VaultMasterKeyContextV2 {
  if (typeof masterSecret !== "string") {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  const masterSecretBytes = Buffer.from(masterSecret, "utf8");
  if (
    masterSecretBytes.length === 0 ||
    masterSecretBytes.length > 16 * 1024 ||
    masterSecretBytes.toString("utf8") !== masterSecret
  ) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  const config = loadVaultInstallationKdfConfigV1(db);
  let wrappingKey: Buffer;
  try {
    wrappingKey = scryptSync(
      masterSecretBytes,
      Buffer.concat([VAULT_MASTER_KDF_DOMAIN, config.salt]),
      VAULT_DEK_BYTES,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    );
  } finally {
    masterSecretBytes.fill(0);
  }
  const context: VaultMasterKeyContextV2 = Object.freeze({
    kind: "vault-master-key-context-v2",
    kdfVersion: config.kdfVersion,
  });
  MASTER_KEY_CONTEXT_DETAILS.set(context, {
    wrappingKey,
    installationBinding: installationBinding(config),
    kdfVersion: config.kdfVersion,
  });
  return context;
}

function masterContextDetailsForDb(
  db: DatabaseSync,
  context: VaultMasterKeyContextV2,
): VaultMasterKeyContextDetails {
  if (
    !context ||
    context.kind !== "vault-master-key-context-v2" ||
    context.kdfVersion !== VAULT_INSTALLATION_KDF_VERSION_V1
  ) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  const details = MASTER_KEY_CONTEXT_DETAILS.get(context);
  if (!details || details.wrappingKey.length !== VAULT_DEK_BYTES) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  const currentBinding = installationBinding(
    loadVaultInstallationKdfConfigV1(db),
  );
  if (
    currentBinding.length !== details.installationBinding.length ||
    !timingSafeEqual(currentBinding, details.installationBinding)
  ) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  return details;
}

function lengthPrefixed(component: Buffer): Buffer {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(component.length, 0);
  return Buffer.concat([length, component]);
}

function buildDekWrapAadV1(args: {
  ownerUserId: string;
  keyId: string;
  wrapVersion: number;
  kdfVersion: number;
}): Buffer {
  assertVaultOwnerUserIdV2(args.ownerUserId);
  assertVaultKeyIdV2(args.keyId);
  if (
    args.wrapVersion !== VAULT_DEK_WRAP_VERSION_V1 ||
    args.kdfVersion !== VAULT_INSTALLATION_KDF_VERSION_V1
  ) {
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  const versions = Buffer.allocUnsafe(4);
  versions.writeUInt16BE(args.wrapVersion, 0);
  versions.writeUInt16BE(args.kdfVersion, 2);
  return Buffer.concat([
    VAULT_DEK_WRAP_AAD_PREFIX,
    lengthPrefixed(Buffer.from(args.ownerUserId, "utf8")),
    lengthPrefixed(Buffer.from(args.keyId, "ascii")),
    versions,
  ]);
}

function wrapDekV1(args: {
  ownerUserId: string;
  keyId: string;
  dek: Uint8Array;
  context: VaultMasterKeyContextDetails;
}): WrappedDekV1 {
  if (!(args.dek instanceof Uint8Array) || args.dek.length !== VAULT_DEK_BYTES) {
    throw new VaultKeyLifecycleError("invalid_dek");
  }
  const nonce = randomBytes(VAULT_WRAP_NONCE_BYTES);
  const cipher = createCipheriv(
    VAULT_DEK_WRAP_CIPHER,
    args.context.wrappingKey,
    nonce,
    { authTagLength: VAULT_WRAP_TAG_BYTES },
  );
  cipher.setAAD(
    buildDekWrapAadV1({
      ownerUserId: args.ownerUserId,
      keyId: args.keyId,
      wrapVersion: VAULT_DEK_WRAP_VERSION_V1,
      kdfVersion: args.context.kdfVersion,
    }),
  );
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(args.dek)),
    cipher.final(),
  ]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

function unwrapDekV1(
  row: CheckedUserVaultKeyRow,
  context: VaultMasterKeyContextDetails,
): Buffer {
  try {
    const decipher = createDecipheriv(
      VAULT_DEK_WRAP_CIPHER,
      context.wrappingKey,
      row.wrappedDekNonce,
      { authTagLength: VAULT_WRAP_TAG_BYTES },
    );
    decipher.setAAD(
      buildDekWrapAadV1({
        ownerUserId: row.userId,
        keyId: row.keyId,
        wrapVersion: row.wrapVersion,
        kdfVersion: row.wrappingKdfVersion,
      }),
    );
    decipher.setAuthTag(row.wrappedDekTag);
    const dek = Buffer.concat([
      decipher.update(row.wrappedDekCiphertext),
      decipher.final(),
    ]);
    if (dek.length !== VAULT_DEK_BYTES) {
      throw new VaultAuthenticationError();
    }
    return dek;
  } catch (error) {
    if (error instanceof VaultKeyLifecycleError) throw error;
    throw new VaultAuthenticationError();
  }
}

function checkedIsoTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  return value;
}

function lifecycleTimestamp(value: string | undefined): string {
  const timestamp = value ?? new Date().toISOString();
  try {
    return checkedIsoTimestamp(timestamp);
  } catch {
    throw new VaultKeyLifecycleError("transaction_conflict");
  }
}

function checkedKeyRow(row: UserVaultKeyRow): CheckedUserVaultKeyRow {
  if (typeof row.user_id !== "string") {
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  assertVaultOwnerUserIdV2(row.user_id);
  assertVaultKeyIdV2(row.key_id);
  if (row.state !== "active" && row.state !== "retired") {
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  const createdAt = checkedIsoTimestamp(row.created_at);
  const rotatedAt = row.rotated_at === null ? null : checkedIsoTimestamp(row.rotated_at);
  if (
    (row.state === "active" && rotatedAt !== null) ||
    (row.state === "retired" && rotatedAt === null) ||
    (rotatedAt !== null && rotatedAt < createdAt) ||
    row.wrap_version !== VAULT_DEK_WRAP_VERSION_V1 ||
    row.wrapping_kdf_version !== VAULT_INSTALLATION_KDF_VERSION_V1
  ) {
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  return {
    userId: row.user_id,
    keyId: row.key_id,
    state: row.state,
    createdAt,
    rotatedAt,
    wrapVersion: VAULT_DEK_WRAP_VERSION_V1,
    wrappingKdfVersion: VAULT_INSTALLATION_KDF_VERSION_V1,
    wrappedDekCiphertext: checkedBlob(
      row.wrapped_dek_ciphertext,
      VAULT_DEK_BYTES,
    ),
    wrappedDekNonce: checkedBlob(row.wrapped_dek_nonce, VAULT_WRAP_NONCE_BYTES),
    wrappedDekTag: checkedBlob(row.wrapped_dek_tag, VAULT_WRAP_TAG_BYTES),
  };
}

function metadataFromRow(row: CheckedUserVaultKeyRow): UserVaultKeyMetadataV2 {
  return Object.freeze({
    ownerUserId: row.userId,
    keyId: row.keyId,
    state: row.state,
    createdAt: row.createdAt,
    rotatedAt: row.rotatedAt,
    wrapVersion: row.wrapVersion,
    wrappingKdfVersion: row.wrappingKdfVersion,
  });
}

function assertOwnerExists(db: DatabaseSync, ownerUserId: string): void {
  assertVaultOwnerUserIdV2(ownerUserId);
  const owner = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(ownerUserId) as { id: unknown } | undefined;
  if (!owner || owner.id !== ownerUserId) {
    throw new VaultKeyLifecycleError("owner_not_found");
  }
}

function selectOwnerKeyRows(
  db: DatabaseSync,
  ownerUserId: string,
): CheckedUserVaultKeyRow[] {
  return (
    db
      .prepare(
        `SELECT user_id, key_id, state, created_at, rotated_at,
                wrap_version, wrapping_kdf_version,
                wrapped_dek_ciphertext, wrapped_dek_nonce, wrapped_dek_tag
           FROM user_vault_keys
          WHERE user_id = ?
          ORDER BY created_at, key_id`,
      )
      .all(ownerUserId) as unknown as UserVaultKeyRow[]
  ).map(checkedKeyRow);
}

function oneActiveRow(rows: readonly CheckedUserVaultKeyRow[]): CheckedUserVaultKeyRow {
  const active = rows.filter((row) => row.state === "active");
  if (active.length === 0) {
    throw new VaultKeyLifecycleError("active_key_missing");
  }
  if (active.length !== 1) {
    throw new VaultKeyLifecycleError("multiple_active_keys");
  }
  return active[0];
}

let vaultSavepointSequence = 0;

function withVaultKeyringTransaction<T>(
  db: DatabaseSync,
  operation: () => T,
): T {
  const nested = db.isTransaction;
  const savepoint = `prism_vault_keyring_${++vaultSavepointSequence}`;
  if (nested) db.exec(`SAVEPOINT ${savepoint}`);
  else db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const result = operation();
    if (nested) db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    else db.exec("COMMIT");
    return result;
  } catch (error) {
    if (nested) {
      try {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      } finally {
        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      }
    } else if (db.isTransaction) {
      db.exec("ROLLBACK");
    }
    throw error;
  }
}

function insertInitialDek(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  dek: Uint8Array;
  keyId?: string;
  createdAt?: string;
}): UserVaultKeyMetadataV2 {
  if (!(args.dek instanceof Uint8Array) || args.dek.length !== VAULT_DEK_BYTES) {
    throw new VaultKeyLifecycleError("invalid_dek");
  }
  const createdAt = lifecycleTimestamp(args.createdAt);
  const dek = Buffer.from(args.dek);
  try {
    return withVaultKeyringTransaction(args.db, () => {
      assertOwnerExists(args.db, args.ownerUserId);
      const context = masterContextDetailsForDb(args.db, args.context);
      if (selectOwnerKeyRows(args.db, args.ownerUserId).length > 0) {
        throw new VaultKeyLifecycleError("keyring_already_initialized");
      }
      const keyId = args.keyId ?? generateVaultKeyIdV2();
      assertVaultKeyIdV2(keyId);
      const wrapped = wrapDekV1({
        ownerUserId: args.ownerUserId,
        keyId,
        dek,
        context,
      });
      args.db
        .prepare(
          `INSERT INTO user_vault_keys (
             user_id, key_id, state, created_at, rotated_at,
             wrap_version, wrapping_kdf_version,
             wrapped_dek_ciphertext, wrapped_dek_nonce, wrapped_dek_tag
           ) VALUES (?, ?, 'active', ?, NULL, ?, ?, ?, ?, ?)`,
        )
        .run(
          args.ownerUserId,
          keyId,
          createdAt,
          VAULT_DEK_WRAP_VERSION_V1,
          context.kdfVersion,
          wrapped.ciphertext,
          wrapped.nonce,
          wrapped.tag,
        );
      return Object.freeze({
        ownerUserId: args.ownerUserId,
        keyId,
        state: "active" as const,
        createdAt,
        rotatedAt: null,
        wrapVersion: VAULT_DEK_WRAP_VERSION_V1,
        wrappingKdfVersion: context.kdfVersion,
      });
    });
  } finally {
    dek.fill(0);
  }
}

export function createUserVaultKeyringV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  createdAt?: string;
}): UserVaultKeyMetadataV2 {
  const dek = randomBytes(VAULT_DEK_BYTES);
  try {
    return insertInitialDek({ ...args, dek });
  } finally {
    dek.fill(0);
  }
}

/**
 * Explicit bridge for the future gated migrator: it can decrypt the current
 * users.wrapped_user_key* triplet and import that same 32-byte DEK. This module
 * never reads or migrates legacy user rows on its own.
 */
export function importLegacyUserDekIntoVaultKeyringV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  legacyDek: Uint8Array;
  keyId?: string;
  createdAt?: string;
}): UserVaultKeyMetadataV2 {
  return insertInitialDek({
    db: args.db,
    ownerUserId: args.ownerUserId,
    context: args.context,
    dek: args.legacyDek,
    keyId: args.keyId,
    createdAt: args.createdAt,
  });
}

export function listUserVaultKeysV2(
  db: DatabaseSync,
  ownerUserId: string,
): readonly UserVaultKeyMetadataV2[] {
  assertOwnerExists(db, ownerUserId);
  return Object.freeze(
    selectOwnerKeyRows(db, ownerUserId).map(metadataFromRow),
  );
}

export function resolveActiveUserVaultKeyV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
}): ResolvedUserVaultKeyV2 {
  assertOwnerExists(args.db, args.ownerUserId);
  const context = masterContextDetailsForDb(args.db, args.context);
  const row = oneActiveRow(selectOwnerKeyRows(args.db, args.ownerUserId));
  return { ...metadataFromRow(row), dek: unwrapDekV1(row, context) };
}

function resolveUserVaultKeyForReadV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  keyId: string;
  context: VaultMasterKeyContextV2;
  allowRetired: boolean;
}): ResolvedUserVaultKeyV2 {
  assertOwnerExists(args.db, args.ownerUserId);
  const context = masterContextDetailsForDb(args.db, args.context);
  assertVaultKeyIdV2(args.keyId);
  const raw = args.db
    .prepare(
      `SELECT user_id, key_id, state, created_at, rotated_at,
              wrap_version, wrapping_kdf_version,
              wrapped_dek_ciphertext, wrapped_dek_nonce, wrapped_dek_tag
         FROM user_vault_keys
        WHERE user_id = ? AND key_id = ?`,
    )
    .get(args.ownerUserId, args.keyId) as UserVaultKeyRow | undefined;
  if (!raw) throw new VaultUnknownKeyIdError();
  const row = checkedKeyRow(raw);
  if (row.state === "retired" && !args.allowRetired) {
    throw new VaultKeyLifecycleError(
      "retired_key_requires_migration_context",
    );
  }
  return { ...metadataFromRow(row), dek: unwrapDekV1(row, context) };
}

export function encryptUserVaultContentV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  logicalTable: string;
  logicalColumn: string;
  stableRowId: string;
  plaintext: Uint8Array;
}): Buffer {
  const resolved = resolveActiveUserVaultKeyV2(args);
  try {
    return encryptVaultContentV2({
      plaintext: args.plaintext,
      dek: resolved.dek,
      keyId: resolved.keyId,
      binding: {
        ownerUserId: args.ownerUserId,
        logicalTable: args.logicalTable,
        logicalColumn: args.logicalColumn,
        stableRowId: args.stableRowId,
      },
    });
  } finally {
    resolved.dek.fill(0);
  }
}

function decryptUserVaultContentInternalV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  binding: VaultContentBindingV2;
  serializedEnvelope: Uint8Array;
  allowRetired: boolean;
}): Buffer {
  assertOwnerExists(args.db, args.ownerUserId);
  if (args.binding.ownerUserId !== args.ownerUserId) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  const envelope = parseVaultEnvelopeV2(args.serializedEnvelope);
  const resolved = resolveUserVaultKeyForReadV2({
    db: args.db,
    ownerUserId: args.ownerUserId,
    keyId: envelope.keyId,
    context: args.context,
    allowRetired: args.allowRetired,
  });
  try {
    return decryptParsedVaultContentV2({
      envelope,
      dek: resolved.dek,
      binding: args.binding,
    });
  } finally {
    resolved.dek.fill(0);
  }
}

export function decryptUserVaultContentV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  logicalTable: string;
  logicalColumn: string;
  stableRowId: string;
  serializedEnvelope: Uint8Array;
}): Buffer {
  return decryptUserVaultContentInternalV2({
    db: args.db,
    ownerUserId: args.ownerUserId,
    context: args.context,
    binding: {
      ownerUserId: args.ownerUserId,
      logicalTable: args.logicalTable,
      logicalColumn: args.logicalColumn,
      stableRowId: args.stableRowId,
    },
    serializedEnvelope: args.serializedEnvelope,
    allowRetired: false,
  });
}

export function decryptUserVaultContentForMigrationV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  migrationContext: VaultKeyringMigrationContextV2;
  logicalTable: string;
  logicalColumn: string;
  stableRowId: string;
  serializedEnvelope: Uint8Array;
}): Buffer {
  if (args.migrationContext !== VAULT_KEYRING_MIGRATION_CONTEXT_V2) {
    throw new VaultKeyLifecycleError(
      "retired_key_requires_migration_context",
    );
  }
  return decryptUserVaultContentInternalV2({
    db: args.db,
    ownerUserId: args.ownerUserId,
    context: args.context,
    binding: {
      ownerUserId: args.ownerUserId,
      logicalTable: args.logicalTable,
      logicalColumn: args.logicalColumn,
      stableRowId: args.stableRowId,
    },
    serializedEnvelope: args.serializedEnvelope,
    allowRetired: true,
  });
}

export function rotateUserVaultDekV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  rotatedAt?: string;
}): UserVaultKeyRotationV2 {
  const rotatedAt = lifecycleTimestamp(args.rotatedAt);
  return withVaultKeyringTransaction(args.db, () => {
    assertOwnerExists(args.db, args.ownerUserId);
    const context = masterContextDetailsForDb(args.db, args.context);
    const current = oneActiveRow(
      selectOwnerKeyRows(args.db, args.ownerUserId),
    );
    if (rotatedAt < current.createdAt) {
      throw new VaultKeyLifecycleError("transaction_conflict");
    }
    const currentDek = unwrapDekV1(current, context);
    currentDek.fill(0);

    const nextKeyId = generateVaultKeyIdV2();
    const nextDek = randomBytes(VAULT_DEK_BYTES);
    try {
      const wrapped = wrapDekV1({
        ownerUserId: args.ownerUserId,
        keyId: nextKeyId,
        dek: nextDek,
        context,
      });
      const retired = args.db
        .prepare(
          `UPDATE user_vault_keys
              SET state = 'retired', rotated_at = ?
            WHERE user_id = ? AND key_id = ? AND state = 'active'`,
        )
        .run(rotatedAt, args.ownerUserId, current.keyId) as {
        changes?: number | bigint;
      };
      if (Number(retired.changes ?? 0) !== 1) {
        throw new VaultKeyLifecycleError("transaction_conflict");
      }
      args.db
        .prepare(
          `INSERT INTO user_vault_keys (
             user_id, key_id, state, created_at, rotated_at,
             wrap_version, wrapping_kdf_version,
             wrapped_dek_ciphertext, wrapped_dek_nonce, wrapped_dek_tag
           ) VALUES (?, ?, 'active', ?, NULL, ?, ?, ?, ?, ?)`,
        )
        .run(
          args.ownerUserId,
          nextKeyId,
          rotatedAt,
          VAULT_DEK_WRAP_VERSION_V1,
          context.kdfVersion,
          wrapped.ciphertext,
          wrapped.nonce,
          wrapped.tag,
        );
      return Object.freeze({
        retiredKeyId: current.keyId,
        activeKey: Object.freeze({
          ownerUserId: args.ownerUserId,
          keyId: nextKeyId,
          state: "active" as const,
          createdAt: rotatedAt,
          rotatedAt: null,
          wrapVersion: VAULT_DEK_WRAP_VERSION_V1,
          wrappingKdfVersion: context.kdfVersion,
        }),
      });
    } finally {
      nextDek.fill(0);
    }
  });
}

export function rewrapUserVaultKeyringMasterV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  oldContext: VaultMasterKeyContextV2;
  newContext: VaultMasterKeyContextV2;
}): number {
  return withVaultKeyringTransaction(args.db, () => {
    assertOwnerExists(args.db, args.ownerUserId);
    const oldContext = masterContextDetailsForDb(args.db, args.oldContext);
    const newContext = masterContextDetailsForDb(args.db, args.newContext);
    const rows = selectOwnerKeyRows(args.db, args.ownerUserId);
    oneActiveRow(rows);
    const opened: Array<{ row: CheckedUserVaultKeyRow; dek: Buffer }> = [];
    try {
      for (const row of rows) {
        opened.push({ row, dek: unwrapDekV1(row, oldContext) });
      }
      for (const item of opened) {
        const wrapped = wrapDekV1({
          ownerUserId: item.row.userId,
          keyId: item.row.keyId,
          dek: item.dek,
          context: newContext,
        });
        const updated = args.db
          .prepare(
            `UPDATE user_vault_keys
                SET wrap_version = ?, wrapping_kdf_version = ?,
                    wrapped_dek_ciphertext = ?, wrapped_dek_nonce = ?,
                    wrapped_dek_tag = ?
              WHERE user_id = ? AND key_id = ?`,
          )
          .run(
            VAULT_DEK_WRAP_VERSION_V1,
            newContext.kdfVersion,
            wrapped.ciphertext,
            wrapped.nonce,
            wrapped.tag,
            item.row.userId,
            item.row.keyId,
          ) as { changes?: number | bigint };
        if (Number(updated.changes ?? 0) !== 1) {
          throw new VaultKeyLifecycleError("transaction_conflict");
        }
      }
      return opened.length;
    } finally {
      for (const item of opened) item.dek.fill(0);
    }
  });
}
