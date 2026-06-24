import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUndoSlashCommand } from "./undoSlashCommand.ts";

describe("parseUndoSlashCommand", () => {
  it("accepts the one-message default", () => {
    assert.deepEqual(parseUndoSlashCommand("/undo"), { kind: "ok", count: 1 });
  });

  it("accepts explicit two-message undo forms", () => {
    assert.deepEqual(parseUndoSlashCommand("/undo 2"), { kind: "ok", count: 2 });
    assert.deepEqual(parseUndoSlashCommand("/undo-turn"), { kind: "ok", count: 2 });
  });

  it("rejects unsupported undo arguments", () => {
    assert.deepEqual(parseUndoSlashCommand("/undo 3"), {
      kind: "error",
      error: "Use /undo, /undo 2, or /undo-turn.",
    });
    assert.deepEqual(parseUndoSlashCommand("/undo-turn 2"), {
      kind: "error",
      error: "Use /undo-turn by itself, or /undo 2.",
    });
  });

  it("ignores other slash commands", () => {
    assert.deepEqual(parseUndoSlashCommand("/help"), { kind: "none" });
  });
});
