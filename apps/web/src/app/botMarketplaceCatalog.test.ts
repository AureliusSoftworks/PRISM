import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  marketplaceEntriesForTheme,
  marketplaceLensEntriesForCategory,
  marketplaceVisibleBotEntries,
  marketplaceVisibleLensEntries,
  normalizeBotMarketplaceManifest,
} from "./botMarketplace.ts";
import {
  botMarketplaceThemeGradientColors,
  buildBotMarketplaceThemeVisualStyle,
} from "./botMarketplaceThemeGradient.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicRoot = path.join(appRoot, "public");
const faceFontIds = new Set(["neutral", "warm", "concise", "playful", "formal"]);

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

describe("bot marketplace static catalog", () => {
  it("ships valid avatar face settings in every bundle", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );

    assert.equal(manifest.bots.length > 0, true);
    for (const entry of manifest.bots) {
      const bundle = readJsonFile<{
        schema?: unknown;
        botHash?: unknown;
        bot?: {
          name?: unknown;
          faceEyesFont?: unknown;
          faceMouthFont?: unknown;
          faceFontWeight?: unknown;
        };
        memories?: unknown;
      }>(path.join(publicRoot, entry.bundlePath));

      assert.equal(bundle.schema, "prism-bot-export-v1", entry.name);
      assert.equal(bundle.botHash, entry.botHash, entry.name);
      assert.equal(bundle.bot?.name, entry.name, entry.name);
      assert.equal(faceFontIds.has(bundle.bot?.faceEyesFont as string), true, entry.name);
      assert.equal(faceFontIds.has(bundle.bot?.faceMouthFont as string), true, entry.name);
      assert.equal(typeof bundle.bot?.faceFontWeight, "number", entry.name);
      const weight = bundle.bot?.faceFontWeight as number;
      assert.equal(weight >= 300 && weight <= 800, true, entry.name);
      assert.equal(weight % 25, 0, entry.name);
      assert.equal(Array.isArray(bundle.memories) ? bundle.memories.length : 0, entry.memoryCount);
    }
  });

  it("includes expanded first-party marketplace bot packs", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const themeIds = new Map(manifest.themes.map((theme) => [theme.id, theme.botIds]));
    const visibleBots = marketplaceVisibleBotEntries(manifest);
    const expectedThemes = new Map([
      [
        "originals",
        [
          "pia",
          "rowan",
          "iris",
          "sol",
          "mira",
        ],
      ],
      [
        "founders-nation-builders",
        [
          "george-washington",
          "benjamin-franklin",
          "john-adams",
          "thomas-jefferson",
          "james-madison",
        ],
      ],
      [
        "classical-wisdom",
        [
          "socrates",
          "plato",
          "aristotle",
          "confucius",
          "marcus-aurelius",
        ],
      ],
      [
        "visionary-artists",
        [
          "leonardo-da-vinci",
          "salvador-dali",
          "vincent-van-gogh",
          "claude-monet",
          "georgia-okeeffe",
        ],
      ],
      [
        "power-strategy",
        [
          "machiavelli",
          "sun-tzu",
          "carl-von-clausewitz",
          "chanakya",
          "thomas-hobbes",
        ],
      ],
      [
        "modern-minds",
        [
          "alan-watts",
          "sigmund-freud",
          "carl-jung",
          "friedrich-nietzsche",
          "joseph-campbell",
        ],
      ],
      [
        "science-invention",
        [
          "nikola-tesla",
          "albert-einstein",
          "isaac-newton",
          "marie-curie",
          "charles-darwin",
        ],
      ],
      [
        "justice-reform",
        [
          "martin-luther-king-jr",
          "mahatma-gandhi",
          "nelson-mandela",
          "frederick-douglass",
          "harriet-tubman",
        ],
      ],
      [
        "story-literature",
        [
          "william-shakespeare",
          "mary-shelley",
          "edgar-allan-poe",
          "jane-austen",
          "homer",
        ],
      ],
    ]);

    assert.deepEqual(manifest.themes.map((theme) => theme.id), Array.from(expectedThemes.keys()));
    for (const [themeId, botIds] of expectedThemes) {
      assert.deepEqual(themeIds.get(themeId), botIds);
    }

    const shelfedBotIds = manifest.themes.flatMap((theme) => theme.botIds);
    assert.equal(new Set(shelfedBotIds).size, shelfedBotIds.length);
    assert.deepEqual([...shelfedBotIds].sort(), visibleBots.map((entry) => entry.id).sort());
    for (const entry of visibleBots) {
      const shelf = manifest.themes.find((theme) => theme.botIds.includes(entry.id));
      assert.deepEqual(entry.themeIds, shelf ? [shelf.id] : []);
    }
  });

  it("builds bot pack rail gradients from the contained bot colors", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const scienceEntries = marketplaceEntriesForTheme(manifest, "science-invention");

    assert.deepEqual(
      scienceEntries.map((entry) => entry.color),
      ["#2DA8FF", "#4F83CC", "#6B7D2A", "#4A8F7A", "#4F7D3A"]
    );

    const colors = botMarketplaceThemeGradientColors(scienceEntries, "dark");
    assert.deepEqual(colors, ["#2da8ff", "#4f83cc", "#7c9131", "#4a8f7a", "#54843d"]);

    const style = buildBotMarketplaceThemeVisualStyle(
      "science-invention",
      scienceEntries,
      "dark"
    );
    const styleText = Object.values(style).join(" ");
    assert.equal(style["--marketplace-category-edge"], "#2da8ff");
    assert.equal(style["--marketplace-category-edge-2"], "#54843d");
    assert.equal(styleText.includes("#ff6f91"), false);
    assert.equal(styleText.includes("255, 111, 145"), false);
  });

  it("ships first-class Lens marketplace entries", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const visibleLensIds = marketplaceVisibleLensEntries(manifest).map((lens) => lens.id);

    assert.deepEqual(
      manifest.lensCategories.map((category) => category.id),
      [
        "sacred-wisdom",
        "adventure-roleplay",
        "creative-styles",
        "thinking-styles",
        "civic-perspectives",
      ]
    );
    const expectedLensIdsByCategory = {
      "sacred-wisdom": [
        "christian_wisdom",
        "islamic_wisdom",
        "buddhist_wisdom",
        "taoist_wisdom",
        "sikh_wisdom",
      ],
      "adventure-roleplay": [
        "pirate",
        "space_opera",
        "high_fantasy_quest",
        "cozy_mystery",
        "cyberpunk_runner",
      ],
      "creative-styles": [
        "surrealist",
        "cozy_storybook",
        "mythic_epic",
        "noir_mood",
        "minimalist_design",
      ],
      "thinking-styles": [
        "stoic",
        "systems_thinker",
        "dialectical_skeptic",
        "scientific_method",
        "first_principles",
      ],
      "civic-perspectives": [
        "republican_civic",
        "democratic_civic",
        "libertarian_autonomy",
        "municipal_builder",
        "civic_futurist",
      ],
    };
    for (const [categoryId, expectedLensIds] of Object.entries(expectedLensIdsByCategory)) {
      assert.deepEqual(
        marketplaceLensEntriesForCategory(manifest, categoryId).map((lens) => lens.id),
        expectedLensIds,
        categoryId
      );
      assert.equal(expectedLensIds.length, 5, categoryId);
      for (const lensId of expectedLensIds) {
        assert.equal(visibleLensIds.includes(lensId), true, lensId);
      }
    }
    assert.equal(visibleLensIds.length, 25);

    const civic = manifest.lenses.find((lens) => lens.id === "republican_civic");
    assert.equal(civic?.researchUseAllowed, true);
    assert.match(civic?.researchDisclaimer ?? "", /not represent real Republican voters/i);
    for (const lensId of ["municipal_builder", "civic_futurist"]) {
      const lens = manifest.lenses.find((candidate) => candidate.id === lensId);
      assert.equal(lens?.researchUseAllowed, true, lensId);
      assert.match(lens?.researchDisclaimer ?? "", /synthetic/i, lensId);
    }
  });

  it("hides direct sacred teacher bots from public marketplace shelves", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
    const visibleBotIds = new Set(marketplaceVisibleBotEntries(manifest).map((entry) => entry.id));

    assert.equal(manifest.themes.some((theme) => theme.id === "sacred-teachers"), false);
    for (const botId of ["jesus-christ", "the-buddha", "laozi", "rumi", "guru-nanak"]) {
      assert.equal(visibleBotIds.has(botId), false, botId);
      assert.equal(byId.get(botId)?.marketplaceVisible, false, botId);
      assert.equal(byId.get(botId)?.deprecated, true, botId);
      assert.equal(byId.get(botId)?.replacementType, "lens", botId);
    }
  });

  it("uses requested first-party marketplace glyphs", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
    const jesusBundle = readJsonFile<{ bot?: { glyph?: unknown } }>(
      path.join(publicRoot, "bot-marketplace/bots/bot-jesus-christ.bot")
    );
    const alanWattsBundle = readJsonFile<{ bot?: { glyph?: unknown } }>(
      path.join(publicRoot, "bot-marketplace/bots/bot-alan-watts.bot")
    );

    assert.equal(byId.get("jesus-christ")?.color, "#2563A8");
    assert.equal(byId.get("jesus-christ")?.glyph, "lucideFishSymbol");
    assert.equal(jesusBundle.bot?.glyph, "lucideFishSymbol");
    assert.equal(byId.get("alan-watts")?.glyph, "yinYang");
    assert.equal(alanWattsBundle.bot?.glyph, "yinYang");
  });

  it("maps Prism Originals to the PRISM letter palette", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
    const originals = manifest.themes.find((theme) => theme.id === "originals");

    assert.deepEqual(originals?.botIds, [
      "pia",
      "rowan",
      "iris",
      "sol",
      "mira",
    ]);
    assert.equal(byId.get("pia")?.name, "Pia");
    assert.equal(byId.get("rowan")?.name, "Rowan");
    assert.equal(byId.get("iris")?.name, "Iris");
    assert.equal(byId.get("sol")?.name, "Sol");
    assert.equal(byId.get("mira")?.name, "Mira");
    assert.equal(byId.get("pia")?.color, "#ff4d6d");
    assert.equal(byId.get("rowan")?.color, "#ff9f1c");
    assert.equal(byId.get("iris")?.color, "#b7e63a");
    assert.equal(byId.get("sol")?.color, "#2fd3e3");
    assert.equal(byId.get("mira")?.color, "#7b5cff");
  });

  it("pairs each Prism Original with a distinct starter face", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const originals = manifest.themes.find((theme) => theme.id === "originals");
    const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
    const expectedFaces = new Map([
      ["pia", "neutral"],
      ["rowan", "warm"],
      ["iris", "concise"],
      ["sol", "playful"],
      ["mira", "formal"],
    ]);

    assert.deepEqual(originals?.botIds, Array.from(expectedFaces.keys()));
    for (const [botId, faceFont] of expectedFaces) {
      const entry = byId.get(botId);
      assert.ok(entry, botId);
      const bundle = readJsonFile<{
        bot?: {
          faceEyesFont?: unknown;
          faceMouthFont?: unknown;
        };
      }>(path.join(publicRoot, entry.bundlePath));
      assert.equal(bundle.bot?.faceEyesFont, faceFont, botId);
      assert.equal(bundle.bot?.faceMouthFont, faceFont, botId);
    }
  });
});
