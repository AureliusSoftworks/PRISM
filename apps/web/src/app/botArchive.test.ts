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
      faceEyesFont: "formal",
      faceEyeCharacter: "8",
      faceMouthFont: "formal",
      faceFontWeight: 675,
      faceEyeScale: 1.15,
      faceEyeOffsetY: -0.08,
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
    assert.equal(parsed.botJson.bot.faceEyeCharacter, "8");
    assert.equal(parsed.botJson.bot.faceEyeScale, 1.15);
    assert.equal(parsed.botJson.bot.faceEyeOffsetY, -0.08);
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
});
