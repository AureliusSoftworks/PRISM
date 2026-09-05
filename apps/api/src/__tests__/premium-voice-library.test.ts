import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  findPremiumVoiceLibraryEntry,
  listPremiumVoiceLibrary,
  restorePremiumVoiceLibrary,
  savePremiumVoiceLibraryEntry,
} from "../premium-voice-library.ts";

function createLibraryDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY);");
  db.exec("INSERT INTO users (id) VALUES ('user-a'), ('user-b');");
  db.exec(`
    CREATE TABLE premium_voice_library (
      user_id TEXT NOT NULL,
      source_voice_id TEXT NOT NULL,
      provider_voice_id TEXT NOT NULL,
      public_owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('professional', 'high_quality')),
      description TEXT,
      preview_url TEXT,
      labels_json TEXT NOT NULL DEFAULT '{}',
      native_accent_hint TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, source_voice_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  return db;
}

const voice = {
  sourceVoiceId: "source-a",
  providerVoiceId: "provider-a",
  publicOwnerId: "owner-a",
  name: "Avery",
  category: "professional" as const,
  description: "Warm narrator",
  previewUrl: "https://example.test/avery.mp3",
  labels: { accent: "American" },
  nativeAccentHint: "American",
};

describe("PRISM Premium voice library", () => {
  it("is tenant-scoped and idempotent per shared source voice", () => {
    const db = createLibraryDatabase();
    try {
      const first = savePremiumVoiceLibraryEntry(
        db,
        "user-a",
        voice,
        "2026-08-20T12:00:00.000Z",
      );
      const repeated = savePremiumVoiceLibraryEntry(
        db,
        "user-a",
        { ...voice, providerVoiceId: "should-not-replace", name: "Changed" },
        "2026-08-20T13:00:00.000Z",
      );
      const otherTenant = savePremiumVoiceLibraryEntry(
        db,
        "user-b",
        { ...voice, providerVoiceId: "provider-b" },
        "2026-08-20T14:00:00.000Z",
      );

      assert.equal(first.created, true);
      assert.equal(repeated.created, false);
      assert.equal(repeated.entry.providerVoiceId, "provider-a");
      assert.equal(repeated.entry.name, "Avery");
      assert.equal(otherTenant.created, true);
      assert.equal(otherTenant.entry.providerVoiceId, "provider-b");
      assert.equal(listPremiumVoiceLibrary(db, "user-a").length, 1);
      assert.equal(listPremiumVoiceLibrary(db, "user-b").length, 1);
    } finally {
      db.close();
    }
  });

  it("restores one account without changing another account's library", () => {
    const db = createLibraryDatabase();
    try {
      savePremiumVoiceLibraryEntry(db, "user-a", voice);
      savePremiumVoiceLibraryEntry(db, "user-b", {
        ...voice,
        providerVoiceId: "provider-b",
      });
      restorePremiumVoiceLibrary(db, "user-a", [{
        ...voice,
        sourceVoiceId: "source-restored",
        providerVoiceId: "provider-restored",
        name: "Restored",
        savedAt: "2026-08-20T15:00:00.000Z",
      }]);

      assert.equal(findPremiumVoiceLibraryEntry(db, "user-a", "source-a"), null);
      assert.equal(
        findPremiumVoiceLibraryEntry(db, "user-a", "source-restored")?.name,
        "Restored",
      );
      assert.equal(
        findPremiumVoiceLibraryEntry(db, "user-b", "source-a")?.providerVoiceId,
        "provider-b",
      );
    } finally {
      db.close();
    }
  });
});
