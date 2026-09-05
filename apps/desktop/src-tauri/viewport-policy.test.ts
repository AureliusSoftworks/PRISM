import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const config = JSON.parse(
  readFileSync(new URL("./tauri.conf.json", import.meta.url), "utf8"),
) as {
  app?: { windows?: Array<Record<string, unknown>> };
};
const source = readFileSync(new URL("./src/main.rs", import.meta.url), "utf8");

describe("desktop viewport policy", () => {
  it("uses a roomy reference composition with a compact logical minimum", () => {
    const mainWindow = config.app?.windows?.find(
      (window) => window.label === "main",
    );

    assert.equal(mainWindow?.width, 1440);
    assert.equal(mainWindow?.height, 900);
    assert.equal(mainWindow?.minWidth, 800);
    assert.equal(mainWindow?.minHeight, 520);
    assert.equal(mainWindow?.resizable, true);
    assert.equal(mainWindow?.maximizable, true);
    assert.equal(mainWindow?.fullscreen, false);
  });

  it("centers startup and keeps it inside the monitor work area", () => {
    const mainWindow = config.app?.windows?.find(
      (window) => window.label === "main",
    );

    assert.equal(mainWindow?.center, true);
    assert.equal(mainWindow?.preventOverflow, true);
    assert.match(
      source,
      /const PRISM_WINDOW_REFERENCE_WIDTH: f64 = 1440\.0;[\s\S]*const PRISM_WINDOW_REFERENCE_HEIGHT: f64 = 900\.0;[\s\S]*const PRISM_WINDOW_MIN_WIDTH: f64 = 800\.0;[\s\S]*const PRISM_WINDOW_MIN_HEIGHT: f64 = 520\.0;/u,
    );
    assert.match(
      source,
      /WebviewWindowBuilder::new\([\s\S]*?\.inner_size\([\s\S]*?PRISM_WINDOW_REFERENCE_WIDTH,[\s\S]*?PRISM_WINDOW_REFERENCE_HEIGHT,[\s\S]*?\)[\s\S]*?\.min_inner_size\(PRISM_WINDOW_MIN_WIDTH, PRISM_WINDOW_MIN_HEIGHT\)[\s\S]*?\.center\(\)[\s\S]*?\.prevent_overflow\(\)[\s\S]*?\.fullscreen\(false\)/u,
    );
  });
});
