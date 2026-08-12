import fs from "node:fs/promises";
import path from "node:path";

const MARKETPLACE_SCHEMA = "prism-bot-marketplace-v1";
const POLICY_SCHEMA = "prism-steam-marketplace-allowlist-v1";

async function exists(target) {
  return fs.stat(target).then(() => true).catch(() => false);
}

async function readJson(target) {
  return JSON.parse(await fs.readFile(target, "utf8"));
}

function normalizeId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function parsePolicy(raw) {
  assertRecord(raw, "Steam Marketplace allowlist");
  if (raw.schema !== POLICY_SCHEMA) {
    throw new Error(`Unsupported Steam Marketplace allowlist schema: ${raw.schema ?? "missing"}.`);
  }
  if (!Number.isInteger(raw.version) || raw.version < 1) {
    throw new Error("Steam Marketplace allowlist version must be a positive integer.");
  }
  if (!Array.isArray(raw.approvedBotIds) || raw.approvedBotIds.length === 0) {
    throw new Error("Steam Marketplace allowlist must approve at least one bot.");
  }

  const approvedBotIds = raw.approvedBotIds.map(normalizeId);
  if (approvedBotIds.some((id) => !id)) {
    throw new Error("Steam Marketplace allowlist contains an invalid bot ID.");
  }
  if (new Set(approvedBotIds).size !== approvedBotIds.length) {
    throw new Error("Steam Marketplace allowlist contains duplicate bot IDs.");
  }
  const steamExcludedBotIds = (Array.isArray(raw.steamExcludedBotIds) ? raw.steamExcludedBotIds : []).map(normalizeId);
  if (steamExcludedBotIds.some((id) => !id)) {
    throw new Error("Steam Marketplace exclusion list contains an invalid bot ID.");
  }
  if (new Set(steamExcludedBotIds).size !== steamExcludedBotIds.length) {
    throw new Error("Steam Marketplace exclusion list contains duplicate bot IDs.");
  }
  if (steamExcludedBotIds.some((id) => approvedBotIds.includes(id))) {
    throw new Error("Steam Marketplace bots cannot be both approved and excluded.");
  }
  return {
    ...raw,
    approvedBotIds,
    steamExcludedBotIds,
  };
}

function parseManifest(raw) {
  assertRecord(raw, "Marketplace manifest");
  if (raw.schema !== MARKETPLACE_SCHEMA) {
    throw new Error(`Unsupported Marketplace manifest schema: ${raw.schema ?? "missing"}.`);
  }
  if (!Array.isArray(raw.bots) || !Array.isArray(raw.themes)) {
    throw new Error("Marketplace manifest must include bots and themes arrays.");
  }

  const seenBotIds = new Set();
  for (const bot of raw.bots) {
    assertRecord(bot, "Marketplace bot");
    const id = normalizeId(bot.id);
    if (!id) throw new Error("Marketplace bot is missing an ID.");
    if (seenBotIds.has(id)) throw new Error(`Marketplace bot ID is duplicated: ${id}.`);
    if (bot.branchLock && bot.branchLock !== "dev") {
      throw new Error(`Marketplace bot ${id} has unsupported branch lock: ${bot.branchLock}.`);
    }
    seenBotIds.add(id);
  }

  const seenThemeIds = new Set();
  for (const theme of raw.themes) {
    assertRecord(theme, "Marketplace theme");
    const id = normalizeId(theme.id);
    if (!id) throw new Error("Marketplace theme is missing an ID.");
    if (seenThemeIds.has(id)) throw new Error(`Marketplace theme ID is duplicated: ${id}.`);
    if (theme.branchLock && theme.branchLock !== "dev") {
      throw new Error(`Marketplace theme ${id} has unsupported branch lock: ${theme.branchLock}.`);
    }
    seenThemeIds.add(id);
  }
  return raw;
}

function marketplaceBundleRelativePath(bundlePath) {
  if (typeof bundlePath !== "string" || !bundlePath.startsWith("/bot-marketplace/")) {
    throw new Error(`Marketplace bundle path is outside the Marketplace: ${bundlePath ?? "missing"}.`);
  }
  const relative = path.posix.normalize(bundlePath.slice("/bot-marketplace/".length));
  if (
    relative.startsWith("../") ||
    path.posix.isAbsolute(relative) ||
    !relative.startsWith("bots/") ||
    !relative.endsWith(".bot")
  ) {
    throw new Error(`Marketplace bundle path is unsafe: ${bundlePath}.`);
  }
  return relative;
}

function withoutBranchLock(record) {
  const { branchLock: _branchLock, ...rest } = record;
  return rest;
}

export function resolveSteamMarketplaceContent(manifestRaw, policyRaw) {
  const manifest = parseManifest(manifestRaw);
  const policy = parsePolicy(policyRaw);
  const approvedIds = new Set(policy.approvedBotIds);
  const steamExcludedIds = new Set(policy.steamExcludedBotIds);
  const sourceBotsById = new Map(manifest.bots.map((bot) => [normalizeId(bot.id), bot]));

  const missingApprovedIds = policy.approvedBotIds.filter((id) => !sourceBotsById.has(id));
  if (missingApprovedIds.length > 0) {
    throw new Error(`Steam Marketplace allowlist references missing bots: ${missingApprovedIds.join(", ")}.`);
  }
  const missingExcludedIds = policy.steamExcludedBotIds.filter((id) => !sourceBotsById.has(id));
  if (missingExcludedIds.length > 0) {
    throw new Error(`Steam Marketplace exclusion list references missing bots: ${missingExcludedIds.join(", ")}.`);
  }

  const approvedDevLockedIds = policy.approvedBotIds.filter(
    (id) => sourceBotsById.get(id)?.branchLock === "dev",
  );
  if (approvedDevLockedIds.length > 0) {
    throw new Error(`Dev-locked bots cannot be approved for Steam: ${approvedDevLockedIds.join(", ")}.`);
  }

  const unapprovedPublicIds = manifest.bots
    .filter((bot) => !bot.branchLock && !approvedIds.has(normalizeId(bot.id)) && !steamExcludedIds.has(normalizeId(bot.id)))
    .map((bot) => normalizeId(bot.id));
  if (unapprovedPublicIds.length > 0) {
    throw new Error(
      `Public Marketplace bots are missing from the Steam allowlist: ${unapprovedPublicIds.join(", ")}. ` +
      "Dev-only bots must use branchLock=dev; Steam bots must be explicitly approved.",
    );
  }

  const approvedBots = manifest.bots
    .filter((bot) => approvedIds.has(normalizeId(bot.id)))
    .map((bot) => {
      marketplaceBundleRelativePath(bot.bundlePath);
      const memoryCount = Number(bot.memoryCount ?? 0);
      if (memoryCount !== 0) {
        throw new Error(
          `Steam Marketplace bot ${normalizeId(bot.id)} must ship with memoryCount 0 (got ${memoryCount}). ` +
            "Packaged memories are earned in play, not authored into the persona pack.",
        );
      }
      return withoutBranchLock(bot);
    });
  const approvedBundlePaths = approvedBots.map((bot) => bot.bundlePath);
  if (new Set(approvedBundlePaths).size !== approvedBundlePaths.length) {
    throw new Error("Steam-approved Marketplace bots must use unique bundle paths.");
  }
  const devLockedBots = manifest.bots.filter((bot) => bot.branchLock === "dev");

  const approvedThemeIds = new Set();
  for (const theme of manifest.themes) {
    if (theme.branchLock === "dev") continue;
    const explicitBotIds = Array.isArray(theme.botIds) ? theme.botIds.map(normalizeId) : [];
    const resolvedBotIds = explicitBotIds.length > 0
      ? explicitBotIds.filter((id) => approvedIds.has(id))
      : approvedBots
          .filter((bot) => Array.isArray(bot.themeIds) && bot.themeIds.map(normalizeId).includes(normalizeId(theme.id)))
          .map((bot) => normalizeId(bot.id));
    if (resolvedBotIds.length > 0) approvedThemeIds.add(normalizeId(theme.id));
  }

  const approvedThemes = manifest.themes
    .filter((theme) => approvedThemeIds.has(normalizeId(theme.id)))
    .map((theme) => ({
      ...withoutBranchLock(theme),
      botIds: (Array.isArray(theme.botIds) ? theme.botIds : [])
        .map(normalizeId)
        .filter((id) => approvedIds.has(id)),
    }));

  const shippingBots = approvedBots.map((bot) => ({
    ...bot,
    themeIds: (Array.isArray(bot.themeIds) ? bot.themeIds : [])
      .map(normalizeId)
      .filter((id) => approvedThemeIds.has(id)),
  }));

  return {
    manifest: {
      ...manifest,
      themes: approvedThemes,
      bots: shippingBots,
    },
    policy,
    report: {
      policyVersion: policy.version,
      manifestVersion: manifest.version,
      approvedBots: shippingBots.map((bot) => ({
        id: normalizeId(bot.id),
        name: bot.name,
        bundlePath: bot.bundlePath,
      })),
      excludedDevBotCount: devLockedBots.length,
      excludedSteamBots: manifest.bots
        .filter((bot) => steamExcludedIds.has(normalizeId(bot.id)))
        .map((bot) => ({ id: normalizeId(bot.id), name: bot.name })),
    },
  };
}

async function listFilesRecursively(root) {
  if (!(await exists(root))) return [];
  const files = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(target));
    } else if (entry.isFile()) {
      files.push(target);
    } else {
      throw new Error(`Steam Marketplace staging does not allow links or special files: ${target}.`);
    }
  }
  return files;
}

export async function stageSteamMarketplace(options) {
  const { sourcePublicRoot, destinationPublicRoot, policyPath } = options;
  const sourceMarketplaceRoot = path.join(sourcePublicRoot, "bot-marketplace");
  const destinationMarketplaceRoot = path.join(destinationPublicRoot, "bot-marketplace");
  const manifestPath = path.join(sourceMarketplaceRoot, "manifest.json");
  const { manifest, policy, report } = resolveSteamMarketplaceContent(
    await readJson(manifestPath),
    await readJson(policyPath),
  );

  await fs.rm(destinationMarketplaceRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(destinationMarketplaceRoot, "bots"), { recursive: true });
  for (const bot of manifest.bots) {
    const relativeBundlePath = marketplaceBundleRelativePath(bot.bundlePath);
    const source = path.join(sourceMarketplaceRoot, ...relativeBundlePath.split("/"));
    const destination = path.join(destinationMarketplaceRoot, ...relativeBundlePath.split("/"));
    if (!(await exists(source))) {
      throw new Error(`Approved Steam Marketplace bundle is missing: ${bot.id} (${source}).`);
    }
    const sourceStat = await fs.lstat(source);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new Error(`Approved Steam Marketplace bundle must be a regular file: ${source}.`);
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  await fs.writeFile(
    path.join(destinationMarketplaceRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  await verifyStagedSteamMarketplace({ destinationPublicRoot, policy });
  return report;
}

export async function verifyStagedSteamMarketplace(options) {
  const { destinationPublicRoot } = options;
  const policy = options.policy ?? parsePolicy(await readJson(options.policyPath));
  const marketplaceRoot = path.join(destinationPublicRoot, "bot-marketplace");
  const manifest = parseManifest(await readJson(path.join(marketplaceRoot, "manifest.json")));
  const approvedIds = new Set(policy.approvedBotIds);
  const stagedIds = manifest.bots.map((bot) => normalizeId(bot.id));

  if (stagedIds.length !== approvedIds.size || stagedIds.some((id) => !approvedIds.has(id))) {
    throw new Error("Staged Steam Marketplace bot roster does not exactly match the allowlist.");
  }
  if (manifest.bots.some((bot) => bot.branchLock) || manifest.themes.some((theme) => theme.branchLock)) {
    throw new Error("Staged Steam Marketplace still contains branch-locked content.");
  }

  const expectedBundles = new Set(
    manifest.bots.map((bot) => path.posix.join("bot-marketplace", marketplaceBundleRelativePath(bot.bundlePath))),
  );
  if (expectedBundles.size !== manifest.bots.length) {
    throw new Error("Staged Steam Marketplace contains duplicate bundle paths.");
  }
  const stagedBotFiles = (await listFilesRecursively(destinationPublicRoot))
    .filter((target) => target.endsWith(".bot"))
    .map((target) => path.relative(destinationPublicRoot, target).split(path.sep).join("/"));
  const unexpectedBundles = stagedBotFiles.filter((relative) => !expectedBundles.has(relative));
  const missingBundles = [...expectedBundles].filter((relative) => !stagedBotFiles.includes(relative));
  if (unexpectedBundles.length > 0 || missingBundles.length > 0) {
    throw new Error(
      `Staged Steam Marketplace bundle mismatch. Unexpected: ${unexpectedBundles.join(", ") || "none"}; ` +
      `missing: ${missingBundles.join(", ") || "none"}.`,
    );
  }
  return {
    botCount: manifest.bots.length,
    bundleCount: stagedBotFiles.length,
  };
}

export function renderSteamContentReport(report) {
  const lines = [
    "# PRISM Steam Content Report",
    "",
    `- Marketplace policy version: ${report.policyVersion}`,
    `- Marketplace manifest version: ${report.manifestVersion}`,
    `- Approved Marketplace bots: ${report.approvedBots.length}`,
    `- Excluded development-only bots: ${report.excludedDevBotCount}`,
    `- Excluded pending rights/provenance review: ${report.excludedSteamBots.length}`,
    "",
    "## Approved Marketplace Bots",
    "",
    ...report.approvedBots.map((bot) => `- ${bot.name} (\`${bot.id}\`)`),
    "",
    "## Excluded Pending Rights/Provenance Review",
    "",
    ...report.excludedSteamBots.map((bot) => `- ${bot.name} (\`${bot.id}\`)`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
