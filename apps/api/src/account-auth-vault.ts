import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
} from "node:crypto";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { decryptText, deriveMasterKey } from "./security.ts";
import {
  VAULT_KEYRING_MIGRATION_CONTEXT_V2,
  decryptUserVaultContentForMigrationV2,
  decryptUserVaultContentV2,
  deriveVaultMasterKeyContextV2,
  encryptUserVaultContentV2,
  importLegacyUserDekIntoVaultKeyringV2,
  listUserVaultKeysV2,
  resolveActiveUserVaultKeyV2,
  rotateUserVaultDekV2,
  type UserVaultKeyRotationV2,
  type VaultMasterKeyContextV2,
} from "./user-vault-keyring.ts";
import {
  VaultAuthenticationError,
  VaultEnvelopeMalformedError,
  VaultKeyLifecycleError,
  encryptVaultContentV2,
  generateVaultKeyIdV2,
  parseVaultEnvelopeV2,
} from "./vault-envelope-v2.ts";

export const ACCOUNT_AUTH_VAULT_CONTRACT_VERSION_V2 = 1 as const;

const INSTALLATION_KEY_BYTES = 32;
const INSTALLATION_KEY_NONCE_BYTES = 12;
const INSTALLATION_KEY_TAG_BYTES = 16;
const INSTALLATION_KEY_WRAP_VERSION = 1;
const INSTALLATION_KEY_WRAP_DOMAIN = Buffer.from(
  "PRISM\0ACCOUNT-AUTH-INSTALLATION-KEY-WRAP\0V2\0",
  "utf8",
);
const INSTALLATION_KEY_WRAP_AAD_DOMAIN = Buffer.from(
  "PRISM\0ACCOUNT-AUTH-INSTALLATION-KEY-AAD\0V2\0",
  "utf8",
);
const USER_VALUE_PREFIX = Buffer.from(
  "PRISM\0ACCOUNT-USER-SQL-VALUE\0V2\0",
  "utf8",
);
const USER_VALUE_TEXT = 1;
const USER_VALUE_NUMBER = 2;
const USER_VALUE_BYTES = 3;
const DIGEST_DOMAINS = Object.freeze({
  login: Buffer.from("PRISM\0LOGIN-IDENTITY-BLIND-INDEX\0V2\0", "utf8"),
  session: Buffer.from("PRISM\0SESSION-BEARER-TOKEN\0V2\0", "utf8"),
  client: Buffer.from("PRISM\0CLIENT-ACCESS-BEARER-TOKEN\0V2\0", "utf8"),
});
const DIGEST_PREFIXES = Object.freeze({
  login: "pli2_",
  session: "pst2_",
  client: "pct2_",
});
const SQLITE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const ACCOUNT_USER_OPEN_FUNCTION = "prism_account_user_open_v2";
const ACCOUNT_USER_SEAL_FUNCTION = "prism_account_user_seal_v2";
const ACCOUNT_LOGIN_INDEX_FUNCTION = "prism_account_login_index_v2";
const ACCOUNT_USER_UPDATE_TRIGGER = "account_auth_users_update";

type SqliteValue = null | string | number | bigint | Uint8Array;

interface UserColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface AccountAuthRuntime {
  context: VaultMasterKeyContextV2;
  installationKey: Buffer;
  functionsRegistered: boolean;
  prepareWrapped: boolean;
  viewInstalled: boolean;
}

export interface AccountAuthVaultActivationReportV2 {
  contractVersion: typeof ACCOUNT_AUTH_VAULT_CONTRACT_VERSION_V2;
  migratedOwnerCount: number;
  encryptedCellCount: number;
  migratedSessionTokenCount: number;
  migratedClientAccessTokenCount: number;
}

export interface CreateEncryptedAccountOwnerV2Args {
  db: DatabaseSync;
  ownerUserId: string;
  loginIdentity: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  wrappedUserKey: string;
  wrappedUserKeyIv: string;
  wrappedUserKeyTag: string;
  userDek: Uint8Array;
  createdAt: string;
  initialPrivateValues?: Readonly<Record<string, SqliteValue>>;
}

const PUBLIC_USER_COLUMNS = new Set([
  "id",
  "password_hash",
  "password_salt",
  "wrapped_user_key",
  "wrapped_user_key_iv",
  "wrapped_user_key_tag",
  "login_identity_blind_index",
  "created_at",
  "last_active_at",
]);

const RUNTIMES = new WeakMap<DatabaseSync, AccountAuthRuntime>();

function quoteIdentifier(identifier: string): string {
  if (!SQLITE_IDENTIFIER.test(identifier)) {
    throw new TypeError("Account Auth Vault identifier is invalid.");
  }
  return `"${identifier}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function userColumns(db: DatabaseSync): UserColumnInfo[] {
  return db
    .prepare("PRAGMA main.table_info(users)")
    .all() as unknown as UserColumnInfo[];
}

function privateUserColumns(db: DatabaseSync): UserColumnInfo[] {
  return userColumns(db).filter((column) => !PUBLIC_USER_COLUMNS.has(column.name));
}

function encodeSqliteValue(value: Exclude<SqliteValue, null>): Buffer {
  if (typeof value === "string") {
    return Buffer.concat([
      USER_VALUE_PREFIX,
      Buffer.from([USER_VALUE_TEXT]),
      Buffer.from(value, "utf8"),
    ]);
  }
  if (typeof value === "number" || typeof value === "bigint") {
    const normalized = typeof value === "bigint" ? Number(value) : value;
    if (!Number.isFinite(normalized)) {
      throw new TypeError("Account Auth Vault numeric value is invalid.");
    }
    return Buffer.concat([
      USER_VALUE_PREFIX,
      Buffer.from([USER_VALUE_NUMBER]),
      Buffer.from(JSON.stringify(normalized), "utf8"),
    ]);
  }
  if (value instanceof Uint8Array) {
    return Buffer.concat([
      USER_VALUE_PREFIX,
      Buffer.from([USER_VALUE_BYTES]),
      Buffer.from(value),
    ]);
  }
  throw new TypeError("Account Auth Vault value type is unsupported.");
}

function decodeSqliteValue(plaintext: Uint8Array): SqliteValue {
  const bytes = Buffer.from(plaintext);
  if (
    bytes.length <= USER_VALUE_PREFIX.length ||
    !bytes.subarray(0, USER_VALUE_PREFIX.length).equals(USER_VALUE_PREFIX)
  ) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  const tag = bytes[USER_VALUE_PREFIX.length];
  const payload = bytes.subarray(USER_VALUE_PREFIX.length + 1);
  if (tag === USER_VALUE_TEXT) {
    const value = payload.toString("utf8");
    if (!Buffer.from(value, "utf8").equals(payload)) {
      throw new VaultEnvelopeMalformedError("invalid_input");
    }
    return value;
  }
  if (tag === USER_VALUE_NUMBER) {
    const value = Number(payload.toString("utf8"));
    if (!Number.isFinite(value)) {
      throw new VaultEnvelopeMalformedError("invalid_input");
    }
    return value;
  }
  if (tag === USER_VALUE_BYTES) return Buffer.from(payload);
  throw new VaultEnvelopeMalformedError("invalid_input");
}

function checkedMasterSecret(masterSecret: string): Buffer {
  if (typeof masterSecret !== "string") {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  const bytes = Buffer.from(masterSecret, "utf8");
  if (
    bytes.length === 0 ||
    bytes.length > 16 * 1024 ||
    bytes.toString("utf8") !== masterSecret
  ) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  return bytes;
}

function installationSalt(db: DatabaseSync): Buffer {
  const row = db
    .prepare(
      "SELECT kdf_salt, kdf_version FROM main.vault_installation_config WHERE singleton = 1",
    )
    .get() as { kdf_salt?: unknown; kdf_version?: unknown } | undefined;
  if (
    row?.kdf_version !== 1 ||
    !(row.kdf_salt instanceof Uint8Array) ||
    row.kdf_salt.length !== 32
  ) {
    throw new VaultKeyLifecycleError("invalid_installation_config");
  }
  return Buffer.from(row.kdf_salt);
}

function deriveInstallationWrapKey(db: DatabaseSync, masterSecret: string): Buffer {
  const secret = checkedMasterSecret(masterSecret);
  try {
    return scryptSync(
      secret,
      Buffer.concat([INSTALLATION_KEY_WRAP_DOMAIN, installationSalt(db)]),
      INSTALLATION_KEY_BYTES,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    );
  } finally {
    secret.fill(0);
  }
}

function installationKeyAad(db: DatabaseSync): Buffer {
  return Buffer.concat([
    INSTALLATION_KEY_WRAP_AAD_DOMAIN,
    installationSalt(db),
    Buffer.from([0, INSTALLATION_KEY_WRAP_VERSION]),
  ]);
}

function wrapInstallationKey(
  db: DatabaseSync,
  installationKey: Uint8Array,
  masterSecret: string,
): { ciphertext: Buffer; nonce: Buffer; tag: Buffer } {
  if (installationKey.length !== INSTALLATION_KEY_BYTES) {
    throw new VaultKeyLifecycleError("invalid_dek");
  }
  const wrappingKey = deriveInstallationWrapKey(db, masterSecret);
  try {
    const nonce = randomBytes(INSTALLATION_KEY_NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", wrappingKey, nonce, {
      authTagLength: INSTALLATION_KEY_TAG_BYTES,
    });
    cipher.setAAD(installationKeyAad(db));
    return {
      ciphertext: Buffer.concat([
        cipher.update(Buffer.from(installationKey)),
        cipher.final(),
      ]),
      nonce,
      tag: cipher.getAuthTag(),
    };
  } finally {
    wrappingKey.fill(0);
  }
}

function unwrapInstallationKey(db: DatabaseSync, masterSecret: string): Buffer {
  const row = db
    .prepare(
      `SELECT wrapped_key_ciphertext, wrapped_key_nonce, wrapped_key_tag,
              wrap_version
         FROM main.account_auth_installation_key
        WHERE singleton = 1`,
    )
    .get() as
    | {
        wrapped_key_ciphertext?: unknown;
        wrapped_key_nonce?: unknown;
        wrapped_key_tag?: unknown;
        wrap_version?: unknown;
      }
    | undefined;
  if (
    row?.wrap_version !== INSTALLATION_KEY_WRAP_VERSION ||
    !(row.wrapped_key_ciphertext instanceof Uint8Array) ||
    row.wrapped_key_ciphertext.length !== INSTALLATION_KEY_BYTES ||
    !(row.wrapped_key_nonce instanceof Uint8Array) ||
    row.wrapped_key_nonce.length !== INSTALLATION_KEY_NONCE_BYTES ||
    !(row.wrapped_key_tag instanceof Uint8Array) ||
    row.wrapped_key_tag.length !== INSTALLATION_KEY_TAG_BYTES
  ) {
    throw new VaultKeyLifecycleError("invalid_installation_config");
  }
  const wrappingKey = deriveInstallationWrapKey(db, masterSecret);
  try {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        wrappingKey,
        Buffer.from(row.wrapped_key_nonce),
        { authTagLength: INSTALLATION_KEY_TAG_BYTES },
      );
      decipher.setAAD(installationKeyAad(db));
      decipher.setAuthTag(Buffer.from(row.wrapped_key_tag));
      const key = Buffer.concat([
        decipher.update(Buffer.from(row.wrapped_key_ciphertext)),
        decipher.final(),
      ]);
      if (key.length !== INSTALLATION_KEY_BYTES) {
        key.fill(0);
        throw new VaultAuthenticationError();
      }
      return key;
    } catch (error) {
      if (error instanceof VaultAuthenticationError) throw error;
      throw new VaultAuthenticationError();
    }
  } finally {
    wrappingKey.fill(0);
  }
}

function loadOrCreateInstallationKey(
  db: DatabaseSync,
  masterSecret: string,
): Buffer {
  const present = db
    .prepare(
      "SELECT 1 AS present FROM main.account_auth_installation_key WHERE singleton = 1",
    )
    .get() as { present?: number } | undefined;
  if (present?.present === 1) return unwrapInstallationKey(db, masterSecret);

  const installationKey = randomBytes(INSTALLATION_KEY_BYTES);
  try {
    const wrapped = wrapInstallationKey(db, installationKey, masterSecret);
    db.prepare(
      `INSERT INTO main.account_auth_installation_key (
         singleton, wrapped_key_ciphertext, wrapped_key_nonce, wrapped_key_tag,
         wrap_version, created_at
       ) VALUES (1, ?, ?, ?, ?, ?)`,
    ).run(
      wrapped.ciphertext,
      wrapped.nonce,
      wrapped.tag,
      INSTALLATION_KEY_WRAP_VERSION,
      new Date().toISOString(),
    );
    return Buffer.from(installationKey);
  } finally {
    installationKey.fill(0);
  }
}

export function normalizeLoginIdentityV2(value: string): string {
  if (typeof value !== "string") {
    throw new TypeError("Login identity is invalid.");
  }
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  const bytes = Buffer.from(normalized, "utf8");
  if (
    normalized.length === 0 ||
    bytes.length > 1_024 ||
    bytes.toString("utf8") !== normalized ||
    /\p{Cc}/u.test(normalized)
  ) {
    throw new TypeError("Login identity is invalid.");
  }
  return normalized;
}

function checkedPresentedToken(token: string): string {
  if (typeof token !== "string" || token.length === 0 || token.length > 4_096) {
    throw new TypeError("Bearer token is invalid.");
  }
  return token;
}

function digestFor(
  db: DatabaseSync,
  kind: keyof typeof DIGEST_DOMAINS,
  value: string,
): string {
  const runtime = RUNTIMES.get(db);
  if (!runtime) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  const checked = kind === "login" ? normalizeLoginIdentityV2(value) : checkedPresentedToken(value);
  const encoded = Buffer.from(checked, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(encoded.length, 0);
  return `${DIGEST_PREFIXES[kind]}${createHmac("sha256", runtime.installationKey)
    .update(DIGEST_DOMAINS[kind])
    .update(length)
    .update(encoded)
    .digest("hex")}`;
}

export function loginIdentityBlindIndexV2(db: DatabaseSync, value: string): string {
  return digestFor(db, "login", value);
}

export function sessionTokenHashV2(db: DatabaseSync, token: string): string {
  return digestFor(db, "session", token);
}

export function clientAccessTokenHashV2(db: DatabaseSync, token: string): string {
  return digestFor(db, "client", token);
}

export function findAccountOwnerIdByLoginIdentityV2(
  db: DatabaseSync,
  identity: string,
): string | null {
  const row = db
    .prepare(
      "SELECT id FROM main.users WHERE login_identity_blind_index = ?",
    )
    .get(loginIdentityBlindIndexV2(db, identity)) as { id?: unknown } | undefined;
  return typeof row?.id === "string" ? row.id : null;
}

export function ensureAccountAuthVaultStorageSchemaV2(db: DatabaseSync): void {
  const columns = new Set(userColumns(db).map((column) => column.name));
  if (!columns.has("login_identity_blind_index")) {
    db.exec(
      "ALTER TABLE main.users ADD COLUMN login_identity_blind_index TEXT;",
    );
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS main.idx_users_login_identity_blind_v2
      ON users(login_identity_blind_index)
      WHERE login_identity_blind_index IS NOT NULL;

    CREATE TABLE IF NOT EXISTS main.account_auth_installation_key (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      wrapped_key_ciphertext BLOB NOT NULL
        CHECK(typeof(wrapped_key_ciphertext) = 'blob' AND length(wrapped_key_ciphertext) = 32),
      wrapped_key_nonce BLOB NOT NULL
        CHECK(typeof(wrapped_key_nonce) = 'blob' AND length(wrapped_key_nonce) = 12),
      wrapped_key_tag BLOB NOT NULL
        CHECK(typeof(wrapped_key_tag) = 'blob' AND length(wrapped_key_tag) = 16),
      wrap_version INTEGER NOT NULL CHECK(wrap_version = 1),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS main.account_auth_vault_state (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      contract_version INTEGER NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS main.account_auth_vault_migrations (
      user_id TEXT PRIMARY KEY,
      contract_version INTEGER NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('migrating', 'blocked', 'complete')),
      encrypted_cell_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) WITHOUT ROWID;
  `);
}

function tokenTableColumns(db: DatabaseSync, table: string): Set<string> {
  return new Set(
    (
      db.prepare(`PRAGMA main.table_info(${quoteIdentifier(table)})`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name),
  );
}

function migrateSessionTokenTable(db: DatabaseSync): number {
  const columns = tokenTableColumns(db, "sessions");
  if (columns.has("token_hash") && !columns.has("token")) return 0;
  if (!columns.has("token") || columns.has("token_hash")) {
    throw new VaultKeyLifecycleError("invalid_installation_config");
  }
  const rows = db
    .prepare("SELECT token, user_id, expires_at FROM main.sessions")
    .all() as Array<{ token: string; user_id: string; expires_at: string }>;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE main.__account_auth_sessions_v2 (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    const insert = db.prepare(
      "INSERT INTO main.__account_auth_sessions_v2 (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    );
    for (const row of rows) {
      insert.run(sessionTokenHashV2(db, row.token), row.user_id, row.expires_at);
    }
    db.exec(`
      DROP TABLE main.sessions;
      ALTER TABLE main.__account_auth_sessions_v2 RENAME TO sessions;
    `);
    db.exec("COMMIT");
    return rows.length;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function migrateClientAccessTokenTable(db: DatabaseSync): number {
  const columns = tokenTableColumns(db, "client_access_tokens");
  if (columns.has("token_hash") && !columns.has("token")) return 0;
  if (!columns.has("token") || columns.has("token_hash")) {
    throw new VaultKeyLifecycleError("invalid_installation_config");
  }
  const rows = db
    .prepare(
      "SELECT token, user_id, expires_at, created_at FROM main.client_access_tokens",
    )
    .all() as Array<{
    token: string;
    user_id: string;
    expires_at: string;
    created_at: string;
  }>;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE main.__account_auth_client_access_tokens_v2 (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    const insert = db.prepare(
      `INSERT INTO main.__account_auth_client_access_tokens_v2
         (token_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    for (const row of rows) {
      insert.run(
        clientAccessTokenHashV2(db, row.token),
        row.user_id,
        row.expires_at,
        row.created_at,
      );
    }
    db.exec(`
      DROP TABLE main.client_access_tokens;
      ALTER TABLE main.__account_auth_client_access_tokens_v2
        RENAME TO client_access_tokens;
    `);
    db.exec("COMMIT");
    return rows.length;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function legacyOwnerDek(
  row: {
    wrapped_user_key: unknown;
    wrapped_user_key_iv: unknown;
    wrapped_user_key_tag: unknown;
  },
  legacyMasterKey: Buffer,
): Buffer {
  if (
    typeof row.wrapped_user_key !== "string" ||
    typeof row.wrapped_user_key_iv !== "string" ||
    typeof row.wrapped_user_key_tag !== "string"
  ) {
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  const encoded = decryptText(
    {
      ciphertext: row.wrapped_user_key,
      iv: row.wrapped_user_key_iv,
      tag: row.wrapped_user_key_tag,
    },
    legacyMasterKey,
  );
  const dek = Buffer.from(encoded, "base64");
  if (dek.length !== 32 || dek.toString("base64") !== encoded) {
    dek.fill(0);
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  return dek;
}

function ensureOwnerKeyring(
  db: DatabaseSync,
  owner: {
    id: string;
    wrapped_user_key: unknown;
    wrapped_user_key_iv: unknown;
    wrapped_user_key_tag: unknown;
    created_at: string;
  },
  context: VaultMasterKeyContextV2,
  legacyMasterKey: Buffer,
): string {
  const existing = listUserVaultKeysV2(db, owner.id);
  if (existing.length === 0) {
    const dek = legacyOwnerDek(owner, legacyMasterKey);
    try {
      importLegacyUserDekIntoVaultKeyringV2({
        db,
        ownerUserId: owner.id,
        context,
        legacyDek: dek,
        createdAt: owner.created_at,
      });
    } finally {
      dek.fill(0);
    }
  }
  const active = resolveActiveUserVaultKeyV2({
    db,
    ownerUserId: owner.id,
    context,
  });
  try {
    return active.keyId;
  } finally {
    active.dek.fill(0);
  }
}

function setOwnerMigration(
  db: DatabaseSync,
  userId: string,
  phase: "migrating" | "blocked" | "complete",
  encryptedCellCount: number,
): void {
  db.prepare(
    `INSERT INTO main.account_auth_vault_migrations
       (user_id, contract_version, phase, encrypted_cell_count, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       contract_version = excluded.contract_version,
       phase = excluded.phase,
       encrypted_cell_count = excluded.encrypted_cell_count,
       updated_at = excluded.updated_at`,
  ).run(
    userId,
    ACCOUNT_AUTH_VAULT_CONTRACT_VERSION_V2,
    phase,
    encryptedCellCount,
    new Date().toISOString(),
  );
}

function migrateOwnerUserRow(args: {
  db: DatabaseSync;
  owner: Record<string, SqliteValue> & {
    id: string;
    wrapped_user_key: string;
    wrapped_user_key_iv: string;
    wrapped_user_key_tag: string;
    created_at: string;
  };
  context: VaultMasterKeyContextV2;
  activeKeyId: string;
}): number {
  const privateColumns = privateUserColumns(args.db);
  const updates: Array<{ column: string; value: Buffer }> = [];
  let encryptedCellCount = 0;
  let loginIdentity: string | null = null;

  for (const column of privateColumns) {
    const stored = args.owner[column.name];
    if (stored === null) continue;
    if (stored instanceof Uint8Array) {
      const envelope = parseVaultEnvelopeV2(stored);
      const plaintext = decryptUserVaultContentForMigrationV2({
        db: args.db,
        ownerUserId: args.owner.id,
        context: args.context,
        migrationContext: VAULT_KEYRING_MIGRATION_CONTEXT_V2,
        logicalTable: "users",
        logicalColumn: column.name,
        stableRowId: args.owner.id,
        serializedEnvelope: stored,
      });
      const decoded = decodeSqliteValue(plaintext);
      if (column.name === "email") {
        if (typeof decoded !== "string") {
          throw new VaultEnvelopeMalformedError("invalid_input");
        }
        loginIdentity = decoded;
      }
      if (envelope.keyId !== args.activeKeyId) {
        updates.push({
          column: column.name,
          value: encryptUserVaultContentV2({
            db: args.db,
            ownerUserId: args.owner.id,
            context: args.context,
            logicalTable: "users",
            logicalColumn: column.name,
            stableRowId: args.owner.id,
            plaintext,
          }),
        });
      }
      continue;
    }
    if (column.name === "email") {
      if (typeof stored !== "string") {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      loginIdentity = stored;
    }
    updates.push({
      column: column.name,
      value: encryptUserVaultContentV2({
        db: args.db,
        ownerUserId: args.owner.id,
        context: args.context,
        logicalTable: "users",
        logicalColumn: column.name,
        stableRowId: args.owner.id,
        plaintext: encodeSqliteValue(stored),
      }),
    });
    encryptedCellCount += 1;
  }

  if (!loginIdentity) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  const assignments = [
    ...updates.map(({ column }) => `${quoteIdentifier(column)} = ?`),
    "login_identity_blind_index = ?",
  ];
  args.db
    .prepare(
      `UPDATE main.users SET ${assignments.join(", ")} WHERE id = ?`,
    )
    .run(
      ...updates.map(({ value }) => value),
      loginIdentityBlindIndexV2(args.db, loginIdentity),
      args.owner.id,
    );
  return encryptedCellCount;
}

function migrateOwners(
  db: DatabaseSync,
  context: VaultMasterKeyContextV2,
  masterSecret: string,
): { ownerCount: number; encryptedCellCount: number } {
  const columns = userColumns(db).map((column) => quoteIdentifier(column.name));
  const owners = db
    .prepare(`SELECT ${columns.join(", ")} FROM main.users ORDER BY id`)
    .all() as unknown as Array<
    Record<string, SqliteValue> & {
      id: string;
      wrapped_user_key: string;
      wrapped_user_key_iv: string;
      wrapped_user_key_tag: string;
      created_at: string;
    }
  >;
  const legacyMasterKey = deriveMasterKey(masterSecret);
  let encryptedCellCount = 0;
  try {
    for (const owner of owners) {
      setOwnerMigration(db, owner.id, "migrating", 0);
      try {
        const activeKeyId = ensureOwnerKeyring(
          db,
          owner,
          context,
          legacyMasterKey,
        );
        const encrypted = migrateOwnerUserRow({
          db,
          owner,
          context,
          activeKeyId,
        });
        encryptedCellCount += encrypted;
        setOwnerMigration(db, owner.id, "complete", encrypted);
      } catch (error) {
        setOwnerMigration(db, owner.id, "blocked", 0);
        throw error;
      }
    }
  } finally {
    legacyMasterKey.fill(0);
  }
  return { ownerCount: owners.length, encryptedCellCount };
}

function sealUserValue(
  db: DatabaseSync,
  runtime: AccountAuthRuntime,
  ownerUserId: SqliteValue,
  column: SqliteValue,
  value: SqliteValue,
): Buffer | null {
  if (value === null) return null;
  if (
    typeof ownerUserId !== "string" ||
    typeof column !== "string" ||
    PUBLIC_USER_COLUMNS.has(column) ||
    !privateUserColumns(db).some((item) => item.name === column)
  ) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  return encryptUserVaultContentV2({
    db,
    ownerUserId,
    context: runtime.context,
    logicalTable: "users",
    logicalColumn: column,
    stableRowId: ownerUserId,
    plaintext: encodeSqliteValue(value),
  });
}

function openUserValue(
  db: DatabaseSync,
  runtime: AccountAuthRuntime,
  ownerUserId: SqliteValue,
  column: SqliteValue,
  value: SqliteValue,
): SqliteValue {
  if (value === null) return null;
  if (
    typeof ownerUserId !== "string" ||
    typeof column !== "string" ||
    PUBLIC_USER_COLUMNS.has(column) ||
    !(value instanceof Uint8Array) ||
    !privateUserColumns(db).some((item) => item.name === column)
  ) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  return decodeSqliteValue(
    decryptUserVaultContentV2({
      db,
      ownerUserId,
      context: runtime.context,
      logicalTable: "users",
      logicalColumn: column,
      stableRowId: ownerUserId,
      serializedEnvelope: value,
    }),
  );
}

function registerRuntimeFunctions(
  db: DatabaseSync,
  runtime: AccountAuthRuntime,
): void {
  if (runtime.functionsRegistered) return;
  db.function(
    ACCOUNT_USER_SEAL_FUNCTION,
    (ownerUserId: SqliteValue, column: SqliteValue, value: SqliteValue) =>
      sealUserValue(db, runtime, ownerUserId, column, value),
  );
  db.function(
    ACCOUNT_USER_OPEN_FUNCTION,
    (ownerUserId: SqliteValue, column: SqliteValue, value: SqliteValue) =>
      openUserValue(db, runtime, ownerUserId, column, value),
  );
  db.function(ACCOUNT_LOGIN_INDEX_FUNCTION, (identity: SqliteValue) => {
    if (typeof identity !== "string") {
      throw new VaultKeyLifecycleError("invalid_content_binding");
    }
    return loginIdentityBlindIndexV2(db, identity);
  });
  runtime.functionsRegistered = true;
}

function installChangeCountCompatibility(
  db: DatabaseSync,
  runtime: AccountAuthRuntime,
): void {
  if (runtime.prepareWrapped) return;
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS account_auth_change_counter (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      value INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO account_auth_change_counter (singleton, value)
    VALUES (1, 0);
  `);
  const originalPrepare = db.prepare.bind(db);
  const reset = originalPrepare(
    "UPDATE temp.account_auth_change_counter SET value = 0 WHERE singleton = 1",
  );
  const read = originalPrepare(
    "SELECT value FROM temp.account_auth_change_counter WHERE singleton = 1",
  );
  const wrappedPrepare = (sql: string): StatementSync => {
    const statement = originalPrepare(sql);
    return new Proxy(statement, {
      get(target, property) {
        if (property === "run") {
          return (...params: Parameters<StatementSync["run"]>) => {
            reset.run();
            const result = target.run(...params);
            const counted = read.get() as { value: number };
            return counted.value > 0
              ? { ...result, changes: counted.value }
              : result;
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
  Object.defineProperty(db, "prepare", {
    configurable: true,
    value: wrappedPrepare,
    writable: false,
  });
  runtime.prepareWrapped = true;
}

function userUpdateTriggerName(column: string): string {
  return `account_auth_users_update_${column}`;
}

export function suspendAccountAuthVaultViewV2(db: DatabaseSync): boolean {
  const runtime = RUNTIMES.get(db);
  if (!runtime?.viewInstalled) return false;
  db.exec(
    `DROP TRIGGER IF EXISTS temp.${quoteIdentifier(ACCOUNT_USER_UPDATE_TRIGGER)}`,
  );
  // Remove triggers from the abandoned per-column prototype as well so a
  // resumed process cannot double-apply an UPDATE.
  for (const column of userColumns(db)) {
    db.exec(
      `DROP TRIGGER IF EXISTS temp.${quoteIdentifier(userUpdateTriggerName(column.name))}`,
    );
  }
  db.exec("DROP TRIGGER IF EXISTS temp.account_auth_users_delete");
  db.exec("DROP VIEW IF EXISTS temp.users");
  runtime.viewInstalled = false;
  return true;
}

export function installAccountAuthVaultViewV2(db: DatabaseSync): void {
  const runtime = RUNTIMES.get(db);
  if (!runtime) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  if (runtime.viewInstalled) return;
  registerRuntimeFunctions(db, runtime);
  installChangeCountCompatibility(db, runtime);
  const columns = userColumns(db);
  const selectColumns = columns.map((column) => {
    const quoted = quoteIdentifier(column.name);
    return PUBLIC_USER_COLUMNS.has(column.name)
      ? quoted
      : `${ACCOUNT_USER_OPEN_FUNCTION}(id, ${quoteLiteral(column.name)}, ${quoted}) AS ${quoted}`;
  });
  db.exec(
    `CREATE TEMP VIEW ${quoteIdentifier("users")} AS SELECT ${selectColumns.join(", ")} FROM main.users`,
  );

  const updateAssignments = columns
    .filter(
      (column) =>
        column.name !== "id" && column.name !== "login_identity_blind_index",
    )
    .map((column) => {
    const quoted = quoteIdentifier(column.name);
    if (column.name === "email") {
      return `${quoted} = CASE WHEN NEW.${quoted} IS OLD.${quoted}
        THEN (SELECT ${quoted} FROM main.users WHERE id = OLD.id)
        ELSE ${ACCOUNT_USER_SEAL_FUNCTION}(OLD.id, ${quoteLiteral(column.name)}, NEW.${quoted}) END`;
    }
      if (PUBLIC_USER_COLUMNS.has(column.name)) {
        return `${quoted} = NEW.${quoted}`;
      }
      return `${quoted} = CASE WHEN NEW.${quoted} IS OLD.${quoted}
        THEN (SELECT ${quoted} FROM main.users WHERE id = OLD.id)
        ELSE ${ACCOUNT_USER_SEAL_FUNCTION}(OLD.id, ${quoteLiteral(column.name)}, NEW.${quoted}) END`;
    });
  updateAssignments.push(
    `login_identity_blind_index = CASE WHEN NEW.email IS OLD.email
      THEN OLD.login_identity_blind_index
      ELSE ${ACCOUNT_LOGIN_INDEX_FUNCTION}(NEW.email) END`,
  );
  db.exec(`
    CREATE TEMP TRIGGER ${quoteIdentifier(ACCOUNT_USER_UPDATE_TRIGGER)}
    INSTEAD OF UPDATE ON users
    BEGIN
      SELECT CASE WHEN NEW.id IS NOT OLD.id
        THEN RAISE(ABORT, 'Account identity metadata is immutable.') END;
      SELECT CASE
        WHEN NEW.login_identity_blind_index IS NOT OLD.login_identity_blind_index
        THEN RAISE(ABORT, 'Account identity metadata is immutable.') END;
      UPDATE main.users
         SET ${updateAssignments.join(", ")}
       WHERE id = OLD.id;
      UPDATE account_auth_change_counter
         SET value = value + changes()
       WHERE singleton = 1;
    END
  `);

  db.exec(`
    CREATE TEMP TRIGGER account_auth_users_delete
    INSTEAD OF DELETE ON users
    BEGIN
      DELETE FROM main.users WHERE id = OLD.id;
      UPDATE account_auth_change_counter
         SET value = value + changes()
       WHERE singleton = 1;
    END
  `);
  runtime.viewInstalled = true;
}

function finalizeLegacyPageScrub(db: DatabaseSync): void {
  // `secure_delete` is enabled before any legacy plaintext is rewritten.
  // Truncating the WAL then removes the final recoverable copy without a
  // whole-database VACUUM on the synchronous startup path.
  db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
}

function tokenTablesAreHashed(db: DatabaseSync): boolean {
  const sessions = tokenTableColumns(db, "sessions");
  const clients = tokenTableColumns(db, "client_access_tokens");
  return (
    sessions.has("token_hash") &&
    !sessions.has("token") &&
    clients.has("token_hash") &&
    !clients.has("token")
  );
}

export function accountAuthVaultContractIsCompleteV2(db: DatabaseSync): boolean {
  try {
    const state = db
      .prepare(
        "SELECT contract_version FROM main.account_auth_vault_state WHERE singleton = 1",
      )
      .get() as { contract_version?: number } | undefined;
    if (
      state?.contract_version !== ACCOUNT_AUTH_VAULT_CONTRACT_VERSION_V2 ||
      !tokenTablesAreHashed(db)
    ) {
      return false;
    }
    const ownerCount = Number(
      (db.prepare("SELECT COUNT(*) AS count FROM main.users").get() as { count: number })
        .count,
    );
    const migratedCount = Number(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count
               FROM main.account_auth_vault_migrations
              WHERE contract_version = ? AND phase = 'complete'`,
          )
          .get(ACCOUNT_AUTH_VAULT_CONTRACT_VERSION_V2) as { count: number }
      ).count,
    );
    if (ownerCount !== migratedCount) return false;
    const invalidPredicates = privateUserColumns(db).map(
      (column) => `typeof(${quoteIdentifier(column.name)}) NOT IN ('blob', 'null')`,
    );
    if (invalidPredicates.length > 0) {
      const invalid = db
        .prepare(
          `SELECT 1 AS present FROM main.users WHERE ${invalidPredicates.join(" OR ")} LIMIT 1`,
        )
        .get() as { present?: number } | undefined;
      if (invalid?.present === 1) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function resumeAccountAuthVaultV2(args: {
  db: DatabaseSync;
  masterSecret: string;
}): boolean {
  if (RUNTIMES.has(args.db)) return true;
  ensureAccountAuthVaultStorageSchemaV2(args.db);
  if (!accountAuthVaultContractIsCompleteV2(args.db)) return false;
  const runtime: AccountAuthRuntime = {
    context: deriveVaultMasterKeyContextV2(args.db, args.masterSecret),
    installationKey: unwrapInstallationKey(args.db, args.masterSecret),
    functionsRegistered: false,
    prepareWrapped: false,
    viewInstalled: false,
  };
  RUNTIMES.set(args.db, runtime);
  try {
    installAccountAuthVaultViewV2(args.db);
    return true;
  } catch (error) {
    runtime.installationKey.fill(0);
    RUNTIMES.delete(args.db);
    throw error;
  }
}

export function activateAccountAuthVaultV2(args: {
  db: DatabaseSync;
  masterSecret: string;
}): AccountAuthVaultActivationReportV2 {
  if (RUNTIMES.has(args.db)) {
    return Object.freeze({
      contractVersion: ACCOUNT_AUTH_VAULT_CONTRACT_VERSION_V2,
      migratedOwnerCount: 0,
      encryptedCellCount: 0,
      migratedSessionTokenCount: 0,
      migratedClientAccessTokenCount: 0,
    });
  }
  ensureAccountAuthVaultStorageSchemaV2(args.db);
  if (accountAuthVaultContractIsCompleteV2(args.db)) {
    resumeAccountAuthVaultV2(args);
    return Object.freeze({
      contractVersion: ACCOUNT_AUTH_VAULT_CONTRACT_VERSION_V2,
      migratedOwnerCount: 0,
      encryptedCellCount: 0,
      migratedSessionTokenCount: 0,
      migratedClientAccessTokenCount: 0,
    });
  }
  if (args.db.isTransaction) {
    throw new VaultKeyLifecycleError("transaction_conflict");
  }
  const runtime: AccountAuthRuntime = {
    context: deriveVaultMasterKeyContextV2(args.db, args.masterSecret),
    installationKey: loadOrCreateInstallationKey(args.db, args.masterSecret),
    functionsRegistered: false,
    prepareWrapped: false,
    viewInstalled: false,
  };
  RUNTIMES.set(args.db, runtime);
  try {
    // This must precede table replacement and encrypted cell updates so SQLite
    // overwrites freed payload bytes instead of leaving identity/token text in
    // freelist pages. A post-migration VACUUM is intentionally unnecessary.
    args.db.exec("PRAGMA secure_delete = ON");
    const migratedSessionTokenCount = migrateSessionTokenTable(args.db);
    const migratedClientAccessTokenCount = migrateClientAccessTokenTable(args.db);
    const owners = migrateOwners(args.db, runtime.context, args.masterSecret);
    args.db.prepare(
      `INSERT INTO main.account_auth_vault_state
         (singleton, contract_version, completed_at)
       VALUES (1, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         contract_version = excluded.contract_version,
         completed_at = excluded.completed_at`,
    ).run(
      ACCOUNT_AUTH_VAULT_CONTRACT_VERSION_V2,
      new Date().toISOString(),
    );
    if (
      owners.encryptedCellCount > 0 ||
      migratedSessionTokenCount > 0 ||
      migratedClientAccessTokenCount > 0
    ) {
      finalizeLegacyPageScrub(args.db);
    }
    installAccountAuthVaultViewV2(args.db);
    return Object.freeze({
      contractVersion: ACCOUNT_AUTH_VAULT_CONTRACT_VERSION_V2,
      migratedOwnerCount: owners.ownerCount,
      encryptedCellCount: owners.encryptedCellCount,
      migratedSessionTokenCount,
      migratedClientAccessTokenCount,
    });
  } catch (error) {
    runtime.installationKey.fill(0);
    RUNTIMES.delete(args.db);
    throw error;
  }
}

export function accountAuthVaultIsActiveV2(db: DatabaseSync): boolean {
  return RUNTIMES.get(db)?.viewInstalled === true;
}

let accountAuthSchemaSavepointSequence = 0;

/**
 * Adds a private account column without ever exposing its default value as
 * durable plaintext after Account Auth Vault activation. The schema change and
 * per-owner sealing happen in one SQLite transaction, then the compatibility
 * view is rebuilt so subsequent application SQL continues to see clear values.
 */
export function addAccountAuthPrivateUserColumnV2(args: {
  db: DatabaseSync;
  columnName: string;
  columnDefinition: string;
}): boolean {
  if (
    !SQLITE_IDENTIFIER.test(args.columnName) ||
    PUBLIC_USER_COLUMNS.has(args.columnName)
  ) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  const definition = args.columnDefinition.trim();
  if (
    definition.length === 0 ||
    definition.length > 1_024 ||
    /[;\0]/u.test(definition) ||
    definition.includes("--") ||
    definition.includes("/*") ||
    definition.includes("*/")
  ) {
    throw new TypeError("Account Auth Vault column definition is invalid.");
  }
  if (userColumns(args.db).some((column) => column.name === args.columnName)) {
    return false;
  }

  const runtime = RUNTIMES.get(args.db);
  const viewWasInstalled = runtime?.viewInstalled === true;
  if (viewWasInstalled) suspendAccountAuthVaultViewV2(args.db);

  const nested = args.db.isTransaction;
  const savepoint = `prism_account_auth_schema_${++accountAuthSchemaSavepointSequence}`;
  if (nested) args.db.exec(`SAVEPOINT ${savepoint}`);
  else args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db.exec(
      `ALTER TABLE main.users ADD COLUMN ${quoteIdentifier(args.columnName)} ${definition}`,
    );
    if (runtime) {
      registerRuntimeFunctions(args.db, runtime);
      args.db.exec(
        `UPDATE main.users
            SET ${quoteIdentifier(args.columnName)} = ${ACCOUNT_USER_SEAL_FUNCTION}(
              id,
              ${quoteLiteral(args.columnName)},
              ${quoteIdentifier(args.columnName)}
            )
          WHERE ${quoteIdentifier(args.columnName)} IS NOT NULL`,
      );
    }
    if (nested) args.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    else args.db.exec("COMMIT");
  } catch (error) {
    if (nested) {
      try {
        args.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      } finally {
        args.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      }
    } else if (args.db.isTransaction) {
      args.db.exec("ROLLBACK");
    }
    if (viewWasInstalled) installAccountAuthVaultViewV2(args.db);
    throw error;
  }

  if (viewWasInstalled) installAccountAuthVaultViewV2(args.db);
  return true;
}

let accountOwnerSavepointSequence = 0;

function withAccountOwnerTransaction<T>(db: DatabaseSync, operation: () => T): T {
  const nested = db.isTransaction;
  const savepoint = `prism_account_owner_${++accountOwnerSavepointSequence}`;
  if (nested) db.exec(`SAVEPOINT ${savepoint}`);
  else db.exec("BEGIN IMMEDIATE");
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

function defaultColumnValue(db: DatabaseSync, column: UserColumnInfo): SqliteValue {
  if (column.dflt_value === null) {
    if (column.notnull === 1) {
      throw new VaultKeyLifecycleError("invalid_installation_config");
    }
    return null;
  }
  const row = db.prepare(`SELECT ${column.dflt_value} AS value`).get() as {
    value: SqliteValue;
  };
  return row.value;
}

export function createEncryptedAccountOwnerV2(
  args: CreateEncryptedAccountOwnerV2Args,
): { ownerUserId: string; keyId: string } {
  const runtime = RUNTIMES.get(args.db);
  if (!runtime?.viewInstalled) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  if (!(args.userDek instanceof Uint8Array) || args.userDek.length !== 32) {
    throw new VaultKeyLifecycleError("invalid_dek");
  }
  const normalizedIdentity = normalizeLoginIdentityV2(args.loginIdentity);
  const columns = userColumns(args.db);
  const privateNames = new Set(
    columns
      .filter((column) => !PUBLIC_USER_COLUMNS.has(column.name))
      .map((column) => column.name),
  );
  for (const key of Object.keys(args.initialPrivateValues ?? {})) {
    if (!privateNames.has(key)) {
      throw new TypeError("Initial account setting is not Vault-owned.");
    }
  }
  const keyId = generateVaultKeyIdV2();
  const metadataValues: Record<string, SqliteValue> = {
    id: args.ownerUserId,
    password_hash: args.passwordHash,
    password_salt: args.passwordSalt,
    wrapped_user_key: args.wrappedUserKey,
    wrapped_user_key_iv: args.wrappedUserKeyIv,
    wrapped_user_key_tag: args.wrappedUserKeyTag,
    login_identity_blind_index: loginIdentityBlindIndexV2(
      args.db,
      normalizedIdentity,
    ),
    created_at: args.createdAt,
    last_active_at: args.createdAt,
  };
  const privateInputs: Record<string, SqliteValue> = {
    ...(args.initialPrivateValues ?? {}),
    email: normalizedIdentity,
    display_name: args.displayName,
  };

  return withAccountOwnerTransaction(args.db, () => {
    const storedValues = columns.map((column): SqliteValue => {
      if (PUBLIC_USER_COLUMNS.has(column.name)) {
        const value = metadataValues[column.name];
        if (value === undefined) {
          throw new VaultKeyLifecycleError("invalid_installation_config");
        }
        return value;
      }
      const plaintext = Object.hasOwn(privateInputs, column.name)
        ? privateInputs[column.name]
        : defaultColumnValue(args.db, column);
      if (plaintext === null) return null;
      return encryptVaultContentV2({
        plaintext: encodeSqliteValue(plaintext),
        dek: Buffer.from(args.userDek),
        keyId,
        binding: {
          ownerUserId: args.ownerUserId,
          logicalTable: "users",
          logicalColumn: column.name,
          stableRowId: args.ownerUserId,
        },
      });
    });
    const placeholders = columns.map(() => "?").join(", ");
    args.db
      .prepare(
        `INSERT INTO main.users (${columns
          .map((column) => quoteIdentifier(column.name))
          .join(", ")}) VALUES (${placeholders})`,
      )
      .run(...storedValues);
    importLegacyUserDekIntoVaultKeyringV2({
      db: args.db,
      ownerUserId: args.ownerUserId,
      context: runtime.context,
      legacyDek: args.userDek,
      keyId,
      createdAt: args.createdAt,
    });
    setOwnerMigration(
      args.db,
      args.ownerUserId,
      "complete",
      storedValues.filter((value) => value instanceof Uint8Array).length,
    );
    return Object.freeze({ ownerUserId: args.ownerUserId, keyId });
  });
}

export function rotateAccountOwnerVaultDekV2(args: {
  db: DatabaseSync;
  ownerUserId: string;
  rotatedAt?: string;
}): UserVaultKeyRotationV2 {
  const runtime = RUNTIMES.get(args.db);
  if (!runtime?.viewInstalled) {
    throw new VaultKeyLifecycleError("invalid_master_key_context");
  }
  return withAccountOwnerTransaction(args.db, () => {
    const columns = privateUserColumns(args.db);
    const row = args.db
      .prepare(
        `SELECT ${columns.map((column) => quoteIdentifier(column.name)).join(", ")}
           FROM main.users WHERE id = ?`,
      )
      .get(args.ownerUserId) as Record<string, SqliteValue> | undefined;
    if (!row) throw new VaultKeyLifecycleError("owner_not_found");
    const plaintext = new Map<string, Buffer | null>();
    for (const column of columns) {
      const stored = row[column.name];
      if (stored === null) {
        plaintext.set(column.name, null);
      } else if (stored instanceof Uint8Array) {
        plaintext.set(
          column.name,
          decryptUserVaultContentForMigrationV2({
            db: args.db,
            ownerUserId: args.ownerUserId,
            context: runtime.context,
            migrationContext: VAULT_KEYRING_MIGRATION_CONTEXT_V2,
            logicalTable: "users",
            logicalColumn: column.name,
            stableRowId: args.ownerUserId,
            serializedEnvelope: stored,
          }),
        );
      } else {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
    }
    const rotation = rotateUserVaultDekV2({
      db: args.db,
      ownerUserId: args.ownerUserId,
      context: runtime.context,
      rotatedAt: args.rotatedAt,
    });
    const assignments = columns.map(
      (column) => `${quoteIdentifier(column.name)} = ?`,
    );
    args.db
      .prepare(
        `UPDATE main.users SET ${assignments.join(", ")} WHERE id = ?`,
      )
      .run(
        ...columns.map((column) => {
          const value = plaintext.get(column.name);
          return value === null
            ? null
            : encryptUserVaultContentV2({
                db: args.db,
                ownerUserId: args.ownerUserId,
                context: runtime.context,
                logicalTable: "users",
                logicalColumn: column.name,
                stableRowId: args.ownerUserId,
                plaintext: value!,
              });
        }),
        args.ownerUserId,
      );
    return rotation;
  });
}

export function rewrapAccountAuthInstallationKeyV2(args: {
  db: DatabaseSync;
  oldMasterSecret: string;
  newMasterSecret: string;
}): void {
  const installationKey = unwrapInstallationKey(args.db, args.oldMasterSecret);
  try {
    const wrapped = wrapInstallationKey(
      args.db,
      installationKey,
      args.newMasterSecret,
    );
    const updated = args.db
      .prepare(
        `UPDATE main.account_auth_installation_key
            SET wrapped_key_ciphertext = ?, wrapped_key_nonce = ?,
                wrapped_key_tag = ?, wrap_version = ?
          WHERE singleton = 1`,
      )
      .run(
        wrapped.ciphertext,
        wrapped.nonce,
        wrapped.tag,
        INSTALLATION_KEY_WRAP_VERSION,
      ) as { changes?: number | bigint };
    if (Number(updated.changes ?? 0) !== 1) {
      throw new VaultKeyLifecycleError("transaction_conflict");
    }
  } finally {
    installationKey.fill(0);
  }
}
