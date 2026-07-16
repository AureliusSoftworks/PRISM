import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productionSources = [
  "./page.module.css",
  "./page.tsx",
  "./botcast.module.css",
  "./slateWorkspace.module.css",
  "./prism/page.module.css",
  "./botLibraryGroupVisual.ts",
  "./botMarketplaceThemeGradient.ts",
].map((path) => ({
  path,
  source: readFileSync(new URL(path, import.meta.url), "utf8"),
}));

const sourceFor = (path: string) =>
  productionSources.find((entry) => entry.path === path)?.source ?? "";

test("the shared Light shell uses the cool white instrument palette", () => {
  const css = sourceFor("./page.module.css");
  assert.match(
    css,
    /\.themeLight\s*\{[\s\S]*--bg:\s*#edf5fc;[\s\S]*--bg-deep:\s*#dce8f2;[\s\S]*--bg-surface:\s*#f8fbff;[\s\S]*--bg-elevated:\s*#ffffff;/,
  );
  assert.match(
    css,
    /\.themeLight\s*\{[\s\S]*--fg:\s*#172638;[\s\S]*--fg-muted:\s*#5c7186;[\s\S]*--line:\s*#cfdce7;/,
  );

  const page = sourceFor("./page.tsx");
  assert.match(page, /const THEME_BG[\s\S]*light:\s*"#edf5fc"/);
  assert.match(page, /const THEME_SURFACE_BG[\s\S]*light:\s*"#f8fbff"/);
});

test("independently themed Light surfaces inherit the same cool material family", () => {
  const signal = sourceFor("./botcast.module.css");
  assert.match(
    signal,
    /\.shell\[data-theme="light"\] \.signalFallbackStudio\s*\{[\s\S]*background-color:\s*#eaf3fb;[\s\S]*background-blend-mode:\s*color;/,
  );
  assert.match(signal, /#fbfdff 0%, #e5f1fa 66%, #ccdeec 100%/);

  const slate = sourceFor("./slateWorkspace.module.css");
  assert.match(
    slate,
    /linear-gradient\(180deg, var\(--bg-surface, #ffffff\), var\(--bg, #edf5fc\)\)/,
  );

  assert.match(
    sourceFor("./botLibraryGroupVisual.ts"),
    /light:\s*\["#cfdbe5", "#f4f9fd", "#9fb2c2"\]/,
  );
  assert.match(
    sourceFor("./botMarketplaceThemeGradient.ts"),
    /\["#cfdbe5", "#f4f9fd", "#9fb2c2"\]/,
  );
});

test("legacy cream structural colors do not return to production theme surfaces", () => {
  const production = productionSources
    .map(({ path, source }) => `/* ${path} */\n${source}`)
    .join("\n");

  for (const legacyCream of [
    "#fffdf8",
    "#fffaf2",
    "#f4f2ee",
    "#e6e1d9",
    "#ebe7df",
    "#dcd5cb",
    "#f8f5ef",
    "#f5f2ec",
    "#f5f1e9",
    "#f3e8d9",
    "#e4d6c2",
    "#fffdf4",
    "#f7f7f2",
    "#faf3e9",
    "#f4f1ea",
    "#f7efe4",
    "#eee7df",
    "#d7cfc3",
    "#f4efe7",
    "rgba(244, 239, 231",
  ]) {
    assert.ok(
      !production.toLowerCase().includes(legacyCream),
      `legacy cream ${legacyCream} should not be used by production theme surfaces`,
    );
  }
});
