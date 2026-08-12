import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Avatar Studio voice preview routing", () => {
  it("uses the requested English identity for an explicit preview", () => {
    assert.match(
      pageSource,
      /function resolveVoicePreviewEngine\(profile: unknown\): EnglishVoiceEngine[\s\S]*?elevenLabsVoiceIdOverride \|\| normalized\.elevenLabsVoiceId[\s\S]*?\? "elevenlabs"[\s\S]*?: "builtin"/,
    );
    const previewSource = pageSource.slice(
      pageSource.indexOf("async function previewSelectedVoice("),
      pageSource.indexOf("async function playBotHubVoicePreview("),
    );
    assert.match(
      previewSource,
      /const previewEngine =[\s\S]*?options\.englishVoiceEngine \?\?[\s\S]*?resolveVoicePreviewEngine\(previewProfile\)/,
    );
    assert.match(
      previewSource,
      /engine: previewEngine,[\s\S]*?explicitOnlineContext: true,[\s\S]*?explicitVoicePreview: true/,
    );
    assert.match(
      previewSource,
      /requestVoicePreviewWithBackendRecovery\([\s\S]*?recoverBackend: recoverBackendConnection/,
    );
    assert.match(
      previewSource,
      /previewEngine === "elevenlabs"[\s\S]*?clip\.engineUsed !== "elevenlabs"[\s\S]*?fallback voice was not played/,
    );
    assert.doesNotMatch(
      previewSource,
      /settings\.preferredProvider === "local"[\s\S]{0,100}\? "builtin"/,
    );
    assert.match(
      previewSource,
      /options\.onError\?\.\(message\)[\s\S]*?if \(!options\.onError\) setPanelError\(message\)/,
    );
    const botHubSource = pageSource.slice(
      pageSource.indexOf("async function playBotHubVoicePreview("),
      pageSource.indexOf("async function previewSelectedBotVoice("),
    );
    assert.match(
      botHubSource,
      /mode === "premium" \? "english" : mode/,
    );
    assert.match(
      botHubSource,
      /mode === "premium" \? "elevenlabs" : "builtin"/,
    );
    assert.match(
      botHubSource,
      /englishVoiceEngine: englishChoice \? previewEngine : undefined/,
    );
  });

  it("keeps the dock form-free with local Enter playback behavior", () => {
    assert.match(
      pageSource,
      /<div[\s\S]*?className=\{styles\.botAvatarVoiceTestDock\}[\s\S]*?data-avatar-foundry-region="voice-preview"[\s\S]*?role="group"[\s\S]*?aria-label="Test this bot's voice"/u,
    );
    assert.doesNotMatch(
      pageSource,
      /<form[\s\S]*?className=\{styles\.botAvatarVoiceTestDock\}[\s\S]*?data-avatar-foundry-region="voice-preview"/u,
    );
    assert.match(
      pageSource,
      /type="button"[\s\S]*?onClick=\{\(\) => void playChoice\("current"\)\}[\s\S]*?\{activeChoice === "current" \? "Speaking…" : "Speak"\}/u,
    );
    assert.match(
      pageSource,
      /choices\.map\([\s\S]*?onClick=\{\(\) => void playChoice\(choice\)\}[\s\S]*?botAvatarVoiceTestChoiceLabel\(choice\)/u,
    );
    assert.match(
      pageSource,
      /aria-label="Voice preview line"[\s\S]*?onKeyDown=\{\(event\) => \{[\s\S]*?if \(event\.key !== "Enter"\)[\s\S]*?return;[\s\S]*?if \(event\.nativeEvent\.isComposing\)[\s\S]*?return;[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?void playChoice\("current"\);[\s\S]*?\}\}/u,
    );
  });
});
