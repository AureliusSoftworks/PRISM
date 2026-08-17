import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const serverSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

describe("Zen hero Hear them preview", () => {
  it("uses the foreground Zen route without creating a chat turn", () => {
    const previewSource = pageSource.slice(
      pageSource.indexOf("async function playZenHeroVoicePreview("),
      pageSource.indexOf("async function submitBotHubVoiceEcho("),
    );
    assert.match(previewSource, /buildChatRequestBody\("", \{ zenPersonaBotId: bot\.id \}\)/u);
    assert.match(previewSource, /"\/api\/zen\/voice-preview"/u);
    assert.match(previewSource, /preferredProvider: chatRoute\.preferredProvider/u);
    assert.match(previewSource, /responseMode: chatRoute\.responseMode/u);
    assert.match(previewSource, /modelOverride: chatRoute\.modelOverride/u);
    assert.match(previewSource, /choice === "premium" \? "elevenlabs" : "builtin"/u);
    assert.match(previewSource, /choice === "mute"/u);
    assert.match(pageSource, /releaseVoicePlaybackPreservingPreparedMode\(/u);
    assert.match(pageSource, /zenHeroVoicePreviewAbortRef\.current\?\.abort\(\)/u);
    assert.match(previewSource, /onPlaybackProgress:[\s\S]*?crtSpeechMouthShapeAtAlignedElapsedMs/u);
  });

  it("keeps the server endpoint tenant-scoped, route-aware, and transient", () => {
    const routeSource = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/zen/voice-preview"'),
      serverSource.indexOf('route("POST", "/api/avatar/sfx/generate"'),
    );
    assert.match(routeSource, /WHERE id = \? AND user_id = \?/u);
    assert.match(routeSource, /userBlocksOnlineCapabilities\(user\) \|\| bot\.online_enabled === 0/u);
    assert.match(routeSource, /contextualTextRuntimeForUser\(/u);
    assert.match(routeSource, /requestedResponseMode: forceLocal \? "local" : body\.responseMode/u);
    assert.match(routeSource, /inferZenVoicePreview\(/u);
    assert.doesNotMatch(routeSource, /INSERT INTO|UPDATE bots|createConversation|messages\s*\(/u);
  });

  it("cancels when Zen ownership changes or Private begins", () => {
    assert.match(
      pageSource,
      /if \(privateMode\) cancelZenHeroVoicePreview\(\);/u,
    );
    assert.match(
      pageSource,
      /view === "chat" &&[\s\S]*?!appWidePrivateMode &&[\s\S]*?zenEmptyHeroVisible &&[\s\S]*?zenPersonaBotId === previewBotId/u,
    );
    assert.match(pageSource, /<EmptyStateIcon[\s\S]*?isTalking=\{[\s\S]*?zenHeroPreviewVoicing/u);
  });
});
