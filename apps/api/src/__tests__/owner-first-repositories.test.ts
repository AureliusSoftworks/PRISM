import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ts from "typescript";
import {
  OWNER_CONSTRAINT_ERROR,
  assertAccountOwnerRelationCoverage,
  inspectAccountContentOwnerRelations,
} from "../account-owner-boundaries.ts";
import {
  LegacyOwnerValidationError,
  assertLegacyAccountOwnersValid,
  validateLegacyAccountOwners,
} from "../legacy-owner-validator.ts";
import {
  OWNER_SCOPED_NOT_FOUND_MESSAGE,
  OwnerScopedNotFoundError,
  createOwnerFirstRepository,
} from "../owner-first-repository.ts";
import { loadCoffeeGroupProfiles } from "../coffee.ts";
import { buildPrismCompanionAuthoritativeContext } from "../prism-companion.ts";
import { createStorySession } from "../story.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

const NOW = "2026-09-01T20:00:00.000Z";

function addUser(db: ReturnType<typeof createTestDatabase>, id: string): void {
  db.prepare(
    `INSERT INTO users (
       id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at
     ) VALUES (?, ?, ?, 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.com`, id.toUpperCase(), NOW, NOW);
}

function addBot(
  db: ReturnType<typeof createTestDatabase>,
  id: string,
  userId: string,
  visibility: "private" | "public" = "private",
): void {
  db.prepare(
    `INSERT INTO bots (id, user_id, name, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, `Bot ${id}`, visibility, NOW, NOW);
}

function sqliteErrorMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
  assert.fail("Expected SQLite owner enforcement to reject the write.");
}

function fourOwnerFixture() {
  const db = createTestDatabase();
  for (const id of ["owner-a", "owner-b", "owner-c", "owner-d"]) addUser(db, id);
  return db;
}

describe("owner-first repositories", () => {
  it("allows metadata-only archive of a stale legacy relationship without weakening owner changes", () => {
    const db = fourOwnerFixture();
    try {
      addBot(db, "legacy-bot", "owner-a");
      addBot(db, "other-owner-bot", "owner-b");
      db.prepare(
        `INSERT INTO conversations (
           id, user_id, title, conversation_mode, bot_id, created_at, updated_at
         ) VALUES (?, ?, ?, 'chat', ?, ?, ?)`,
      ).run(
        "legacy-chat",
        "owner-a",
        "Legacy chat",
        "legacy-bot",
        NOW,
        NOW,
      );
      db.prepare("DELETE FROM bots WHERE id = ? AND user_id = ?").run(
        "legacy-bot",
        "owner-a",
      );

      assert.equal(
        Number(
          db.prepare(
            "UPDATE conversations SET archived_at = ?, archive_batch_id = ? WHERE id = ? AND user_id = ?",
          ).run(NOW, "distill:test", "legacy-chat", "owner-a").changes,
        ),
        1,
      );
      assert.match(
        sqliteErrorMessage(() =>
          db.prepare(
            "UPDATE conversations SET bot_id = ? WHERE id = ? AND user_id = ?",
          ).run("other-owner-bot", "legacy-chat", "owner-a"),
        ),
        new RegExp(OWNER_CONSTRAINT_ERROR, "u"),
      );
      assert.match(
        sqliteErrorMessage(() =>
          db.prepare(
            `INSERT INTO conversations (
               id, user_id, title, conversation_mode, bot_id, created_at, updated_at
             ) VALUES (?, ?, ?, 'chat', ?, ?, ?)`,
          ).run(
            "invalid-new-chat",
            "owner-a",
            "Invalid",
            "other-owner-bot",
            NOW,
            NOW,
          ),
        ),
        new RegExp(OWNER_CONSTRAINT_ERROR, "u"),
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("resolves identical row ids inside four independent owners and deletes only one owner", () => {
    const db = fourOwnerFixture();
    try {
      for (const ownerId of ["owner-a", "owner-b", "owner-c", "owner-d"]) {
        db.prepare(
          `INSERT INTO library_groups
             (id, user_id, name, created_at, updated_at)
           VALUES ('same-id', ?, ?, ?, ?)`,
        ).run(ownerId, `Group ${ownerId}`, NOW, NOW);
      }
      db.prepare(
        `INSERT INTO library_groups
           (id, user_id, name, created_at, updated_at)
         VALUES ('owner-a-only', 'owner-a', 'Private A', ?, ?)`,
      ).run(NOW, NOW);
      addBot(db, "member-a", "owner-a");
      addBot(db, "member-b", "owner-b");
      db.prepare(
        `INSERT INTO library_group_members
           (user_id, group_id, bot_id, added_at, updated_at)
         VALUES (?, 'same-id', ?, ?, ?)`,
      ).run("owner-a", "member-a", NOW, NOW);
      db.prepare(
        `INSERT INTO library_group_members
           (user_id, group_id, bot_id, added_at, updated_at)
         VALUES (?, 'same-id', ?, ?, ?)`,
      ).run("owner-b", "member-b", NOW, NOW);

      const groups = createOwnerFirstRepository<{
        id: string;
        user_id: string;
        name: string;
      }>(db, {
        table: "library_groups",
        columns: ["id", "user_id", "name"],
      });
      for (const ownerId of ["owner-a", "owner-b", "owner-c", "owner-d"]) {
        assert.equal(groups.requireById(ownerId, "same-id").user_id, ownerId);
      }

      let crossOwnerError: Error | null = null;
      let missingError: Error | null = null;
      try {
        groups.requireById("owner-b", "owner-a-only");
      } catch (error) {
        crossOwnerError = error as Error;
      }
      try {
        groups.requireById("owner-b", "missing-id");
      } catch (error) {
        missingError = error as Error;
      }
      assert.ok(crossOwnerError instanceof OwnerScopedNotFoundError);
      assert.ok(missingError instanceof OwnerScopedNotFoundError);
      assert.equal(crossOwnerError.message, OWNER_SCOPED_NOT_FOUND_MESSAGE);
      assert.equal(missingError.message, OWNER_SCOPED_NOT_FOUND_MESSAGE);

      assert.equal(groups.deleteById("owner-a", "same-id"), true);
      assert.equal(groups.findById("owner-a", "same-id"), undefined);
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM library_group_members WHERE user_id = ? AND group_id = ?",
            )
            .get("owner-a", "same-id") as { count: number }
        ).count,
        0,
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM library_group_members WHERE user_id = ? AND group_id = ?",
            )
            .get("owner-b", "same-id") as { count: number }
        ).count,
        1,
      );
      for (const ownerId of ["owner-b", "owner-c", "owner-d"]) {
        assert.equal(groups.findById(ownerId, "same-id")?.user_id, ownerId);
      }
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("account owner relational enforcement", () => {
  it("rejects missing and cross-owner group, bot, conversation, and session parents identically", () => {
    const db = fourOwnerFixture();
    try {
      addBot(db, "bot-a", "owner-a");
      addBot(db, "bot-b", "owner-b");
      db.prepare(
        `INSERT INTO library_groups
           (id, user_id, name, created_at, updated_at)
         VALUES ('group-a', 'owner-a', 'A group', ?, ?)`,
      ).run(NOW, NOW);
      const memberInsert = db.prepare(
        `INSERT INTO library_group_members
           (user_id, group_id, bot_id, added_at, updated_at)
         VALUES ('owner-a', 'group-a', ?, ?, ?)`,
      );
      const crossMember = sqliteErrorMessage(() =>
        memberInsert.run("bot-b", NOW, NOW),
      );
      const missingMember = sqliteErrorMessage(() =>
        memberInsert.run("missing-bot", NOW, NOW),
      );
      assert.equal(crossMember, OWNER_CONSTRAINT_ERROR);
      assert.equal(missingMember, OWNER_CONSTRAINT_ERROR);

      db.prepare(
        `INSERT INTO conversations
           (id, user_id, title, created_at, updated_at)
         VALUES ('conversation-a', 'owner-a', 'A', ?, ?)`,
      ).run(NOW, NOW);
      const messageInsert = db.prepare(
        `INSERT INTO messages
           (id, conversation_id, user_id, role, content, created_at)
         VALUES (?, ?, 'owner-b', 'user', 'opaque', ?)`,
      );
      const crossConversation = sqliteErrorMessage(() =>
        messageInsert.run("cross-message", "conversation-a", NOW),
      );
      const missingConversation = sqliteErrorMessage(() =>
        messageInsert.run("missing-message", "missing-conversation", NOW),
      );
      assert.equal(crossConversation, OWNER_CONSTRAINT_ERROR);
      assert.equal(missingConversation, OWNER_CONSTRAINT_ERROR);

      db.prepare(
        `INSERT INTO botcast_shows
           (id, user_id, host_bot_id, name, premise, hosting_style,
            accent_color, created_at, updated_at)
         VALUES ('show-a', 'owner-a', 'bot-a', 'Show', 'Premise', 'Style',
                 '#abcdef', ?, ?)`,
      ).run(NOW, NOW);
      const episodeInsert = db.prepare(
        `INSERT INTO botcast_episodes
           (id, user_id, show_id, host_bot_id, guest_bot_id, guest_kind,
            guest_name, title, topic, started_at, created_at, updated_at)
         VALUES (?, 'owner-b', ?, 'bot-b', 'bot-b', 'bot', 'B', 'Episode',
                 'Topic', ?, ?, ?)`,
      );
      const crossShow = sqliteErrorMessage(() =>
        episodeInsert.run("cross-episode", "show-a", NOW, NOW, NOW),
      );
      const missingShow = sqliteErrorMessage(() =>
        episodeInsert.run("missing-episode", "missing-show", NOW, NOW, NOW),
      );
      assert.equal(crossShow, OWNER_CONSTRAINT_ERROR);
      assert.equal(missingShow, OWNER_CONSTRAINT_ERROR);

      assert.equal(
        (
          db
            .prepare(
              `SELECT COUNT(*) AS count
                 FROM library_group_members
                WHERE user_id = 'owner-a'`,
            )
            .get() as { count: number }
        ).count,
        0,
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("registers every account-content relation and records native-FK rebuild follow-ups", () => {
    const db = fourOwnerFixture();
    try {
      const coverage = assertAccountOwnerRelationCoverage(db);
      const relations = inspectAccountContentOwnerRelations(db);
      assert.equal(relations.length, coverage.relationCount);
      assert.ok(coverage.relationCount > 300);
      assert.ok(coverage.triggerBackedCount > 150);
      assert.ok(coverage.nativeCompositeCount >= 2);
      assert.equal(coverage.derivedOwnerCount, 2);
      assert.equal(
        relations
          .filter(
            (relation) =>
              relation.enforcement === "trigger-backed-composite-owner-check" ||
              relation.enforcement === "derived-owner-trigger",
          )
          .every((relation) => Boolean(relation.followUp)),
        true,
      );
      const botIndexes = db.prepare("PRAGMA index_list(bots)").all() as Array<{
        name: string;
        unique: number;
      }>;
      assert.equal(
        botIndexes.some(
          (index) => index.name === "owner_pair_bots_id" && index.unique === 1,
        ),
        true,
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("legacy owner validation", () => {
  it("halts on unowned and cross-owner rows without disclosing raw ids or changing owners", () => {
    const db = fourOwnerFixture();
    try {
      addBot(db, "sensitive-bot-a", "owner-a");
      addBot(db, "sensitive-bot-b", "owner-b");
      db.prepare(
        `INSERT INTO library_groups
           (id, user_id, name, created_at, updated_at)
         VALUES ('sensitive-group-a', 'owner-a', 'A', ?, ?)`,
      ).run(NOW, NOW);

      db.exec("DROP TRIGGER owner_guard_library_group_members_insert");
      db.exec("DROP TRIGGER owner_row_guard_bots_insert");
      db.prepare(
        `INSERT INTO library_group_members
           (user_id, group_id, bot_id, added_at, updated_at)
         VALUES ('owner-a', 'sensitive-group-a', 'sensitive-bot-b', ?, ?)`,
      ).run(NOW, NOW);
      db.exec("PRAGMA foreign_keys = OFF");
      addBot(db, "sensitive-unowned-bot", "ghost-owner");
      db.exec("PRAGMA foreign_keys = ON");
      db.exec(`
        CREATE TABLE legacy_same_ids (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        INSERT INTO legacy_same_ids (user_id, id)
        VALUES ('ghost-owner-a', 'same-sensitive-id'),
               ('ghost-owner-b', 'same-sensitive-id');
      `);

      const report = validateLegacyAccountOwners(db, {
        opaqueIdKey: Buffer.alloc(32, 7),
      });
      assert.ok(report.violationCount >= 2);
      assert.equal(
        report.violations.some((violation) => violation.table === "bots"),
        true,
      );
      assert.equal(
        report.violations.some(
          (violation) => violation.table === "library_group_members",
        ),
        true,
      );
      const sameIdViolation = report.violations.find(
        (violation) => violation.table === "legacy_same_ids",
      );
      assert.equal(sameIdViolation?.count, 2);
      assert.equal(sameIdViolation?.opaqueRowIds.length, 2);
      assert.equal(new Set(sameIdViolation?.opaqueRowIds).size, 2);
      assert.equal(
        report.violations.every((violation) =>
          violation.opaqueRowIds.every((id) => /^row:[a-f0-9]{24}$/u.test(id)),
        ),
        true,
      );
      const serialized = JSON.stringify(report);
      for (const sensitive of [
        "sensitive-bot-a",
        "sensitive-bot-b",
        "sensitive-unowned-bot",
        "sensitive-group-a",
        "owner-a",
        "owner-b",
        "ghost-owner",
        "ghost-owner-a",
        "ghost-owner-b",
        "same-sensitive-id",
      ]) {
        assert.equal(serialized.includes(sensitive), false);
      }

      let validationError: LegacyOwnerValidationError | null = null;
      try {
        assertLegacyAccountOwnersValid(db, {
          opaqueIdKey: Buffer.alloc(32, 7),
        });
      } catch (error) {
        if (error instanceof LegacyOwnerValidationError) validationError = error;
      }
      assert.ok(validationError instanceof LegacyOwnerValidationError);
      assert.equal(validationError.message, "Legacy account ownership validation failed.");
      assert.equal(
        (
          db
            .prepare("SELECT user_id FROM bots WHERE id = 'sensitive-unowned-bot'")
            .get() as { user_id: string }
        ).user_id,
        "ghost-owner",
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("public bot runtime boundary", () => {
  it("denies legacy public rows in Coffee and companion context like missing rows", () => {
    const db = fourOwnerFixture();
    try {
      addBot(db, "legacy-public-bot", "owner-a", "public");
      addBot(db, "owned-story-bot", "owner-b");
      const crossCoffee = sqliteErrorMessage(() =>
        loadCoffeeGroupProfiles(db, "owner-b", ["legacy-public-bot"]),
      );
      const missingCoffee = sqliteErrorMessage(() =>
        loadCoffeeGroupProfiles(db, "owner-b", ["missing-bot"]),
      );
      assert.equal(crossCoffee, missingCoffee);

      const crossContext = buildPrismCompanionAuthoritativeContext(
        db,
        "owner-b",
        "B",
        { surfaceId: "coffee", botIds: ["legacy-public-bot"] },
      );
      const missingContext = buildPrismCompanionAuthoritativeContext(
        db,
        "owner-b",
        "B",
        { surfaceId: "coffee", botIds: ["missing-bot"] },
      );
      assert.deepEqual(crossContext.bots, []);
      assert.deepEqual(crossContext.bots, missingContext.bots);

      const crossStory = sqliteErrorMessage(() =>
        createStorySession(db, "owner-b", {
          botIds: ["owned-story-bot", "legacy-public-bot"],
          provider: "local",
        }),
      );
      const missingStory = sqliteErrorMessage(() =>
        createStorySession(db, "owner-b", {
          botIds: ["owned-story-bot", "missing-bot"],
          provider: "local",
        }),
      );
      assert.equal(crossStory, OWNER_SCOPED_NOT_FOUND_MESSAGE);
      assert.equal(crossStory, missingStory);
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM story_sessions WHERE user_id = ?",
            )
            .get("owner-b") as { count: number }
        ).count,
        0,
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("keeps every audited bot runtime source free of cross-owner public-row SQL", () => {
    for (const path of [
      new URL("../server.ts", import.meta.url),
      new URL("../chat.ts", import.meta.url),
      new URL("../coffee.ts", import.meta.url),
      new URL("../botcast.ts", import.meta.url),
      new URL("../debate.ts", import.meta.url),
      new URL("../story.ts", import.meta.url),
      new URL("../zen-session-memory.ts", import.meta.url),
      new URL("../prism-companion.ts", import.meta.url),
    ]) {
      const source = readFileSync(path, "utf8");
      assert.doesNotMatch(source, /visibility\s*=\s*'public'/u);
      assert.doesNotMatch(source, /OR\s+visibility/u);
    }
  });

  it("keeps every bot read in API source owner-qualified before row use", () => {
    const sourceRoot = new URL("../", import.meta.url);
    const unsafeSites: string[] = [];
    for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const sourceUrl = new URL(entry.name, sourceRoot);
      const source = readFileSync(sourceUrl, "utf8");
      const sourceFile = ts.createSourceFile(
        entry.name,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const inspect = (node: ts.Node): void => {
        if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
          const sql = node.getText(sourceFile).replace(/\s+/gu, " ");
          const ownerlessFrom =
            /\bFROM\s+bots\b/iu.test(sql) &&
            !/\bFROM\s+bots\b[\s\S]*?\bWHERE\b[\s\S]*?\buser_id\b/iu.test(
              sql,
            );
          const ownerlessJoin =
            /\bJOIN\s+bots\b/iu.test(sql) &&
            !/\bJOIN\s+bots\b[\s\S]*?\bON\b[\s\S]*?\buser_id\b/iu.test(sql);
          const auditedOfflineCleanupEnumeration =
            entry.name === "legacy-avatar-cleanup.ts" &&
            /SELECT\s+id,\s*user_id,[\s\S]*FROM\s+bots\s+ORDER\s+BY\s+id/iu.test(
              sql,
            );
          if (
            (ownerlessFrom || ownerlessJoin) &&
            !auditedOfflineCleanupEnumeration
          ) {
            const position = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile),
            );
            unsafeSites.push(`${entry.name}:${position.line + 1}`);
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(sourceFile);
    }
    assert.deepEqual(unsafeSites, []);
  });

  it("keeps every account-content primary-id operation owner-qualified", () => {
    const db = fourOwnerFixture();
    let ownerTables: string[];
    try {
      ownerTables = (
        db
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all() as Array<{ name: string }>
      )
        .map((row) => row.name)
        .filter((table) =>
          (
            db.prepare(`PRAGMA table_xinfo("${table}")`).all() as Array<{
              name: string;
            }>
          ).some((column) => column.name === "user_id"),
        );
    } finally {
      closeTestDatabase(db);
    }

    const sourceRoot = new URL("../", import.meta.url);
    const unsafeSites: string[] = [];
    for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const sourceUrl = new URL(entry.name, sourceRoot);
      const source = readFileSync(sourceUrl, "utf8");
      const sourceFile = ts.createSourceFile(
        entry.name,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const inspect = (node: ts.Node): void => {
        if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
          const sql = node.getText(sourceFile);
          if (
            /(?:\b[A-Za-z_][A-Za-z0-9_]*\.)?\bid\s*(?:=\s*\?|IN\s*\()/iu.test(
              sql,
            ) &&
            !/\buser_id\b/iu.test(sql)
          ) {
            for (const table of ownerTables) {
              const touchesOwnerTable = new RegExp(
                `\\b(?:FROM|JOIN|UPDATE|DELETE\\s+FROM)\\s+${table}\\b`,
                "iu",
              ).test(sql);
              if (!touchesOwnerTable) continue;
              const position = sourceFile.getLineAndCharacterOfPosition(
                node.getStart(sourceFile),
              );
              unsafeSites.push(`${entry.name}:${position.line + 1}:${table}`);
            }
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(sourceFile);
    }
    assert.deepEqual(Array.from(new Set(unsafeSites)).sort(), []);
  });

  it("keeps every scalar owner-parent lookup owner-qualified in the same statement", () => {
    const db = fourOwnerFixture();
    let relationColumns: Array<{ table: string; column: string }>;
    try {
      relationColumns = Array.from(
        new Map(
          inspectAccountContentOwnerRelations(db).flatMap((relation) =>
            relation.childOwnerColumn === "user_id"
              ? relation.childColumns
                  .filter((column) => column !== "user_id")
                  .map((column) => [
                    `${relation.childTable}.${column}`,
                    { table: relation.childTable, column },
                  ] as const)
              : [],
          ),
        ).values(),
      );
    } finally {
      closeTestDatabase(db);
    }

    const sourceRoot = new URL("../", import.meta.url);
    const unsafeSites: string[] = [];
    for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const sourceUrl = new URL(entry.name, sourceRoot);
      const source = readFileSync(sourceUrl, "utf8");
      const sourceFile = ts.createSourceFile(
        entry.name,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const inspect = (node: ts.Node): void => {
        if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
          const sql = node.getText(sourceFile);
          if (!/\buser_id\b/iu.test(sql)) {
            for (const relation of relationColumns) {
              const touchesChild = new RegExp(
                `\\b(?:FROM|JOIN|UPDATE|DELETE FROM)\\s+${relation.table}\\b`,
                "iu",
              ).test(sql);
              const fetchesByRelation = new RegExp(
                `\\b${relation.column}\\s*(?:=\\s*\\?|IN\\s*\\()`,
                "iu",
              ).test(sql);
              if (!touchesChild || !fetchesByRelation) continue;
              const position = sourceFile.getLineAndCharacterOfPosition(
                node.getStart(sourceFile),
              );
              unsafeSites.push(
                `${entry.name}:${position.line + 1}:${relation.table}.${relation.column}`,
              );
            }
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(sourceFile);
    }
    assert.deepEqual(Array.from(new Set(unsafeSites)).sort(), []);
  });
});
