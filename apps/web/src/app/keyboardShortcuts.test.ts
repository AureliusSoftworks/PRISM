import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultPrismKeyboardShortcuts,
  keyboardShortcutConflictAction,
  keyboardShortcutDisplay,
  keyboardShortcutFromEvent,
  keyboardShortcutMatchesEvent,
  normalizePrismKeyboardShortcuts,
  readPrismKeyboardShortcuts,
  writePrismKeyboardShortcuts,
} from "./keyboardShortcuts.ts";

const event = (
  code: string,
  modifiers: Partial<{
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }> = {},
) => ({
  code,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...modifiers,
});

test("provides the global Prism and model workflow defaults", () => {
  assert.deepEqual(defaultPrismKeyboardShortcuts("MacIntel"), {
    prism: "Control+Space",
    modelPicker: "Shift+Tab",
    effortHud: "Meta+Shift+KeyE",
  });
  assert.equal(
    defaultPrismKeyboardShortcuts("Win32").effortHud,
    "Control+Shift+KeyE",
  );
});

test("captures canonical physical-key shortcuts with an exact modifier set", () => {
  assert.equal(
    keyboardShortcutFromEvent(event("Tab", { shiftKey: true })),
    "Shift+Tab",
  );
  assert.equal(
    keyboardShortcutFromEvent(event("Space", { ctrlKey: true })),
    "Control+Space",
  );
  assert.equal(keyboardShortcutFromEvent(event("KeyE")), null);
  assert.equal(
    keyboardShortcutMatchesEvent(
      "Control+Space",
      event("Space", { ctrlKey: true }),
    ),
    true,
  );
  assert.equal(
    keyboardShortcutMatchesEvent(
      "Control+Space",
      event("Space", { ctrlKey: true, shiftKey: true }),
    ),
    false,
  );
});

test("formats shortcuts for Apple and non-Apple keyboards", () => {
  assert.equal(
    keyboardShortcutDisplay("Meta+Shift+KeyE", "MacIntel"),
    "⌘ ⇧ E",
  );
  assert.equal(
    keyboardShortcutDisplay("Control+Shift+KeyE", "Win32"),
    "Ctrl + Shift + E",
  );
  assert.equal(keyboardShortcutDisplay(null, "Win32"), "Not set");
});

test("normalizes malformed and colliding persisted shortcuts safely", () => {
  assert.deepEqual(
    normalizePrismKeyboardShortcuts(
      {
        prism: "Control+Space",
        modelPicker: "Control+Space",
        effortHud: "nope",
      },
      "Win32",
    ),
    {
      prism: "Control+Space",
      modelPicker: "Shift+Tab",
      effortHud: "Control+Shift+KeyE",
    },
  );
});

test("detects conflicts and stores account-scoped preferences", () => {
  const preferences = defaultPrismKeyboardShortcuts("Win32");
  assert.equal(
    keyboardShortcutConflictAction(
      preferences,
      "modelPicker",
      "Control+Space",
    ),
    "prism",
  );
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  writePrismKeyboardShortcuts(storage, "account-1", preferences);
  assert.deepEqual(
    readPrismKeyboardShortcuts(storage, "account-1", "Win32"),
    preferences,
  );
  assert.deepEqual(
    readPrismKeyboardShortcuts(storage, "account-2", "Win32"),
    preferences,
  );
});
