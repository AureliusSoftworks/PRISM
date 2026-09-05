import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const replayClient = readFileSync(
  new URL("./replayClient.ts", import.meta.url),
  "utf8",
);
const responseCueCache = readFileSync(
  new URL("./responseCueVoiceCache.ts", import.meta.url),
  "utf8",
);
const pendingReplayCache = readFileSync(
  new URL("./replayPendingCapture.ts", import.meta.url),
  "utf8",
);
const browserOwnerState = readFileSync(
  new URL("./browserOwnerState.ts", import.meta.url),
  "utf8",
);
const accountSurfaces = [
  "PrismCompanion.tsx",
  "BotcastExperience.tsx",
  "DebateExperience.tsx",
  "DebateMysteryExperience.tsx",
  "DebateMysteryV2Experience.tsx",
  "SlateWorkspace.tsx",
  "AvatarDetailsEditor.tsx",
  "PrismIntroSequence.tsx",
].map((filename) => ({
  filename,
  source: readFileSync(new URL(`./${filename}`, import.meta.url), "utf8"),
}));

function sourceBetween(start: string, end: string): string {
  const startIndex = page.indexOf(start);
  const endIndex = page.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source end: ${end}`);
  return page.slice(startIndex, endIndex);
}

describe("account-owned browser runtime integration", () => {
  it("purges every account-owned voice runtime when the authenticated owner changes", () => {
    const teardown = sourceBetween(
      "const voiceCacheOwnerIdRef",
      "const configuredVoicePlaybackSelection",
    );
    assert.match(teardown, /\[user\?\.id\]/u);
    for (const expected of [
      "responseCuePlaybackAbortRef.current?.abort()",
      "responseCueWarmByKeyRef.current.clear()",
      "responseCueRuntimeByBotIdRef.current.clear()",
      "signalVoicePrefetchSchedulerRef.current.clear()",
      "signalVoiceClipCacheRef.current.clear()",
      "signalVoiceClipEpisodeByMessageIdRef.current.clear()",
      "signalVoiceConsumedEpisodeByMessageIdRef.current.clear()",
      "signalVoicePrefetchAttemptEpisodeByMessageIdRef.current.clear()",
      "signalVoiceEngineByEpisodeParticipantRef.current.clear()",
      "listenerReactionVoiceClipCacheRef.current.clear()",
      "listenerReactionVoiceReadyClipRef.current.clear()",
      "interruptedSpeakerVoiceClipCacheRef.current.clear()",
      "interruptedSpeakerVoiceReadyClipRef.current.clear()",
      "debateLastVoiceClipRef.current = null",
    ]) {
      assert.ok(teardown.includes(expected), `Missing owner teardown: ${expected}`);
    }
  });

  it("owner-keys replay voice flights and never sends the owner identifier as request content", () => {
    assert.match(
      replayClient,
      /const key = `\$\{args\.ownerId\}:\$\{args\.surface\}:\$\{args\.sourceId\}:\$\{args\.snapshot\.sourceKey\}`/u,
    );
    const requestBodyStart = replayClient.indexOf("const requestBody = {");
    const requestBodyEnd = replayClient.indexOf("};", requestBodyStart);
    assert.ok(requestBodyStart >= 0 && requestBodyEnd > requestBodyStart);
    assert.doesNotMatch(
      replayClient.slice(requestBodyStart, requestBodyEnd),
      /ownerId/u,
    );
  });

  it("upgrades both legacy ownerless IndexedDB stores by deleting their plaintext records", () => {
    assert.match(responseCueCache, /RESPONSE_CUE_DB_VERSION = 2/u);
    assert.match(
      responseCueCache,
      /database\.deleteObjectStore\(RESPONSE_CUE_STORE\)/u,
    );
    assert.match(pendingReplayCache, /DATABASE_VERSION = 2/u);
    assert.match(
      pendingReplayCache,
      /database\.deleteObjectStore\(STORE_NAME\)/u,
    );
  });

  it("never persists account surfaces through plaintext browser writes", () => {
    assert.equal(
      (page.match(/window\.localStorage\.setItem\(/gu) ?? []).length,
      2,
      "page.tsx may only retain the device FPS and pre-auth theme writes",
    );
    assert.equal(
      (page.match(/window\.sessionStorage\.setItem\(/gu) ?? []).length,
      0,
    );
    assert.match(
      page,
      /window\.localStorage\.setItem\(FPS_COUNTER_STORAGE_KEY, String\(next\)\)/u,
    );
    assert.match(
      page,
      /window\.localStorage\.setItem\("prism_theme", nextTheme\)/u,
    );
    for (const surface of accountSurfaces) {
      assert.doesNotMatch(
        surface.source,
        /(?:localStorage|sessionStorage)\.setItem\(/u,
        `${surface.filename} must use encrypted owner state`,
      );
    }
    assert.match(
      browserOwnerState,
      /const record = await sealBrowserOwnerPayloadV1\([\s\S]*await storeRecord\(record\)/u,
    );
  });

  it("purges only the selected owner's encrypted state, voice clips, and replay captures", () => {
    const purge = sourceBetween(
      "async function purgeBrowserPersistenceForOwner",
      "// ── Inline SVG glyphs",
    );
    assert.match(purge, /deleteAllBrowserOwnerStateV1\(ownerId\)/u);
    assert.match(purge, /purgeResponseCueVoiceClipsForOwner\(ownerId\)/u);
    assert.match(
      purge,
      /purgePendingFaithfulReplayCapturesForOwner\(ownerId\)/u,
    );
    assert.match(
      purge,
      /if \(options\.deleteVaultKey\) \{\s*await deleteBrowserOwnerVaultKeyV1\(ownerId\)/u,
    );

    const deletion = sourceBetween(
      "async function deleteAccountConfirmed",
      "async function submitChangePassword",
    );
    assert.match(
      deletion,
      /purgeBrowserPersistenceForOwner\(ownerGeneration\.ownerId, \{\s*deleteVaultKey: true/u,
    );
  });
});
