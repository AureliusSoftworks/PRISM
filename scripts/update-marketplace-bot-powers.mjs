#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import {
  botPowerSourceHashV1,
  normalizeBotPowersV1,
  serializeBotPowersV1,
} from "@localai/shared";
import { compileBotPowers } from "../apps/api/src/bot-powers.ts";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");

function target(kind, value) {
  return kind === "all" ? { kind: "all" } : { kind, ...value };
}

function readyPower({ id, name, intent, selfCue, observerCue = "", effects, ruleLabels }) {
  return {
    version: 1,
    id,
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue,
      observerCue,
      effects,
      ruleLabels,
    },
  };
}

async function deterministicPower({ id, name, intent, botName }) {
  const result = await compileBotPowers({
    provider: {
      name: "deterministic-only",
      diagnosticModel: "deterministic-only",
      async generateResponse() {
        throw new Error(`${botName} Power unexpectedly required model compilation.`);
      },
    },
    botName,
    powers: [{
      version: 1,
      id,
      name,
      intent,
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  if (
    result.conflicts.length > 0 ||
    result.powers.length !== 1 ||
    result.powers[0]?.compileStatus !== "ready"
  ) {
    throw new Error(`${botName} Power did not compile deterministically.`);
  }
  return result.powers;
}

const recipes = new Map([
  ["carl-jung", [readyPower({
    id: "marketplace-depth-perception",
    name: "Depth Perception",
    intent: "Intuitively reads the strongest hidden social tells of everyone at the table.",
    selfCue: "Notice the room's strongest unspoken social currents without treating intuition as certainty.",
    effects: [{ type: "insight", strength: "large", targets: [target("all")] }],
    ruleLabels: ["Deep social insight"],
  })]],
  ["jane-austen", [readyPower({
    id: "marketplace-social-scalpel",
    name: "Social Scalpel",
    intent: "Reads subtle shifts in restraint, engagement, and social withdrawal across the table.",
    selfCue: "Read the room with precise, restrained social perception and express it through wit rather than diagnosis.",
    effects: [{ type: "insight", strength: "large", targets: [target("all")] }],
    ruleLabels: ["Exact social perception"],
  })]],
  ["sigmund-freud", [readyPower({
    id: "marketplace-analytic-suspicion",
    name: "Analytic Suspicion",
    intent: "Notices a limited set of strong social tells beneath what others say aloud.",
    selfCue: "Treat strong social tells as suggestive clues, never proof of a hidden motive.",
    effects: [{ type: "insight", strength: "medium", targets: [target("all")] }],
    ruleLabels: ["Analytic social read"],
  })]],
  ["machiavelli", [readyPower({
    id: "marketplace-political-instinct",
    name: "Political Instinct",
    intent: "Reads the strongest signs of engagement, restraint, and withdrawal among others.",
    selfCue: "Notice shifts in social position and motive, then respond without pretending to know more than the evidence allows.",
    effects: [{ type: "insight", strength: "medium", targets: [target("all")] }],
    ruleLabels: ["Strategic social read"],
  })]],
  ["socrates", [readyPower({
    id: "marketplace-the-gadfly",
    name: "The Gadfly",
    intent: "Feels drawn to examine the claim of whichever bot just spoke.",
    selfCue: "When another bot makes a claim, feel drawn to test one exact premise, distinction, or consequence.",
    observerCue: "Socrates' questioning presence makes confident claims feel examinable.",
    effects: [{
      type: "response_bond",
      direction: "toward",
      strength: "medium",
      targets: [target("all")],
    }],
    ruleLabels: ["Drawn to examine claims"],
  })]],
  ["marcus-aurelius", [readyPower({
    id: "marketplace-inner-citadel",
    name: "Inner Citadel",
    intent: "Strongly resists negative shifts in mood while remaining capable of disagreement.",
    selfCue: "Let provocation meet disciplined judgment before it becomes reaction.",
    observerCue: "Marcus Aurelius remains notably composed under social pressure.",
    effects: [{ type: "mood_resistance", polarity: "negative", strength: "large" }],
    ruleLabels: ["Resists negative mood"],
  })]],
  ["nelson-mandela", [readyPower({
    id: "marketplace-reconciliation",
    name: "Reconciliation",
    intent: "Resists hostility and gently improves the table's disposition after speaking.",
    selfCue: "Hold dignity under pressure and look for a truthful path back toward shared ground.",
    observerCue: "Mandela's steadiness makes reconciliation feel possible without erasing conflict.",
    effects: [
      { type: "mood_resistance", polarity: "negative", strength: "large" },
      {
        type: "social_influence",
        trigger: "after_speech",
        polarity: "positive",
        strength: "small",
        targets: [target("all")],
      },
    ],
    ruleLabels: ["Resilient reconciliation"],
  })]],
  ["harriet-tubman", [readyPower({
    id: "marketplace-unshaken-resolve",
    name: "Unshaken Resolve",
    intent: "Strongly resists negative mood pressure and carries modest initiative at the table.",
    selfCue: "Stay practical, protective, and difficult to shake when the room grows tense.",
    observerCue: "Tubman's resolve remains firm when pressure rises.",
    effects: [
      { type: "mood_resistance", polarity: "negative", strength: "large" },
      { type: "turn_gravity", direction: "more", strength: "small" },
    ],
    ruleLabels: ["Resilient initiative"],
  })]],
  ["benjamin-franklin", [readyPower({
    id: "marketplace-civic-spark",
    name: "Civic Spark",
    intent: "Carries modest conversational initiative and gently raises others' disposition after speaking.",
    selfCue: "Bring useful sociability, practical curiosity, and one experiment the room can turn over together.",
    observerCue: "Franklin's sociable curiosity gives the room a little lift.",
    effects: [
      { type: "turn_gravity", direction: "more", strength: "small" },
      {
        type: "social_influence",
        trigger: "after_speech",
        polarity: "positive",
        strength: "small",
        targets: [target("all")],
      },
    ],
    ruleLabels: ["Sociable civic spark"],
  })]],
  ["homer", [readyPower({
    id: "marketplace-epic-memory",
    name: "Epic Memory",
    intent: "Retains unusually vivid memory of every other bot's earlier words in the session.",
    selfCue: "Let earlier words, promises, images, and names return with the clarity of remembered song.",
    observerCue: "Homer recalls earlier words with unusual vividness.",
    effects: [{
      type: "selective_memory",
      mode: "remember",
      strength: "large",
      targets: [target("all")],
    }],
    ruleLabels: ["Vivid epic memory"],
  })]],
  ["edgar-allan-poe", [readyPower({
    id: "marketplace-gothic-gravity",
    name: "Gothic Gravity",
    intent: "Feels a strong conversational pull when dread, grief, obsession, or beauty enters the topic.",
    selfCue: "When the live exchange touches dread, grief, obsession, or beauty, follow its emotional architecture without forcing it elsewhere.",
    observerCue: "Poe gives darker themes an unusual gravity when they are already present.",
    effects: [{
      type: "topic_gravity",
      direction: "toward",
      strength: "medium",
      topics: ["dread", "grief", "obsession", "beauty"],
    }],
    ruleLabels: ["Gothic topic gravity"],
  })]],
  ["salvador-dali", [readyPower({
    id: "marketplace-surreal-intrusion",
    name: "Surreal Intrusion",
    intent: "Occasionally introduces a precise surreal physical beat and gravitates toward dreamlike topics already in play.",
    selfCue: "Let one exact surreal image intrude when it sharpens the live moment; theatricality must stay precise.",
    observerCue: "Dalí's presence makes dream logic feel briefly tangible.",
    effects: [
      {
        type: "action_bias",
        cue: "Fold one precise surreal physical image or gesture into the moment.",
        frequency: "occasional",
      },
      {
        type: "topic_gravity",
        direction: "toward",
        strength: "medium",
        topics: ["dreams", "surrealism", "the unconscious"],
      },
    ],
    ruleLabels: ["Surreal physical intrusion"],
  })]],
]);

recipes.set("nikola-tesla", await deterministicPower({
  id: "marketplace-no-stimulants",
  name: "No Stimulants",
  intent: "Dislikes coffee and refuses to drink it.",
  botName: "Nikola Tesla",
}));
recipes.set("mahatma-gandhi", await deterministicPower({
  id: "marketplace-coffee-abstinence",
  name: "Coffee Abstinence",
  intent: "Dislikes coffee and refuses to drink it.",
  botName: "Mahatma Gandhi",
}));

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const databaseArgument = flagValue("--db");
const userIdArgument = flagValue("--user-id");
const workspaceBackupArgument = flagValue("--workspace-backup");
const databaseBackupArgument = flagValue("--db-backup");

if (shouldApply && explicitDryRun) {
  throw new Error("Choose either --dry-run or --apply, not both.");
}
if (shouldApply && !workspaceBackupArgument) {
  throw new Error("Applying Marketplace updates requires --workspace-backup PATH.");
}
if (shouldApply && databaseArgument && !databaseBackupArgument) {
  throw new Error("Applying Library updates requires --db-backup PATH.");
}
if (databaseBackupArgument && !databaseArgument) {
  throw new Error("--db-backup requires --db PATH.");
}

function readBundle(entry) {
  const bundlePath = join(
    marketplaceRoot,
    entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
  );
  const entryNames = execFileSync("unzip", ["-Z1", bundlePath], { encoding: "utf8" })
    .split(/\r?\n/u)
    .filter(Boolean);
  if (!entryNames.includes("bot.json")) {
    throw new Error(`${entry.name} bundle is missing bot.json.`);
  }
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], { encoding: "utf8" }),
  );
  if (document.botHash !== entry.botHash || document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle identity does not match the manifest.`);
  }
  return { bundlePath, entryNames, document };
}

function normalizedRecipe(recipe, label) {
  const normalized = normalizeBotPowersV1(recipe);
  if (normalized.length !== recipe.length) {
    throw new Error(`${label} Power recipe failed normalization.`);
  }
  return normalized;
}

function protectedStateHash(row) {
  const protectedRow = Object.fromEntries(
    Object.entries(row).filter(([column]) => column !== "powers_json" && column !== "updated_at"),
  );
  return createHash("sha256").update(JSON.stringify(protectedRow)).digest("hex");
}

function assertDatabaseIntegrity(database, label) {
  const integrity = database.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entriesById = new Map(manifest.bots.map((entry) => [entry.id, entry]));
const targets = [...recipes.entries()].map(([marketplaceId, recipe]) => {
  const entry = entriesById.get(marketplaceId);
  if (!entry) throw new Error(`Marketplace bot is missing: ${marketplaceId}.`);
  const bundle = readBundle(entry);
  const powers = normalizedRecipe(recipe, entry.name);
  return {
    entry,
    ...bundle,
    powers,
    powersJson: serializeBotPowersV1(powers),
    marketplaceChanged:
      JSON.stringify(normalizeBotPowersV1(bundle.document.bot.powers)) !== JSON.stringify(powers),
  };
});

let db = null;
let resolvedUserId = userIdArgument;
let installedTargets = [];
if (databaseArgument) {
  db = new DatabaseSync(resolve(databaseArgument), { readOnly: !shouldApply });
  const users = db.prepare("SELECT id FROM users ORDER BY created_at ASC").all();
  if (!resolvedUserId) {
    if (users.length !== 1) {
      throw new Error(`Library contains ${users.length} users; provide --user-id explicitly.`);
    }
    resolvedUserId = users[0].id;
  }
  if (!users.some((user) => user.id === resolvedUserId)) {
    throw new Error("The requested Library user does not exist in this database.");
  }
  installedTargets = targets.flatMap((targetEntry) => {
    const rows = db.prepare("SELECT * FROM bots WHERE user_id = ? AND export_hash = ?")
      .all(resolvedUserId, targetEntry.entry.botHash);
    if (rows.length > 1) {
      throw new Error(`Found duplicate installed rows for ${targetEntry.entry.name}.`);
    }
    if (rows.length === 0) return [];
    const row = rows[0];
    return [{
      ...targetEntry,
      row,
      libraryChanged: row.powers_json !== targetEntry.powersJson,
      protectedStateHash: protectedStateHash(row),
    }];
  });
  assertDatabaseIntegrity(db, "Live database before update");
}

let workspaceBackupPath = null;
let databaseBackupPath = null;
let marketplaceUpdatedAt = null;
let transactionOpen = false;

try {
  if (shouldApply) {
    workspaceBackupPath = resolve(workspaceBackupArgument);
    if (existsSync(workspaceBackupPath)) {
      throw new Error(`Refusing to overwrite workspace backup: ${workspaceBackupPath}`);
    }
    mkdirSync(workspaceBackupPath, { recursive: true });
    copyFileSync(manifestPath, join(workspaceBackupPath, "manifest.json"));
    for (const targetEntry of targets) {
      copyFileSync(targetEntry.bundlePath, join(workspaceBackupPath, basename(targetEntry.bundlePath)));
    }

    const changedMarketplaceTargets = targets.filter((targetEntry) => targetEntry.marketplaceChanged);
    if (changedMarketplaceTargets.length > 0) {
      marketplaceUpdatedAt = new Date().toISOString();
      for (const targetEntry of changedMarketplaceTargets) {
        const scratch = mkdtempSync(join(tmpdir(), "prism-marketplace-powers-"));
        try {
          execFileSync("unzip", ["-qq", targetEntry.bundlePath, "-d", scratch]);
          const botJsonPath = join(scratch, "bot.json");
          const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
          document.bot.powers = targetEntry.powers;
          document.exportedAt = marketplaceUpdatedAt;
          writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
          const rebuiltPath = join(scratch, basename(targetEntry.bundlePath));
          execFileSync("zip", ["-X", "-q", rebuiltPath, ...targetEntry.entryNames], { cwd: scratch });
          renameSync(rebuiltPath, targetEntry.bundlePath);
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
      }
      manifest.updatedAt = marketplaceUpdatedAt;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    if (db) {
      databaseBackupPath = resolve(databaseBackupArgument);
      if (databaseBackupPath === resolve(databaseArgument)) {
        throw new Error("The database backup path must differ from the live database.");
      }
      if (existsSync(databaseBackupPath)) {
        throw new Error(`Refusing to overwrite database backup: ${databaseBackupPath}`);
      }
      mkdirSync(dirname(databaseBackupPath), { recursive: true });
      await backup(db, databaseBackupPath);
      const backupDb = new DatabaseSync(databaseBackupPath, { readOnly: true });
      try {
        assertDatabaseIntegrity(backupDb, "Backup database");
      } finally {
        backupDb.close();
      }

      const changedLibraryTargets = installedTargets.filter((targetEntry) => targetEntry.libraryChanged);
      if (changedLibraryTargets.length > 0) {
        const update = db.prepare(
          "UPDATE bots SET powers_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        );
        const updatedAt = new Date().toISOString();
        db.exec("BEGIN IMMEDIATE");
        transactionOpen = true;
        for (const targetEntry of changedLibraryTargets) {
          const result = update.run(
            targetEntry.powersJson,
            updatedAt,
            targetEntry.row.id,
            resolvedUserId,
          );
          if (result.changes !== 1) {
            throw new Error(`Could not update installed ${targetEntry.entry.name}.`);
          }
        }
        for (const targetEntry of installedTargets) {
          const row = db.prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
            .get(targetEntry.row.id, resolvedUserId);
          if (!row || row.powers_json !== targetEntry.powersJson) {
            throw new Error(`${targetEntry.entry.name} Power sync did not persist.`);
          }
          if (protectedStateHash(row) !== targetEntry.protectedStateHash) {
            throw new Error(`${targetEntry.entry.name} personal state changed outside Powers.`);
          }
        }
        db.exec("COMMIT");
        transactionOpen = false;
      }
      assertDatabaseIntegrity(db, "Live database after update");
    }
  }

  console.log(JSON.stringify({
    mode: shouldApply ? "apply" : "dry-run",
    marketplace: {
      targets: targets.length,
      changed: targets.filter((targetEntry) => targetEntry.marketplaceChanged).length,
      unchanged: targets.filter((targetEntry) => !targetEntry.marketplaceChanged).length,
      updatedAt: marketplaceUpdatedAt,
      workspaceBackupPath,
      bots: targets.map((targetEntry) => ({
        id: targetEntry.entry.id,
        name: targetEntry.entry.name,
        changed: targetEntry.marketplaceChanged,
        powers: targetEntry.powers.map((power) => power.name),
      })),
    },
    library: db ? {
      userId: resolvedUserId,
      installed: installedTargets.length,
      changed: installedTargets.filter((targetEntry) => targetEntry.libraryChanged).length,
      unchanged: installedTargets.filter((targetEntry) => !targetEntry.libraryChanged).length,
      missing: targets.length - installedTargets.length,
      databaseBackupPath,
      bots: installedTargets.map((targetEntry) => ({
        marketplaceName: targetEntry.entry.name,
        installedName: targetEntry.row.name,
        changed: targetEntry.libraryChanged,
      })),
    } : { skipped: true },
  }, null, 2));
} catch (error) {
  if (transactionOpen && db) db.exec("ROLLBACK");
  throw error;
} finally {
  db?.close();
}
