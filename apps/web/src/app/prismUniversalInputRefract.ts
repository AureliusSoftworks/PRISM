"use client";

import {
  registerPrismRefractDomTargetResolver,
  registerPrismRefractTarget,
  registeredPrismRefractTarget,
  randomPrismSteppedValue,
  type PrismRefractChoice,
  type PrismRefractChoiceTarget,
  type PrismRefractFieldTarget,
  type RegisteredPrismRefractTarget,
} from "./prismRefract.ts";

const PRISM_CAPABILITY_CONTROL_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="checkbox"]',
  '[role="switch"]',
  'button[aria-pressed]',
  '[role="button"][aria-pressed]',
  '[role="radio"]',
  '[role="radiogroup"]',
  '[role="listbox"]',
  "[data-prism-refract-control]",
].join(", ");

const PRISM_EXCLUDED_ANCESTOR_SELECTOR = [
  '[data-prism-refract-ignore="true"]',
  '[data-prism-companion-anchor="true"]',
  '[data-prism-blocking-loader="true"]',
  '[data-prism-model-warmup="true"]',
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
  /(?:confirm.?delete|delete.?confirm|destroy|erase|permanent(?:ly)?.?(?:delete|remove)|type.?delete|wipe)/iu;
const PROSE_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel"]);
const BOUNDED_INPUT_TYPES = new Set([
  "number",
  "range",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
  "color",
]);

export type PrismUniversalInputElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
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

function isAriaDisabled(element: Element): boolean {
  return (
    element.getAttribute("aria-disabled") === "true" ||
    element.closest('[aria-disabled="true"]') !== null
  );
}

function elementIdentity(element: HTMLElement): string {
  const labelText =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? Array.from(element.labels ?? [])
          .map((label) => label.textContent)
          .join(" ")
      : element.closest("label")?.textContent;
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("name"),
    element.id,
    element.getAttribute("autocomplete"),
    element.getAttribute("placeholder"),
    labelText,
    element.getAttribute("data-prism-refract-label"),
    element instanceof HTMLButtonElement ||
    element.matches('[role="option"], [role="radio"], [data-prism-refract-option]')
      ? element.textContent
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function controlIsSafe(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest(PRISM_EXCLUDED_ANCESTOR_SELECTOR)) {
    return false;
  }
  if (
    isAriaDisabled(element) ||
    (element.getAttribute("aria-readonly") === "true" &&
      !element.dataset.prismRefractState) ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return false;
  }
  if (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement) &&
    (element.disabled || ("readOnly" in element && element.readOnly))
  ) {
    return false;
  }
  if (
    (element instanceof HTMLFieldSetElement && element.disabled) ||
    element.closest("fieldset[disabled]")
  ) {
    return false;
  }
  if (
    element instanceof HTMLInputElement &&
    ["hidden", "password", "file", "button", "submit", "reset", "image"].includes(
      element.type,
    )
  ) {
    return false;
  }
  const identity = elementIdentity(element);
  return (
    !PRIVATE_INPUT_PATTERN.test(identity) &&
    !DESTRUCTIVE_INPUT_PATTERN.test(identity)
  );
}

function enabledCustomOption(element: HTMLElement): boolean {
  return (
    controlIsSafe(element) &&
    element.getAttribute("aria-disabled") !== "true" &&
    !(element instanceof HTMLButtonElement && element.disabled)
  );
}

function capabilityControlForElement(element: Element): HTMLElement | null {
  const explicit = element.closest<HTMLElement>("[data-prism-refract-control]");
  if (explicit) return explicit;
  const semanticGroup = element.closest<HTMLElement>(
    '[role="radiogroup"], [role="listbox"]',
  );
  if (semanticGroup) return semanticGroup;
  const control = element.closest<HTMLElement>(PRISM_CAPABILITY_CONTROL_SELECTOR);
  if (control) return control;
  return element.closest("label")?.control ?? null;
}

export function prismUniversalInputElement(
  element: Element,
): element is PrismUniversalInputElement {
  return capabilityControlForElement(element) !== null;
}

export function prismUniversalInputIsEligible(
  element: PrismUniversalInputElement,
): boolean {
  const control = capabilityControlForElement(element);
  return Boolean(control && controlIsSafe(control));
}

function inputLabel(element: HTMLElement): string {
  const explicit = compactText(element.dataset.prismRefractLabel, 120);
  if (explicit) return explicit;
  const aria = compactText(element.getAttribute("aria-label"), 120);
  if (aria) return aria;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    const label = Array.from(element.labels ?? [])
      .map((item) => compactText(item.textContent, 120))
      .find(Boolean);
    if (label) return label;
  }
  const wrappingLabel = compactText(element.closest("label")?.textContent, 120);
  if (wrappingLabel) return wrappingLabel;
  const legend = compactText(element.querySelector(":scope > legend")?.textContent, 120);
  if (legend) return legend;
  const placeholder = compactText(element.getAttribute("placeholder"), 120);
  if (placeholder) return placeholder;
  const identifier =
    element.getAttribute("name") || element.id || element.getAttribute("role");
  return identifier ? humanizeIdentifier(identifier) : "control";
}

function describedByText(element: HTMLElement): string[] {
  const ids = (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/u)
    .filter(Boolean);
  return ids.flatMap((id) => {
    const described = element.ownerDocument.getElementById(id);
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
  const explicitContext = compactText(element.dataset.prismRefractContext, 800);
  const parts = [explicitContext, heading, placeholder, ...describedByText(element)]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const declaredMaxLength =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
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
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
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

function dispatchCommittedChange(element: HTMLElement): void {
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

export function writePrismUniversalInputValue(
  element: PrismUniversalInputElement,
  value: string,
  commit = false,
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
  if (commit) dispatchCommittedChange(element);
}

function setNativeChecked(input: HTMLInputElement, checked: boolean): void {
  if (input.checked === checked) return;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "checked",
  )?.set;
  if (setter) setter.call(input, checked);
  else input.checked = checked;
  dispatchReplacementInput(input, checked ? "true" : "false");
  dispatchCommittedChange(input);
}

function setNativeSelectValue(select: HTMLSelectElement, serialized: string): void {
  const selectedValues = select.multiple
    ? parseSerializedSelection(serialized)
    : [serialized];
  const selected = new Set(selectedValues);
  const options = Array.from(select.options);
  const shouldSelect = (option: HTMLOptionElement, index: number): boolean =>
    (select.multiple
      ? selected.has(String(index))
      : selected.has(option.value)) &&
    !option.disabled &&
    !option.closest("optgroup[disabled]");
  if (options.every((option, index) => option.selected === shouldSelect(option, index))) {
    return;
  }
  for (const [index, option] of options.entries()) {
    option.selected = shouldSelect(option, index);
  }
  dispatchReplacementInput(select, serialized);
  dispatchCommittedChange(select);
}

function serializedSelection(values: readonly string[]): string {
  return JSON.stringify([...values]);
}

function parseSerializedSelection(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function nativeOptions(select: HTMLSelectElement): PrismRefractChoice[] {
  return Array.from(select.options)
    .map((option, index) => ({ option, index }))
    .filter(
      ({ option }) =>
        !option.disabled && !option.closest("optgroup[disabled]"),
    )
    .map(({ option, index }) => ({
      value: select.multiple
        ? serializedSelection([String(index)])
        : option.value,
      label: compactText(option.label || option.textContent, 120) || option.value,
    }));
}

function namedNativeInputs(input: HTMLInputElement): HTMLInputElement[] {
  if (!input.name) return [input];
  const root: ParentNode = input.form ?? input.ownerDocument;
  return Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="${input.type}"]`))
    .filter((item) => item.name === input.name && controlIsSafe(item));
}

function nativeGroupedInputs(
  root: HTMLElement,
  type: "radio" | "checkbox",
): HTMLInputElement[] {
  if (root instanceof HTMLInputElement) return namedNativeInputs(root);
  return Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`))
    .filter(controlIsSafe);
}

function nativeGroupTarget(
  root: HTMLElement,
  type: "radio" | "checkbox",
  id: string,
): PrismRefractChoiceTarget | null {
  const inputs = nativeGroupedInputs(root, type);
  if (inputs.length === 0) return null;
  const multi = type === "checkbox" && inputs.length > 1;
  const apply = (value: string): void => {
    const selected = new Set(multi ? parseSerializedSelection(value) : [value]);
    for (const [index, input] of inputs.entries()) {
      setNativeChecked(input, selected.has(String(index)));
    }
  };
  return {
    id,
    kind: "choice",
    label: inputLabel(root),
    disabled: () => !controlIsSafe(root),
    read: () => {
      const selected = inputs.flatMap((item, index) =>
        item.checked ? [String(index)] : [],
      );
      return multi ? serializedSelection(selected) : selected[0] ?? "";
    },
    preview: apply,
    accept: apply,
    choices: () =>
      inputs.map((input, index) => ({
        value: multi
          ? serializedSelection([String(index)])
          : String(index),
        label: inputLabel(input),
        disabled: !controlIsSafe(input),
      })),
  };
}

function nativeBooleanTarget(
  input: HTMLInputElement,
  id: string,
): PrismRefractChoiceTarget {
  const apply = (value: string): void => setNativeChecked(input, value === "true");
  return {
    id,
    kind: "choice",
    label: inputLabel(input),
    disabled: () => !controlIsSafe(input),
    read: () => String(input.checked),
    preview: apply,
    accept: apply,
    choices: () => [
      { value: "true", label: `Enable ${inputLabel(input)}` },
      { value: "false", label: `Disable ${inputLabel(input)}` },
    ],
  };
}

function boundedNativeCandidate(
  input: HTMLInputElement,
  random: () => number,
): string | null {
  if (input.type === "color") {
    const value = Math.floor(Math.min(0.999999999, Math.max(0, random())) * 0x1000000);
    return `#${value.toString(16).padStart(6, "0")}`;
  }
  const defaultBounds = input.type === "range" ? { min: 0, max: 100 } : null;
  const min = input.min === "" ? defaultBounds?.min : Number(input.min);
  const max = input.max === "" ? defaultBounds?.max : Number(input.max);
  if (input.type === "number" || input.type === "range") {
    if (min == null || max == null) return null;
    const step = input.step === "any" ? 1 : Number(input.step || "1");
    const value = randomPrismSteppedValue({ min, max, step, random });
    return value === null ? null : String(value);
  }
  if (!input.min || !input.max) return null;
  const probe = input.cloneNode() as HTMLInputElement;
  probe.value = input.min;
  const temporalMin = probe.valueAsNumber;
  probe.value = input.max;
  const temporalMax = probe.valueAsNumber;
  const stepUnits = input.step === "any" ? 1 : Number(input.step || "1");
  const temporalStepUnits =
    input.step === "any"
      ? 1
      : Number(
          input.step ||
            (input.type === "time" || input.type === "datetime-local"
              ? "60"
              : "1"),
        );
  const unitMs =
    input.type === "date"
      ? 86_400_000
      : input.type === "week"
        ? 604_800_000
        : input.type === "month"
          ? null
          : 1_000;
  if (input.type === "month") {
    const monthIndex = (value: string): number => {
      const [year, month] = value.split("-").map(Number);
      return year * 12 + month - 1;
    };
    const minMonth = monthIndex(input.min);
    const maxMonth = monthIndex(input.max);
    const selected = randomPrismSteppedValue({
      min: minMonth,
      max: maxMonth,
      step: stepUnits,
      random,
    });
    if (selected === null) return null;
    const year = Math.floor(selected / 12);
    const month = selected % 12 + 1;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  }
  if (unitMs === null) return null;
  const value = randomPrismSteppedValue({
    min: temporalMin,
    max: temporalMax,
    step: temporalStepUnits * unitMs,
    random,
  });
  if (value === null) return null;
  probe.valueAsNumber = value;
  return probe.value || null;
}

function nativeBoundedTarget(
  input: HTMLInputElement,
  id: string,
  random: () => number,
): PrismRefractChoiceTarget | null {
  if (boundedNativeCandidate(input, () => 0) === null) return null;
  const apply = (value: string): void => {
    if (input.value === value) return;
    writePrismUniversalInputValue(input, value, true);
  };
  return {
    id,
    kind: "choice",
    label: inputLabel(input),
    disabled: () => !controlIsSafe(input),
    read: () => input.value,
    preview: apply,
    accept: apply,
    choices: () => {
      const value = boundedNativeCandidate(input, random);
      return value === null ? [] : [{ value, label: value }];
    },
  };
}

function customOptions(root: HTMLElement): HTMLElement[] {
  const controlledId = root.getAttribute("aria-controls") || root.getAttribute("aria-owns");
  const optionRoot = controlledId
    ? root.ownerDocument.getElementById(controlledId) ?? root
    : root;
  return Array.from(
    optionRoot.querySelectorAll<HTMLElement>(
      '[role="option"], [role="radio"], button[aria-pressed], [role="button"][aria-pressed], [data-prism-refract-option]',
    ),
  ).filter(enabledCustomOption);
}

function customOptionValue(option: HTMLElement): string {
  return (
    option.dataset.prismRefractValue ||
    option.getAttribute("value") ||
    option.getAttribute("aria-label") ||
    compactText(option.textContent, 200)
  );
}

function customOptionSelected(option: HTMLElement): boolean {
  return ["aria-selected", "aria-checked", "aria-pressed"].some(
    (attribute) => option.getAttribute(attribute) === "true",
  );
}

function customChoiceTarget(
  root: HTMLElement,
  id: string,
): PrismRefractChoiceTarget | null {
  const options = customOptions(root);
  if (options.length === 0) return null;
  const multi =
    root.dataset.prismRefractControl === "multi-choice" ||
    root.getAttribute("aria-multiselectable") === "true";
  const read = (): string => {
    const selected = customOptions(root)
      .filter(customOptionSelected)
      .map(customOptionValue);
    return multi ? serializedSelection(selected) : selected[0] ?? "";
  };
  const apply = (value: string): void => {
    const desired = new Set(multi ? parseSerializedSelection(value) : [value]);
    const currentOptions = customOptions(root);
    if (multi) {
      for (const option of currentOptions) {
        if (customOptionSelected(option) && !desired.has(customOptionValue(option))) {
          option.click();
        }
      }
    }
    const desiredOption = currentOptions.find((option) =>
      desired.has(customOptionValue(option)),
    );
    if (desiredOption && !customOptionSelected(desiredOption)) desiredOption.click();
  };
  return {
    id,
    kind: "choice",
    label: inputLabel(root),
    disabled: () => !controlIsSafe(root),
    read,
    preview: apply,
    accept: apply,
    choices: () =>
      customOptions(root).map((option) => {
        const value = customOptionValue(option);
        return {
          value: multi ? serializedSelection([value]) : value,
          label: inputLabel(option),
        };
      }),
  };
}

function customBooleanTarget(
  root: HTMLElement,
  id: string,
): PrismRefractChoiceTarget {
  const read = (): string =>
    String(
      root.getAttribute("aria-checked") === "true" ||
        root.getAttribute("aria-pressed") === "true",
    );
  const apply = (value: string): void => {
    if (read() !== value) root.click();
  };
  return {
    id,
    kind: "choice",
    label: inputLabel(root),
    disabled: () => !controlIsSafe(root),
    read,
    preview: apply,
    accept: apply,
    choices: () => [
      { value: "true", label: `Enable ${inputLabel(root)}` },
      { value: "false", label: `Disable ${inputLabel(root)}` },
    ],
  };
}

function proseElement(element: HTMLElement): PrismUniversalInputElement | null {
  if (element instanceof HTMLTextAreaElement) return element;
  if (element instanceof HTMLInputElement && PROSE_INPUT_TYPES.has(element.type)) {
    return element;
  }
  if (
    element.isContentEditable ||
    (["textbox", "searchbox"].includes(element.getAttribute("role") ?? "") &&
      element.getAttribute("contenteditable") !== "false")
  ) {
    return element;
  }
  return null;
}

function targetForControl(input: {
  root: HTMLElement;
  id: string;
  random: () => number;
  generate: (request: PrismUniversalInputCandidateRequest) => Promise<string>;
}): PrismRefractFieldTarget | PrismRefractChoiceTarget | null {
  const { root, id, random } = input;
  if (!controlIsSafe(root)) return null;
  if (root instanceof HTMLSelectElement) {
    const apply = (value: string): void => setNativeSelectValue(root, value);
    return {
      id,
      kind: "choice",
      label: inputLabel(root),
      disabled: () => !controlIsSafe(root),
      read: () =>
        root.multiple
          ? serializedSelection(
              Array.from(root.options).flatMap((option, index) =>
                option.selected ? [String(index)] : [],
              ),
            )
          : root.value,
      preview: apply,
      accept: apply,
      choices: () => nativeOptions(root),
    };
  }
  if (root instanceof HTMLInputElement && root.type === "radio") {
    return nativeGroupTarget(root, "radio", id);
  }
  if (root instanceof HTMLInputElement && root.type === "checkbox") {
    const grouped = nativeGroupedInputs(root, "checkbox");
    return grouped.length > 1
      ? nativeGroupTarget(root, "checkbox", id)
      : nativeBooleanTarget(root, id);
  }
  if (root.matches("fieldset, [role='radiogroup']")) {
    const radioTarget = nativeGroupTarget(root, "radio", id);
    if (radioTarget) return radioTarget;
    const checkboxTarget = nativeGroupTarget(root, "checkbox", id);
    if (checkboxTarget) return checkboxTarget;
  }
  if (root instanceof HTMLInputElement && BOUNDED_INPUT_TYPES.has(root.type)) {
    return nativeBoundedTarget(root, id, random);
  }
  if (
    root.matches('[role="checkbox"], [role="switch"]') ||
    root.matches('button[aria-pressed], [role="button"][aria-pressed]') ||
    root.dataset.prismRefractControl === "boolean"
  ) {
    return customBooleanTarget(root, id);
  }
  if (
    root.matches('[role="combobox"], [role="listbox"], [role="radiogroup"]') ||
    ["single-choice", "multi-choice"].includes(
      root.dataset.prismRefractControl ?? "",
    )
  ) {
    const choiceTarget = customChoiceTarget(root, id);
    if (choiceTarget) return choiceTarget;
    // An editable combobox remains a prose surface while its popup is closed
    // or has no mounted options. Listboxes and radio groups do not.
    if (!root.matches('[role="combobox"]')) return null;
  }
  const prose = proseElement(root);
  if (!prose) return null;
  return {
    id,
    kind: "field",
    get label() {
      return prismUniversalInputContext(prose).label;
    },
    disabled: () => !controlIsSafe(prose),
    read: () => readPrismUniversalInputValue(prose),
    preview: (value) => writePrismUniversalInputValue(prose, value),
    accept: (value) => writePrismUniversalInputValue(prose, value, true),
    generate: ({ currentValue, rejectedValues, signal }) =>
      input.generate({
        field: prismUniversalInputContext(prose),
        currentValue,
        rejectedValues,
        signal,
        element: prose,
      }),
  };
}

interface InstalledInputTarget {
  id: string;
  unregister: () => void;
}

let universalInputSequence = 0;

function universalInputTargetId(element: HTMLElement): string {
  const semanticId = element.id.trim();
  const suffix = ++universalInputSequence;
  return semanticId
    ? `prism-capability-${encodeURIComponent(semanticId)}-${suffix}`
    : `prism-capability-${suffix}`;
}

/**
 * Lazily discovers the control underneath Wield/focus and adapts it into the
 * established target registry. No per-render or whole-document scan occurs.
 */
export function installPrismUniversalInputTargets(options: {
  root?: Document;
  random?: () => number;
  generate: (request: PrismUniversalInputCandidateRequest) => Promise<string>;
}): () => void {
  const rootDocument = options.root ?? document;
  const random = options.random ?? Math.random;
  const installed = new Map<HTMLElement, InstalledInputTarget>();

  const remove = (element: HTMLElement): void => {
    const current = installed.get(element);
    if (!current) return;
    current.unregister();
    installed.delete(element);
    if (element.dataset.prismRefractId === current.id) {
      delete element.dataset.prismRefractId;
    }
    delete element.dataset.prismContextualInput;
    delete element.dataset.prismRefractCapability;
  };

  const resolve = (element: Element): RegisteredPrismRefractTarget | null => {
    if (element.ownerDocument !== rootDocument) return null;
    const control = capabilityControlForElement(element);
    if (!control || !controlIsSafe(control)) return null;
    const current = installed.get(control);
    if (current) {
      const registered = registeredPrismRefractTarget(current.id);
      if (registered) return registered;
      remove(control);
    }
    if (control.hasAttribute("data-prism-refract-id")) return null;
    const id = universalInputTargetId(control);
    const target = targetForControl({
      root: control,
      id,
      random,
      generate: options.generate,
    });
    if (!target) return null;
    const unregister = registerPrismRefractTarget(id, {
      descriptor: () => target,
      element: () => control,
    });
    installed.set(control, { id, unregister });
    control.dataset.prismRefractId = id;
    control.dataset.prismRefractCapability = target.kind;
    if (target.kind === "field") control.dataset.prismContextualInput = "true";
    return { target, element: control };
  };

  const unregisterResolver = registerPrismRefractDomTargetResolver(resolve);
  const removalObserver =
    typeof MutationObserver !== "undefined" && rootDocument.body
      ? new MutationObserver((records) => {
          for (const record of records) {
            for (const removedNode of record.removedNodes) {
              for (const element of [...installed.keys()]) {
                if (
                  removedNode === element ||
                  (removedNode instanceof Element && removedNode.contains(element))
                ) {
                  remove(element);
                }
              }
            }
          }
        })
      : null;
  removalObserver?.observe(rootDocument.body, { childList: true, subtree: true });
  return () => {
    removalObserver?.disconnect();
    unregisterResolver();
    for (const element of [...installed.keys()]) remove(element);
  };
}
