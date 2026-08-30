import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  randomPrismSteppedValue,
  resolvePrismRefractTargetForElement,
} from "./prismRefract.ts";

class FakeHTMLElement extends EventTarget {
  readonly dataset: Record<string, string | undefined> = {};
  readonly attributes = new Map<string, string>();
  readonly events: string[] = [];
  readonly children: FakeHTMLElement[] = [];
  ownerDocument!: FakeDocument;
  parentElement: FakeHTMLElement | null = null;
  isConnected = true;
  isContentEditable = false;
  id = "";
  innerText = "";
  textContent = "";
  tagName = "DIV";

  getAttribute(name: string): string | null {
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
      return this.dataset[key] ?? null;
    }
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  matches(selector: string): boolean {
    const tag = this.tagName.toLowerCase();
    if (selector.includes(tag) && ["input", "textarea", "select", "fieldset"].includes(tag)) {
      return true;
    }
    const role = this.getAttribute("role");
    if (role && selector.includes(`[role="${role}"]`)) return true;
    if (role && selector.includes(`[role='${role}']`)) return true;
    if (this.dataset.prismRefractControl && selector.includes("data-prism-refract-control")) {
      return true;
    }
    if (this.dataset.prismRefractOption && selector.includes("data-prism-refract-option")) {
      return true;
    }
    return this.isContentEditable && selector.includes("contenteditable");
  }

  closest<T extends Element = Element>(selector: string): T | null {
    if (
      (selector.includes('[aria-disabled="true"]') &&
        this.getAttribute("aria-disabled") === "true") ||
      (selector.includes("fieldset[disabled]") &&
        this.tagName === "FIELDSET" &&
        (this as unknown as FakeFieldSet).disabled) ||
      (selector.includes('[data-prism-refract-ignore="true"]') &&
        this.dataset.prismRefractIgnore === "true") ||
      (selector === "label" && this.tagName === "LABEL") ||
      this.matches(selector)
    ) {
      return this as unknown as T;
    }
    return this.parentElement?.closest<T>(selector) ?? null;
  }

  querySelectorAll<T extends Element = Element>(selector: string): T[] {
    return this.children.filter((child) => child.matches(selector)) as unknown as T[];
  }

  querySelector<T extends Element = Element>(selector: string): T | null {
    return (this.querySelectorAll<T>(selector)[0] ?? null) as T | null;
  }

  override dispatchEvent(event: Event): boolean {
    this.events.push(event.type);
    return super.dispatchEvent(event);
  }

  click(): void {
    this.dispatchEvent(new Event("click", { bubbles: true }));
  }
}

class FakeInput extends FakeHTMLElement {
  private storedValue = "";
  private storedChecked = false;
  type = "text";
  name = "";
  min = "";
  max = "";
  step = "";
  disabled = false;
  readOnly = false;
  maxLength = -1;
  labels: FakeHTMLElement[] = [];
  form: FakeHTMLElement | null = null;

  constructor() {
    super();
    this.tagName = "INPUT";
  }

  get value(): string {
    return this.storedValue;
  }

  set value(value: string) {
    this.storedValue = value;
  }

  get checked(): boolean {
    return this.storedChecked;
  }

  set checked(value: boolean) {
    this.storedChecked = value;
  }

  cloneNode(): FakeInput {
    const clone = new FakeInput();
    clone.type = this.type;
    clone.min = this.min;
    clone.max = this.max;
    clone.step = this.step;
    return clone;
  }

  get valueAsNumber(): number {
    return Number(this.value);
  }

  set valueAsNumber(value: number) {
    this.value = String(value);
  }
}

class FakeTextArea extends FakeHTMLElement {
  private storedValue = "";
  disabled = false;
  readOnly = false;
  maxLength = -1;
  labels: FakeHTMLElement[] = [];

  constructor() {
    super();
    this.tagName = "TEXTAREA";
  }

  get value(): string {
    return this.storedValue;
  }

  set value(value: string) {
    this.storedValue = value;
  }
}

class FakeOption extends FakeHTMLElement {
  value: string;
  label: string;
  selected = false;
  disabled = false;

  constructor(value: string) {
    super();
    this.tagName = "OPTION";
    this.value = value;
    this.label = value.toUpperCase();
    this.textContent = this.label;
  }
}

class FakeSelect extends FakeHTMLElement {
  multiple = false;
  disabled = false;
  readOnly = false;
  labels: FakeHTMLElement[] = [];
  options: FakeOption[] = [];

  constructor() {
    super();
    this.tagName = "SELECT";
  }

  get selectedOptions(): FakeOption[] {
    return this.options.filter((option) => option.selected);
  }

  get value(): string {
    return this.selectedOptions[0]?.value ?? "";
  }
}

class FakeButton extends FakeHTMLElement {
  disabled = false;
}

class FakeFieldSet extends FakeHTMLElement {
  disabled = false;

  constructor() {
    super();
    this.tagName = "FIELDSET";
  }
}

class FakeDocument {
  nodes: FakeHTMLElement[] = [];

  querySelectorAll<T extends Element = Element>(selector: string): T[] {
    return this.nodes.filter((node) => node.matches(selector)) as unknown as T[];
  }

  getElementById(id: string): FakeHTMLElement | null {
    return this.nodes.find((node) => node.id === id) ?? null;
  }
}

Object.assign(globalThis, {
  Element: FakeHTMLElement,
  HTMLElement: FakeHTMLElement,
  HTMLInputElement: FakeInput,
  HTMLTextAreaElement: FakeTextArea,
  HTMLSelectElement: FakeSelect,
  HTMLOptionElement: FakeOption,
  HTMLButtonElement: FakeButton,
  HTMLFieldSetElement: FakeFieldSet,
});

const source = readFileSync(
  new URL("./prismUniversalInputRefract.ts", import.meta.url),
  "utf8",
);
const registrySource = readFileSync(
  new URL("./prismRefract.ts", import.meta.url),
  "utf8",
);
const companionSource = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);

describe("global Refract input capabilities", () => {
  it("chooses bounded stepped values inclusively and rejects unsafe bounds", () => {
    assert.equal(
      randomPrismSteppedValue({ min: 2, max: 10, step: 2, random: () => 0 }),
      2,
    );
    assert.equal(
      randomPrismSteppedValue({
        min: 2,
        max: 10,
        step: 2,
        random: () => 0.999,
      }),
      10,
    );
    assert.equal(
      randomPrismSteppedValue({ min: 10, max: 2, step: 1 }),
      null,
    );
    assert.equal(
      randomPrismSteppedValue({ min: 0, max: 10, step: 0 }),
      null,
    );
  });

  it("resolves native text and contenteditable surfaces through contextual generation", async () => {
    const { installPrismUniversalInputTargets } = await import(
      "./prismUniversalInputRefract.ts"
    );
    const document = new FakeDocument();
    const textInput = new FakeInput();
    textInput.ownerDocument = document;
    textInput.id = "title";
    textInput.value = "Original title";
    document.nodes = [textInput];
    let receivedDirection = "";
    const cleanup = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      generate: async (request) => {
        receivedDirection = request.direction;
        return "Generated title";
      },
    });
    try {
      const registration = resolvePrismRefractTargetForElement(
        textInput as unknown as Element,
      );
      assert.equal(registration?.target.kind, "field");
      if (registration?.target.kind !== "field") return;
      assert.equal(
        registration.target.steering?.initialDirection(
          registration.target.read(),
        ),
        "Make this more creative",
      );
      const generated = await registration.target.generate({
        currentValue: "Original title",
        rejectedValues: [],
        direction: "Make this more playful",
        signal: new AbortController().signal,
      });
      registration.target.preview(generated);
      await registration.target.accept(generated);
      assert.equal(textInput.value, "Generated title");
      assert.equal(receivedDirection, "Make this more playful");
      assert.deepEqual(textInput.events, ["input", "input", "change"]);
    } finally {
      cleanup();
    }

    const editor = new FakeHTMLElement();
    editor.ownerDocument = document;
    editor.isContentEditable = true;
    editor.attributes.set("contenteditable", "true");
    document.nodes = [editor];
    const cleanupEditor = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      generate: async () => "Editor prose",
    });
    try {
      const registration = resolvePrismRefractTargetForElement(
        editor as unknown as Element,
      );
      assert.equal(registration?.target.kind, "field");
      if (registration?.target.kind === "field") {
        assert.equal(
          registration.target.steering?.initialDirection(
            registration.target.read(),
          ),
          "",
        );
        registration.target.preview("Editor prose");
        assert.equal(editor.textContent, "Editor prose");
        assert.deepEqual(editor.events, ["input"]);
      }
    } finally {
      cleanupEditor();
    }
  });

  it("applies exactly one native multi-select and checkbox-group choice with events", async () => {
    const { installPrismUniversalInputTargets } = await import(
      "./prismUniversalInputRefract.ts"
    );
    const document = new FakeDocument();
    const select = new FakeSelect();
    select.ownerDocument = document;
    select.multiple = true;
    select.options = [
      new FakeOption("same"),
      new FakeOption("same"),
      new FakeOption("same"),
    ];
    for (const option of select.options) option.ownerDocument = document;
    select.options[0]!.selected = true;
    select.options[1]!.selected = true;
    document.nodes = [select];
    const cleanup = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      generate: async () => {
        throw new Error("choices must stay local");
      },
    });
    try {
      const registration = resolvePrismRefractTargetForElement(
        select as unknown as Element,
      );
      assert.equal(registration?.target.kind, "choice");
      if (registration?.target.kind !== "choice") return;
      const choice = registration.target.choices()[2]!;
      registration.target.preview(choice.value);
      assert.equal(select.selectedOptions.length, 1);
      assert.equal(select.options[2]!.selected, true);
      assert.deepEqual(select.events, ["input", "change"]);
    } finally {
      cleanup();
    }

    const first = new FakeInput();
    const second = new FakeInput();
    for (const checkbox of [first, second]) {
      checkbox.ownerDocument = document;
      checkbox.type = "checkbox";
      checkbox.name = "cast";
    }
    first.value = "on";
    first.checked = true;
    second.value = "on";
    document.nodes = [first, second];
    const cleanupCheckboxes = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      generate: async () => "unused",
    });
    try {
      const registration = resolvePrismRefractTargetForElement(
        first as unknown as Element,
      );
      assert.equal(registration?.target.kind, "choice");
      if (registration?.target.kind === "choice") {
        registration.target.preview(registration.target.choices()[1]!.value);
        assert.equal([first, second].filter((item) => item.checked).length, 1);
        assert.equal(second.checked, true);
        assert.deepEqual(first.events, ["input", "change"]);
        assert.deepEqual(second.events, ["input", "change"]);
      }
    } finally {
      cleanupCheckboxes();
    }
  });

  it("treats an editable combobox as prose when its popup has no mounted options", async () => {
    const { installPrismUniversalInputTargets } = await import(
      "./prismUniversalInputRefract.ts"
    );
    const document = new FakeDocument();
    const combobox = new FakeInput();
    combobox.ownerDocument = document;
    combobox.setAttribute("role", "combobox");
    combobox.setAttribute("aria-expanded", "false");
    document.nodes = [combobox];
    let generationCalls = 0;
    const cleanup = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      generate: async () => {
        generationCalls += 1;
        return "contextual search";
      },
    });
    try {
      const registration = resolvePrismRefractTargetForElement(
        combobox as unknown as Element,
      );
      assert.equal(registration?.target.kind, "field");
      if (registration?.target.kind === "field") {
        const value = await registration.target.generate({
          currentValue: "",
          rejectedValues: [],
          signal: new AbortController().signal,
        });
        registration.target.preview(value);
        assert.equal(combobox.value, "contextual search");
      }
      assert.equal(generationCalls, 1);
    } finally {
      cleanup();
    }
  });

  it("resolves numeric, single-select, radio, and boolean controls locally", async () => {
    const { installPrismUniversalInputTargets } = await import(
      "./prismUniversalInputRefract.ts"
    );
    const document = new FakeDocument();
    const number = new FakeInput();
    number.ownerDocument = document;
    number.type = "number";
    number.min = "2";
    number.max = "10";
    number.step = "2";
    const select = new FakeSelect();
    select.ownerDocument = document;
    select.options = [new FakeOption("a"), new FakeOption("b")];
    for (const option of select.options) option.ownerDocument = document;
    select.options[0]!.selected = true;
    const radioA = new FakeInput();
    const radioB = new FakeInput();
    for (const radio of [radioA, radioB]) {
      radio.ownerDocument = document;
      radio.type = "radio";
      radio.name = "tone";
    }
    radioA.value = "quiet";
    radioA.checked = true;
    radioB.value = "bold";
    const toggle = new FakeInput();
    toggle.ownerDocument = document;
    toggle.type = "checkbox";
    document.nodes = [number, select, radioA, radioB, toggle];
    let generationCalls = 0;
    const cleanup = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      random: () => 0.999,
      generate: async () => {
        generationCalls += 1;
        return "unused";
      },
    });
    try {
      const numberTarget = resolvePrismRefractTargetForElement(
        number as unknown as Element,
      )?.target;
      assert.equal(numberTarget?.kind, "choice");
      if (numberTarget?.kind === "choice") {
        numberTarget.preview(numberTarget.choices()[0]!.value);
        assert.equal(number.value, "10");
        assert.deepEqual(number.events, ["input", "change"]);
      }

      const selectTarget = resolvePrismRefractTargetForElement(
        select as unknown as Element,
      )?.target;
      assert.equal(selectTarget?.kind, "choice");
      if (selectTarget?.kind === "choice") {
        selectTarget.preview(selectTarget.choices()[1]!.value);
        assert.equal(select.value, "b");
      }

      const radioTarget = resolvePrismRefractTargetForElement(
        radioA as unknown as Element,
      )?.target;
      assert.equal(radioTarget?.kind, "choice");
      if (radioTarget?.kind === "choice") {
        radioTarget.preview(radioTarget.choices()[1]!.value);
        assert.equal(radioA.checked, false);
        assert.equal(radioB.checked, true);
      }

      const toggleTarget = resolvePrismRefractTargetForElement(
        toggle as unknown as Element,
      )?.target;
      assert.equal(toggleTarget?.kind, "choice");
      if (toggleTarget?.kind === "choice") {
        toggleTarget.preview("true");
        assert.equal(toggle.checked, true);
      }
      assert.equal(generationCalls, 0);
    } finally {
      cleanup();
    }
  });

  it("drives app-owned multi-choice controls by accessible click semantics", async () => {
    const { installPrismUniversalInputTargets } = await import(
      "./prismUniversalInputRefract.ts"
    );
    const document = new FakeDocument();
    const group = new FakeHTMLElement();
    group.ownerDocument = document;
    group.dataset.prismRefractControl = "multi-choice";
    const first = new FakeButton();
    const second = new FakeButton();
    for (const [option, value] of [
      [first, "first"],
      [second, "second"],
    ] as const) {
      option.ownerDocument = document;
      option.parentElement = group;
      option.dataset.prismRefractOption = "true";
      option.dataset.prismRefractValue = value;
      option.textContent = value;
      option.setAttribute("aria-selected", value === "first" ? "true" : "false");
      option.addEventListener("click", () => {
        option.setAttribute(
          "aria-selected",
          option.getAttribute("aria-selected") === "true" ? "false" : "true",
        );
      });
      group.children.push(option);
    }
    document.nodes = [group, first, second];
    const cleanup = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      generate: async () => "unused",
    });
    try {
      const registration = resolvePrismRefractTargetForElement(
        second as unknown as Element,
      );
      assert.equal(registration?.target.kind, "choice");
      if (registration?.target.kind === "choice") {
        registration.target.preview(registration.target.choices()[1]!.value);
        assert.equal(first.getAttribute("aria-selected"), "false");
        assert.equal(second.getAttribute("aria-selected"), "true");
        assert.deepEqual(first.events, ["click"]);
        assert.deepEqual(second.events, ["click"]);
      }
    } finally {
      cleanup();
    }
  });

  it("treats a standard ARIA toggle button as a local boolean control", async () => {
    const { installPrismUniversalInputTargets } = await import(
      "./prismUniversalInputRefract.ts"
    );
    const document = new FakeDocument();
    const toggle = new FakeButton();
    toggle.ownerDocument = document;
    toggle.setAttribute("role", "button");
    toggle.setAttribute("aria-pressed", "false");
    toggle.addEventListener("click", () => {
      toggle.setAttribute(
        "aria-pressed",
        toggle.getAttribute("aria-pressed") === "true" ? "false" : "true",
      );
    });
    document.nodes = [toggle];
    const cleanup = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      generate: async () => "unused",
    });
    try {
      const registration = resolvePrismRefractTargetForElement(
        toggle as unknown as Element,
      );
      assert.equal(registration?.target.kind, "choice");
      if (registration?.target.kind === "choice") {
        registration.target.preview("true");
        assert.equal(toggle.getAttribute("aria-pressed"), "true");
        assert.deepEqual(toggle.events, ["click"]);
      }
    } finally {
      cleanup();
    }
  });

  it("refuses password and disabled controls before registration", async () => {
    const { installPrismUniversalInputTargets } = await import(
      "./prismUniversalInputRefract.ts"
    );
    const document = new FakeDocument();
    const excludedTypes = ["password", "file", "hidden"].map((type) => {
      const input = new FakeInput();
      input.ownerDocument = document;
      input.type = type;
      return input;
    });
    const disabled = new FakeInput();
    disabled.ownerDocument = document;
    disabled.disabled = true;
    const readOnly = new FakeInput();
    readOnly.ownerDocument = document;
    readOnly.readOnly = true;
    const ariaDisabled = new FakeInput();
    ariaDisabled.ownerDocument = document;
    ariaDisabled.setAttribute("aria-disabled", "true");
    const destructive = new FakeInput();
    destructive.ownerDocument = document;
    destructive.id = "confirm-delete";
    document.nodes = [
      ...excludedTypes,
      disabled,
      readOnly,
      ariaDisabled,
      destructive,
    ];
    const cleanup = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      generate: async () => "unsafe",
    });
    try {
      for (const input of document.nodes) {
        assert.equal(
          resolvePrismRefractTargetForElement(input as unknown as Element),
          null,
        );
      }
    } finally {
      cleanup();
    }
  });

  it("keeps a self-locked active sheen cancellable while excluding authored read-only fields", async () => {
    const { installPrismUniversalInputTargets } = await import(
      "./prismUniversalInputRefract.ts"
    );
    const document = new FakeDocument();
    const active = new FakeInput();
    active.ownerDocument = document;
    const readonly = new FakeInput();
    readonly.ownerDocument = document;
    readonly.setAttribute("aria-readonly", "true");
    document.nodes = [active, readonly];
    const cleanup = installPrismUniversalInputTargets({
      root: document as unknown as Document,
      generate: async () => "candidate",
    });
    try {
      const registration = resolvePrismRefractTargetForElement(
        active as unknown as Element,
      );
      assert.ok(registration);
      active.dataset.prismRefractState = "generating";
      active.setAttribute("aria-readonly", "true");
      assert.equal(registration?.target.disabled?.(), false);
      assert.equal(
        resolvePrismRefractTargetForElement(readonly as unknown as Element),
        null,
      );
    } finally {
      cleanup();
    }
  });

  it("discovers targets lazily through the shared registry", () => {
    assert.match(registrySource, /registerPrismRefractDomTargetResolver/u);
    assert.match(
      registrySource,
      /resolvePrismRefractTargetForElement\(candidate\)/u,
    );
    assert.match(source, /registerPrismRefractDomTargetResolver\(resolve\)/u);
    assert.match(source, /record\.removedNodes/u);
    assert.doesNotMatch(source, /querySelectorAll\(PRISM_CAPABILITY_CONTROL_SELECTOR/u);
  });

  it("covers native prose, editors, choices, booleans, and bounded controls", () => {
    assert.match(source, /PROSE_INPUT_TYPES/u);
    assert.match(source, /HTMLTextAreaElement/u);
    assert.match(source, /contenteditable="plaintext-only"/u);
    assert.match(source, /role="combobox"/u);
    assert.match(source, /HTMLSelectElement/u);
    assert.match(source, /root\.multiple/u);
    assert.match(source, /type: "radio" \| "checkbox"/u);
    assert.match(source, /nativeBooleanTarget/u);
    assert.match(source, /BOUNDED_INPUT_TYPES/u);
    assert.match(source, /input\.type === "color"/u);
    assert.match(source, /input\.type === "time" \|\| input\.type === "datetime-local"/u);
  });

  it("collapses native and custom multi-choice controls to exactly one option", () => {
    assert.match(
      source,
      /serializedSelection\(\[String\(index\)\]\)/u,
    );
    assert.match(
      source,
      /multi[\s\S]*serializedSelection\(\[String\(index\)\]\)[\s\S]*String\(index\)/u,
    );
    assert.match(
      source,
      /multi \? serializedSelection\(\[value\]\) : value/u,
    );
    assert.match(source, /aria-multiselectable/u);
    assert.match(source, /data-prism-refract-option/u);
  });

  it("uses native React-compatible events and custom-control clicks", () => {
    assert.match(source, /new InputEvent\("input"/u);
    assert.match(source, /new Event\("change"/u);
    assert.match(source, /HTMLInputElement\.prototype[\s\S]*"checked"/u);
    assert.match(source, /desiredOption\.click\(\)/u);
    assert.match(source, /if \(read\(\) !== value\) root\.click\(\)/u);
  });

  it("excludes private, destructive, unavailable, and action-only controls", () => {
    assert.match(source, /PRIVATE_INPUT_PATTERN/u);
    assert.match(source, /DESTRUCTIVE_INPUT_PATTERN/u);
    assert.match(source, /"hidden", "password", "file", "button", "submit"/u);
    assert.match(source, /element\.disabled/u);
    assert.match(source, /element\.readOnly/u);
    assert.match(source, /aria-disabled/u);
    assert.match(source, /aria-readonly/u);
    assert.match(source, /data-live-session-locked/u);
    assert.match(source, /data-replay-active/u);
  });

  it("settles Refract and Wield presentation on blur, removal, and errors", () => {
    assert.match(
      companionSource,
      /restoreOnWindowBlur = \(\): void => releasePrismRefract\(true\)/u,
    );
    assert.match(
      companionSource,
      /currentRegistration\?\.element !== currentSession\.registration\.element[\s\S]*releasePrismRefract\(true\)/u,
    );
    assert.match(
      companionSource,
      /\.finally\(clearIncompleteGeneration\)/u,
    );
    assert.match(
      companionSource,
      /document\.documentElement\.removeAttribute\(PRISM_REFRACT_CURSOR_ATTRIBUTE\)/u,
    );
  });
});
