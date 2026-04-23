import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  GENERATED_IMAGE_RETENTION_DAYS,
  getGeneratedImageCutoff,
  isExpiredImage,
  purgeExpiredImages,
} from "../image-retention.ts";

/** Minimal images table matching the shape purgeExpiredImages touches. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function seedImage(
  db: DatabaseSync,
  id: string,
  createdAt: string
): void {
  db.prepare(
    "INSERT INTO images (id, user_id, prompt, url, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, "user-1", "a cat", "http://example.com/cat.png", createdAt);
}

describe("generated image retention", () => {
  it("computes the cutoff from the configured retention window", () => {
    const now = new Date("2026-04-22T00:00:00.000Z");
    const cutoff = getGeneratedImageCutoff(now);
    assert.equal(cutoff.toISOString(), "2026-03-23T00:00:00.000Z");
    assert.equal(GENERATED_IMAGE_RETENTION_DAYS, 30);
  });

  it("flags images as expired only after the cutoff", () => {
    const now = new Date("2026-04-22T00:00:00.000Z");
    // 30 days + 1 second old -> expired.
    assert.equal(
      isExpiredImage("2026-03-22T23:59:59.000Z", now),
      true
    );
    // 30 days - 1 second old -> still fresh.
    assert.equal(
      isExpiredImage("2026-03-23T00:00:01.000Z", now),
      false
    );
  });

  it("deletes only the rows older than the retention window", () => {
    const db = createTestDb();
    const now = new Date("2026-04-22T00:00:00.000Z");
    // 31 days old: should be purged.
    seedImage(db, "old", "2026-03-22T00:00:00.000Z");
    // 1 hour old: should survive.
    seedImage(db, "fresh", "2026-04-21T23:00:00.000Z");

    const removed = purgeExpiredImages(db, now);
    assert.equal(removed, 1);

    const survivors = db
      .prepare("SELECT id FROM images ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      survivors.map((row) => row.id),
      ["fresh"]
    );
  });

  it("is a no-op when nothing is old enough to purge", () => {
    const db = createTestDb();
    const now = new Date("2026-04-22T00:00:00.000Z");
    seedImage(db, "a", "2026-04-21T00:00:00.000Z");
    seedImage(db, "b", "2026-04-20T00:00:00.000Z");

    const removed = purgeExpiredImages(db, now);
    assert.equal(removed, 0);

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM images").get() as { n: number }).n,
      2
    );
  });
});
