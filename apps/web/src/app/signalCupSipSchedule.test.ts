import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNAL_CUP_SIP_MIN_TURN_GAP,
  signalCupSipAllowedDuringSpeechV1,
  signalCupSipScheduleV1,
  signalCupSipTurnGapV1,
  type SignalCupSipTurn,
} from "./signalCupSipSchedule.ts";

test("ambient sips begin only inside the other participant's audible line", () => {
  assert.equal(
    signalCupSipAllowedDuringSpeechV1({
      roleSpeaking: false,
      otherRoleSpeaking: true,
    }),
    true,
  );
  assert.equal(
    signalCupSipAllowedDuringSpeechV1({
      roleSpeaking: false,
      otherRoleSpeaking: false,
    }),
    false,
  );
  assert.equal(
    signalCupSipAllowedDuringSpeechV1({
      roleSpeaking: true,
      otherRoleSpeaking: true,
    }),
    false,
  );
  assert.equal(
    signalCupSipAllowedDuringSpeechV1({
      roleSpeaking: false,
      otherRoleSpeaking: true,
      producerGuestRole: true,
    }),
    false,
  );
});

const EPISODE = "12d3d47ed24f3ecbfd3a5c75";

/** Signal alternates host and guest, which is what gives a bot time to drink. */
function interview(turnCount: number): SignalCupSipTurn[] {
  return Array.from({ length: turnCount }, (_unused, index) => ({
    id: `m${index}`,
    speakerRole: index % 2 === 0 ? "host" : "guest",
  }));
}

function scheduleAt(
  turns: readonly SignalCupSipTurn[],
  presentedIndex: number | null,
  sipAllowed = true,
) {
  return signalCupSipScheduleV1({
    episodeId: EPISODE,
    role: "guest",
    turns,
    presentedIndex,
    sipAllowed,
  });
}

test("the level never moves without a sip on screen first", () => {
  // This is the property review 12d3d47e's note was about: "Randy's coffee
  // drained without him drinking it." A fixture asserting a particular count
  // would pass while still permitting silent steps, so walk the whole episode
  // and require that every increase was preceded by a visible sip.
  const turns = interview(40);
  let previousCount = 0;
  let sippedSinceLastStep = false;
  for (let index = 0; index < turns.length; index += 1) {
    const { sipCount, sippingNow } = scheduleAt(turns, index);
    assert.ok(
      sipCount >= previousCount,
      `level went backwards at turn ${index}: ${previousCount} -> ${sipCount}`,
    );
    if (sipCount > previousCount) {
      assert.ok(
        sippedSinceLastStep,
        `turn ${index} drank ${sipCount - previousCount} sip(s) nobody saw`,
      );
      assert.equal(
        sipCount - previousCount,
        1,
        `turn ${index} swallowed more than one sip at once`,
      );
      sippedSinceLastStep = false;
    }
    if (sippingNow) sippedSinceLastStep = true;
    previousCount = sipCount;
  }
  assert.ok(previousCount > 0, "a 40-turn interview should drink something");
});

test("a gap between turns holds the level instead of snapping it", () => {
  // `activeMessage` is null through generation holds and thinking beats. The
  // caller holds the last aired turn, so the count has to stay put and only
  // the sprite goes quiet.
  const turns = interview(24);
  for (let index = 0; index < turns.length; index += 1) {
    const onScreen = scheduleAt(turns, index);
    const inGap = scheduleAt(turns, index, false);
    assert.equal(
      inGap.sipCount,
      onScreen.sipCount,
      `gap after turn ${index} changed the level`,
    );
    assert.equal(inGap.sippingNow, false);
  }
});

test("a bot never drinks through its own turn", () => {
  const turns = interview(30);
  for (let index = 0; index < turns.length; index += 1) {
    if (turns[index]!.speakerRole !== "guest") continue;
    assert.equal(
      scheduleAt(turns, index).sippingNow,
      false,
      `guest sipped while speaking at turn ${index}`,
    );
  }
});

test("a listening bot can sip while the other participant holds the floor", () => {
  const turns = interview(40);
  const onOtherParticipantTurn = turns.some((turn, index) =>
    turn.speakerRole === "host" && scheduleAt(turns, index).sippingNow,
  );

  assert.equal(
    onOtherParticipantTurn,
    true,
    "the deterministic guest schedule should use a host-speaking turn",
  );
});

test("sips are seeded per message so a re-sliced transcript agrees", () => {
  // An index-seeded coin would re-decide every past turn if the transcript
  // were reloaded partially; replay would then drift from the live session.
  const full = interview(30);
  const prefix = full.slice(0, 20);
  for (let index = 0; index < prefix.length; index += 1) {
    assert.deepEqual(
      scheduleAt(prefix, index),
      scheduleAt(full, index),
      `turn ${index} disagreed between the partial and full transcript`,
    );
  }
});

test("replaying the same episode twice gives the same cup", () => {
  const turns = interview(30);
  for (let index = 0; index < turns.length; index += 1) {
    assert.deepEqual(scheduleAt(turns, index), scheduleAt(turns, index));
  }
});

test("nothing is drunk before the first turn airs", () => {
  assert.deepEqual(scheduleAt(interview(10), null), {
    sipCount: 0,
    sippingNow: false,
  });
  assert.deepEqual(scheduleAt([], 0), { sipCount: 0, sippingNow: false });
});

test("the drinking rate sets the turn gap", () => {
  assert.equal(signalCupSipTurnGapV1(1), SIGNAL_CUP_SIP_MIN_TURN_GAP);
  assert.ok(signalCupSipTurnGapV1(2) < SIGNAL_CUP_SIP_MIN_TURN_GAP);
  assert.ok(signalCupSipTurnGapV1(0.5) > SIGNAL_CUP_SIP_MIN_TURN_GAP);
  // Rate zero means the Power removed the cup entirely; the caller returns
  // before reaching here, so the gap must stay sane rather than divide out.
  assert.ok(signalCupSipTurnGapV1(0) >= 1);

  const turns = interview(40);
  const slow = signalCupSipScheduleV1({
    episodeId: EPISODE,
    role: "guest",
    turns,
    presentedIndex: turns.length - 1,
    powerRateMultiplier: 0.5,
  });
  const fast = signalCupSipScheduleV1({
    episodeId: EPISODE,
    role: "guest",
    turns,
    presentedIndex: turns.length - 1,
    powerRateMultiplier: 2,
  });
  assert.ok(
    fast.sipCount > slow.sipCount,
    `fast ${fast.sipCount} should outdrink slow ${slow.sipCount}`,
  );
});
