import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const mysterySource = readFileSync(
  new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("offers and persists Off, Babble, and default Bottish in Debate settings", () => {
  const settingsControl = pageSource.slice(
    pageSource.indexOf('id="debate-whodunnit-text-voice-settings-title"'),
    pageSource.indexOf('aria-labelledby="debate-jury-settings-title"'),
  );
  assert.match(settingsControl, /data-tutorial-target="whodunnit-text-voice-setting"/u);
  assert.match(settingsControl, /aria-label="Whodunnit text voice"/u);
  assert.match(settingsControl, /<option value="off">Off<\/option>/u);
  assert.match(settingsControl, /<option value="babble">Babble<\/option>/u);
  assert.match(settingsControl, /<option value="bottish">Bottish · Default<\/option>/u);
  assert.match(
    pageSource,
    /JSON\.stringify\(\{ debateWhodunnitTextVoiceMode \}\)/u,
  );
});

test("routes only written text through the selected bounded voice lifecycle", () => {
  assert.match(
    pageSource,
    /playMysteryTextVoice=\{async \(\{[\s\S]{0,320}mode,[\s\S]{0,320}signal,[\s\S]{0,620}enqueueRobotVoiceMode\(\{[\s\S]{0,360}signal,/u,
  );
  assert.match(
    debateSource,
    /whodunnitTextVoiceMode: props\.whodunnitTextVoiceMode,[\s\S]{0,120}playMysteryTextVoice: props\.playMysteryTextVoice/u,
  );
  assert.match(
    mysterySource,
    /delivery: dialogueSfxDelivery,[\s\S]{0,160}mode: textVoiceMode,[\s\S]{0,240}streaming: dialogueSfxStreaming/u,
  );
  assert.match(
    mysterySource,
    /dialogueTextVoiceRef\.current\?\.controller\.abort\(\);[\s\S]{0,120}teardownBottishVoiceImmediately/u,
  );
  assert.match(
    mysterySource,
    /playDebateMysteryTextVoice\(\{[\s\S]{0,260}signal: controller\.signal,[\s\S]{0,220}play: props\.playMysteryTextVoice/u,
  );
});

test("keeps anonymous Casekeeper Babble and spoken character TTS distinct", () => {
  assert.match(
    tutorialSource,
    /Bottish is the default; anonymous Casekeeper speech keeps its authored Babble carrier, and spoken character TTS is unchanged/u,
  );
  assert.match(
    pageSource,
    /Anonymous Casekeeper speech keeps its[\s\S]{0,80}authored Babble carrier; character speech keeps its[\s\S]{0,80}configured English or Premium voice/u,
  );
});
