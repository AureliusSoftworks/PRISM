import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveLeadingDevCommandTextRanges,
  resolvePendingWildcardSlotTextRanges,
  resolvePromptShortcutTextRanges,
  resolveWildcardDeckTextRanges,
  resolveWildcardSlotTextRanges,
} from "./tiptapPrismDevCommandHighlight.ts";

describe("resolveLeadingDevCommandTextRanges", () => {
  it("returns null for non-command text", () => {
    const out = resolveLeadingDevCommandTextRanges("hello world");
    assert.equal(out, null);
  });

  it("does not highlight partial slash command names", () => {
    const out = resolveLeadingDevCommandTextRanges("/he");
    assert.equal(out, null);
  });

  it("recognizes /clear as a highlighted dev command", () => {
    const out = resolveLeadingDevCommandTextRanges("/clear");
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 6,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("does not treat inline slash prompt shortcuts as leading dev commands", () => {
    assert.equal(resolveLeadingDevCommandTextRanges("hello /clear"), null);
  });

  it("does not highlight partial known commands before the full token is typed", () => {
    assert.equal(
      resolveLeadingDevCommandTextRanges("/cle", { commandNames: ["clear", "cls"] }),
      null
    );
    assert.deepEqual(
      resolveLeadingDevCommandTextRanges("/clear", { commandNames: ["clear", "cls"] }),
      {
        commandStart: 0,
        commandEnd: 6,
        quotedStringRanges: [],
        actionTokenRanges: [],
      }
    );
  });

  it("recognizes custom slash commands", () => {
    const out = resolveLeadingDevCommandTextRanges("/summarize-this -f notes");
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 15,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("recognizes user-made command names when they are invoked with slash", () => {
    const out = resolveLeadingDevCommandTextRanges("/draft-reply", {
      commandNames: ["clear", "draft-reply"],
    });
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 12,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("recognizes known punctuation-only slash aliases", () => {
    const out = resolveLeadingDevCommandTextRanges("/?", {
      commandNames: ["help", "?"],
    });
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 2,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("resolves command bounds for a leading slash command", () => {
    const out = resolveLeadingDevCommandTextRanges('  /echo "hello"');
    assert.deepEqual(out, {
      commandStart: 2,
      commandEnd: 7,
      quotedStringRanges: [{ start: 8, end: 15 }],
      actionTokenRanges: [],
    });
  });

  it("only highlights the first immediate quoted token after command", () => {
    const out = resolveLeadingDevCommandTextRanges('/dev askquestion "pick one"');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 4,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("recognizes configured prompt commands only after the complete token is typed", () => {
    const options = { commands: [{ name: "pirate", arguments: ["story"] }] };
    assert.equal(resolveLeadingDevCommandTextRanges("/pira", options), null);
    const out = resolveLeadingDevCommandTextRanges("/pirate", options);
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 7,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("highlights configured prompt command flags as command arguments", () => {
    const out = resolveLeadingDevCommandTextRanges("/pirate -story tell it", {
      commands: [{ name: "pirate", arguments: ["story"] }],
    });
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 7,
      quotedStringRanges: [],
      actionTokenRanges: [],
      argumentStart: 8,
      argumentEnd: 14,
    });
  });

  it("leaves unknown prompt command flags as normal follow-on text", () => {
    const out = resolveLeadingDevCommandTextRanges("/pirate -unknown tell it", {
      commands: [{ name: "pirate", arguments: ["story"] }],
    });
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 7,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("supports escaped quotes inside the first quoted token", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "say \\"hi\\""');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 18 }],
      actionTokenRanges: [],
    });
  });

  it("highlights --wait argument after quoted message", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "hello" --wait 5');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 13 }],
      actionTokenRanges: [],
      argumentStart: 14,
      argumentEnd: 22,
    });
  });

  it("highlights -load argument after quoted message", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "hello" -load 1.5');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 13 }],
      actionTokenRanges: [],
      argumentStart: 14,
      argumentEnd: 23,
    });
  });

  it("highlights --wait even before number is typed", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "hello" --wait');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 13 }],
      actionTokenRanges: [],
      argumentStart: 14,
      argumentEnd: 20,
    });
  });

  it("highlights each concatenated quoted string independently", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "Hello " + "World!" --wait 20');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [
        { start: 6, end: 14 },
        { start: 17, end: 25 },
      ],
      actionTokenRanges: [],
      argumentStart: 26,
      argumentEnd: 35,
    });
  });

  it("still highlights --wait when action token is unquoted", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "Hello world!" + *cheers* --wait 20');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 20 }],
      actionTokenRanges: [{ start: 23, end: 31 }],
      argumentStart: 32,
      argumentEnd: 41,
    });
  });

  it("highlights *action* inside quoted strings as action token", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "Hello *cheers* world"');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 28 }],
      actionTokenRanges: [{ start: 13, end: 21 }],
    });
  });
});

describe("resolvePromptShortcutTextRanges", () => {
  it("recognizes user-made prompt shortcuts inline", () => {
    assert.deepEqual(
      resolvePromptShortcutTextRanges("please /draft-reply now", {
        promptNames: ["draft-reply"],
      }),
      [{ start: 7, end: 19, name: "draft-reply" }]
    );
  });

  it("recognizes prompt shortcuts before punctuation", () => {
    assert.deepEqual(
      resolvePromptShortcutTextRanges("/draft-reply, please", {
        promptNames: ["draft-reply"],
      }),
      [{ start: 0, end: 12, name: "draft-reply" }]
    );
  });

  it("filters slash tokens to known prompt names", () => {
    assert.deepEqual(
      resolvePromptShortcutTextRanges("/clear /draft-reply", {
        promptNames: ["draft-reply"],
      }),
      [{ start: 7, end: 19, name: "draft-reply" }]
    );
  });

  it("does not treat URL path segments as prompt shortcuts", () => {
    assert.deepEqual(
      resolvePromptShortcutTextRanges("https://example.test/foo", {
        promptNames: ["foo"],
      }),
      []
    );
  });
});

describe("resolveWildcardDeckTextRanges", () => {
  it("recognizes user-made wildcard decks inline", () => {
    assert.deepEqual(
      resolveWildcardDeckTextRanges("please !randomShit now", {
        wildcardNames: ["randomShit"],
      }),
      [{ start: 7, end: 18, name: "randomshit" }]
    );
  });

  it("opens for a bare bang token while typing via the composer token path", () => {
    assert.deepEqual(
      resolveWildcardDeckTextRanges("!", {
        wildcardNames: ["randomShit"],
      }),
      []
    );
  });

  it("filters bang tokens to known deck names", () => {
    assert.deepEqual(
      resolveWildcardDeckTextRanges("!unknown !randomShit.", {
        wildcardNames: ["randomShit"],
      }),
      [{ start: 9, end: 20, name: "randomshit" }]
    );
  });

  it("keeps known deck chips when touching following prose", () => {
    assert.deepEqual(
      resolveWildcardDeckTextRanges("!randomShitson", {
        wildcardNames: ["randomShit"],
      }),
      [{ start: 0, end: 11, name: "randomshit" }]
    );
  });

  it("keeps known deck chips when touching preceding prose", () => {
    assert.deepEqual(
      resolveWildcardDeckTextRanges("hello!randomShit", {
        wildcardNames: ["randomShit"],
      }),
      [{ start: 5, end: 16, name: "randomshit" }]
    );
  });

  it("prefers the longest known deck name when names overlap", () => {
    assert.deepEqual(
      resolveWildcardDeckTextRanges("!randomShitson", {
        wildcardNames: ["randomShit", "randomShitson"],
      }),
      [{ start: 0, end: 14, name: "randomshitson" }]
    );
  });
});

describe("resolvePendingWildcardSlotTextRanges", () => {
  it("recognizes pending true wildcard brace slots", () => {
    assert.deepEqual(
      resolvePendingWildcardSlotTextRanges("make it {ADJECTIVE} now", {
        pendingWildcardSlotNames: ["ADJECTIVE"],
      }),
      [{ start: 8, end: 19, name: "ADJECTIVE" }]
    );
  });

  it("normalizes pending wildcard names with spaces", () => {
    assert.deepEqual(
      resolvePendingWildcardSlotTextRanges("{PLURAL NOUN}", {
        pendingWildcardSlotNames: ["PLURAL_NOUN"],
      }),
      [{ start: 0, end: 13, name: "PLURAL_NOUN" }]
    );
  });

  it("ignores unsupported pending wildcard slots", () => {
    assert.deepEqual(
      resolvePendingWildcardSlotTextRanges("{NOUN} {PLACE}", {
        pendingWildcardSlotNames: ["NOUN"],
      }),
      [{ start: 0, end: 6, name: "NOUN" }]
    );
  });

  it("recognizes the loading sentinel as a pending wildcard slot", () => {
    assert.deepEqual(
      resolvePendingWildcardSlotTextRanges("draw {LOADING} with texture", {
        pendingWildcardSlotNames: ["{LOADING}"],
      }),
      [{ start: 5, end: 14, name: "LOADING" }]
    );
  });
});

describe("resolveWildcardSlotTextRanges", () => {
  it("recognizes built-in wildcard brace slots as composer chips", () => {
    assert.deepEqual(
      resolveWildcardSlotTextRanges("make it {ADJECTIVE} now", {
        wildcardSlotNames: ["ADJECTIVE"],
      }),
      [{ start: 8, end: 19, name: "ADJECTIVE", syntax: "brace" }]
    );
  });

  it("recognizes numbered wildcard brace slots as composer chips", () => {
    assert.deepEqual(
      resolveWildcardSlotTextRanges("make it {ADJECTIVE1} now", {
        wildcardSlotNames: ["ADJECTIVE"],
      }),
      [
        {
          start: 8,
          end: 20,
          name: "ADJECTIVE",
          reference: "1",
          labelEnd: 18,
          badge: "A",
          syntax: "brace",
        },
      ]
    );
  });

  it("recognizes the highest letter badge on numbered brace slots", () => {
    assert.deepEqual(
      resolveWildcardSlotTextRanges("make it {ADJECTIVE26} now", {
        wildcardSlotNames: ["ADJECTIVE"],
      }),
      [
        {
          start: 8,
          end: 21,
          name: "ADJECTIVE",
          reference: "26",
          labelEnd: 18,
          badge: "Z",
          syntax: "brace",
        },
      ]
    );
  });

  it("does not recognize deprecated built-in bang wildcard invocations as composer chips", () => {
    assert.deepEqual(
      resolveWildcardSlotTextRanges("make it !adjective now", {
        wildcardSlotNames: ["ADJECTIVE"],
      }),
      []
    );
  });

  it("does not recognize deprecated numbered built-in bang wildcard invocations as chips", () => {
    assert.deepEqual(
      resolveWildcardSlotTextRanges("make it !adjective1 now", {
        wildcardSlotNames: ["ADJECTIVE"],
      }),
      []
    );
  });

  it("lets custom wildcard decks claim bang invocations first", () => {
    assert.deepEqual(
      resolveWildcardSlotTextRanges("make it !adjective now", {
        wildcardSlotNames: ["ADJECTIVE"],
        excludedBangNames: ["adjective"],
      }),
      []
    );
  });

  it("keeps bang syntax reserved for custom wildcard decks", () => {
    assert.deepEqual(
      resolveWildcardDeckTextRanges("make it !adjective1 now", {
        wildcardNames: ["adjective"],
      }),
      [{ start: 8, end: 18, name: "adjective" }]
    );
    assert.deepEqual(
      resolveWildcardSlotTextRanges("make it !adjective1 now", {
        wildcardSlotNames: ["ADJECTIVE"],
        excludedBangNames: ["adjective"],
      }),
      []
    );
  });
});
