import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeEchoSlashCommand,
  parseEchoSlashCommand,
  stripLeadingBotMentionAddressing,
} from "./echoSlashCommand.ts";

describe("parseEchoSlashCommand", () => {
  it("returns none for non-command lines", () => {
    assert.deepEqual(parseEchoSlashCommand("hello"), { kind: "none" });
    assert.deepEqual(parseEchoSlashCommand("please /echo hi"), {
      kind: "none",
    });
  });

  it("parses unquoted prose verbatim", () => {
    const out = parseEchoSlashCommand("/echo hello there");
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "hello there");
      assert.equal(out.waitSeconds, 0);
    }
  });

  it("parses unquoted prose with trailing wait", () => {
    const out = parseEchoSlashCommand("/echo keep teh typo --wait 2");
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "keep teh typo");
      assert.equal(out.waitSeconds, 2);
    }
  });

  it("parses quoted Coffee-style echo", () => {
    const out = parseEchoSlashCommand('/echo "hello there" --wait 5');
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "hello there");
      assert.equal(out.waitSeconds, 5);
    }
  });

  it("parses concatenated quoted strings and stage directions", () => {
    const out = parseEchoSlashCommand('/echo "Hello world!" + *cheers*');
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "Hello world!*cheers*");
    }
  });

  it("allows leading bot mention chips for addressing", () => {
    const draft =
      '[Alice](prism-bot://bot-alice) /echo Hello {NAME}';
    assert.equal(looksLikeEchoSlashCommand(draft), true);
    const out = parseEchoSlashCommand(
      '[Alice](prism-bot://bot-alice) /echo Hello Alice',
    );
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "Hello Alice");
    }
  });

  it("rejects empty echo bodies", () => {
    assert.equal(parseEchoSlashCommand("/echo").kind, "error");
    assert.equal(parseEchoSlashCommand('/echo "   "').kind, "error");
    assert.equal(parseEchoSlashCommand("/echo --wait 1").kind, "error");
  });
});

describe("stripLeadingBotMentionAddressing", () => {
  it("removes leading mention chips only", () => {
    assert.equal(
      stripLeadingBotMentionAddressing(
        '[A](prism-bot://a) [B](prism-bot://b) /echo hi',
      ),
      "/echo hi",
    );
    assert.equal(
      stripLeadingBotMentionAddressing("hello /echo hi"),
      "hello /echo hi",
    );
  });
});
