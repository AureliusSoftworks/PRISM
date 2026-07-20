import { normalizeBotFaceEyeCharacter } from "@localai/shared";

import { normalizeBotPowersV1, type BotPowerV1 } from "@localai/shared";

export const BOT_MARKETPLACE_MANIFEST_PATH = "/bot-marketplace/manifest.json";

/**
 * Marketplace faces use one glyph for the eye row. Keep that glyph visibly
 * pair-like after the plate face is rotated sideways; letters and single
 * marks read as one eye and are not suitable for the marketplace roster.
 */
export const MARKETPLACE_SIDEWAYS_EYE_CHARACTERS = [
  "=",
  ":",
  "≈",
] as const;

const marketplaceSidewaysEyeCharacterSet = new Set<string>(
  MARKETPLACE_SIDEWAYS_EYE_CHARACTERS
);

export function marketplaceBotEyeCharacterIsSideways(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  if (!value.trim()) return true;
  const normalized = normalizeBotFaceEyeCharacter(value);
  return normalized !== null && marketplaceSidewaysEyeCharacterSet.has(normalized);
}

export type BotMarketplaceEntryInstallState = "available" | "installed";
export type BotMarketplaceThemeInstallState = "available" | "partial" | "installed";

export interface BotMarketplaceTheme {
  id: string;
  name: string;
  description: string;
  botIds: string[];
}

export interface BotMarketplaceEntry {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  botHash: string;
  bundlePath: string;
  memoryCount: number;
  color: string | null;
  glyph: string | null;
  themeIds: string[];
  tags: string[];
  marketplaceVisible: boolean;
  deprecated: boolean;
  replacementType: "bot" | null;
  replacementIds: string[];
  powers?: BotPowerV1[];
}

export interface BotMarketplaceManifest {
  schema: "prism-bot-marketplace-v1";
  version: number;
  updatedAt: string | null;
  themes: BotMarketplaceTheme[];
  bots: BotMarketplaceEntry[];
}

export type BotMarketplaceUpdateRevisions = Readonly<Record<string, string>>;

export function marketplaceCatalogRevision(manifest: BotMarketplaceManifest): string {
  return manifest.updatedAt?.trim() || `version:${manifest.version}`;
}

export function marketplaceEntryNeedsUpdate(
  entry: BotMarketplaceEntry,
  installedHashes: ReadonlySet<string>,
  updatedRevisions: BotMarketplaceUpdateRevisions,
  catalogRevision: string
): boolean {
  return (
    installedHashes.has(entry.botHash) &&
    updatedRevisions[entry.id] !== catalogRevision
  );
}

export interface BotMarketplacePreparedBundle {
  entry: BotMarketplaceEntry;
  bytes: Uint8Array;
}

const MARKETPLACE_SCHEMA = "prism-bot-marketplace-v1";
const HASH_PATTERN = /^[a-f0-9]{32}$/;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMarketplaceId(value: unknown): string {
  return stringValue(value).toLowerCase();
}

function normalizeMarketplaceHash(value: unknown): string | null {
  const hash = stringValue(value).toLowerCase();
  return HASH_PATTERN.test(hash) ? hash : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => stringValue(item))
        .filter((item) => item.length > 0)
    )
  );
}

function nonnegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeBotMarketplaceManifest(raw: unknown): BotMarketplaceManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid bot marketplace manifest.");
  }
  const record = raw as Record<string, unknown>;
  if (record.schema !== MARKETPLACE_SCHEMA) {
    throw new Error("Unsupported bot marketplace manifest.");
  }

  const seenBotIds = new Set<string>();
  const seenHashes = new Set<string>();
  const bots: BotMarketplaceEntry[] = [];

  for (const candidate of Array.isArray(record.bots) ? record.bots : []) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const botRecord = candidate as Record<string, unknown>;
    const id = normalizeMarketplaceId(botRecord.id);
    const name = stringValue(botRecord.name);
    const botHash = normalizeMarketplaceHash(botRecord.botHash);
    const bundlePath = stringValue(botRecord.bundlePath);
    if (!id || !name || !botHash || !bundlePath) continue;
    if (seenBotIds.has(id) || seenHashes.has(botHash)) continue;
    seenBotIds.add(id);
    seenHashes.add(botHash);
    const powers = normalizeBotPowersV1(botRecord.powers);
    bots.push({
      id,
      name,
      subtitle: stringValue(botRecord.subtitle),
      description: stringValue(botRecord.description),
      botHash,
      bundlePath,
      memoryCount: nonnegativeInteger(botRecord.memoryCount),
      color: stringValue(botRecord.color) || null,
      glyph: stringValue(botRecord.glyph) || null,
      themeIds: stringList(botRecord.themeIds).map((themeId) => themeId.toLowerCase()),
      tags: stringList(botRecord.tags).map((tag) => tag.toLowerCase()),
      marketplaceVisible: booleanValue(botRecord.marketplaceVisible, true),
      deprecated: booleanValue(botRecord.deprecated, false),
      replacementType:
        normalizeMarketplaceId(botRecord.replacementType) === "bot"
          ? "bot"
          : null,
      replacementIds: stringList(botRecord.replacementIds).map((replacementId) =>
        replacementId.toLowerCase()
      ),
      ...(powers.length > 0 ? { powers } : {}),
    });
  }

  const seenThemeIds = new Set<string>();
  const themes: BotMarketplaceTheme[] = [];
  for (const candidate of Array.isArray(record.themes) ? record.themes : []) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const themeRecord = candidate as Record<string, unknown>;
    const id = normalizeMarketplaceId(themeRecord.id);
    const name = stringValue(themeRecord.name);
    if (!id || !name || seenThemeIds.has(id)) continue;
    const botIds = stringList(themeRecord.botIds)
      .map((botId) => botId.toLowerCase())
      .filter((botId) => seenBotIds.has(botId));
    seenThemeIds.add(id);
    themes.push({
      id,
      name,
      description: stringValue(themeRecord.description),
      botIds,
    });
  }

  return {
    schema: MARKETPLACE_SCHEMA,
    version: nonnegativeInteger(record.version) || 1,
    updatedAt: stringValue(record.updatedAt) || null,
    themes,
    bots,
  };
}

export function marketplaceInstalledHashSet(
  hashes: Iterable<string | null | undefined>
): Set<string> {
  const set = new Set<string>();
  for (const hash of hashes) {
    const normalized = normalizeMarketplaceHash(hash);
    if (normalized) set.add(normalized);
  }
  return set;
}

export function marketplaceEntryInstallState(
  entry: BotMarketplaceEntry,
  installedHashes: ReadonlySet<string>
): BotMarketplaceEntryInstallState {
  return installedHashes.has(entry.botHash) ? "installed" : "available";
}

export function marketplaceVisibleBotEntries(
  manifest: BotMarketplaceManifest
): BotMarketplaceEntry[] {
  return manifest.bots.filter((entry) => entry.marketplaceVisible);
}

export function marketplaceEntriesForTheme(
  manifest: BotMarketplaceManifest,
  themeId: string
): BotMarketplaceEntry[] {
  const theme = manifest.themes.find((candidate) => candidate.id === themeId);
  if (!theme) return [];
  const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
  if (theme.botIds.length > 0) {
    return theme.botIds
      .map((botId) => byId.get(botId) ?? null)
      .filter((entry): entry is BotMarketplaceEntry =>
        Boolean(entry?.marketplaceVisible)
      );
  }
  return manifest.bots.filter(
    (entry) => entry.marketplaceVisible && entry.themeIds.includes(theme.id)
  );
}

export function marketplaceMissingEntries(
  entries: readonly BotMarketplaceEntry[],
  installedHashes: ReadonlySet<string>
): BotMarketplaceEntry[] {
  return entries.filter((entry) => !installedHashes.has(entry.botHash));
}

export function marketplaceThemeInstallState(
  entries: readonly BotMarketplaceEntry[],
  installedHashes: ReadonlySet<string>
): BotMarketplaceThemeInstallState {
  if (entries.length === 0) return "available";
  const installedCount = entries.filter((entry) => installedHashes.has(entry.botHash)).length;
  if (installedCount === 0) return "available";
  return installedCount === entries.length ? "installed" : "partial";
}

export function validateMarketplaceSelectionBundles(
  entries: readonly BotMarketplaceEntry[],
  bundleBytesByPath: ReadonlyMap<string, Uint8Array>
): BotMarketplacePreparedBundle[] {
  const missing = entries.filter((entry) => !bundleBytesByPath.has(entry.bundlePath));
  if (missing.length > 0) {
    throw new Error(
      `Marketplace bundle missing for ${missing.map((entry) => entry.name).join(", ")}.`
    );
  }
  return entries.map((entry) => ({
    entry,
    bytes: bundleBytesByPath.get(entry.bundlePath) ?? new Uint8Array(),
  }));
}
