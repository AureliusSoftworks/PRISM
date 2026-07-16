import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCoffeeDevCommand } from "./coffeeDevCommand.ts";

describe("parseCoffeeDevCommand", () => {
  it("returns none for non-command lines", () => {
    const out = parseCoffeeDevCommand("hello");
    assert.deepEqual(out, { kind: "none" });
  });

  it("parses /echo with a quoted message", () => {
    const out = parseCoffeeDevCommand('/echo "hello there"');
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "hello there");
      assert.equal(out.waitSeconds, 0);
    }
  });

  it("parses /dev as a Coffee debug toggle", () => {
    assert.deepEqual(parseCoffeeDevCommand("/dev"), {
      kind: "toggleDev",
    });
    assert.deepEqual(parseCoffeeDevCommand("  /DEV  "), {
      kind: "toggleDev",
    });
  });

  it("rejects /dev with extra text", () => {
    const out = parseCoffeeDevCommand("/dev please");
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /Use `\/dev` by itself/i);
    }
  });

  it("parses /echo with --wait seconds", () => {
    const out = parseCoffeeDevCommand('/echo "hello there" --wait 5');
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "hello there");
      assert.equal(out.waitSeconds, 5);
    }
  });

  it("parses /echo with -load seconds", () => {
    const out = parseCoffeeDevCommand('/echo "hello there" -load 1.5');
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "hello there");
      assert.equal(out.waitSeconds, 1.5);
    }
  });

  it("parses concatenated quoted strings", () => {
    const out = parseCoffeeDevCommand('/echo "Hello " + "World!" --wait 20');
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "Hello World!");
      assert.equal(out.waitSeconds, 20);
    }
  });

  it("parses concatenated quoted strings without spaces around plus", () => {
    const out = parseCoffeeDevCommand('/echo "Hello "+"World!"');
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "Hello World!");
      assert.equal(out.waitSeconds, 0);
    }
  });

  it("parses quoted text plus raw stage-direction token", () => {
    const out = parseCoffeeDevCommand('/echo "Hello world!" + *cheers*');
    assert.equal(out.kind, "ok");
    if (out.kind === "ok") {
      assert.equal(out.message, "Hello world!*cheers*");
      assert.equal(out.waitSeconds, 0);
    }
  });

  it("parses quoted text with inline stage direction and plus form equivalently", () => {
    const quoted = parseCoffeeDevCommand('/echo "Hello world! *cheers*"');
    const plus = parseCoffeeDevCommand('/echo "Hello world! " + *cheers*');
    assert.equal(quoted.kind, "ok");
    assert.equal(plus.kind, "ok");
    if (quoted.kind === "ok" && plus.kind === "ok") {
      assert.equal(quoted.message, plus.message);
    }
  });

  it("returns an error when no quoted message is provided", () => {
    const out = parseCoffeeDevCommand("/echo hello");
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /Use `\/echo/i);
    }
  });

  it("returns an error when quoted content is empty", () => {
    const out = parseCoffeeDevCommand('/echo "   "');
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /cannot be empty/i);
    }
  });

  it("returns an error when --wait is missing a number", () => {
    const out = parseCoffeeDevCommand('/echo "hello" --wait');
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /Use `\/echo/i);
    }
  });

  it("returns an error when concatenation syntax is incomplete", () => {
    const out = parseCoffeeDevCommand('/echo "hello" + --wait 2');
    assert.equal(out.kind, "error");
    if (out.kind === "error") {
      assert.match(out.error, /Use `\/echo/i);
    }
  });
});
