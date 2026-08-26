import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const atmosphereSource = readFileSync(
  new URL("./session-atmosphere-audio.ts", import.meta.url),
  "utf8",
);
const voiceSource = readFileSync(
  new URL("./voiceEffects.ts", import.meta.url),
  "utf8",
);

describe("Signal room acoustics integration", () => {
  it("places every Signal voice lane in the same restrained room", () => {
    assert.match(
      pageSource,
      /playListenerReactionVoice\(\{[\s\S]{0,1000}roomAcoustics: SIGNAL_STUDIO_VOICE_ROOM_SEND/u,
    );
    assert.match(
      pageSource,
      /const voiceRoomAcoustics =[\s\S]{0,260}: SIGNAL_STUDIO_VOICE_ROOM_SEND/u,
    );
    assert.match(
      pageSource,
      /enqueueRobotVoiceMode\(\{[\s\S]{0,1200}roomAcoustics: voiceRoomAcoustics/u,
    );
    assert.match(
      pageSource,
      /enqueueEnglishVoice\([\s\S]{0,1400}voiceRoomAcoustics/u,
    );
    assert.match(voiceSource, /connectRoomAcoustics\(\{/u);
    assert.match(voiceSource, /roomConnection\.release\(\)/u);
  });

  it("lets completed voice tails overlap natural handoffs without weakening interruption stops", () => {
    assert.match(
      voiceSource,
      /completedVoiceTailStops\[channel\]\.add\(stopCompletedTail\)[\s\S]{0,200}VOICE_COMPLETED_OVERLAP_TAIL_MS/u,
    );
    assert.match(
      voiceSource,
      /stopRealtimeVoiceAudio\(channel, \{ preserveCompletedTails: true \}\)/u,
    );
    const stopStart = voiceSource.indexOf("export function teardownRealtimeVoiceAudioImmediately(");
    const stopEnd = voiceSource.indexOf("export function voiceReleaseGainAt", stopStart);
    const stopSource = voiceSource.slice(stopStart, stopEnd);
    assert.ok(stopStart >= 0 && stopEnd > stopStart);
    assert.match(
      stopSource,
      /active\.roomConnection\?\.disconnect\(\);\s*active\.roomConnection = null;/u,
    );
    assert.match(stopSource, /if \(!options\.preserveCompletedTails\)/u);
    assert.ok(
      stopSource.indexOf("active.roomConnection?.disconnect()") <
        stopSource.indexOf("if (!options.preserveCompletedTails)"),
    );
    assert.match(
      voiceSource,
      /export function stopRealtimeVoiceAudio\([\s\S]{0,280}releaseRealtimeVoiceAudio/u,
    );
  });

  it("reverbs studio Foley while leaving the ambience bed dry", () => {
    assert.match(
      signalSource,
      /foleyRoomAcoustics=\{SIGNAL_STUDIO_FOLEY_ROOM_SEND\}/u,
    );
    assert.match(
      atmosphereSource,
      /send: bus === "foley" \? roomAcoustics : null/u,
    );
    assert.match(
      atmosphereSource,
      /audio\.addEventListener\("ended", \(\) => releaseAudio\(audio, true\)/u,
    );
  });

  it("stages direct voices from saved seats while keeping one shared room", () => {
    assert.match(
      signalSource,
      /signalStudioVoicePan\(\s*selectedShow\?\.studioLayout,\s*message\.speakerRole/u,
    );
    assert.match(
      signalSource,
      /signalStudioVoicePan\(show\.studioLayout, message\.speakerRole\)/u,
    );
    assert.match(
      pageSource,
      /playListenerReactionVoice\(\{[\s\S]{0,600}roomAcoustics: SIGNAL_STUDIO_VOICE_ROOM_SEND,[\s\S]{0,80}stereoPan/u,
    );
    assert.match(
      pageSource,
      /enqueueRobotVoiceMode\(\{[\s\S]{0,900}roomAcoustics: voiceRoomAcoustics,[\s\S]{0,120}stereoPan/u,
    );
    assert.match(
      pageSource,
      /enqueueEnglishVoice\([\s\S]{0,1200}voiceRoomAcoustics,[\s\S]{0,120}stereoPan/u,
    );
    assert.match(
      voiceSource,
      /connectRoomAcoustics\(\{[\s\S]{0,180}send: args\.roomAcoustics,[\s\S]{0,80}stereoPan: args\.stereoPan/u,
    );
  });
});
