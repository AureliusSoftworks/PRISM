#!/usr/bin/env node

/**
 * Place every real-figure Library and Marketplace bot's Accent Map pin at the
 * figure's real-world origin, with the closest catalog accent chosen
 * explicitly. Prism-original characters (Copycat Calvin, Vex, the voice-name
 * bots, …) and authored fictional voices that are already deliberate (Darth
 * Vader's American, Stewie's RP) are left untouched.
 *
 * Only these authored-audio-voice-profile fields may change, in both the
 * marketplace bundles and the Library rows (authored profile plus any local
 * override, which masks authored at runtime):
 *   accentDefinitionId, pronunciationMapPoint, speechprintInfluence,
 *   pronunciationBase
 * Bundle botHash is identity, not an integrity checksum, and stays unchanged
 * so Marketplace installed-detection keeps matching Library bots.
 *
 * Usage:
 *   node scripts/place-bot-voice-accent-origins.mjs --dry-run [--db PATH] [--user-id ID]
 *   node scripts/place-bot-voice-accent-origins.mjs --apply --backup-dir PATH [--db PATH] [--user-id ID]
 */

import { execFileSync } from "node:child_process";
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
import { basename, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  resolveLocalAccentFallback,
  voiceAccentMapPointForCoordinates,
  VOICE_ACCENT_DEFINITIONS,
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");
const desktopDbDefault =
  "/Users/jared/Library/Application Support/com.localai.prism-desktop/localai.db";

/**
 * Real origins, keyed by bot name (the join key shared by manifest entries,
 * bundle documents, and Library rows). `accentDefinitionId` is the closest
 * catalog accent to the figure's actual speech; the pin itself sits on the
 * birthplace / formative home so the map reads true.
 */
const ORIGINS = {
  // ——— Previously unplaced figures ———
  "Alan Watts": { place: "Chislehurst, England", lon: 0.07, lat: 51.42, accent: "modern-rp-english" },
  "Albert Einstein": { place: "Ulm, Germany", lon: 9.99, lat: 48.4, accent: "german-influenced-english" },
  "Aristotle": { place: "Stagira, Greece", lon: 23.75, lat: 40.53, accent: "greek-influenced-english" },
  "Benjamin Franklin": { place: "Boston, Massachusetts", lon: -71.06, lat: 42.36, accent: "eastern-new-england-english" },
  "Carl Jung": { place: "Kesswil, Switzerland", lon: 9.32, lat: 47.6, accent: "german-influenced-english" },
  "Carl von Clausewitz": { place: "Burg bei Magdeburg, Prussia", lon: 11.85, lat: 52.27, accent: "german-influenced-english" },
  "Chanakya": { place: "Pataliputra (Patna), India", lon: 85.14, lat: 25.59, accent: "indian-english" },
  "Charles Darwin": { place: "Shrewsbury, England", lon: -2.75, lat: 52.71, accent: "british-english" },
  "Claude Monet": { place: "Paris, France", lon: 2.35, lat: 48.86, accent: "parisian-french-influenced-english" },
  "Confucius": { place: "Qufu, Shandong", lon: 116.99, lat: 35.6, accent: "mandarin-influenced-english" },
  "Edgar Allan Poe": { place: "Richmond, Virginia", lon: -77.44, lat: 37.54, accent: "southern-us-english" },
  "Frederick Douglass": { place: "Talbot County, Maryland", lon: -76.07, lat: 38.75, accent: "southern-us-english" },
  "Friedrich Nietzsche": { place: "Röcken, Germany", lon: 12.13, lat: 51.25, accent: "german-influenced-english" },
  "George Washington": { place: "Westmoreland County, Virginia", lon: -76.72, lat: 38.19, accent: "american-english" },
  "Georgia O'Keeffe": { place: "Sun Prairie, Wisconsin", lon: -89.21, lat: 43.18, accent: "inland-north-english" },
  "Guru Nanak": { place: "Nankana Sahib, Punjab", lon: 73.71, lat: 31.45, accent: "pakistani-english" },
  "Harriet Tubman": { place: "Dorchester County, Maryland", lon: -75.95, lat: 38.42, accent: "southern-us-english" },
  "Homer": { place: "Smyrna (İzmir)", lon: 27.14, lat: 38.42, accent: "greek-influenced-english" },
  "Isaac Newton": { place: "Woolsthorpe, Lincolnshire", lon: -0.62, lat: 52.81, accent: "british-english" },
  "James Madison": { place: "Port Conway, Virginia", lon: -77.06, lat: 38.17, accent: "american-english" },
  "Jane Austen": { place: "Steventon, Hampshire", lon: -1.25, lat: 51.23, accent: "modern-rp-english" },
  "Jesus Christ": { place: "Nazareth", lon: 35.3, lat: 32.7, accent: "middle-eastern-arabic-influenced-english" },
  "John Adams": { place: "Braintree, Massachusetts", lon: -71.0, lat: 42.26, accent: "eastern-new-england-english" },
  "Joseph Campbell": { place: "White Plains, New York", lon: -73.76, lat: 41.03, accent: "new-york-english" },
  "Laozi": { place: "Luyi, Henan", lon: 115.49, lat: 33.86, accent: "mandarin-influenced-english" },
  "Leonardo da Vinci": { place: "Vinci, Tuscany", lon: 10.92, lat: 43.79, accent: "northern-italian-influenced-english" },
  "Machiavelli": { place: "Florence, Italy", lon: 11.26, lat: 43.77, accent: "northern-italian-influenced-english" },
  "Mahatma Gandhi": { place: "Porbandar, Gujarat", lon: 69.61, lat: 21.64, accent: "indian-english" },
  "Marcus Aurelius": { place: "Rome, Italy", lon: 12.5, lat: 41.9, accent: "italian-influenced-english" },
  "Marie Curie": { place: "Warsaw, Poland", lon: 21.01, lat: 52.23, accent: "polish-influenced-english" },
  "Martin Luther King Jr.": { place: "Atlanta, Georgia", lon: -84.39, lat: 33.75, accent: "southern-us-english" },
  "Mary Shelley": { place: "Somers Town, London", lon: -0.13, lat: 51.51, accent: "modern-rp-english" },
  "Nelson Mandela": { place: "Mvezo, Eastern Cape", lon: 28.49, lat: -31.96, accent: "south-african-english" },
  "Nikola Tesla": { place: "Smiljan, Croatia (Serbian)", lon: 15.31, lat: 44.57, accent: "russian-influenced-english" },
  "Plato": { place: "Athens, Greece", lon: 23.73, lat: 37.98, accent: "greek-influenced-english" },
  "Rumi": { place: "Balkh, Khorasan", lon: 66.9, lat: 36.76, accent: "persian-influenced-english" },
  "Salvador Dalí": { place: "Figueres, Catalonia", lon: 2.96, lat: 42.27, accent: "spanish-influenced-english" },
  "Sigmund Freud": { place: "Vienna, Austria", lon: 16.37, lat: 48.21, accent: "bavarian-german-influenced-english" },
  "Socrates": { place: "Athens, Greece", lon: 23.73, lat: 37.98, accent: "greek-influenced-english" },
  "Sun Tzu": { place: "Linzi, Qi (Shandong)", lon: 118.28, lat: 36.83, accent: "mandarin-influenced-english" },
  "The Buddha": { place: "Lumbini, Nepal", lon: 83.28, lat: 27.47, accent: "indian-english" },
  "Thomas Hobbes": { place: "Malmesbury, Wiltshire", lon: -2.1, lat: 51.58, accent: "british-english" },
  "Thomas Jefferson": { place: "Shadwell, Virginia", lon: -78.46, lat: 38.01, accent: "american-english" },
  "Vincent van Gogh": { place: "Zundert, Netherlands", lon: 4.66, lat: 51.47, accent: "dutch-influenced-english" },
  "William Shakespeare": { place: "Stratford-upon-Avon", lon: -1.71, lat: 52.19, accent: "british-english" },

  // ——— Corrections to already-placed figures ———
  "Abraham Lincoln": { place: "Hodgenville, Kentucky", lon: -85.74, lat: 37.57, accent: "appalachian-english" },
  "Adolf Hitler": { place: "Braunau am Inn, Austria", lon: 13.04, lat: 48.26, accent: "bavarian-german-influenced-english" },
  "Bernie Sanders": { place: "Brooklyn, New York", lon: -73.94, lat: 40.68, accent: "new-york-english" },
  "Bob Ross": { place: "Daytona Beach, Florida", lon: -81.02, lat: 29.21, accent: "north-florida-english" },
  "Dante Alighieri": { place: "Florence, Italy", lon: 11.26, lat: 43.77, accent: "northern-italian-influenced-english" },
  "Donald Trump": { place: "Queens, New York", lon: -73.79, lat: 40.73, accent: "new-york-english" },
  "Elizabeth Bennet": { place: "Longbourn, Hertfordshire", lon: -0.23, lat: 51.9, accent: "british-english" },
  "Elon Musk": { place: "Pretoria, South Africa", lon: 28.19, lat: -25.75, accent: "south-african-english" },
  "Eratosthenes": { place: "Cyrene, Libya", lon: 21.86, lat: 32.82, accent: "greek-influenced-english" },
  "Gavin Newsom": { place: "San Francisco, California", lon: -122.42, lat: 37.77, accent: "bay-area-english" },
  "Hagrid": { place: "Forest of Dean, West Country", lon: -2.55, lat: 51.8, accent: "british-english" },
  "Harry Potter": { place: "Little Whinging, Surrey", lon: -0.42, lat: 51.32, accent: "modern-rp-english" },
  "Hermione Granger": { place: "London, England", lon: -0.13, lat: 51.51, accent: "modern-rp-english" },
  "Jordan Peterson": { place: "Edmonton, Alberta", lon: -113.49, lat: 53.55, accent: "canadian-english" },
  "Joseph Smith Jr.": { place: "Sharon, Vermont", lon: -72.42, lat: 43.71, accent: "eastern-new-england-english" },
  "Joseph Stalin": { place: "Gori, Georgia", lon: 44.11, lat: 41.98, accent: "russian-influenced-english" },
  "Kris Jenner": { place: "San Diego, California", lon: -117.16, lat: 32.72, accent: "southern-california-english" },
  "Marie Antoinette": { place: "Vienna, Austria", lon: 16.37, lat: 48.21, accent: "french-influenced-english" },
  "Maximilien Robespierre": { place: "Arras, France", lon: 2.78, lat: 50.29, accent: "parisian-french-influenced-english" },
  "Mr. Rogers": { place: "Latrobe, Pennsylvania", lon: -79.38, lat: 40.32, accent: "american-english" },
  "Professor McGonagall": { place: "Caithness, Scotland", lon: -3.45, lat: 58.44, accent: "scottish-english" },
  "Ron Weasley": { place: "Ottery St Mary, Devon", lon: -3.28, lat: 50.75, accent: "estuary-english" },
};

const ACCENT_FIELDS = [
  "accentDefinitionId",
  "pronunciationMapPoint",
  "speechprintInfluence",
  "pronunciationBase",
];

const knownAccentIds = new Set(
  VOICE_ACCENT_DEFINITIONS.map((definition) => definition.id),
);
for (const [name, origin] of Object.entries(ORIGINS)) {
  if (!knownAccentIds.has(origin.accent)) {
    throw new Error(`${name} names unknown accent id ${origin.accent}.`);
  }
  if (Math.abs(origin.lon) > 180 || Math.abs(origin.lat) > 90) {
    throw new Error(`${name} origin coordinates are out of range.`);
  }
}

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function roundPoint(point) {
  return {
    x: Number(point.x.toFixed(10)),
    y: Number(point.y.toFixed(10)),
  };
}

/** The same fields the Avatar Studio atlas apply-path writes for a pin. */
function profileWithOrigin(profile, origin) {
  const fallback = resolveLocalAccentFallback({
    accentDefinitionId: origin.accent,
    pronunciationBase: profile.pronunciationBase,
    speechprintInfluence: profile.speechprintInfluence,
  });
  return {
    ...profile,
    accentDefinitionId: origin.accent,
    pronunciationMapPoint: roundPoint(
      voiceAccentMapPointForCoordinates(origin.lon, origin.lat),
    ),
    speechprintInfluence: fallback.speechprintInfluence,
    pronunciationBase: fallback.pronunciationBase,
  };
}

function accentSlice(profile) {
  return Object.fromEntries(
    ACCENT_FIELDS.map((field) => [field, profile?.[field] ?? null]),
  );
}

function withoutAccentFields(profile) {
  if (!profile || typeof profile !== "object") return profile;
  const copy = { ...profile };
  for (const field of ACCENT_FIELDS) delete copy[field];
  return copy;
}

function protectedBundleDocument(document) {
  const copy = structuredClone(document);
  if (copy.bot?.authoredAudioVoiceProfile) {
    copy.bot.authoredAudioVoiceProfile = withoutAccentFields(
      copy.bot.authoredAudioVoiceProfile,
    );
  }
  return copy;
}

function protectedLibraryHashInput(row) {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([column]) =>
        column !== "authored_audio_voice_profile" &&
        column !== "audio_voice_profile_override" &&
        column !== "updated_at",
    ),
  );
}

function assertDatabaseIntegrity(database, label) {
  const integrity = database.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

function readBundle(entry, bundlePathOverride = null) {
  const bundlePath =
    bundlePathOverride ??
    join(marketplaceRoot, entry.bundlePath.replace(/^\/bot-marketplace\//u, ""));
  const entryNames = execFileSync("unzip", ["-Z1", bundlePath], {
    encoding: "utf8",
  })
    .split(/\r?\n/u)
    .filter(Boolean);
  if (!entryNames.includes("bot.json")) {
    throw new Error(`${entry.name} archive is missing bot.json.`);
  }
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], { encoding: "utf8" }),
  );
  if (document.botHash !== entry.botHash || document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle identity does not match the manifest.`);
  }
  return {
    bundlePath,
    entryNames,
    document,
    protectedDocument: protectedBundleDocument(document),
  };
}

function rebuildBundle(target, outputPath) {
  const scratch = mkdtempSync(join(tmpdir(), "prism-accent-bundle-"));
  try {
    execFileSync("unzip", ["-qq", target.bundle.bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    document.bot.authoredAudioVoiceProfile = profileWithOrigin(
      document.bot.authoredAudioVoiceProfile,
      target.origin,
    );
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
    execFileSync("zip", ["-X", "-q", outputPath, ...target.bundle.entryNames], {
      cwd: scratch,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const databaseArgument = flagValue("--db") || desktopDbDefault;
const userIdArgument = flagValue("--user-id");
const backupDirectoryArgument = flagValue("--backup-dir");

if (shouldApply === explicitDryRun) {
  throw new Error("Choose either --dry-run or --apply.");
}
if (shouldApply && !backupDirectoryArgument) {
  throw new Error("Applying requires --backup-dir PATH.");
}

const databasePath = resolve(databaseArgument);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const db = new DatabaseSync(databasePath, { readOnly: !shouldApply });
const users = db.prepare("SELECT id FROM users ORDER BY created_at ASC").all();
let userId = userIdArgument;
if (!userId) {
  if (users.length !== 1) {
    throw new Error(
      `Library contains ${users.length} users; provide --user-id explicitly.`,
    );
  }
  userId = users[0].id;
}
if (!users.some((user) => user.id === userId)) {
  throw new Error("The requested Library user does not exist in this database.");
}

// ——— Marketplace targets ———
const marketplaceTargets = manifest.bots.flatMap((entry) => {
  const origin = ORIGINS[entry.name];
  if (!origin) return [];
  const bundle = readBundle(entry);
  const profile = bundle.document.bot?.authoredAudioVoiceProfile;
  if (!profile) {
    throw new Error(`${entry.name} bundle has no authored audio voice profile.`);
  }
  const after = profileWithOrigin(profile, origin);
  return [
    {
      entry,
      origin,
      bundle,
      before: accentSlice(profile),
      after: accentSlice(after),
      changing: !jsonEqual(accentSlice(profile), accentSlice(after)),
    },
  ];
});
const marketplaceChanges = marketplaceTargets.filter((target) => target.changing);
const marketplaceNames = new Set(manifest.bots.map((entry) => entry.name));

// ——— Library targets ———
const libraryRows = db
  .prepare("SELECT * FROM bots WHERE user_id = ? ORDER BY name, id")
  .all(userId);
const libraryTargets = libraryRows.flatMap((row) => {
  const origin = ORIGINS[row.name];
  if (!origin) return [];
  let authored = null;
  let override = null;
  try {
    authored = row.authored_audio_voice_profile
      ? JSON.parse(row.authored_audio_voice_profile)
      : null;
  } catch {
    return [{ row, origin, unparseable: true }];
  }
  try {
    override = row.audio_voice_profile_override
      ? JSON.parse(row.audio_voice_profile_override)
      : null;
  } catch {
    return [{ row, origin, unparseable: true }];
  }
  if (!authored && !override) {
    return [{ row, origin, missingProfile: true }];
  }
  const authoredAfter = authored ? profileWithOrigin(authored, origin) : null;
  const overrideAfter = override ? profileWithOrigin(override, origin) : null;
  const changing =
    (authored && !jsonEqual(accentSlice(authored), accentSlice(authoredAfter))) ||
    (override && !jsonEqual(accentSlice(override), accentSlice(overrideAfter)));
  return [
    {
      row,
      origin,
      authored,
      authoredAfter,
      override,
      overrideAfter,
      before: accentSlice(override ?? authored),
      after: accentSlice(overrideAfter ?? authoredAfter),
      changing: Boolean(changing),
    },
  ];
});
const libraryChanges = libraryTargets.filter((target) => target.changing);
const librarySkips = libraryTargets.filter(
  (target) => target.unparseable || target.missingProfile,
);

const originNamesTouched = new Set([
  ...marketplaceTargets.map((target) => target.entry.name),
  ...libraryTargets.map((target) => target.row.name),
]);
const unmatchedOrigins = Object.keys(ORIGINS).filter(
  (name) => !originNamesTouched.has(name),
);

const describeChange = (target, id, name) => ({
  id,
  name,
  place: target.origin.place,
  accentBefore: target.before?.accentDefinitionId ?? null,
  accentAfter: target.after?.accentDefinitionId ?? null,
  pinBefore: target.before?.pronunciationMapPoint ?? null,
  pinAfter: target.after?.pronunciationMapPoint ?? null,
});

const summary = {
  mode: shouldApply ? "apply" : "dry-run",
  databasePath,
  userId,
  totals: {
    originsListed: Object.keys(ORIGINS).length,
    marketplaceMatched: marketplaceTargets.length,
    marketplaceChanging: marketplaceChanges.length,
    libraryMatched: libraryTargets.length,
    libraryChanging: libraryChanges.length,
    librarySkipped: librarySkips.length,
  },
  unmatchedOrigins,
  librarySkips: librarySkips.map((target) => ({
    id: target.row.id,
    name: target.row.name,
    reason: target.unparseable ? "unparseable-profile" : "no-voice-profile",
  })),
  marketplaceChanges: marketplaceChanges.map((target) =>
    describeChange(target, target.entry.id, target.entry.name),
  ),
  libraryChanges: libraryChanges.map((target) =>
    describeChange(target, target.row.id, target.row.name),
  ),
};

console.log(JSON.stringify(summary, null, 2));

if (!shouldApply) {
  assertDatabaseIntegrity(db, "Live database");
  db.close();
  process.exit(0);
}

const backupDirectory = resolve(backupDirectoryArgument);
if (existsSync(backupDirectory)) {
  throw new Error(`Refusing to overwrite existing backup: ${backupDirectory}`);
}
mkdirSync(backupDirectory, { recursive: true });
const bundleBackupDirectory = join(backupDirectory, "marketplace-bundles");
mkdirSync(bundleBackupDirectory, { recursive: true });
copyFileSync(manifestPath, join(backupDirectory, "manifest.json"));
for (const target of marketplaceChanges) {
  copyFileSync(
    target.bundle.bundlePath,
    join(bundleBackupDirectory, basename(target.bundle.bundlePath)),
  );
}
writeFileSync(
  join(backupDirectory, "audit-before.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);

// A whole-database backup cannot converge against a live writer: the SQLite
// backup API restarts from page zero on every external write, and this
// database is multiple gigabytes while the app may be running. The migration
// touches exactly two columns of the bots table, so the proportional safety
// rail is a complete row dump of that table — every column of every row —
// which restores any touched row byte-for-byte.
writeFileSync(
  join(backupDirectory, "bots-rows-before.json"),
  `${JSON.stringify(libraryRows, null, 2)}\n`,
);

const stagedDirectory = mkdtempSync(join(tmpdir(), "prism-accent-stage-"));
let transactionOpen = false;
try {
  // Stage and verify every bundle before anything mutates.
  for (const target of marketplaceChanges) {
    const stagedPath = join(stagedDirectory, basename(target.bundle.bundlePath));
    rebuildBundle(target, stagedPath);
    const staged = readBundle(target.entry, stagedPath);
    const stagedProfile = staged.document.bot.authoredAudioVoiceProfile;
    if (!jsonEqual(accentSlice(stagedProfile), target.after)) {
      throw new Error(`${target.entry.name} staged accent did not apply.`);
    }
    if (!jsonEqual(staged.protectedDocument, target.bundle.protectedDocument)) {
      throw new Error(
        `${target.entry.name} staged bundle changed unrelated data.`,
      );
    }
    if (!jsonEqual(staged.entryNames, target.bundle.entryNames)) {
      throw new Error(`${target.entry.name} staged archive entries changed.`);
    }
    target.stagedPath = stagedPath;
  }

  db.exec("BEGIN IMMEDIATE");
  transactionOpen = true;
  const updateStatement = db.prepare(
    `UPDATE bots
        SET authored_audio_voice_profile = ?,
            audio_voice_profile_override = ?,
            updated_at = ?
      WHERE id = ? AND user_id = ?`,
  );
  const now = new Date().toISOString();
  for (const target of libraryChanges) {
    const current = db
      .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
      .get(target.row.id, userId);
    if (!current) {
      throw new Error(`${target.row.name} disappeared during migration.`);
    }
    if (
      !jsonEqual(
        protectedLibraryHashInput(current),
        protectedLibraryHashInput(target.row),
      )
    ) {
      throw new Error(
        `${target.row.name} changed underneath the migration; rerun.`,
      );
    }
    updateStatement.run(
      target.authoredAfter
        ? JSON.stringify(target.authoredAfter)
        : target.row.authored_audio_voice_profile,
      target.overrideAfter
        ? JSON.stringify(target.overrideAfter)
        : target.row.audio_voice_profile_override,
      now,
      target.row.id,
      userId,
    );
  }
  db.exec("COMMIT");
  transactionOpen = false;

  for (const target of marketplaceChanges) {
    renameSync(target.stagedPath, target.bundle.bundlePath);
  }
} catch (error) {
  if (transactionOpen) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The original error matters more than rollback noise.
    }
  }
  throw error;
} finally {
  rmSync(stagedDirectory, { recursive: true, force: true });
}

assertDatabaseIntegrity(db, "Live database after migration");
db.close();
console.log(
  JSON.stringify(
    {
      applied: true,
      backupDirectory,
      marketplaceBundlesRewritten: marketplaceChanges.length,
      libraryRowsRewritten: libraryChanges.length,
    },
    null,
    2,
  ),
);
