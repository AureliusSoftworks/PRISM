import test from "node:test";
import assert from "node:assert/strict";

import { isDesktopFullscreenToggleShortcut } from "./desktopShell.ts";

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
