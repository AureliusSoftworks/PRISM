import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./src/main.rs", import.meta.url),
  "utf8",
);

describe("desktop cursor positioning policy", () => {
  it("positions finite webview coordinates through the Tauri window", () => {
    assert.match(
      source,
      /fn set_cursor_position\([\s\S]{0,180}x: f64,[\s\S]{0,80}y: f64/u,
    );
    assert.match(source, /if !x\.is_finite\(\) \|\| !y\.is_finite\(\)/u);
    assert.match(
      source,
      /set_cursor_position\(tauri::LogicalPosition::new\(x, y\)\)/u,
    );
    assert.match(
      source,
      /tauri::generate_handler!\[[\s\S]*set_cursor_position[\s\S]*\]/u,
    );
  });
});
