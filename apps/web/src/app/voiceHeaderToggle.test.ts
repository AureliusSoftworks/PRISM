import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  new URL("./page.tsx", import.meta.url),
  "utf8",
).replace(/\s+/gu, " ");
const styleSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("universal voice selector", () => {
  it("places an explicit labeled selector beside the model controls", () => {
    assert.match(pageSource, /className=\{styles\.voiceModeSelector\}/);
    assert.match(
      pageSource,
      /<span>Voice<\/span> <span aria-hidden="true">·<\/span> <strong>\{voiceModeDisplayName\(currentMode\)\}<\/strong>/,
    );
    assert.match(pageSource, /VOICE_MODE_OPTIONS\.map\(\(mode\) =>/);
    assert.match(pageSource, /role="radiogroup" aria-label="Voice mode"/);
    assert.match(
      pageSource,
      /role="radio" aria-checked=\{mode === currentMode\}/,
    );
    assert.doesNotMatch(pageSource, /styles\.voiceHeaderButton/);
  });

  it("persists an explicit selection immediately with optimistic rollback", () => {
    assert.match(
      pageSource,
      /async function selectGlobalVoiceMode\( nextMode: VoiceMode, options: \{ preserveActivePlayback\?: boolean \} = \{\}, \)/,
    );
    assert.match(
      pageSource,
      /body: JSON\.stringify\(\{ voiceMode: nextMode \}\)/,
    );
    assert.match(pageSource, /voiceMode: previousMode/);
    assert.match(pageSource, /if \(nextMode === previousMode\) return/);
    assert.doesNotMatch(pageSource, /voiceModeAfterQuickToggle/);
  });

  it("unlocks the selected voice during the dropdown gesture", () => {
    const selector = pageSource.slice(
      pageSource.indexOf("async function selectGlobalVoiceMode"),
      pageSource.indexOf("async function saveVoiceSettings"),
    );
    const primeIndex = selector.indexOf(
      "primeVoiceModePlaybackFromUserGesture(nextMode)",
    );
    const saveIndex = selector.indexOf('await api("/api/settings"');
    assert.ok(primeIndex >= 0, "voice selection should prime browser audio");
    assert.ok(saveIndex >= 0, "voice selection should persist the setting");
    assert.ok(
      primeIndex < saveIndex,
      "browser audio must be primed before the first async settings request",
    );
    assert.match(selector, /if \(!options\.preserveActivePlayback\)/);
    assert.match(selector, /primeVoiceModePlaybackFromUserGesture\(nextMode\)/);
  });

  it("lets Signal change the next line without cutting off the live mic", () => {
    assert.match(
      pageSource,
      /tutorialTarget: "botcast-voice-mode", preserveActivePlayback: options\.liveSessionActive/,
    );
    assert.match(
      pageSource,
      /Signal voice · \$\{voiceModeDisplayName\(nextMode\)\}.*?Applies to the next line without cutting off anything already on mic\./,
    );
  });

  it("moves the same four choices into the constrained tools menu", () => {
    assert.match(pageSource, /VOICE_MODE_OPTIONS\.map\(\(mode\): PrismMenuEntry => \(\{/);
    assert.match(pageSource, /kind: "radio"/);
    assert.match(pageSource, /group: "voice-mode"/);
    assert.match(
      styleSource,
      /@media \(max-width: 560px\)[\s\S]*?\.voiceModeSelector\s*\{\s*display:\s*none/,
    );
  });

  it("keeps the selector in the header without repeating it in the Zen hero", () => {
    assert.match(
      pageSource,
      /const renderZenSplashControls[\s\S]*?showVoiceSelector: false/,
    );

    const chatHeader = pageSource.slice(
      pageSource.indexOf('className={styles.chatHeader}'),
      pageSource.indexOf("{!chatLikeSurface && view !== \"chat\" ?"),
    );
    assert.match(chatHeader, /renderVoiceModeSelector\(\)/);
  });
});

describe("Coffee voice authorization", () => {
  it("preserves the authorized media lane when Coffee begins playback", () => {
    assert.match(
      pageSource,
      /function stopVoicePlaybackPreservingPreparedMode\(mode: VoiceMode\).*?preservePreparedMedia: mode === "bottish" \|\| mode === "babble".*?preservePreparedMedia: mode === "english"/,
    );
    for (const [handler, nextHandler] of [
      [
        "const startCoffeeVoiceForReveal = async",
        "const startCoffeePlayerVoiceForReveal = async",
      ],
      [
        "const startCoffeePlayerVoiceForReveal = async",
        "const queueCoffeeReveal =",
      ],
    ] as const) {
      const source = pageSource.slice(
        pageSource.indexOf(handler),
        pageSource.indexOf(nextHandler),
      );
      assert.match(
        source,
        /stopVoicePlaybackPreservingPreparedMode\(settings\.voiceMode\)/,
      );
    }
    const replayEffect = pageSource.slice(
      pageSource.indexOf("coffeeReplayOwnsVoicePlaybackRef.current = true"),
      pageSource.indexOf("const startReveal ="),
    );
    assert.match(
      replayEffect,
      /stopVoicePlaybackPreservingPreparedMode\(settings\.voiceMode\)/,
    );
  });

  for (const [handler, nextHandler] of [
    [
      "const persistCoffeeTopicToServer = async",
      "const createCoffeePollTopic = async",
    ],
    [
      "const createCoffeePollTopic = async",
      "const createCoffeeTeamsTopic = async",
    ],
    [
      "const createCoffeeTeamsTopic = async",
      "const resolveCoffeeTeamTiebreaker = async",
    ],
    [
      "const createCoffeeSession = async",
      "const createCoffeeGroupFromSelection =",
    ],
    [
      "const startCoffeeSessionFromGroup = async",
      "const restartCoffeeConversationFromCurrentSession =",
    ],
    [
      "const restartCoffeeConversationFromCurrentSession =",
      "const openCoffeeSettingsModal =",
    ],
  ] as const) {
    it(`primes audio before ${handler.replace(/^const | = async$/gu, "")}'s first request`, () => {
      const source = pageSource.slice(
        pageSource.indexOf(handler),
        pageSource.indexOf(nextHandler),
      );
      const primeIndex = source.indexOf(
        "primeVoiceModePlaybackFromUserGesture(",
      );
      const requestIndex = source.indexOf("await api<");
      assert.ok(primeIndex >= 0, `${handler} should prime browser audio`);
      assert.ok(
        requestIndex >= 0,
        `${handler} should make its expected request`,
      );
      assert.ok(
        primeIndex < requestIndex,
        `${handler} must prime audio before yielding the user gesture`,
      );
    });
  }

  it("re-authorizes audio when replay starts, restarts, or resumes", () => {
    for (const [handler, nextHandler] of [
      ["const startCoffeeReplay =", "const restartCoffeeReplay ="],
      ["const restartCoffeeReplay =", "const toggleCoffeeReplayPlayback ="],
      [
        "const toggleCoffeeReplayPlayback =",
        "const finishCoffeeReplayRevealAt =",
      ],
    ] as const) {
      const source = pageSource.slice(
        pageSource.indexOf(handler),
        pageSource.indexOf(nextHandler),
      );
      assert.match(source, /primeVoiceModePlaybackFromUserGesture\(/);
    }
    assert.match(pageSource, /onClick=\{toggleCoffeeReplayPlayback\}/);
  });
});
