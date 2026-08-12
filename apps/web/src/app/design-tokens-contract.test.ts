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
const UNMAPPED_FONT_ROLES = new Set(["--font-display", "--font-geist-sans"]);

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

    const sources = new Map(
      collectSourceFiles(srcDir).map(
        (file) => [file, readFileSync(file, "utf8")] as const
      )
    );

    const definedIn = new Map<string, Set<string>>();
    for (const [file, source] of sources) {
      if (!file.endsWith(".css")) continue;
      for (const [, name] of source.matchAll(/(--font-[a-z0-9-]+)\s*:/gu)) {
        const files = definedIn.get(name) ?? new Set<string>();
        files.add(file);
        definedIn.set(name, files);
      }
    }

    // A face role authored on a component class only resolves inside that
    // subtree. Referencing it from another stylesheet silently falls back to a
    // different face — how --font-title diverged between the shell and Debate.
    const unresolved = new Set<string>();
    for (const [file, source] of sources) {
      for (const [, name] of source.matchAll(/var\(\s*(--font-[a-z0-9-]+)/gu)) {
        // Interpolated names (`--font-bot-face-${id}`) are resolved at runtime.
        if (name.endsWith("-")) continue;
        // Size and weight tokens are legitimately shell-scoped.
        if (/^--font-(size|weight)-/u.test(name)) continue;
        if (rootNames.has(name) || layoutNames.has(name)) continue;
        if (UNMAPPED_FONT_ROLES.has(name)) continue;
        if (definedIn.get(name)?.has(file)) continue;
        unresolved.add(`${name} referenced by ${file.split("/").pop()}`);
      }
    }

    assert.deepEqual(
      [...unresolved].sort(),
      [],
      "font roles must resolve where they are referenced — define them at " +
        ":root in globals.css or via next/font, not on a component class"
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

  it("keeps one step name to pixel mapping across radius and spacing", () => {
    const block = rootBlock(globalsCss);
    const stepsFor = (prefix: string) =>
      new Map(
        [
          ...block.matchAll(
            new RegExp(`--prism-${prefix}-([a-z0-9]+):\\s*(\\d+)px`, "gu")
          ),
        ].map((match) => [match[1], match[2]] as const)
      );

    const radius = stepsFor("radius");
    const space = stepsFor("space");
    for (const [step, value] of radius) {
      const shared = space.get(step);
      if (shared === undefined) continue;
      assert.equal(
        value,
        shared,
        `--prism-radius-${step} and --prism-space-${step} must agree`
      );
    }
  });
});
