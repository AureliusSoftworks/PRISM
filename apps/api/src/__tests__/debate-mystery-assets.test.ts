import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { initializeDatabase } from "../db.ts";
import {
  cloneDebateMysterySealedAssetsForReplayV1,
  deleteDebateMysterySealedAssetsV1,
  exportDebateMysteryAssetVaultBackupV1,
  getRevealedDebateMysteryAssetFileV1,
  importDebateMysteryAssetVaultBackupV1,
  inheritDebateMysteryAssetRevealV1,
  normalizeDebateMysteryAssetVisionReviewV1,
  replaceDebateMysteryAssetWithPendingV1,
  requeueRetryableDebateMysteryAssetFallbacksV1,
  restoreDebateMysteryAssetsFromSceneRepairV1,
  resetDebateMysteryAssetRevealsV1,
  revealDebateMysteryAssetV1,
  saveRevealedDebateMysteryAssetV1,
  sealDebateMysteryAssetBytesV1,
  setDebateMysteryAssetEntryTargetV1,
  setDebateMysteryAssetFallbackV1,
  setDebateMysteryAssetPendingV1,
  snapshotDebateMysteryAssetsForSceneRepairV1,
  validateDebateMysteryAssetPixelsV1,
} from "../debate-mystery-assets.ts";
import {
  DEBATE_MYSTERY_ROOM_ALIGNMENT_CONTRACT_V1,
  isDebateMysteryRoomArtPairReadyV1,
  type DebateMysteryRoomPairRowV1,
} from "../debate-mystery-room-art-source-lock.ts";

const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

describe("sealed mystery asset vision review", () => {
  it("keeps generated visuals case-scoped without a standalone Save image route", () => {
    assert.doesNotMatch(
      serverSource,
      /route\("POST", "\/api\/debates\/:id\/mystery-assets\/:kind\/:subjectId\/save"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/debates\/:id\/mystery-mansion\/save"/u,
      "saving the completed venue remains available",
    );
  });

  it("treats venue-specific built-ins as architecture rather than evidence", () => {
    assert.match(
      serverSource,
      /ship bridge navigation consoles, engine-control panels, galley equipment, security desks or cameras, cabin berths, railings, lifebuoys, and promenade safety fixtures/u,
    );
    assert.match(serverSource, /unless they contain a separately prohibited element/u);
  });

  it("discards speculative objections but preserves concrete visual defects", () => {
    assert.deepEqual(
      normalizeDebateMysteryAssetVisionReviewV1({
        approved: false,
        reasons: [
          "The statues may violate the normal environmental dressing rule.",
          "The camera angle does not match the source template.",
        ],
        reviewer: "test",
      }),
      {
        approved: false,
        reasons: ["The camera angle does not match the source template."],
        reviewer: "test",
      },
    );
    assert.deepEqual(
      normalizeDebateMysteryAssetVisionReviewV1({
        approved: false,
        reasons: ["The template couldn't be removed and the composition may be affected."],
        reviewer: "test",
      }),
      {
        approved: false,
        reasons: ["The template couldn't be removed and the composition may be affected."],
        reviewer: "test",
      },
    );
    assert.deepEqual(
      normalizeDebateMysteryAssetVisionReviewV1({
        approved: false,
        reasons: ["The image contains readable text and may also be too busy."],
        reviewer: "test",
      }),
      {
        approved: false,
        reasons: ["The image contains readable text and may also be too busy."],
        reviewer: "test",
      },
    );
    assert.deepEqual(
      normalizeDebateMysteryAssetVisionReviewV1({
        approved: false,
        reasons: ["The isolated exhibit might not match the mansion theme."],
        reviewer: "test",
      }),
      { approved: true, reasons: [], reviewer: "test" },
    );
    assert.deepEqual(
      normalizeDebateMysteryAssetVisionReviewV1({
        approved: false,
        reasons: ["A human figure appears in the doorway."],
        reviewer: "test",
      }),
      {
        approved: false,
        reasons: ["A human figure appears in the doorway."],
        reviewer: "test",
      },
    );
    assert.deepEqual(
      normalizeDebateMysteryAssetVisionReviewV1({
        approved: false,
        reasons: ["The source template overlay could not be removed."],
        reviewer: "test",
      }),
      {
        approved: false,
        reasons: ["The source template overlay could not be removed."],
        reviewer: "test",
      },
    );
    assert.deepEqual(
      normalizeDebateMysteryAssetVisionReviewV1({
        approved: false,
        reasons: [],
        reviewer: "test",
      }),
      { approved: false, reasons: [], reviewer: "test" },
    );
  });

  it("reconciles regenerated Mosaic geometry before completing field repair", () => {
    assert.match(
      serverSource,
      /action === "regenerate_room_mosaic"[\s\S]{0,4200}observeDebateMysteryRoomGeometryV1\(\{[\s\S]{0,500}anchors: true,[\s\S]{0,80}lights: true/u,
    );
    assert.match(
      serverSource,
      /Do not propose moving or changing anything in the room; report only where the visible thing already is/u,
    );
  });
});

const NOW = "2026-08-26T12:00:00.000Z";
const dataRoot = mkdtempSync(join(tmpdir(), "prism-sealed-mystery-assets-"));
const priorDataRoot = process.env.LOCALAI_DATA_DIR;
process.env.LOCALAI_DATA_DIR = dataRoot;

after(() => {
  if (priorDataRoot === undefined) delete process.env.LOCALAI_DATA_DIR;
  else process.env.LOCALAI_DATA_DIR = priorDataRoot;
  rmSync(dataRoot, { recursive: true, force: true });
});

function vaultDb(userId = "user-1", sessionId = "case-1"): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        preferred_provider, created_at, last_active_at)
     VALUES (?, ?, 'Investigator', 'hash', 'salt', 'cipher', 'iv', 'tag',
             'local', ?, ?)`,
  ).run(userId, `${userId}@example.test`, NOW, NOW);
  insertVaultSession(db, userId, sessionId);
  return db;
}

function insertVaultSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): void {
  db.prepare(
    `INSERT INTO debate_sessions
       (id, user_id, revision, status, phase, step_key, player_role,
        create_idempotency_key, motion, session_json, created_at, updated_at)
     VALUES (?, ?, 1, 'waiting_for_player', 'opening', 'mystery_v2_title',
             'participant', ?, 'Whodunnit?', '{}', ?, ?)`,
  ).run(sessionId, userId, `create-${sessionId}`, NOW, NOW);
}

async function evidencePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 400,
      channels: 4,
      background: { r: 42, g: 156, b: 106, alpha: 1 },
    },
  }).extend({
    top: 312,
    bottom: 312,
    left: 312,
    right: 312,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
}

async function roomPng(): Promise<Buffer> {
  return sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024">
       <defs><linearGradient id="room" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="#18243c"/><stop offset="1" stop-color="#8b724f"/>
       </linearGradient></defs>
       <rect width="1536" height="1024" fill="url(#room)"/>
       <path d="M0 760 L1536 620 L1536 1024 L0 1024 Z" fill="#3d3228"/>
     </svg>`,
  )).png().toBuffer();
}

describe("sealed Whodunnit asset vault", () => {
  it("retains private room pairing through sealing, backup import and failed-repair rollback", async () => {
    const db = vaultDb();
    const restored = vaultDb();
    const userKey = randomBytes(32);
    const source = await sharp(await roomPng()).resize(1920, 1080).png().toBuffer();
    const candidate = await sharp(source).linear(0.8, 15).png().toBuffer();
    const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    const sourceLock = {
      version: DEBATE_MYSTERY_ROOM_ALIGNMENT_CONTRACT_V1.version,
      referenceVersion: DEBATE_MYSTERY_ROOM_ALIGNMENT_CONTRACT_V1.referenceVersion,
      baseSha256: hash(source), referenceSha256: hash(source), candidateSha256: hash(candidate),
      approved: true, frameMatches: true, correlation: 0.99, detailCorrelation: 0.99, landmarkCorrelation: 0.98,
    };
    const baseArgs = { userId: "user-1", sessionId: "case-1", kind: "room" as const, provider: "test", model: "test" };
    sealDebateMysteryAssetBytesV1(db, userKey, { ...baseArgs, subjectId: "room-1", bytes: source, review: {} });
    const publicRef = sealDebateMysteryAssetBytesV1(db, userKey, {
      ...baseArgs, subjectId: "room-1:illustrated-v1", bytes: candidate,
      review: { sourceLock, vision: { approved: true } },
    });
    assert.doesNotMatch(JSON.stringify(publicRef), /sourceLock|baseSha256|referenceSha256/u);
    const row = (database: DatabaseSync, subjectId: string) => database.prepare(
      "SELECT status, sha256, review_json FROM debate_mystery_asset_vault WHERE subject_id = ?",
    ).get(subjectId) as unknown as DebateMysteryRoomPairRowV1;
    assert.deepEqual(JSON.parse(row(db, "room-1:illustrated-v1").review_json).sourceLock, sourceLock);
    const backup = exportDebateMysteryAssetVaultBackupV1(db, "user-1", userKey);
    importDebateMysteryAssetVaultBackupV1(restored, "user-1", randomBytes(32), backup, new Set(["case-1"]));
    assert.equal(isDebateMysteryRoomArtPairReadyV1(row(restored, "room-1"), row(restored, "room-1:illustrated-v1")), true);

    const baseBefore = db.prepare("SELECT * FROM debate_mystery_asset_vault WHERE subject_id = 'room-1'").get();
    const derivativeBefore = row(db, "room-1:illustrated-v1");
    const snapshots = snapshotDebateMysteryAssetsForSceneRepairV1(db, "user-1", "case-1", "room", ["room-1:illustrated-v1"]);
    replaceDebateMysteryAssetWithPendingV1(db, { ...baseArgs, subjectId: "room-1:illustrated-v1" });
    setDebateMysteryAssetFallbackV1(db, { ...baseArgs, subjectId: "room-1:illustrated-v1", reason: "Source-lock rejected" });
    restoreDebateMysteryAssetsFromSceneRepairV1(db, "user-1", "case-1", "room", snapshots);
    assert.deepEqual(row(db, "room-1:illustrated-v1"), derivativeBefore);
    assert.deepEqual(db.prepare("SELECT * FROM debate_mystery_asset_vault WHERE subject_id = 'room-1'").get(), baseBefore);
    assert.equal(isDebateMysteryRoomArtPairReadyV1(row(db, "room-1"), row(db, "room-1:illustrated-v1")), true);
    db.close();
    restored.close();
  });

  it("keeps entry calibration public while restoring the exact encrypted pre-repair row", async () => {
    const db = vaultDb();
    const userKey = randomBytes(32);
    const original = await roomPng();
    sealDebateMysteryAssetBytesV1(db, userKey, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "mansion-exterior-v1",
      bytes: original,
      provider: "openai",
      model: "gpt-image-2",
      review: { attempt: 1, entryTarget: { x: 0.61, y: 0.7 } },
    });
    revealDebateMysteryAssetV1(
      db,
      "user-1",
      "case-1",
      "room",
      "mansion-exterior-v1",
    );
    const calibrated = setDebateMysteryAssetEntryTargetV1(
      db,
      "user-1",
      "case-1",
      "room",
      "mansion-exterior-v1",
      { x: 0.6, y: 0.71 },
    );
    assert.deepEqual(calibrated.entryTarget, { x: 0.6, y: 0.71 });

    const snapshots = snapshotDebateMysteryAssetsForSceneRepairV1(
      db,
      "user-1",
      "case-1",
      "room",
      ["mansion-exterior-v1"],
    );
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.kind, "room");
    assert.equal(snapshots[0]?.subjectId, "mansion-exterior-v1");
    assert.equal(snapshots[0]?.existed, true);
    assert.equal(snapshots[0]?.revealed, true);
    assert.ok(snapshots[0]?.snapshotId);
    replaceDebateMysteryAssetWithPendingV1(db, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "mansion-exterior-v1",
    });
    const replacement = await sharp(original).negate().png().toBuffer();
    sealDebateMysteryAssetBytesV1(db, userKey, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "mansion-exterior-v1",
      bytes: replacement,
      provider: "openai",
      model: "gpt-image-2",
      review: { attempt: 1, entryTarget: { x: 0.2, y: 0.3 } },
    });
    restoreDebateMysteryAssetsFromSceneRepairV1(
      db,
      "user-1",
      "case-1",
      "room",
      snapshots,
    );
    assert.deepEqual(
      getRevealedDebateMysteryAssetFileV1(
        db,
        userKey,
        "user-1",
        "case-1",
        "room",
        "mansion-exterior-v1",
      ).bytes,
      original,
    );
    db.close();
  });

  it("keeps bytes encrypted and absent from Images until reveal and explicit save", async () => {
    const db = vaultDb();
    const userKey = randomBytes(32);
    const bytes = await evidencePng();

    const pending = setDebateMysteryAssetPendingV1(db, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "evidence",
      subjectId: "evidence-1",
    });
    assert.equal(pending.status, "pending");
    assert.throws(
      () => getRevealedDebateMysteryAssetFileV1(
        db,
        userKey,
        "user-1",
        "case-1",
        "evidence",
        "evidence-1",
      ),
      /not been revealed/iu,
    );

    const ready = sealDebateMysteryAssetBytesV1(db, userKey, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "evidence",
      subjectId: "evidence-1",
      bytes,
      provider: "openai",
      model: "gpt-image-1",
      review: {
        attempt: 1,
        vision: { approved: true, reasons: ["sensitive reviewer prose"] },
      },
    });
    assert.equal(ready.revealed, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM images").get()!.count, 0);
    const encrypted = db.prepare(
      "SELECT ciphertext, review_json FROM debate_mystery_asset_vault WHERE id = ?",
    ).get((db.prepare(
      `SELECT id FROM debate_mystery_asset_vault
        WHERE user_id = ? AND session_id = ? AND kind = ? AND subject_id = ?`,
    ).get("user-1", "case-1", "evidence", "evidence-1") as { id: string }).id) as {
      ciphertext: Buffer;
      review_json: string;
    };
    assert.notDeepEqual(encrypted.ciphertext, bytes);
    assert.notDeepEqual(encrypted.ciphertext.subarray(0, 8), bytes.subarray(0, 8));
    assert.match(encrypted.review_json, /"approved":true/u);
    assert.doesNotMatch(encrypted.review_json, /sensitive reviewer prose/u);
    assert.throws(
      () => getRevealedDebateMysteryAssetFileV1(
        db,
        userKey,
        "user-1",
        "case-1",
        "evidence",
        "evidence-1",
      ),
      /not been revealed/iu,
    );

    const revealed = revealDebateMysteryAssetV1(
      db,
      "user-1",
      "case-1",
      "evidence",
      "evidence-1",
    );
    assert.equal(revealed?.revealed, true);
    assert.deepEqual(
      getRevealedDebateMysteryAssetFileV1(
        db,
        userKey,
        "user-1",
        "case-1",
        "evidence",
        "evidence-1",
      ).bytes,
      bytes,
    );

    const saved = saveRevealedDebateMysteryAssetV1(
      db,
      userKey,
      "user-1",
      "case-1",
      "evidence",
      "evidence-1",
      "Green ledger",
    );
    const savedAgain = saveRevealedDebateMysteryAssetV1(
      db,
      userKey,
      "user-1",
      "case-1",
      "evidence",
      "evidence-1",
      "Green ledger",
    );
    assert.equal(savedAgain.imageId, saved.imageId);
    const savedRow = db.prepare(
      "SELECT origin, purpose FROM images WHERE id = ?",
    ).get(saved.imageId) as { origin: string; purpose: string };
    assert.equal(savedRow.origin, "debate_mystery_saved");
    assert.equal(savedRow.purpose, "debate_exhibit");

    assert.equal(resetDebateMysteryAssetRevealsV1(db, "user-1", "case-1"), 1);
    assert.throws(
      () => getRevealedDebateMysteryAssetFileV1(
        db,
        userKey,
        "user-1",
        "case-1",
        "evidence",
        "evidence-1",
      ),
      /not been revealed/iu,
      "restart hides the case-scoped original again",
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM images").get()!.count, 1);
    db.close();
  });

  it("re-seals encrypted backup bytes, preserves fallback rows, and deletes by case", async () => {
    const source = vaultDb("source-user", "shared-case");
    const sourceKey = randomBytes(32);
    const bytes = await roomPng();
    const ready = sealDebateMysteryAssetBytesV1(source, sourceKey, {
      userId: "source-user",
      sessionId: "shared-case",
      kind: "room",
      subjectId: "room-1",
      bytes,
      provider: "openai",
      model: "gpt-image-1",
      review: { attempt: 2, vision: { approved: true } },
    });
    revealDebateMysteryAssetV1(source, "source-user", "shared-case", "room", "room-1");
    setDebateMysteryAssetFallbackV1(source, {
      userId: "source-user",
      sessionId: "shared-case",
      kind: "room",
      subjectId: "room-2",
      reason: "vision review rejected both attempts",
    });
    const backup = exportDebateMysteryAssetVaultBackupV1(source, "source-user", sourceKey);
    assert.equal(backup.assets.length, 2);

    const restored = vaultDb("source-user", "shared-case");
    const restoredKey = randomBytes(32);
    importDebateMysteryAssetVaultBackupV1(
      restored,
      "source-user",
      restoredKey,
      backup,
      new Set(["shared-case"]),
    );
    assert.deepEqual(
      getRevealedDebateMysteryAssetFileV1(
        restored,
        restoredKey,
        "source-user",
        "shared-case",
        "room",
        "room-1",
      ).bytes,
      bytes,
    );
    assert.notDeepEqual(
      source.prepare(
        "SELECT ciphertext FROM debate_mystery_asset_vault WHERE kind = 'room' AND subject_id = 'room-1'",
      ).get(),
      restored.prepare(
        "SELECT ciphertext FROM debate_mystery_asset_vault WHERE kind = 'room' AND subject_id = 'room-1'",
      ).get(),
      "import encrypts with the destination account key",
    );
    assert.equal(deleteDebateMysterySealedAssetsV1(restored, "source-user", "shared-case"), 2);
    assert.equal(
      restored.prepare("SELECT COUNT(*) AS count FROM debate_mystery_asset_vault").get()!.count,
      0,
    );
    source.close();
    restored.close();
  });

  it("requeues transient fallbacks once and preserves the bounded retry count", () => {
    const db = vaultDb();
    setDebateMysteryAssetFallbackV1(db, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "room-1",
      reason: "Sealed case visual attempt timed out.",
    });
    assert.match(
      String(db.prepare(
        "SELECT review_json FROM debate_mystery_asset_vault WHERE subject_id = 'room-1'",
      ).get()!.review_json),
      /"reasonCode":"timed_out"/u,
    );
    revealDebateMysteryAssetV1(
      db,
      "user-1",
      "case-1",
      "room",
      "room-1",
    );

    const first = requeueRetryableDebateMysteryAssetFallbacksV1(
      db,
      "user-1",
      "case-1",
    );
    assert.equal(first.length, 1);
    assert.equal(first[0]?.asset.status, "pending");
    assert.equal(first[0]?.asset.revealed, true);
    setDebateMysteryAssetPendingV1(db, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "room-1",
    });
    setDebateMysteryAssetFallbackV1(db, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "room-1",
      reason: "Sealed case visual attempt timed out.",
    });
    assert.equal(
      revealDebateMysteryAssetV1(
        db,
        "user-1",
        "case-1",
        "room",
        "room-1",
      )?.revealed,
      true,
    );
    assert.equal(
      requeueRetryableDebateMysteryAssetFallbacksV1(
        db,
        "user-1",
        "case-1",
      ).length,
      0,
    );
    assert.match(
      String(db.prepare(
        "SELECT review_json FROM debate_mystery_asset_vault WHERE subject_id = 'room-1'",
      ).get()!.review_json),
      /"retryCount":1/u,
    );
    const second = requeueRetryableDebateMysteryAssetFallbacksV1(
      db,
      "user-1",
      "case-1",
      2,
    );
    assert.equal(second.length, 1);
    setDebateMysteryAssetFallbackV1(db, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "room-1",
      reason: "Sealed case visual attempt timed out.",
    });
    assert.equal(
      requeueRetryableDebateMysteryAssetFallbacksV1(
        db,
        "user-1",
        "case-1",
        2,
      ).length,
      0,
    );
    const third = requeueRetryableDebateMysteryAssetFallbacksV1(
      db,
      "user-1",
      "case-1",
      3,
    );
    assert.equal(third.length, 1);
    setDebateMysteryAssetFallbackV1(db, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "room-1",
      reason: "Sealed case visual attempt timed out.",
    });
    assert.equal(
      requeueRetryableDebateMysteryAssetFallbacksV1(
        db,
        "user-1",
        "case-1",
        3,
      ).length,
      0,
    );
    db.close();
  });

  it("requeues a formerly unavailable provider after the player explicitly retries", () => {
    const db = vaultDb();
    setDebateMysteryAssetFallbackV1(db, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "room-1",
      reason: "LOCAL generation is unavailable.",
    });
    const retried = requeueRetryableDebateMysteryAssetFallbacksV1(
      db,
      "user-1",
      "case-1",
      3,
      ["room"],
      new Set(["room-1"]),
    );
    assert.equal(retried.length, 1);
    assert.equal(retried[0]?.asset.status, "pending");
    db.close();
  });

  it("lets a derivative prepared after its base was revealed inherit that reveal", async () => {
    const db = vaultDb();
    const userKey = randomBytes(32);
    const bytes = await roomPng();
    const seal = (subjectId: string) => sealDebateMysteryAssetBytesV1(db, userKey, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId,
      bytes,
      provider: "openai",
      model: "gpt-image-1",
      review: { attempt: 1, vision: { approved: true } },
    });
    seal("room-1");
    seal("illustrated:room-1");

    // A sealed base keeps its derivative sealed: discovery still happens by entering the room.
    assert.equal(
      inheritDebateMysteryAssetRevealV1(db, "user-1", "case-1", "room", "room-1", "illustrated:room-1")?.revealed,
      false,
    );
    assert.throws(
      () => getRevealedDebateMysteryAssetFileV1(db, userKey, "user-1", "case-1", "room", "illustrated:room-1"),
      /not been revealed/u,
    );

    // Once the base is revealed, a derivative prepared afterwards serves without another room entry.
    revealDebateMysteryAssetV1(db, "user-1", "case-1", "room", "room-1");
    assert.equal(
      inheritDebateMysteryAssetRevealV1(db, "user-1", "case-1", "room", "room-1", "illustrated:room-1")?.revealed,
      true,
    );
    assert.equal(
      getRevealedDebateMysteryAssetFileV1(db, userKey, "user-1", "case-1", "room", "illustrated:room-1").sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    // The upgrade pipeline applies it right after sealing an illustrated derivative.
    assert.match(
      serverSource,
      /sealDebateMysteryAssetBytesV1\(db, userKey, \{[\s\S]{0,1200}?inheritDebateMysteryAssetRevealV1\(db, userId, sessionId, "room", room\.id, subjectId\)/u,
    );
  });

  it("reuses ciphertext for Play Again while resetting semantic authorization", async () => {
    const db = vaultDb();
    const userKey = randomBytes(32);
    const bytes = await roomPng();
    sealDebateMysteryAssetBytesV1(db, userKey, {
      userId: "user-1",
      sessionId: "case-1",
      kind: "room",
      subjectId: "room-1",
      bytes,
      provider: "openai",
      model: "gpt-image-1",
      review: { attempt: 1, vision: { approved: true } },
    });
    revealDebateMysteryAssetV1(db, "user-1", "case-1", "room", "room-1");
    insertVaultSession(db, "user-1", "case-2");

    assert.equal(
      cloneDebateMysterySealedAssetsForReplayV1(db, "user-1", "case-1", "case-2"),
      1,
    );
    const rows = db.prepare(
      `SELECT id, session_id, ciphertext, revealed_at, saved_image_id
         FROM debate_mystery_asset_vault
        WHERE user_id = ? AND kind = 'room' AND subject_id = 'room-1'
        ORDER BY session_id`,
    ).all("user-1") as unknown as Array<{
      id: string;
      session_id: string;
      ciphertext: Buffer;
      revealed_at: string | null;
      saved_image_id: string | null;
    }>;
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0]!.id, rows[1]!.id);
    assert.deepEqual(rows[0]!.ciphertext, rows[1]!.ciphertext);
    assert.equal(rows[1]!.revealed_at, null);
    assert.equal(rows[1]!.saved_image_id, null);
    assert.throws(
      () => getRevealedDebateMysteryAssetFileV1(
        db,
        userKey,
        "user-1",
        "case-2",
        "room",
        "room-1",
      ),
      /not been revealed/iu,
    );
    db.close();
  });

  it("rejects reserved magenta, wrong alpha, and incorrect room geometry deterministically", async () => {
    const evidence = await evidencePng();
    const room = await roomPng();
    assert.equal((await validateDebateMysteryAssetPixelsV1("evidence", evidence)).width, 1024);
    assert.equal((await validateDebateMysteryAssetPixelsV1("room", room)).height, 1024);

    const magentaEvidence = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 255, g: 0, b: 255, alpha: 1 },
      },
    }).png().toBuffer();
    await assert.rejects(
      validateDebateMysteryAssetPixelsV1("evidence", magentaEvidence),
      /isolated visible subject|magenta/iu,
    );
    const transparentRoom = await sharp({
      create: {
        width: 1536,
        height: 1024,
        channels: 4,
        background: { r: 20, g: 30, b: 40, alpha: 0.4 },
      },
    }).png().toBuffer();
    await assert.rejects(
      validateDebateMysteryAssetPixelsV1("room", transparentRoom),
      /fully opaque/iu,
    );
    await assert.rejects(
      validateDebateMysteryAssetPixelsV1("room", evidence),
      /1536×1024 legacy, 1280×720 source, 1920×1080 Pixel Art, or 1600×900 Realistic/iu,
    );
  });
});
