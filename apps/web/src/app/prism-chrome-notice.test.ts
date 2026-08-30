import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const componentSource = readFileSync(
  new URL("./PrismChromeNotice.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./PrismChromeNotice.module.css", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const whodunnitSource = readFileSync(
  new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
  "utf8",
);

describe("shared PRISM chrome notices", () => {
  it("keeps transient feedback compact, chrome-bound, and one-line", () => {
    assert.match(
      css,
      /\.viewport\s*\{[\s\S]{0,240}top:\s*calc\(var\(--app-navbar-height, 66px\) - 1px\)/u,
    );
    assert.match(css, /width:\s*min\(620px, calc\(100vw - 24px\)\)/u);
    assert.match(css, /\.notice\s*\{[\s\S]{0,520}min-height:\s*38px/u);
    assert.match(css, /border-radius:\s*0 0 11px 11px/u);
    assert.match(
      css,
      /\.message\s*\{[\s\S]{0,220}text-overflow:\s*ellipsis;[\s\S]{0,80}white-space:\s*nowrap/u,
    );
    assert.match(
      css,
      /\.viewport\[data-placement="inline"\]\s*\{[\s\S]{0,100}position:\s*relative/u,
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,100}animation:\s*none/u,
    );
  });

  it("owns shared severity, accessibility, action, and dismissal semantics", () => {
    assert.match(componentSource, /data-prism-chrome-notice="true"/u);
    assert.match(componentSource, /tone === "error" \? "alert" : "status"/u);
    assert.match(
      componentSource,
      /aria-live=\{resolvedRole === "alert" \? "assertive" : "polite"\}/u,
    );
    assert.match(componentSource, /aria-atomic="true"/u);
    assert.match(componentSource, /action\.ariaLabel \?\? action\.label/u);
    assert.match(componentSource, /dismissLabel = "Dismiss notification"/u);
  });

  it("is the shared source for global, Signal, Debate, and Whodunnit feedback", () => {
    for (const source of [pageSource, signalSource, debateSource, whodunnitSource]) {
      assert.match(source, /PrismChromeNotice/u);
    }
    assert.match(pageSource, /const renderGlobalChromeNotices/u);
    assert.match(pageSource, /MEMORY_TOAST_VISIBLE_LIMIT = 1/u);
    assert.match(signalSource, /ariaLabel="Signal notifications"/u);
    assert.match(debateSource, /ariaLabel="Debate notifications"/u);
    assert.match(whodunnitSource, /ariaLabel="Whodunnit notifications"/u);
  });
});
