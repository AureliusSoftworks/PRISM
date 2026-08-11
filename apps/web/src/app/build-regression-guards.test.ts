import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL(".", import.meta.url));

function appFiles(): string[] {
  return readdirSync(appPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function cssModuleFiles(): string[] {
  return appFiles().filter((file) => file.endsWith(".module.css"));
}

function assertBalancedCssBraces(source: string, file: string): void {
  let depth = 0;
  let quote: "'" | '"' | null = null;
  let comment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    const next = source[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      assert.ok(depth >= 0, `CSS Module closes too many blocks: ${file}`);
    }
  }
  assert.equal(depth, 0, `CSS Module has an unclosed block: ${file}`);
}

test("app modules do not collide on case-insensitive filesystems", () => {
  const byLowercaseName = new Map<string, string[]>();
  for (const file of appFiles()) {
    const key = file.toLocaleLowerCase("en-US");
    const siblings = byLowercaseName.get(key) ?? [];
    siblings.push(file);
    byLowercaseName.set(key, siblings);
  }

  const collisions = [...byLowercaseName.values()].filter(
    (siblings) => siblings.length > 1,
  );
  assert.deepEqual(
    collisions,
    [],
    `App module names must remain unique ignoring case: ${JSON.stringify(collisions)}`,
  );
});

test("all app CSS Modules parse as complete stylesheets", () => {
  for (const file of cssModuleFiles()) {
    const source = readFileSync(join(appPath, file), "utf8");
    assertBalancedCssBraces(source, file);
  }
});

test("Avatar Details pixel-perfect rules stay CSS-Module-pure", () => {
  const file = "avatar-details-editor.module.css";
  const source = readFileSync(join(appPath, file), "utf8");
  assert.match(
    source,
    /\.canvas\[data-avatar-details-pixel-perfect="true"\][\s\S]*\.stampPreview\[data-avatar-details-pixel-perfect="true"\]/u,
  );
  assert.doesNotMatch(
    source,
    /(?:^|,)\s*\[data-avatar-details-pixel-perfect="true"\]\s*\{/mu,
  );
});

test("known build-failure identifiers stay aligned with current contracts", () => {
  const pageSource = readFileSync(join(appPath, "page.tsx"), "utf8");
  assert.doesNotMatch(pageSource, /resolvedSeatHorizontalSide/u);
  assert.doesNotMatch(pageSource, /ceremonyFaceStyle\.eyeMovement/u);
  assert.match(
    pageSource,
    /modelSelectionKind:[\s\S]{0,180}\("auto" as const\)[\s\S]{0,120}\("fixed" as const\)/u,
  );
});
