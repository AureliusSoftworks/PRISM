import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  applyPreparedDatabaseChangeset,
  capturePreparedDatabaseChangeset,
  createUserScopedPreparedDatabase,
} from "../prepared-db-changeset.ts";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      value TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO items VALUES (?, ?, ?)").run("a", "one", "before");
  db.prepare("INSERT INTO items VALUES (?, ?, ?)").run("b", "two", "private");
  return db;
}

test("prepared database changes remain isolated until applied", () => {
  const live = database();
  const prepared = createUserScopedPreparedDatabase(live, "one", ["items"]);
  prepared.db
    .prepare("UPDATE items SET value = ? WHERE id = ?")
    .run("after", "a");
  prepared.db
    .prepare("INSERT INTO items VALUES (?, ?, ?)")
    .run("c", "one", "new");

  assert.equal(
    (live.prepare("SELECT value FROM items WHERE id = ?").get("a") as {
      value: string;
    }).value,
    "before",
  );
  assert.equal(
    (
      prepared.db
        .prepare("SELECT count(*) AS count FROM items WHERE user_id = ?")
        .get("two") as { count: number }
    ).count,
    0,
  );

  const changeset = capturePreparedDatabaseChangeset(
    prepared.db,
    prepared.session,
  );
  applyPreparedDatabaseChangeset(live, changeset);

  assert.equal(
    (live.prepare("SELECT value FROM items WHERE id = ?").get("a") as {
      value: string;
    }).value,
    "after",
  );
  assert.equal(
    (live.prepare("SELECT value FROM items WHERE id = ?").get("c") as {
      value: string;
    }).value,
    "new",
  );
  assert.equal(
    (live.prepare("SELECT value FROM items WHERE id = ?").get("b") as {
      value: string;
    }).value,
    "private",
  );
  live.close();
});

test("conflicting live changes abort prepared application", () => {
  const live = database();
  const prepared = createUserScopedPreparedDatabase(live, "one", ["items"]);
  prepared.db
    .prepare("UPDATE items SET value = ? WHERE id = ?")
    .run("prepared", "a");
  const changeset = capturePreparedDatabaseChangeset(
    prepared.db,
    prepared.session,
  );
  live.prepare("UPDATE items SET value = ? WHERE id = ?").run("newer", "a");

  assert.throws(
    () => applyPreparedDatabaseChangeset(live, changeset),
    /conflicted/iu,
  );
  assert.equal(
    (live.prepare("SELECT value FROM items WHERE id = ?").get("a") as {
      value: string;
    }).value,
    "newer",
  );
  live.close();
});
