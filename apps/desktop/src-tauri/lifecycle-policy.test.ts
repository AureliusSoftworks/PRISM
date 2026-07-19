import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./src/main.rs", import.meta.url),
  "utf8",
);

describe("desktop lifecycle policy", () => {
  it("treats a macOS window close as a real app shutdown", () => {
    assert.match(
      source,
      /if cfg!\(target_os = "macos"\) \{[\s\S]{0,520}api\.prevent_close\(\);[\s\S]{0,180}mark_app_quitting\(&app_handle\);[\s\S]{0,260}thread::spawn[\s\S]{0,220}stop_runtime\(&state\);[\s\S]{0,120}app_handle\.exit\(0\);/u,
    );
    assert.match(
      source,
      /if cfg!\(target_os = "macos"\)[\s\S]{0,900}return;[\s\S]{0,80}api\.prevent_close\(\);[\s\S]{0,80}window\.hide\(\);/u,
    );
  });

  it("honors OS quit requests and stops PRISM-owned runtime children", () => {
    assert.match(
      source,
      /RunEvent::ExitRequested \{ \.\. \} => \{[\s\S]{0,180}mark_app_quitting\(&app_handle\);[\s\S]{0,180}stop_runtime\(&state\);/u,
    );
    assert.doesNotMatch(
      source,
      /RunEvent::ExitRequested[\s\S]{0,300}api\.prevent_exit\(\)/u,
    );
  });
});
