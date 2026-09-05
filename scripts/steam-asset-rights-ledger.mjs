#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const STEAM_ASSET_MEDIA_EXTENSIONS = Object.freeze([
  ".gif",
  ".eot",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".otf",
  ".ogg",
  ".png",
  ".svg",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

export const STEAM_ASSET_EXCLUDED_TOP_LEVEL = Object.freeze([
  "bot-marketplace",
  "tools",
]);

export const STEAM_ASSET_EXCLUDED_FILES = Object.freeze([
  "file.svg",
  "globe.svg",
  "next.svg",
  "vercel.svg",
  "window.svg",
]);

const ledgerSchema = "prism-steam-asset-rights-v1";
const sourcePublicRoot = path.join(repoRoot, "apps", "web", "public");
const sourceLedgerPath = path.join(repoRoot, "steam-asset-rights-ledger.json");

const rightsProfile = {
  rightsHolder: "Aurelius Games LLC",
  rightsStatus: "owner-attested",
  commercialUse: "allowed-by-rights-holder-attestation",
  attribution: "(c) Aurelius Games LLC",
  source: [
    "apps/web/src/app/aboutCredits.ts#assets.prism-originals",
    "apps/web/src/app/aboutCredits.ts#assets.generated-assets",
  ],
  provenance: {
    origin: "Original PRISM production and selected generated production assets reviewed and integrated in-house.",
    providers: ["OpenAI", "ElevenLabs"],
    modelOrVersion: "Mixed; asset-specific generation metadata is retained by the generating workflow when available.",
    generationDate: "Mixed; asset-specific dates are retained by the generating workflow when available.",
    accountOrPlan: "Owner-attested commercial-use permission for the account or plan used to create each asset.",
    promptOrSourceRights: "Aurelius Games LLC attests to the right to use the source material and prompts for commercial distribution.",
  },
};

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

function assetKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp3" || extension === ".ogg" || extension === ".wav") {
    return "audio";
  }
  if (extension === ".svg") return "vector-art";
  if ([".eot", ".otf", ".ttf", ".woff", ".woff2"].includes(extension)) return "font";
  return "image";
}

async function sha256File(target) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest("hex");
}

async function listFiles(
  root,
  excludedTopLevel = STEAM_ASSET_EXCLUDED_TOP_LEVEL,
  excludedFiles = STEAM_ASSET_EXCLUDED_FILES,
) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      const relative = normalizeRelativePath(path.relative(root, target));
      if (!relative) continue;
      if (excludedFiles.includes(relative)) continue;
      if (entry.isDirectory()) {
        if (excludedTopLevel.includes(relative.split("/")[0])) continue;
        await walk(target);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!STEAM_ASSET_MEDIA_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        continue;
      }
      files.push({ relative, target });
    }
  }
  await walk(root);
  return files.sort((left, right) => left.relative.localeCompare(right.relative));
}

export async function buildSteamAssetRightsLedger({
  publicRoot = sourcePublicRoot,
} = {}) {
  const files = await listFiles(publicRoot);
  const assets = [];
  for (const file of files) {
    assets.push({
      path: file.relative,
      kind: assetKind(file.relative),
      sha256: await sha256File(file.target),
      provenanceProfile: "aurelius-production",
    });
  }

  return {
    schema: ledgerSchema,
    version: 1,
    scope: {
      sourceRoot: "apps/web/public",
      steamRuntimeRoot: "apps/web/.next/standalone/apps/web/public",
      mediaExtensions: [...STEAM_ASSET_MEDIA_EXTENSIONS],
      excludedTopLevel: [...STEAM_ASSET_EXCLUDED_TOP_LEVEL],
      excludedFiles: [...STEAM_ASSET_EXCLUDED_FILES],
    },
    rightsProfiles: {
      "aurelius-production": rightsProfile,
    },
    aiDisclosure: {
      preGeneratedAiContent: true,
      basis: "aurelius-production",
      reviewerText:
        "The Steam build includes selected pre-generated imagery, voices, music, and foley created through connected OpenAI and ElevenLabs tools, then reviewed and integrated in-house.",
    },
    linkedProvenance: [
      "apps/web/src/app/aboutCredits.ts",
      "voice-assets.manifest.json",
      "THIRD_PARTY_NOTICES.md",
      "apps/web/public/worklets/formant-correction-worklet.LICENSE",
    ],
    assets,
  };
}

async function readJson(target) {
  return JSON.parse(await fs.readFile(target, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assetMap(entries, label) {
  const map = new Map();
  for (const entry of entries) {
    assert(typeof entry?.path === "string" && entry.path.length > 0, `${label} has an asset without a path.`);
    assert(!map.has(entry.path), `${label} has a duplicate asset path: ${entry.path}`);
    map.set(entry.path, entry);
  }
  return map;
}

function validateProfile(profile, profileId) {
  assert(profile && typeof profile === "object", `Rights profile is missing: ${profileId}`);
  assert(profile.rightsHolder, `Rights profile ${profileId} has no rights holder.`);
  assert(profile.rightsStatus === "owner-attested" || profile.rightsStatus === "cleared", `Rights profile ${profileId} is not cleared or owner-attested.`);
  assert(
    profile.commercialUse === "allowed" || profile.commercialUse === "allowed-by-rights-holder-attestation",
    `Rights profile ${profileId} does not permit commercial use.`,
  );
  assert(profile.attribution, `Rights profile ${profileId} has no attribution instruction.`);
  assert(Array.isArray(profile.source) && profile.source.length > 0, `Rights profile ${profileId} has no source reference.`);
  assert(profile.provenance?.origin, `Rights profile ${profileId} has no origin record.`);
  assert(Array.isArray(profile.provenance?.providers), `Rights profile ${profileId} has no provider record.`);
  assert(profile.provenance?.modelOrVersion, `Rights profile ${profileId} has no model/version record.`);
  assert(profile.provenance?.generationDate, `Rights profile ${profileId} has no generation-date record.`);
  assert(profile.provenance?.accountOrPlan, `Rights profile ${profileId} has no account/plan record.`);
  assert(profile.provenance?.promptOrSourceRights, `Rights profile ${profileId} has no source-rights record.`);
}

async function verifyAssetSet({ root, expected, label }) {
  const files = await listFiles(root);
  const actual = new Map();
  for (const file of files) {
    actual.set(file.relative, {
      path: file.relative,
      sha256: await sha256File(file.target),
    });
  }

  for (const [assetPath, entry] of expected) {
    const actualEntry = actual.get(assetPath);
    assert(actualEntry, `${label} is missing registered Steam asset: ${assetPath}`);
    assert(actualEntry.sha256 === entry.sha256, `${label} asset checksum failed: ${assetPath}`);
  }
  for (const assetPath of actual.keys()) {
    assert(expected.has(assetPath), `${label} contains an unregistered Steam asset: ${assetPath}`);
  }
  return actual.size;
}

export async function verifySteamAssetRights({
  runtimeDir = path.join(repoRoot, "runtime"),
  ledgerPath = sourceLedgerPath,
  publicRoot = sourcePublicRoot,
} = {}) {
  const ledger = await readJson(ledgerPath);
  assert(ledger.schema === ledgerSchema && ledger.version === 1, "Steam asset-rights ledger schema is invalid.");
  assert(ledger.aiDisclosure?.preGeneratedAiContent === true, "Steam asset-rights ledger does not classify pre-generated AI content.");
  assert(typeof ledger.aiDisclosure?.reviewerText === "string" && ledger.aiDisclosure.reviewerText.length > 0, "Steam asset-rights ledger has no AI disclosure text.");

  const profiles = ledger.rightsProfiles ?? {};
  for (const [profileId, profile] of Object.entries(profiles)) validateProfile(profile, profileId);
  const expected = assetMap(ledger.assets, "Steam asset-rights ledger");
  for (const entry of expected.values()) {
    assert(/^[a-f0-9]{64}$/u.test(entry.sha256 ?? ""), `Steam asset has no SHA-256: ${entry.path}`);
    assert(profiles[entry.provenanceProfile], `Steam asset has no rights profile: ${entry.path}`);
  }

  const sourceCount = await verifyAssetSet({
    root: publicRoot,
    expected,
    label: "Source public assets",
  });

  const resolvedRuntimeDir = path.resolve(runtimeDir);
  const runtimePublicRoot = path.join(
    resolvedRuntimeDir,
    "apps",
    "web",
    ".next",
    "standalone",
    "apps",
    "web",
    "public",
  );
  const runtimeLedgerPath = path.join(resolvedRuntimeDir, "steam-asset-rights-ledger.json");
  const runtimeLedger = await readJson(runtimeLedgerPath);
  assert(
    JSON.stringify(runtimeLedger) === JSON.stringify(ledger),
    "Steam runtime asset-rights ledger does not match the source ledger.",
  );
  const runtimeCount = await verifyAssetSet({
    root: runtimePublicRoot,
    expected,
    label: "Steam runtime public assets",
  });
  assert(sourceCount === runtimeCount, `Steam asset count mismatch: source ${sourceCount}, runtime ${runtimeCount}.`);

  await fs.writeFile(
    path.join(resolvedRuntimeDir, "STEAM_ASSET_RIGHTS_REPORT.md"),
    renderSteamAssetRightsReport({
      assetCount: runtimeCount,
      preGeneratedAiContent: ledger.aiDisclosure.preGeneratedAiContent,
      reviewerText: ledger.aiDisclosure.reviewerText,
      rightsHolder: profiles["aurelius-production"].rightsHolder,
    }),
    "utf8",
  );

  return {
    assetCount: runtimeCount,
    preGeneratedAiContent: ledger.aiDisclosure.preGeneratedAiContent,
    reviewerText: ledger.aiDisclosure.reviewerText,
  };
}

export function renderSteamAssetRightsReport({
  assetCount,
  preGeneratedAiContent,
  reviewerText,
  rightsHolder,
}) {
  return [
    "# Steam Asset Rights Report",
    "",
    "This report was generated from the exact staged Steam runtime.",
    "",
    `- Media assets verified: ${assetCount}`,
    `- Rights holder: ${rightsHolder}`,
    `- Pre-generated AI content: ${preGeneratedAiContent ? "present" : "not present"}`,
    "- Hash coverage: every staged image, audio, vector, and font asset",
    "",
    "## Steam AI disclosure text",
    "",
    reviewerText,
    "",
  ].join("\n");
}

async function main() {
  if (process.argv.includes("--write")) {
    const ledger = await buildSteamAssetRightsLedger();
    await fs.writeFile(sourceLedgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    console.log(`Generated Steam asset-rights ledger: ${ledger.assets.length} media assets.`);
    return;
  }
  const runtimeIndex = process.argv.indexOf("--runtime-dir");
  const runtimeDir = runtimeIndex >= 0 ? process.argv[runtimeIndex + 1] : undefined;
  const result = await verifySteamAssetRights({ runtimeDir });
  console.log(`Steam asset rights verified: ${result.assetCount} media assets; pre-generated AI content disclosed.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
