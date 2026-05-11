import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  composeMentionTabPlainTextAction,
  escapeMarkdownLinkLabel,
  filterBotsForMentionQuery,
  findAtMentionTokenPlain,
  formatBotMentionMarkdown,
  mentionTabPlainTextAction,
  parsePrismBotMentionHref,
  prismBotMentionHref,
  unescapeMarkdownLinkLabel,
} from "./botMention.ts";

describe("prismBotMentionHref / parsePrismBotMentionHref", () => {
  it("round-trips ids that need encoding", () => {
    const id = "bot/with spaces";
    const href = prismBotMentionHref(id);
    assert.equal(href, "prism-bot://bot%2Fwith%20spaces");
    assert.equal(parsePrismBotMentionHref(href), id);
  });

  it("returns null for non-prism hrefs", () => {
    assert.equal(parsePrismBotMentionHref(undefined), null);
    assert.equal(parsePrismBotMentionHref("https://example.com/x"), null);
    assert.equal(parsePrismBotMentionHref("prism-bot:"), null);
  });
});

describe("escapeMarkdownLinkLabel / unescapeMarkdownLinkLabel", () => {
  it("escapes brackets and backslashes for markdown labels", () => {
    assert.equal(escapeMarkdownLinkLabel("a]b\\c"), "a\\]b\\\\c");
    assert.equal(unescapeMarkdownLinkLabel("a\\]b\\\\c"), "a]b\\c");
  });
});

describe("formatBotMentionMarkdown", () => {
  it("produces a standard markdown link", () => {
    assert.equal(
      formatBotMentionMarkdown({ id: "x", name: "Pat" }),
      "[Pat](prism-bot://x)"
    );
  });
});

describe("findAtMentionTokenPlain", () => {
  it("returns null when caret is before @ on the line", () => {
    assert.equal(findAtMentionTokenPlain("hello @pat", 5), null);
  });

  it("captures query between @ and caret", () => {
    const text = "hello @pa";
    const t = findAtMentionTokenPlain(text, text.length);
    assert.deepEqual(t, { atIndex: 6, endIndex: 9, query: "pa" });
  });

  it("ignores @ on a previous line", () => {
    const text = "old @x\nnew @ab";
    const t = findAtMentionTokenPlain(text, text.length);
    assert.deepEqual(t, { atIndex: 11, endIndex: 14, query: "ab" });
  });
});

describe("filterBotsForMentionQuery", () => {
  const bots = [
    { id: "1", name: "Alpha Bot", color: null, glyph: null },
    { id: "2", name: "Beta", color: null, glyph: null },
  ] as const;

  it("returns all named bots when query is empty", () => {
    assert.equal(filterBotsForMentionQuery(bots, "").length, 2);
    assert.equal(filterBotsForMentionQuery(bots, "   ").length, 2);
  });

  it("filters case-insensitively by substring", () => {
    const r = filterBotsForMentionQuery(bots, "alp");
    assert.equal(r.length, 1);
    assert.equal(r[0]!.id, "1");
  });
});

describe("mentionTabPlainTextAction", () => {
  const bots = [
    { id: "a1", name: "Pat Lee", color: null, glyph: null },
    { id: "b2", name: "Sam", color: null, glyph: null },
  ] as const;

  it("commits a single match to a markdown link in one step", () => {
    const text = "hi @Pat";
    const caret = text.length;
    const act = mentionTabPlainTextAction(text, caret, bots);
    assert.equal(act.kind, "stage2");
    if (act.kind === "stage2") {
      assert.equal(act.replacement, "hi [Pat Lee](prism-bot://a1)");
      assert.equal(act.caret, act.replacement.length);
    }
  });

  it("still commits when the typed token is already the full @ name", () => {
    const text = "hi @Pat Lee";
    const caret = text.length;
    const act = mentionTabPlainTextAction(text, caret, bots);
    assert.equal(act.kind, "stage2");
    if (act.kind === "stage2") {
      assert.equal(act.replacement, "hi [Pat Lee](prism-bot://a1)");
      assert.equal(act.caret, act.replacement.length);
    }
  });

  it("returns none when multiple bots match", () => {
    const two = [
      { id: "1", name: "Alex One", color: null, glyph: null },
      { id: "2", name: "Alex Two", color: null, glyph: null },
    ] as const;
    const act = mentionTabPlainTextAction("hey @alex", 9, two);
    assert.equal(act.kind, "none");
  });
});

describe("composeMentionTabPlainTextAction", () => {
  it("commits the highlighted multi-match bot as markdown", () => {
    const bots = [
      { id: "1", name: "Alex One", color: null, glyph: null },
      { id: "2", name: "Alex Two", color: null, glyph: null },
    ] as const;
    const text = "hey @alex";
    const caret = text.length;
    const act01 = composeMentionTabPlainTextAction(text, caret, bots, 0);
    assert.equal(act01.kind, "stage2");
    if (act01.kind === "stage2") {
      assert.equal(act01.replacement, "hey [Alex One](prism-bot://1)");
    }
    const actPick1 = composeMentionTabPlainTextAction(text, caret, bots, 1);
    assert.equal(actPick1.kind, "stage2");
    if (actPick1.kind === "stage2") {
      assert.equal(actPick1.replacement, "hey [Alex Two](prism-bot://2)");
    }
  });
});
