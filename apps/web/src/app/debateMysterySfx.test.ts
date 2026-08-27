import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";

import {
  DEBATE_MYSTERY_TEXT_BOTTISH_VOLUME_RATIO,
  DEBATE_MYSTERY_DESK_ITEM_PICKUP_VOLUME_RATIO,
  DEBATE_MYSTERY_EVIDENCE_CHIME,
  DEBATE_MYSTERY_SFX_COOLDOWN_MS,
  debateMysteryDialoguePresentationDismissed,
  debateMysteryDeskItemSfxPlan,
  debateMysterySfxCueForAction,
  debateMysterySfxVoices,
  debateMysteryTextBottishDurationMs,
  debateMysteryTextBottishShouldStart,
  playDebateMysteryDeskItemSfx,
  playDebateMysterySfx,
} from "./debateMysterySfx.ts";

test("starts Bottish once for streaming text-only delivery and never for anonymous Babble", () => {
  const narratorBeat = {
    audible: false,
    delivery: "text_only" as const,
    key: "observation:1",
    startedKey: null,
    streaming: true,
    visibleText: "The kn",
  };
  assert.equal(debateMysteryTextBottishShouldStart(narratorBeat), true);
  assert.equal(
    debateMysteryTextBottishShouldStart({ ...narratorBeat, visibleText: "   " }),
    false,
    "whitespace-only text stays quiet",
  );
  assert.equal(
    debateMysteryTextBottishShouldStart({ ...narratorBeat, startedKey: narratorBeat.key }),
    false,
    "one text presentation starts only once",
  );
  assert.equal(
    debateMysteryTextBottishShouldStart({ ...narratorBeat, delivery: "anonymous_babble" }),
    false,
    "anonymous speakers own a prepared Babble carrier instead",
  );
  assert.equal(
    debateMysteryTextBottishShouldStart({ ...narratorBeat, delivery: "spoken" }),
    false,
  );
  assert.equal(
    debateMysteryTextBottishShouldStart({ ...narratorBeat, audible: true }),
    false,
  );
  assert.equal(
    debateMysteryTextBottishShouldStart({ ...narratorBeat, streaming: false }),
    false,
  );
  assert.equal(DEBATE_MYSTERY_TEXT_BOTTISH_VOLUME_RATIO, 0.28);
  assert.equal(debateMysteryTextBottishDurationMs("short"), 1_200);
  assert.equal(debateMysteryTextBottishDurationMs("x".repeat(100)), 3_400);
});

test("dismisses every completed dialogue presentation without treating its first mount as a close", () => {
  assert.equal(debateMysteryDialoguePresentationDismissed(null, "opening"), false);
  assert.equal(debateMysteryDialoguePresentationDismissed("opening", "opening"), false);
  assert.equal(debateMysteryDialoguePresentationDismissed("opening", "observation"), true);
  assert.equal(debateMysteryDialoguePresentationDismissed("observation", null), true);
  assert.equal(DEBATE_MYSTERY_SFX_COOLDOWN_MS["dialogue-dismiss"], 0);
  assert.equal("dialogue-blip" in DEBATE_MYSTERY_SFX_COOLDOWN_MS, false);
});

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
  assert.equal(debateMysterySfxVoices("dialogue-dismiss").length, 1);
  assert.equal(debateMysterySfxVoices("paper").length, 1);
  assert.equal(debateMysterySfxVoices("paper-pickup").length, 1);
  assert.equal(debateMysterySfxVoices("paper-place").length, 1);
  assert.equal(debateMysterySfxVoices("folder").length, 1);
  assert.equal(debateMysterySfxVoices("clip").length, 1);
  assert.equal(debateMysterySfxVoices("pencil").length, 1);
});

test("uses compact, distinct paper recordings for Desk pickup and placement", () => {
  const pickup = debateMysterySfxVoices("paper-pickup")[0]!;
  const placement = debateMysterySfxVoices("paper-place")[0]!;
  assert.equal(pickup.url, "/audio/debate/desk-paper-pickup-01.mp3");
  assert.equal(placement.url, "/audio/debate/desk-paper-place-01.mp3");
  assert.notEqual(pickup.playbackRate, placement.playbackRate);
  for (const voice of [pickup, placement]) {
    const asset = statSync(new URL(`../../public${voice.url}`, import.meta.url));
    assert.ok(asset.isFile());
    assert.ok(asset.size > 7_000);
  }
});

test("uses one physical evidence impact with pickup at exactly half placement volume", () => {
  const item = { adjective: "Brass", object: "key", title: "A brass key" };
  const pickup = debateMysteryDeskItemSfxPlan({ item, moment: "pickup", volume: 0.8 });
  const placement = debateMysteryDeskItemSfxPlan({ item, moment: "place", volume: 0.8 });
  assert.equal(DEBATE_MYSTERY_DESK_ITEM_PICKUP_VOLUME_RATIO, 0.5);
  assert.equal(pickup.material, "metal");
  assert.equal(pickup.url, placement.url);
  assert.equal(pickup.trim, placement.trim);
  assert.equal(pickup.volume, placement.volume * 0.5);
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
  assert.equal(
    await playDebateMysteryDeskItemSfx({
      item: { adjective: "Cracked", object: "mug" },
      moment: "place",
      enabled: false,
      volume: 1,
    }),
    false,
  );
});
