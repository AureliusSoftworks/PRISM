import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function zenPlayerRevealSource(): string {
  const start = source.indexOf("const presentChatPlayerMessage =");
  assert.ok(start >= 0, "presentChatPlayerMessage must exist");
  const end = source.indexOf("const playSignalProducerGuestActionSfx", start);
  assert.ok(end > start, "player reveal block must precede Signal SFX");
  return source.slice(start, end);
}

test("the player never audibly talks in Zen", () => {
  const playerReveal = zenPlayerRevealSource();
  // The player line streams on the quiet reveal clock only: no synthesis
  // request, no audio enqueue, no player voice profile anywhere.
  assert.match(playerReveal, /runSilentFallback\(\);/u);
  assert.doesNotMatch(
    playerReveal,
    /resolvePlayerVoicePlayback|\/api\/voices\/synthesize|enqueueEnglishVoice/u,
  );
  assert.doesNotMatch(source, /zenPlayerVoiceEnabled/u);
  assert.doesNotMatch(source, /playerAudioVoiceProfile/u);
  assert.doesNotMatch(source, /Speak my messages in Zen/u);
  assert.doesNotMatch(source, /from "\.\/playerVoice"/u);
  assert.doesNotMatch(source, /id="settings-player-premium-voice"/u);
  assert.doesNotMatch(source, /id="settings-player-local-voice"/u);
});

test("immersive Zen still reveals player text on the quiet reveal clock", () => {
  const playerReveal = zenPlayerRevealSource();
  assert.match(
    playerReveal,
    /voiceSpokenText\(messageText, \{ leadingMarkedAction: true \}\)/,
  );
  assert.match(
    playerReveal,
    /const silentRevealDurationMs = fallbackDurationMs;/u,
  );
  assert.match(playerReveal, /startChatSpeechReveal/);
  assert.match(playerReveal, /bundledActionSfxCueAtMs/);
  assert.match(playerReveal, /playChatPlayerActionSfx\(messageText\)/);
  assert.match(playerReveal, /cancelReveal/u);
  assert.match(
    playerReveal,
    /setZenPlayerSpeechReveal\(\{ messageId, content: messageText, revealKey \}\);/u,
  );
  assert.match(
    source,
    /if \(chatImmersivePresentation\) \{[\s\S]*?presentChatPlayerMessage\([\s\S]*?optimisticMessageId/u,
  );
  assert.match(
    source,
    /chatImmersivePresentation &&[\s\S]*?zenPlayerRevealTimeline[\s\S]*?speechRevealVisibleTokenCount/,
  );
  assert.equal(
    source.match(
      /const zenPlayerRevealMatches = Boolean\(\s*chatImmersivePresentation &&\s*msg\.role === "user"/gu,
    )?.length,
    1,
  );
  assert.match(
    source,
    /for \(const temporalKey of chatSpeechRevealByKeyRef\.current\.keys\(\)\) \{[\s\S]{0,180}?if \(temporalKey\.startsWith\("zen-player:"\)\) continue;/u,
  );
  assert.match(
    source,
    /const finishReveal = \(\): void => \{[\s\S]*?finishChatSpeechReveal\(revealKey\);[\s\S]*?setZenPlayerSpeechReveal\(\(current\) =>[\s\S]*?current\?\.revealKey === revealKey \? null : current/u,
  );
});

test("spoken player presence defers to the Default Prism voice", () => {
  // Zen action foley, Signal producer-guest cues, and Debate player foley all
  // speak through the Default PRISM voice profile — never a player voice.
  const playerSfxOwners = source.match(
    /ownerKind: "player",\s*voiceProfile: settings\.prismDefaultBotAudioVoiceProfile/gu,
  );
  assert.ok(
    (playerSfxOwners?.length ?? 0) >= 3,
    "player-owned foley must route through the Default PRISM voice",
  );
  assert.match(
    source,
    /coffeePlayerPlaybackProfile\(\s*settings\.prismDefaultBotAudioVoiceProfile,?\s*\)/u,
  );
});
