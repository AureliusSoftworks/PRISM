import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(appDir, "..");

const globalsCss = readFileSync(join(appDir, "globals.css"), "utf8");
const layoutSource = readFileSync(join(appDir, "layout.tsx"), "utf8");

/** Font roles referenced by the tree but not yet mapped to a loaded face.
 *  Each entry renders a generic system fallback instead of the webfont the
 *  app already downloads, which is why the same intent looks different
 *  between applets. Removing an entry requires picking which loaded face it
 *  means — see docs/design-system.md. */
const UNMAPPED_FONT_ROLES = new Set([
  "--font-serif",
  "--font-editorial-serif",
  "--font-mono",
  "--font-ui-mono",
  "--font-display",
  "--font-geist-sans",
  "--font-weight-body",
]);

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return collectSourceFiles(full);
    return /\.(css|tsx|ts)$/u.test(entry) && !/\.test\.ts$/u.test(entry)
      ? [full]
      : [];
  });
}

function rootBlock(css: string): string {
  const match = /:root\s*\{([\s\S]*?)\}/u.exec(css);
  return match ? match[1] : "";
}

function declaredNames(block: string): Set<string> {
  return new Set(
    [...block.matchAll(/(--[a-z0-9-]+)\s*:/gu)].map((match) => match[1])
  );
}

describe("design token contract", () => {
  it("defines every referenced font role at :root or via next/font", () => {
    const rootNames = declaredNames(rootBlock(globalsCss));
    const layoutNames = new Set(
      [...layoutSource.matchAll(/variable:\s*"(--font-[a-z0-9-]+)"/gu)].map(
        (match) => match[1]
      )
    );

    const files = collectSourceFiles(srcDir);
    const sources = new Map(
      files.map((file) => [file, readFileSync(file, "utf8")] as const)
    );

    // A component-scoped definition still resolves for its own subtree, so it
    // counts as defined; only names nothing declares anywhere are dead.
    const scopedNames = new Set<string>();
    for (const [file, source] of sources) {
      if (!file.endsWith(".css")) continue;
      for (const [, name] of source.matchAll(/(--font-[a-z0-9-]+)\s*:/gu)) {
        scopedNames.add(name);
      }
    }

    const unresolved = new Set<string>();
    for (const source of sources.values()) {
      for (const [, name] of source.matchAll(/var\(\s*(--font-[a-z0-9-]+)/gu)) {
        // Interpolated names (`--font-bot-face-${id}`) are resolved at runtime.
        if (name.endsWith("-")) continue;
        if (rootNames.has(name) || layoutNames.has(name)) continue;
        if (scopedNames.has(name)) continue;
        if (UNMAPPED_FONT_ROLES.has(name)) continue;
        unresolved.add(name);
      }
    }

    assert.deepEqual(
      [...unresolved].sort(),
      [],
      "font roles referenced but never defined — they fall back to a system " +
        "face, so the same intent renders differently per applet"
    );
  });

  it("resolves the title role outside the .appLayout subtree", () => {
    assert.match(rootBlock(globalsCss), /--font-title:/u);
  });

  it("publishes the radius and spacing scales at :root", () => {
    const rootNames = declaredNames(rootBlock(globalsCss));
    for (const name of [
      "--prism-radius-md",
      "--prism-radius-pill",
      "--prism-space-sm",
      "--prism-space-xl",
    ]) {
      assert.ok(rootNames.has(name), `${name} must be defined at :root`);
    }
  });
});
