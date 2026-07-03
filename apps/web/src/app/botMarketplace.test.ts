import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  marketplaceLensEntriesForCategory,
  marketplaceLensInstallState,
  marketplaceEntriesForTheme,
  marketplaceEntryInstallState,
  marketplaceInstalledHashSet,
  marketplaceMissingEntries,
  marketplaceThemeInstallState,
  marketplaceVisibleBotEntries,
  marketplaceVisibleLensEntries,
  normalizeBotMarketplaceManifest,
  validateMarketplaceSelectionBundles,
} from "./botMarketplace.ts";

const baseManifest = {
  schema: "prism-bot-marketplace-v1",
  version: 1,
  updatedAt: "2026-07-02T00:00:00.000Z",
  themes: [
    {
      id: "famous-philosophers",
      name: "Famous Philosophers",
      description: "Thinkers.",
      botIds: ["plato", "aristotle", "missing-bot"],
    },
    {
      id: "originals",
      name: "Originals",
      description: "Original Prism bots.",
      botIds: ["elena-hart"],
    },
  ],
  bots: [
    {
      id: "plato",
      name: "Plato",
      subtitle: "Dialogic idealist",
      description: "Reflective inquiry.",
      botHash: "22c7a0983debadccb76c807c84883693",
      bundlePath: "/bot-marketplace/bots/bot-plato.bot",
      memoryCount: 42.8,
      color: "#4F46A5",
      glyph: "lucideDrama",
      themeIds: ["famous-philosophers"],
      tags: ["philosophy", "ancient"],
    },
    {
      id: "aristotle",
      name: "Aristotle",
      subtitle: "Patient classifier",
      description: "Structured inquiry.",
      botHash: "de0d287e1de1ecf8ceb3a209aa8c702e",
      bundlePath: "/bot-marketplace/bots/bot-aristotle.bot",
      memoryCount: 41,
      color: "#8B5A2B",
      glyph: "lucideLibrary",
      themeIds: ["famous-philosophers"],
      tags: ["philosophy"],
    },
    {
      id: "elena-hart",
      name: "Elena Hart",
      subtitle: "Grounded companion",
      description: "Warm and practical.",
      botHash: "8f3d1b6ea4c24f4a9f8b2a13d6e7c0ab",
      bundlePath: "/bot-marketplace/bots/bot-elena-hart.bot",
      memoryCount: 30,
      color: "#C26A8D",
      glyph: "lucideHeartHandshake",
      themeIds: ["originals"],
      tags: ["original"],
    },
    {
      id: "jesus-christ",
      name: "Jesus Christ",
      subtitle: "Deprecated direct sacred bot",
      description: "Hidden after Lens migration.",
      botHash: "d4f10ce6600ad903511f9584818a30d3",
      bundlePath: "/bot-marketplace/bots/bot-jesus-christ.bot",
      memoryCount: 33,
      color: "#2563A8",
      glyph: "lucideFishSymbol",
      themeIds: ["sacred-teachers"],
      tags: ["sacred"],
      marketplaceVisible: false,
      deprecated: true,
      replacementType: "lens",
      replacementIds: ["christian_wisdom"],
    },
  ],
  lensCategories: [
    {
      id: "sacred-wisdom",
      name: "Sacred Wisdom",
      description: "Tradition-inspired fictional influence packs.",
      disclaimer: "Does not impersonate sacred figures.",
      lensIds: ["christian_wisdom"],
    },
  ],
  lenses: [
    {
      id: "christian_wisdom",
      displayName: "Christian Wisdom Lens",
      description: "Mercy, parable, forgiveness, humility, love, and moral reflection.",
      category: "Sacred Wisdom",
      tags: ["sacred", "wisdom", "christianity"],
      themes: ["mercy", "forgiveness"],
      tone: "gentle",
      inspiredBy: ["Christian ethics"],
      constraints: [
        "Generate or shape fictional bots only.",
        "Do not impersonate Jesus Christ.",
      ],
      prohibitedClaims: ["Do not claim to be Jesus Christ."],
      systemPromptFragment:
        "This bot is shaped by the Christian Wisdom Lens. The bot must not claim to be Jesus Christ.",
      marketplaceVisible: true,
      installed: false,
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      lensKind: "sacred_wisdom",
    },
  ],
};

describe("bot marketplace helpers", () => {
  it("normalizes valid manifest entries and drops missing theme references", () => {
    const manifest = normalizeBotMarketplaceManifest(baseManifest);

    assert.equal(manifest.schema, "prism-bot-marketplace-v1");
    assert.equal(manifest.bots.length, 4);
    assert.equal(manifest.bots[0]?.memoryCount, 42);
    assert.deepEqual(
      manifest.themes.find((theme) => theme.id === "famous-philosophers")?.botIds,
      ["plato", "aristotle"]
    );
    assert.deepEqual(
      marketplaceVisibleBotEntries(manifest).map((entry) => entry.id),
      ["plato", "aristotle", "elena-hart"]
    );
  });

  it("rejects missing bundle coverage before a theme install writes anything", () => {
    const manifest = normalizeBotMarketplaceManifest(baseManifest);
    const entries = marketplaceEntriesForTheme(manifest, "famous-philosophers");
    const bundles = new Map<string, string>([
      ["/bot-marketplace/bots/bot-plato.bot", "{}"],
    ]);

    assert.throws(
      () => validateMarketplaceSelectionBundles(entries, bundles),
      /Marketplace bundle missing for Aristotle/
    );
  });

  it("deduplicates catalog bots by export hash and reports installed status", () => {
    const manifest = normalizeBotMarketplaceManifest({
      ...baseManifest,
      bots: [
        ...baseManifest.bots,
        {
          ...baseManifest.bots[0],
          id: "plato-copy",
          name: "Plato Copy",
        },
      ],
    });
    const installedHashes = marketplaceInstalledHashSet([
      "22C7A0983DEBADCCB76C807C84883693",
      null,
      "not-a-real-hash",
    ]);

    assert.equal(manifest.bots.length, 4);
    assert.equal(
      marketplaceEntryInstallState(manifest.bots[0]!, installedHashes),
      "installed"
    );
    assert.equal(
      marketplaceEntryInstallState(manifest.bots[1]!, installedHashes),
      "available"
    );
  });

  it("groups entries by theme and resolves partial theme install state", () => {
    const manifest = normalizeBotMarketplaceManifest(baseManifest);
    const entries = marketplaceEntriesForTheme(manifest, "famous-philosophers");
    const installedHashes = marketplaceInstalledHashSet([
      "22c7a0983debadccb76c807c84883693",
    ]);

    assert.deepEqual(entries.map((entry) => entry.name), ["Plato", "Aristotle"]);
    assert.equal(marketplaceThemeInstallState(entries, installedHashes), "partial");
    assert.equal(
      marketplaceThemeInstallState(entries, marketplaceInstalledHashSet([])),
      "available"
    );
    assert.equal(
      marketplaceThemeInstallState(
        entries,
        marketplaceInstalledHashSet(entries.map((entry) => entry.botHash))
      ),
      "installed"
    );
  });

  it("returns only missing theme entries in catalog order", () => {
    const manifest = normalizeBotMarketplaceManifest(baseManifest);
    const entries = marketplaceEntriesForTheme(manifest, "famous-philosophers");
    const installedHashes = marketplaceInstalledHashSet([
      "22c7a0983debadccb76c807c84883693",
    ]);

    assert.deepEqual(
      marketplaceMissingEntries(entries, installedHashes).map((entry) => entry.name),
      ["Aristotle"]
    );
  });

  it("lists lenses by category and tracks install state separately from bots", () => {
    const manifest = normalizeBotMarketplaceManifest(baseManifest);
    const lenses = marketplaceLensEntriesForCategory(manifest, "sacred-wisdom");
    const installedLensIds = new Set(["christian_wisdom"]);

    assert.deepEqual(marketplaceVisibleLensEntries(manifest).map((lens) => lens.id), [
      "christian_wisdom",
    ]);
    assert.deepEqual(lenses.map((lens) => lens.displayName), ["Christian Wisdom Lens"]);
    assert.equal(marketplaceLensInstallState(lenses[0]!, new Set()), "available");
    assert.equal(marketplaceLensInstallState(lenses[0]!, installedLensIds), "installed");
  });

});
