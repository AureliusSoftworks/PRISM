import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

describe("Signal Premium voice readiness contract", () => {
  it("requires an explicit Premium selection and an online episode lane", () => {
    assert.match(
      pageSource,
      /premiumVoicePrefetchEnabled=\{Boolean\([\s\S]{0,360}?voiceMode === "english"[\s\S]{0,180}?englishVoiceEngine ===[\s\S]{0,80}?"elevenlabs"[\s\S]{0,120}?signalEpisodeResponseMode !== "local"/u,
    );
    assert.match(
      pageSource,
      /const expectedEngine: EnglishVoiceEngine = pinnedSignalEngine \?\?[\s\S]{0,180}?offlineOnly \? "builtin" : voiceSelection\.englishVoiceEngine/u,
    );
  });

  it("uses one timestamped cached clip for playback and faithful capture", () => {
    assert.match(
      pageSource,
      /includeAlignment: premiumAlignmentRequested/u,
    );
    assert.match(
      pageSource,
      /const preparedClipPromise = signalVoiceClipCacheRef\.current\.get\([\s\S]{0,760}?signalVoiceClipMatchesEpisodeEngine/u,
    );
    assert.match(
      pageSource,
      /const resolvedClip = clip\.clip[\s\S]{0,500}?storeCapturedReplayVoiceAudio\([\s\S]{0,260}?bytes: resolvedClip\.bytes/u,
    );
    assert.match(
      pageSource,
      /enqueueEnglishVoice\([\s\S]{0,180}?resolvedClip\.bytes[\s\S]{0,260}?sourceAlignment: resolvedClip\.alignment/u,
    );
    assert.match(
      pageSource,
      /signalVoiceConsumedEpisodeByMessageIdRef\.current\.get\(message\.id\)[\s\S]{0,120}?return null/u,
    );
    assert.match(
      pageSource,
      /signalVoicePrefetchAttemptEpisodeByMessageIdRef\.current\.get\([\s\S]{0,180}?return null/u,
    );
    assert.match(
      pageSource,
      /if \(playbackSurface === "signal"\)[\s\S]{0,900}?signalVoiceConsumedEpisodeByMessageIdRef\.current\.set/u,
    );
  });

  it("falls back on demand after a failed prefetch instead of breaking the show", () => {
    assert.match(
      pageSource,
      /const preparedClipPromise = signalVoiceClipCacheRef\.current\.get[\s\S]{0,240}?signalVoiceClipCacheRef\.current\.delete\(message\.id\)/u,
    );
    assert.match(
      pageSource,
      /if \(!clip && !controller\.signal\.aborted\) \{[\s\S]{0,260}?requestBotcastEnglishClipWithFallback/u,
    );
    assert.match(
      signalSource,
      /Promise\.resolve\(onPrefetchUtterance\(message, bot\)\)\.catch\([\s\S]{0,80}?false/u,
    );
  });

  it("pins each Signal participant to the first resolved episode voice family", () => {
    assert.match(
      pageSource,
      /signalVoiceEngineByEpisodeParticipantRef = useRef<[\s\S]{0,120}SignalVoiceEngineFamily/u,
    );
    assert.match(
      pageSource,
      /playbackSurface === "signal" && pinnedSignalEngine[\s\S]{0,360}pinnedSignalEngine === "elevenlabs"/u,
    );
    assert.match(
      pageSource,
      /const signalVoiceContinuityKey = `\$\{message\.episodeId\}:\$\{botSummary\.id\}`[\s\S]{0,700}signalVoiceClipMatchesEpisodeEngine/u,
    );
    assert.match(
      pageSource,
      /currentEngine && resolvedEngine !== currentEngine[\s\S]{0,240}signalVoiceEngineByEpisodeParticipantRef\.current\.set/u,
    );
  });

  it("cancels episode-scoped cached work when Watch is stopped or abandoned", () => {
    assert.match(
      signalSource,
      /onInvalidatePrefetchedEpisode\?\.\(episodeId\)[\s\S]{0,180}?\/bake\/cancel/u,
    );
    assert.match(
      pageSource,
      /signalVoicePrefetchSchedulerRef\.current\.invalidateEpisode\(episodeId\)/u,
    );
  });
});
