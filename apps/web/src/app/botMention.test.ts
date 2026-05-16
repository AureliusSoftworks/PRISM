import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanBotMentionTextArtifacts,
  composeMentionTabPlainTextAction,
  escapeMarkdownLinkLabel,
  extractStageDirectionCues,
  extractStageDirections,
  filterBotsForMentionQuery,
  findAtMentionTokenPlain,
  formatBotMentionMarkdown,
  getBotMentionDisplayLength,
  mentionTabPlainTextAction,
  parsePrismBotMentionHref,
  prismBotMentionHref,
  splitTextByBotNames,
  tokenizeBotMentionSource,
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

describe("tokenizeBotMentionSource", () => {
  it("returns a single text segment when there are no mentions", () => {
    const segs = tokenizeBotMentionSource("hello world");
    assert.equal(segs.length, 1);
    assert.equal(segs[0]!.kind, "text");
    assert.equal(segs[0]!.text, "hello world");
    assert.equal(segs[0]!.srcStart, 0);
    assert.equal(segs[0]!.srcEnd, 11);
  });

  it("emits text + mention + text in order with correct offsets", () => {
    const text = "hi [Plankton](prism-bot://abc), why";
    const segs = tokenizeBotMentionSource(text);
    assert.equal(segs.length, 3);
    assert.equal(segs[0]!.kind, "text");
    assert.equal(segs[0]!.text, "hi ");
    assert.equal(segs[0]!.srcStart, 0);
    assert.equal(segs[0]!.srcEnd, 3);
    assert.equal(segs[1]!.kind, "mention");
    assert.equal(segs[1]!.botId, "abc");
    assert.equal(segs[1]!.displayName, "Plankton");
    assert.equal(segs[1]!.srcStart, 3);
    assert.equal(segs[1]!.srcEnd, 30);
    assert.equal(segs[2]!.kind, "text");
    assert.equal(segs[2]!.text, ", why");
  });

  it("accepts whitespace between the label and prism-bot href", () => {
    const text = "hi [Plankton] (prism-bot://abc), why";
    const segs = tokenizeBotMentionSource(text);
    assert.equal(segs.length, 3);
    assert.equal(segs[1]!.kind, "mention");
    assert.equal(segs[1]!.botId, "abc");
    assert.equal(segs[1]!.displayName, "Plankton");
  });

  it("decodes percent-encoded ids and unescapes label brackets", () => {
    const text = "[a\\]b](prism-bot://bot%2Fwith%20spaces)";
    const segs = tokenizeBotMentionSource(text);
    assert.equal(segs.length, 1);
    assert.equal(segs[0]!.kind, "mention");
    assert.equal(segs[0]!.botId, "bot/with spaces");
    assert.equal(segs[0]!.displayName, "a]b");
  });

  it("handles back-to-back mentions with no plain text between", () => {
    const text = "[A](prism-bot://1)[B](prism-bot://2)";
    const segs = tokenizeBotMentionSource(text);
    assert.equal(segs.length, 2);
    assert.equal(segs[0]!.kind, "mention");
    assert.equal(segs[0]!.displayName, "A");
    assert.equal(segs[1]!.kind, "mention");
    assert.equal(segs[1]!.displayName, "B");
    assert.equal(segs[1]!.srcStart, segs[0]!.srcEnd);
  });
});

describe("cleanBotMentionTextArtifacts", () => {
  const ROSTER = [
    { id: "bot-spongebob", name: "SpongeBob", color: "#ffd44a", glyph: null },
    { id: "bot-mr-krabs", name: "Mr. Krabs", color: "#ff5566", glyph: null },
  ] as const;

  it("removes orphan brackets around a known bot name", () => {
    assert.equal(
      cleanBotMentionTextArtifacts("[SpongeBob] confirms it.", ROSTER),
      "SpongeBob confirms it."
    );
  });

  it("preserves possessive suffixes when removing orphan brackets", () => {
    assert.equal(
      cleanBotMentionTextArtifacts("[SpongeBob]'s remark confirms it.", ROSTER),
      "SpongeBob's remark confirms it."
    );
  });

  it("replaces a standalone prism-bot href with the matching bot name", () => {
    assert.equal(
      cleanBotMentionTextArtifacts("(prism-bot://bot-mr-krabs) has priorities.", ROSTER),
      "Mr. Krabs has priorities."
    );
  });

  it("drops an unknown standalone prism-bot href instead of rendering raw source", () => {
    assert.equal(
      cleanBotMentionTextArtifacts("(prism-bot://missing) has priorities.", ROSTER),
      " has priorities."
    );
  });

  it("leaves unrelated brackets untouched", () => {
    assert.equal(
      cleanBotMentionTextArtifacts("I have [a feeling] about this.", ROSTER),
      "I have [a feeling] about this."
    );
  });
});

describe("getBotMentionDisplayLength", () => {
  it("returns plain text length when there are no mentions", () => {
    assert.equal(getBotMentionDisplayLength("hello world"), 11);
    assert.equal(getBotMentionDisplayLength(""), 0);
  });

  it("counts mentions by their display label, not the raw markdown", () => {
    const text = "hi [Plankton](prism-bot://abc-very-long-id-string), why?";
    // Visible text is "hi Plankton, why?" → 17 chars.
    assert.equal(getBotMentionDisplayLength(text), 17);
  });

  it("ignores `prism-bot://` href length so long ids don't pad pacing", () => {
    const shortId = "[Pat](prism-bot://x)";
    const longId =
      "[Pat](prism-bot://" +
      "0123456789".repeat(10) +
      ")";
    assert.equal(getBotMentionDisplayLength(shortId), 3);
    assert.equal(getBotMentionDisplayLength(longId), 3);
  });

  it("sums multiple mentions and surrounding prose", () => {
    const text = "[Pat](prism-bot://1) and [Sam](prism-bot://2) chat.";
    // "Pat and Sam chat." → 17 chars.
    assert.equal(getBotMentionDisplayLength(text), 17);
  });
});

describe("splitTextByBotNames", () => {
  const ROSTER = [
    { id: "bot-spongebob", name: "SpongeBob", color: "#ffd44a", glyph: null },
    { id: "bot-mr-krabs", name: "Mr. Krabs", color: "#ff5566", glyph: null },
    { id: "bot-patrick", name: "Patrick", color: "#ff66bb", glyph: null },
    { id: "bot-squidward", name: "Squidward", color: "#5fd2c0", glyph: null },
  ] as const;

  it("returns a single text segment when no names appear", () => {
    const segs = splitTextByBotNames("Just a plain line, nothing special.", ROSTER);
    assert.equal(segs.length, 1);
    assert.equal(segs[0]!.kind, "text");
  });

  it("splits a multi-name line into ordered text + name segments", () => {
    const segs = splitTextByBotNames(
      "SpongeBob, Patrick, and Squidward are my best friends!",
      ROSTER
    );
    const kinds = segs.map((s) => s.kind);
    assert.deepEqual(kinds, ["name", "text", "name", "text", "name", "text"]);
    assert.equal(segs[0]!.text, "SpongeBob");
    assert.equal(segs[0]!.bot?.id, "bot-spongebob");
    assert.equal(segs[2]!.text, "Patrick");
    assert.equal(segs[2]!.bot?.id, "bot-patrick");
    assert.equal(segs[4]!.text, "Squidward");
    assert.equal(segs[4]!.bot?.id, "bot-squidward");
  });

  it("matches multi-word names with periods (e.g. \"Mr. Krabs\") before substring matches", () => {
    const segs = splitTextByBotNames("Mr. Krabs is being weird.", ROSTER);
    assert.equal(segs[0]!.kind, "name");
    assert.equal(segs[0]!.text, "Mr. Krabs");
    assert.equal(segs[0]!.bot?.id, "bot-mr-krabs");
  });

  it("folds an apostrophe-s possessive into the colored span", () => {
    const segs = splitTextByBotNames("Squidward's coffee is cold.", ROSTER);
    assert.equal(segs[0]!.kind, "name");
    assert.equal(segs[0]!.text, "Squidward's");
    assert.equal(segs[0]!.bot?.id, "bot-squidward");
  });

  it("matches case-insensitively but preserves the matched casing in output", () => {
    const segs = splitTextByBotNames("spongebob just laughed.", ROSTER);
    assert.equal(segs[0]!.kind, "name");
    assert.equal(segs[0]!.text, "spongebob");
    assert.equal(segs[0]!.bot?.id, "bot-spongebob");
  });

  it("does not match a name embedded in another word", () => {
    const segs = splitTextByBotNames("Spongebobesque vibes only.", ROSTER);
    assert.equal(segs.length, 1);
    assert.equal(segs[0]!.kind, "text");
  });

  it("excludes the speaker's own name when excludeBotId is set", () => {
    const segs = splitTextByBotNames(
      "I'm Plankton — well, SpongeBob would say so.",
      [
        { id: "bot-plankton", name: "Plankton", color: "#0a0", glyph: null },
        ...ROSTER,
      ],
      "bot-plankton"
    );
    // "Plankton" should NOT be a name segment; "SpongeBob" should be.
    const namedTexts = segs.filter((s) => s.kind === "name").map((s) => s.text);
    assert.deepEqual(namedTexts, ["SpongeBob"]);
  });
});

describe("extractStageDirections", () => {
  it("returns the text untouched when there are no asterisk blocks", () => {
    const out = extractStageDirections("Hello there, friend.");
    assert.equal(out.mainText, "Hello there, friend.");
    assert.deepEqual(out.actions, []);
  });

  it("extracts a single stage direction and returns the remainder as mainText", () => {
    const out = extractStageDirections("*pours coffee* Cheers.");
    assert.equal(out.mainText, "Cheers.");
    assert.deepEqual(out.actions, ["pours coffee"]);
  });

  it("collects multiple stage directions in order", () => {
    const out = extractStageDirections(
      "*glances at the door* Are you sure? *sips slowly*"
    );
    assert.equal(out.mainText, "Are you sure?");
    assert.deepEqual(out.actions, ["glances at the door", "sips slowly"]);
  });

  it("collapses whitespace left behind after stripping a leading action", () => {
    const out = extractStageDirections("*shrugs*  oh well.");
    assert.equal(out.mainText, "oh well.");
  });

  it("strips Markdown-style double-asterisk blocks (some models default to bold syntax)", () => {
    const out = extractStageDirections("**nods slowly** Sure thing.");
    assert.equal(out.mainText, "Sure thing.");
    assert.deepEqual(out.actions, ["nods slowly"]);
  });

  it("scrubs orphan asterisks left behind by an unclosed action", () => {
    // Bot opened `*action…` with no closing asterisk — the leading `*`
    // would otherwise leak onto the table as a visible artifact.
    const out = extractStageDirections("*nods slowly without finishing");
    assert.equal(out.mainText, "nods slowly without finishing");
    assert.deepEqual(out.actions, []);
  });

  it("scrubs trailing standalone asterisks from a malformed reply", () => {
    const out = extractStageDirections("Hello there *");
    assert.equal(out.mainText, "Hello there");
  });

  it("returns an action-only signal when the entire reply is wrapped in asterisks (any count)", () => {
    const single = extractStageDirections("*nods*");
    const double = extractStageDirections("**nods**");
    assert.equal(single.mainText, "");
    assert.equal(double.mainText, "");
    assert.deepEqual(single.actions, ["nods"]);
    assert.deepEqual(double.actions, ["nods"]);
  });

  it("unwraps inline emphasis instead of deleting words from regular conversation", () => {
    const out = extractStageDirections("Ah, but a rock can't make a snack—it's the *thought* that counts.");
    assert.equal(out.mainText, "Ah, but a rock can't make a snack—it's the thought that counts.");
    assert.deepEqual(out.actions, []);
  });

  it("keeps inline action blocks as stage directions even when surrounded by prose", () => {
    const out = extractStageDirections(
      "You're too kind, but I'd rather you admired my clarinet than my... *glances at Plankton* ...other talents."
    );
    assert.equal(
      out.mainText,
      "You're too kind, but I'd rather you admired my clarinet than my... ...other talents."
    );
    assert.deepEqual(out.actions, ["glances at Plankton"]);
  });

  it("unwraps double-asterisk inline emphasis inside prose", () => {
    const out = extractStageDirections("The **idea** is still terrible.");
    assert.equal(out.mainText, "The idea is still terrible.");
    assert.deepEqual(out.actions, []);
  });
});

describe("extractStageDirectionCues", () => {
  it("emits progressive reveal thresholds for multiple actions in one line", () => {
    const cues = extractStageDirectionCues(
      "*looks at Patrick* What is your favorite food? *smiles* Mine is Potatoes! *laughs*"
    );
    assert.deepEqual(cues.map((cue) => cue.action), [
      "looks at Patrick",
      "smiles",
      "laughs",
    ]);
    assert.deepEqual(cues.map((cue) => cue.revealAtDisplayLength), [0, 27, 45]);
  });

  it("does not treat inline emphasis as an action cue", () => {
    const cues = extractStageDirectionCues(
      "Ah, but a rock can't make a snack—it's the *thought* that counts."
    );
    assert.deepEqual(cues, []);
  });

  it("treats sentence-boundary inline markers as progressive action cues", () => {
    const cues = extractStageDirectionCues(
      "*one* I said one. *two* I said two. *three* I said three."
    );
    assert.deepEqual(cues.map((cue) => cue.action), ["one", "two", "three"]);
    assert.deepEqual(cues.map((cue) => cue.revealAtDisplayLength), [0, 11, 23]);
  });
});
