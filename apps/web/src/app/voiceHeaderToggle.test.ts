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
      /<span>Voice<\/span> <span aria-hidden="true">·<\/span> <strong>\{voiceModeDisplayName\(currentChoice\)\}<\/strong>/,
    );
    assert.match(pageSource, /VOICE_PLAYBACK_CHOICES\.map\(\(choice\) =>/);
    assert.match(pageSource, /role="radiogroup" aria-label="Voice mode"/);
    assert.match(
      pageSource,
      /role="radio" aria-checked=\{choice === currentChoice\}/,
    );
    assert.doesNotMatch(pageSource, /styles\.voiceHeaderButton/);
  });

  it("persists an explicit selection immediately with optimistic rollback", () => {
    assert.match(
      pageSource,
      /async function selectGlobalVoiceChoice\( nextChoice: VoicePlaybackChoice, \)/,
    );
    assert.match(
      pageSource,
      /body: JSON\.stringify\(nextSettings\)/,
    );
    assert.match(pageSource, /voiceMode: previousMode/);
    assert.match(pageSource, /englishVoiceEngine: previousEnglishVoiceEngine/);
    assert.match(pageSource, /if \(nextChoice === previousChoice\) return/);
    assert.doesNotMatch(pageSource, /voiceModeAfterQuickToggle/);
  });

  it("unlocks the selected voice during the dropdown gesture", () => {
    const selector = pageSource.slice(
      pageSource.indexOf("async function selectGlobalVoiceChoice"),
      pageSource.indexOf("async function saveVoiceSettings"),
    );
    const primeIndex = selector.indexOf(
      "primeVoiceModePlaybackFromUserGesture(nextSettings.voiceMode)",
    );
    const saveIndex = selector.indexOf('await api("/api/settings"');
    assert.ok(primeIndex >= 0, "voice selection should prime browser audio");
    assert.ok(saveIndex >= 0, "voice selection should persist the setting");
    assert.ok(
      primeIndex < saveIndex,
      "browser audio must be primed before the first async settings request",
    );
    assert.match(
      selector,
      /primeVoiceModePlaybackFromUserGesture\(nextSettings\.voiceMode\)/,
    );
    assert.doesNotMatch(selector, /stopEnglishVoice|stopBottishVoice|\.abort\(\)/);
  });

  it("lets Signal change the next line without cutting off the live mic", () => {
    assert.match(
      pageSource,
      /tutorialTarget: "botcast-voice-mode"/,
    );
    assert.match(
      pageSource,
      /Applies to the next line without cutting off speech already playing\./,
    );
  });

  it("moves the same five choices into the constrained tools menu", () => {
    assert.match(pageSource, /VOICE_PLAYBACK_CHOICES\.map\(\(choice\): PrismMenuEntry => \(\{/);
    assert.match(pageSource, /kind: "radio"/);
    assert.match(pageSource, /group: "voice-mode"/);
    assert.match(
      styleSource,
      /@media \(max-width: 560px\)[\s\S]*?\.voiceModeSelector\s*\{\s*display:\s*none/,
    );
    assert.match(pageSource, /Settings → Keys to use Premium/);
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

  it("snapshots the five-choice selection when each spoken surface starts an utterance", () => {
    assert.match(
      pageSource,
      /const voiceSelection = voicePlaybackSelectionRef\.current; if \(!detail\)/,
    );
    assert.match(
      pageSource,
      /const voiceSelection = voicePlaybackSelectionRef\.current; if \(!coffeeConversation\)/,
    );
    assert.match(
      pageSource,
      /const voiceSelection = voicePlaybackSelectionRef\.current; if \( !coffeeReplayActive/,
    );
    assert.match(
      pageSource,
      /const voiceSelection = voicePlaybackSelectionRef\.current; if \( view !== "story"/,
    );
    assert.match(
      pageSource,
      /const playBotcastUtterance = useCallback\( async \([\s\S]*?const voiceSelection = voicePlaybackSelectionRef\.current/,
    );
    const switchSource = pageSource.slice(
      pageSource.indexOf("async function selectGlobalVoiceChoice"),
      pageSource.indexOf("async function saveVoiceSettings"),
    );
    assert.doesNotMatch(
      switchSource,
      /stopEnglishVoice|stopBottishVoice|stopBotcastUtterance|\.abort\(\)/,
    );
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
      /stopVoicePlaybackPreservingPreparedMode\(voiceSelection\.voiceMode\)/,
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
