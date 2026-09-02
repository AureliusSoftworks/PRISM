import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./src/main.rs", import.meta.url),
  "utf8",
);

describe("desktop lifecycle policy", () => {
  it("launches Qdrant from its writable app-data directory", () => {
    assert.match(
      source,
      /let qdrant_work_dir = localai_data_dir\.join\("Qdrant"\);\s*let qdrant_storage_dir = qdrant_work_dir\.join\("storage"\);/u,
    );
    assert.match(
      source,
      /let mut qdrant_child = Command::new\(&qdrant\)\s*\.current_dir\(&qdrant_work_dir\)\s*\.env\("QDRANT__STORAGE__STORAGE_PATH", qdrant_storage_dir/u,
    );
  });

  it("registers the single-instance guard before runtime startup", () => {
    const guardRegistration = source.indexOf(
      ".plugin(tauri_plugin_single_instance::init",
    );
    const runtimeStateRegistration = source.indexOf(
      ".manage(RuntimeState::new())",
    );

    assert.ok(guardRegistration >= 0, "single-instance plugin must be registered");
    assert.ok(
      guardRegistration < runtimeStateRegistration,
      "single-instance plugin must run before managed runtime services",
    );
    assert.match(
      source,
      /tauri_plugin_single_instance::init\(\|app, args, _cwd\| \{\s*queue_portable_package_paths\(app, args\);\s*show_main_window\(app\);\s*\}\)/u,
    );
  });

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

  it("keeps long secure API upgrades visible without weakening the web timeout", () => {
    assert.match(source, /const API_STARTUP_TIMEOUT_SECS: u64 = 15 \* 60;/u);
    assert.match(source, /const WEB_STARTUP_TIMEOUT_SECS: u64 = 90;/u);
    assert.match(
      source,
      /emit_status\(app, "api", "preparing"\);[\s\S]{0,320}Secure upgrades can take several minutes for large libraries\./u,
    );
    assert.match(
      source,
      /emit_status\(app, "qdrant", "running"\);\s*emit_status\(app, "api", "running"\);\s*emit_status\(app, "web", "running"\);/u,
    );
  });
});
