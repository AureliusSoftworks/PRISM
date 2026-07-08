import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldBlockBrowserKeyboardShortcut,
  shouldBlockBrowserMouseShortcut,
  shouldBlockBrowserWheelShortcut,
  type BrowserShortcutKeyEvent,
} from "./browserShortcutGuards.ts";

function keyEvent(
  overrides: Partial<BrowserShortcutKeyEvent>
): BrowserShortcutKeyEvent {
  return {
    key: "a",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

test("blocks refresh shortcuts", () => {
  assert.equal(shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "F5" })), true);
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "r", ctrlKey: true })),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "r", metaKey: true })),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(
      keyEvent({ key: "Unidentified", code: "KeyR", metaKey: true })
    ),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(
      keyEvent({ key: "R", metaKey: true, shiftKey: true })
    ),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "Refresh" })),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "Unidentified", code: "BrowserRefresh" })),
    true
  );
});

test("blocks keyboard and wheel zoom shortcuts", () => {
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "=", ctrlKey: true })),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(
      keyEvent({ key: "+", code: "NumpadAdd", ctrlKey: true })
    ),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "-", metaKey: true })),
    true
  );
  assert.equal(shouldBlockBrowserWheelShortcut({ ctrlKey: true, metaKey: false }), true);
});

test("blocks browser navigation and address chrome shortcuts", () => {
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "ArrowLeft", altKey: true })),
    true
  );
  assert.equal(shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "BrowserBack" })), true);
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "l", ctrlKey: true })),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "[", metaKey: true })),
    true
  );
});

test("blocks browser history mouse buttons", () => {
  assert.equal(shouldBlockBrowserMouseShortcut({ button: 3 }), true);
  assert.equal(shouldBlockBrowserMouseShortcut({ button: 4 }), true);
  assert.equal(shouldBlockBrowserMouseShortcut({ button: 0 }), false);
  assert.equal(shouldBlockBrowserMouseShortcut({ button: 1 }), false);
  assert.equal(shouldBlockBrowserMouseShortcut({ button: 3, defaultPrevented: true }), false);
});

test("blocks tab, window, and common browser panel shortcuts", () => {
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "t", ctrlKey: true })),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "1", ctrlKey: true })),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "Tab", ctrlKey: true })),
    true
  );
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "p", metaKey: true })),
    true
  );
});

test("leaves Alt+Enter available for the desktop shell fullscreen toggle", () => {
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "Enter", code: "Enter", altKey: true })),
    false
  );
  assert.equal(shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "F11" })), true);
});

test("keeps normal editing shortcuts available", () => {
  for (const key of ["a", "c", "v", "x", "y", "z"]) {
    assert.equal(
      shouldBlockBrowserKeyboardShortcut(
        keyEvent({ key, ctrlKey: true, targetIsEditable: true })
      ),
      false
    );
  }
  assert.equal(
    shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "Backspace", targetIsEditable: true })),
    false
  );
});

test("blocks history-style backspace outside editable areas", () => {
  assert.equal(shouldBlockBrowserKeyboardShortcut(keyEvent({ key: "Backspace" })), true);
});
