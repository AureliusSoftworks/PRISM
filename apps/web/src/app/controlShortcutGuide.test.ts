import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROL_SHORTCUT_GUIDE_SHOW_DELAY_MS,
  controlShortcutGuideEntries,
  controlShortcutGuideShouldShow,
  isControlHeldAlone,
  isControlKeyEvent,
  readPrismCompanionOrbAnchor,
} from "./controlShortcutGuide.ts";
import { defaultPrismKeyboardShortcuts } from "./keyboardShortcuts.ts";

test("waits for an intentional Control hold before showing the guide", () => {
  assert.equal(CONTROL_SHORTCUT_GUIDE_SHOW_DELAY_MS, 1_500);
});

test("shows the guide only while Control is held", () => {
  assert.equal(
    controlShortcutGuideShouldShow({
      controlHeld: true,
      prismWielding: false,
      recordingShortcut: false,
    }),
    true,
  );
  assert.equal(
    controlShortcutGuideShouldShow({
      controlHeld: false,
      prismWielding: true,
      recordingShortcut: false,
    }),
    false,
  );
  assert.equal(
    controlShortcutGuideShouldShow({
      controlHeld: false,
      prismWielding: false,
      recordingShortcut: false,
    }),
    false,
  );
  assert.equal(
    controlShortcutGuideShouldShow({
      controlHeld: true,
      prismWielding: true,
      recordingShortcut: true,
    }),
    false,
  );
});

test("builds PRISM shortcut entries from preferences", () => {
  const entries = controlShortcutGuideEntries(
    defaultPrismKeyboardShortcuts("MacIntel"),
    "MacIntel",
  );
  assert.deepEqual(
    entries.map((entry) => [entry.action, entry.slot, entry.display]),
    [
      ["turbo", "up", "⌥ Up"],
      ["providerMode", "footer", "⇧ Tab"],
      ["effortPicker", "down", "⌥ Down"],
      ["modelPicker", "left", "⌥ Left"],
      ["prism", "footer", "⌘ ⌥"],
      ["speechType", "right", "⌥ Right"],
    ],
  );
});

test("recognizes Control key events and alone-held Control", () => {
  assert.equal(isControlKeyEvent({ key: "Control", code: "ControlLeft" }), true);
  assert.equal(isControlKeyEvent({ key: "Alt", code: "AltLeft" }), false);
  assert.equal(
    isControlHeldAlone({ ctrlKey: true, altKey: false, metaKey: false }),
    true,
  );
  assert.equal(
    isControlHeldAlone({ ctrlKey: true, altKey: true, metaKey: false }),
    false,
  );
});

test("reads the live Prism companion orb center when another UI needs it", () => {
  assert.equal(readPrismCompanionOrbAnchor({ querySelector: () => null }), null);
  const anchor = {
    getBoundingClientRect: () => ({
      left: 100,
      top: 200,
      width: 40,
      height: 40,
      right: 140,
      bottom: 240,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    }),
  } as unknown as Element;
  assert.deepEqual(
    readPrismCompanionOrbAnchor({ querySelector: () => anchor }),
    { x: 120, y: 220, size: 40 },
  );
});
