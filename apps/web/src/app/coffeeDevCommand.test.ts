import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCoffeeDevCommand } from "./coffeeDevCommand.ts";

const BOTS = [
  { id: "bot-a", name: "Alice", color: null, glyph: null },
  { id: "bot-b", name: "Bob", color: null, glyph: null },
] as const;

describe("parseCoffeeDevCommand", () => {
  it("returns none for non-command lines", () => {
    const out = parseCoffeeDevCommand("hello", BOTS, () => 0.5);
    assert.deepEqual(out, { kind: "none" });
  });

  it("parses /echo with a quoted message", () => {
    const out = parseCoffeeDevCommand('/echo "hello there"', BOTS, () => 0.99);
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "hello there");
      assert.equal(out.waitSeconds, 0);
    }
  });

  it("parses /dev as a Coffee debug toggle", () => {
    assert.deepEqual(parseCoffeeDevCommand("/dev", BOTS, () => 0.5), {
      kind: "toggleDev",
    });
    assert.deepEqual(parseCoffeeDevCommand("  /DEV  ", BOTS, () => 0.5), {
      kind: "toggleDev",
    });
  });

  it("rejects /dev with extra text", () => {
    const out = parseCoffeeDevCommand("/dev please", BOTS, () => 0.5);
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /Use `\/dev` by itself/i);
    }
  });

  it("parses /echo with --wait seconds", () => {
    const out = parseCoffeeDevCommand('/echo "hello there" --wait 5', BOTS, () => 0.99);
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "hello there");
      assert.equal(out.waitSeconds, 5);
    }
  });

  it("parses /echo with -load seconds", () => {
    const out = parseCoffeeDevCommand('/echo "hello there" -load 1.5', BOTS, () => 0.99);
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "hello there");
      assert.equal(out.waitSeconds, 1.5);
    }
  });

  it("parses concatenated quoted strings", () => {
    const out = parseCoffeeDevCommand('/echo "Hello " + "World!" --wait 20', BOTS, () => 0.99);
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "Hello World!");
      assert.equal(out.waitSeconds, 20);
    }
  });

  it("parses concatenated quoted strings without spaces around plus", () => {
    const out = parseCoffeeDevCommand('/echo "Hello "+"World!"', BOTS, () => 0.99);
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "Hello World!");
      assert.equal(out.waitSeconds, 0);
    }
  });

  it("parses quoted text plus raw stage-direction token", () => {
    const out = parseCoffeeDevCommand('/echo "Hello world!" + *cheers*', BOTS, () => 0.99);
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "Hello world!*cheers*");
      assert.equal(out.waitSeconds, 0);
    }
  });

  it("parses quoted text with inline stage direction and plus form equivalently", () => {
    const quoted = parseCoffeeDevCommand('/echo "Hello world! *cheers*"', BOTS, () => 0.99);
    const plus = parseCoffeeDevCommand('/echo "Hello world! " + *cheers*', BOTS, () => 0.99);
    assert.equal(quoted.kind, "ok");
    assert.equal(plus.kind, "ok");
    if (quoted.kind === "ok" && plus.kind === "ok") {
      assert.equal(quoted.message, plus.message);
    }
  });

  it("returns an error when no quoted message is provided", () => {
    const out = parseCoffeeDevCommand("/echo hello", BOTS, () => 0.5);
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /Use `\/echo/i);
    }
  });

  it("returns an error when quoted content is empty", () => {
    const out = parseCoffeeDevCommand('/echo "   "', BOTS, () => 0.5);
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /cannot be empty/i);
    }
  });

  it("returns an error when --wait is missing a number", () => {
    const out = parseCoffeeDevCommand('/echo "hello" --wait', BOTS, () => 0.5);
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /Use `\/echo/i);
    }
  });

  it("returns an error when concatenation syntax is incomplete", () => {
    const out = parseCoffeeDevCommand('/echo "hello" + --wait 2', BOTS, () => 0.5);
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /Use `\/echo/i);
    }
  });
});
