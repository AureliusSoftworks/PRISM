import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeScale,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthScale,
  normalizeBotFaceThinkingFrames,
  type BotFaceThinkingFrames,
} from "@localai/shared";
import {
  marketplaceBotEyeCharacterIsSideways,
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
import { parsePrismBotArchive } from "./botArchive.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicRoot = path.join(appRoot, "public");
const faceFontIds = new Set(["neutral", "warm", "concise", "playful", "formal"]);

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readBotBundle(filePath: string) {
  return parsePrismBotArchive(readFileSync(filePath));
}

describe("bot marketplace static catalog", () => {
  it("ships valid avatar face settings in every bundle", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const seenFaceSignatures = new Set<string>();
    const seenThinkingSpinners = new Set<string>();

    assert.equal(manifest.bots.length > 0, true);
    for (const entry of manifest.bots) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const bot = bundle.botJson.bot;

      assert.equal(bundle.botJson.schema, "prism-bot-export-v2", entry.name);
      assert.equal(bundle.botJson.botHash, entry.botHash, entry.name);
      assert.equal(bot.name, entry.name, entry.name);
      assert.equal(bot.color, entry.color, entry.name);
      assert.equal(bot.glyph, entry.glyph, entry.name);
      assert.equal(
        marketplaceBotEyeCharacterIsSideways(bot.faceEyeCharacter),
        true,
        `${entry.name} must use a sideways pair-like eye glyph`
      );
      assert.equal(faceFontIds.has(bot.faceEyesFont as string), true, entry.name);
      assert.equal(faceFontIds.has(bot.faceMouthFont as string), true, entry.name);
      assert.equal(typeof bot.faceFontWeight, "number", entry.name);
      const weight = bot.faceFontWeight as number;
      assert.equal(weight >= 300 && weight <= 800, true, entry.name);
      assert.equal(weight % 25, 0, entry.name);
      assert.equal(normalizeBotFaceEyeCharacter(bot.faceEyeCharacter), bot.faceEyeCharacter, entry.name);
      assert.equal(normalizeBotFaceMouthCharacter(bot.faceMouthCharacter), null, entry.name);
      assert.equal(bot.faceMouthCharacter, null, entry.name);
      assert.equal(normalizeBotFaceEyeScale(bot.faceEyeScale), bot.faceEyeScale, entry.name);
      assert.equal(normalizeBotFaceEyeOffsetX(bot.faceEyeOffsetX), bot.faceEyeOffsetX, entry.name);
      assert.equal(normalizeBotFaceEyeOffsetY(bot.faceEyeOffsetY), bot.faceEyeOffsetY, entry.name);
      assert.equal(normalizeBotFaceMouthScale(bot.faceMouthScale), bot.faceMouthScale, entry.name);
      assert.equal(normalizeBotFaceMouthOffsetY(bot.faceMouthOffsetY), bot.faceMouthOffsetY, entry.name);
      assert.equal(bot.faceBlinkBar, DEFAULT_BOT_FACE_BLINK_BAR, entry.name);
      assert.equal(normalizeBotFaceBlinkBar(bot.faceBlinkBar), DEFAULT_BOT_FACE_BLINK_BAR, entry.name);
      const thinkingFrames = normalizeBotFaceThinkingFrames(bot.faceThinkingFrames);
      assert.notEqual(thinkingFrames, null, entry.name);
      const thinkingSpinner = (thinkingFrames as BotFaceThinkingFrames).join("");
      assert.equal(seenThinkingSpinners.has(thinkingSpinner), false, entry.name);
      seenThinkingSpinners.add(thinkingSpinner);
      const faceSignature = JSON.stringify({
        eyesFont: bot.faceEyesFont,
        eyeCharacter: bot.faceEyeCharacter,
        mouthFont: bot.faceMouthFont,
        weight: bot.faceFontWeight,
        eyeScale: bot.faceEyeScale,
        eyeOffsetX: bot.faceEyeOffsetX,
        eyeOffsetY: bot.faceEyeOffsetY,
        mouthScale: bot.faceMouthScale,
        mouthOffsetY: bot.faceMouthOffsetY,
        blinkBar: bot.faceBlinkBar,
        thinkingFrames,
      });
      assert.equal(seenFaceSignatures.has(faceSignature), false, entry.name);
      seenFaceSignatures.add(faceSignature);
      assert.equal(bundle.memories.length, entry.memoryCount);
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
    const jesusBundle = readBotBundle(
      path.join(publicRoot, "bot-marketplace/bots/bot-jesus-christ.bot")
    );
    const alanWattsBundle = readBotBundle(
      path.join(publicRoot, "bot-marketplace/bots/bot-alan-watts.bot")
    );

    assert.equal(byId.get("jesus-christ")?.color, "#2563A8");
    assert.equal(byId.get("jesus-christ")?.glyph, "lucideFishSymbol");
    assert.equal(jesusBundle.botJson.bot.glyph, "lucideFishSymbol");
    assert.equal(byId.get("alan-watts")?.glyph, "yinYang");
    assert.equal(alanWattsBundle.botJson.bot.glyph, "yinYang");
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

  it("pairs each Prism Original with a distinct basic face preset", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const originals = manifest.themes.find((theme) => theme.id === "originals");
    const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
    const expectedPresets = new Map([
      [
        "pia",
        { preset: "Soft", eyesFont: "warm", mouthFont: "warm", weight: 575, eyeScale: 1.05, eyeOffsetY: 0 },
      ],
      [
        "rowan",
        {
          preset: "Bouncy",
          eyesFont: "playful",
          mouthFont: "playful",
          weight: 625,
          eyeScale: 1.05,
          eyeOffsetY: -0.02,
        },
      ],
      [
        "iris",
        { preset: "Sharp", eyesFont: "concise", mouthFont: "concise", weight: 600, eyeScale: 1, eyeOffsetY: 0 },
      ],
      [
        "sol",
        { preset: "Classic", eyesFont: "neutral", mouthFont: "neutral", weight: 600, eyeScale: 1, eyeOffsetY: 0 },
      ],
      [
        "mira",
        { preset: "Serif", eyesFont: "formal", mouthFont: "formal", weight: 575, eyeScale: 0.95, eyeOffsetY: 0 },
      ],
    ]);

    assert.deepEqual(originals?.botIds, Array.from(expectedPresets.keys()));
    for (const [botId, preset] of expectedPresets) {
      const entry = byId.get(botId);
      assert.ok(entry, botId);
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const bot = bundle.botJson.bot;

      assert.equal(bot.faceEyeCharacter, null, `${botId} ${preset.preset} custom eye`);
      assert.equal(bot.faceMouthCharacter, null, `${botId} ${preset.preset} custom mouth`);
      assert.equal(bot.faceEyesFont, preset.eyesFont, `${botId} ${preset.preset} eyes font`);
      assert.equal(bot.faceMouthFont, preset.mouthFont, `${botId} ${preset.preset} mouth font`);
      assert.equal(bot.faceFontWeight, preset.weight, `${botId} ${preset.preset} weight`);
      assert.equal(bot.faceEyeScale, preset.eyeScale, `${botId} ${preset.preset} eye scale`);
      assert.equal(bot.faceEyeOffsetX, 0, `${botId} ${preset.preset} eye x`);
      assert.equal(bot.faceEyeOffsetY, preset.eyeOffsetY, `${botId} ${preset.preset} eye y`);
      assert.equal(bot.faceMouthScale, 1, `${botId} ${preset.preset} mouth scale`);
      assert.equal(bot.faceMouthOffsetY, 0, `${botId} ${preset.preset} mouth y`);
      assert.equal(bot.faceMouthRotationDeg, 0, `${botId} ${preset.preset} mouth rotation`);
      assert.equal(bot.faceBlinkBar, " ", `${botId} ${preset.preset} blink bar`);
    }
  });
});
