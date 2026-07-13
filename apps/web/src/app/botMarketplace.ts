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

export type MarketplaceContentType = "bot" | "lens";
export type BotMarketplaceEntryInstallState = "available" | "installed";
export type BotMarketplaceThemeInstallState = "available" | "partial" | "installed";
export type MarketplaceLensInstallState = "available" | "installed";
export type MarketplaceLensKind =
  | "sacred_wisdom"
  | "creative_style"
  | "roleplay"
  | "thinking_style"
  | "civic_perspective"
  | "research_persona"
  | "utility"
  | "other";

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
  replacementType: MarketplaceContentType | null;
  replacementIds: string[];
  powers?: BotPowerV1[];
}

export interface MarketplaceLensCategory {
  id: string;
  name: string;
  description: string;
  disclaimer: string | null;
  lensIds: string[];
}

export interface MarketplaceLensEntry {
  id: string;
  seed: string | null;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  themes: string[];
  tone: string | null;
  inspiredBy: string[];
  constraints: string[];
  prohibitedClaims: string[];
  systemPromptFragment: string;
  marketplaceVisible: boolean;
  installed: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lensKind: MarketplaceLensKind;
  researchUseAllowed: boolean;
  researchDisclaimer: string | null;
}

export interface BotMarketplaceManifest {
  schema: "prism-bot-marketplace-v1";
  version: number;
  updatedAt: string | null;
  themes: BotMarketplaceTheme[];
  bots: BotMarketplaceEntry[];
  lensCategories: MarketplaceLensCategory[];
  lenses: MarketplaceLensEntry[];
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
const MARKETPLACE_LENS_KINDS: readonly MarketplaceLensKind[] = [
  "sacred_wisdom",
  "creative_style",
  "roleplay",
  "thinking_style",
  "civic_perspective",
  "research_persona",
  "utility",
  "other",
];

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

function normalizeMarketplaceContentType(value: unknown): MarketplaceContentType | null {
  const contentType = normalizeMarketplaceId(value);
  return contentType === "bot" || contentType === "lens" ? contentType : null;
}

function normalizeLensKind(value: unknown): MarketplaceLensKind {
  const lensKind = stringValue(value) as MarketplaceLensKind;
  return MARKETPLACE_LENS_KINDS.includes(lensKind) ? lensKind : "other";
}

function normalizeLensCategoryId(value: unknown): string {
  return stringValue(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
      replacementType: normalizeMarketplaceContentType(botRecord.replacementType),
      replacementIds: stringList(botRecord.replacementIds).map((replacementId) =>
        replacementId.toLowerCase()
      ),
      ...(powers.length > 0 ? { powers } : {}),
    });
  }

  const seenLensIds = new Set<string>();
  const lenses: MarketplaceLensEntry[] = [];
  for (const candidate of Array.isArray(record.lenses) ? record.lenses : []) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const lensRecord = candidate as Record<string, unknown>;
    const id = normalizeMarketplaceId(lensRecord.id);
    const displayName = stringValue(lensRecord.displayName);
    const description = stringValue(lensRecord.description);
    const category = stringValue(lensRecord.category);
    const systemPromptFragment = stringValue(lensRecord.systemPromptFragment);
    if (!id || !displayName || !description || !category || !systemPromptFragment) continue;
    if (seenLensIds.has(id)) continue;
    seenLensIds.add(id);
    lenses.push({
      id,
      seed: stringValue(lensRecord.seed) || null,
      displayName,
      description,
      category,
      tags: stringList(lensRecord.tags).map((tag) => tag.toLowerCase()),
      themes: stringList(lensRecord.themes),
      tone: stringValue(lensRecord.tone) || null,
      inspiredBy: stringList(lensRecord.inspiredBy),
      constraints: stringList(lensRecord.constraints),
      prohibitedClaims: stringList(lensRecord.prohibitedClaims),
      systemPromptFragment,
      marketplaceVisible: booleanValue(lensRecord.marketplaceVisible, true),
      installed: booleanValue(lensRecord.installed, false),
      createdAt: stringValue(lensRecord.createdAt) || null,
      updatedAt: stringValue(lensRecord.updatedAt) || null,
      lensKind: normalizeLensKind(lensRecord.lensKind),
      researchUseAllowed: booleanValue(lensRecord.researchUseAllowed, false),
      researchDisclaimer: stringValue(lensRecord.researchDisclaimer) || null,
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

  const seenLensCategoryIds = new Set<string>();
  const lensCategories: MarketplaceLensCategory[] = [];
  for (const candidate of Array.isArray(record.lensCategories) ? record.lensCategories : []) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const categoryRecord = candidate as Record<string, unknown>;
    const name = stringValue(categoryRecord.name);
    const id = normalizeMarketplaceId(categoryRecord.id) || normalizeLensCategoryId(name);
    if (!id || !name || seenLensCategoryIds.has(id)) continue;
    const lensIds = stringList(categoryRecord.lensIds)
      .map((lensId) => lensId.toLowerCase())
      .filter((lensId) => seenLensIds.has(lensId));
    seenLensCategoryIds.add(id);
    lensCategories.push({
      id,
      name,
      description: stringValue(categoryRecord.description),
      disclaimer: stringValue(categoryRecord.disclaimer) || null,
      lensIds,
    });
  }

  return {
    schema: MARKETPLACE_SCHEMA,
    version: nonnegativeInteger(record.version) || 1,
    updatedAt: stringValue(record.updatedAt) || null,
    themes,
    bots,
    lensCategories,
    lenses,
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

export function marketplaceVisibleLensEntries(
  manifest: BotMarketplaceManifest
): MarketplaceLensEntry[] {
  return manifest.lenses.filter((entry) => entry.marketplaceVisible);
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

export function marketplaceLensEntriesForCategory(
  manifest: BotMarketplaceManifest,
  categoryId: string
): MarketplaceLensEntry[] {
  const category = manifest.lensCategories.find((candidate) => candidate.id === categoryId);
  if (!category) return [];
  const byId = new Map(manifest.lenses.map((entry) => [entry.id, entry]));
  if (category.lensIds.length > 0) {
    return category.lensIds
      .map((lensId) => byId.get(lensId) ?? null)
      .filter((entry): entry is MarketplaceLensEntry =>
        Boolean(entry?.marketplaceVisible)
      );
  }
  return manifest.lenses.filter(
    (entry) =>
      entry.marketplaceVisible &&
      normalizeLensCategoryId(entry.category) === category.id
  );
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

export function marketplaceLensInstallState(
  lens: MarketplaceLensEntry,
  installedLensIds: ReadonlySet<string>
): MarketplaceLensInstallState {
  return lens.installed || installedLensIds.has(lens.id) ? "installed" : "available";
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
