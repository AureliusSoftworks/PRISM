import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";

import {
  DEBATE_MYSTERY_EVIDENCE_CHIME,
  debateMysterySfxCueForAction,
  debateMysterySfxVoices,
  playDebateMysterySfx,
} from "./debateMysterySfx.ts";

test("builds the evidence discovery cue as a restrained descending chime", () => {
  assert.equal(DEBATE_MYSTERY_EVIDENCE_CHIME.length, 3);
  assert.deepEqual(
    DEBATE_MYSTERY_EVIDENCE_CHIME.map((voice) => voice.delayMs),
    [0, 135, 320],
  );
  assert.ok(
    DEBATE_MYSTERY_EVIDENCE_CHIME.every(
      (voice, index, voices) =>
        index === 0 || voice.playbackRate < voices[index - 1]!.playbackRate,
    ),
  );
  assert.ok(
    DEBATE_MYSTERY_EVIDENCE_CHIME.every(
      (voice, index, voices) => index === 0 || voice.gain < voices[index - 1]!.gain,
    ),
  );

  for (const voice of DEBATE_MYSTERY_EVIDENCE_CHIME) {
    const asset = statSync(new URL(`../../public${voice.url}`, import.meta.url));
    assert.ok(asset.isFile());
    assert.ok(asset.size > 7_000);
  }
});

test("gives newly acquired evidence priority over ordinary action navigation", () => {
  assert.equal(
    debateMysterySfxCueForAction({
      action: "travel",
      acquiredEvidence: true,
      nextPlayPhase: "investigation",
    }),
    "evidence",
  );
  assert.equal(
    debateMysterySfxCueForAction({
      action: "travel",
      acquiredEvidence: false,
      nextPlayPhase: "investigation",
    }),
    "navigate",
  );
  assert.equal(
    debateMysterySfxCueForAction({
      action: "begin_interview",
      acquiredEvidence: false,
      nextPlayPhase: "investigation",
    }),
    "enter",
  );
  assert.equal(
    debateMysterySfxCueForAction({
      action: "end_activity",
      acquiredEvidence: false,
      nextPlayPhase: "theory",
    }),
    "theory",
  );
  assert.equal(
    debateMysterySfxCueForAction({
      action: "inspect",
      acquiredEvidence: false,
      nextPlayPhase: "investigation",
    }),
    null,
  );
  assert.equal(debateMysterySfxVoices("evidence").length, 3);
  assert.equal(debateMysterySfxVoices("map").length, 1);
  assert.equal(debateMysterySfxVoices("paper").length, 1);
  assert.equal(debateMysterySfxVoices("folder").length, 1);
  assert.equal(debateMysterySfxVoices("clip").length, 1);
  assert.equal(debateMysterySfxVoices("pencil").length, 1);
});

test("keeps every Whodunnit cue behind the shared Audio controls", async () => {
  assert.equal(
    await playDebateMysterySfx({
      cue: "evidence",
      enabled: false,
      volume: 1,
    }),
    false,
  );
  assert.equal(
    await playDebateMysterySfx({
      cue: "navigate",
      enabled: true,
      volume: 0,
    }),
    false,
  );
});
