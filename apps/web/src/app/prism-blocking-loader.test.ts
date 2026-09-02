import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./PrismBlockingLoader.tsx", import.meta.url), "utf8");
const css = readFileSync(
  new URL("./prism-blocking-loader.module.css", import.meta.url),
  "utf8",
);

describe("PrismBlockingLoader", () => {
  it("blocks the full app through a body portal and restores it on exit", () => {
    assert.match(source, /createPortal\([\s\S]*document\.body/u);
    assert.match(source, /role="dialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /element\.setAttribute\("inert", ""\)/u);
    assert.match(source, /element\.removeAttribute\("inert"\)/u);
    assert.match(source, /document\.body\.style\.overflow = "hidden"/u);
    assert.match(source, /previouslyFocused\.focus/u);
    assert.match(css, /position:\s*fixed;[\s\S]{0,80}inset:\s*0/iu);
  });

  it("embeds Prism and flies the companion orb in before suppressing Ask Prism", () => {
    assert.match(source, /<PrismCompanionPresenceBoundary reason="blocking-loader"/u);
    assert.match(source, /hardCompanionSuppressed/u);
    assert.match(source, /animatePrismOrbHandoff/u);
    assert.match(source, /data-prism-blocking-orb-slot/u);
    assert.match(source, /<PrismOrb className=\{styles\.prismOrb\}/u);
    assert.doesNotMatch(source, /styles\.prismMark|styles\.lightCore/u);
  });

  it("communicates determinate and indeterminate PRISM progress accessibly", () => {
    assert.match(source, /role="progressbar"/u);
    assert.match(source, /aria-valuenow=\{progressPercent \?\? undefined\}/u);
    assert.match(source, /data-indeterminate=/u);
    assert.match(css, /var\(--prism-p\)[\s\S]*var\(--prism-r\)[\s\S]*var\(--prism-i\)[\s\S]*var\(--prism-s\)[\s\S]*var\(--prism-m\)/u);
    assert.match(css, /prefers-reduced-motion:\s*reduce/iu);
    assert.match(css, /\.backdrop\[data-theme="light"\]/u);
  });

  it("honors the document Light theme when a portaled loader omits a theme", () => {
    assert.match(source, /startedAt = null,[\s\S]{0,100}theme,\s*placement = "fullscreen"/u);
    assert.doesNotMatch(source, /theme = "dark"/u);
    assert.match(
      css,
      /:global\(body\[data-prism-theme="light"\]\) \.backdrop,[\s\S]{0,120}:global\(body\[data-prism-theme="light"\]\) \.docked\s*\{[^}]*--loader-card:\s*rgba\(255, 255, 255, \.88\)[^}]*--loader-ink:\s*#181725/u,
    );
    assert.match(
      css,
      /:global\(body\[data-prism-theme="light"\]\) \.backdrop \.card,[\s\S]{0,120}:global\(body\[data-prism-theme="light"\]\) \.docked \.card\s*\{[^}]*#ffffffe8[^}]*#f4fbffe0[^}]*#f8f1ffe3/u,
    );
    assert.match(css, /border-color:\s*color-mix\([^;]*var\(--prism-s\)/u);
    assert.match(css, /\.backdrop,[\s\S]{0,40}\.docked\s*\{[^}]*--loader-card:\s*rgba\(18, 19, 31, \.92\)/u);
  });

  it("keeps Signal's light copy as the default while allowing contextual handoffs", () => {
    assert.match(source, /footer\?: string/u);
    assert.match(
      source,
      /footer = "Keep this window open while the light takes shape\."/u,
    );
    assert.match(source, /<small>\{footer\}<\/small>/u);
  });

  it("offers explicit click and keyboard cancellation only when supported", () => {
    assert.match(source, /onCancel\?: \(\) => void/u);
    assert.match(source, /aria-label=\{cancelLabel\}/u);
    assert.match(source, /className=\{styles\.cancelButton\}/u);
    assert.match(source, /event\.key === "Escape"/u);
    assert.match(source, /requestCancel\(\)/u);
    assert.match(source, /cancelButtonRef\.current \?\? overlay/u);
    assert.match(css, /\.cancelButton\s*\{/u);
  });
});
