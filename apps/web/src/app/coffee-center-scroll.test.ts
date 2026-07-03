import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coffeeCenterScrollIsAtBottom } from "./coffee-center-scroll.ts";

describe("coffeeCenterScrollIsAtBottom", () => {
  it("returns true when the viewport is exactly at the bottom", () => {
    assert.equal(
      coffeeCenterScrollIsAtBottom({
        scrollTop: 120,
        clientHeight: 80,
        scrollHeight: 200,
      }),
      true
    );
  });

  it("allows a small browser rounding threshold near the bottom", () => {
    assert.equal(
      coffeeCenterScrollIsAtBottom({
        scrollTop: 116.5,
        clientHeight: 80,
        scrollHeight: 200,
      }),
      true
    );
  });

  it("returns false once the user has scrolled above the bottom threshold", () => {
    assert.equal(
      coffeeCenterScrollIsAtBottom({
        scrollTop: 112,
        clientHeight: 80,
        scrollHeight: 200,
      }),
      false
    );
  });
});
