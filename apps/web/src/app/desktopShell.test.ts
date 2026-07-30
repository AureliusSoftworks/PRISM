import test from "node:test";
import assert from "node:assert/strict";

import {
  isDesktopFullscreenToggleShortcut,
  openDesktopEmojiPicker,
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
