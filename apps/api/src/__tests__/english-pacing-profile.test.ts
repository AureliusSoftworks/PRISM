import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  ENGLISH_PACING_CALIBRATE_SCRIPT,
  ENGLISH_PACING_PROFILE_SOURCE,
  normalizeBotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  calibrateEnglishPacingProfile,
  ensureEnglishPacingProfileSchema,
  getEnglishPacingProfile,
  listEnglishPacingProfilesForBackup,
  restoreEnglishPacingProfilesFromBackup,
} from "../english-pacing-profile.ts";

describe("english pacing profile store", () => {
  let dir: string;
  let db: DatabaseSync;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "english-pacing-"));
    db = new DatabaseSync(join(dir, "test.sqlite"));
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY
      );
    `);
    db.prepare("INSERT INTO users (id) VALUES (?)").run("user-1");
    ensureEnglishPacingProfileSchema(db);
  });

  after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores, reads, and round-trips backup profiles", () => {
    const profile = {
      v: 1 as const,
      ownerKind: "bot" as const,
      ownerId: "bot-1",
      commaMs: 180,
      clauseMs: 240,
      strongMs: 360,
      calibratedAt: "2026-08-04T12:00:00.000Z",
      source: ENGLISH_PACING_PROFILE_SOURCE,
    };
    restoreEnglishPacingProfilesFromBackup(db, "user-1", [profile]);
    const loaded = getEnglishPacingProfile(db, "user-1", "bot", "bot-1");
    assert.deepEqual(loaded, profile);
    const backup = listEnglishPacingProfilesForBackup(db, "user-1");
    assert.equal(backup.length, 1);
    assert.deepEqual(backup[0], profile);
  });

  it("calibrates from timestamped Premium speech without leaving LOCAL numbers empty", async () => {
    const characters = Array.from(ENGLISH_PACING_CALIBRATE_SCRIPT);
    const starts: number[] = [];
    const ends: number[] = [];
    let t = 0;
    for (let i = 0; i < characters.length; i += 1) {
      starts.push(t);
      const ch = characters[i]!;
      ends.push(t + 0.04);
      t += 0.04;
      if (ch === ",") t += 0.18;
      else if (ch === ":" || ch === "—" || ch === ";") t += 0.25;
      else if (ch === "." || ch === "!" || ch === "?") t += 0.4;
    }
    // Shift next spoken starts after punctuation so extract sees gaps.
    for (let i = 0; i < characters.length; i += 1) {
      const ch = characters[i]!;
      if (!/[,\.;:!?—–]/.test(ch)) continue;
      let next = i + 1;
      while (next < characters.length && !/[\p{L}\p{N}]/u.test(characters[next]!)) {
        next += 1;
      }
      if (next >= characters.length) continue;
      const gap =
        ch === ","
          ? 0.18
          : ch === "." || ch === "!" || ch === "?"
            ? 0.4
            : 0.25;
      starts[next] = ends[i]! + gap;
    }

    const profile = await calibrateEnglishPacingProfile({
      db,
      userId: "user-1",
      ownerKind: "player",
      apiKey: "test-key",
      voiceId: "voice-1",
      voiceProfile: normalizeBotAudioVoiceProfileV1(undefined),
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            audio_base64: Buffer.from([1, 2, 3]).toString("base64"),
            alignment: {
              characters,
              character_start_times_seconds: starts,
              character_end_times_seconds: ends,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });
    assert.equal(profile.ownerKind, "player");
    assert.equal(profile.ownerId, "player");
    assert.ok(profile.commaMs >= 80);
    assert.ok(profile.strongMs >= 180);
    assert.equal(
      getEnglishPacingProfile(db, "user-1", "player", "player")?.commaMs,
      profile.commaMs,
    );
  });
});
