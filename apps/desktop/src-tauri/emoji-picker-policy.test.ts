import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./src/main.rs", import.meta.url),
  "utf8",
);

describe("desktop emoji picker policy", () => {
  it("opens the macOS Character Viewer on the main thread", () => {
    assert.match(source, /fn open_emoji_picker\(app: AppHandle\)/u);
    assert.match(source, /app\.run_on_main_thread/u);
    assert.match(source, /orderFrontCharacterPalette\(None\)/u);
    assert.match(
      source,
      /tauri::generate_handler!\[[\s\S]*open_emoji_picker[\s\S]*\]/u,
    );
  });

  it("reports an unsupported native picker outside macOS", () => {
    assert.match(
      source,
      /#\[cfg\(not\(target_os = "macos"\)\)\][\s\S]{0,100}Ok\(false\)/u,
    );
  });
});
