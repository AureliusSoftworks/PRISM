import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const replaySource = readFileSync(
  new URL("./replayManifest.ts", import.meta.url),
  "utf8",
);
const miniAvatarSource = readFileSync(
  new URL("./chatMiniBotAvatar.tsx", import.meta.url),
  "utf8",
);

test("single-bot surfaces bind voice light targets while live group stages stay static", () => {
  for (const surface of ["chat", "studio", "bot-preview", "debate"]) {
    assert.match(
      pageSource,
      new RegExp(`botVoiceLightTarget\\(\\s*"${surface}"`, "u"),
      `${surface} should bind a full-size avatar or voice lifecycle`,
    );
  }
  assert.doesNotMatch(
    signalSource,
    /botVoiceLightTarget\(\s*"signal",\s*args\.currentEpisode\.id,\s*participantId/u,
  );
  assert.doesNotMatch(
    pageSource,
    /voiceLightTarget:\s*botVoiceLightTarget\(\s*"coffee"/u,
  );
  assert.match(
    pageSource,
    /liveVoiceLightEnvelopeEnabled = playbackSurface !== "signal"/u,
  );
  assert.match(signalSource, /voiceLightTarget:\s*undefined/u);
  assert.match(
    pageSource,
    /mouth phonemes own the live audio-rate budget[\s\S]{0,100}voiceLightTarget:\s*undefined/u,
  );
  assert.doesNotMatch(miniAvatarSource, /voiceLight|avatarLightMode/u);
});

test("faithful Coffee and Signal replay carry levels and retain old-manifest fallback", () => {
  assert.match(pageSource, /replayVoiceLightLevelAtV2\(/u);
  assert.match(signalSource, /replayVoiceLightLevelAtV2\(/u);
  assert.match(signalSource, /\? 0\.22\s*:\s*0/u);
  assert.match(pageSource, /\? 0\.22\s*:\s*0/u);
  assert.match(replaySource, /"coffee-table-playwright-v2"/u);
  assert.match(replaySource, /"signal-studio-playwright-v2"/u);
});
