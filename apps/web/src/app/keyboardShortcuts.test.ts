import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultPrismKeyboardShortcuts,
  keyboardShortcutConflictAction,
  keyboardShortcutDisplay,
  keyboardShortcutFromEvent,
  keyboardShortcutMatchesEvent,
  normalizePrismKeyboardShortcuts,
  prismKeyboardShortcutsStorageKey,
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

test("provides the Control-root navbar shortcut defaults", () => {
  assert.deepEqual(defaultPrismKeyboardShortcuts("MacIntel"), {
    prism: "Control+Alt",
    providerMode: "Shift+Tab",
    modelPicker: "Control+ArrowLeft",
    effortPicker: "Control+ArrowDown",
    turbo: "Control+ArrowUp",
    speechType: "Control+ArrowRight",
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
  assert.equal(
    keyboardShortcutFromEvent({
      code: "AltLeft",
      altKey: true,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    "Control+Alt",
  );
  assert.equal(
    keyboardShortcutFromEvent(event("ArrowUp", { ctrlKey: true })),
    "Control+ArrowUp",
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
  assert.equal(
    keyboardShortcutMatchesEvent(
      "Control+Alt",
      {
        code: "ControlLeft",
        altKey: true,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      },
    ),
    true,
  );
});

test("formats shortcuts for Apple and non-Apple keyboards", () => {
  assert.equal(
    keyboardShortcutDisplay("Meta+Shift+KeyE", "MacIntel"),
    "⌘ ⇧ E",
  );
  assert.equal(
    keyboardShortcutDisplay("Control+ArrowDown", "MacIntel"),
    "⌃ Down",
  );
  assert.equal(
    keyboardShortcutDisplay("Control+Alt", "MacIntel"),
    "⌃ ⌥",
  );
  assert.equal(
    keyboardShortcutDisplay("Control+Shift+KeyE", "Win32"),
    "Ctrl + Shift + E",
  );
  assert.equal(
    keyboardShortcutDisplay("Control+Alt", "Win32"),
    "Ctrl + Alt",
  );
  assert.equal(keyboardShortcutDisplay(null, "Win32"), "Not set");
});

test("normalizes malformed and colliding persisted shortcuts safely", () => {
  assert.deepEqual(
    normalizePrismKeyboardShortcuts(
      {
        prism: "Control+Alt",
        modelPicker: "Control+Alt",
        effortHud: "nope",
      },
      "Win32",
    ),
    {
      prism: "Control+Alt",
      providerMode: "Shift+Tab",
      modelPicker: "Control+ArrowLeft",
      effortPicker: "Control+ArrowDown",
      turbo: "Control+ArrowUp",
      speechType: "Control+ArrowRight",
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
      "Control+Alt",
    ),
    "prism",
  );
  assert.equal(
    keyboardShortcutConflictAction(
      preferences,
      "speechType",
      "Control+ArrowRight",
    ),
    null,
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
  assert.match(
    [...values.keys()][0] ?? "",
    /^prism_keyboard_shortcuts_v2:/u,
  );

  values.set(
    prismKeyboardShortcutsStorageKey("legacy-account"),
    JSON.stringify({ ...preferences, prism: "Control+Space" }),
  );
  assert.equal(
    readPrismKeyboardShortcuts(storage, "legacy-account", "Win32").prism,
    "Control+Alt",
  );
  values.set(
    prismKeyboardShortcutsStorageKey("legacy-routing"),
    JSON.stringify({
      ...preferences,
      providerMode: "Control+ArrowLeft",
      modelPicker: "Control+ArrowDown",
      effortPicker: "Control+ArrowRight",
      speechType: "Shift+Tab",
    }),
  );
  assert.deepEqual(
    readPrismKeyboardShortcuts(storage, "legacy-routing", "Win32"),
    preferences,
  );
});
