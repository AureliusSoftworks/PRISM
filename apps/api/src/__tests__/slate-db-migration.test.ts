import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeDatabase } from "../db.ts";
import { closeTestDatabase, createTestDatabase } from "../test-support.ts";

const NEW_SLATE_TABLES_CHILD_FIRST = [
  "slate_continuity_context_briefs",
  "slate_continuity_source_indexes",
  "slate_continuity_jobs",
  "slate_continuity_concerns",
  "slate_continuity_knowledge",
  "slate_continuity_relationships",
  "slate_continuity_events",
  "slate_continuity_claims",
  "slate_continuity_aliases",
  "slate_continuity_entities",
  "slate_continuity_sources",
  "slate_continuity_generations",
  "slate_manuscript_exports",
  "slate_return_sessions",
  "slate_section_versions",
  "slate_manuscript_state",
  "slate_sections",
  "slate_revisions",
  "slate_versions",
  "slate_projects",
  "slate_series",
] as const;

describe("Slate schema migration", () => {
  it("places pre-series projects in deterministic private series without losing prose", () => {
    const db = createTestDatabase();
    try {
      db.prepare(
        `INSERT INTO users
          (id, email, display_name, password_hash, password_salt,
           wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
           created_at, last_active_at)
         VALUES ('legacy-author', 'legacy@example.test', 'Legacy', 'hash',
                 'salt', 'wrapped', 'iv', 'tag', ?, ?)`,
      ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

      db.exec("PRAGMA foreign_keys = OFF");
      for (const table of NEW_SLATE_TABLES_CHILD_FIRST) {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
      }
      db.exec(`
        CREATE TABLE slate_projects (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          spark TEXT NOT NULL,
          spark_wildcards_json TEXT NOT NULL DEFAULT '',
          premise TEXT NOT NULL DEFAULT '',
          voice TEXT NOT NULL DEFAULT '',
          non_negotiables_json TEXT NOT NULL DEFAULT '[]',
          phase TEXT NOT NULL DEFAULT 'shape',
          structure_json TEXT NOT NULL DEFAULT '[]',
          characters_json TEXT NOT NULL DEFAULT '[]',
          unresolved_threads_json TEXT NOT NULL DEFAULT '[]',
          manuscript TEXT NOT NULL DEFAULT '',
          direction TEXT NOT NULL DEFAULT '',
          locked_ranges_json TEXT NOT NULL DEFAULT '[]',
          last_provider TEXT,
          last_model TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
      const prose = "  Every byte of the old manuscript survives.\n\nEven this line.  ";
      db.prepare(
        `INSERT INTO slate_projects
          (id, user_id, title, spark, manuscript, created_at, updated_at)
         VALUES ('legacy-book', 'legacy-author', 'Old Book', 'Old spark', ?, ?, ?)`,
      ).run(
        prose,
        "2026-01-01T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
      );
      db.exec("PRAGMA foreign_keys = ON");

      initializeDatabase(db);

      const project = db
        .prepare(
          `SELECT series_id, manuscript, continuity_active_version,
                  continuity_upgrade_status
             FROM slate_projects WHERE id = 'legacy-book'`,
        )
        .get() as {
        series_id: string;
        manuscript: string;
        continuity_active_version: string;
        continuity_upgrade_status: string;
      };
      assert.deepEqual({ ...project }, {
        series_id: "legacy-series-legacy-book",
        manuscript: prose,
        continuity_active_version: "0.0",
        continuity_upgrade_status: "current",
      });
      const series = db
        .prepare(
          `SELECT user_id, title FROM slate_series
            WHERE id = 'legacy-series-legacy-book'`,
        )
        .get() as { user_id: string; title: string };
      assert.deepEqual({ ...series }, {
        user_id: "legacy-author",
        title: "Old Book",
      });
      const sectionTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'slate_sections'",
        )
        .get() as { name: string } | undefined;
      assert.equal(sectionTable?.name, "slate_sections");
    } finally {
      closeTestDatabase(db);
    }
  });
});
