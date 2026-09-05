import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  ACCOUNT_CONTENT_REGISTRY_BOUNDARY,
  AUDITED_STRUCTURAL_METADATA_ALLOWLIST,
  AccountContentSchemaDriftError,
  PERSISTENT_ACCOUNT_CONTENT_SURFACES,
  assertAccountContentRegistryCoverage,
  buildAccountContentRegistry,
} from "../account-content-registry.ts";
import {
  createOpaqueCanarySurfaceId,
  scanForPlaintextCanary,
  type CanarySurfaceKind,
  type PlaintextCanaryFixture,
} from "../account-content-canary.ts";
import { initializeDatabase } from "../db.ts";
import { CORE_CONTENT_VAULT_TABLES } from "../core-content-vault.ts";

function currentFixture(): DatabaseSync {
  return initializeDatabase(new DatabaseSync(":memory:"));
}

describe("account-content registry", () => {
  it("classifies every audited SQLite column/index and every persistent surface", () => {
    const db = currentFixture();
    try {
      const registry = buildAccountContentRegistry(db);
      assert.equal(registry.version, 5);
      assert.deepEqual(registry.auditedSchema, {
        fingerprint: "715c5260aa0e4c36deb03a625352cb60ba4731dea9860a81c7b23e3aad577f02",
        tableCount: 166,
        columnCount: 2_023,
        indexCount: 382,
        triggerCount: 577,
      });
      assert.equal(registry.sqliteColumns.length, registry.auditedSchema.columnCount);
      assert.equal(registry.sqliteIndexes.length, registry.auditedSchema.indexCount);
      assert.equal(new Set(registry.sqliteColumns.map((entry) => entry.table)).size, 166);
      assert.deepEqual(registry.ownerRelationCoverage, {
        relationCount: 444,
        ownerAnchorCount: 153,
        ownerRowGuardCount: 154,
        ownerValidatorOnlyCount: 1,
      nativeCompositeCount: 3,
      triggerBackedCount: 275,
        serializedOwnerCount: 8,
        polymorphicOwnerCount: 2,
        derivedOwnerCount: 2,
        validatorOnlyRelationCount: 1,
      followUpCount: 288,
        idColumnCount: 302,
        relationalIdColumnCount: 263,
        nonParentIdColumnCount: 39,
      });
      assert.equal(
        registry.ownerRelations.length,
        registry.ownerRelationCoverage.relationCount,
      );
      assert.equal(
        registry.ownerRelations.every(
          (relation) =>
            relation.enforcement.startsWith("native-") ||
            relation.followUp !== null,
        ),
        true,
      );
      assert.equal(
        registry.idColumns.length,
        registry.ownerRelationCoverage.idColumnCount,
      );
      assert.equal(
        registry.idColumns
          .filter((entry) => entry.classification === "non-parent-id")
          .every((entry) => Boolean(entry.reason)),
        true,
      );

      for (const entry of [
        ...registry.sqliteColumns,
        ...registry.sqliteIndexes,
        ...registry.persistentSurfaces,
        ...registry.structuralMetadata,
      ]) {
        assert.ok(entry.surfaceId);
        assert.ok(entry.ownerSource);
        assert.ok(entry.contentClass);
        assert.ok(entry.currentProtection);
        assert.ok(entry.plannedVaultGate);
        assert.ok(entry.cleanupResponsibility);
      }

      const persistentKinds = new Set(
        PERSISTENT_ACCOUNT_CONTENT_SURFACES.map((surface) => surface.surfaceKind),
      );
      const persistentIds = new Set(
        PERSISTENT_ACCOUNT_CONTENT_SURFACES.map((surface) => surface.surfaceId),
      );
      assert.deepEqual(
        [...persistentKinds].sort(),
        [
          "backup-export",
          "browser-indexed-db",
          "browser-local-storage",
          "browser-session-storage",
          "filesystem",
          "logs-diagnostics",
          "qdrant",
          "runtime-queue-cache",
          "sqlite-files",
        ],
      );
      for (const requiredSurface of [
        "sqlite.files.main-wal-shm",
        "qdrant.collection.memories",
        "filesystem.localai-data-root",
        "filesystem.media-image-audio-replay",
        "filesystem.recovery-temp-trash",
        "browser.origin-local-storage",
        "browser.origin-session-storage",
        "browser.indexed-db.response-cue-voice-cache",
        "browser.indexed-db.replay-pending-captures",
        "runtime.api-account-work",
        "runtime.ollama-auxiliary-boundary",
        "diagnostics.process-desktop-container-logs",
        "backup.account-archive-snapshot",
        "backup.portable-content-packages",
      ]) {
        assert.equal(persistentIds.has(requiredSurface), true, requiredSurface);
      }
      assert.equal(
        registry.sqliteColumns.some(
          (entry) =>
            entry.table === "image_asset_search" &&
            entry.contentClass === "derived-search-index" &&
            entry.currentProtection === "plaintext-derived-index",
        ),
        true,
      );
      assert.equal(
        registry.sqliteColumns
          .filter((entry) => entry.table === "user_vault_keys")
          .every(
            (entry) =>
              entry.ownerSource === "user_vault_keys.user_id -> users.id" &&
              entry.contentClass === "identity-credential-and-settings" &&
              entry.currentProtection ===
                "vault-v2-keyring-metadata-and-wrapped-deks",
          ),
        true,
      );
      assert.deepEqual(
        registry.sqliteColumns
          .filter((entry) => entry.table === "vault_installation_config")
          .map((entry) => entry.column)
          .sort(),
        ["kdf_salt", "kdf_version", "singleton"],
      );
      assert.equal(
        registry.sqliteColumns
          .filter((entry) => entry.table === "vault_installation_config")
          .every(
            (entry) =>
              entry.contentClass === "structural-non-content-metadata" &&
              entry.currentProtection === "not-account-content",
          ),
        true,
      );
      assert.equal(
        registry.sqliteIndexes.some(
          (entry) =>
            entry.index === "idx_user_vault_keys_one_active" &&
            entry.currentProtection ===
              "vault-v2-keyring-metadata-and-wrapped-deks",
        ),
        true,
      );
      assert.equal(
        registry.sqliteColumns
          .filter((entry) => entry.table === "users")
          .every(
            (entry) =>
              entry.currentProtection ===
              "vault-v2-account-auth-ciphertext-and-blind-indexes",
          ),
        true,
      );
      assert.equal(
        registry.sqliteColumns
          .filter(
            (entry) =>
              entry.table === "sessions" ||
              entry.table === "client_access_tokens",
          )
          .every((entry) => entry.currentProtection === "keyed-hash-only"),
        true,
      );
      assert.deepEqual(
        registry.sqliteColumns
          .filter((entry) => entry.table === "owner_file_vault_roots")
          .map((entry) => entry.column)
          .sort(),
        ["created_at", "encrypted_root_key", "user_id"],
      );
      assert.equal(
        registry.sqliteColumns
          .filter((entry) => entry.table === "owner_file_vault_roots")
          .every(
            (entry) =>
              entry.currentProtection === "vault-v2-owner-file-root",
          ),
        true,
      );
      assert.equal(
        AUDITED_STRUCTURAL_METADATA_ALLOWLIST.some(
          (entry) =>
            entry.surfaceId === "sqlite.table.vault-installation-config" &&
            entry.fields.join(",") === "singleton,kdf_salt,kdf_version",
        ),
        true,
      );
      for (const surfaceId of [
        "sqlite.table.account-auth-installation-key",
        "sqlite.table.account-auth-vault-state",
      ]) {
        assert.equal(
          AUDITED_STRUCTURAL_METADATA_ALLOWLIST.some(
            (entry) => entry.surfaceId === surfaceId,
          ),
          true,
        );
      }
      assert.match(ACCOUNT_CONTENT_REGISTRY_BOUNDARY.doesNotProve, /Encryption/u);
      assert.equal(
        AUDITED_STRUCTURAL_METADATA_ALLOWLIST.some((entry) =>
          entry.surfaceId.startsWith("sqlite.column."),
        ),
        false,
        "No application column may silently bypass the Vault as structural metadata.",
      );
    } finally {
      db.close();
    }
  });

  it("keeps newly audited distillation and Signal proxy metadata account-owned", () => {
    const db = currentFixture();
    try {
      const registry = buildAccountContentRegistry(db);
      for (const [table, column] of [
        ["conversations", "chat_distillation_kind"],
        ["conversations", "chat_distillation_key"],
        ["conversations", "chat_distillation_persona_name"],
        ["botcast_episode_image_proxies", "source_sha256"],
      ]) {
        const entry = registry.sqliteColumns.find(
          (item) => item.table === table && item.column === column,
        );
        assert.ok(entry);
        assert.equal(entry.ownerSource, `${table}.user_id`);
        assert.equal(entry.contentClass, "account-record-or-derived-content");
        assert.notEqual(entry.currentProtection, "not-account-content");
      }
      const conversations = CORE_CONTENT_VAULT_TABLES.find(
        (table) => table.table === "conversations",
      )!;
      assert.equal(
        conversations.columns.chat_distillation_persona_name?.disposition,
        "encrypted",
      );
      // A source digest is a content derivative, not evidence that archival
      // pixels or private presentation notes have already been encrypted.
      const proxy = registry.sqliteColumns.find(
        (entry) => entry.table === "botcast_episode_image_proxies" &&
          entry.column === "source_sha256",
      )!;
      assert.equal(proxy.currentProtection, "legacy-plaintext-or-mixed");
      const primaryKey = db.prepare(
        "PRAGMA table_info(botcast_episode_image_proxies)",
      ).all() as Array<{ name: string; pk: number }>;
      assert.deepEqual(
        primaryKey.filter((column) => column.pk > 0)
          .sort((left, right) => left.pk - right.pk)
          .map((column) => column.name),
        ["episode_id", "image_id"],
      );
    } finally {
      db.close();
    }
  });

  it("fails closed when an unknown potential-content column or table appears", () => {
    const columnDrift = currentFixture();
    try {
      columnDrift.exec(
        "ALTER TABLE messages ADD COLUMN future_unregistered_content TEXT;",
      );
      assert.throws(
        () => assertAccountContentRegistryCoverage(columnDrift),
        AccountContentSchemaDriftError,
      );
    } finally {
      columnDrift.close();
    }

    const tableDrift = currentFixture();
    try {
      tableDrift.exec(
        "CREATE TABLE future_account_content (user_id TEXT, body TEXT);",
      );
      assert.throws(
        () => assertAccountContentRegistryCoverage(tableDrift),
        AccountContentSchemaDriftError,
      );
    } finally {
      tableDrift.close();
    }

    const indexDrift = currentFixture();
    try {
      indexDrift.exec(
        "CREATE INDEX future_plaintext_index ON messages(content);",
      );
      assert.throws(
        () => assertAccountContentRegistryCoverage(indexDrift),
        AccountContentSchemaDriftError,
      );
    } finally {
      indexDrift.close();
    }
  });
});

describe("zero-plaintext canary scanner", () => {
  it("detects byte/string fixtures across every storage class without disclosure", () => {
    const canary = "PRISM-ZERO-PLAINTEXT-CANARY-7e33b4";
    const sensitivePath = "/private/account-jared/export-with-content.prism";
    const sensitiveContent = "private fixture prose that must not enter a report";
    const kinds: CanarySurfaceKind[] = [
      "sqlite-main",
      "sqlite-wal",
      "sqlite-shm",
      "filesystem",
      "browser-local-storage",
      "browser-session-storage",
      "browser-indexed-db",
      "search-index",
      "runtime-cache",
      "log-diagnostic",
      "backup-export",
    ];
    const fixtures: PlaintextCanaryFixture[] = kinds.map((kind, index) => ({
      opaqueSurfaceId: createOpaqueCanarySurfaceId(kind, `${sensitivePath}:${kind}`),
      kind,
      bytes:
        kind === "sqlite-shm"
          ? Buffer.from("known-clean-shared-memory-snapshot")
          : index % 2 === 0
            ? JSON.stringify({ value: `${sensitiveContent}:${canary}` })
            : Buffer.from(`${canary}\u0000${canary}`, "utf8"),
    }));

    const report = scanForPlaintextCanary(canary, fixtures);
    assert.equal(report.scannedSurfaceCount, 11);
    assert.equal(report.matchedSurfaceCount, 10);
    assert.equal(report.totalMatchCount, 15);
    assert.equal(
      report.matches.every((match) =>
        /^surface:[a-f0-9]{24}$/u.test(match.opaqueSurfaceId),
      ),
      true,
    );

    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(canary), false);
    assert.equal(serialized.includes(sensitivePath), false);
    assert.equal(serialized.includes(sensitiveContent), false);
    assert.deepEqual(
      Object.keys(report).sort(),
      [
        "matchedSurfaceCount",
        "matches",
        "scannedSurfaceCount",
        "totalMatchCount",
        "version",
      ],
    );
    assert.equal(
      report.matches.every(
        (match) =>
          Object.keys(match).sort().join(",") ===
          "matchCount,opaqueSurfaceId",
      ),
      true,
    );
  });

  it("also scans a binary canary and keeps validation errors content-free", () => {
    const canary = Uint8Array.from([
      0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    ]);
    const opaqueSurfaceId = createOpaqueCanarySurfaceId(
      "sqlite-wal",
      "binary-wal-fixture",
    );
    const report = scanForPlaintextCanary(canary, [
      {
        opaqueSurfaceId,
        kind: "sqlite-wal",
        bytes: Buffer.concat([Buffer.from([0x00]), Buffer.from(canary)]),
      },
    ]);
    assert.equal(report.totalMatchCount, 1);

    const secretCanary = "DO-NOT-DISCLOSE-INVALID-ID-CANARY";
    assert.throws(
      () =>
        scanForPlaintextCanary(secretCanary, [
          {
            opaqueSurfaceId: secretCanary,
            kind: "log-diagnostic",
            bytes: secretCanary,
          },
        ]),
      (error) =>
        error instanceof Error &&
        !error.message.includes(secretCanary) &&
        /opaque/u.test(error.message),
    );
  });
});
