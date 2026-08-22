import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("Signal audio suspension follows the living-session-aware policy", () => {
  assert.match(
    pageSource,
    /const prismPresentationSuspended = usePrismPresentationSuspended\(\)/u,
  );
  assert.doesNotMatch(
    pageSource,
    /useSyncExternalStore\(\s*subscribePrismVisualLifecycle,\s*getPrismPresentationSuspendedSnapshot/u,
  );
});

test("Signal producer typing never reconciles the complete experience", () => {
  assert.doesNotMatch(
    signalSource,
    /const \[askAboutDraft, setAskAboutDraft\]|const \[directQuoteDraft, setDirectQuoteDraft\]/u,
  );
  const composer = signalSource.slice(
    signalSource.indexOf('className={styles.producerCueComposer}'),
    signalSource.indexOf('className={styles.cueGrid}'),
  );
  assert.match(
    composer,
    /ref=\{producerCueInputRef\}[\s\S]{0,100}defaultValue=""[\s\S]{0,180}onInput=/u,
  );
  assert.match(
    composer,
    /ref=\{producerQuoteInputRef\}[\s\S]{0,100}defaultValue=""[\s\S]{0,180}onInput=/u,
  );
  assert.match(composer, /syncProducerCueDraftControls\(\)/u);
  assert.doesNotMatch(composer, /setAskAboutDraft|setDirectQuoteDraft/u);
  assert.match(
    signalSource,
    /function producerCueDraftSnapshot\(\)[\s\S]{0,220}producerCueInputRef\.current\?\.value\.trim\(\)/u,
  );
});

test("Signal lets active user input outrank whole-episode presentation commits", () => {
  const gate = signalSource.slice(
    signalSource.indexOf("const waitForSignalUserInputIdle"),
    signalSource.indexOf(
      "const episodeRunIdRef",
      signalSource.indexOf("const waitForSignalUserInputIdle") + 1,
    ),
  );
  assert.match(signalSource, /SIGNAL_USER_INPUT_QUIET_WINDOW_MS = 160/u);
  assert.match(gate, /scheduling\?\.isInputPending/u);
  assert.match(gate, /window\.requestIdleCallback/u);
  assert.match(
    signalSource,
    /window\.addEventListener\("pointerdown", noteUserInput, true\)[\s\S]{0,180}window\.addEventListener\("keydown", noteUserInput, true\)[\s\S]{0,180}window\.addEventListener\("beforeinput", noteUserInput, true\)/u,
  );
  assert.match(
    signalSource,
    /await waitForSignalUserInputIdle\(controller\.signal\);[\s\S]{0,180}startTransition\(\(\) => setEpisode\(response\.episode\)\)/u,
  );
});

test("Signal samples live mouth shapes in an isolated low-priority component", () => {
  assert.match(
    signalSource,
    /function SignalLiveVisualSampler[\s\S]{0,900}current\.key === next\.key \? current : next/u,
  );
  const avatar = signalSource.slice(
    signalSource.indexOf("const avatar = ("),
    signalSource.indexOf(
      "\n    return (\n      <section",
      signalSource.indexOf("const avatar = (") + 1,
    ),
  );
  assert.match(avatar, /<SignalLiveVisualSampler/u);
  assert.match(
    avatar,
    /const mouthShape = liveMouthShapeAt\(nowMs\)/u,
  );
  assert.doesNotMatch(avatar, /return SignalLiveVisualSampler\(/u);
  assert.doesNotMatch(signalSource, /SignalLiveMouthDomDriver/u);
  assert.doesNotMatch(signalSource, /target\.textContent = glyph/u);
});

test("Signal's one-second clock cannot reconcile the complete experience", () => {
  assert.doesNotMatch(
    signalSource,
    /const \[signalStageNowMs, setSignalStageNowMs\]/u,
  );
  assert.match(
    signalSource,
    /function SignalEpisodeRuntimeClock[\s\S]{0,900}window\.setInterval\(update, 1_000\)/u,
  );
  assert.match(
    signalSource,
    /signalStageNowMsRef\.current = Date\.now\(\)/u,
  );
});

test("Signal reaction audio heartbeats update a clock ref without owner renders", () => {
  const lifecycle = signalSource.slice(
    signalSource.indexOf("const createSignalReactionVoiceLifecycle"),
    signalSource.indexOf(
      "const fireLiveListenerReaction",
      signalSource.indexOf("const createSignalReactionVoiceLifecycle"),
    ),
  );
  const progress = lifecycle.slice(
    lifecycle.indexOf("onProgress: (elapsedMs, durationMs) =>"),
    lifecycle.indexOf("onEnd: clearSpeech"),
  );
  assert.match(
    progress,
    /signalEphemeralSpeechPlaybackClockByBotIdRef\.current\.set/u,
  );
  assert.doesNotMatch(
    progress,
    /setSignalEphemeralSpeechByBotId/u,
  );
});

test("Signal clears its busy gate after a transitioned turn commit", () => {
  assert.match(
    signalSource,
    /const operationWasCurrent = episodeOperationIsCurrent\([\s\S]{0,160}if \(operationWasCurrent\) \{[\s\S]{0,180}episodeOperationAbortRef\.current = null;[\s\S]{0,240}startTransition\(\(\) => \{[\s\S]{0,240}if \(operationWasCurrent\) \{[\s\S]{0,80}setBusy\(false\)/u,
  );
  assert.doesNotMatch(
    signalSource,
    /episodeOperationAbortRef\.current = null;[\s\S]{0,300}startTransition\(\(\) => \{[\s\S]{0,240}if \(episodeOperationIsCurrent\(controller, runId\)\)/u,
  );
});

test("Signal cannot advance behind its intro or before the opening is heard", () => {
  const startup = signalSource.slice(
    signalSource.indexOf("const startEpisode = async"),
    signalSource.indexOf(
      "const skipEpisodePreRoll",
      signalSource.indexOf("const startEpisode = async") + 1,
    ),
  );
  const playOpeningAt = startup.indexOf("await playPreparedEpisodeMessage(");
  const autoRunAt = startup.indexOf("setAutoRun(true)");
  assert.ok(playOpeningAt >= 0, "opening playback is present");
  assert.ok(autoRunAt > playOpeningAt, "Auto starts only after opening playback");
});
