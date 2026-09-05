"use client";

import {
  TEXT_ENTRY_EMAIL_MAX_LENGTH,
  TEXT_ENTRY_LONG_FORM_MAX_LENGTH,
  TEXT_ENTRY_PASSWORD_MAX_LENGTH,
  TEXT_ENTRY_SEARCH_MAX_LENGTH,
  TEXT_ENTRY_SHORT_MAX_LENGTH,
  TEXT_ENTRY_URL_MAX_LENGTH,
} from "@localai/shared";
import { useEffect } from "react";

function defaultTextEntryMaxLength(
  field: HTMLInputElement | HTMLTextAreaElement,
): number | null {
  if (field instanceof HTMLTextAreaElement) {
    return TEXT_ENTRY_LONG_FORM_MAX_LENGTH;
  }
  switch (field.type) {
    case "email":
      return TEXT_ENTRY_EMAIL_MAX_LENGTH;
    case "password":
      return TEXT_ENTRY_PASSWORD_MAX_LENGTH;
    case "search":
      return TEXT_ENTRY_SEARCH_MAX_LENGTH;
    case "tel":
    case "text":
      return TEXT_ENTRY_SHORT_MAX_LENGTH;
    case "url":
      return TEXT_ENTRY_URL_MAX_LENGTH;
    default:
      return null;
  }
}

function applyDefaultTextEntryLimit(root: ParentNode): void {
  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input:not([maxlength]), textarea:not([maxlength])",
  );
  for (const field of fields) {
    const maxLength = defaultTextEntryMaxLength(field);
    if (maxLength !== null) {
      field.maxLength = maxLength;
      field.dataset.prismDefaultMaxLength = String(maxLength);
    }
  }
}

/** Safety net for direct JSX fields; semantic fields should still set a tighter cap. */
export function TextEntryLengthDefaults() {
  useEffect(() => {
    applyDefaultTextEntryLimit(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("input:not([maxlength]), textarea:not([maxlength])")) {
            const maxLength = defaultTextEntryMaxLength(
              node as HTMLInputElement | HTMLTextAreaElement,
            );
            if (maxLength !== null) {
              (node as HTMLInputElement | HTMLTextAreaElement).maxLength = maxLength;
              (node as HTMLElement).dataset.prismDefaultMaxLength = String(maxLength);
            }
          }
          applyDefaultTextEntryLimit(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
