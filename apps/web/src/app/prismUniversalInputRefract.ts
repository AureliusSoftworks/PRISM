"use client";

import {
  registerPrismRefractTarget,
  type PrismRefractFieldTarget,
} from "./prismRefract";

const PRISM_UNIVERSAL_INPUT_SELECTOR = [
  'input:not([type])',
  'input[type="text"]',
  'input[type="search"]',
  'input[type="url"]',
  'input[type="number"]',
  "textarea",
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
].join(", ");

const PRISM_UNIVERSAL_INPUT_EXCLUDED_ANCESTOR_SELECTOR = [
  '[data-prism-system-pause-exempt="true"]',
  '[data-prism-refract-ignore="true"]',
  '[data-live-episode="true"]',
  '[data-live-session-locked="true"]',
  '[data-replay="true"]',
  '[data-replay-active="true"]',
  '[data-recorded-replay="true"]',
  "[inert]",
  "[hidden]",
].join(", ");

const PRIVATE_INPUT_PATTERN =
  /(?:api.?key|access.?key|auth|bearer|card|credential|cvv|cvc|password|passcode|secret|security.?code|token)/iu;
const DESTRUCTIVE_INPUT_PATTERN =
  /(?:confirm.?delete|delete.?confirm|destroy|permanent.?delete|type.?delete)/iu;

export type PrismUniversalInputElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLElement;

export interface PrismUniversalInputContext {
  label: string;
  context: string;
  multiline: boolean;
  maxLength: number;
}

export interface PrismUniversalInputCandidateRequest {
  field: PrismUniversalInputContext;
  currentValue: string;
  rejectedValues: readonly string[];
  signal: AbortSignal;
  element: PrismUniversalInputElement;
}

function compactText(value: string | null | undefined, limit: number): string {
  return (value ?? "").replace(/\s+/gu, " ").trim().slice(0, limit).trim();
}

function humanizeIdentifier(value: string): string {
  return compactText(
    value
      .replace(/[_-]+/gu, " ")
      .replace(/([a-z\d])([A-Z])/gu, "$1 $2"),
    120,
  );
}

export function prismUniversalInputElement(
  element: Element,
): element is PrismUniversalInputElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function inputIdentity(element: PrismUniversalInputElement): string {
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("name"),
    element.id,
    element.getAttribute("autocomplete"),
    element.getAttribute("placeholder"),
  ]
    .filter(Boolean)
    .join(" ");
}

export function prismUniversalInputIsEligible(
  element: PrismUniversalInputElement,
): boolean {
  if (!element.isConnected) return false;
  if (element.closest(PRISM_UNIVERSAL_INPUT_EXCLUDED_ANCESTOR_SELECTOR)) {
    return false;
  }
  if (
    element.getAttribute("aria-disabled") === "true" ||
    element.getAttribute("aria-readonly") === "true"
  ) {
    return false;
  }
  if (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement) &&
    (element.disabled || element.readOnly)
  ) {
    return false;
  }
  if (
    element instanceof HTMLInputElement &&
    !["text", "search", "url", "number"].includes(element.type)
  ) {
    return false;
  }
  const identity = inputIdentity(element);
  return (
    !PRIVATE_INPUT_PATTERN.test(identity) &&
    !DESTRUCTIVE_INPUT_PATTERN.test(identity)
  );
}

function inputLabel(element: PrismUniversalInputElement): string {
  const aria = compactText(element.getAttribute("aria-label"), 120);
  if (aria) return aria;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labels = Array.from(element.labels ?? [])
      .map((label) => compactText(label.textContent, 120))
      .filter(Boolean);
    if (labels[0]) return labels[0];
  }
  const wrappingLabel = compactText(
    element.closest("label")?.textContent,
    120,
  );
  if (wrappingLabel) return wrappingLabel;
  const placeholder = compactText(element.getAttribute("placeholder"), 120);
  if (placeholder) return placeholder;
  const identifier =
    element.getAttribute("name") || element.id || element.getAttribute("role");
  return identifier ? humanizeIdentifier(identifier) : "field";
}

function describedByText(element: PrismUniversalInputElement): string[] {
  const ids = (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/u)
    .filter(Boolean);
  return ids.flatMap((id) => {
    const described = document.getElementById(id);
    const text = compactText(described?.textContent, 240);
    return text ? [text] : [];
  });
}

export function prismUniversalInputContext(
  element: PrismUniversalInputElement,
): PrismUniversalInputContext {
  const label = inputLabel(element);
  const scope = element.closest(
    '[role="dialog"], [role="alertdialog"], [data-prism-panel], fieldset, form, section, main',
  );
  const heading = compactText(
    scope?.querySelector("legend, h1, h2, h3, [role='heading']")?.textContent,
    180,
  );
  const placeholder = compactText(element.getAttribute("placeholder"), 180);
  const parts = [heading, placeholder, ...describedByText(element)]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const declaredMaxLength =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
      ? element.maxLength
      : -1;
  const multiline =
    element instanceof HTMLTextAreaElement ||
    (!(element instanceof HTMLInputElement) && element.isContentEditable);
  return {
    label,
    context: compactText(parts.join(" · "), 800),
    multiline,
    maxLength:
      declaredMaxLength > 0
        ? Math.min(4_000, declaredMaxLength)
        : multiline
          ? 4_000
          : 1_000,
  };
}

export function readPrismUniversalInputValue(
  element: PrismUniversalInputElement,
): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.value;
  }
  return element.innerText || element.textContent || "";
}

function dispatchReplacementInput(element: HTMLElement, value: string): void {
  try {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: value,
        inputType: "insertReplacementText",
      }),
    );
  } catch {
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
}

export function writePrismUniversalInputValue(
  element: PrismUniversalInputElement,
  value: string,
): void {
  if (element instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  } else if (element instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  } else {
    element.textContent = value;
  }
  dispatchReplacementInput(element, value);
}

interface InstalledInputTarget {
  id: string;
  unregister: () => void;
}

let universalInputSequence = 0;

export function installPrismUniversalInputTargets(options: {
  root?: Document;
  generate: (request: PrismUniversalInputCandidateRequest) => Promise<string>;
}): () => void {
  const root = options.root ?? document;
  const installed = new Map<PrismUniversalInputElement, InstalledInputTarget>();
  let frame = 0;

  const remove = (element: PrismUniversalInputElement): void => {
    const current = installed.get(element);
    if (!current) return;
    current.unregister();
    installed.delete(element);
    const ownedAttribute = element.dataset.prismRefractId === current.id;
    if (ownedAttribute) {
      delete element.dataset.prismRefractId;
    }
    delete element.dataset.prismContextualInput;
  };

  const add = (element: PrismUniversalInputElement): void => {
    if (installed.has(element) || !prismUniversalInputIsEligible(element)) {
      return;
    }
    if (element.hasAttribute("data-prism-refract-id")) return;
    const id = `prism-contextual-input-${++universalInputSequence}`;
    const target: PrismRefractFieldTarget = {
      id,
      kind: "field",
      get label() {
        return prismUniversalInputContext(element).label;
      },
      disabled: () => !prismUniversalInputIsEligible(element),
      read: () => readPrismUniversalInputValue(element),
      preview: (value) => writePrismUniversalInputValue(element, value),
      accept: (value) => {
        writePrismUniversalInputValue(element, value);
        element.dispatchEvent(
          new Event("change", { bubbles: true, composed: true }),
        );
      },
      generate: ({ currentValue, rejectedValues, signal }) =>
        options.generate({
          field: prismUniversalInputContext(element),
          currentValue,
          rejectedValues,
          signal,
          element,
        }),
    };
    const unregister = registerPrismRefractTarget(id, {
      descriptor: () => target,
      element: () => element,
    });
    installed.set(element, { id, unregister });
    element.dataset.prismRefractId = id;
    element.dataset.prismContextualInput = "true";
  };

  const scan = (): void => {
    for (const element of installed.keys()) {
      const current = installed.get(element);
      if (
        !current ||
        !prismUniversalInputIsEligible(element) ||
        element.dataset.prismRefractId !== current.id
      ) {
        remove(element);
      }
    }
    for (const candidate of root.querySelectorAll(PRISM_UNIVERSAL_INPUT_SELECTOR)) {
      if (prismUniversalInputElement(candidate)) add(candidate);
    }
  };
  const scheduleScan = (): void => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      scan();
    });
  };
  const observer = new MutationObserver(scheduleScan);
  observer.observe(root.body, {
    attributes: true,
    attributeFilter: [
      "aria-disabled",
      "aria-label",
      "aria-readonly",
      "autocomplete",
      "contenteditable",
      "data-prism-refract-id",
      "data-prism-refract-ignore",
      "disabled",
      "hidden",
      "id",
      "name",
      "placeholder",
      "readonly",
      "type",
    ],
    childList: true,
    subtree: true,
  });
  root.addEventListener("focusin", scheduleScan, true);
  scan();
  return () => {
    if (frame !== 0) window.cancelAnimationFrame(frame);
    observer.disconnect();
    root.removeEventListener("focusin", scheduleScan, true);
    for (const element of [...installed.keys()]) remove(element);
  };
}
