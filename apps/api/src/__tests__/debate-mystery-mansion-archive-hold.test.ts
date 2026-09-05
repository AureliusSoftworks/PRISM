import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { HttpError } from "../utils.http.ts";
import { initializeDatabase } from "../db.ts";
import {
  cloneDebateMysteryMansionBundleV1,
  createBlankDebateMysteryMansionBundleV1,
  getDebateMysteryMansionBundleV2,
  listDebateMysteryMansionBundlesV2,
  updateDebateMysteryMansionLibraryV1,
  updateDebateMysteryMansionTopologyV1,
} from "../debate-mystery-mansion-bundles.ts";
import {
  MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE,
} from "../debate-mystery-mansion-archive-hold.ts";

const NOW = "2026-09-04T00:00:00.000Z";
const USER_KEY = Buffer.alloc(32, 7);

function holdDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        preferred_provider, created_at, last_active_at)
     VALUES ('owner', 'owner@example.com', 'Owner', 'hash', 'salt',
             'cipher', 'iv', 'tag', 'local', ?, ?)`,
  ).run(NOW, NOW);
  return db;
}

function insertHoldingSession(
  db: DatabaseSync,
  args: {
    sessionId: string;
    bundleId: string;
    playPhase?: string;
    status?: string;
    completedAt?: string | null;
    caseTitle?: string;
  },
): void {
  const session = {
    id: args.sessionId,
    status: args.status ?? "waiting_for_player",
    format: "whodunnit",
    motion: { title: args.caseTitle ?? "The Held House" },
    formatState: {
      format: "whodunnit",
      version: 2,
      playPhase: args.playPhase ?? "investigation",
      caseTitle: args.caseTitle ?? "The Held House",
      config: {
        mansionBundleId: args.bundleId,
        mansionSnapshot: { sourceBundleId: args.bundleId },
      },
    },
  };
  db.prepare(
    `INSERT INTO debate_sessions
       (id, user_id, revision, status, phase, step_key, player_role,
        create_idempotency_key, motion, session_json, created_at, updated_at,
        completed_at)
     VALUES (?, 'owner', 1, ?, 'opening', 'mystery_v2_investigation',
             'participant', ?, 'Whodunnit?', ?, ?, ?, ?)`,
  ).run(
    args.sessionId,
    args.status ?? "waiting_for_player",
    `create-${args.sessionId}`,
    JSON.stringify(session),
    NOW,
    NOW,
    args.completedAt ?? null,
  );
}

describe("Mystery Venue Archive holds", () => {
  it("lists the occupying unfinished case and blocks library edits, not copies", async () => {
    const db = holdDb();
    const venue = createBlankDebateMysteryMansionBundleV1(db, "owner");
    insertHoldingSession(db, { sessionId: "case-hold", bundleId: venue.id });

    const listed = listDebateMysteryMansionBundlesV2(db, "owner");
    assert.equal(listed.length, 1);
    assert.deepEqual(listed[0]?.archiveHold, {
      version: 1,
      sessionId: "case-hold",
      caseTitle: "The Held House",
    });
    assert.deepEqual(
      getDebateMysteryMansionBundleV2(db, "owner", venue.id).archiveHold,
      listed[0]?.archiveHold,
    );

    await assert.rejects(
      () => updateDebateMysteryMansionLibraryV1(
        db,
        USER_KEY,
        "owner",
        venue.id,
        { title: "Renamed while held" },
      ),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.statusCode, 409);
        assert.equal(error.code, "MYSTERY_VENUE_HELD_BY_ONGOING_CASE");
        assert.equal(error.message, MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE);
        return true;
      },
    );
    assert.throws(
      () => updateDebateMysteryMansionTopologyV1(
        db,
        "owner",
        venue.id,
        { layoutV2: venue.layoutV2! },
      ),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.code, "MYSTERY_VENUE_HELD_BY_ONGOING_CASE");
        return true;
      },
    );

    const copy = cloneDebateMysteryMansionBundleV1(db, "owner", venue.id);
    assert.notEqual(copy.id, venue.id);
    assert.equal(copy.archiveHold, null);
    const renamed = await updateDebateMysteryMansionLibraryV1(
      db,
      USER_KEY,
      "owner",
      copy.id,
      { title: "Editable copy" },
    );
    assert.equal(renamed.library?.overrides.title, "Editable copy");
  });

  it("releases the original after charges are filed", async () => {
    const db = holdDb();
    const venue = createBlankDebateMysteryMansionBundleV1(db, "owner");
    insertHoldingSession(db, {
      sessionId: "case-trial",
      bundleId: venue.id,
      playPhase: "trial",
    });
    assert.equal(getDebateMysteryMansionBundleV2(db, "owner", venue.id).archiveHold, null);
    const updated = await updateDebateMysteryMansionLibraryV1(
      db,
      USER_KEY,
      "owner",
      venue.id,
      { title: "Unlocked House" },
    );
    assert.equal(updated.library?.overrides.title, "Unlocked House");
  });

  it("keeps library editor routes locked while clone, export, and in-case save stay open", () => {
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const bundles = readFileSync(new URL("../debate-mystery-mansion-bundles.ts", import.meta.url), "utf8");
    assert.match(server, /function requireWritableInstalledMysteryMansion/u);
    assert.match(
      server,
      /route\("POST", "\/api\/debates\/mystery-mansions\/:id\/clone"[\s\S]{0,180}?requireAuth\(ctx\)/u,
    );
    assert.match(
      server,
      /route\("POST", "\/api\/debates\/mystery-mansions\/:id\/export"[\s\S]{0,180}?requireAuth\(ctx\)/u,
    );
    assert.match(
      server,
      /route\("PATCH", "\/api\/debates\/mystery-mansions\/:id\/topology"[\s\S]{0,180}?requireWritableInstalledMysteryMansion\(ctx\)/u,
    );
    assert.match(
      server,
      /route\("PATCH", "\/api\/debates\/mystery-mansions\/:id"[\s\S]{0,180}?requireWritableInstalledMysteryMansion\(ctx\)/u,
    );
    assert.match(
      server,
      /route\("POST", "\/api\/debates\/:id\/mystery-mansion\/save"[\s\S]{0,220}?requireAuth\(ctx\)/u,
    );
    assert.doesNotMatch(
      bundles,
      /assertDebateMysteryMansionNotHeldByOngoingCaseV1[\s\S]{0,80}saveDebateMysteryMansionBundleV2/u,
    );
    assert.match(
      bundles,
      /export async function updateDebateMysteryMansionLibraryV1[\s\S]{0,280}assertDebateMysteryMansionNotHeldByOngoingCaseV1/u,
    );
  });
});
