import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  LEGACY_BROWSER_BEARER_STORAGE_KEYS,
  purgeLegacyBrowserBearerCredentials,
} from "./browserBearerCredentialCleanup.ts";

describe("browser bearer credential cleanup", () => {
  it("removes both legacy raw-token keys from local and session storage without reading them", () => {
    const removed: string[] = [];
    const storage = {
      removeItem(key: string) {
        removed.push(key);
      },
    };

    purgeLegacyBrowserBearerCredentials({
      localStorage: storage,
      sessionStorage: storage,
    });

    assert.deepEqual(
      removed,
      [
        ...LEGACY_BROWSER_BEARER_STORAGE_KEYS,
        ...LEGACY_BROWSER_BEARER_STORAGE_KEYS,
      ],
    );
  });

  it("keeps cookie-backed auth available when legacy browser storage is inaccessible", () => {
    assert.doesNotThrow(() =>
      purgeLegacyBrowserBearerCredentials({
        localStorage: {
          removeItem() {
            throw new Error("storage unavailable");
          },
        },
      }),
    );
  });

  it("keeps browser request paths free of legacy bearer-storage reads", () => {
    for (const relativePath of [
      "page.tsx",
      "replayClient.ts",
      "voiceSyncLabAudio.ts",
    ]) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      assert.doesNotMatch(source, /prism_(?:native_session|client_access)_token/u);
      assert.doesNotMatch(source, /localStorage\.getItem\([^)]*(?:session|token)/u);
    }
  });

  it("keeps native WebKit credentials HttpOnly and out of JavaScript storage", () => {
    for (const relativePath of [
      "../../../client-mac/PrismClient/Views/KioskWebView.swift",
      "../../../ios-client/PrismIOS/Views/KioskWebView.swift",
    ]) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      assert.doesNotMatch(source, /(?:local|session)Storage\.(?:getItem|setItem)/u);
      assert.equal(source.includes('setValue("prism_client_access='), false);
      assert.equal(
        source.includes('HTTPCookiePropertyKey("HttpOnly"): "TRUE"'),
        true,
      );
      assert.equal(source.includes('name: "localai_session"'), true);
      assert.equal(source.includes('name: "prism_client_access"'), true);
    }
  });
});
