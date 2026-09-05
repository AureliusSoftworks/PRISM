import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { holdWhodunnitDialogueModal } from "./whodunnitDialogueModal.ts";

test("dialogue modal contains background pointer, touch, keyboard and synthetic controller events and releases normally", () => {
  class FakeNode {}
  const priorNode = Object.getOwnPropertyDescriptor(globalThis, "Node");
  Object.defineProperty(globalThis, "Node", { configurable: true, value: FakeNode });
  try {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    const ownerWindow = {
      addEventListener(name: string, callback: (event: Event) => void) { const group = listeners.get(name) ?? new Set(); group.add(callback); listeners.set(name, group); },
      removeEventListener(name: string, callback: (event: Event) => void) { listeners.get(name)?.delete(callback); },
    };
    const child = new FakeNode();
    let opened = 0, focused = 0, closed = 0;
    const dialog = Object.assign(new FakeNode(), {
      ownerDocument: { defaultView: ownerWindow },
      contains: (node: unknown) => node === child || node === dialog,
      showModal: () => { opened += 1; },
      focus: () => { focused += 1; },
      close: () => { closed += 1; },
    });
    const emit = (type: string, target: unknown, code = ""): boolean => {
      let contained = false;
      const event = { type, target, code, preventDefault() {}, stopImmediatePropagation() { contained = true; } } as unknown as Event;
      for (const listener of [...(listeners.get(type) ?? [])]) { listener(event); if (contained) break; }
      return contained;
    };
    let gestures = 0;
    const release = holdWhodunnitDialogueModal(dialog as unknown as HTMLDialogElement, () => { gestures += 1; });
    assert.deepEqual([opened, focused, closed], [1, 1, 0]);
    for (const type of ["click", "dblclick", "pointerdown", "pointerup", "touchstart", "touchend", "keydown", "keyup", "wheel", "contextmenu"]) {
      assert.equal(emit(type, new FakeNode()), true, type);
    }
    assert.equal(emit("click", child), true, "modal clicks are consumed before global document handlers");
    assert.equal(gestures, 1);
    assert.equal(emit("keydown", child, "Space"), true);
    release();
    assert.equal(closed, 1);
    assert.equal(emit("keydown", new FakeNode(), "Space"), true, "held repeat cannot act after dismissal");
    assert.equal(emit("keyup", new FakeNode(), "Space"), true, "dismissal key release cannot click through");
    assert.equal(emit("click", new FakeNode()), false);
    assert.equal(emit("keydown", new FakeNode(), "Space"), false);
  } finally {
    if (priorNode) Object.defineProperty(globalThis, "Node", priorNode);
    else Reflect.deleteProperty(globalThis, "Node");
  }
});

test("all visible room captions use the native modal without remounting on each streamed line", () => {
  const source = readFileSync(new URL("./DebateMysteryV2Experience.tsx", import.meta.url), "utf8");
  assert.match(source, /roomDisplayedDialogue && !roomEntryLoading \? \(\s*<WhodunnitInvestigationDialogue onGesture=/u);
  const component = source.slice(source.indexOf("function WhodunnitInvestigationDialogue"), source.indexOf("function WhodunnitRoomLoadingOverlay"));
  assert.match(component, /holdWhodunnitDialogueModal\(dialog, \(count\) => gestureRef\.current\(count\)\)/u);
  assert.match(component, /onClick=[\s\S]*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*props\.onGesture/u);
  assert.match(component, /onKeyDownCapture=/u);
  assert.match(component, /!event\.repeat/u);
  assert.match(component, /onCancel=\{\(event\) => event\.preventDefault\(\)\}/u);
  assert.match(source, /revision === sceneRepairDismissalRevisionRef\.current/u);
});
