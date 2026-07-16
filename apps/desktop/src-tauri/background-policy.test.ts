import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const configUrl = new URL("./tauri.conf.json", import.meta.url);
const mainUrl = new URL("./src/main.rs", import.meta.url);

describe("desktop background policy", () => {
  it("disables throttling for the configured main webview", () => {
    const config = JSON.parse(readFileSync(configUrl, "utf8")) as {
      app?: { windows?: Array<Record<string, unknown>> };
    };
    const mainWindow = config.app?.windows?.find(
      (window) => window.label === "main",
    );

    assert.equal(mainWindow?.backgroundThrottling, "disabled");
  });

  it("disables throttling when the main webview is built as a fallback", () => {
    const source = readFileSync(mainUrl, "utf8");

    assert.match(
      source,
      /use tauri::utils::config::BackgroundThrottlingPolicy;/,
    );
    assert.match(
      source,
      /WebviewWindowBuilder::new\([\s\S]*?\.background_throttling\(BackgroundThrottlingPolicy::Disabled\)[\s\S]*?\.build\(\)/,
    );
  });
});
