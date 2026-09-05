import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "page.module.css"), "utf8");
const page = readFileSync(join(here, "page.tsx"), "utf8");

/**
 * Review f1e340d8: every control in the Coffee workspace stopped responding
 * while the main thread sat idle at 33 FPS and Table Talk still scrolled.
 * The mode-switch scrim renders at `scope="workspace"` — covering the topic
 * bar, stage, and composer but not the right panel — and its transparent
 * phases still captured pointer events, so a scrim parked mid-transition ate
 * every click without ever being visible.
 */
describe("view switch overlay cannot silently eat input", () => {
  const phaseRule = (phase: string): string => {
    const marker = `.viewSwitchOverlay[data-phase="${phase}"] {`;
    const start = css.indexOf(marker);
    assert.notEqual(start, -1, `missing rule for phase ${phase}`);
    const end = css.indexOf("}", start);
    return css.slice(start, end);
  };

  it("never captures pointer events in a phase rendered at opacity 0", () => {
    for (const phase of ["entering", "fading"]) {
      const rule = phaseRule(phase);
      assert.match(rule, /opacity:\s*0\s*;/u);
      assert.match(
        rule,
        /pointer-events:\s*none\s*;/u,
        `phase ${phase} is invisible and must not capture input`,
      );
    }
  });

  it("still blocks input while the scrim is actually visible", () => {
    const rule = phaseRule("visible");
    assert.match(rule, /opacity:\s*1\s*;/u);
    assert.match(rule, /pointer-events:\s*auto\s*;/u);
  });

  it("advances out of `entering` even when no animation frame is served", () => {
    // A backgrounded window runs no rAF at all, and the shared timer-clearing
    // helper can cancel the pending frame from an effect cleanup.
    assert.match(page, /VIEW_SWITCH_OVERLAY_ENTER_FAILSAFE_MS\s*=\s*\d+/u);
    assert.match(
      page,
      /viewSwitchOverlayEnterFailsafeRef\.current = setTimeout\([\s\S]{0,400}phase === "entering" \? "visible" : phase/u,
    );
  });

  it("force-hides the scrim once its absolute lifetime elapses", () => {
    assert.match(page, /VIEW_SWITCH_OVERLAY_MAX_LIFETIME_MS\s*=\s*\d+/u);
    assert.match(
      page,
      /viewSwitchOverlayLifetimeTimerRef\.current = setTimeout\([\s\S]{0,320}setViewSwitchOverlayPhase\("hidden"\)/u,
    );
  });
});

/**
 * `inert` blocks clicks and focus but never blocks scrolling, so a latched
 * background produces the same signature: dead buttons, live scroll.
 */
describe("prism-applied inert is released by its owner", () => {
  it("tracks its own holds instead of inferring them from the DOM", () => {
    assert.match(page, /function applyPrismInert\(node: HTMLElement\): void/u);
    assert.match(page, /function releasePrismInert\(node: HTMLElement\): void/u);
    assert.match(page, /dataset\.prismInertForeign/u);
  });

  it("no longer decides ownership from a pre-existing inert attribute", () => {
    assert.equal(
      page.includes('inert: node.hasAttribute("inert")'),
      false,
      "ownership inferred this way latches when two panels overlap",
    );
    assert.equal(page.includes('if (!inert) node.removeAttribute("inert")'), false);
  });
});
