import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NVM_COMMAND_EXTRA_TEXT_ERROR,
  NVM_COMMAND_NAME,
  NVM_SLASH_COMMAND,
  parseNvmSlashCommand,
} from "./nvmCommand.ts";

describe("NVM command helpers", () => {
  it("reserves the built-in command name and slash spelling", () => {
    assert.equal(NVM_COMMAND_NAME, "nvm");
    assert.equal(NVM_SLASH_COMMAND, "/nvm");
  });

  it("accepts /nvm case-insensitively with surrounding whitespace", () => {
    assert.deepEqual(parseNvmSlashCommand(" /NVM  "), { kind: "ok" });
  });

  it("rejects extra text so the command is never sent as prompt content", () => {
    assert.deepEqual(parseNvmSlashCommand("/nvm please"), {
      kind: "error",
      error: NVM_COMMAND_EXTRA_TEXT_ERROR,
    });
  });

  it("ignores partial and inline command text", () => {
    assert.deepEqual(parseNvmSlashCommand("/nv"), { kind: "none" });
    assert.deepEqual(parseNvmSlashCommand("hello /nvm"), { kind: "none" });
  });
});
