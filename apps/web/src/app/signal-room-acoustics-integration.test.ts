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
      /playListenerReactionVoice\(\{[\s\S]{0,500}roomAcoustics: SIGNAL_STUDIO_VOICE_ROOM_SEND/u,
    );
    assert.match(
      pageSource,
      /enqueueRobotVoiceMode\(\{[\s\S]{0,600}roomAcoustics: SIGNAL_STUDIO_VOICE_ROOM_SEND/u,
    );
    assert.match(
      pageSource,
      /enqueueEnglishVoice\([\s\S]{0,700}SIGNAL_STUDIO_VOICE_ROOM_SEND/u,
    );
    assert.match(voiceSource, /connectRoomAcoustics\(\{/u);
    assert.match(voiceSource, /roomConnection\.release\(\)/u);
  });

  it("reverbs studio Foley while leaving the ambience bed dry", () => {
    assert.match(
      signalSource,
      /foleyRoomAcoustics=\{SIGNAL_STUDIO_FOLEY_ROOM_SEND\}/u,
    );
    assert.match(
      atmosphereSource,
      /send: bus === "foley" \? foleyRoomAcoustics : null/u,
    );
    assert.match(
      atmosphereSource,
      /audio\.addEventListener\("ended", \(\) => releaseAudio\(audio, true\)/u,
    );
  });
});
