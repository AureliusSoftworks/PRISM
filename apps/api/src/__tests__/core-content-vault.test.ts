import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { exportUserSnapshot } from "../backup.ts";
import { deleteBot } from "../bots.ts";
import { processChatMessage } from "../chat.ts";
import { createEncryptedAccountOwnerV2 } from "../account-auth-vault.ts";
import {
  CORE_CONTENT_VAULT_CONTRACT_VERSION,
  CORE_CONTENT_VAULT_TABLES,
  MEMORY_CONTENT_VAULT_TABLES,
  activateCoreContentVaultV2,
  assertCoreContentVaultContract,
  initializeCoreContentVaultOwnerV2,
} from "../core-content-vault.ts";
import {
  clearConversationMessages,
  deleteConversation,
} from "../conversations.ts";
import { initializeDatabase } from "../db.ts";
import { readPrismActionProposal } from "../prism-action-journal.ts";
import {
  createOpaqueCanarySurfaceId,
  scanForPlaintextCanary,
} from "../account-content-canary.ts";
import {
  deriveMasterKey,
  encryptText,
} from "../security.ts";
import { parseVaultEnvelopeV2 } from "../vault-envelope-v2.ts";

const NOW = "2026-09-01T20:00:00.000Z";
const MASTER_SECRET = "core-content-vault-test-master";
const OWNER_IDS = ["owner-a", "owner-b", "owner-c", "owner-d"] as const;
const CANARY = "PRISM-6S6ED-2-5-PLAINTEXT-CANARY";

interface VaultFixture {
  db: DatabaseSync;
  userKeys: Map<string, Buffer>;
  close(): void;
}

function addLegacyOwner(
  db: DatabaseSync,
  ownerId: string,
  userKey: Buffer,
  legacyMasterKey: Buffer,
): void {
  const wrapped = encryptText(userKey.toString("base64"), legacyMasterKey);
  db.prepare(
    `INSERT INTO users (
       id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at
     ) VALUES (?, ?, ?, 'hash', 'salt', ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    `${ownerId}@example.com`,
    ownerId.toUpperCase(),
    wrapped.ciphertext,
    wrapped.iv,
    wrapped.tag,
    NOW,
    NOW,
  );
}

function createVaultFixture(ownerIds: readonly string[] = OWNER_IDS): VaultFixture {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const userKeys = new Map<string, Buffer>();
  const legacyMasterKey = deriveMasterKey(MASTER_SECRET);
  try {
    ownerIds.forEach((ownerId, index) => {
      const userKey = Buffer.alloc(32, index + 11);
      userKeys.set(ownerId, userKey);
      addLegacyOwner(db, ownerId, userKey, legacyMasterKey);
    });
  } finally {
    legacyMasterKey.fill(0);
  }
  activateCoreContentVaultV2({ db, masterSecret: MASTER_SECRET });
  return {
    db,
    userKeys,
    close() {
      for (const key of userKeys.values()) key.fill(0);
      db.close();
    },
  };
}

function insertBot(
  db: DatabaseSync,
  ownerId: string,
  id: string,
  marker: string,
): void {
  db.prepare(
    `INSERT INTO bots (
       id, user_id, name, system_prompt, model, temperature, color,
       powers_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ownerId,
    `Bot ${marker}`,
    `Prompt ${marker}`,
    `Model ${marker}`,
    0.42,
    `Color ${marker}`,
    JSON.stringify([{ marker }]),
    NOW,
    NOW,
  );
}

function insertConversationSet(
  db: DatabaseSync,
  ownerId: string,
  marker: string,
): void {
  db.prepare(
    `INSERT INTO conversations (
       id, user_id, title, conversation_mode, bot_id, coffee_settings,
       coffee_topic, zen_wallpaper_prompt_seed, created_at, updated_at
     ) VALUES (?, ?, ?, 'sandbox', ?, ?, ?, ?, ?, ?)`,
  ).run(
    `conversation-${marker}`,
    ownerId,
    `Title ${marker}`,
    `bot-${marker}`,
    JSON.stringify({ marker }),
    `Topic ${marker}`,
    `Wallpaper ${marker}`,
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO messages (
       id, conversation_id, user_id, role, content, provider, model, bot_id,
       tool_payload, created_at
     ) VALUES (?, ?, ?, 'assistant', ?, 'local', ?, ?, ?, ?)`,
  ).run(
    `message-${marker}`,
    `conversation-${marker}`,
    ownerId,
    `Message ${marker}`,
    `Message model ${marker}`,
    `bot-${marker}`,
    JSON.stringify({ marker }),
    NOW,
  );
  db.prepare(
    `INSERT INTO conversation_exports (
       id, user_id, conversation_id, markdown, bot_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    `export-${marker}`,
    ownerId,
    `conversation-${marker}`,
    `# Export ${marker}`,
    `bot-${marker}`,
    NOW,
  );
}

function physicalValue(
  db: DatabaseSync,
  table: string,
  column: string,
  rowId: string,
): Uint8Array {
  const row = db
    .prepare(`SELECT "${column}" AS value FROM main."${table}" WHERE id = ?`)
    .get(rowId) as { value: unknown };
  assert.ok(row.value instanceof Uint8Array);
  return row.value;
}

describe("core content Vault schema contract", () => {
  it("exhaustively classifies every core-content and memory-family column", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"));
    try {
      const coverage = assertCoreContentVaultContract(db);
      assert.equal(coverage.tableCount, 28);
      assert.ok(coverage.columnCount > 300);
      assert.ok(coverage.encryptedColumnCount > 125);
      assert.deepEqual(
        CORE_CONTENT_VAULT_TABLES.map((entry) => entry.table),
        [
          "prism_action_proposals",
          "prism_action_runs",
          "prism_context_tokens",
          "prism_quarantine",
          "conversations",
          "messages",
          "bots",
          "conversation_exports",
          ...MEMORY_CONTENT_VAULT_TABLES.map((entry) => entry.table),
        ],
      );
      const conversations = CORE_CONTENT_VAULT_TABLES.find(
        (entry) => entry.table === "conversations",
      );
      const bots = CORE_CONTENT_VAULT_TABLES.find(
        (entry) => entry.table === "bots",
      );
      assert.equal(conversations?.columns.title.disposition, "encrypted");
      assert.equal(conversations?.columns.bot_id.disposition, "operational");
      assert.equal(bots?.columns.system_prompt.disposition, "encrypted");
      assert.equal(bots?.columns.temperature.disposition, "encrypted");
      assert.equal(bots?.columns.export_hash.disposition, "operational");
    } finally {
      db.close();
    }
  });
});

describe("core content Vault owner isolation", () => {
  it("initializes a newly registered owner inside the account transaction", () => {
    const db = initializeDatabase(
      new DatabaseSync(":memory:"),
      MASTER_SECRET,
    );
    const userKey = Buffer.alloc(32, 73);
    const legacyMasterKey = deriveMasterKey(MASTER_SECRET);
    try {
      db.exec("BEGIN IMMEDIATE");
      const wrapped = encryptText(userKey.toString("base64"), legacyMasterKey);
      createEncryptedAccountOwnerV2({
        db,
        ownerUserId: "new-owner",
        loginIdentity: "new-owner@example.com",
        displayName: "NEW-OWNER",
        passwordHash: "hash",
        passwordSalt: "salt",
        wrappedUserKey: wrapped.ciphertext,
        wrappedUserKeyIv: wrapped.iv,
        wrappedUserKeyTag: wrapped.tag,
        userDek: userKey,
        createdAt: NOW,
      });
      initializeCoreContentVaultOwnerV2({
        db,
        ownerUserId: "new-owner",
        legacyUserDek: userKey,
        createdAt: NOW,
      });
      db.exec("COMMIT");
      insertBot(db, "new-owner", "new-owner-bot", "new-owner-canary");
      assert.equal(
        (
          db
            .prepare("SELECT name FROM bots WHERE user_id = ? AND id = ?")
            .get("new-owner", "new-owner-bot") as { name: string }
        ).name,
        "Bot new-owner-canary",
      );
      assert.ok(
        physicalValue(db, "bots", "name", "new-owner-bot") instanceof
          Uint8Array,
      );
    } finally {
      if (db.isTransaction) db.exec("ROLLBACK");
      legacyMasterKey.fill(0);
      userKey.fill(0);
      db.close();
    }
  });

  it("keeps four-owner CRUD, owner exports, guessed IDs, and deletion independent", () => {
    const fixture = createVaultFixture();
    try {
      OWNER_IDS.forEach((ownerId, index) => {
        const marker = String.fromCharCode(97 + index);
        insertBot(fixture.db, ownerId, `bot-${marker}`, marker);
        insertConversationSet(fixture.db, ownerId, marker);
      });

      assert.ok(
        physicalValue(fixture.db, "bots", "name", "bot-a") instanceof
          Uint8Array,
      );
      assert.ok(
        physicalValue(
          fixture.db,
          "conversations",
          "title",
          "conversation-b",
        ) instanceof Uint8Array,
      );
      assert.ok(
        physicalValue(fixture.db, "messages", "content", "message-c") instanceof
          Uint8Array,
      );
      assert.equal(
        typeof (
          fixture.db
            .prepare(
              "SELECT rowid FROM messages WHERE user_id = ? AND id = ?",
            )
            .get("owner-c", "message-c") as { rowid: number }
        ).rowid,
        "number",
      );
      assert.ok(
        physicalValue(
          fixture.db,
          "conversation_exports",
          "markdown",
          "export-d",
        ) instanceof Uint8Array,
      );

      const wrongOwner = fixture.db
        .prepare("SELECT title FROM conversations WHERE user_id = ? AND id = ?")
        .get("owner-b", "conversation-a");
      const missing = fixture.db
        .prepare("SELECT title FROM conversations WHERE user_id = ? AND id = ?")
        .get("owner-b", "missing-conversation");
      assert.equal(wrongOwner, undefined);
      assert.equal(missing, undefined);

      let wrongDeleteMessage = "";
      let missingDeleteMessage = "";
      try {
        deleteConversation(fixture.db, "owner-b", "conversation-a");
      } catch (error) {
        wrongDeleteMessage = (error as Error).message;
      }
      try {
        deleteConversation(fixture.db, "owner-b", "missing-conversation");
      } catch (error) {
        missingDeleteMessage = (error as Error).message;
      }
      assert.equal(wrongDeleteMessage, missingDeleteMessage);

      const ownerCSnapshot = exportUserSnapshot(
        fixture.db,
        "owner-c",
        fixture.userKeys.get("owner-c")!,
      );
      assert.deepEqual(ownerCSnapshot.bots?.map((bot) => bot.name), ["Bot c"]);
      assert.deepEqual(
        ownerCSnapshot.conversations.map((conversation) => ({
          title: conversation.title,
          messages: conversation.messages.map((message) => message.content),
        })),
        [{ title: "Title c", messages: ["Message c"] }],
      );

      const cleared = clearConversationMessages(
        fixture.db,
        "owner-d",
        "conversation-d",
      );
      assert.deepEqual(cleared, {
        deletedMessages: 1,
        deletedSummaries: 0,
        deletedExports: 1,
      });

      deleteConversation(fixture.db, "owner-b", "conversation-b");
      assert.equal(
        fixture.db
          .prepare("SELECT id FROM conversations WHERE user_id = ? AND id = ?")
          .get("owner-b", "conversation-b"),
        undefined,
      );
      assert.ok(
        fixture.db
          .prepare("SELECT id FROM conversations WHERE user_id = ? AND id = ?")
          .get("owner-a", "conversation-a"),
      );

      deleteBot(fixture.db, "owner-c", "bot-c");
      assert.equal(
        fixture.db
          .prepare("SELECT id FROM bots WHERE user_id = ? AND id = ?")
          .get("owner-c", "bot-c"),
        undefined,
      );
      assert.ok(
        fixture.db
          .prepare("SELECT id FROM bots WHERE user_id = ? AND id = ?")
          .get("owner-a", "bot-a"),
      );
    } finally {
      fixture.close();
    }
  });

  it("assembles provider history only after the owner-qualified conversation read", async () => {
    const fixture = createVaultFixture(["owner-a", "owner-b"]);
    const previousFetch = globalThis.fetch;
    const providerCalls: Array<Array<{ role: string; content: string }>> = [];
    try {
      insertBot(fixture.db, "owner-a", "provider-bot-a", "provider-a");
      insertBot(fixture.db, "owner-b", "provider-bot-b", "provider-b");
      fixture.db.prepare(
        `INSERT INTO conversations (
           id, user_id, title, conversation_mode, bot_id, created_at, updated_at
         ) VALUES (?, ?, ?, 'sandbox', ?, ?, ?)`,
      ).run(
        "provider-conversation-a",
        "owner-a",
        "Owner A thread",
        "provider-bot-a",
        NOW,
        NOW,
      );
      fixture.db.prepare(
        `INSERT INTO conversations (
           id, user_id, title, conversation_mode, bot_id, created_at, updated_at
         ) VALUES (?, ?, ?, 'sandbox', ?, ?, ?)`,
      ).run(
        "provider-conversation-b",
        "owner-b",
        "Owner B thread",
        "provider-bot-b",
        NOW,
        NOW,
      );
      fixture.db.prepare(
        `INSERT INTO messages (
           id, conversation_id, user_id, role, content, created_at
         ) VALUES (?, ?, ?, 'user', ?, ?)`,
      ).run(
        "provider-history-a",
        "provider-conversation-a",
        "owner-a",
        "OWNER-A-HISTORY-CANARY",
        NOW,
      );
      fixture.db.prepare(
        `INSERT INTO messages (
           id, conversation_id, user_id, role, content, created_at
         ) VALUES (?, ?, ?, 'user', ?, ?)`,
      ).run(
        "provider-history-b",
        "provider-conversation-b",
        "owner-b",
        "OWNER-B-HISTORY-MUST-NOT-CROSS",
        NOW,
      );
      globalThis.fetch = (async (
        _input: string | URL | Request,
        init?: RequestInit,
      ) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          prompt?: string;
          messages?: Array<{ role: string; content: string }>;
        };
        if (Array.isArray(body.messages)) providerCalls.push(body.messages);
        if (typeof body.prompt === "string") {
          return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ message: { content: "Encrypted provider reply." } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch;

      const result = await processChatMessage(
        fixture.db,
        "owner-a",
        "OWNER-A-NEW-TURN",
        fixture.userKeys.get("owner-a")!,
        {
          preferredProvider: "local",
          autoMemory: false,
          botId: "provider-bot-a",
          botSystemPrompt: "Prompt provider-a",
          incognito: false,
          mode: "sandbox",
        },
        "provider-conversation-a",
      );
      assert.equal(result.conversation.messages.at(-1)?.content, "Encrypted provider reply.");
      const providerText = providerCalls
        .flat()
        .map((message) => message.content)
        .join("\n");
      assert.match(providerText, /OWNER-A-HISTORY-CANARY/u);
      assert.match(providerText, /OWNER-A-NEW-TURN/u);
      assert.doesNotMatch(providerText, /OWNER-B-HISTORY-MUST-NOT-CROSS/u);
      const physicalMessages = fixture.db
        .prepare(
          `SELECT content
             FROM main.messages
            WHERE user_id = ? AND conversation_id = ?`,
        )
        .all("owner-a", "provider-conversation-a") as Array<{
        content: unknown;
      }>;
      assert.equal(
        physicalMessages.every((row) => row.content instanceof Uint8Array),
        true,
      );
    } finally {
      globalThis.fetch = previousFetch;
      fixture.close();
    }
  });

  it("creates a distinct recipient-owned bot row encrypted under the recipient key", () => {
    const fixture = createVaultFixture(["owner-a", "owner-b"]);
    try {
      insertBot(fixture.db, "owner-a", "source-bot", "copy-canary");
      const source = fixture.db
        .prepare(
          `SELECT name, system_prompt, model, temperature, color, powers_json
             FROM bots
            WHERE user_id = ? AND id = ?`,
        )
        .get("owner-a", "source-bot") as Record<string, string | number>;
      fixture.db.prepare(
        `INSERT INTO bots (
           id, user_id, name, system_prompt, model, temperature, color,
           powers_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "recipient-copy",
        "owner-b",
        source.name,
        source.system_prompt,
        source.model,
        source.temperature,
        source.color,
        source.powers_json,
        NOW,
        NOW,
      );

      const sourceEnvelope = physicalValue(
        fixture.db,
        "bots",
        "system_prompt",
        "source-bot",
      );
      const recipientEnvelope = physicalValue(
        fixture.db,
        "bots",
        "system_prompt",
        "recipient-copy",
      );
      assert.notDeepEqual(sourceEnvelope, recipientEnvelope);
      assert.notEqual(
        parseVaultEnvelopeV2(sourceEnvelope).keyId,
        parseVaultEnvelopeV2(recipientEnvelope).keyId,
      );
      assert.deepEqual(
        {
          ...(fixture.db
            .prepare(
              "SELECT name, system_prompt FROM bots WHERE user_id = ? AND id = ?",
            )
            .get("owner-b", "recipient-copy") as Record<string, unknown>),
        },
        {
          name: "Bot copy-canary",
          system_prompt: "Prompt copy-canary",
        },
      );
      assert.equal(
        fixture.db
          .prepare("SELECT name FROM bots WHERE user_id = ? AND id = ?")
          .get("owner-a", "recipient-copy"),
        undefined,
      );

      deleteBot(fixture.db, "owner-a", "source-bot");
      assert.ok(
        fixture.db
          .prepare("SELECT id FROM bots WHERE user_id = ? AND id = ?")
          .get("owner-b", "recipient-copy"),
      );
    } finally {
      fixture.close();
    }
  });
});

describe("core content Vault authenticated bindings", () => {
  it("fails closed for owner, row, column, and ciphertext transplants", () => {
    const fixture = createVaultFixture(["owner-a", "owner-b"]);
    try {
      insertBot(fixture.db, "owner-a", "a-one", "a-one");
      insertBot(fixture.db, "owner-a", "a-two", "a-two");
      insertBot(fixture.db, "owner-b", "b-one", "b-one");
      const aOneName = Buffer.from(
        physicalValue(fixture.db, "bots", "name", "a-one"),
      );
      const aOnePrompt = Buffer.from(
        physicalValue(fixture.db, "bots", "system_prompt", "a-one"),
      );
      const aTwoName = Buffer.from(
        physicalValue(fixture.db, "bots", "name", "a-two"),
      );
      const bOneName = Buffer.from(
        physicalValue(fixture.db, "bots", "name", "b-one"),
      );

      fixture.db
        .prepare("UPDATE main.bots SET name = ? WHERE id = 'a-two'")
        .run(aOneName);
      assert.throws(() =>
        fixture.db
          .prepare("SELECT name FROM bots WHERE user_id = 'owner-a' AND id = 'a-two'")
          .get(),
      );
      fixture.db
        .prepare("UPDATE main.bots SET name = ? WHERE id = 'a-two'")
        .run(aTwoName);

      fixture.db
        .prepare("UPDATE main.bots SET system_prompt = ? WHERE id = 'a-one'")
        .run(aOneName);
      assert.throws(() =>
        fixture.db
          .prepare(
            "SELECT system_prompt FROM bots WHERE user_id = 'owner-a' AND id = 'a-one'",
          )
          .get(),
      );
      fixture.db
        .prepare("UPDATE main.bots SET system_prompt = ? WHERE id = 'a-one'")
        .run(aOnePrompt);

      fixture.db
        .prepare("UPDATE main.bots SET name = ? WHERE id = 'b-one'")
        .run(aOneName);
      assert.throws(() =>
        fixture.db
          .prepare("SELECT name FROM bots WHERE user_id = 'owner-b' AND id = 'b-one'")
          .get(),
      );
      fixture.db
        .prepare("UPDATE main.bots SET name = ? WHERE id = 'b-one'")
        .run(bOneName);

      const tampered = Buffer.from(aOneName);
      tampered[tampered.length - 1] ^= 0x01;
      fixture.db
        .prepare("UPDATE main.bots SET name = ? WHERE id = 'a-one'")
        .run(tampered);
      const wrongOwner = fixture.db
        .prepare("SELECT name FROM bots WHERE user_id = ? AND id = ?")
        .get("owner-b", "a-one");
      const missing = fixture.db
        .prepare("SELECT name FROM bots WHERE user_id = ? AND id = ?")
        .get("owner-b", "missing");
      assert.equal(wrongOwner, undefined);
      assert.equal(missing, undefined);
      assert.throws(() =>
        fixture.db
          .prepare("SELECT name FROM bots WHERE user_id = 'owner-a' AND id = 'a-one'")
          .get(),
      );
    } finally {
      fixture.close();
    }
  });
});

describe("core content Vault migration boundary", () => {
  it("migrates legacy plaintext, scrubs SQLite/WAL, resumes, and never falls back on ordinary reads", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-core-vault-"));
    const dbPath = join(tempDir, "core-vault.sqlite");
    const userKey = Buffer.alloc(32, 29);
    const legacyMasterKey = deriveMasterKey(MASTER_SECRET);
    let db: DatabaseSync | null = null;
    try {
      db = initializeDatabase(new DatabaseSync(dbPath));
      addLegacyOwner(db, "legacy-owner", userKey, legacyMasterKey);
      insertBot(db, "legacy-owner", "legacy-bot", CANARY);
      db.prepare(
        `INSERT INTO conversations (
           id, user_id, title, coffee_settings, coffee_topic,
           zen_wallpaper_prompt_seed, created_at, updated_at
         ) VALUES ('legacy-conversation', 'legacy-owner', ?, ?, ?, ?, ?, ?)`,
      ).run(
        `${CANARY}:title`,
        JSON.stringify({ canary: CANARY }),
        `${CANARY}:topic`,
        `${CANARY}:wallpaper`,
        NOW,
        NOW,
      );
      db.prepare(
        `INSERT INTO messages (
           id, conversation_id, user_id, role, content, provider, model,
           tool_payload, created_at
         ) VALUES ('legacy-message', 'legacy-conversation', 'legacy-owner',
                   'user', ?, ?, ?, ?, ?)`,
      ).run(
        `${CANARY}:message`,
        `${CANARY}:provider`,
        `${CANARY}:model`,
        JSON.stringify({ canary: CANARY }),
        NOW,
      );
      db.prepare(
        `INSERT INTO prism_action_runs (
           id, user_id, capability_id, capability_version, source, status,
           idempotency_key, input_json, result_json, affected_entities_json,
           non_reversible_json, error, created_at
         ) VALUES ('legacy-run', 'legacy-owner', 'test.capability', 1, 'ui',
                   'running', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `${CANARY}:idempotency`,
        JSON.stringify({ canary: CANARY }),
        JSON.stringify({ canary: CANARY }),
        JSON.stringify([{ id: CANARY }]),
        JSON.stringify([CANARY]),
        `${CANARY}:error`,
        NOW,
      );
      db.prepare(
        `INSERT INTO prism_action_proposals (
           id, user_id, capability_id, capability_version, input_json,
           preview_json, risk, confirmation_policy, status, created_at,
           expires_at
         ) VALUES ('legacy-proposal', 'legacy-owner', 'test.capability', 1,
                   ?, ?, 'low', 'never', 'ready', ?, ?)`,
      ).run(
        JSON.stringify({ canary: CANARY }),
        JSON.stringify({ summary: CANARY }),
        NOW,
        "2027-09-01T20:00:00.000Z",
      );
      db.prepare(
        `INSERT INTO prism_context_tokens (
           id, user_id, purpose, entities_json, created_at, expires_at
         ) VALUES ('legacy-context', 'legacy-owner', ?, ?, ?, ?)`,
      ).run(
        `${CANARY}:purpose`,
        JSON.stringify([{ id: CANARY }]),
        NOW,
        "2027-09-01T20:00:00.000Z",
      );
      db.prepare(
        `INSERT INTO prism_quarantine (
           id, user_id, run_id, entity_type, entity_id, payload_ciphertext,
           payload_iv, payload_tag, created_at, expires_at
         ) VALUES ('legacy-quarantine', 'legacy-owner', 'legacy-run', 'test',
                   'opaque-entity', ?, 'legacy-iv', 'legacy-tag', ?, ?)`,
      ).run(
        `${CANARY}:quarantine`,
        NOW,
        "2027-09-01T20:00:00.000Z",
      );
      db.prepare(
        `INSERT INTO conversation_exports (
           id, user_id, conversation_id, markdown, created_at
         ) VALUES ('legacy-export', 'legacy-owner', 'legacy-conversation', ?, ?)`,
      ).run(`# ${CANARY}:export`, NOW);
      db.prepare(
        `INSERT INTO coffee_context_sparks (
           id, user_id, conversation_id, source_applet, source_session_id,
           source_title, source_date, source_role,
           source_participant_bot_ids, inspired_bot_id, display_prompt,
           created_at, updated_at
         ) VALUES (
           'legacy-spark', 'legacy-owner', 'legacy-conversation', 'coffee',
           'legacy-conversation', ?, ?, ?, ?, 'legacy-bot', ?, ?, ?
         )`,
      ).run(
        `${CANARY}:source-title`,
        NOW,
        `${CANARY}:source-role`,
        JSON.stringify(["legacy-bot"]),
        `${CANARY}:display-prompt`,
        NOW,
        NOW,
      );
      db.close();
      db = null;

      db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
      assert.equal(
        (
          db
            .prepare(
              "SELECT name FROM bots WHERE user_id = ? AND id = ?",
            )
            .get("legacy-owner", "legacy-bot") as { name: string }
        ).name,
        `Bot ${CANARY}`,
      );
      assert.deepEqual(
        readPrismActionProposal(
          db,
          "legacy-owner",
          "legacy-proposal",
          userKey,
        )?.input,
        { canary: CANARY },
      );
      assert.match(
        (
          db
            .prepare(
              `SELECT idempotency_key
                 FROM main.prism_action_runs
                WHERE user_id = ? AND id = ?`,
            )
            .get("legacy-owner", "legacy-run") as {
            idempotency_key: string;
          }
        ).idempotency_key,
        /^pi2_[a-f0-9]{64}$/u,
      );

      const cellFixtures = [];
      for (const table of CORE_CONTENT_VAULT_TABLES) {
        const encrypted = Object.entries(table.columns).flatMap(
          ([column, contract]) =>
            contract.disposition === "encrypted" ? [column] : [],
        );
        if (encrypted.length === 0) continue;
        const rows = db
          .prepare(
            `SELECT ${encrypted.map((column) => `"${column}"`).join(", ")}
               FROM main."${table.table}"
              WHERE user_id = ?`,
          )
          .all("legacy-owner") as Array<Record<string, unknown>>;
        rows.forEach((row, rowIndex) => {
          for (const column of encrypted) {
            const value = row[column];
            if (value === null) continue;
            assert.ok(
              value instanceof Uint8Array,
              `${table.table}.${column} must be a Vault envelope`,
            );
            cellFixtures.push({
              opaqueSurfaceId: createOpaqueCanarySurfaceId(
                "sqlite-main",
                `${table.table}:${column}:${rowIndex}`,
              ),
              kind: "sqlite-main" as const,
              bytes: value,
            });
          }
        });
      }
      assert.equal(
        scanForPlaintextCanary(CANARY, cellFixtures).totalMatchCount,
        0,
      );
      assert.deepEqual(
        {
          ...(db
            .prepare(
              `SELECT phase, completed_units, total_units
                 FROM main.core_content_vault_migrations
                WHERE user_id = ? AND contract_version = ?`,
            )
            .get(
              "legacy-owner",
              CORE_CONTENT_VAULT_CONTRACT_VERSION,
            ) as Record<string, unknown>),
        },
        {
          phase: "complete",
          completed_units: (
            db
              .prepare(
                `SELECT total_units
                   FROM main.core_content_vault_migrations
                  WHERE user_id = ? AND contract_version = ?`,
              )
              .get("legacy-owner", CORE_CONTENT_VAULT_CONTRACT_VERSION) as {
              total_units: number;
            }
          ).total_units,
          total_units: (
            db
              .prepare(
                `SELECT total_units
                   FROM main.core_content_vault_migrations
                  WHERE user_id = ? AND contract_version = ?`,
              )
              .get("legacy-owner", CORE_CONTENT_VAULT_CONTRACT_VERSION) as {
              total_units: number;
            }
          ).total_units,
        },
      );

      db.close();
      db = null;
      const diskFixtures = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]
        .filter(existsSync)
        .map((path) => ({
          opaqueSurfaceId: createOpaqueCanarySurfaceId(
            "sqlite-file",
            path.slice(dbPath.length),
          ),
          kind: path.endsWith("-wal")
            ? ("sqlite-wal" as const)
            : path.endsWith("-shm")
              ? ("sqlite-shm" as const)
              : ("sqlite-main" as const),
          bytes: readFileSync(path),
        }));
      assert.equal(
        scanForPlaintextCanary(CANARY, diskFixtures).totalMatchCount,
        0,
      );

      db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
      db.prepare(
        `UPDATE main.core_content_vault_migrations
            SET phase = 'migrating'
          WHERE user_id = ? AND contract_version = ?`,
      ).run("legacy-owner", CORE_CONTENT_VAULT_CONTRACT_VERSION);
      db.exec(`
        DROP TRIGGER IF EXISTS main.owner_guard_coffee_context_sparks_update;
        CREATE TRIGGER main.owner_guard_coffee_context_sparks_update
        BEFORE UPDATE OF source_participant_bot_ids ON coffee_context_sparks
        WHEN typeof(NEW.source_participant_bot_ids) = 'blob'
        BEGIN
          SELECT RAISE(ABORT, 'owner_constraint_violation');
        END;
      `);
      db.close();
      db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
      assert.equal(
        (
          db
            .prepare(
              "SELECT title FROM conversations WHERE user_id = ? AND id = ?",
            )
            .get("legacy-owner", "legacy-conversation") as { title: string }
        ).title,
        `${CANARY}:title`,
      );
      assert.equal(
        (
          db
            .prepare(
              `SELECT phase FROM main.core_content_vault_migrations
                WHERE user_id = ? AND contract_version = ?`,
            )
            .get("legacy-owner", CORE_CONTENT_VAULT_CONTRACT_VERSION) as {
            phase: string;
          }
        ).phase,
        "complete",
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT display_prompt FROM coffee_context_sparks WHERE user_id = ? AND id = ?",
            )
            .get("legacy-owner", "legacy-spark") as { display_prompt: string }
        ).display_prompt,
        `${CANARY}:display-prompt`,
      );
      assert.match(
        (
          db
            .prepare(
              "SELECT sql FROM main.sqlite_master WHERE type = 'trigger' AND name = 'owner_guard_coffee_context_sparks_update'",
            )
            .get() as { sql: string }
        ).sql,
        /typeof\(NEW\."source_participant_bot_ids"\) = 'blob'/u,
      );

      db.prepare(
        "UPDATE prism_action_proposals SET input_json = ? WHERE user_id = ? AND id = ?",
      ).run(
        JSON.stringify({ ordinaryPlaintextFallback: CANARY }),
        "legacy-owner",
        "legacy-proposal",
      );
      assert.throws(() =>
        readPrismActionProposal(
          db!,
          "legacy-owner",
          "legacy-proposal",
          userKey,
        ),
      );
      db.prepare(
        "UPDATE main.bots SET name = ? WHERE user_id = ? AND id = ?",
      ).run(CANARY, "legacy-owner", "legacy-bot");
      assert.throws(() =>
        db!
          .prepare("SELECT name FROM bots WHERE user_id = ? AND id = ?")
          .get("legacy-owner", "legacy-bot"),
      );
    } finally {
      legacyMasterKey.fill(0);
      userKey.fill(0);
      db?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
