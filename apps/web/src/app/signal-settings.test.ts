import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsPanelSource = readFileSync(
  new URL("./SettingsPanel.tsx", import.meta.url),
  "utf8",
);
const tutorialsSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("Signal has a default-off immersive voice settings surface", () => {
  assert.match(settingsPanelSource, /\| "botcast"/u);
  assert.match(
    settingsPanelSource,
    /scope: "botcast", title: "Signal", icon: <Radio/u,
  );
  assert.match(pageSource, /activeSettingsScope === "botcast"/u);
  assert.match(pageSource, /data-settings-section="botcast"/u);
  assert.match(pageSource, /settings\.signalImmersiveVoiceEffectsEnabled/u);
  assert.match(pageSource, /action floats above/u);
  assert.match(pageSource, /appears between/u);
  assert.match(pageSource, /activeSettingsScope !== "botcast"/u);
});

test("Signal navbar opens its contextual settings and preserves the tutorial", () => {
  assert.match(
    pageSource,
    /view === "botcast"[\s\S]{0,80}\? "botcast"/u,
  );
  assert.match(pageSource, /resetSingleModeTutorial\("botcast"\)/u);
  assert.match(
    tutorialsSource,
    /Signal Settings can also opt ElevenLabs voices into sparse, saved vocal reactions/u,
  );
});

test("Signal sends saved performance text only through the ElevenLabs request lane", () => {
  assert.match(
    pageSource,
    /settings\.signalImmersiveVoiceEffectsEnabled[\s\S]{0,140}elevenLabsText: message\.voicePerformanceText/u,
  );
  assert.match(pageSource, /signalMessageId: message\.id/u);
  assert.match(
    pageSource,
    /signalOnlineVoiceEnabled[\s\S]{0,180}settings\.englishVoiceEngine/u,
  );
  assert.doesNotMatch(
    pageSource,
    /effectiveProvider === "local"[\s\S]{0,100}settings\.englishVoiceEngine/u,
  );
});
