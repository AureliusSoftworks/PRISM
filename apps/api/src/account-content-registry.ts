import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  assertAccountOwnerRelationCoverage,
  inspectAccountContentIdColumns,
  inspectAccountContentOwnerRelations,
  type AccountContentIdColumnInventoryEntry,
  type AccountContentOwnerRelation,
  type AccountOwnerRelationCoverage,
} from "./account-owner-boundaries.ts";

export const ACCOUNT_CONTENT_REGISTRY_VERSION = 4 as const;

/**
 * This is a release guard, not an encryption claim. A matching registry proves
 * that the audited storage shape is still known; it does not prove that any
 * account payload is encrypted, correctly keyed, or absent from plaintext.
 */
export const ACCOUNT_CONTENT_REGISTRY_BOUNDARY = Object.freeze({
  proves:
    "The current storage shape is registered and schema drift fails closed before release.",
  doesNotProve:
    "Encryption, owner-key correctness, migration completeness, or zero plaintext in a running installation.",
});

export type AccountContentClass =
  | "account-record-or-derived-content"
  | "identity-credential-and-settings"
  | "derived-search-index"
  | "derived-btree-index"
  | "persistent-binary-or-serialized-content"
  | "runtime-account-content"
  | "backup-export-content"
  | "diagnostic-account-content"
  | "structural-non-content-metadata";

export type CurrentProtectionState =
  | "legacy-plaintext-or-mixed"
  | "plaintext-derived-index"
  | "mixed-binary-and-metadata"
  | "vault-v2-keyring-metadata-and-wrapped-deks"
  | "vault-v2-account-auth-ciphertext-and-blind-indexes"
  | "keyed-hash-only"
  | "vault-v2-owner-file-root"
  | "process-memory-only"
  | "consumer-controlled-after-export"
  | "not-account-content";

export interface AccountContentRegistryFields {
  ownerSource: string;
  contentClass: AccountContentClass;
  currentProtection: CurrentProtectionState;
  plannedVaultGate: string;
  cleanupResponsibility: string;
}

export interface SqliteAccountContentColumnEntry
  extends AccountContentRegistryFields {
  surfaceId: string;
  table: string;
  column: string;
}

export interface SqliteDerivativeIndexEntry
  extends AccountContentRegistryFields {
  surfaceId: string;
  index: string;
  table: string;
}

export interface PersistentAccountContentSurface
  extends AccountContentRegistryFields {
  surfaceId: string;
  surfaceKind:
    | "sqlite-files"
    | "qdrant"
    | "filesystem"
    | "browser-local-storage"
    | "browser-session-storage"
    | "browser-indexed-db"
    | "runtime-queue-cache"
    | "logs-diagnostics"
    | "backup-export";
  locator: string;
}

export interface AuditedStructuralMetadataEntry
  extends AccountContentRegistryFields {
  surfaceId: string;
  fields: readonly string[];
  auditReason: string;
}

export interface ObservedSqliteSchema {
  fingerprint: string;
  tableCount: number;
  columnCount: number;
  indexCount: number;
  triggerCount: number;
  tables: readonly ObservedSqliteTable[];
  indexes: readonly ObservedSqliteIndex[];
  triggers: readonly { name: string; table: string; sql: string }[];
}

interface ObservedSqliteColumn {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
  hidden: number;
}

interface ObservedForeignKey {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
  on_update: string;
  on_delete: string;
  match: string;
}

interface ObservedSqliteTable {
  name: string;
  columns: readonly ObservedSqliteColumn[];
  foreignKeys: readonly ObservedForeignKey[];
}

interface ObservedSqliteIndexColumn {
  seqno: number;
  cid: number;
  name: string | null;
  desc: number;
  coll: string | null;
  key: number;
}

interface ObservedSqliteIndex {
  name: string;
  table: string;
  columns: readonly ObservedSqliteIndexColumn[];
}

const AUDITED_SQLITE_SCHEMA = Object.freeze({
  fingerprint: "0f83ec84f5bbdb33b737ad3af46b11adf3d7e16086b5e292f2322f81da998cad",
  tableCount: 166,
  columnCount: 2_019,
  indexCount: 382,
  triggerCount: 577,
});

/**
 * Exact, audited structural metadata exclusions. The only application table
 * here is the bounded, singleton Vault installation KDF configuration; it
 * contains a nonsecret random salt and version, never account data. All other
 * application identifiers, timestamps, status values, and metrics remain
 * vault-gated.
 */
export const AUDITED_STRUCTURAL_METADATA_ALLOWLIST: readonly AuditedStructuralMetadataEntry[] =
  Object.freeze([
    Object.freeze({
      surfaceId: "sqlite.catalog.sqlite-schema",
      fields: Object.freeze(["type", "name", "tbl_name", "rootpage", "sql"]),
      ownerSource: "SQLite engine and schema migration tooling",
      contentClass: "structural-non-content-metadata",
      currentProtection: "not-account-content",
      plannedVaultGate:
        "Outside account Vaults only while this exact allowlist and schema fingerprint match.",
      auditReason: "SQLite schema DDL only; contains no row values.",
      cleanupResponsibility: "SQLite owns the catalog lifecycle.",
    }),
    Object.freeze({
      surfaceId: "sqlite.catalog.sqlite-sequence",
      fields: Object.freeze(["name", "seq"]),
      ownerSource: "SQLite engine",
      contentClass: "structural-non-content-metadata",
      currentProtection: "not-account-content",
      plannedVaultGate:
        "Outside account Vaults only with the exact audited name/seq shape.",
      auditReason:
        "Exact SQLite AUTOINCREMENT bookkeeping only; accepted only with this exact shape.",
      cleanupResponsibility: "SQLite owns sequence cleanup with its table.",
    }),
    Object.freeze({
      surfaceId: "sqlite.pragma.database-header",
      fields: Object.freeze(["application_id", "schema_version", "user_version"]),
      ownerSource: "SQLite engine and schema migration tooling",
      contentClass: "structural-non-content-metadata",
      currentProtection: "not-account-content",
      plannedVaultGate:
        "Outside account Vaults; values are bounded database-format integers only.",
      auditReason: "Database format/version integers only.",
      cleanupResponsibility: "Schema migration tooling owns these header values.",
    }),
    Object.freeze({
      surfaceId: "sqlite.table.vault-installation-config",
      fields: Object.freeze(["singleton", "kdf_salt", "kdf_version"]),
      ownerSource: "PRISM installation; no account owner or account payload",
      contentClass: "structural-non-content-metadata",
      currentProtection: "not-account-content",
      plannedVaultGate:
        "Outside account Vaults only with the exact singleton, 32-byte nonsecret salt, and bounded KDF-version shape.",
      auditReason:
        "Installation-local KDF parameters only; the salt is random but explicitly nonsecret and contains no account content.",
      cleanupResponsibility:
        "Installation lifecycle and future master-KDF migration own this singleton.",
    }),
    Object.freeze({
      surfaceId: "sqlite.table.account-auth-installation-key",
      fields: Object.freeze([
        "singleton",
        "wrapped_key_ciphertext",
        "wrapped_key_nonce",
        "wrapped_key_tag",
        "wrap_version",
        "created_at",
      ]),
      ownerSource: "PRISM installation; no account owner or account payload",
      contentClass: "structural-non-content-metadata",
      currentProtection: "not-account-content",
      plannedVaultGate:
        "Outside account Vaults only as a wrapped random installation key with authenticated master-key binding.",
      auditReason:
        "Wrapped installation cryptographic key material and lifecycle metadata only; never an account value or raw bearer token.",
      cleanupResponsibility:
        "Installation master rewrap and installation deletion own this singleton.",
    }),
    Object.freeze({
      surfaceId: "sqlite.table.account-auth-vault-state",
      fields: Object.freeze(["singleton", "contract_version", "completed_at"]),
      ownerSource: "PRISM installation; no account owner or account payload",
      contentClass: "structural-non-content-metadata",
      currentProtection: "not-account-content",
      plannedVaultGate:
        "Outside account Vaults only as bounded migration version/completion metadata.",
      auditReason:
        "Installation-wide Auth Vault migration state only; contains no account identity or content.",
      cleanupResponsibility:
        "Auth Vault migration and installation deletion own this singleton.",
    }),
  ]);

const SQLITE_SEQUENCE_COLUMNS = Object.freeze(["name", "seq"] as const);
const FTS_TABLES = new Set([
  "image_asset_search",
  "image_asset_search_config",
  "image_asset_search_content",
  "image_asset_search_data",
  "image_asset_search_docsize",
  "image_asset_search_idx",
]);
const INSTALLATION_METADATA_TABLES = new Set([
  "vault_installation_config",
  "account_auth_installation_key",
  "account_auth_vault_state",
]);

const INDIRECT_OWNER_SOURCES: Readonly<Record<string, string>> = Object.freeze({
  image_asset_magenta_revision_items:
    "revision_id -> image_asset_magenta_revisions.user_id",
  image_asset_search_config: "FTS5 image_asset_search catalog (user_id in source rows)",
  image_asset_search_content: "FTS5 rowid -> image_asset_search.user_id",
  image_asset_search_data: "FTS5 rowid -> image_asset_search.user_id",
  image_asset_search_docsize: "FTS5 rowid -> image_asset_search.user_id",
  image_asset_search_idx: "FTS5 segment -> image_asset_search.user_id",
  image_asset_set_items: "set_id -> image_asset_sets.user_id",
});

const VAULT_GATE =
  "Resolve the owning account before read/write, then require that account's Vault gate.";
const ACCOUNT_CLEANUP =
  "Owner-scoped migration, factory reset, account deletion, and failed-migration rollback cleanup.";

function sqliteOwnerSource(table: ObservedSqliteTable): string {
  if (INSTALLATION_METADATA_TABLES.has(table.name)) {
    return "PRISM installation; no account owner or account payload";
  }
  if (table.name === "users") return "users.id";
  if (table.columns.some((column) => column.name === "user_id")) {
    return `${table.name}.user_id`;
  }
  const indirect = INDIRECT_OWNER_SOURCES[table.name];
  if (indirect) return indirect;
  throw new AccountContentSchemaDriftError("A table has no audited owner source.");
}

function sqliteColumnRegistryFields(
  table: ObservedSqliteTable,
): AccountContentRegistryFields {
  if (INSTALLATION_METADATA_TABLES.has(table.name)) {
    return {
      ownerSource: sqliteOwnerSource(table),
      contentClass: "structural-non-content-metadata",
      currentProtection: "not-account-content",
      plannedVaultGate:
        "Outside account Vaults only while the exact audited installation-cryptography shape matches.",
      cleanupResponsibility:
        "Installation lifecycle and authenticated master-key migration own this singleton.",
    };
  }
  if (table.name === "user_vault_keys") {
    return {
      ownerSource: "user_vault_keys.user_id -> users.id",
      contentClass: "identity-credential-and-settings",
      currentProtection: "vault-v2-keyring-metadata-and-wrapped-deks",
      plannedVaultGate:
        "Resolve user_id first; unwrap only that owner's selected key with owner/key-bound AAD and an authenticated installation master context.",
      cleanupResponsibility:
        "Account deletion cascades the keyring; rotation, rewrap, and gated migration own key-state changes.",
    };
  }
  if (table.name === "users") {
    return {
      ownerSource: "users.id",
      contentClass: "identity-credential-and-settings",
      currentProtection:
        "vault-v2-account-auth-ciphertext-and-blind-indexes",
      plannedVaultGate:
        "Open identity/settings only through the owner-bound Auth Vault view; login uses the installation-keyed blind index.",
      cleanupResponsibility:
        "Account deletion, Auth Vault migration, per-owner DEK rotation, and master rewrap own this row.",
    };
  }
  if (table.name === "sessions" || table.name === "client_access_tokens") {
    return {
      ownerSource: sqliteOwnerSource(table),
      contentClass: "identity-credential-and-settings",
      currentProtection: "keyed-hash-only",
      plannedVaultGate:
        "Only installation-keyed, domain-separated bearer digests may persist; raw tokens remain transient client credentials.",
      cleanupResponsibility:
        "Expiry, revocation, logout, account reset/delete, and Auth Vault migration own token rows.",
    };
  }
  if (table.name === "owner_file_vault_roots") {
    return {
      ownerSource: "owner_file_vault_roots.user_id -> users.id",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "vault-v2-owner-file-root",
      plannedVaultGate:
        "Resolve user_id first; open the root only through that owner's active Vault V2 key and owner/table/column/row AAD.",
      cleanupResponsibility:
        "Account deletion cascades the root; asset-key rewrap and file-envelope migration own rotation.",
    };
  }
  const fts = FTS_TABLES.has(table.name);
  return {
    ownerSource: sqliteOwnerSource(table),
    contentClass:
      fts
          ? "derived-search-index"
          : "account-record-or-derived-content",
    currentProtection: fts
      ? "plaintext-derived-index"
      : "legacy-plaintext-or-mixed",
    plannedVaultGate: VAULT_GATE,
    cleanupResponsibility: ACCOUNT_CLEANUP,
  };
}

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function observedColumns(db: DatabaseSync, table: string): ObservedSqliteColumn[] {
  return db
    .prepare(`PRAGMA table_xinfo(${quoteSqliteIdentifier(table)})`)
    .all()
    .map((row) => {
      const value = row as Record<string, unknown>;
      return {
        cid: Number(value.cid),
        name: String(value.name),
        type: String(value.type ?? ""),
        notnull: Number(value.notnull),
        dflt_value:
          typeof value.dflt_value === "string" ? value.dflt_value : null,
        pk: Number(value.pk),
        hidden: Number(value.hidden),
      };
    });
}

function observedForeignKeys(
  db: DatabaseSync,
  table: string,
): ObservedForeignKey[] {
  return db
    .prepare(`PRAGMA foreign_key_list(${quoteSqliteIdentifier(table)})`)
    .all()
    .map((row) => {
      const value = row as Record<string, unknown>;
      return {
        id: Number(value.id),
        seq: Number(value.seq),
        table: String(value.table),
        from: String(value.from),
        to: typeof value.to === "string" ? value.to : null,
        on_update: String(value.on_update),
        on_delete: String(value.on_delete),
        match: String(value.match),
      };
    });
}

function observedIndexColumns(
  db: DatabaseSync,
  index: string,
): ObservedSqliteIndexColumn[] {
  return db
    .prepare(`PRAGMA index_xinfo(${quoteSqliteIdentifier(index)})`)
    .all()
    .map((row) => {
      const value = row as Record<string, unknown>;
      return {
        seqno: Number(value.seqno),
        cid: Number(value.cid),
        name: typeof value.name === "string" ? value.name : null,
        desc: Number(value.desc),
        coll: typeof value.coll === "string" ? value.coll : null,
        key: Number(value.key),
      };
    });
}

function exactSqliteSequenceShape(columns: readonly ObservedSqliteColumn[]): boolean {
  return (
    columns.length === SQLITE_SEQUENCE_COLUMNS.length &&
    columns.every((column, index) => column.name === SQLITE_SEQUENCE_COLUMNS[index])
  );
}

export function inspectAccountContentSqliteSchema(
  db: DatabaseSync,
): ObservedSqliteSchema {
  const schemaRows = db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE type IN (?, ?, ?) ORDER BY type, name",
    )
    .all("table", "index", "trigger")
    .map((row) => {
      const value = row as Record<string, unknown>;
      return {
        type: String(value.type),
        name: String(value.name),
        table: String(value.tbl_name),
        sql: typeof value.sql === "string" ? value.sql : "",
      };
    });

  const tables = schemaRows
    .filter((row) => row.type === "table")
    .map((row): ObservedSqliteTable => ({
      name: row.name,
      columns: observedColumns(db, row.name),
      foreignKeys: observedForeignKeys(db, row.name),
    }));
  const sqliteSequence = tables.find((table) => table.name === "sqlite_sequence");
  if (sqliteSequence && !exactSqliteSequenceShape(sqliteSequence.columns)) {
    throw new AccountContentSchemaDriftError(
      "The audited SQLite structural-metadata allowlist no longer matches.",
    );
  }
  const applicationTables = tables.filter((table) => table.name !== "sqlite_sequence");

  const indexes = schemaRows
    .filter((row) => row.type === "index")
    .map(
      (row): ObservedSqliteIndex => ({
        name: row.name,
        table: row.table,
        columns: observedIndexColumns(db, row.name),
      }),
    );
  const triggers = schemaRows
    .filter((row) => row.type === "trigger")
    .map((row) => ({ name: row.name, table: row.table, sql: row.sql }));

  const canonical = JSON.stringify({
    tables: applicationTables,
    indexes,
    triggers,
  });

  return Object.freeze({
    fingerprint: createHash("sha256").update(canonical).digest("hex"),
    tableCount: applicationTables.length,
    columnCount: applicationTables.reduce(
      (count, table) => count + table.columns.length,
      0,
    ),
    indexCount: indexes.length,
    triggerCount: triggers.length,
    tables: Object.freeze(applicationTables),
    indexes: Object.freeze(indexes),
    triggers: Object.freeze(triggers),
  });
}

export class AccountContentSchemaDriftError extends Error {
  readonly code = "account_content_schema_drift";

  constructor(message = "Account-content schema drift requires a registry audit.") {
    super(message);
    this.name = "AccountContentSchemaDriftError";
  }
}

export function assertAccountContentRegistryCoverage(
  db: DatabaseSync,
): ObservedSqliteSchema {
  const observed = inspectAccountContentSqliteSchema(db);
  if (
    observed.fingerprint !== AUDITED_SQLITE_SCHEMA.fingerprint ||
    observed.tableCount !== AUDITED_SQLITE_SCHEMA.tableCount ||
    observed.columnCount !== AUDITED_SQLITE_SCHEMA.columnCount ||
    observed.indexCount !== AUDITED_SQLITE_SCHEMA.indexCount ||
    observed.triggerCount !== AUDITED_SQLITE_SCHEMA.triggerCount
  ) {
    throw new AccountContentSchemaDriftError();
  }
  for (const table of observed.tables) sqliteOwnerSource(table);
  return observed;
}

export const PERSISTENT_ACCOUNT_CONTENT_SURFACES: readonly PersistentAccountContentSurface[] =
  Object.freeze([
    {
      surfaceId: "sqlite.files.main-wal-shm",
      surfaceKind: "sqlite-files",
      locator: "DB_PATH plus sibling -wal and -shm files",
      ownerSource: "SQLite page -> registered table row owner",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "legacy-plaintext-or-mixed",
      plannedVaultGate: VAULT_GATE,
      cleanupResponsibility: ACCOUNT_CLEANUP,
    },
    {
      surfaceId: "qdrant.collection.memories",
      surfaceKind: "qdrant",
      locator: "QDRANT_URL collection memories (vectors and point payloads)",
      ownerSource: "point payload userId -> users.id",
      contentClass: "derived-search-index",
      currentProtection: "plaintext-derived-index",
      plannedVaultGate:
        "Replace plaintext semantic payloads with owner-bound encrypted/blind-index derivatives.",
      cleanupResponsibility:
        "Owner-scoped memory reset/delete and migration rebuild must delete every owner point.",
    },
    {
      surfaceId: "filesystem.localai-data-root",
      surfaceKind: "filesystem",
      locator:
        "Entire resolved dirname(DB_PATH) data tree (LOCALAI_DATA_DIR/default included), including unknown descendants",
      ownerSource: "manifest/SQLite row owner; otherwise quarantine until resolved",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "mixed-binary-and-metadata",
      plannedVaultGate:
        "Ciphertext-only owner namespace; unresolved files fail closed and are quarantined.",
      cleanupResponsibility: ACCOUNT_CLEANUP,
    },
    {
      surfaceId: "filesystem.media-image-audio-replay",
      surfaceKind: "filesystem",
      locator:
        "Image, audio, atmosphere, replay, voice-take, and generated-media roots under data storage",
      ownerSource: "asset/replay manifest row user_id",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "mixed-binary-and-metadata",
      plannedVaultGate: "Per-owner encrypted blob or owner-bound encrypted file envelope.",
      cleanupResponsibility:
        "Asset lifecycle plus account reset/delete must remove active, superseded, and orphaned files.",
    },
    {
      surfaceId: "filesystem.recovery-temp-trash",
      surfaceKind: "filesystem",
      locator:
        "Default or SLATE_RECOVERY_DIR/SLATE_RECOVERY_MIRROR_DIR recovery roots, upload/import temp, quarantine, cleanup staging, and trash roots",
      ownerSource: "job/project/asset owner recorded before materialization",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "legacy-plaintext-or-mixed",
      plannedVaultGate:
        "Owner-bound encrypted scratch with bounded lifetime; no plaintext rename/copy window.",
      cleanupResponsibility:
        "Job finally blocks, startup recovery, migration rollback, reset, and account deletion.",
    },
    {
      surfaceId: "filesystem.os-temp",
      surfaceKind: "filesystem",
      locator: "OS temporary files created by imports, archives, media, and rendering",
      ownerSource: "creating request/job owner",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "legacy-plaintext-or-mixed",
      plannedVaultGate: "Encrypted temp envelope with owner-keyed cleanup lease.",
      cleanupResponsibility: "Creating job plus crash/startup scavenger.",
    },
    {
      surfaceId: "browser.origin-local-storage",
      surfaceKind: "browser-local-storage",
      locator:
        "Entire PRISM origin localStorage namespace, including user-keyed and legacy unkeyed entries",
      ownerSource: "authenticated account plus explicit key namespace; legacy unkeyed values are unresolved",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "legacy-plaintext-or-mixed",
      plannedVaultGate:
        "Owner-keyed encrypted browser envelope; reject unowned account content.",
      cleanupResponsibility:
        "Account switch isolation, factory reset, account deletion, and storage-version migration.",
    },
    {
      surfaceId: "browser.origin-session-storage",
      surfaceKind: "browser-session-storage",
      locator: "Entire PRISM origin sessionStorage namespace",
      ownerSource: "authenticated account and live session owner",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "legacy-plaintext-or-mixed",
      plannedVaultGate: "Owner-keyed encrypted session envelope.",
      cleanupResponsibility:
        "Account switch/logout, tab teardown, migration entry, reset, and account deletion.",
    },
    {
      surfaceId: "browser.indexed-db.response-cue-voice-cache",
      surfaceKind: "browser-indexed-db",
      locator:
        "IndexedDB prism-response-cues-v1 v1 / clips plus its in-memory fallback",
      ownerSource: "currently ownerless; must be bound to authenticated account before use",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "legacy-plaintext-or-mixed",
      plannedVaultGate: "Owner-keyed encrypted cache records and database namespace.",
      cleanupResponsibility:
        "Voice cache eviction plus account switch/reset/delete and migration cleanup.",
    },
    {
      surfaceId: "browser.indexed-db.replay-pending-captures",
      surfaceKind: "browser-indexed-db",
      locator:
        "IndexedDB prism-faithful-replays v1 / pending-captures plus its in-memory fallback",
      ownerSource: "currently ownerless; must be bound to recording user_id",
      contentClass: "persistent-binary-or-serialized-content",
      currentProtection: "legacy-plaintext-or-mixed",
      plannedVaultGate: "Owner-keyed encrypted capture chunks and metadata.",
      cleanupResponsibility:
        "Capture completion/cancel plus account switch/reset/delete and migration cleanup.",
    },
    {
      surfaceId: "runtime.api-account-work",
      surfaceKind: "runtime-queue-cache",
      locator:
        "API in-flight generation, auxiliary, turn-preparation, image, replay, Slate, Signal, Debate, and cleanup queues/caches",
      ownerSource: "request/session/job user_id; ownerless deduplication is forbidden",
      contentClass: "runtime-account-content",
      currentProtection: "process-memory-only",
      plannedVaultGate:
        "Every queue/cache key carries owner identity and pauses or purges at migration entry.",
      cleanupResponsibility:
        "Queue owner on settle/cancel plus migration, reset, deletion, and process shutdown.",
    },
    {
      surfaceId: "runtime.web-account-state",
      surfaceKind: "runtime-queue-cache",
      locator:
        "Web React state, request caches, pending uploads, object URLs, WebAudio buffers, and replay assembly",
      ownerSource: "authenticated browser account/session",
      contentClass: "runtime-account-content",
      currentProtection: "process-memory-only",
      plannedVaultGate: "Purge before account switch and before migration maintenance UI.",
      cleanupResponsibility:
        "Owning component/session plus account switch/logout/reset/delete.",
    },
    {
      surfaceId: "runtime.ollama-auxiliary-boundary",
      surfaceKind: "runtime-queue-cache",
      locator: "System Ollama auxiliary service/model request boundary",
      ownerSource: "request user_id while in flight only",
      contentClass: "runtime-account-content",
      currentProtection: "process-memory-only",
      plannedVaultGate:
        "Shared service/model availability only; no shared account prompt, response, cache, history, or dedup state.",
      cleanupResponsibility:
        "Request owner on settle/cancel; provider must retain no account content.",
    },
    {
      surfaceId: "diagnostics.process-desktop-container-logs",
      surfaceKind: "logs-diagnostics",
      locator:
        "API stdout/stderr, desktop/WebView console, crash reports, Docker/process logs, and launcher logs",
      ownerSource: "originating request/job account when content is present",
      contentClass: "diagnostic-account-content",
      currentProtection: "legacy-plaintext-or-mixed",
      plannedVaultGate:
        "Content-free structured events only; opaque IDs and bounded counts instead of payloads.",
      cleanupResponsibility:
        "Logger retention policy plus migration/reset/delete redaction validation.",
    },
    {
      surfaceId: "diagnostics.review-transcript-performance-exports",
      surfaceKind: "logs-diagnostics",
      locator:
        "Developer transcripts, Review exports, flight/performance artifacts, and diagnostic downloads",
      ownerSource: "exporting authenticated account",
      contentClass: "diagnostic-account-content",
      currentProtection: "consumer-controlled-after-export",
      plannedVaultGate:
        "Generate through the owner Vault; default artifacts are encrypted or explicitly user-exported.",
      cleanupResponsibility:
        "Server temp cleanup; user controls copies intentionally saved outside PRISM storage.",
    },
    {
      surfaceId: "backup.account-archive-snapshot",
      surfaceKind: "backup-export",
      locator: "Account backup archives, backup.json snapshots, import buffers, and staging",
      ownerSource: "export source user_id; imports rebind to recipient owner",
      contentClass: "backup-export-content",
      currentProtection: "consumer-controlled-after-export",
      plannedVaultGate:
        "Authenticated encrypted archive; decrypt then re-encrypt for the explicit recipient owner.",
      cleanupResponsibility:
        "Import/export job temp cleanup; user controls intentionally downloaded copies.",
    },
    {
      surfaceId: "backup.portable-content-packages",
      surfaceKind: "backup-export",
      locator:
        ".bot/.bots, conversation, Slate, replay/media, .mansion/.whodunnit, and other portable packages",
      ownerSource: "exporting account and manifest-declared recipient/import owner",
      contentClass: "backup-export-content",
      currentProtection: "consumer-controlled-after-export",
      plannedVaultGate:
        "Owner-authenticated package envelope; recipient import re-encrypts every account payload.",
      cleanupResponsibility:
        "Package job temp cleanup; user controls intentionally exported artifacts.",
    },
  ] satisfies PersistentAccountContentSurface[]);

export interface AccountContentRegistrySnapshot {
  version: typeof ACCOUNT_CONTENT_REGISTRY_VERSION;
  boundary: typeof ACCOUNT_CONTENT_REGISTRY_BOUNDARY;
  auditedSchema: {
    fingerprint: string;
    tableCount: number;
    columnCount: number;
    indexCount: number;
    triggerCount: number;
  };
  sqliteColumns: readonly SqliteAccountContentColumnEntry[];
  sqliteIndexes: readonly SqliteDerivativeIndexEntry[];
  ownerRelations: readonly AccountContentOwnerRelation[];
  idColumns: readonly AccountContentIdColumnInventoryEntry[];
  ownerRelationCoverage: AccountOwnerRelationCoverage;
  persistentSurfaces: readonly PersistentAccountContentSurface[];
  structuralMetadata: readonly AuditedStructuralMetadataEntry[];
}

export function buildAccountContentRegistry(
  db: DatabaseSync,
): AccountContentRegistrySnapshot {
  const observed = assertAccountContentRegistryCoverage(db);
  const ownerRelations = inspectAccountContentOwnerRelations(db);
  const idColumns = inspectAccountContentIdColumns(db);
  const ownerRelationCoverage = assertAccountOwnerRelationCoverage(db);
  const tableByName = new Map(observed.tables.map((table) => [table.name, table]));
  const sqliteColumns = observed.tables.flatMap((table) => {
    const fields = sqliteColumnRegistryFields(table);
    return table.columns.map(
      (column): SqliteAccountContentColumnEntry =>
        Object.freeze({
          surfaceId: `sqlite.column.${table.name}.${column.name}`,
          table: table.name,
          column: column.name,
          ...fields,
        }),
    );
  });
  const sqliteIndexes = observed.indexes.map((index): SqliteDerivativeIndexEntry => {
    const table = tableByName.get(index.table);
    if (!table) {
      throw new AccountContentSchemaDriftError(
        "An index has no audited account-content table.",
      );
    }
    const tableFields = sqliteColumnRegistryFields(table);
    const carriesProtectedValueShape = new Set([
      "user_vault_keys",
      "users",
      "sessions",
      "client_access_tokens",
      "owner_file_vault_roots",
    ]).has(index.table);
    return Object.freeze({
      surfaceId: `sqlite.index.${index.name}`,
      index: index.name,
      table: index.table,
      ownerSource: sqliteOwnerSource(table),
      contentClass: "derived-btree-index",
      currentProtection: carriesProtectedValueShape
        ? tableFields.currentProtection
        : "plaintext-derived-index",
      plannedVaultGate:
        index.table === "user_vault_keys"
          ? "Owner-scoped partial uniqueness enforces one active DEK without indexing wrapped key bytes."
          : "Index only ciphertext-safe fields or an owner-bound blind index inside the Vault gate.",
      cleanupResponsibility:
        index.table === "user_vault_keys"
          ? "Keyring rotation and account deletion own this lifecycle-only index."
          : ACCOUNT_CLEANUP,
    });
  });

  return Object.freeze({
    version: ACCOUNT_CONTENT_REGISTRY_VERSION,
    boundary: ACCOUNT_CONTENT_REGISTRY_BOUNDARY,
    auditedSchema: Object.freeze({
      fingerprint: observed.fingerprint,
      tableCount: observed.tableCount,
      columnCount: observed.columnCount,
      indexCount: observed.indexCount,
      triggerCount: observed.triggerCount,
    }),
    sqliteColumns: Object.freeze(sqliteColumns),
    sqliteIndexes: Object.freeze(sqliteIndexes),
    ownerRelations,
    idColumns,
    ownerRelationCoverage,
    persistentSurfaces: PERSISTENT_ACCOUNT_CONTENT_SURFACES,
    structuralMetadata: AUDITED_STRUCTURAL_METADATA_ALLOWLIST,
  });
}
