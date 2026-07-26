import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyComposerSendAutoCorrect } from "./composerSendAutoCorrect.ts";

describe("composer send-time autocorrect", () => {
  it("fixes unambiguous typos and contractions", () => {
    assert.equal(
      applyComposerSendAutoCorrect("teh bots dont beleive me"),
      "the bots don't believe me",
    );
    assert.equal(
      applyComposerSendAutoCorrect("i think im right becuase of taht"),
      "I think I'm right because of that",
    );
    assert.equal(
      applyComposerSendAutoCorrect("alot of noise"),
      "a lot of noise",
    );
  });

  it("preserves the original capitalization shape", () => {
    assert.equal(applyComposerSendAutoCorrect("Teh table"), "The table");
    assert.equal(applyComposerSendAutoCorrect("TEH TABLE"), "THE TABLE");
    assert.equal(applyComposerSendAutoCorrect("Dont stop"), "Don't stop");
  });

  it("never rewrites mentions, slash commands, hashtags, or paths", () => {
    assert.equal(applyComposerSendAutoCorrect("@im hello"), "@im hello");
    assert.equal(applyComposerSendAutoCorrect("/im wait"), "/im wait");
    assert.equal(applyComposerSendAutoCorrect("#im tag"), "#im tag");
    assert.equal(
      applyComposerSendAutoCorrect("see example.com/im now"),
      "see example.com/im now",
    );
    assert.equal(
      applyComposerSendAutoCorrect("/echo teh line"),
      "/echo the line",
    );
  });

  it("leaves backtick code spans verbatim", () => {
    assert.equal(
      applyComposerSendAutoCorrect("run `im teh var` becuase i said so"),
      "run `im teh var` because I said so",
    );
  });

  it("corrects prose inside action asterisks", () => {
    assert.equal(
      applyComposerSendAutoCorrect("*im waving at teh table*"),
      "*I'm waving at the table*",
    );
  });

  it("leaves already-correct text untouched", () => {
    const text = "I'm sure the table won't mind a lot of questions.";
    assert.equal(applyComposerSendAutoCorrect(text), text);
    assert.equal(applyComposerSendAutoCorrect(""), "");
  });

  it("does not touch real words that merely contain typo keys", () => {
    assert.equal(applyComposerSendAutoCorrect("impressive"), "impressive");
    assert.equal(applyComposerSendAutoCorrect("island"), "island");
    assert.equal(applyComposerSendAutoCorrect("wonton"), "wonton");
  });
});
