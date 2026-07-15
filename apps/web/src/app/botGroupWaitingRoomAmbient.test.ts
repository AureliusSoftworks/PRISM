import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_GROUP_WAITING_ROOM_AMBIENT_CUES,
  BOT_GROUP_WAITING_ROOM_AMBIENT_GLANCE_MS,
  BOT_GROUP_WAITING_ROOM_AMBIENT_IDLE_MAX_MS,
  BOT_GROUP_WAITING_ROOM_AMBIENT_IDLE_MIN_MS,
  BOT_GROUP_WAITING_ROOM_AMBIENT_SETTLE_MS,
  BOT_GROUP_WAITING_ROOM_AMBIENT_SPEAKING_MAX_MS,
  BOT_GROUP_WAITING_ROOM_AMBIENT_SPEAKING_MIN_MS,
  advanceBotGroupWaitingRoomAmbientState,
  botGroupWaitingRoomAmbientPaused,
  createBotGroupWaitingRoomAmbientState,
  reconcileBotGroupWaitingRoomAmbientState,
  type BotGroupWaitingRoomAmbientPair,
  type BotGroupWaitingRoomAmbientState,
} from "./botGroupWaitingRoomAmbient.ts";

const anchors = ["anchor-1", "anchor-2", "anchor-3", "anchor-4", "anchor-5"];
const roamers = ["roamer-1", "roamer-2", "roamer-3"];
const visibleBots = [...anchors, ...roamers];

function state(visitSeed = "visit:ambient"): BotGroupWaitingRoomAmbientState {
  return createBotGroupWaitingRoomAmbientState({
    visitSeed,
    visibleAnchorBotIds: anchors,
    visibleBotIds: visibleBots,
  });
}

function toGlance(
  ambientState: BotGroupWaitingRoomAmbientState,
): BotGroupWaitingRoomAmbientState {
  const next = advanceBotGroupWaitingRoomAmbientState(ambientState);
  assert.equal(next.phase, "glance");
  assert.ok(next.pair);
  return next;
}

function pairKey(pair: BotGroupWaitingRoomAmbientPair): string {
  return [pair.speakerBotId, pair.listenerBotId].sort().join(":");
}

describe("bot group waiting-room ambient schedule", () => {
  it("is deterministic for the visit seed regardless of input ordering", () => {
    const first = state("visit:stable");
    const repeated = createBotGroupWaitingRoomAmbientState({
      visitSeed: "visit:stable",
      visibleAnchorBotIds: anchors.slice().reverse(),
      visibleBotIds: visibleBots.slice().reverse(),
    });
    assert.deepEqual(first, repeated);

    let left = first;
    let right = repeated;
    for (let index = 0; index < 32; index += 1) {
      left = advanceBotGroupWaitingRoomAmbientState(left);
      right = advanceBotGroupWaitingRoomAmbientState(right);
      assert.deepEqual(left, right);
    }

    const other = state("visit:other");
    const otherGlance = advanceBotGroupWaitingRoomAmbientState(other);
    assert.notDeepEqual(
      {
        idleDurationMs: first.phaseDurationMs,
        pair: advanceBotGroupWaitingRoomAmbientState(first).pair,
      },
      {
        idleDurationMs: other.phaseDurationMs,
        pair: otherGlance.pair,
      },
    );
  });

  it("keeps exactly one valid pair across long 6, 7, and 8-person traces", () => {
    for (const castSize of [6, 7, 8]) {
      const cast = visibleBots.slice(0, castSize);
      let current = createBotGroupWaitingRoomAmbientState({
        visitSeed: `visit:long-trace:${castSize}`,
        visibleAnchorBotIds: anchors,
        visibleBotIds: cast,
      });
      for (let transition = 0; transition < 1_000; transition += 1) {
        if (current.phase === "idle") {
          assert.equal(current.pair, null);
        } else {
          assert.ok(current.pair);
          assert.ok(anchors.includes(current.pair.speakerBotId));
          assert.ok(cast.includes(current.pair.listenerBotId));
          assert.notEqual(
            current.pair.speakerBotId,
            current.pair.listenerBotId,
          );
        }
        current = advanceBotGroupWaitingRoomAmbientState(current);
      }
    }
  });

  it("moves through idle, glance, speaking, and settle with one pair", () => {
    let current = state();
    assert.equal(current.phase, "idle");
    assert.equal(current.pair, null);

    current = advanceBotGroupWaitingRoomAmbientState(current);
    assert.equal(current.phase, "glance");
    assert.ok(current.pair);
    const pair = current.pair;
    assert.ok(anchors.includes(pair.speakerBotId));
    assert.ok(visibleBots.includes(pair.listenerBotId));
    assert.notEqual(pair.speakerBotId, pair.listenerBotId);

    current = advanceBotGroupWaitingRoomAmbientState(current);
    assert.equal(current.phase, "speaking");
    assert.deepEqual(current.pair, pair);

    current = advanceBotGroupWaitingRoomAmbientState(current);
    assert.equal(current.phase, "settle");
    assert.deepEqual(current.pair, pair);

    current = advanceBotGroupWaitingRoomAmbientState(current);
    assert.equal(current.phase, "idle");
    assert.equal(current.pair, null);
  });

  it("keeps every phase duration inside its calm bounds", () => {
    for (let seedIndex = 0; seedIndex < 24; seedIndex += 1) {
      let current = state(`visit:duration:${seedIndex}`);
      for (let transition = 0; transition < 20; transition += 1) {
        if (current.phase === "idle") {
          assert.ok(
            current.phaseDurationMs >=
              BOT_GROUP_WAITING_ROOM_AMBIENT_IDLE_MIN_MS,
          );
          assert.ok(
            current.phaseDurationMs <=
              BOT_GROUP_WAITING_ROOM_AMBIENT_IDLE_MAX_MS,
          );
        } else if (current.phase === "glance") {
          assert.equal(
            current.phaseDurationMs,
            BOT_GROUP_WAITING_ROOM_AMBIENT_GLANCE_MS,
          );
        } else if (current.phase === "speaking") {
          assert.ok(
            current.phaseDurationMs >=
              BOT_GROUP_WAITING_ROOM_AMBIENT_SPEAKING_MIN_MS,
          );
          assert.ok(
            current.phaseDurationMs <=
              BOT_GROUP_WAITING_ROOM_AMBIENT_SPEAKING_MAX_MS,
          );
        } else {
          assert.equal(
            current.phaseDurationMs,
            BOT_GROUP_WAITING_ROOM_AMBIENT_SETTLE_MS,
          );
        }
        current = advanceBotGroupWaitingRoomAmbientState(current);
      }
    }
  });

  it("does not immediately repeat a duo when another pair exists", () => {
    let current = toGlance(state("visit:no-repeat"));
    const firstPair = current.pair!;
    current = advanceBotGroupWaitingRoomAmbientState(current);
    current = advanceBotGroupWaitingRoomAmbientState(current);
    current = advanceBotGroupWaitingRoomAmbientState(current);
    current = toGlance(current);
    assert.notEqual(pairKey(current.pair!), pairKey(firstPair));
  });

  it("permits a deterministic roamer listener and uses only static noncanonical cues", () => {
    const initial = createBotGroupWaitingRoomAmbientState({
      visitSeed: "visit:roamer-listener",
      visibleAnchorBotIds: ["anchor"],
      visibleBotIds: ["anchor", "roamer"],
    });
    const glance = toGlance(initial);
    assert.equal(glance.pair?.speakerBotId, "anchor");
    assert.equal(glance.pair?.listenerBotId, "roamer");
    assert.equal(glance.pair?.cue.canonical, false);
    assert.ok(
      BOT_GROUP_WAITING_ROOM_AMBIENT_CUES.some(
        (cue) => cue.id === glance.pair?.cue.id,
      ),
    );
  });
});

describe("bot group waiting-room ambient pause rules", () => {
  const activeRoom = {
    typing: false,
    zenFocused: false,
    coffeeStaging: false,
    pageHidden: false,
    reducedMotion: false,
    roomActive: true,
    interacting: false,
  };

  it("runs only in an active, visible, untouched room", () => {
    assert.equal(botGroupWaitingRoomAmbientPaused(activeRoom), false);
  });

  it("pauses for every room or player state", () => {
    for (const reason of [
      "typing",
      "zenFocused",
      "coffeeStaging",
      "pageHidden",
      "reducedMotion",
      "interacting",
    ] as const) {
      assert.equal(
        botGroupWaitingRoomAmbientPaused({
          ...activeRoom,
          [reason]: true,
        }),
        true,
        reason,
      );
    }
    assert.equal(
      botGroupWaitingRoomAmbientPaused({
        ...activeRoom,
        roomActive: false,
      }),
      true,
      "room inactive",
    );
  });

  it("treats reduced motion as a hard ambient-theater pause", () => {
    assert.equal(
      botGroupWaitingRoomAmbientPaused({
        ...activeRoom,
        reducedMotion: true,
      }),
      true,
    );
  });
});

describe("bot group waiting-room ambient reconciliation", () => {
  it("replaces a deleted active participant deterministically", () => {
    const active = toGlance(state("visit:deletion"));
    const removedBotId = active.pair!.speakerBotId;
    const nextAnchors = anchors.filter((botId) => botId !== removedBotId);
    const nextVisible = visibleBots.filter((botId) => botId !== removedBotId);
    const first = reconcileBotGroupWaitingRoomAmbientState(active, {
      visibleAnchorBotIds: nextAnchors,
      visibleBotIds: nextVisible,
    });
    const repeated = reconcileBotGroupWaitingRoomAmbientState(active, {
      visibleAnchorBotIds: nextAnchors.slice().reverse(),
      visibleBotIds: nextVisible.slice().reverse(),
    });
    assert.deepEqual(first, repeated);
    assert.equal(first.phase, "glance");
    assert.ok(first.pair);
    assert.notEqual(first.pair.speakerBotId, removedBotId);
    assert.ok(nextAnchors.includes(first.pair.speakerBotId));
    assert.ok(nextVisible.includes(first.pair.listenerBotId));
  });

  it("falls safely back to idle when deletion leaves no valid pair", () => {
    const active = toGlance(state("visit:deletion-fallback"));
    const reconciled = reconcileBotGroupWaitingRoomAmbientState(active, {
      visibleAnchorBotIds: ["only-bot"],
      visibleBotIds: ["only-bot"],
    });
    assert.equal(reconciled.phase, "idle");
    assert.equal(reconciled.pair, null);
    const advanced = advanceBotGroupWaitingRoomAmbientState(reconciled);
    assert.equal(advanced.phase, "idle");
    assert.equal(advanced.pair, null);
    assert.equal(advanced.cycle, reconciled.cycle + 1);
  });
});
