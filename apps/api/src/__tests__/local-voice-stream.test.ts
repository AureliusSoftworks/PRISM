import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  splitLocalVoiceStreamSegments,
  splitLocalVoiceStreamText,
} from "../local-voice-stream.ts";

const serverSource = readFileSync(
  new URL("../server.ts", import.meta.url),
  "utf8",
);

describe("local voice streaming chunks", () => {
  it("paces the supplied Prism line at the strong stop and meaningful comma", () => {
    const text =
      "My name is Prism. I put my serious face somewhere safe, and immediately forgot where.";
    assert.deepEqual(splitLocalVoiceStreamText(text), [
      "My name is Prism.",
      "I put my serious face somewhere safe,",
      "and immediately forgot where.",
    ]);
  });

  it("creates reliable strong-stop boundaries including ellipsis", () => {
    const text = "First thought. Second question? Third answer! Last idea… Done now.";
    assert.deepEqual(splitLocalVoiceStreamText(text), [
      "First thought.",
      "Second question?",
      "Third answer!",
      "Last idea…",
      "Done now.",
    ]);
  });

  it("coalesces short punctuation chunks into a useful playback runway", () => {
    const shortText =
      "First thought. Second question? Third answer! Last idea… Done now.";
    assert.deepEqual(
      splitLocalVoiceStreamText(shortText, { minimumChunkTokens: 18 }),
      [shortText],
    );

    const firstRunway = Array.from(
      { length: 18 },
      (_, index) => `first${index + 1}`,
    ).join(" ") + ".";
    const secondRunway = Array.from(
      { length: 18 },
      (_, index) => `second${index + 1}`,
    ).join(" ") + ".";
    assert.deepEqual(
      splitLocalVoiceStreamText(`${firstRunway} ${secondRunway}`, {
        minimumChunkTokens: 18,
      }),
      [firstRunway, secondRunway],
    );
    assert.deepEqual(
      splitLocalVoiceStreamText(`${firstRunway} Done now.`, {
        minimumChunkTokens: 18,
      }),
      [`${firstRunway} Done now.`],
    );
  });

  it("guards meaningful clause commas and intermediate punctuation", () => {
    assert.deepEqual(
      splitLocalVoiceStreamText(
        "When the hallway finally became quiet, we opened the hidden door.",
      ),
      [
        "When the hallway finally became quiet,",
        "we opened the hidden door.",
      ],
    );
    assert.deepEqual(
      splitLocalVoiceStreamText(
        "Here is the uncomfortable truth: nobody remembers where I hid it.",
      ),
      [
        "Here is the uncomfortable truth:",
        "nobody remembers where I hid it.",
      ],
    );
    assert.deepEqual(
      splitLocalVoiceStreamText(
        "I left the key in the attic — nobody will ever look there.",
      ),
      [
        "I left the key in the attic —",
        "nobody will ever look there.",
      ],
    );
  });

  it("does not cut list commas, short interjections, or tiny fragments", () => {
    const text = "Oh, okay, I packed apples, oranges, and bread for lunch.";
    assert.deepEqual(splitLocalVoiceStreamText(text), [text]);
    const twoItemList =
      "I packed all the apples, and oranges for lunch tomorrow.";
    assert.deepEqual(splitLocalVoiceStreamText(twoItemList), [twoItemList]);
    const introductoryList =
      "When we packed apples, oranges, and bread for lunch.";
    assert.deepEqual(
      splitLocalVoiceStreamText(introductoryList),
      [introductoryList],
    );
    assert.deepEqual(
      splitLocalVoiceStreamText("I paused, and left."),
      ["I paused, and left."],
    );
  });

  it("does not mistake abbreviations or decimals for sentence endings", () => {
    const text =
      "Dr. Prism asked Capt. Chen and Lt. Col. Rivera to measure 3.14 volts. The U.S. reading stayed stable.";
    assert.deepEqual(splitLocalVoiceStreamText(text), [
      "Dr. Prism asked Capt. Chen and Lt. Col. Rivera to measure 3.14 volts.",
      "The U.S. reading stayed stable.",
    ]);
  });

  it("keeps the <=80-token unpunctuated fallback", () => {
    assert.deepEqual(splitLocalVoiceStreamText("  "), []);
    const text = "word ".repeat(161).trim();
    const chunks = splitLocalVoiceStreamText(text);
    assert.deepEqual(
      chunks.map((chunk) => chunk.split(/\s+/u).length),
      [80, 80, 1],
    );
    assert.equal(chunks.join(" "), text);
  });

  it("can retain continuous punctuation behavior for non-Kokoro voices", () => {
    const text = "One sentence. Another meaningful clause, and then the end.";
    assert.deepEqual(
      splitLocalVoiceStreamText(text, { punctuationPacing: false }),
      [text],
    );
  });

  it("applies the minimum synthesis runway to every Signal local fallback", () => {
    assert.match(
      serverSource,
      /const SIGNAL_LOCAL_VOICE_MINIMUM_CHUNK_TOKENS = 18;/u,
    );
    assert.equal(
      serverSource.match(/minimumChunkTokens: signalMessageId/gu)?.length,
      3,
    );
  });

  it("keeps exact canonical source ranges across punctuation boundaries", () => {
    const text =
      "  My name is Prism.   I put my serious face somewhere safe,  and immediately forgot where.  ";
    const segments = splitLocalVoiceStreamSegments(text, 40);
    assert.deepEqual(
      segments.map((segment) =>
        text
          .slice(segment.sourceStart - 40, segment.sourceEnd - 40)
          .replace(/\s+/gu, " ")
      ),
      segments.map((segment) => segment.text),
    );
    assert.deepEqual(
      segments.map(({ sourceStart, sourceEnd }) => ({ sourceStart, sourceEnd })),
      [
        { sourceStart: 42, sourceEnd: 59 },
        { sourceStart: 62, sourceEnd: 99 },
        { sourceStart: 101, sourceEnd: 130 },
      ],
    );
  });
});
