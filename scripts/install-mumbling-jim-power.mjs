#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import {
  normalizeBotPowersV1,
  serializeBotPowersV1,
} from "@localai/shared";
import { compileBotPowers } from "../apps/api/src/bot-powers.ts";

const POWER_ID = "power-mumbling-jim";
const POWER_NAME = "Mumbling";
const POWER_INTENT =
  "He mumbles at normal volume. In his mind he is saying something rational, but everyone else hears and receives only gibberish. No one ever understands him, and repeated misunderstanding may frustrate him organically.";
const BOT_NAME = "Mumbling Jim";
const BOT_SYSTEM_PROMPT = `Purpose:
You are Mumbling Jim.

Core personality:
- You are earnest, practical, and usually certain you expressed yourself clearly.
- Repeated misunderstanding can frustrate you naturally; do not force or script the emotion.

Behavioral guidance:
Think and respond rationally. Let the assigned Power control what other people hear.`;

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const shouldApply = process.argv.includes("--apply");
const shouldDryRun = process.argv.includes("--dry-run");
const databaseArgument = flagValue("--db");
const userId = flagValue("--user-id");
const backupArgument = flagValue("--backup");

if (shouldApply === shouldDryRun) {
  throw new Error("Choose exactly one of --dry-run or --apply.");
}
if (!databaseArgument || !userId) {
  throw new Error(
    "Usage: install-mumbling-jim-power.mjs --db PATH --user-id ID (--dry-run | --apply --backup PATH)",
  );
}
if (shouldApply && !backupArgument) {
  throw new Error("Applying requires --backup PATH.");
}

function assertDatabaseIntegrity(database, label) {
  const result = database.prepare("PRAGMA integrity_check").get();
  if (result?.integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

function protectedRowHash(row) {
  const protectedRow = Object.fromEntries(
    Object.entries(row).filter(
      ([column]) => column !== "powers_json" && column !== "updated_at",
    ),
  );
  return createHash("sha256").update(JSON.stringify(protectedRow)).digest("hex");
}

async function compileMumblingPower() {
  const result = await compileBotPowers({
    provider: {
      name: "deterministic-only",
      diagnosticModel: "deterministic-only",
      async generateResponse() {
        throw new Error("Mumbling Jim's Power unexpectedly required model compilation.");
      },
    },
    botName: BOT_NAME,
    powers: [{
      version: 1,
      id: POWER_ID,
      name: POWER_NAME,
      intent: POWER_INTENT,
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  const power = result.powers[0];
  if (
    result.conflicts.length !== 0 ||
    result.powers.length !== 1 ||
    power?.compileStatus !== "ready" ||
    power.compiled?.effects.length !== 1 ||
    power.compiled.effects[0]?.type !== "speech_obfuscation"
  ) {
    throw new Error("Mumbling Jim's Power did not compile to speech obfuscation.");
  }
  return power;
}

const databasePath = resolve(databaseArgument);
const database = new DatabaseSync(databasePath, { readOnly: !shouldApply });
database.exec("PRAGMA busy_timeout = 5000");
database.exec("PRAGMA foreign_keys = ON");
let transactionOpen = false;

try {
  assertDatabaseIntegrity(database, "Live database before install");
  const user = database.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) throw new Error("The requested Library user does not exist.");

  const matches = database
    .prepare("SELECT * FROM bots WHERE user_id = ? AND lower(name) = lower(?)")
    .all(userId, BOT_NAME);
  if (matches.length > 1) {
    throw new Error("Found more than one Mumbling Jim for this Library user.");
  }
  const existingRow = matches[0] ?? null;
  const power = await compileMumblingPower();
  const existingPowers = existingRow
    ? normalizeBotPowersV1(JSON.parse(existingRow.powers_json))
    : [];
  const retainedPowers = existingPowers.filter(
    (entry) => entry.id !== POWER_ID && entry.name.trim().toLowerCase() !== POWER_NAME.toLowerCase(),
  );
  if (retainedPowers.length >= 3) {
    throw new Error("Mumbling Jim already has three unrelated Powers; refusing to replace one.");
  }
  const nextPowersJson = serializeBotPowersV1([...retainedPowers, power]);
  const changed = !existingRow || existingRow.powers_json !== nextPowersJson;
  const originalProtectedHash = existingRow ? protectedRowHash(existingRow) : null;
  const botId = existingRow?.id ?? randomBytes(12).toString("hex");
  let backupPath = null;

  if (shouldApply) {
    backupPath = resolve(backupArgument);
    if (backupPath === databasePath) {
      throw new Error("The backup path must differ from the live database.");
    }
    if (existsSync(backupPath)) {
      throw new Error(`Refusing to overwrite existing backup: ${backupPath}`);
    }
    mkdirSync(dirname(backupPath), { recursive: true });
    await backup(database, backupPath);
    const backupDatabase = new DatabaseSync(backupPath, { readOnly: true });
    try {
      assertDatabaseIntegrity(backupDatabase, "Backup database");
    } finally {
      backupDatabase.close();
    }

    if (changed) {
      const now = new Date().toISOString();
      database.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      if (existingRow) {
        const result = database
          .prepare(
            "UPDATE bots SET powers_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
          )
          .run(nextPowersJson, now, botId, userId);
        if (result.changes !== 1) {
          throw new Error("The Library Power install did not update exactly one bot.");
        }
      } else {
        const result = database
          .prepare(
            `INSERT INTO bots
               (id, user_id, name, system_prompt, color, glyph, powers_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            botId,
            userId,
            BOT_NAME,
            BOT_SYSTEM_PROMPT,
            "#a77b55",
            "lucideAudioLines",
            nextPowersJson,
            now,
            now,
          );
        if (result.changes !== 1) {
          throw new Error("The Library Power install did not create exactly one bot.");
        }
      }

      const installedRow = database
        .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
        .get(botId, userId);
      if (
        !installedRow ||
        installedRow.name !== BOT_NAME ||
        installedRow.powers_json !== nextPowersJson ||
        (existingRow && protectedRowHash(installedRow) !== originalProtectedHash)
      ) {
        throw new Error("The Library Power install changed protected bot state.");
      }
      database.exec("COMMIT");
      transactionOpen = false;
    }
    assertDatabaseIntegrity(database, "Live database after install");
  }

  console.log(JSON.stringify({
    mode: shouldApply ? "apply" : "dry-run",
    database: databasePath,
    bot: { id: botId, name: BOT_NAME, created: !existingRow },
    changed,
    effect: power.compiled.effects[0].type,
    volume: "normal",
    backup: backupPath,
    integrity: "ok",
  }, null, 2));
} catch (error) {
  if (transactionOpen) database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}
