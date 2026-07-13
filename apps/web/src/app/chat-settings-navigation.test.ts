import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsPanelSource = readFileSync(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");

test("Chat is a first-class Settings mode with conversation controls", () => {
  assert.match(settingsPanelSource, /\| "chat"/u);
  assert.match(
    settingsPanelSource,
    /scope: "chat", title: "Chat", icon: <MessageCircle/u
  );
  assert.match(pageSource, /activeSettingsScope === "chat"/u);
  assert.match(pageSource, /data-settings-section="chat"/u);
  assert.match(pageSource, /Memory &amp; Writing/u);
  assert.match(pageSource, /resetSingleModeTutorial\("chat"\)/u);
  assert.match(pageSource, /resetSingleModeTutorial\("zen"\)/u);
  assert.match(pageSource, /resetSingleModeTutorial\("coffee"\)/u);
});

test("the old Behavior navigation category is removed", () => {
  assert.doesNotMatch(settingsPanelSource, /scope: "behavior"/u);
  assert.doesNotMatch(pageSource, /activeSettingsScope === "behavior"/u);
});
