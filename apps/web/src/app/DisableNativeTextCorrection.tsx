"use client";

import { useEffect } from "react";

const TEXT_ENTRY_SELECTOR =
  'input, textarea, [contenteditable]:not([contenteditable="false"])';

declare global {
  var __PRISM_NATIVE_TEXT_CORRECTION_POLICY__: boolean | undefined;
}

function disableNativeTextCorrection(element: Element): void {
  if (!element.matches(TEXT_ENTRY_SELECTOR)) return;
  const textEntry = element as HTMLElement;
  if (textEntry.spellcheck !== false) textEntry.spellcheck = false;
  if (textEntry.getAttribute("spellcheck") !== "false") {
    textEntry.setAttribute("spellcheck", "false");
  }
  if (textEntry.getAttribute("autocorrect") !== "off") {
    textEntry.setAttribute("autocorrect", "off");
  }
}

function disableNativeTextCorrectionWithin(root: ParentNode): void {
  if (root instanceof Element) disableNativeTextCorrection(root);
  for (const element of root.querySelectorAll(TEXT_ENTRY_SELECTOR)) {
    disableNativeTextCorrection(element);
  }
}

/**
 * PRISM owns writing assistance itself. Keep browser and OS spelling/correction
 * UI off without changing autocomplete, capitalization, IME, or text editing.
 */
export function DisableNativeTextCorrection(): null {
  useEffect(() => {
    const root = document.documentElement;
    if (root.spellcheck !== false) root.spellcheck = false;
    if (root.getAttribute("spellcheck") !== "false") {
      root.setAttribute("spellcheck", "false");
    }
    if (root.getAttribute("autocorrect") !== "off") {
      root.setAttribute("autocorrect", "off");
    }
    disableNativeTextCorrectionWithin(document);

    // Tauri installs the same policy before page code runs. Avoid a second
    // whole-document observer in the desktop app; this one is the web fallback.
    if (globalThis.__PRISM_NATIVE_TEXT_CORRECTION_POLICY__ === true) return;

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof Element) {
          disableNativeTextCorrection(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) disableNativeTextCorrectionWithin(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["spellcheck", "autocorrect"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
