import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";

import {
  BOT_VOICE_PRESET_LABELS,
  DEFAULT_BOT_FACE_BLINK_BAR,
  botPowerSourceHashV1,
  fullySaturateBotColor,
  hexToHsl,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  normalizeBotFaceThinkingFrames,
  normalizeOptionalBotAudioVoiceProfileV1,
  normalizeBotPowersV1,
  PRISM_BUILTIN_ENGLISH_VOICES,
  type BotVoicePreset,
} from "@localai/shared";
import {
  marketplaceAccentPronunciationDefault,
  marketplaceEntriesForTheme,
  marketplaceVisibleBotEntries,
  marketplaceVisibleThemes,
  normalizeBotMarketplaceManifest
} from "./botMarketplace.ts";
import {
  botMarketplaceThemeGradientColors,
  buildBotMarketplaceThemeVisualStyle
} from "./botMarketplaceThemeGradient.ts";
import { parsePrismBotArchive } from "./botArchive.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(appRoot, "../..");
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

function publicMarketplaceBots(
  manifest: ReturnType<typeof normalizeBotMarketplaceManifest>
) {
  return manifest.bots.filter((entry) => !entry.branchLock);
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readBotBundle(filePath: string) {
  return parsePrismBotArchive(readFileSync(filePath));
}

describe("bot marketplace static catalog", () => {
  it("enables Accent Map pronunciation for curated real people, not fictional personas", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json")),
    );
    const byId = new Map(manifest.bots.map((entry) => [entry.id, entry]));
    for (const id of ["albert-einstein", "harriet-tubman", "bob-ross"]) {
      assert.equal(
        marketplaceAccentPronunciationDefault(byId.get(id)!),
        true,
        id,
      );
    }
    for (const id of [
      "rick-sanchez",
      "spongebob-squarepants",
      "plankton",
      "sherlock-holmes",
      "pia",
    ]) {
      assert.equal(
        marketplaceAccentPronunciationDefault(byId.get(id)!),
        false,
        id,
      );
    }
  });

  it("ships vivid, bundle-matched colors for every bot", () => {
    const rawManifest = readJsonFile<{
      bots: Array<{ id: string; color: string; bundlePath: string }>;
    }>(path.join(publicRoot, "bot-marketplace/manifest.json"));

    for (const entry of rawManifest.bots) {
      assert.ok(
        hexToHsl(entry.color).s >= 95,
        `${entry.id} manifest color is not vivid enough: ${entry.color}`,
      );
      const archiveEntries = unzipSync(
        readFileSync(path.join(publicRoot, entry.bundlePath)),
      );
      const botJson = JSON.parse(strFromU8(archiveEntries["bot.json"]!)) as {
        bot: { color: string };
      };
      assert.equal(botJson.bot.color, entry.color, entry.id);
      assert.ok(
        hexToHsl(botJson.bot.color).s >= 95,
        `${entry.id} bundle color is not vivid enough: ${botJson.bot.color}`,
      );
    }
  });

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
      ["leonardo-da-vinci", "|"],
      ["spectral-spencer", "·"],
      ["vincent-van-gogh", "⊙"],
      ["georgia-okeeffe", "◉"],
      ["machiavelli", "."],
      ["sun-tzu", "⌖"],
      ["carl-von-clausewitz", "⊕"],
      ["alan-watts", "="],
      ["nikola-tesla", "ϟ"],
      ["albert-einstein", "∗"],
      ["isaac-newton", "●"],
      ["marie-curie", "✣"],
      ["charles-darwin", "◌"],
      ["martin-luther-king-jr", "ˆ"],
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
      ["forgetful-freddie", "?"],
      ["alias-avery", "o"],
      ["shapeshifter-sam", "∞"],
      ["following-jackson", "·"],
      ["fibbing-phil", "^"],
      ["andy-hominem", "¬"],
      ["hueist-hugh", "◐"],
    ]);
    let customEyeCount = 0;
    let defaultEyeCount = 0;

    for (const entry of publicMarketplaceBots(manifest)) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const bot = bundle.botJson.bot;
      const eyeGlyph = normalizeBotFaceEyeCharacter(bot.faceEyeCharacter);
      const expectedGlyph = expectedCustomEyes.get(entry.id) ?? null;

      assert.equal(eyeGlyph, expectedGlyph, entry.name);
      if (expectedGlyph === null) {
        defaultEyeCount += 1;
        assert.equal(
          bot.faceEyeCount,
          entry.id === "salvador-dali" ? 2 : 1,
          entry.name,
        );
        assert.equal(
          bot.faceEyeRotationDeg ?? null,
          entry.id === "carl-jung" || entry.id === "salvador-dali" ? 0 : null,
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
          normalizeBotFaceEyeRotationDeg(bot.faceEyeRotationDeg),
          bot.faceEyeRotationDeg,
          `${entry.name} eye rotation`,
        );
      }
    }

    assert.equal(expectedCustomEyes.size, 47);
    assert.equal(customEyeCount, 47);
    assert.equal(defaultEyeCount, 27);
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
    assert.equal(alanWatts.faceEyeRotationDeg, 90);
    assert.equal(alanWatts.faceEyesFont, "warm");
    assert.equal(alanWatts.faceMouthFont, "formal");
    assert.equal(alanWatts.faceEyeOffsetX, 0);
    assert.equal(alanWatts.faceEyeOffsetY, -0.06);
    assert.equal(alanWatts.faceMouthScale, 0.7);
    assert.equal(alanWatts.faceMouthOffsetY, 0.04);
    assert.equal(alanWatts.audioVoiceProfileOverride ?? null, null);
    assert.equal(
      createHash("sha256")
        .update(alanWatts.avatarDetails?.screen.paintColorMapBase64 ?? "")
        .digest("hex"),
      "2ae0cbfcdd3a40e51642912e8f8827e9a57481eeb313f569e8b612f2483b4f9e"
    );

    assert.ok(carlJung);
    assert.equal(carlJung.faceEyeCharacter, null);
    assert.equal(carlJung.faceEyeCount, 1);
    assert.equal(carlJung.faceEyeRotationDeg, 0);
    assert.equal(carlJung.faceEyesFont, "playful");
    assert.equal(carlJung.faceEyeOffsetX, 0.02);
    assert.equal(carlJung.faceEyeOffsetY, -0.02);
    assert.equal(carlJung.faceMouthFont, "neutral");
    assert.equal(carlJung.faceMouthScale, 0.75);
    assert.equal(carlJung.faceMouthOffsetX, -0.08);
    assert.equal(carlJung.faceMouthOffsetY, 0.24);
    assert.equal(carlJung.faceFontWeight, 300);
    assert.equal(carlJung.audioVoiceProfileOverride ?? null, null);
    assert.equal(
      createHash("sha256")
        .update(carlJung.avatarDetails?.screen.paintColorMapBase64 ?? "")
        .digest("hex"),
      "85fe430933f0c4da3bdd5d7b294678215e1c48ec03e79222f700fb3fefdd127d"
    );
  });

  it("ships the approved signature Powers as ready portable rules", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const expected = new Map<string, { name?: string; names?: string[]; effects: string[] }>([
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

  it("ships a five-bot Power Collection with described, portable personas", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const theme = manifest.themes.find((entry) => entry.id === "power-collection");
    const shelfIds = [
      "silent-jack",
      "lazy-cameron",
      "tiny-bill",
      "interrupting-tom",
      "copycat-calvin",
    ];
    const expected = new Map<string, {
      name?: string;
      names?: string[];
      effects: string[];
    }>([
      ["silent-jack", { name: "Mute", effects: ["mute", "signal_policy", "mouth_motion"] }],
      ["lazy-cameron", { name: "Lazy", effects: ["response_budget"] }],
      [
        "tiny-bill",
        {
          name: "Microscopic",
          effects: [
            "avatar_scale",
            "avatar_visibility",
            "avatar_opacity",
            "voice_presence",
            "intermittent_audibility",
            "signal_policy",
            "cup_rate",
          ],
        },
      ],
      [
        "interrupting-tom",
        {
          name: "Interrupting",
          effects: ["interruption", "action_bias", "turn_gravity", "response_bond"]
        }
      ],
      ["copycat-calvin", { name: "Copycat", effects: ["speech_copy"] }],
      ["joyful-nora", { name: "Radiant Joy", effects: ["mood_boost"] }],
      [
        "crazy-brenda",
        { name: "Enlightened", effects: ["stage_awareness", "power_immunity", "meta_sigil"] },
      ],
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
      ],
      [
        "alias-avery",
        {
          name: "John/Jane Doe",
          effects: ["false_name"],
        },
      ],
      [
        "shapeshifter-sam",
        {
          name: "Shapeshifter",
          effects: ["identity_shapeshift"],
        },
      ],
      ["following-jackson", { name: "Gullible", effects: ["credulity"] }],
      ["fibbing-phil", { name: "Anti-Truth", effects: ["anti_truth", "address_gate"] }],
      [
        "spectral-spencer",
        {
          name: "Invisible",
          effects: ["avatar_visibility", "avatar_opacity", "signal_policy", "speech_audience"],
        },
      ],
      [
        "andy-hominem",
        {
          names: ["Ad Hominem", "Cursed Tongue"],
          effects: ["addressed_insult", "cursed_tongue"],
        },
      ],
      ["hueist-hugh", { name: "Racist", effects: ["chromatic_bias"] }],
    ]);

    assert.ok(theme);
    assert.equal(theme.botIds.length, 5);
    assert.deepEqual(theme.botIds, shelfIds);
    assert.match(theme.description, /Five personas/iu);
    assert.equal(theme.botIds.includes("silent-tim"), false);
    assert.equal(manifest.bots.some((entry) => entry.id === "silent-tim"), false);

    for (const botId of expected.keys()) {
      const entry = manifest.bots.find((candidate) => candidate.id === botId);
      const expectation = expected.get(botId);
      assert.ok(entry, botId);
      assert.ok(expectation, botId);
      assert.equal((entry.subtitle?.trim().length ?? 0) > 0, true, `${botId} subtitle`);
      assert.equal((entry.description?.trim().length ?? 0) > 0, true, `${botId} description`);
      const onShelf = shelfIds.includes(botId);
      assert.deepEqual(
        entry.themeIds,
        onShelf ? ["power-collection"] : [],
        `${botId} collection`,
      );
      assert.equal(entry.marketplaceVisible, onShelf, `${botId} shelf visibility`);

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
      const expectedNames = expectation.names ?? [expectation.name ?? ""];
      assert.equal(powers.length, expectedNames.length, botId);
      assert.deepEqual(powers.map((power) => power.name), expectedNames, botId);
      for (const power of powers) {
        assert.equal(power.compileStatus, "ready", botId);
        assert.equal(
          power.compiled?.sourceHash,
          botPowerSourceHashV1(power.name, power.intent),
          botId
        );
      }
      assert.deepEqual(
        powers.flatMap((power) =>
          power.compiled?.effects.map((effect) => effect.type) ?? []
        ),
        expectation.effects,
        botId
      );
      if (botId === "andy-hominem") {
        assert.match(entry.subtitle ?? "", /profane personal attack/iu);
        assert.match(entry.description ?? "", /bespoke insult/iu);
        assert.deepEqual(
          powers.flatMap((power) => power.compiled?.effects ?? []),
          [
            {
              type: "addressed_insult",
              trigger: "every_spoken_reply",
              target: "current_addressee",
              style: "fresh_tailored",
            },
            {
              type: "cursed_tongue",
              version: 1,
              frequency: "frequent",
              strength: "strong",
              vocabulary: "uncensored_non_slur",
              phraseMode: "occasional_2_3_words",
            },
          ],
        );
      }
      if (botId === "hueist-hugh") {
        assert.match(entry.subtitle ?? "", /phosphor color snob/iu);
        assert.match(entry.description ?? "", /complementary cyan/iu);
        assert.equal(entry.color, "#ff0000");
        assert.deepEqual(powers[0]?.compiled?.effects, [
          {
            type: "chromatic_bias",
            polarity: "hate",
            color: { kind: "complementary_of_holder" },
            strength: "large",
            matchBandDeg: 30,
          },
        ]);
        assert.match(powers[0]?.compiled?.selfCue ?? "", /phosphor color/iu);
        assert.match(powers[0]?.compiled?.selfCue ?? "", /never mention human race/iu);
      }
      if (botId === "tiny-bill") {
        const scale = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "avatar_scale",
        );
        assert.equal(scale?.type, "avatar_scale");
        assert.equal(scale?.mode, "microscopic");
        assert.equal(entry.subtitle, "Microscopic, easy to miss");
        assert.match(entry.description ?? "", /vanishes from sight/u);
        assert.match(
          bundle.botJson.profile?.appearance.presence ?? "",
          /catch the line/u,
        );
        assert.equal(
          powers[0]?.compiled?.effects.some(
            (effect) => effect.type === "avatar_visibility",
          ),
          true,
        );
      }
      if (botId === "lazy-cameron") {
        const responseBudget = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "response_budget",
        );
        assert.equal(responseBudget?.type, "response_budget");
        assert.equal(responseBudget?.mode, "minimal");
        assert.equal(responseBudget?.enforcement, "hard");
        assert.match(entry.description ?? "", /bare minimum/u);
      }
      if (botId === "interrupting-tom") {
        const interruption = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "interruption",
        );
        assert.equal(interruption?.type, "interruption");
        assert.equal(interruption?.certainty, "always");
        assert.match(
          powers[0]?.intent ?? "",
          /Always interrupts the Signal bot host[\s\S]*every opening and interview turn/iu,
        );
      }
      if (botId === "mumbling-jim") {
        const voice = normalizeOptionalBotAudioVoiceProfileV1(
          bundle.botJson.bot.authoredAudioVoiceProfile,
        );
        assert.deepEqual(voice?.pronunciationMapPoint, { x: 0.74, y: 0.33 });
        assert.match(entry.description ?? "", /spoken reactions/iu);
        assert.doesNotMatch(
          bundle.botJson.systemPrompt ?? "",
          /\bmumbling\b|\bgibberish\b|speech transformation/iu,
        );
        assert.deepEqual(bundle.botJson.profile?.facts.customFacts, []);
        assert.match(
          powers[0]?.compiled?.selfCue ?? "",
          /HARD private speech rule/iu,
        );
      }
      if (botId === "identity-crisis-ian") {
        assert.deepEqual(entry.tags, [
          "power",
          "showcase",
          "identity",
          "eyes",
          "mouth",
          "face",
          "ink",
          "glyph",
        ]);
        assert.match(
          entry.description ?? "",
          /eyes, speaking mouth, Ink, glyph, and quoted public name.*retaining his color and complete speech identity/iu,
        );
        assert.match(
          bundle.botJson.profile?.purpose.statement ?? "",
          /exact eyes.*resting\/live mouth package.*Avatar Details Ink.*lower glyph.*double-quoted public name/iu,
        );
        assert.match(
          bundle.botJson.profile?.appearance.description ?? "",
          /vivid cyan shell.*communication chassis.*frame.*thinking spinner stay unmistakably his/iu,
        );
        assert.match(
          powers[0]?.intent ?? "",
          /presentation-only.*exact eyes\/blink.*resting\/live mouth\/visemes with glyph style and Custom Speech poses.*Avatar Details Ink.*lower glyph.*literal double-quoted/iu,
        );
        assert.match(
          powers[0]?.intent ?? "",
          /Keep Collin's color\/frame.*voice.*Accent Map\/location.*pronunciation.*Speechprint\/provider voice/iu,
        );
        assert.match(
          powers[0]?.intent ?? "",
          /knowingly masquerades.*double-quoted public name.*Defensively treat the original as the suspicious imitator.*mild concern.*player Prosecutor/iu,
        );
        assert.match(powers[0]?.intent ?? "", /Frozen replay; no gameplay synthesis/iu);
        assert.doesNotMatch(
          powers[0]?.intent ?? "",
          /complete public audiovisual identity/iu,
        );
      }
      if (botId === "joyful-nora") {
        assert.equal(bundle.botJson.bot.color, fullySaturateBotColor("#ff24bf"));
        assert.equal(bundle.botJson.bot.glyph, "lucideRadio");
        assert.equal(bundle.botJson.bot.faceEyeCharacter, "+");
        assert.deepEqual(bundle.botJson.bot.faceThinkingFrames, ["e", "E", "e", "E"]);
        assert.match(bundle.botJson.bot.voicePreviewLine ?? "", /glad|brighter/iu);
        assert.match(bundle.botJson.systemPrompt ?? "", /joy|hope|lighter/iu);
      }
      if (botId === "crazy-brenda") {
        const stageAwareness = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "stage_awareness",
        );
        const pierce = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "power_immunity",
        );
        const metaSigil = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "meta_sigil",
        );
        assert.equal(stageAwareness?.type, "stage_awareness");
        assert.equal(pierce?.type, "power_immunity");
        assert.equal(pierce?.scope, "holder");
        assert.equal(metaSigil?.type, "meta_sigil");
        assert.equal(metaSigil?.kind, "refraction");
        assert.match(powers[0]?.compiled?.selfCue ?? "", /ENLIGHTENED|stage brief/iu);
        assert.match(powers[0]?.intent ?? "", /stage-aware|Enlightened/iu);
      }
      if (botId === "sad-sally") {
        assert.equal(bundle.botJson.bot.color, fullySaturateBotColor("#665a7a"));
        assert.equal(bundle.botJson.bot.glyph, "lucideCloudRain");
        assert.equal(bundle.botJson.bot.faceEyeCharacter, "-");
        assert.deepEqual(bundle.botJson.bot.faceThinkingFrames, ["s", "i", "g", "h"]);
        assert.match(bundle.botJson.bot.voicePreviewLine ?? "", /another conversation/iu);
        assert.match(bundle.botJson.systemPrompt ?? "", /grouchy|pessimist|rain cloud/iu);
      }
      if (botId === "forgetful-freddie") {
        assert.equal(bundle.botJson.bot.color, fullySaturateBotColor("#f2b84b"));
        assert.equal(bundle.botJson.bot.glyph, "lucideRefreshCcw");
        assert.equal(bundle.botJson.bot.faceEyeCharacter, "?");
        assert.deepEqual(bundle.botJson.bot.faceThinkingFrames, ["h", "e", "l", "o"]);
        assert.match(bundle.botJson.bot.voicePreviewLine ?? "", /lost the thread|Love what/iu);
        const eternalIntroduction = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "eternal_introduction",
        );
        assert.equal(eternalIntroduction?.type, "eternal_introduction");
        assert.equal(
          eternalIntroduction?.memory,
          "current_other_speaker_message",
        );
        assert.match(bundle.botJson.systemPrompt ?? "", /short-term-amnesia|current other-speaker|latest/iu);
        assert.match(
          bundle.botJson.systemPrompt ?? "",
          /fresh-contact|fresh contact/iu,
        );
        assert.doesNotMatch(
          bundle.botJson.systemPrompt ?? "",
          /HARD MEMORY CONTRACT/iu,
        );
      }
      if (botId === "alias-avery") {
        assert.equal(bundle.botJson.bot.color, fullySaturateBotColor("#8a7bff"));
        assert.equal(bundle.botJson.bot.glyph, "lucideUserRound");
        assert.equal(bundle.botJson.bot.faceEyeCharacter, "o");
        assert.deepEqual(bundle.botJson.bot.faceThinkingFrames, ["?", "o", "~", "?"]);
        assert.match(bundle.botJson.bot.voicePreviewLine ?? "", /whoever I am today/iu);
        const falseName = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "false_name",
        );
        assert.equal(falseName?.type, "false_name");
        assert.equal(falseName?.continuity, "session_sticky_until_amnesia");
        assert.equal(falseName?.pool, "mixed_persona_names");
        assert.match(bundle.botJson.systemPrompt ?? "", /random persona name|John\/Jane Doe|believed/iu);
      }
      if (botId === "shapeshifter-sam") {
        assert.equal(bundle.botJson.bot.color, fullySaturateBotColor("#ff8f5c"));
        assert.equal(bundle.botJson.bot.glyph, "lucideSparkles");
        assert.equal(bundle.botJson.bot.faceEyeCharacter, "∞");
        assert.deepEqual(bundle.botJson.bot.faceThinkingFrames, ["~", "o", "O", "∞"]);
        assert.match(bundle.botJson.bot.voicePreviewLine ?? "", /Library handed me today/iu);
        const shapeshift = powers[0]?.compiled?.effects.find(
          (effect) => effect.type === "identity_shapeshift",
        );
        assert.equal(shapeshift?.type, "identity_shapeshift");
        assert.equal(shapeshift?.pool, "library_or_marketplace");
        assert.equal(shapeshift?.continuity, "session_sticky_until_amnesia");
        assert.match(bundle.botJson.systemPrompt ?? "", /Library|Marketplace|shapeshift|form/iu);
      }
    }
  });

  it("ships a portable, persona-crafted base voice for every public bot", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const voicePlusSignatures = new Set<string>();
    for (const entry of publicMarketplaceBots(manifest)) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const profile = normalizeOptionalBotAudioVoiceProfileV1(bundle.botJson.bot.authoredAudioVoiceProfile);
      assert.notEqual(profile, null, `${entry.name} must include an authored voice`);
      assert.equal(profile?.enabled, true, entry.name);
      assert.equal(profile?.localEnginePreference, "voice-plus", `${entry.name} Voice+`);
      assert.equal(profile?.localVoiceSource, "portable", `${entry.name} portable source`);
      assert.equal(profile?.accentMode, "prefer-genuine", `${entry.name} accent mode`);
      const expectedAccent = profile?.accentDefinitionId;
      if (expectedAccent) {
        assert.equal(
          profile?.speechprintInfluence === "none" ||
            profile?.speechprintInfluence === expectedAccent,
          true,
          `${entry.name} speechprint`,
        );
        assert.equal(typeof profile?.pronunciationMapPoint?.x, "number", `${entry.name} map X`);
        assert.equal(typeof profile?.pronunciationMapPoint?.y, "number", `${entry.name} map Y`);
      } else {
        assert.equal(profile?.speechprintInfluence, "none", `${entry.name} portable speechprint`);
      }
      for (const [field, value] of [
        ["openness", profile?.openness],
        ["weight", profile?.weight],
        ["brightness", profile?.brightness],
        ["resonance", profile?.resonance],
        ["gainDb", profile?.gainDb],
      ] as const) {
        assert.equal(typeof value, "number", `${entry.name} ${field}`);
        assert.equal(Number.isFinite(value), true, `${entry.name} ${field}`);
      }
      assert.equal(
        [profile?.openness, profile?.weight, profile?.brightness, profile?.resonance]
          .some((value) => value !== 0),
        true,
        `${entry.name} must have a tailored Voice Character`,
      );
      voicePlusSignatures.add(JSON.stringify([
        profile?.baseVoiceId,
        profile?.pitch,
        profile?.warmth,
        profile?.openness,
        profile?.weight,
        profile?.brightness,
        profile?.resonance,
        profile?.pace,
        profile?.lilt,
        profile?.elevenLabsDirection,
      ]));
      assert.equal(profile?.elevenLabsVoiceId, undefined, entry.name);
      assert.equal(profile?.elevenLabsVoiceIdOverride, undefined, entry.name);
      const cleanVoiceIds = new Set([
        "sherlock-holmes",
        "elizabeth-bennet",
        "captain-nemo",
        "dorian-gray",
        "scheherazade",
      ]);
      assert.equal(
        profile?.elevenLabsEffect,
        cleanVoiceIds.has(entry.id)
          ? "clean"
          : /^(?:darth\s+)?vader$/iu.test(entry.name)
            ? "resonance"
            : "chorus",
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
    assert.equal(
      voicePlusSignatures.size,
      publicMarketplaceBots(manifest).length,
      "every Steam-shippable bot should keep a distinct authored voice signature",
    );
  });

  it("keeps every bundled voice on the reviewed PRISM-pack identity", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const report = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          path.join(repoRoot, "scripts/update-marketplace-bot-voice-genders.mjs"),
          "--dry-run"
        ],
        { cwd: repoRoot, encoding: "utf8" }
      )
    ) as { marketplace: { scanned: number; changed: number } };

    assert.equal(report.marketplace.scanned, manifest.bots.length);
    assert.equal(report.marketplace.changed, 0, "curated voice map must match every bundle");

    const voiceById = new Map(
      PRISM_BUILTIN_ENGLISH_VOICES.map((voice) => [voice.voiceId, voice])
    );
    for (const entry of manifest.bots) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const pronouns = bundle.botJson.profile?.identity?.pronouns?.toLowerCase() ?? "";
      const profiles = [
        ["authored", bundle.botJson.bot.authoredAudioVoiceProfile],
        ["override", bundle.botJson.bot.audioVoiceProfileOverride]
      ] as const;
      for (const [label, rawProfile] of profiles) {
        const profile = normalizeOptionalBotAudioVoiceProfileV1(rawProfile);
        if (!profile) continue;
        const voice = voiceById.get(profile.baseVoiceId);
        assert.ok(voice, `${entry.name} ${label} must use an installed PRISM voice`);
        assert.notEqual(profile.baseVoiceId, "voice-1", `${entry.name} ${label} must not use Heart`);
        assert.equal(
          profile.systemVoiceName,
          undefined,
          `${entry.name} ${label} must not depend on a host OS voice`
        );
        if (/\bhe\b|\bhim\b|\bhis\b/u.test(pronouns)) {
          assert.match(voice.engineVoiceId, /^(?:am|bm)_/u, `${entry.name} ${label} gender`);
        }
        if (/\bshe\b|\bher\b|\bhers\b/u.test(pronouns)) {
          assert.match(voice.engineVoiceId, /^(?:af|bf)_/u, `${entry.name} ${label} gender`);
        }
      }
    }
  });

  it("ships no default ElevenLabs identity in any Marketplace bundle", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const forbiddenFields = [
      "elevenLabsVoiceId",
      "elevenLabsVoiceIdOverride",
      "elevenLabsVoiceInitialized",
    ];
    for (const entry of manifest.bots) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const profiles = [
        ["authored", bundle.botJson.bot.authoredAudioVoiceProfile],
        ["override", bundle.botJson.bot.audioVoiceProfileOverride],
      ] as const;
      for (const [label, profile] of profiles) {
        if (!profile || typeof profile !== "object") continue;
        for (const field of forbiddenFields) {
          assert.equal(
            Object.prototype.hasOwnProperty.call(profile, field),
            false,
            `${entry.name} ${label} profile must not ship ${field}`,
          );
        }
      }
    }
  });

  it("uses only official communication styles in every bundle", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const official = new Set(Object.keys(BOT_VOICE_PRESET_LABELS));
    for (const entry of publicMarketplaceBots(manifest)) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const style = bundle.botJson.profile?.core.communicationStyle as
        | BotVoicePreset
        | undefined;
      assert.ok(style, `${entry.name} must declare communicationStyle`);
      assert.equal(
        official.has(style),
        true,
        `${entry.name} communicationStyle "${style}" must be official`
      );
    }
  });

  it("ships valid avatar face settings in every bundle", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const seenFaceSignatures = new Set<string>();
    const seenThinkingSpinners = new Set<string>();
    const catalogBots = publicMarketplaceBots(manifest);

    assert.equal(catalogBots.length > 0, true);
    for (const entry of catalogBots) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const bot = bundle.botJson.bot;

      assert.equal(bundle.botJson.schema, "prism-bot-export-v2", entry.name);
      assert.equal(bundle.botJson.botHash, entry.botHash, entry.name);
      assert.equal(bot.name, entry.name, entry.name);
      assert.equal(bot.color, entry.color, entry.name);
      assert.equal(bot.glyph, entry.glyph, entry.name);
      const eyeCount = normalizeBotFaceEyeCount(bot.faceEyeCount);
      assert.notEqual(eyeCount, null, `${entry.name} eye count`);
      assert.equal(bot.faceEyeCount, eyeCount, `${entry.name} eye count authored`);
      if (bot.faceEyeCharacter === null) {
        assert.equal(
          eyeCount,
          entry.id === "salvador-dali" ? 2 : 1,
          `${entry.name} default eye count`,
        );
        assert.equal(
          bot.faceEyeRotationDeg ?? null,
          entry.id === "carl-jung" || entry.id === "salvador-dali" ? 0 : null,
          `${entry.name} default eye rotation`,
        );
      } else if (precomposedPairEyeIds.has(entry.id)) {
        assert.equal(eyeCount, 1, `${entry.name} precomposed pair eyes`);
      } else {
        assert.equal(eyeCount, 2, `${entry.name} paired custom eyes`);
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
      // Library-authored mouths (including custom glyphs) are portable Marketplace truth.
      assert.equal(
        normalizeBotFaceMouthCharacter(bot.faceMouthCharacter),
        bot.faceMouthCharacter,
        entry.name,
      );
      assert.equal(normalizeBotFaceEyeScale(bot.faceEyeScale), bot.faceEyeScale, entry.name);
      assert.equal(normalizeBotFaceEyeOffsetX(bot.faceEyeOffsetX), bot.faceEyeOffsetX, entry.name);
      assert.equal(normalizeBotFaceEyeOffsetY(bot.faceEyeOffsetY), bot.faceEyeOffsetY, entry.name);
      assert.equal(normalizeBotFaceMouthScale(bot.faceMouthScale), bot.faceMouthScale, entry.name);
      if (bot.faceMouthOffsetX != null) {
        assert.equal(
          normalizeBotFaceMouthOffsetX(bot.faceMouthOffsetX),
          bot.faceMouthOffsetX,
          `${entry.name} mouth offset x`,
        );
      }
      assert.equal(normalizeBotFaceMouthOffsetY(bot.faceMouthOffsetY), bot.faceMouthOffsetY, entry.name);
      if (bot.faceMouthRotationDeg != null) {
        assert.equal(
          normalizeBotFaceMouthRotationDeg(bot.faceMouthRotationDeg),
          bot.faceMouthRotationDeg,
          `${entry.name} mouth rotation`,
        );
      }
      assert.notEqual(normalizeBotFaceBlinkBar(bot.faceBlinkBar), null, `${entry.name} blink bar`);
      assert.equal(normalizeBotFaceBlinkBar(bot.faceBlinkBar), bot.faceBlinkBar, `${entry.name} blink bar authored`);
      const thinkingFrames = normalizeBotFaceThinkingFrames(bot.faceThinkingFrames);
      assert.notEqual(thinkingFrames, null, entry.name);
      const thinkingSpinner = JSON.stringify(thinkingFrames);
      assert.equal(seenThinkingSpinners.has(thinkingSpinner), false, `${entry.name} spinner`);
      seenThinkingSpinners.add(thinkingSpinner);
      const faceSignature = JSON.stringify({
        eyesFont: bot.faceEyesFont,
        eyeCharacter: bot.faceEyeCharacter,
        mouthFont: bot.faceMouthFont,
        mouthCharacter: bot.faceMouthCharacter,
        weight: bot.faceFontWeight,
        eyeScale: bot.faceEyeScale,
        eyeOffsetX: bot.faceEyeOffsetX,
        eyeOffsetY: bot.faceEyeOffsetY,
        eyeRotationDeg: bot.faceEyeRotationDeg ?? null,
        mouthScale: bot.faceMouthScale,
        mouthOffsetX: bot.faceMouthOffsetX ?? null,
        mouthOffsetY: bot.faceMouthOffsetY,
        mouthRotationDeg: bot.faceMouthRotationDeg ?? null,
        blinkBar: bot.faceBlinkBar,
        thinkingFrames
      });
      assert.equal(seenFaceSignatures.has(faceSignature), false, entry.name);
      seenFaceSignatures.add(faceSignature);
      assert.equal(
        entry.memoryCount,
        0,
        `${entry.name} must ship with no packaged memories (earned in play only)`,
      );
      assert.equal(bundle.memories.length, entry.memoryCount);
    }
  });

  it("uses the blank default blink except for Darth Vader", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );

    assert.equal(DEFAULT_BOT_FACE_BLINK_BAR, " ");
    for (const entry of manifest.bots) {
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      const expectedBlink = new Map([
        ["copycat-calvin", "."],
        ["buckethead", "none"],
        ["darth-vader", "none"],
        ["spongebob-squarepants", "|"],
      ]).get(entry.id) ?? " ";
      assert.equal(bundle.botJson.bot.faceBlinkBar, expectedBlink, entry.name);
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
        "public-domain-fiction",
        ["sherlock-holmes", "elizabeth-bennet", "captain-nemo", "dorian-gray", "scheherazade"]
      ],
      [
        "power-collection",
        [
          "silent-jack",
          "lazy-cameron",
          "tiny-bill",
          "interrupting-tom",
          "copycat-calvin",
        ]
      ]
    ]);

    const publicThemeIds = marketplaceVisibleThemes(manifest).map((theme) => theme.id);
    assert.deepEqual(publicThemeIds, Array.from(expectedThemes.keys()));
    for (const [themeId, botIds] of expectedThemes) {
      assert.deepEqual(themeIds.get(themeId), botIds);
    }

    const shelfedBotIds = marketplaceVisibleThemes(manifest).flatMap((theme) => theme.botIds);
    assert.equal(new Set(shelfedBotIds).size, shelfedBotIds.length);
    assert.deepEqual([...shelfedBotIds].sort(), visibleBots.map((entry) => entry.id).sort());
    for (const entry of visibleBots) {
      const shelf = manifest.themes.find((theme) => theme.botIds.includes(entry.id));
      assert.deepEqual(entry.themeIds, shelf ? [shelf.id] : []);
    }
  });

  it("keeps the Library Dev Backup shelf locked to the dev branch", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const theme = manifest.themes.find((entry) => entry.id === "library-dev-backup");
    assert.ok(theme);
    assert.equal(theme.branchLock, "dev");
    assert.equal(theme.botIds.length > 0, true);

    assert.equal(
      marketplaceVisibleThemes(manifest).some((entry) => entry.id === "library-dev-backup"),
      false,
    );
    assert.equal(
      marketplaceVisibleThemes(manifest, { branchName: "main" }).some(
        (entry) => entry.id === "library-dev-backup",
      ),
      false,
    );
    assert.equal(
      marketplaceVisibleThemes(manifest, { branchName: "dev" }).some(
        (entry) => entry.id === "library-dev-backup",
      ),
      true,
    );

    const backupEntries = marketplaceEntriesForTheme(manifest, "library-dev-backup", {
      branchName: "dev",
    });
    assert.equal(backupEntries.length, theme.botIds.length);
    for (const entry of backupEntries) {
      assert.equal(entry.branchLock, "dev", entry.id);
      assert.equal(entry.marketplaceVisible, true, entry.id);
      assert.deepEqual(entry.themeIds, ["library-dev-backup"], entry.id);
      const bundle = readBotBundle(path.join(publicRoot, entry.bundlePath));
      assert.equal(bundle.botJson.botHash, entry.botHash, entry.id);
      assert.equal(bundle.botJson.bot.name, entry.name, entry.id);
      assert.equal(
        typeof bundle.botJson.bot.faceThinkingScale,
        "number",
        `${entry.id} thinking scale`,
      );
      assert.equal(
        typeof bundle.botJson.bot.faceThinkingOffsetX,
        "number",
        `${entry.id} thinking X offset`,
      );
      assert.equal(
        typeof bundle.botJson.bot.faceThinkingOffsetY,
        "number",
        `${entry.id} thinking Y offset`,
      );
    }

    assert.deepEqual(
      marketplaceEntriesForTheme(manifest, "library-dev-backup"),
      [],
    );
  });

  it("builds bot pack rail gradients from the contained bot colors", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const scienceEntries = marketplaceEntriesForTheme(manifest, "science-invention");

    assert.deepEqual(
      scienceEntries.map((entry) => entry.color),
      ["#2da8ff", "#1c7aff", "#83a700", "#00d997", "#39b700"]
    );

    const colors = botMarketplaceThemeGradientColors(scienceEntries, "dark");
    assert.deepEqual(colors, ["#2da8ff", "#1c7aff", "#98c200", "#00d997", "#3cc200"]);

    const style = buildBotMarketplaceThemeVisualStyle("science-invention", scienceEntries, "dark");
    const styleText = Object.values(style).join(" ");
    assert.equal(style["--marketplace-category-edge"], "#2da8ff");
    assert.equal(style["--marketplace-category-edge-2"], "#3cc200");
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

    assert.equal(
      byId.get("jesus-christ")?.color,
      fullySaturateBotColor("#2563A8"),
    );
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
    assert.equal(byId.get("pia")?.color, fullySaturateBotColor("#ff4d6d"));
    assert.equal(byId.get("rowan")?.color, fullySaturateBotColor("#ff9f1c"));
    assert.equal(byId.get("iris")?.color, fullySaturateBotColor("#b7e63a"));
    assert.equal(byId.get("sol")?.color, fullySaturateBotColor("#2fd3e3"));
    assert.equal(byId.get("mira")?.color, fullySaturateBotColor("#7b5cff"));
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
          mouthScale: 0.7,
          mouthOffsetY: 0,
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
          mouthScale: 1,
          mouthOffsetY: 0.18,
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
          mouthScale: 1,
          mouthOffsetY: 0.18,
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
          mouthScale: 1,
          mouthOffsetY: 0.18,
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
          mouthScale: 1,
          mouthOffsetY: 0.18,
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
      assert.equal(
        normalizeBotFaceMouthCharacter(bot.faceMouthCharacter),
        bot.faceMouthCharacter,
        `${botId} ${preset.preset} mouth character`,
      );
      assert.equal(bot.faceEyesFont, preset.eyesFont, `${botId} ${preset.preset} eyes font`);
      assert.equal(bot.faceMouthFont, preset.mouthFont, `${botId} ${preset.preset} mouth font`);
      assert.equal(bot.faceFontWeight, preset.weight, `${botId} ${preset.preset} weight`);
      assert.equal(bot.faceEyeScale, preset.eyeScale, `${botId} ${preset.preset} eye scale`);
      assert.equal(bot.faceEyeOffsetX, 0, `${botId} ${preset.preset} eye x`);
      assert.equal(bot.faceEyeOffsetY, preset.eyeOffsetY, `${botId} ${preset.preset} eye y`);
      assert.equal(bot.faceMouthScale, preset.mouthScale, `${botId} ${preset.preset} mouth scale`);
      assert.equal(bot.faceMouthOffsetY, preset.mouthOffsetY, `${botId} ${preset.preset} mouth y`);
      assert.equal(bot.faceMouthRotationDeg, 0, `${botId} ${preset.preset} mouth rotation`);
      assert.equal(bot.faceBlinkBar, " ", `${botId} ${preset.preset} blink bar`);
      assert.deepEqual(bot.faceThinkingFrames, preset.thinkingFrames, `${botId} ${preset.preset} thinking frames`);
    }
  });
});
