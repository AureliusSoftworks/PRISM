import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
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

test("Coffee atmosphere offers bundled fallback and custom group audio", () => {
  assert.match(source, /Atmosphere audio/u);
  assert.match(source, /role="radiogroup"\s*aria-label="Coffee atmosphere audio source"/u);
  assert.match(source, /role="radio"\s*aria-checked=\{coffeeJazzAtmosphere\.source === "fallback"\}/u);
  assert.match(source, /role="radio"\s*aria-checked=\{coffeeJazzAtmosphere\.source === "custom"\}/u);
  assert.match(source, /aria-label="Fallback Coffee song"/u);
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

test("Coffee thinking keeps only its authored screen spinner", () => {
  assert.match(source, /showThinkingSpinner: seatThinkingVisualActive/u);
  assert.doesNotMatch(source, /coffeeSeatThinkingIndicator/u);
  assert.doesNotMatch(cssSource, /coffeeSeatThinkingIndicator/u);
  assert.doesNotMatch(
    cssSource,
    /\.zenLiveBotPresenceThinkingGlyphAnchor::(?:before|after)/u,
  );
  assert.doesNotMatch(cssSource, /coffeeThinkingReticle/u);
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
    /Choose a bundled café song or the group’s own cast-derived bed\.[\s\S]*Table music stays out of faithful audio recordings/u,
  );
});

test("every new Coffee Group starts with one random bundled song", () => {
  assert.match(source, /randomCoffeeJazzStationId/u);
  assert.match(
    source,
    /const chooseCoffeeJazzStationForNewGroup = useCallback[\s\S]{0,360}\[groupId\]: stationId/u,
  );
  assert.equal(
    source.match(/chooseCoffeeJazzStationForNewGroup\(response\.group\.id\);/gu)
      ?.length,
    2,
  );
  assert.match(
    source,
    /const openCoffeeGroup[\s\S]{0,900}previous\.stationIdByGroupId\[group\.id\] \?\? previous\.stationId/u,
  );
  assert.match(
    source,
    /\[coffeeSelectedGroup\.id\]: stationId/u,
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
    /coffeeCupFoleyCueForTransition\([\s\S]{0,80}previous,[\s\S]{0,40}false,[\s\S]{0,80}placementCueModeForCup\(cup\)/u,
  );
});

test("Coffee foley stays dense under live speech while idle vocal Foley yields", () => {
  assert.match(source, /ambientFoleyUrls=\{COFFEE_AMBIENT_FOLEY_URLS\}/u);
  assert.match(source, /ambientFoleyProfile=\{COFFEE_AMBIENT_FOLEY_PROFILE\}/u);
  assert.match(source, /deferFoley=\{\s*coffeeReplayPlaying\s*\}/u);
  assert.match(
    source,
    /ambientBotVocalizationProfile=\{\s*COFFEE_AMBIENT_BOT_VOCALIZATION_PROFILE\s*\}/u,
  );
  assert.match(
    source,
    /deferBotVocalization=\{\s*coffeeTurnRhythmState !== "idle" \|\| coffeeReplayPlaying\s*\}/u,
  );
  assert.match(atmosphereSource, /shouldDeferFoley/u);
  assert.match(atmosphereSource, /timer = window\.setTimeout\(scheduleFoley, 4_000\)/u);
});

test("ambient listener chatter reuses reaction ownership without transcription or providers", () => {
  assert.match(source, /coffeeAmbientListenerAcknowledgementPlan\(/u);
  assert.match(source, /presentCoffeeListenerReaction\(/u);
  assert.match(source, /coffeeAmbientListenerCandidateIsEligible\(/u);
  assert.match(source, /coffeeAmbientListenerPlanIsLocal\(plan\)/u);
  assert.match(
    source,
    /plan && coffeeAmbientListenerPlanIsLocal\(plan\)[\s\S]{0,80}\? "builtin"/u,
  );
  assert.match(source, /listenerGain = coffeeAmbientListenerPlanIsLocal/u);
  assert.match(source, /stereoPan: listenerStereoPan/u);
  assert.match(source, /seatListenerReactionSpeaking/u);
  assert.doesNotMatch(
    source,
    /coffeeAmbientListenerAcknowledgementPlan[\s\S]{0,1200}\/api\/messages/u,
  );
});

test("Coffee Jazz and its environmental loop route locally outside the master", () => {
  assert.match(captureSource, /export function prismLocalOnlyAudioOutputNode/u);
  assert.match(
    captureSource,
    /Speakers only — never connected to the faithful-master capture tap/u,
  );
  assert.match(atmosphereSource, /backgroundRecordable/u);
  assert.match(atmosphereSource, /grainRecordable/u);
  assert.match(atmosphereSource, /prismLocalOnlyAudioOutputNode/u);
  assert.match(layerSource, /backgroundRecordable/u);
  assert.match(layerSource, /grainRecordable/u);
  assert.match(source, /backgroundRecordable=\{false\}/u);
  assert.match(source, /grainRecordable=\{false\}/u);
  assert.match(source, /backgroundTone="warm-low"/u);
  assert.match(source, /coffeeJazzBackgroundUrl\(coffeeJazzAtmosphere\)/u);
  assert.match(source, /grainUrl=\{/u);
  assert.match(source, /COFFEE_SHOP_ENVIRONMENT_URL/u);
  assert.match(source, /coffeeShopEnvironmentMix\(coffeeForegroundVoiceActive\)/u);
  assert.match(source, /mixTransitionMs=\{COFFEE_SHOP_ENVIRONMENT_DUCK_MS\}/u);
  assert.match(source, /lifecycleTransitionMs=\{450\}/u);
  assert.ok(
    statSync(
      new URL(
        "../../public/audio/coffee/ambience/coffee-shop-foley-forest-loop.mp3",
        import.meta.url,
      ),
    ).size > 400_000,
  );
});

test("Coffee master replay silences the live atmosphere layer", () => {
  assert.match(
    source,
    /active=\{Boolean\([\s\S]{0,320}!\(coffeeReplayActive && coffeeReplayUsesAudioMaster\)/u,
  );
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
});
