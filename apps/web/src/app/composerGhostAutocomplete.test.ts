import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyComposerGhostCompletion,
  resolveComposerGhostCompletion,
} from "./composerGhostAutocomplete.ts";
import { COMPOSER_GHOST_LEXICON } from "./composerGhostLexicon.generated.ts";

describe("composer ghost autocomplete", () => {
  it("suggests the rest of Miscellaneous from Miscel", () => {
    const suggestion = resolveComposerGhostCompletion({
      text: "Miscel",
      selectionStart: 6,
      selectionEnd: 6,
      lexicon: COMPOSER_GHOST_LEXICON,
    });
    assert.equal(suggestion?.suffix, "laneous");
  });

  it("does not suggest for short prefixes", () => {
    assert.equal(
      resolveComposerGhostCompletion({
        text: "Mis",
        selectionStart: 3,
        selectionEnd: 3,
        lexicon: ["miscellaneous"],
      }),
      null
    );
  });

  it("does not suggest the same complete word", () => {
    assert.equal(
      resolveComposerGhostCompletion({
        text: "miscellaneous",
        selectionStart: 13,
        selectionEnd: 13,
        lexicon: ["miscellaneous"],
      }),
      null
    );
  });

  it("does not suggest in the middle of a word", () => {
    assert.equal(
      resolveComposerGhostCompletion({
        text: "miscellaneous",
        selectionStart: 6,
        selectionEnd: 6,
        lexicon: ["miscellaneous"],
      }),
      null
    );
  });

  it("preserves title-case and all-caps prefixes", () => {
    assert.equal(
      resolveComposerGhostCompletion({
        text: "Miscel",
        selectionStart: 6,
        selectionEnd: 6,
        lexicon: ["miscellaneous"],
      })?.word,
      "Miscellaneous"
    );
    assert.equal(
      resolveComposerGhostCompletion({
        text: "MISCEL",
        selectionStart: 6,
        selectionEnd: 6,
        lexicon: ["miscellaneous"],
      })?.word,
      "MISCELLANEOUS"
    );
  });

  it("uses lexicon order when multiple candidates match", () => {
    assert.equal(
      resolveComposerGhostCompletion({
        text: "comp",
        selectionStart: 4,
        selectionEnd: 4,
        lexicon: ["compose", "complete"],
      })?.word,
      "compose"
    );
  });

  it("suppresses command, mention, and wildcard prefixes", () => {
    for (const text of ["/misc", "@misc", "!misc", "{misc"]) {
      assert.equal(
        resolveComposerGhostCompletion({
          text,
          selectionStart: text.length,
          selectionEnd: text.length,
          lexicon: ["miscellaneous"],
        }),
        null
      );
    }
  });

  it("applies only the suggested suffix", () => {
    const suggestion = resolveComposerGhostCompletion({
      text: "Miscel",
      selectionStart: 6,
      selectionEnd: 6,
      lexicon: ["miscellaneous"],
    });
    assert.ok(suggestion);
    assert.deepEqual(applyComposerGhostCompletion("Miscel", suggestion), {
      value: "Miscellaneous",
      caret: 13,
    });
  });
});
