import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Zen conversation tab", () => {
  it("remains available in release builds", () => {
    const zenShellStart = pageSource.indexOf('data-zen-surface="true"');
    const sandboxShellStart = pageSource.indexOf("// ── App shell (Sandbox mode) ──");

    assert.ok(zenShellStart >= 0, "Missing the Zen app shell");
    assert.ok(sandboxShellStart > zenShellStart, "Missing the Sandbox app shell");

    const zenShell = pageSource.slice(zenShellStart, sandboxShellStart);
    assert.match(zenShell, /className=\{`\$\{styles\.sidebarHandle\}/u);
    assert.match(zenShell, /aria-label=\{\s*sidebarOpen\s*\? "Close conversation panel"\s*: "Open conversation panel"\s*\}/u);
    assert.doesNotMatch(zenShell, /FLOATING_SHELL_APPLETS_ENABLED/u);
  });
});
