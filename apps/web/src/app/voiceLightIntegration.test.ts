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

test("full-size bot surfaces bind performance-scoped voice light targets", () => {
  for (const surface of ["chat", "coffee", "studio", "bot-preview", "debate"]) {
    assert.match(
      pageSource,
      new RegExp(`botVoiceLightTarget\\(\\s*"${surface}"`, "u"),
      `${surface} should bind a full-size avatar or voice lifecycle`,
    );
  }
  assert.match(
    signalSource,
    /botVoiceLightTarget\(\s*"signal",\s*args\.currentEpisode\.id,\s*participantId/u,
  );
  assert.match(pageSource, /voiceLightTarget=\{avatarState\.voiceLightTarget\}/u);
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
