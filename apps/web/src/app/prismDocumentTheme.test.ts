import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";

import {
  PRISM_DOCUMENT_THEME_BOOTSTRAP_SCRIPT,
  resolvePrismDocumentTheme,
} from "./prismDocumentTheme.ts";

function runThemeBootstrap({
  storedPreference,
  prefersDark,
  storageThrows = false,
}: {
  storedPreference: string | null;
  prefersDark: boolean;
  storageThrows?: boolean;
}): string | undefined {
  const body = { dataset: {} as Record<string, string> };
  runInNewContext(PRISM_DOCUMENT_THEME_BOOTSTRAP_SCRIPT, {
    document: { body },
    window: {
      localStorage: {
        getItem: () => {
          if (storageThrows) throw new Error("storage unavailable");
          return storedPreference;
        },
      },
      matchMedia: () => ({ matches: prefersDark }),
    },
  });
  return body.dataset.prismTheme;
}

describe("document theme fallback", () => {
  it("lets the canonical live body marker win", () => {
    assert.equal(
      resolvePrismDocumentTheme({
        documentTheme: "light",
        storedPreference: "dark",
        prefersDark: true,
      }),
      "light",
    );
  });

  it("uses the stored pre-auth choice when the shell marker is unavailable", () => {
    assert.equal(
      resolvePrismDocumentTheme({
        documentTheme: null,
        storedPreference: "dark",
        prefersDark: false,
      }),
      "dark",
    );
  });

  it("resolves system and missing preferences from the media state", () => {
    assert.equal(
      resolvePrismDocumentTheme({
        storedPreference: "system",
        prefersDark: false,
      }),
      "light",
    );
    assert.equal(
      resolvePrismDocumentTheme({ prefersDark: true }),
      "dark",
    );
  });

  it("bootstraps the saved or system theme before the app shell paints", () => {
    assert.equal(
      runThemeBootstrap({ storedPreference: "light", prefersDark: true }),
      "light",
    );
    assert.equal(
      runThemeBootstrap({ storedPreference: "system", prefersDark: false }),
      "light",
    );
    assert.equal(
      runThemeBootstrap({
        storedPreference: null,
        prefersDark: true,
        storageThrows: true,
      }),
      "dark",
    );
  });

  it("places the bootstrap before normal and global-error recovery content", () => {
    const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
    const globalError = readFileSync(
      new URL("./global-error.tsx", import.meta.url),
      "utf8",
    );
    assert.ok(
      layout.indexOf('id="prism-document-theme-bootstrap"') <
        layout.indexOf("<PrismMenuProvider>"),
    );
    assert.ok(
      globalError.indexOf('id="prism-document-theme-bootstrap"') <
        globalError.indexOf("<PrismAppErrorFallback"),
    );
  });

  it("keeps the route/global error fallback theme-aware", () => {
    const fallback = readFileSync(
      new URL("./PrismAppErrorFallback.tsx", import.meta.url),
      "utf8",
    );
    assert.match(fallback, /currentPrismDocumentTheme\(\)/u);
    assert.match(
      fallback,
      /useState<PrismResolvedDocumentTheme>\("dark"\)/u,
    );
    assert.match(
      fallback,
      /resolvedTheme === "light" \? styles\.themeLight : styles\.themeDark/u,
    );
    assert.match(fallback, /data-theme=\{resolvedTheme\}/u);
    assert.match(fallback, /styles\.documentThemeSurface/u);
    assert.doesNotMatch(
      fallback,
      /<main className=\{`\$\{styles\.authLayout\} \$\{styles\.themeDark\}`\}>/u,
    );
  });
});
