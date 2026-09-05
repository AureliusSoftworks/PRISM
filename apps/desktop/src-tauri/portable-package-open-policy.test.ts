import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./src/main.rs", import.meta.url), "utf8");
const config = JSON.parse(readFileSync(new URL("./tauri.conf.json", import.meta.url), "utf8")) as {
  bundle?: { fileAssociations?: Array<{ ext?: string[]; mimeType?: string }> };
};

describe("desktop portable package open policy", () => {
  it("associates every portable mystery extension in packaged desktop builds", () => {
    const associations = config.bundle?.fileAssociations ?? [];
    assert.ok(associations.some((entry) => entry.ext?.includes("case") && entry.mimeType === "application/vnd.prism.case"));
    assert.ok(associations.some((entry) => entry.ext?.includes("mansion") && entry.mimeType === "application/vnd.prism.mansion"));
    assert.ok(associations.some((entry) => entry.ext?.includes("whodunnit") && entry.mimeType === "application/vnd.prism.whodunnit"));
  });

  it("queues initial, second-instance, and macOS open-path events for the web shell", () => {
    assert.match(source, /std::env::args\(\)\.skip\(1\)/u);
    assert.match(source, /tauri_plugin_single_instance::init\(\|app, args, _cwd\| \{\s*queue_portable_package_paths\(app, args\);/u);
    assert.match(source, /RunEvent::Opened \{ urls \}[\s\S]{0,260}queue_portable_package_paths/u);
    assert.match(source, /app\.emit\("prism-open-portable-package"/u);
    assert.match(source, /extension != "case" && extension != "mansion" && extension != "whodunnit"/u);
  });
});
