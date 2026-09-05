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

test("offers and persists Off and default Bottish in Debate settings; Babble is gone", () => {
  const settingsControl = pageSource.slice(
    pageSource.indexOf('id="debate-whodunnit-text-voice-settings-title"'),
    pageSource.indexOf('aria-labelledby="debate-jury-settings-title"'),
  );
  assert.match(settingsControl, /data-tutorial-target="whodunnit-text-voice-setting"/u);
  assert.match(settingsControl, /aria-label="Whodunnit text voice"/u);
  assert.match(settingsControl, /<option value="off">Off<\/option>/u);
  assert.match(settingsControl, /<option value="bottish">Bottish · Default<\/option>/u);
  assert.doesNotMatch(settingsControl, /<option value="babble"/u, "Babble is not offered for investigations");
  assert.match(
    pageSource,
    /JSON\.stringify\(\{ debateWhodunnitTextVoiceMode \}\)/u,
  );
});

test("new accounts on old database schemas receive Bottish, and a saved Babble reads as Bottish", () => {
  const server = readFileSync(new URL("../../../api/src/server.ts", import.meta.url), "utf8");
  assert.equal((server.match(/debate_whodunnit_text_voice_mode: "bottish"/gu) ?? []).length, 2);
  assert.match(mysterySource, /configuredMode: props\.whodunnitTextVoiceMode \?\? "bottish"/u);
  assert.match(tutorialSource, /defaults written dialogue accompaniment to Bottish; a saved Off choice remains yours/u);
  const shared = readFileSync(new URL("../../../../packages/shared/src/audioVoice.ts", import.meta.url), "utf8");
  assert.match(shared, /if \(value === "babble"\) return "bottish";/u);
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
    /playDebateMysteryTextVoice\(\{[\s\S]{0,420}signal: controller\.signal,[\s\S]{0,320}play: props\.playMysteryTextVoice/u,
  );
  assert.match(mysterySource, /instant: roomPlayerObservationActive/u);
  assert.match(pageSource, /allowBabbleFallback: false/u);
  assert.doesNotMatch(pageSource, /preferProceduralBabble: instant === true/u);
});

test("keeps player Bottish and spoken character TTS distinct", () => {
  assert.match(
    tutorialSource,
    /Room observations are attributed to the player character, use Bottish whenever written accompaniment is on/u,
  );
  assert.match(tutorialSource, /spoken character TTS is unchanged/u);
  assert.match(
    pageSource,
    /observations included, uses Bottish[\s\S]{0,300}Character speech keeps its\s*configured English or\s*Premium voice/u,
  );
  const sfx = readFileSync(new URL("./debateMysterySfx.ts", import.meta.url), "utf8");
  assert.match(sfx, /if \(args\.configuredMode === "off"\) return "off";[\s\S]{0,200}return "bottish";/u, "an investigation is Bottish all the way to Court");
  assert.match(
    mysterySource,
    /voiceProfile: roomPlayerObservationActive\s*\? prosecutorBot\?\.voiceProfile \?\? props\.playerVoiceProfile \?\? null\s*: null/u,
  );
});
