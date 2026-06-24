import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  COMPOSE_MENTION_MENU_MAX_WIDTH_PX,
  COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX,
  computeMentionMenuFixedStyle,
} from "./composerMentionPortal.ts";

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
  } as DOMRect;
}

function mockViewport(width: number, height: number): void {
  Object.defineProperty(globalThis, "window", {
    value: {
      innerWidth: width,
      innerHeight: height,
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
    },
    configurable: true,
  });
}

describe("computeMentionMenuFixedStyle", () => {
  const prevWindow = globalThis.window;

  afterEach(() => {
    if (prevWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      (globalThis as { window?: Window }).window = prevWindow as Window;
    }
  });

  it("keeps the menu inside the viewport when the caret is at the bottom", () => {
    mockViewport(400, 600);
    const pad = COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX;
    const caret = rect(20, 520, 2, 20);
    const style = computeMentionMenuFixedStyle(caret, null);
    assert.equal(typeof style.top, "number");
    const top = style.top as number;
    const maxH = style.maxHeight as number;
    assert.ok(top >= pad);
    assert.ok(top + maxH + pad <= 600 + 0.001);
  });

  it("opens upward when there is almost no room below but room above", () => {
    mockViewport(400, 600);
    const pad = COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX;
    const caret = rect(20, 560, 2, 20);
    const style = computeMentionMenuFixedStyle(caret, null);
    const top = style.top as number;
    const maxH = style.maxHeight as number;
    assert.ok(top + maxH <= caret.top - 6 + 1);
    assert.ok(top >= pad);
  });

  it("prefers opening upward when there is enough room above the caret", () => {
    mockViewport(500, 700);
    const caret = rect(120, 360, 2, 18);
    const style = computeMentionMenuFixedStyle(caret, null);
    const top = style.top as number;
    const maxH = style.maxHeight as number;
    assert.ok(top + maxH <= caret.top - 6 + 1);
  });

  it("clamps left so the menu does not extend past the right edge", () => {
    mockViewport(360, 640);
    const pad = COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX;
    const caret = rect(320, 100, 2, 18);
    const style = computeMentionMenuFixedStyle(caret, null);
    const left = style.left as number;
    const maxW = style.maxWidth as number;
    const cap = Math.min(COMPOSE_MENTION_MENU_MAX_WIDTH_PX, 360 - pad * 2);
    assert.equal(maxW, cap);
    assert.ok(left + maxW + pad <= 360 + 0.001);
    assert.ok(left >= pad);
  });
});
