#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import {
  normalizeBotPowersV1,
  serializeBotPowersV1,
} from "@localai/shared";
import { compileBotPowers } from "../apps/api/src/bot-powers.ts";

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const shouldApply = process.argv.includes("--apply");
const shouldDryRun = process.argv.includes("--dry-run");
const databaseArgument = flagValue("--db");
const userId = flagValue("--user-id");
const botId = flagValue("--bot-id");
const backupArgument = flagValue("--backup");

if (shouldApply === shouldDryRun) {
  throw new Error("Choose exactly one of --dry-run or --apply.");
}
if (!databaseArgument || !userId || !botId) {
  throw new Error(
    "Usage: repair-signal-gradual-mood-power.mjs --db PATH --user-id ID --bot-id ID (--dry-run | --apply --backup PATH)",
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

function isLegacyGradualMoodPower(power) {
  return (
    power.name === "Annoying" &&
    power.intent === "Overtime lowers the mood of surrounding bots." &&
    power.compiled?.effects?.length === 1 &&
    power.compiled.effects[0]?.type === "awareness" &&
    Array.isArray(power.compiled.effects[0].allowed) &&
    power.compiled.effects[0].allowed.length === 0
  );
}

async function recompilePower(power, botName) {
  const result = await compileBotPowers({
    provider: {
      name: "deterministic-only",
      diagnosticModel: "deterministic-only",
      async generateResponse() {
        throw new Error("Gradual mood Power unexpectedly required model compilation.");
      },
    },
    botName,
    powers: [{ ...power, compileStatus: "draft", compiled: null }],
  });
  if (
    result.conflicts.length !== 0 ||
    result.powers.length !== 1 ||
    result.powers[0]?.compileStatus !== "ready" ||
    result.powers[0].compiled?.effects[0]?.type !== "social_influence"
  ) {
    throw new Error("Gradual mood Power did not compile to social influence.");
  }
  return result.powers[0];
}

const databasePath = resolve(databaseArgument);
const database = new DatabaseSync(databasePath, { readOnly: !shouldApply });
let transactionOpen = false;

try {
  assertDatabaseIntegrity(database, "Live database before repair");
  const row = database
    .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
    .get(botId, userId);
  if (!row) {
    throw new Error("The requested Library bot does not exist for this user.");
  }
  const powers = normalizeBotPowersV1(JSON.parse(row.powers_json));
  const targets = powers.filter(isLegacyGradualMoodPower);
  if (targets.length > 1) {
    throw new Error("Found more than one matching legacy gradual mood Power.");
  }
  const repairedPowers = targets.length === 0
    ? powers
    : await Promise.all(
        powers.map((power) =>
          isLegacyGradualMoodPower(power)
            ? recompilePower(power, row.name)
            : power,
        ),
      );
  const repairedPowersJson = serializeBotPowersV1(repairedPowers);
  const changed = repairedPowersJson !== row.powers_json;
  const originalProtectedHash = protectedRowHash(row);
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
      database.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      const result = database
        .prepare(
          "UPDATE bots SET powers_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        )
        .run(repairedPowersJson, new Date().toISOString(), botId, userId);
      if (result.changes !== 1) {
        throw new Error("The Library Power repair did not update exactly one bot.");
      }
      const repairedRow = database
        .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
        .get(botId, userId);
      if (
        !repairedRow ||
        repairedRow.powers_json !== repairedPowersJson ||
        protectedRowHash(repairedRow) !== originalProtectedHash
      ) {
        throw new Error("The Library Power repair changed protected bot state.");
      }
      database.exec("COMMIT");
      transactionOpen = false;
    }
    assertDatabaseIntegrity(database, "Live database after repair");
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        database: databasePath,
        bot: { id: row.id, name: row.name },
        legacyPowerFound: targets.length === 1,
        changed,
        repairedEffect:
          repairedPowers.find((power) => power.name === "Annoying")?.compiled
            ?.effects[0]?.type ?? null,
        backup: backupPath,
        integrity: "ok",
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (transactionOpen) database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}
