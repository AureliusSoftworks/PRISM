import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./src/main.rs", import.meta.url), "utf8");

describe("desktop native text-correction policy", () => {
  it("installs the policy at document start for every webview frame", () => {
    assert.match(
      source,
      /\.initialization_script_for_all_frames\(PRISM_DISABLE_NATIVE_TEXT_CORRECTION_SCRIPT\)/u,
    );
  });

  it("turns off spelling and automatic correction without changing autocomplete or capitalization", () => {
    const policy = source.slice(
      source.indexOf("const PRISM_DISABLE_NATIVE_TEXT_CORRECTION_SCRIPT"),
      source.indexOf("use tauri::menu::MenuBuilder"),
    );
    assert.match(
      policy,
      /globalThis\.__PRISM_NATIVE_TEXT_CORRECTION_POLICY__ = true/u,
    );
    assert.match(policy, /element\.spellcheck = false/u);
    assert.match(policy, /setAttribute\('autocorrect', 'off'\)/u);
    assert.match(policy, /getAttribute\('spellcheck'\) !== 'false'/u);
    assert.match(policy, /getAttribute\('autocorrect'\) !== 'off'/u);
    assert.match(policy, /MutationObserver/u);
    assert.doesNotMatch(policy, /autocomplete|autocapitalize/iu);
  });
});
