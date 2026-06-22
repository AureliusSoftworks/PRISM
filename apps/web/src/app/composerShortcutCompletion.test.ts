import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  composerShortcutQueryExactlyMatchesCommand,
  composerShortcutTokenExactlyMatchesAnyCommand,
} from "./composerShortcutCompletion.ts";

const draftReply = {
  name: "draft-reply",
  aliases: ["dr"],
};

describe("composer shortcut exact completion matching", () => {
  it("matches a fully typed command name", () => {
    assert.equal(composerShortcutQueryExactlyMatchesCommand("draft-reply", draftReply), true);
    assert.equal(composerShortcutQueryExactlyMatchesCommand("/draft-reply", draftReply), true);
    assert.equal(composerShortcutQueryExactlyMatchesCommand("!draft-reply", draftReply), true);
  });

  it("matches aliases so typed aliases can send on Enter", () => {
    assert.equal(composerShortcutQueryExactlyMatchesCommand("dr", draftReply), true);
  });

  it("matches punctuation-only aliases", () => {
    const help = { name: "help", aliases: ["?"] };
    assert.equal(composerShortcutQueryExactlyMatchesCommand("?", help), true);
    assert.equal(composerShortcutQueryExactlyMatchesCommand("/?", help), true);
  });

  it("does not match partial command names", () => {
    assert.equal(composerShortcutQueryExactlyMatchesCommand("draft", draftReply), false);
    assert.equal(composerShortcutQueryExactlyMatchesCommand("draft-repl", draftReply), false);
  });

  it("checks the currently available shortcut menu items", () => {
    assert.equal(
      composerShortcutTokenExactlyMatchesAnyCommand(
        { query: "clear" },
        [
          { name: "draft-reply", aliases: ["dr"] },
          { name: "clear", aliases: ["cls"] },
        ]
      ),
      true
    );
  });
});
