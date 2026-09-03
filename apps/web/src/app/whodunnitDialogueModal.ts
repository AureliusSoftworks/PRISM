/** One modal lifetime, shared by every investigation caption. Browser-native
 * modality owns background focus/inertness; capture also contains synthetic
 * controller events that can otherwise bypass native pointer hit testing. */
export function holdWhodunnitDialogueModal(dialog: HTMLDialogElement, onGesture: (clickCount: number) => void = () => {}): () => void {
  const ownerWindow = dialog.ownerDocument.defaultView!;
  const pressedKeys = new Set<string>();
  const pressedPointers = new Set<number>();
  let pointerClickPending = false;
  const contain = (event: Event): void => {
    if (event.type === "keydown") pressedKeys.add((event as KeyboardEvent).code);
    if (event.type === "keyup") pressedKeys.delete((event as KeyboardEvent).code);
    if (event.type === "pointerdown") {
      pressedPointers.add((event as PointerEvent).pointerId);
      pointerClickPending = true;
    }
    if (event.type === "pointerup" || event.type === "pointercancel") pressedPointers.delete((event as PointerEvent).pointerId);
    if (event.type === "click" || event.type === "pointercancel" || event.type === "contextmenu") pointerClickPending = false;
    const inside = event.target instanceof Node && dialog.contains(event.target);
    // Contain at window capture, before document-level picker/hotkey handlers.
    // React capture at the card alone is too late for those global controls.
    // Preserve native tap-to-click synthesis inside the modal. Cancelling a
    // touchstart would otherwise prevent the only allowed advance gesture.
    if (!inside || !/^(?:pointer|mouse|touch)/u.test(event.type)) event.preventDefault();
    event.stopImmediatePropagation();
    if (!inside) return;
    if (event.type === "click") onGesture((event as MouseEvent).detail);
    if (event.type === "keydown") {
      const key = event as KeyboardEvent;
      if (!key.repeat && !key.metaKey && !key.ctrlKey && !key.altKey &&
        (key.key === "Enter" || key.key === " " || key.key === "Escape")) onGesture(1);
    }
  };
  const events = ["click", "dblclick", "auxclick", "pointerdown", "pointerup", "pointercancel", "pointermove", "pointerover", "pointerout", "mousedown", "mouseup", "mousemove", "touchstart", "touchend", "touchcancel", "touchmove", "keydown", "keyup", "wheel", "contextmenu", "focusin", "beforeinput", "input", "change", "paste", "cut", "drop", "dragstart"];
  events.forEach((name) => ownerWindow.addEventListener(name, contain, { capture: true, passive: false }));
  dialog.showModal();
  dialog.focus({ preventScroll: true });
  return () => {
    events.forEach((name) => ownerWindow.removeEventListener(name, contain, true));
    dialog.close();
    // Spoken captions can also finish automatically between pointer-down and
    // pointer-up. Consume that gesture through its synthesized click.
    if (pressedPointers.size || pointerClickPending) {
      const tailEvents = ["pointerup", "pointercancel", "mouseup", "touchend", "click"];
      let timer: number | undefined;
      const releasePointer = (event: Event): void => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === "pointerup" || event.type === "pointercancel") {
          pressedPointers.delete((event as PointerEvent).pointerId);
        }
        if (event.type === "click" || event.type === "pointercancel") timer = ownerWindow.setTimeout(clearPointers, 0);
        else if (!pressedPointers.size) timer = ownerWindow.setTimeout(clearPointers, 500);
      };
      const clearPointers = (): void => {
        if (timer !== undefined) ownerWindow.clearTimeout(timer);
        tailEvents.forEach((name) => ownerWindow.removeEventListener(name, releasePointer, true));
        ownerWindow.removeEventListener("blur", clearPointers);
      };
      tailEvents.forEach((name) => ownerWindow.addEventListener(name, releasePointer, true));
      ownerWindow.addEventListener("blur", clearPointers, { once: true });
      // Touch engines may synthesize click after touchend, or cancel it
      // entirely. Keep that tail contained without leaving an input deadlock.
      if (!pressedPointers.size) timer = ownerWindow.setTimeout(clearPointers, 500);
    }
    // A key-down that closes the last card must not release onto the restored
    // underlying control (including controller-generated keyboard activation).
    if (pressedKeys.size) {
      const release = (event: KeyboardEvent): void => {
        if (!pressedKeys.has(event.code)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === "keyup") pressedKeys.delete(event.code);
        if (!pressedKeys.size) clear();
      };
      const clear = (): void => {
        ownerWindow.removeEventListener("keydown", release, true);
        ownerWindow.removeEventListener("keyup", release, true);
        ownerWindow.removeEventListener("blur", clear);
      };
      ownerWindow.addEventListener("keydown", release, true);
      ownerWindow.addEventListener("keyup", release, true);
      ownerWindow.addEventListener("blur", clear, { once: true });
    }
  };
}
