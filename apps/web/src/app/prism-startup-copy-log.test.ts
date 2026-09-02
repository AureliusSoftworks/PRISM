import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";

const splash = readFileSync(
  new URL("../../../desktop/webview/index.html", import.meta.url),
  "utf8",
);

class ElementStub {
  children: ElementStub[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, () => unknown>();
  dataset: Record<string, string> = {};
  style: Record<string, unknown> = { setProperty() {} };
  className = "";
  textContent = "";
  value = "";
  scrollTop = 0;
  scrollHeight = 0;
  clientHeight = 0;
  parent: ElementStub | undefined;
  selected = false;

  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(name: string, callback: () => unknown) {
    this.listeners.set(name, callback);
  }
  appendChild(child: ElementStub) {
    child.parent = this;
    this.children.push(child);
  }
  querySelectorAll(selector: string): ElementStub[] {
    return this.children.flatMap((child) => [
      ...(selector === `.${child.className}` ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0]; }
  select() { this.selected = true; }
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
    this.parent = undefined;
  }
}

function bootSplash(options: {
  writeText?: (text: string) => Promise<void>;
  execCommand?: () => boolean;
} = {}) {
  const elements = new Map(
    ["lines", "copy-log", "copy-log-status", "label", "startup-optics",
      "startup-failure-help", "svc-api", "svc-web", "svc-qdrant"]
      .map((id) => [id, new ElementStub()] as const),
  );
  const button = elements.get("copy-log")!;
  const status = elements.get("copy-log-status")!;
  const body = new ElementStub();
  const timers = new Map<number, () => void>();
  const intervals = new Map<number, () => void>();
  let now = 0;
  const fallbackCopies: string[] = [];
  const events = new Map<string, (event: unknown) => void>();
  const document = {
    documentElement: new ElementStub(),
    body,
    getElementById: (id: string) => elements.get(id),
    createElement(tag: string) {
      assert.ok(["div", "span", "textarea"].includes(tag));
      return new ElementStub();
    },
    addEventListener(name: string, callback: () => void) {
      if (name === "DOMContentLoaded") callback();
    },
    execCommand(command: string) {
      assert.equal(command, "copy");
      const textarea = body.children[0]!;
      assert.equal(textarea.selected, true);
      assert.equal(textarea.getAttribute("readonly"), "");
      fallbackCopies.push(textarea.value);
      return options.execCommand?.() ?? true;
    },
  };
  const context = {
    Date: { now: () => now },
    document,
    navigator: {
      clipboard: options.writeText ? { writeText: options.writeText } : undefined,
    },
    window: {
      __TAURI__: { event: {
        listen(name: string, callback: (event: unknown) => void) {
          events.set(name, callback);
        },
      } },
      setInterval(callback: () => void) {
        const id = intervals.size + 1;
        intervals.set(id, callback);
        return id;
      },
      clearInterval(id: number) { intervals.delete(id); },
      setTimeout(callback: () => void, delay: number) {
        assert.equal(delay, 1600);
        const id = timers.size + 1;
        timers.set(id, callback);
        return id;
      },
      clearTimeout(id: number) { timers.delete(id); },
    },
  };
  // Run the shipped scripts, including the actual DOM click registration.
  for (const [, script] of splash.matchAll(/<script>([\s\S]*?)<\/script>/gu)) {
    runInNewContext(script!, context);
  }
  events.get("prism-log")!({ payload: { source: "api", line: "Local API ready." } });
  // Unrelated DOM content must never enter the displayed-trace export.
  const unrelated = new ElementStub();
  unrelated.textContent = "Unrelated page content";
  elements.get("lines")!.appendChild(unrelated);

  return {
    button, status, body, timers, intervals, fallbackCopies, elements,
    root: document.documentElement,
    advance(milliseconds: number) {
      now += milliseconds;
      for (const callback of intervals.values()) callback();
    },
    emit(name: string, payload: unknown) {
      events.get(name)!({ payload });
    },
    async click() {
      const click = button.listeners.get("click");
      assert.ok(click, "the rendered button must register its copy handler");
      await click();
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  };
}

const displayedTrace = "prism: Boot log ready...\napi: Local API ready...";

describe("native startup Copy log", () => {
  it("opts the button into pointer hit testing without enabling the console overlay", () => {
    const style = splash.match(/<style>([\s\S]*?)<\/style>/u)![1]!;
    const rule = (selector: string) => {
      const start = style.indexOf(`${selector} {`);
      assert.notEqual(start, -1);
      return style.slice(start, style.indexOf("}", start));
    };
    const pointerEvents = (selector: string) =>
      rule(selector).match(/\bpointer-events:\s*([^;]+);/u)?.[1];
    assert.equal(pointerEvents(".console"), "none");
    // pointer-events is inherited through the header; the button must override it.
    assert.equal(pointerEvents(".console-copy"), "auto");
    assert.equal(pointerEvents(".console-header"), undefined);
    assert.equal(pointerEvents(".focus-mask"), "none");
    assert.equal(pointerEvents(".optics"), "none");
  });

  it("copies exactly the displayed rows and announces success, then resets the button", async () => {
    const copies: string[] = [];
    const ui = bootSplash({ writeText: async (text) => { copies.push(text); } });
    await ui.click();
    assert.deepEqual(copies, [displayedTrace]);
    assert.deepEqual(ui.fallbackCopies, []);
    assert.equal(ui.button.textContent, "Copied");
    assert.equal(ui.button.getAttribute("aria-label"), "Startup trace copied");
    assert.equal(ui.status.textContent, "Startup trace copied");
    assert.equal(ui.timers.size, 1);
    for (const callback of ui.timers.values()) callback();
    assert.equal(ui.button.textContent, "Copy log");
    assert.equal(ui.button.getAttribute("aria-label"), "Copy displayed startup trace");
  });

  for (const mode of ["absent", "rejected", "throws"] as const) {
    it(`uses the selected-text fallback for clipboard write: ${mode}`, async () => {
      const ui = bootSplash({
        writeText: mode === "absent" ? undefined : () => {
          if (mode === "throws") throw new Error("clipboard unavailable");
          return Promise.reject(new Error("clipboard denied"));
        },
      });
      await ui.click();
      assert.deepEqual(ui.fallbackCopies, [displayedTrace]);
      assert.equal(ui.button.textContent, "Copied");
      assert.equal(ui.body.children.length, 0);
    });
  }

  it("runs the fallback before yielding when the clipboard API is unavailable", async () => {
    const ui = bootSplash();
    const completed = ui.click();
    // Awaiting first would hide a regression back to Promise.then(fallback).
    assert.deepEqual(ui.fallbackCopies, [displayedTrace]);
    assert.equal(ui.body.children.length, 0);
    await completed;
  });

  for (const mode of ["returns false", "throws"] as const) {
    it(`announces failure and removes its textarea when fallback ${mode}`, async () => {
      const ui = bootSplash({
        writeText: async () => { throw new Error("clipboard denied"); },
        execCommand: () => {
          if (mode === "throws") throw new Error("copy unavailable");
          return false;
        },
      });
      await ui.click();
      assert.deepEqual(ui.fallbackCopies, [displayedTrace]);
      assert.equal(ui.button.textContent, "Unable to copy");
      assert.equal(ui.button.getAttribute("aria-label"), "Unable to copy startup trace");
      assert.equal(ui.status.textContent, "Unable to copy startup trace");
      assert.equal(ui.body.children.length, 0);
    });
  }
});

describe("native startup failure", () => {
  it("stops ambient output immediately, but retains diagnostics and Copy log", async () => {
    const ui = bootSplash();
    ui.advance(3200);
    assert.equal(ui.elements.get("lines")!.children.filter(
      (line) => line.dataset.kind === "flavor",
    ).length, 1);

    ui.emit("prism-status", { service: "api", state: "error" });
    assert.equal(ui.root.dataset.prismStartupState, "failed");
    assert.equal(ui.intervals.size, 0);
    assert.equal(ui.elements.get("label")!.textContent, "Prism couldn’t start.");
    assert.match(ui.elements.get("startup-failure-help")!.textContent, /API failed/u);
    assert.match(ui.elements.get("startup-optics")!.getAttribute("aria-valuetext")!, /failed/u);

    const linesAfterFailure = ui.elements.get("lines")!.children.length;
    ui.advance(60000);
    assert.equal(ui.elements.get("lines")!.children.length, linesAfterFailure);
    ui.emit("prism-log", { source: "prism", line: "API exited after 2.0s: exit status: 1" });
    await ui.click();
    assert.match(ui.fallbackCopies[0]!, /API exited after 2.0s: exit status: 1/u);
    assert.match(ui.fallbackCopies[0]!, /API failed/u);
    assert.equal(ui.button.textContent, "Copied");
  });

  it("latches the first failure without replaying errors or accepting late progress", () => {
    const ui = bootSplash();
    ui.emit("prism-status", { service: "api", state: "preparing" });
    ui.emit("prism-status", { service: "api", state: "error" });
    const progress = ui.elements.get("startup-optics")!.getAttribute("aria-valuenow");
    const lines = ui.elements.get("lines")!.children.length;
    for (const service of ["api", "web"]) {
      ui.emit("prism-status", { service, state: "error" });
      ui.emit("prism-status", { service, state: "running" });
      ui.emit("prism-status", { service, state: "ready" });
    }
    assert.equal(ui.elements.get("label")!.textContent, "Prism couldn’t start.");
    assert.equal(ui.elements.get("svc-api")!.dataset.state, "error");
    assert.equal(ui.elements.get("svc-web")!.dataset.state, "error");
    assert.equal(ui.elements.get("startup-optics")!.getAttribute("aria-valuenow"), progress);
    assert.equal(ui.elements.get("lines")!.children.length, lines);
  });

  for (const line of [
    "Startup failed. Check the service log.",
    "API readiness failed.",
    "Web readiness failed.",
    "The local web address was invalid.",
  ]) {
    it(`also stops for the native terminal log: ${line}`, () => {
      const ui = bootSplash();
      ui.emit("prism-log", { source: "prism", line });
      assert.equal(ui.root.dataset.prismStartupState, "failed");
      assert.equal(ui.intervals.size, 0);
    });
  }

  it("does not treat ordinary diagnostic text as a terminal failure", () => {
    const ui = bootSplash();
    ui.emit("prism-log", { source: "api", line: "A recoverable lookup failed; retrying." });
    ui.emit("prism-status", { service: "api", state: "preparing" });
    assert.notEqual(ui.root.dataset.prismStartupState, "failed");
    assert.equal(ui.elements.get("label")!.textContent, "Securing your local library…");
    assert.equal(ui.intervals.size, 1);
    ui.advance(3200);
    assert.equal(ui.elements.get("lines")!.children.at(-1)!.dataset.kind, "flavor");
  });
});
