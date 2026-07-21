import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  botPowerSourceHashV1,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthScale,
  normalizeBotFaceThinkingFrames,
  normalizeOptionalBotAudioVoiceProfileV1,
  normalizeBotPowersV1
} from "@localai/shared";
import {
  marketplaceBotEyeCharacterIsSideways,
  marketplaceEntriesForTheme,
  marketplaceVisibleBotEntries,
  normalizeBotMarketplaceManifest
} from "./botMarketplace.ts";
import {
  botMarketplaceThemeGradientColors,
  buildBotMarketplaceThemeVisualStyle
} from "./botMarketplaceThemeGradient.ts";
import { parsePrismBotArchive } from "./botArchive.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicRoot = path.join(appRoot, "public");
const faceFontIds = new Set(["neutral", "warm", "concise", "playful", "formal"]);
const precomposedPairEyeIds = new Set([
  "alan-watts",
  "aristotle",
  "thomas-hobbes",
  "claude-monet",
  "joseph-campbell",
  "sigmund-freud",
]);

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readBotBundle(filePath: string) {
  return parsePrismBotArchive(readFileSync(filePath));
}

describe("bot marketplace static catalog", () => {
  it("keeps the curated catalog persona-specific paired eyes", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const expectedCustomEyes = new Map([
      ["pia", "♥"],
      ["rowan", "⌁"],
      ["iris", "◇"],
      ["sol", "☀"],
      ["mira", "✦"],
      ["benjamin-franklin", "⌁"],
      ["socrates", "?"],
      ["the-buddha", "○"],
      ["rumi", "∞"],
      ["leonardo-da-vinci", "◇"],
      ["salvador-dali", "∿"],
      ["vincent-van-gogh", "⊙"],
      ["georgia-okeeffe", "◉"],
      ["machiavelli", "⌃"],
      ["sun-tzu", "⌖"],
      ["carl-von-clausewitz", "⊕"],
      ["alan-watts", "="],
      ["nikola-tesla", "ϟ"],
      ["albert-einstein", "∗"],
      ["isaac-newton", "●"],
      ["marie-curie", "✣"],
      ["charles-darwin", "◌"],
      ["martin-luther-king-jr", "✦"],
      ["harriet-tubman", "◆"],
      ["edgar-allan-poe", "†"],
      ["aristotle", "≑"],
      ["thomas-hobbes", "="],
      ["claude-monet", "≍"],
      ["joseph-campbell", "≈"],
      ["sigmund-freud", "≎"],
      ["lazy-cameron", "_"],
      ["tiny-bill", "·"],
      ["interrupting-tom", "!"],
      ["copycat-calvin", "o"],
      ["joyful-nora", "+"],
      ["crazy-brenda", "⊙"],
      ["mumbling-jim", "~"],
      ["obsessed-kevin", "★"],
      ["identity-crisis-ian", "?"],
      ["sad-sally", "-"],
      ["forgetful-freddie", "?"]
    ]);
    let customEyeCount = 0;
    let defaultEyeCount = 0;

    for (const entry of manifest.bots) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const bot = bundle.botJson.bot;
      const eyeGlyph = normalizeBotFaceEyeCharacter(bot.faceEyeCharacter);
      const expectedGlyph = expectedCustomEyes.get(entry.id) ?? null;

      assert.equal(eyeGlyph, expectedGlyph, entry.name);
      if (expectedGlyph === null) {
        defaultEyeCount += 1;
        assert.equal(bot.faceEyeCount, 1, entry.name);
        assert.equal(
          bot.faceEyeRotationDeg ?? null,
          entry.id === "carl-jung" ? 0 : null,
          entry.name,
        );
      } else {
        customEyeCount += 1;
        assert.equal(
          bot.faceEyeCount,
          precomposedPairEyeIds.has(entry.id) ? 1 : 2,
          entry.name,
        );
        assert.equal(
          bot.faceEyeRotationDeg,
          precomposedPairEyeIds.has(entry.id) ? 0 : -90,
          entry.name,
        );
      }
    }

    assert.equal(expectedCustomEyes.size, 41);
    assert.equal(customEyeCount, 41);
    assert.equal(defaultEyeCount, 21);
  });

  it("ships the approved Carl Jung and Alan Watts avatar customizations", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const byName = new Map(
      manifest.bots.map((entry) => [entry.name, readBotBundle(path.join(publicRoot, entry.bundlePath)).botJson.bot])
    );
    const alanWatts = byName.get("Alan Watts");
    const carlJung = byName.get("Carl Jung");

    assert.ok(alanWatts);
    assert.equal(alanWatts.faceEyeCharacter, "=");
    assert.equal(alanWatts.faceEyeCount, 1);
    assert.equal(alanWatts.faceEyeRotationDeg, 0);
    assert.equal(alanWatts.faceEyesFont, "warm");
    assert.equal(alanWatts.faceMouthFont, "formal");
    assert.equal(alanWatts.faceEyeOffsetX, 0);
    assert.equal(alanWatts.faceEyeOffsetY, -0.18);
    assert.equal(alanWatts.faceMouthScale, 0.9);
    assert.equal(alanWatts.faceMouthOffsetY, -0.06);
    assert.equal(alanWatts.audioVoiceProfileOverride ?? null, null);
    assert.equal(
      createHash("sha256")
        .update(alanWatts.avatarDetails?.screen.paintColorMapBase64 ?? "")
        .digest("hex"),
      "f2839d145374a4512ba0f8e35f9f0b96a744b11d32dcf097c06bdd20c71c7dcb"
    );

    assert.ok(carlJung);
    assert.equal(carlJung.faceEyeCharacter, null);
    assert.equal(carlJung.faceEyeCount, 1);
    assert.equal(carlJung.faceEyeRotationDeg, 0);
    assert.equal(carlJung.faceEyesFont, "playful");
    assert.equal(carlJung.faceEyeOffsetX, 0.02);
    assert.equal(carlJung.faceEyeOffsetY, -0.02);
    assert.equal(carlJung.faceMouthOffsetY, 0.1);
    assert.equal(carlJung.audioVoiceProfileOverride ?? null, null);
    assert.equal(
      createHash("sha256")
        .update(carlJung.avatarDetails?.screen.paintColorMapBase64 ?? "")
        .digest("hex"),
      "a7360b41a12b75c0fb1d718ed144b83b791300dd776f760bc7390d0294822382"
    );
  });

  it("ships the approved signature Powers as ready portable rules", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const expected = new Map<string, { name: string; effects: string[] }>([
      ["Carl Jung", { name: "Depth Perception", effects: ["insight"] }],
      ["Jane Austen", { name: "Social Scalpel", effects: ["insight"] }],
      ["Sigmund Freud", { name: "Analytic Suspicion", effects: ["insight"] }],
      ["Machiavelli", { name: "Political Instinct", effects: ["insight"] }],
      ["Socrates", { name: "The Gadfly", effects: ["response_bond"] }],
      ["Marcus Aurelius", { name: "Inner Citadel", effects: ["mood_resistance"] }],
      [
        "Nelson Mandela",
        {
          name: "Reconciliation",
          effects: ["mood_resistance", "social_influence"]
        }
      ],
      [
        "Harriet Tubman",
        {
          name: "Unshaken Resolve",
          effects: ["mood_resistance", "turn_gravity"]
        }
      ],
      ["Benjamin Franklin", { name: "Civic Spark", effects: ["turn_gravity", "social_influence"] }],
      ["Homer", { name: "Epic Memory", effects: ["selective_memory"] }],
      ["Edgar Allan Poe", { name: "Gothic Gravity", effects: ["topic_gravity"] }],
      ["Nikola Tesla", { name: "No Stimulants", effects: ["cup_rate:none"] }],
      ["Mahatma Gandhi", { name: "Coffee Abstinence", effects: ["cup_rate:none"] }],
      [
        "Salvador Dalí",
        {
          name: "Surreal Intrusion",
          effects: ["action_bias", "topic_gravity"]
        }
      ]
    ]);

    for (const entry of manifest.bots) {
      const expectation = expected.get(entry.name);
      if (!expectation) continue;
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const powers = normalizeBotPowersV1(bundle.botJson.bot.powers);

      assert.equal(powers.length, 1, entry.name);
      const power = powers[0]!;
      assert.equal(power.name, expectation.name, entry.name);
      assert.equal(power.compileStatus, "ready", entry.name);
      assert.equal(power.compiled?.sourceHash, botPowerSourceHashV1(power.name, power.intent), entry.name);
      assert.deepEqual(
        power.compiled?.effects.map((effect) =>
          effect.type === "cup_rate" ? `${effect.type}:${effect.rate}` : effect.type
        ),
        expectation.effects,
        entry.name
      );
    }

    assert.equal(expected.size, 14);
  });

  it("ships a growing Power Collection with described, portable personas", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const theme = manifest.themes.find((entry) => entry.id === "power-collection");
    const expected = new Map<string, { name: string; effects: string[] }>([
      ["silent-jack", { name: "Mute", effects: ["mute"] }],
      ["lazy-cameron", { name: "Lazy", effects: [] }],
      ["tiny-bill", { name: "Microscopic", effects: ["avatar_scale", "avatar_visibility"] }],
      [
        "interrupting-tom",
        {
          name: "Interrupting",
          effects: ["interruption", "action_bias", "turn_gravity", "response_bond"]
        }
      ],
      ["copycat-calvin", { name: "Copycat", effects: ["speech_copy"] }],
      ["joyful-nora", { name: "Radiant Joy", effects: ["mood_boost"] }],
      ["crazy-brenda", { name: "Existential Crisis", effects: [] }],
      ["mumbling-jim", { name: "Mumbling", effects: ["speech_obfuscation"] }],
      ["obsessed-kevin", { name: "Obsessed", effects: ["addressed_fandom"] }],
      ["identity-crisis-ian", { name: "Identity Crisis", effects: ["identity_mirror"] }],
      ["sad-sally", { name: "Sad", effects: ["mood_drain"] }],
      [
        "forgetful-freddie",
        {
          name: "Short-Term Amnesia",
          effects: ["eternal_introduction", "social_influence"],
        },
      ]
    ]);

    assert.ok(theme);
    assert.equal(theme.botIds.length > 5, true);
    assert.deepEqual(theme.botIds, Array.from(expected.keys()));
    assert.match(theme.description, /growing cast/iu);
    assert.equal(theme.botIds.includes("silent-tim"), false);
    assert.equal(manifest.bots.some((entry) => entry.id === "silent-tim"), false);

    for (const botId of theme.botIds) {
      const entry = manifest.bots.find((candidate) => candidate.id === botId);
      const expectation = expected.get(botId);
      assert.ok(entry, botId);
      assert.ok(expectation, botId);
      assert.equal((entry.subtitle?.trim().length ?? 0) > 0, true, `${botId} subtitle`);
      assert.equal((entry.description?.trim().length ?? 0) > 0, true, `${botId} description`);
      assert.deepEqual(entry.themeIds, ["power-collection"], `${botId} collection`);

      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const powers = normalizeBotPowersV1(bundle.botJson.bot.powers);
      assert.equal(
        (bundle.botJson.profile?.purpose.statement.trim().length ?? 0) > 0,
        true,
        `${botId} purpose`
      );
      assert.equal(
        (bundle.botJson.systemPrompt?.trim().length ?? 0) > 0,
        true,
        `${botId} prompt`
      );
      assert.equal(powers.length, 1, botId);
      assert.equal(powers[0]?.name, expectation.name, botId);
      assert.equal(powers[0]?.compileStatus, "ready", botId);
      assert.equal(
        powers[0]?.compiled?.sourceHash,
        botPowerSourceHashV1(powers[0]?.name ?? "", powers[0]?.intent ?? ""),
        botId
      );
      assert.deepEqual(
        powers[0]?.compiled?.effects.map((effect) => effect.type),
        expectation.effects,
        botId
      );
      if (botId === "interrupting-tom") {
        const interruption = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "interruption",
        );
        assert.equal(interruption?.type, "interruption");
        assert.equal(interruption?.certainty, "always");
        assert.match(powers[0]?.intent ?? "", /whenever possible/iu);
      }
      if (botId === "joyful-nora") {
        const voice = normalizeOptionalBotAudioVoiceProfileV1(
          bundle.botJson.bot.authoredAudioVoiceProfile,
        );
        assert.equal(bundle.botJson.bot.color, "#ff24bf");
        assert.equal(bundle.botJson.bot.glyph, "lucideRadio");
        assert.equal(bundle.botJson.bot.faceEyeCharacter, "+");
        assert.deepEqual(bundle.botJson.bot.faceThinkingFrames, ["e", "E", "e", "E"]);
        assert.equal(
          voice?.elevenLabsVoiceIdOverride,
          "Xb7hH8MSUJpSbSDYk0k2",
        );
        assert.match(bundle.botJson.bot.voicePreviewLine ?? "", /glad|brighter/iu);
        assert.match(bundle.botJson.systemPrompt ?? "", /joy|hope|lighter/iu);
      }
      if (botId === "sad-sally") {
        const voice = normalizeOptionalBotAudioVoiceProfileV1(
          bundle.botJson.bot.authoredAudioVoiceProfile,
        );
        assert.equal(bundle.botJson.bot.color, "#665a7a");
        assert.equal(bundle.botJson.bot.glyph, "lucideCloudRain");
        assert.equal(bundle.botJson.bot.faceEyeCharacter, "-");
        assert.deepEqual(bundle.botJson.bot.faceThinkingFrames, ["s", "i", "g", "h"]);
        assert.equal(voice?.elevenLabsVoiceIdOverride, "EXAVITQu4vr4xnSDxMaL");
        assert.match(bundle.botJson.bot.voicePreviewLine ?? "", /another conversation/iu);
        assert.match(bundle.botJson.systemPrompt ?? "", /grouchy|pessimist|rain cloud/iu);
      }
      if (botId === "forgetful-freddie") {
        const voice = normalizeOptionalBotAudioVoiceProfileV1(
          bundle.botJson.bot.authoredAudioVoiceProfile,
        );
        assert.equal(bundle.botJson.bot.color, "#f2b84b");
        assert.equal(bundle.botJson.bot.glyph, "lucideRefreshCcw");
        assert.equal(bundle.botJson.bot.faceEyeCharacter, "?");
        assert.deepEqual(bundle.botJson.bot.faceThinkingFrames, ["h", "e", "l", "o"]);
        assert.equal(voice?.elevenLabsVoiceIdOverride, "nPczCjzI2devNBz1zQrb");
        assert.match(bundle.botJson.bot.voicePreviewLine ?? "", /Forgetful Freddie/iu);
        assert.match(bundle.botJson.systemPrompt ?? "", /short-term-amnesia|one to four/iu);
      }
    }
  });

  it("ships a portable, persona-crafted ElevenLabs voice for every bot", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    for (const entry of manifest.bots) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const profile = normalizeOptionalBotAudioVoiceProfileV1(bundle.botJson.bot.authoredAudioVoiceProfile);
      assert.notEqual(profile, null, `${entry.name} must include an authored voice`);
      assert.equal(profile?.enabled, true, entry.name);
      assert.equal(typeof profile?.elevenLabsVoiceIdOverride, "string", entry.name);
      assert.equal((profile?.elevenLabsVoiceIdOverride?.length ?? 0) > 0, true, entry.name);
      assert.equal(
        profile?.elevenLabsEffect,
        /^(?:darth\s+)?vader$/iu.test(entry.name) ? "resonance" : "chorus",
        `${entry.name} voice effect`,
      );
      assert.equal(profile?.voiceEffectExplicit, true, `${entry.name} explicit voice effect`);
      const directions = profile?.elevenLabsDirection?.split(",").map((value) => value.trim()) ?? [];
      assert.equal(directions.length >= 2 && directions.length <= 3, true, entry.name);
      assert.equal(
        directions.every((value) => value.length > 0 && value.length <= 48),
        true,
        entry.name
      );
      assert.equal(
        Math.abs((profile?.pitch ?? 0) * 20 - Math.round((profile?.pitch ?? 0) * 20)) < 1e-9,
        true,
        `${entry.name} pitch`
      );
      assert.equal(
        Math.abs((profile?.lilt ?? 0) * 20 - Math.round((profile?.lilt ?? 0) * 20)) < 1e-9,
        true,
        `${entry.name} lilt`
      );
      assert.deepEqual(
        profile?.texture,
        {
          preset: "clean",
          amount: 0,
          bandwidth: 1,
          noise: 0,
          instability: 0,
          distortion: 0,
          damage: 0
        },
        entry.name
      );
      const previewLine = bundle.botJson.bot.voicePreviewLine;
      assert.equal(typeof previewLine, "string", entry.name);
      assert.equal((previewLine?.trim().length ?? 0) > 0, true, entry.name);
      assert.equal((previewLine?.length ?? 0) <= 160, true, entry.name);
    }
  });

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
      const eyeCount = normalizeBotFaceEyeCount(bot.faceEyeCount);
      assert.notEqual(eyeCount, null, `${entry.name} eye count`);
      if (bot.faceEyeCharacter === null) {
        assert.equal(eyeCount, 1, `${entry.name} default eye count`);
        assert.equal(
          bot.faceEyeRotationDeg ?? null,
          entry.id === "carl-jung" ? 0 : null,
          `${entry.name} default eye rotation`,
        );
        assert.equal(marketplaceBotEyeCharacterIsSideways(bot.faceEyeCharacter), true, `${entry.name} default eyes`);
      } else if (precomposedPairEyeIds.has(entry.id)) {
        assert.equal(eyeCount, 1, `${entry.name} precomposed pair eyes`);
        assert.equal(bot.faceEyeRotationDeg, 0, `${entry.name} precomposed eye rotation`);
      } else {
        assert.equal(eyeCount, 2, `${entry.name} paired custom eyes`);
        assert.equal(bot.faceEyeRotationDeg, -90, `${entry.name} paired custom eye rotation`);
      }
      if (bot.faceEyeRotationDeg !== null) {
        assert.equal(
          normalizeBotFaceEyeRotationDeg(bot.faceEyeRotationDeg),
          bot.faceEyeRotationDeg,
          `${entry.name} eye rotation`,
        );
      }
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
      const thinkingSpinner = JSON.stringify(thinkingFrames);
      assert.equal(seenThinkingSpinners.has(thinkingSpinner), false, `${entry.name} spinner`);
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
        thinkingFrames
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
      ["originals", ["pia", "rowan", "iris", "sol", "mira"]],
      [
        "founders-nation-builders",
        ["george-washington", "benjamin-franklin", "john-adams", "thomas-jefferson", "james-madison"]
      ],
      ["classical-wisdom", ["socrates", "plato", "aristotle", "confucius", "marcus-aurelius"]],
      [
        "visionary-artists",
        ["leonardo-da-vinci", "salvador-dali", "vincent-van-gogh", "claude-monet", "georgia-okeeffe"]
      ],
      ["power-strategy", ["machiavelli", "sun-tzu", "carl-von-clausewitz", "chanakya", "thomas-hobbes"]],
      ["modern-minds", ["alan-watts", "sigmund-freud", "carl-jung", "friedrich-nietzsche", "joseph-campbell"]],
      ["science-invention", ["nikola-tesla", "albert-einstein", "isaac-newton", "marie-curie", "charles-darwin"]],
      [
        "justice-reform",
        ["martin-luther-king-jr", "mahatma-gandhi", "nelson-mandela", "frederick-douglass", "harriet-tubman"]
      ],
      ["story-literature", ["william-shakespeare", "mary-shelley", "edgar-allan-poe", "jane-austen", "homer"]],
      [
        "power-collection",
        [
          "silent-jack",
          "lazy-cameron",
          "tiny-bill",
          "interrupting-tom",
          "copycat-calvin",
          "joyful-nora",
          "crazy-brenda",
          "mumbling-jim",
          "obsessed-kevin",
          "identity-crisis-ian",
          "sad-sally",
          "forgetful-freddie"
        ]
      ]
    ]);

    assert.deepEqual(
      manifest.themes.map((theme) => theme.id),
      Array.from(expectedThemes.keys())
    );
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

    const style = buildBotMarketplaceThemeVisualStyle("science-invention", scienceEntries, "dark");
    const styleText = Object.values(style).join(" ");
    assert.equal(style["--marketplace-category-edge"], "#2da8ff");
    assert.equal(style["--marketplace-category-edge-2"], "#54843d");
    assert.equal(styleText.includes("#ff6f91"), false);
    assert.equal(styleText.includes("255, 111, 145"), false);
  });

  it("ships a bot-only catalog after Generation Lenses are removed", () => {
    const rawManifest = readJsonFile<Record<string, unknown>>(
      path.join(publicRoot, "bot-marketplace/manifest.json")
    );

    assert.equal(Object.hasOwn(rawManifest, "lensCategories"), false);
    assert.equal(Object.hasOwn(rawManifest, "lenses"), false);
    assert.equal(
      Array.isArray(rawManifest.bots) &&
        rawManifest.bots.some(
          (bot) =>
            Boolean(bot) &&
            typeof bot === "object" &&
            (bot as Record<string, unknown>).replacementType === "lens"
        ),
      false
    );
  });

  it("keeps deprecated sacred teacher bots off public marketplace shelves", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
    const visibleBotIds = new Set(marketplaceVisibleBotEntries(manifest).map((entry) => entry.id));

    assert.equal(
      manifest.themes.some((theme) => theme.id === "sacred-teachers"),
      false
    );
    for (const botId of ["jesus-christ", "the-buddha", "laozi", "rumi", "guru-nanak"]) {
      assert.equal(visibleBotIds.has(botId), false, botId);
      assert.equal(byId.get(botId)?.marketplaceVisible, false, botId);
      assert.equal(byId.get(botId)?.deprecated, true, botId);
      assert.equal(byId.get(botId)?.replacementType, null, botId);
    }
  });

  it("uses requested first-party marketplace glyphs", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
    const jesusBundle = readBotBundle(path.join(publicRoot, "bot-marketplace/bots/bot-jesus-christ.bot"));
    const alanWattsBundle = readBotBundle(path.join(publicRoot, "bot-marketplace/bots/bot-alan-watts.bot"));

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

    assert.deepEqual(originals?.botIds, ["pia", "rowan", "iris", "sol", "mira"]);
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

  it("pairs each Prism Original with its requested basic face preset", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const originals = manifest.themes.find((theme) => theme.id === "originals");
    const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
    const expectedPresets = new Map([
      [
        "pia",
        {
          preset: "Default",
          eyesFont: "neutral",
          mouthFont: "neutral",
          weight: 600,
          eyeScale: 1,
          eyeOffsetY: 0,
          thinkingFrames: ["·", "p", "P", "p"]
        }
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
          thinkingFrames: ["<", "^", ">", "v"]
        }
      ],
      [
        "iris",
        {
          preset: "Soft",
          eyesFont: "warm",
          mouthFont: "warm",
          weight: 575,
          eyeScale: 1.05,
          eyeOffsetY: 0,
          thinkingFrames: [".", "i", "I", "i"]
        }
      ],
      [
        "sol",
        {
          preset: "Classic",
          eyesFont: "neutral",
          mouthFont: "neutral",
          weight: 600,
          eyeScale: 1,
          eyeOffsetY: 0,
          thinkingFrames: [".", "*", "+", "*"]
        }
      ],
      [
        "mira",
        {
          preset: "Serif",
          eyesFont: "formal",
          mouthFont: "formal",
          weight: 575,
          eyeScale: 0.95,
          eyeOffsetY: 0,
          thinkingFrames: ["?", "!", "?", "…"]
        }
      ]
    ]);
    const originalEyeGlyphs = new Map([
      ["pia", "♥"],
      ["rowan", "⌁"],
      ["iris", "◇"],
      ["sol", "☀"],
      ["mira", "✦"]
    ]);

    assert.deepEqual(originals?.botIds, Array.from(expectedPresets.keys()));
    for (const [botId, preset] of expectedPresets) {
      const entry = byId.get(botId);
      assert.ok(entry, botId);
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const bot = bundle.botJson.bot;

      const expectedEyeGlyph = originalEyeGlyphs.get(botId) ?? null;
      assert.equal(bot.faceEyeCharacter, expectedEyeGlyph, `${botId} ${preset.preset} custom eye`);
      assert.equal(bot.faceEyeCount, expectedEyeGlyph === null ? 1 : 2, `${botId} ${preset.preset} eye count`);
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
      assert.deepEqual(bot.faceThinkingFrames, preset.thinkingFrames, `${botId} ${preset.preset} thinking frames`);
    }
  });
});
