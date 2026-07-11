import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, unzipSync, zipSync } from "fflate";

import {
  BOT_ARCHIVE_BOT_ENTRY_NAME,
  BOT_ARCHIVE_MEMORIES_ENTRY_NAME,
  PRISM_BOT_ARCHIVE_SCHEMA,
  createPrismBotArchive,
  parsePrismBotArchive,
  type PrismBotArchiveJson,
} from "./botArchive.ts";

function baseBotJson(overrides: Partial<PrismBotArchiveJson> = {}): PrismBotArchiveJson {
  return {
    schema: PRISM_BOT_ARCHIVE_SCHEMA,
    botHash: "22c7a0983debadccb76c807c84883693",
    exportedAt: "2026-07-07T00:00:00.000Z",
    bot: {
      name: "Plato",
      color: "#4F46A5",
      glyph: "lucideDrama",
      avatarDetails: {
        version: 1,
        screen: {
          stamps: [
            {
              id: "round-glasses",
              offsetX: 2,
              offsetY: -1,
              scalePct: 105,
            },
          ],
          paintMaskBase64: null,
        },
      },
      faceEyesFont: "formal",
      faceEyeCharacter: "8",
      faceEyeAnimation: "wobble",
      faceMouthFont: "formal",
      faceFontWeight: 675,
      faceEyeScale: 1.15,
      faceEyeOffsetX: 0.06,
      faceEyeOffsetY: -0.08,
      faceEyeRotationDeg: -35,
      faceMouthCharacter: "△",
      faceMouthAnimation: "flicker",
      faceMouthScale: 1.25,
      faceMouthOffsetX: -0.04,
      faceMouthOffsetY: 0.06,
      faceMouthRotationDeg: 35,
      faceBlinkBar: "¦",
      faceThinkingFrames: ["·", "*", "✦", "*"],
    },
    systemPrompt: "Ask good questions.",
    ...overrides,
  };
}

describe("botArchive", () => {
  it("round-trips a v2 zipped .bot archive", () => {
    const archive = createPrismBotArchive({
      botJson: baseBotJson(),
      memories: ["  Loves dialogue.  ", "Founded the Academy."],
    });

    const parsed = parsePrismBotArchive(archive);

    assert.equal(parsed.botJson.schema, PRISM_BOT_ARCHIVE_SCHEMA);
    assert.equal(parsed.botJson.bot.name, "Plato");
    assert.deepEqual(parsed.botJson.bot.avatarDetails, {
      version: 1,
      screen: {
        stamps: [
          {
            id: "round-glasses",
            offsetX: 2,
            offsetY: -1,
            scalePct: 105,
          },
        ],
        paintMaskBase64: null,
      },
    });
    assert.equal(parsed.botJson.bot.faceEyeCharacter, "8");
    assert.equal(parsed.botJson.bot.faceEyeAnimation, "wobble");
    assert.equal(parsed.botJson.bot.faceEyeScale, 1.15);
    assert.equal(parsed.botJson.bot.faceEyeOffsetX, 0.06);
    assert.equal(parsed.botJson.bot.faceEyeOffsetY, -0.08);
    assert.equal(parsed.botJson.bot.faceEyeRotationDeg, -35);
    assert.equal(parsed.botJson.bot.faceMouthAnimation, "flicker");
    assert.equal(parsed.botJson.bot.faceMouthScale, 1.25);
    assert.equal(parsed.botJson.bot.faceMouthOffsetX, -0.04);
    assert.equal(parsed.botJson.bot.faceMouthOffsetY, 0.06);
    assert.equal(parsed.botJson.bot.faceMouthRotationDeg, 35);
    assert.equal(parsed.botJson.bot.faceBlinkBar, "¦");
    assert.deepEqual(parsed.botJson.bot.faceThinkingFrames, ["·", "*", "✦", "*"]);
    assert.deepEqual(parsed.memories, ["Loves dialogue.", "Founded the Academy."]);
  });

  it("omits empty memories and accepts missing memories.json", () => {
    const archive = createPrismBotArchive({
      botJson: baseBotJson(),
      memories: [" ", ""],
    });

    assert.deepEqual(parsePrismBotArchive(archive).memories, []);
  });

  it("can be embedded as zipped .bot entries inside a .bots collection", () => {
    const platoArchive = createPrismBotArchive({
      botJson: baseBotJson({ bot: { ...baseBotJson().bot, name: "Plato" } }),
      memories: ["Dialogues are useful."],
    });
    const aristotleArchive = createPrismBotArchive({
      botJson: baseBotJson({ bot: { ...baseBotJson().bot, name: "Aristotle" } }),
      memories: ["Categories matter."],
    });
    const collection = zipSync({
      "bot-plato.bot": platoArchive,
      "bot-aristotle.bot": aristotleArchive,
      "manifest.json": strToU8(
        JSON.stringify({
          schema: "prism-bot-group-manifest-v1",
          group: {
            name: "Greek Philosophers",
            botFileNames: ["bot-plato.bot", "bot-aristotle.bot"],
          },
        })
      ),
    });

    const entries = unzipSync(collection);

    assert.equal(parsePrismBotArchive(entries["bot-plato.bot"]!).botJson.bot.name, "Plato");
    assert.equal(
      parsePrismBotArchive(entries["bot-aristotle.bot"]!).botJson.bot.name,
      "Aristotle"
    );
  });

  it("rejects extra files", () => {
    const archive = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(`${JSON.stringify(baseBotJson())}\n`),
      [BOT_ARCHIVE_MEMORIES_ENTRY_NAME]: strToU8("[]"),
      "notes.txt": strToU8("nope"),
    });

    assert.throws(() => parsePrismBotArchive(archive), /unsupported files/);
  });

  it("explicitly rejects legacy accessory.png archives", () => {
    const archive = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(`${JSON.stringify(baseBotJson())}\n`),
      "accessory.png": strToU8("raw png"),
    });

    assert.throws(() => parsePrismBotArchive(archive), /accessory\.png.*not supported/i);
  });

  it("accepts only a root-level null legacy accessory marker and strips it", () => {
    const compatible = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(
        JSON.stringify({ ...baseBotJson(), accessory: null })
      ),
    });
    const parsed = parsePrismBotArchive(compatible);
    assert.equal(
      Object.prototype.hasOwnProperty.call(parsed.botJson, "accessory"),
      false
    );

    const nonNull = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(
        JSON.stringify({ ...baseBotJson(), accessory: { url: "avatar.png" } })
      ),
    });
    assert.throws(
      () => parsePrismBotArchive(nonNull),
      /unsupported non-null legacy accessory metadata/
    );
  });

  it("rejects raw avatar URLs and legacy accessory metadata", () => {
    const rawUrl = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(
        JSON.stringify({
          ...baseBotJson(),
          bot: { ...baseBotJson().bot, avatarDetails: "https://example.com/avatar.svg" },
        })
      ),
    });
    assert.throws(() => parsePrismBotArchive(rawUrl), /structured recipe.*PNG, SVG, data, or URL/i);

    const legacyField = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(
        JSON.stringify({
          ...baseBotJson(),
          bot: { ...baseBotJson().bot, accessoryImageUrl: "data:image/png;base64,AAAA" },
        })
      ),
    });
    assert.throws(() => parsePrismBotArchive(legacyField), /unsupported legacy avatar field/i);

    const portraitField = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(
        JSON.stringify({
          ...baseBotJson(),
          bot: {
            ...baseBotJson().bot,
            portraitImageUrl: "https://example.com/avatar.png",
          },
        })
      ),
    });
    assert.throws(
      () => parsePrismBotArchive(portraitField),
      /unsupported legacy avatar field: portraitImageUrl/i
    );
  });

  it("rejects raw profile image fields at bot and root level", () => {
    const botLevel = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(
        JSON.stringify({
          ...baseBotJson(),
          bot: {
            ...baseBotJson().bot,
            profileImageUrl: "https://example.com/profile.png",
          },
        })
      ),
    });
    assert.throws(
      () => parsePrismBotArchive(botLevel),
      /unsupported legacy avatar field: profileImageUrl/
    );

    const rootLevel = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(
        JSON.stringify({
          ...baseBotJson(),
          profile_image_data: "data:image/svg+xml;base64,AAAA",
        })
      ),
    });
    assert.throws(
      () => parsePrismBotArchive(rootLevel),
      /unsupported legacy avatar field: profile_image_data/
    );
  });

  it("rejects raw legacy image fields nested directly inside profile", () => {
    const archive = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(
        JSON.stringify({
          ...baseBotJson(),
          profile: {
            purpose: "Offer thoughtful dialogue.",
            profile_picture_data: "data:image/png;base64,AAAA",
          },
        })
      ),
    });

    assert.throws(
      () => parsePrismBotArchive(archive),
      /unsupported legacy avatar field: profile_picture_data/
    );
  });

  it("rejects zipped raw SVG detail files", () => {
    const archive = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(`${JSON.stringify(baseBotJson())}\n`),
      "avatar-details.svg": strToU8("<svg></svg>"),
    });

    assert.throws(() => parsePrismBotArchive(archive), /unsupported files/);
  });

  it("rejects archives missing bot.json", () => {
    const archive = zipSync({
      [BOT_ARCHIVE_MEMORIES_ENTRY_NAME]: strToU8("[]"),
    });

    assert.throws(() => parsePrismBotArchive(archive), /missing bot\.json/);
  });

  it("rejects non-string memories", () => {
    const archive = zipSync({
      [BOT_ARCHIVE_BOT_ENTRY_NAME]: strToU8(`${JSON.stringify(baseBotJson())}\n`),
      [BOT_ARCHIVE_MEMORIES_ENTRY_NAME]: strToU8(JSON.stringify(["fine", { nope: true }])),
    });

    assert.throws(() => parsePrismBotArchive(archive), /array of strings/);
  });

  it("rejects legacy JSON .bot content", () => {
    const legacy = strToU8(
      JSON.stringify({
        schema: "prism-bot-export-v1",
        bot: { name: "Legacy" },
      })
    );

    assert.throws(() => parsePrismBotArchive(legacy), /zipped \.bot archive/);
  });

  it("rejects raw PNG and SVG content instead of treating it as avatar details", () => {
    assert.throws(
      () => parsePrismBotArchive(strToU8("\u0089PNG\r\n\u001a\nraw")),
      /zipped \.bot archive/
    );
    assert.throws(
      () => parsePrismBotArchive(strToU8("<svg><path /></svg>")),
      /zipped \.bot archive/
    );
  });
});
