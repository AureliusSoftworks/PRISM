import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCoffeeDevCommand } from "./coffeeDevCommand.ts";

describe("parseCoffeeDevCommand", () => {
  it("returns none for non-command lines", () => {
    const out = parseCoffeeDevCommand("hello");
    assert.deepEqual(out, { kind: "none" });
  });

  it("returns none for retired /echo lines so they send as ordinary text", () => {
    assert.deepEqual(parseCoffeeDevCommand('/echo "hello there"'), {
      kind: "none",
    });
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
});
