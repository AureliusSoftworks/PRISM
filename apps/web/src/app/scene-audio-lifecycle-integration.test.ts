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
    assert.match(lifecycleSource, /releaseBottishVoice/u);
    assert.match(lifecycleSource, /releaseEnglishVoice/u);
    assert.match(lifecycleSource, /releaseReactionVoiceAudio/u);
    assert.match(lifecycleSource, /stopCoffeeActionSfx/u);
    assert.match(lifecycleSource, /stopCoffeeSoundtrackSampleAudio/u);
    assert.match(lifecycleSource, /stopDebateIdentAudio/u);
    assert.match(lifecycleSource, /stopSignalSoundboardAudio/u);
    assert.match(lifecycleSource, /stopAllBotAvatarSfxAudio/u);
    assert.match(lifecycleSource, /stopPrismCompanionGlassTapAudio/u);
    assert.match(lifecycleSource, /releaseSignalIntroAudio/u);
    assert.match(
      atmosphereLayerSource,
      /return \(\) => \{[\s\S]*controller\.stop\(lifecycleTransitionMs\)/u,
    );
    assert.match(
      atmosphereLayerSource,
      /setPresentationSuspended\(presentationSuspended\)/u,
    );
    assert.match(atmosphereLayerSource, /usePrismPresentationSuspended/u);
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
    assert.match(
      pageSource,
      /const stopBotcastUtterance = useCallback\(\(\): void => \{[\s\S]{0,900}releaseReactionVoiceAudio\(\);[\s\S]{0,180}releaseRealtimeVoiceAudio\("handoff", 160\);[\s\S]{0,260}stopVoicePlaybackPreservingPreparedMode/u,
    );
  });

  it("invalidates stale Debate voice work before every exit path", () => {
    assert.match(
      pageSource,
      /if \(view === "debate"\) \{\s*debateVoiceSurfaceActiveRef\.current = false;\s*\}[\s\S]{0,180}if \(view === "coffee"\) \{\s*coffeeVoiceSurfaceActiveRef\.current = false;\s*\}[\s\S]{0,80}stopPrismSceneAudio\(\)/u,
    );
    assert.match(
      pageSource,
      /const prepareDebateUtterance = async[\s\S]{0,180}!debateVoiceSurfaceActiveRef\.current/u,
    );
    assert.match(
      pageSource,
      /const playDebateUtterance = async[\s\S]{0,180}!debateVoiceSurfaceActiveRef\.current/u,
    );
    assert.match(
      pageSource,
      /onExit=\{\(\) => \{\s*debateVoiceSurfaceActiveRef\.current = false;\s*stopBotcastUtterance\(\);\s*stopPrismSceneAudio\(\)/u,
    );
  });

  it("stops Coffee speech before returning to the group overview", () => {
    const coffeeVoice = sourceSlice(
      pageSource,
      "useEffect(() => {\n    const voiceSelection = voicePlaybackSelectionRef.current;\n    if (!coffeeConversation)",
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
    assert.match(
      pageSource,
      /if \(view !== "coffee"\) \{\s*coffeeVoiceSurfaceActiveRef\.current = false;[\s\S]{0,180}coffeeRevealDeliveryEpochRef\.current \+= 1/u,
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
