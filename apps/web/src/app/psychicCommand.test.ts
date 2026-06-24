import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PSYCHIC_COMMAND_EXTRA_TEXT_ERROR,
  PSYCHIC_COMMAND_NAME,
  PSYCHIC_SLASH_COMMAND,
  parsePsychicSlashCommand,
} from "./psychicCommand.ts";

describe("Psychic command helpers", () => {
  it("reserves the built-in command name and slash spelling", () => {
    assert.equal(PSYCHIC_COMMAND_NAME, "psychic");
    assert.equal(PSYCHIC_SLASH_COMMAND, "/psychic");
  });

  it("accepts /psychic case-insensitively with surrounding whitespace", () => {
    assert.deepEqual(parsePsychicSlashCommand(" /Psychic  "), { kind: "ok" });
  });

  it("rejects extra text so the command is never sent as prompt content", () => {
    assert.deepEqual(parsePsychicSlashCommand("/psychic please"), {
      kind: "error",
      error: PSYCHIC_COMMAND_EXTRA_TEXT_ERROR,
    });
  });

  it("ignores non-Psychic composer lines", () => {
    assert.deepEqual(parsePsychicSlashCommand("/psy"), { kind: "none" });
    assert.deepEqual(parsePsychicSlashCommand("hello /psychic"), { kind: "none" });
  });
});
