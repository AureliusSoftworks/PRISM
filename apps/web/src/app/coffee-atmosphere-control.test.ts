import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const jazzSource = readFileSync(
  new URL("./coffeeJazzAtmosphere.ts", import.meta.url),
  "utf8",
);
const atmosphereSource = readFileSync(
  new URL("./session-atmosphere-audio.ts", import.meta.url),
  "utf8",
);
const captureSource = readFileSync(
  new URL("./replayAudioMasterCapture.ts", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const layerSource = readFileSync(
  new URL("./SessionAtmosphereLayer.tsx", import.meta.url),
  "utf8",
);

test("Coffee Jazz is a wired local-only atmosphere control with stations", () => {
  assert.match(source, /Atmosphere audio/u);
  assert.match(source, /className=\{styles\.coffeeJazzButton\}/u);
  assert.match(source, /aria-pressed=\{coffeeJazzAtmosphere\.enabled\}/u);
  assert.match(source, /aria-label="Jazz station"/u);
  assert.doesNotMatch(
    source,
    /className=\{styles\.coffeeJazzButton\}[\s\S]{0,120}disabled[\s\S]{0,80}>\s*Jazz/u,
  );
  assert.match(jazzSource, /prism_coffee_jazz_atmosphere_v1/u);
  assert.match(jazzSource, /rainy-morning/u);
  assert.match(jazzSource, /late-night-lounge/u);
  assert.match(jazzSource, /sunny-brunch/u);
  assert.match(jazzSource, /rhodes-nook/u);
  assert.match(jazzSource, /dreamy-steam/u);
  assert.match(
    jazzSource,
    /never part of CoffeeSessionSettings, group snapshots, or faithful/u,
  );
});

test("Coffee thinking has a distinct calculation reticle", () => {
  assert.match(cssSource, /\.zenLiveBotPresenceThinkingGlyphAnchor::before/u);
  assert.match(cssSource, /coffeeThinkingReticle/u);
});

test("Coffee Jazz preference stays outside CoffeeSessionSettings persistence", () => {
  assert.match(
    source,
    /persistCoffeeJazzAtmosphereToBrowser\(coffeeJazzAtmosphere\)/u,
  );
  assert.match(source, /loadCoffeeJazzAtmosphereFromBrowser\(\)/u);
  assert.match(
    jazzSource,
    /never part of CoffeeSessionSettings, group snapshots, or faithful/u,
  );
  assert.doesNotMatch(
    source,
    /normalizeCoffeeSessionSettings\([\s\S]{0,80}jazz|jazz[\s\S]{0,80}normalizeCoffeeSessionSettings/iu,
  );
  assert.doesNotMatch(
    source,
    /persistCoffeeSettingsToBrowser\([\s\S]{0,40}jazz|coffeeJazz[\s\S]{0,40}persistCoffeeSettingsToBrowser/iu,
  );
  assert.match(
    source,
    /Soft café jazz for the live table and while watching replays[\s\S]*stays out of faithful audio recordings/u,
  );
});

test("Coffee shares tactful foley and cup-synchronized audio with Signal", () => {
  assert.match(source, /<SessionAtmosphereLayer/u);
  assert.match(source, /coffeeCupRootRef=\{/u);
  assert.match(
    source,
    /coffeeSessionPhase !== "finished" \|\| coffeeReplayActive/u,
  );
  assert.match(atmosphereSource, /mutation\.removedNodes/u);
  assert.match(
    atmosphereSource,
    /coffeeCupFoleyCueForTransition\(previous, false\)/u,
  );
});

test("Coffee idle presence is richer, local, and yields to real table activity", () => {
  assert.match(source, /ambientFoleyUrls=\{COFFEE_AMBIENT_FOLEY_URLS\}/u);
  assert.match(source, /ambientFoleyProfile=\{COFFEE_AMBIENT_FOLEY_PROFILE\}/u);
  assert.match(
    source,
    /ambientBotVocalizationProfile=\{\s*COFFEE_AMBIENT_BOT_VOCALIZATION_PROFILE\s*\}/u,
  );
  assert.match(
    source,
    /deferFoley=\{\s*coffeeTurnRhythmState !== "idle" \|\| coffeeReplayPlaying\s*\}/u,
  );
  assert.match(
    source,
    /deferBotVocalization=\{\s*coffeeTurnRhythmState !== "idle" \|\| coffeeReplayPlaying\s*\}/u,
  );
  assert.match(source, /coffeeAmbientPresenceWord\(/u);
  assert.match(source, /engine: "builtin"/u);
  assert.match(source, /explicitOnlineContext: false/u);
  assert.match(source, /channel: "presence"/u);
  assert.match(source, /releaseRealtimeVoiceAudio\("presence", 140\)/u);
  assert.doesNotMatch(
    source,
    /coffeeAmbientPresenceWord[\s\S]{0,500}\/api\/messages/u,
  );
});

test("Coffee Jazz routes through local-only output and skips the master tap", () => {
  assert.match(captureSource, /export function prismLocalOnlyAudioOutputNode/u);
  assert.match(
    captureSource,
    /Speakers only — never connected to the faithful-master capture tap/u,
  );
  assert.match(atmosphereSource, /backgroundRecordable/u);
  assert.match(atmosphereSource, /prismLocalOnlyAudioOutputNode/u);
  assert.match(layerSource, /backgroundRecordable/u);
  assert.match(source, /backgroundRecordable=\{false\}/u);
  assert.match(source, /backgroundTone="warm-low"/u);
  assert.match(source, /coffeeJazzBackgroundUrl\(coffeeJazzAtmosphere\)/u);
});

test("Coffee master replay keeps jazz overlay while silencing recordable atmosphere", () => {
  assert.match(
    source,
    /ambientFoley=\{\s*!\(coffeeReplayActive && coffeeReplayUsesAudioMaster\) &&\s*settings\?\.voiceMode !== "mute"\s*\}/u,
  );
  assert.match(
    source,
    /ambientBotVocalizations=\{\s*!\(coffeeReplayActive && coffeeReplayUsesAudioMaster\) &&\s*settings\?\.voiceMode !== "mute"\s*\}/u,
  );
  assert.match(
    source,
    /coffeeReplayActive && coffeeReplayUsesAudioMaster\s*\?\s*undefined\s*:\s*settings\?\.voiceMode === "mute"\s*\?\s*undefined\s*:\s*coffeeWorkspaceRef/u,
  );
  assert.match(
    source,
    /coffeeJazzAtmosphere\.enabled \|\|\s*\(!\(coffeeReplayActive && coffeeReplayUsesAudioMaster\) &&\s*settings\.voiceMode !== "mute"\)/u,
  );
});
