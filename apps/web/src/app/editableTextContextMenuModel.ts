export type TextFieldContextMenuAction = "cut" | "copy" | "paste" | "selectAll";

export const TEXT_FIELD_CONTEXT_MENU_ACTIONS: readonly TextFieldContextMenuAction[] = [
  "cut",
  "copy",
  "paste",
  "selectAll",
];

export const TEXT_FIELD_CONTEXT_MENU_LABELS: Record<TextFieldContextMenuAction, string> = {
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  selectAll: "Select All",
};

const TEXT_ENTRY_INPUT_TYPES = new Set([
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

const TEXT_EDITING_TARGET_SELECTOR = [
  "textarea",
  "input",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[data-markdown-cm-host='true']",
].join(", ");

const NESTED_TEXTBOX_SELECTOR = [
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
].join(", ");

export interface TextFieldCommandSnapshot {
  mutable: boolean;
  hasSelection: boolean;
  hasText: boolean;
}

export type TextFieldCommandState = Record<TextFieldContextMenuAction, boolean>;

export interface TextContextMenuPositionInput {
  x: number;
  y: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  padding?: number;
}

export interface TextContextMenuPosition {
  x: number;
  y: number;
}

export function isTextEntryInputType(type: string | null | undefined): boolean {
  const normalized = (type ?? "text").trim().toLowerCase();
  return normalized.length === 0 || TEXT_ENTRY_INPUT_TYPES.has(normalized);
}

export function resolveTextFieldCommandState(
  snapshot: TextFieldCommandSnapshot
): TextFieldCommandState {
  return {
    cut: snapshot.mutable && snapshot.hasSelection,
    copy: snapshot.hasSelection,
    paste: snapshot.mutable,
    selectAll: snapshot.hasText,
  };
}

export function clampTextContextMenuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  padding = 8,
}: TextContextMenuPositionInput): TextContextMenuPosition {
  const maxX = Math.max(padding, viewportWidth - menuWidth - padding);
  const maxY = Math.max(padding, viewportHeight - menuHeight - padding);
  return {
    x: Math.min(Math.max(padding, x), maxX),
    y: Math.min(Math.max(padding, y), maxY),
  };
}

export function closestTextEditingTarget(target: EventTarget | null): HTMLElement | null {
  if (
    typeof Element === "undefined" ||
    typeof HTMLElement === "undefined" ||
    !(target instanceof Element)
  ) {
    return null;
  }

  const candidate = target.closest(TEXT_EDITING_TARGET_SELECTOR);
  if (!(candidate instanceof HTMLElement)) return null;

  const nested = candidate.matches("[data-markdown-cm-host='true']")
    ? candidate.querySelector<HTMLElement>(NESTED_TEXTBOX_SELECTOR)
    : candidate.matches("[role='textbox']") && !candidate.isContentEditable
      ? candidate.querySelector<HTMLElement>(NESTED_TEXTBOX_SELECTOR)
      : null;
  const editable = nested ?? candidate;

  if (
    typeof HTMLInputElement !== "undefined" &&
    editable instanceof HTMLInputElement
  ) {
    return isTextEntryInputType(editable.type) ? editable : null;
  }

  if (
    typeof HTMLTextAreaElement !== "undefined" &&
    editable instanceof HTMLTextAreaElement
  ) {
    return editable;
  }

  if (
    editable.isContentEditable ||
    editable.getAttribute("role") === "textbox" ||
    editable.matches("[contenteditable]:not([contenteditable='false'])")
  ) {
    return editable;
  }

  return null;
}

export function textEditingTargetIsMutable(target: HTMLElement): boolean {
  if (
    typeof HTMLInputElement !== "undefined" &&
    target instanceof HTMLInputElement
  ) {
    return !target.disabled && !target.readOnly && isTextEntryInputType(target.type);
  }

  if (
    typeof HTMLTextAreaElement !== "undefined" &&
    target instanceof HTMLTextAreaElement
  ) {
    return !target.disabled && !target.readOnly;
  }

  if (
    target.getAttribute("aria-readonly") === "true" ||
    target.getAttribute("aria-disabled") === "true" ||
    target.closest("[aria-disabled='true'], [data-disabled='true']")
  ) {
    return false;
  }

  return target.isContentEditable || target.getAttribute("role") === "textbox";
}

export function focusTextEditingTarget(target: HTMLElement): void {
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

export function textEditingTargetText(target: HTMLElement): string {
  if (
    typeof HTMLInputElement !== "undefined" &&
    target instanceof HTMLInputElement
  ) {
    return target.value;
  }

  if (
    typeof HTMLTextAreaElement !== "undefined" &&
    target instanceof HTMLTextAreaElement
  ) {
    return target.value;
  }

  return target.innerText ?? target.textContent ?? "";
}

export function textEditingTargetHasSelection(target: HTMLElement): boolean {
  if (
    (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) ||
    (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement)
  ) {
    try {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      return typeof start === "number" && typeof end === "number" && end > start;
    } catch {
      return false;
    }
  }

  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  return (
    textEditingTargetContainsNode(target, selection.anchorNode) &&
    textEditingTargetContainsNode(target, selection.focusNode)
  );
}

export function selectedTextInTextEditingTarget(target: HTMLElement): string {
  if (
    (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) ||
    (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement)
  ) {
    try {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      if (typeof start !== "number" || typeof end !== "number" || end <= start) {
        return "";
      }
      return target.value.slice(start, end);
    } catch {
      return "";
    }
  }

  const selection = document.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    !textEditingTargetContainsNode(target, selection.anchorNode) ||
    !textEditingTargetContainsNode(target, selection.focusNode)
  ) {
    return "";
  }
  return selection.toString();
}

export function textEditingTargetSnapshot(target: HTMLElement): TextFieldCommandSnapshot {
  return {
    mutable: textEditingTargetIsMutable(target),
    hasSelection: textEditingTargetHasSelection(target),
    hasText: textEditingTargetText(target).length > 0,
  };
}

export function selectAllTextEditingTarget(target: HTMLElement): boolean {
  focusTextEditingTarget(target);

  if (
    (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) ||
    (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement)
  ) {
    target.select();
    return true;
  }

  const selection = document.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents(target);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function dispatchTextEditingInputEvent(
  target: HTMLElement,
  inputType: string,
  data: string | null = null
): void {
  try {
    target.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType,
        data,
      })
    );
  } catch {
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function insertTextIntoTextEditingTarget(
  target: HTMLElement,
  text: string
): boolean {
  focusTextEditingTarget(target);

  if (
    (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) ||
    (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement)
  ) {
    try {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      if (typeof start === "number" && typeof end === "number") {
        target.setRangeText(text, start, end, "end");
        dispatchTextEditingInputEvent(target, "insertFromPaste", text);
        return true;
      }
    } catch {
      // Some input types, notably number, expose text editing but reject setRangeText.
    }
  }

  if (typeof document.execCommand === "function") {
    try {
      if (document.execCommand("insertText", false, text)) return true;
    } catch {
      // Fall through to the conservative DOM fallback below.
    }
  }

  if (!target.isContentEditable) return false;
  const selection = document.getSelection();
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !textEditingTargetContainsNode(target, selection.anchorNode) ||
    !textEditingTargetContainsNode(target, selection.focusNode)
  ) {
    return false;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
  dispatchTextEditingInputEvent(target, "insertFromPaste", text);
  return true;
}

export function deleteSelectedTextEditingTarget(target: HTMLElement): boolean {
  if (
    (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) ||
    (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement)
  ) {
    try {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      if (typeof start === "number" && typeof end === "number" && end > start) {
        target.setRangeText("", start, end, "start");
        dispatchTextEditingInputEvent(target, "deleteByCut");
        return true;
      }
    } catch {
      return false;
    }
  }

  if (!target.isContentEditable) return false;
  if (typeof document.execCommand !== "function") return false;

  try {
    return document.execCommand("delete");
  } catch {
    return false;
  }
}

export function dispatchTextPasteEvent(target: HTMLElement, text: string): boolean {
  let event: Event;

  if (typeof ClipboardEvent !== "undefined" && typeof DataTransfer !== "undefined") {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    data.setData("text", text);
    event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    });
  } else {
    event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (format: string) =>
          format === "text" || format === "text/plain" ? text : "",
      },
    });
  }

  target.dispatchEvent(event);
  return !event.defaultPrevented;
}

function textEditingTargetContainsNode(target: HTMLElement, node: Node | null): boolean {
  if (!node) return false;
  if (node === target) return true;
  if (typeof Element !== "undefined" && node instanceof Element) {
    return target.contains(node);
  }
  return Boolean(node.parentElement && target.contains(node.parentElement));
}
