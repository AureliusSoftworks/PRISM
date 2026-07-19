import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const lifecycleSource = readFileSync(
  new URL("./scene-audio-lifecycle.ts", import.meta.url),
  "utf8",
);
const atmosphereLayerSource = readFileSync(
  new URL("./SessionAtmosphereLayer.tsx", import.meta.url),
  "utf8",
);

function sourceSlice(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe("scene audio lifecycle wiring", () => {
  it("registers every standalone PRISM audio backend", () => {
    assert.match(lifecycleSource, /stopBottishVoice/u);
    assert.match(lifecycleSource, /stopEnglishVoice/u);
    assert.match(lifecycleSource, /stopReactionVoiceAudio/u);
    assert.match(lifecycleSource, /stopCoffeeActionSfx/u);
    assert.match(lifecycleSource, /stopSignalIntroAudio/u);
    assert.match(
      atmosphereLayerSource,
      /return \(\) => \{[\s\S]*controller\.stop\(\)/u,
    );
  });

  it("halts and invalidates audio when changing applets", () => {
    const navigation = sourceSlice(
      pageSource,
      "const navigateToView = useCallback(",
      "useEffect(() => {\n    if (viewSwitchOverlayPhase",
    );
    const lifecycle = sourceSlice(
      pageSource,
      "const stopAudioForStateExit = useCallback(",
      "const resolveVisibleMessageContentForVoiceRef",
    );

    assert.match(navigation, /stopPrismSceneAudio\(\)/u);
    assert.match(lifecycle, /voiceSynthesisAbortRef\.current\?\.abort\(\)/u);
    assert.match(lifecycle, /signalVoiceAbortRef\.current\?\.abort\(\)/u);
    assert.match(
      lifecycle,
      /listenerReactionVoiceAbortRef\.current\?\.abort\(\)/u,
    );
    assert.match(lifecycle, /stopAudioForStateExit\(\)/u);
  });

  it("stops Coffee speech before returning to the group overview", () => {
    const coffeeVoice = sourceSlice(
      pageSource,
      "useEffect(() => {\n    if (!coffeeConversation)",
      "/** Scenario for arrival animation",
    );
    const coffeeExit = sourceSlice(
      pageSource,
      "const exitCoffeeSessionToSelectedView = async () => {",
      "const deleteCoffeeSession = async",
    );

    assert.match(coffeeVoice, /coffeeOwnedPlayback/u);
    assert.match(coffeeVoice, /stopAudioForStateExit\(\)/u);
    assert.match(coffeeExit, /stopAudioForStateExit\(\)/u);
    assert.ok(
      coffeeExit.indexOf("stopAudioForStateExit()") <
        coffeeExit.indexOf("setCoffeeConversation(null)"),
    );
  });

  it("stops Story beats and Signal operations when their state unmounts", () => {
    const storyVoice = sourceSlice(
      pageSource,
      "const storyVoiceBeatKeyRef",
      "const prepareBotcastUtterance",
    );
    const signalInvalidation = sourceSlice(
      signalSource,
      "const invalidateEpisodeOperation = useCallback",
      "const setPersistedSignalModelWarmupHold",
    );

    assert.match(
      storyVoice,
      /controller\.abort\(\)[\s\S]*stopAudioForStateExit\(\)/u,
    );
    assert.match(signalInvalidation, /stopIntroPreview\(\)/u);
    assert.match(signalInvalidation, /stopUtterance\(\)/u);
  });
});
