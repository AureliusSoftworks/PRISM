import test from "node:test";
import assert from "node:assert/strict";

import {
  isDesktopFullscreenToggleShortcut,
  openDesktopEmojiPicker,
  setDesktopCursorPosition,
} from "./desktopShell.ts";

test("reserves Alt+Enter for the desktop fullscreen toggle", () => {
  assert.equal(
    isDesktopFullscreenToggleShortcut({
      key: "Enter",
      code: "Enter",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }),
    true
  );
  assert.equal(
    isDesktopFullscreenToggleShortcut({
      key: "Enter",
      code: "Enter",
      altKey: true,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    false
  );
});

test("requests the native emoji picker through the desktop bridge", async () => {
  const previousWindow = globalThis.window;
  let invokedCommand = "";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            invokedCommand = command;
            return true;
          },
        },
      },
    },
  });

  try {
    assert.equal(await openDesktopEmojiPicker(), true);
    assert.equal(invokedCommand, "open_emoji_picker");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  }
});

test("moves the native desktop cursor in webview client coordinates", async () => {
  const previousWindow = globalThis.window;
  let invokedCommand = "";
  let invokedArgs: Record<string, unknown> | undefined;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __TAURI__: {
        core: {
          invoke: async (
            command: string,
            args?: Record<string, unknown>,
          ) => {
            invokedCommand = command;
            invokedArgs = args;
            return true;
          },
        },
      },
    },
  });

  try {
    assert.equal(await setDesktopCursorPosition(412.5, 733.25), true);
    assert.equal(invokedCommand, "set_cursor_position");
    assert.deepEqual(invokedArgs, { x: 412.5, y: 733.25 });
    assert.equal(await setDesktopCursorPosition(Number.NaN, 0), false);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  }
});
