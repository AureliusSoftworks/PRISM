import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Avatar Studio voice preview routing", () => {
  it("prioritizes the profile-owned ElevenLabs identity for an explicit preview", () => {
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
      /const previewEngine = resolveVoicePreviewEngine\(previewProfile\)/,
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
  });
});
