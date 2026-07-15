import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRelationshipDepthTransition,
  reduceRelationshipDepthTransition,
  relationshipDepthTransitionInteractionLock,
  type RelationshipDepthAnchorGeometry,
  type RelationshipDepthCheckpoint,
  type RelationshipDepthEndpoint,
  type RelationshipDepthTransitionState,
} from "./relationshipDepthTransition.ts";

function endpoint(
  surface: RelationshipDepthEndpoint["surface"],
  key: string,
  contextKey: string | null,
  identityKey: string | null,
  activityKey: string | null,
): RelationshipDepthEndpoint {
  return { surface, key, contextKey, identityKey, activityKey };
}

const libraryA = endpoint("library", "library:all:bot-a", null, "bot:a", null);
const libraryPrism = endpoint(
  "library",
  "library:all:prism",
  null,
  "prism",
  null,
);
const roomA = endpoint(
  "group-room",
  "room:friends:visit-7:bot-a",
  null,
  "bot:a",
  null,
);
const historyA = endpoint(
  "history",
  "history:episode-a",
  "prism",
  "bot:a",
  "conversation:prism",
);
const homeA = endpoint(
  "home",
  "home:bot-a:episode-a",
  "bot:a",
  "bot:a",
  "conversation:a",
);
const homeB = endpoint(
  "home",
  "home:bot-b:episode-b",
  "bot:b",
  "bot:b",
  "conversation:b",
);
const prismHome = endpoint(
  "home",
  "home:prism:episode-prism",
  "prism",
  "prism",
  "conversation:prism",
);
const transcriptA = endpoint(
  "transcript",
  "transcript:episode-a",
  "bot:a",
  "bot:a",
  "conversation:a",
);

function geometry(identityKey = "bot:a"): RelationshipDepthAnchorGeometry {
  return {
    identityKey,
    viewport: { width: 1440, height: 900 },
    source: { left: 120, top: 180, width: 96, height: 96 },
    destination: { left: 520, top: 170, width: 400, height: 520 },
  };
}

function checkpoint(
  source: RelationshipDepthEndpoint,
): RelationshipDepthCheckpoint {
  return {
    key: `checkpoint:${source.key}`,
    endpoint: source,
    focusKey: `focus:${source.key}`,
  };
}

function start({
  source = libraryA,
  destination = homeA,
  anchor = geometry(),
  reducedMotion = false,
  activeTurnRunning = false,
}: {
  source?: RelationshipDepthEndpoint;
  destination?: RelationshipDepthEndpoint;
  anchor?: RelationshipDepthAnchorGeometry | null;
  reducedMotion?: boolean;
  activeTurnRunning?: boolean;
} = {}) {
  const sourceCheckpoint = checkpoint(source);
  const update = createRelationshipDepthTransition({
    id: "transition-1",
    source,
    destination,
    checkpoint: sourceCheckpoint,
    geometry: anchor,
    reducedMotion,
    activeTurnRunning,
  });
  assert.ok(update);
  return { ...update, checkpoint: sourceCheckpoint };
}

function dispatch(
  state: RelationshipDepthTransitionState,
  type: "active-turn-interrupted" | "beat-complete" | "endpoint-ready",
) {
  return reduceRelationshipDepthTransition(state, {
    type,
    transitionId: state.id,
  });
}

function settleForward(initial: RelationshipDepthTransitionState) {
  let update = dispatch(initial, "beat-complete");
  assert.equal(update.state.phase, "handoff");
  update = dispatch(update.state, "endpoint-ready");
  assert.equal(update.state.phase, "destination-beat");
  update = dispatch(update.state, "beat-complete");
  assert.equal(update.state.phase, "settled");
  return update.state;
}

describe("relationship-depth transition planning", () => {
  it("uses matching Library identity anchors for persona and Prism Homes", () => {
    const persona = start();
    assert.equal(persona.state.plan.motion, "shared-anchor");
    assert.equal(persona.state.plan.spatial, true);

    const prism = start({
      source: libraryPrism,
      destination: prismHome,
      anchor: geometry("prism"),
    });
    assert.equal(prism.state.plan.motion, "shared-anchor");
    assert.equal(prism.state.plan.contextChanges, true);
  });

  it("uses the same shared-anchor contract for group rooms and History", () => {
    for (const source of [roomA, historyA]) {
      const update = start({ source });
      assert.equal(update.state.plan.motion, "shared-anchor");
      assert.equal(update.state.geometry?.identityKey, "bot:a");
      assert.strictEqual(update.state.checkpoint, update.checkpoint);
    }
  });

  it("uses restrained pullback swaps for every direct relationship change", () => {
    for (const [source, destination] of [
      [prismHome, homeA],
      [homeA, prismHome],
      [homeA, homeB],
    ] as const) {
      const update = start({ source, destination });
      assert.equal(update.state.plan.motion, "pullback-swap");
      assert.equal(update.state.plan.spatial, true);
      assert.equal(update.state.plan.atmosphere, "crossfade");
      assert.equal(update.state.geometry, null);
    }
  });

  it("does nothing for the exact current endpoint", () => {
    assert.equal(
      createRelationshipDepthTransition({
        id: "same",
        source: homeA,
        destination: homeA,
        checkpoint: checkpoint(homeA),
      }),
      null,
    );
  });

  it("treats another episode in the same Home as neutral motion but a new activity", () => {
    const otherEpisode = { ...homeA, key: "home:bot-a:episode-2", activityKey: "conversation:a-2" };
    const update = start({
      source: homeA,
      destination: otherEpisode,
      activeTurnRunning: true,
    });
    assert.equal(update.state.plan.motion, "crossfade");
    assert.equal(update.state.plan.contextChanges, false);
    assert.equal(update.state.plan.activityChanges, true);
    assert.equal(update.state.plan.interruptActiveTurn, true);
    assert.equal(update.state.plan.interactionLock, "surface");
  });

  it("keeps Transcript presentation depth-neutral and preserves its active turn", () => {
    const update = start({
      source: homeA,
      destination: transcriptA,
      activeTurnRunning: true,
    });
    assert.equal(update.state.plan.motion, "lateral");
    assert.equal(update.state.plan.spatial, false);
    assert.equal(update.state.plan.contextChanges, false);
    assert.equal(update.state.plan.activityChanges, false);
    assert.equal(update.state.plan.interruptActiveTurn, false);
    assert.equal(update.state.plan.interactionLock, "navigation");
    assert.equal(update.state.phase, "source-beat");
    assert.deepEqual(update.effects, []);
  });

  it("never turns History-to-Transcript presentation into depth zoom", () => {
    const historyTranscript = {
      ...transcriptA,
      contextKey: historyA.contextKey,
      activityKey: historyA.activityKey,
    };
    const update = start({
      source: historyA,
      destination: historyTranscript,
    });
    assert.equal(update.state.plan.motion, "lateral");
    assert.equal(update.state.plan.spatial, false);
    assert.equal(update.state.geometry, null);
  });

  it("falls back when either anchor rectangle or identity is unusable", () => {
    const invalidGeometry: (RelationshipDepthAnchorGeometry | null)[] = [
      null,
      { ...geometry(), source: { ...geometry().source, width: 0 } },
      { ...geometry(), destination: { ...geometry().destination, height: 0 } },
      { ...geometry(), source: { ...geometry().source, left: Number.NaN } },
      {
        ...geometry(),
        destination: { ...geometry().destination, top: Number.POSITIVE_INFINITY },
      },
      { ...geometry(), source: { left: 1500, top: 10, width: 50, height: 50 } },
      { ...geometry(), identityKey: "bot:b" },
    ];
    for (const anchor of invalidGeometry) {
      const update = start({ anchor });
      assert.equal(update.state.plan.motion, "crossfade");
      assert.equal(update.state.plan.spatial, false);
      assert.equal(update.state.geometry, null);
    }
  });

  it("uses a short non-spatial policy for every reduced-motion route class", () => {
    const routes = [
      [libraryA, homeA, geometry()],
      [roomA, homeA, geometry()],
      [historyA, homeA, geometry()],
      [homeA, homeB, null],
      [homeA, transcriptA, null],
    ] as const;
    for (const [source, destination, anchor] of routes) {
      const update = start({
        source,
        destination,
        anchor,
        reducedMotion: true,
      });
      assert.equal(update.state.plan.motion, "crossfade");
      assert.equal(update.state.plan.spatial, false);
      assert.equal(update.state.geometry, null);
    }
  });
});

describe("relationship-depth transition lifecycle", () => {
  it("commits exactly at handoff and settles the destination", () => {
    let update = start();
    assert.equal(update.state.phase, "source-beat");
    assert.deepEqual(update.effects, []);

    update = { ...dispatch(update.state, "beat-complete"), checkpoint: update.checkpoint };
    assert.equal(update.state.phase, "handoff");
    assert.equal(update.state.mountedEndpoint, "destination");
    assert.deepEqual(update.effects, [
      { type: "commit-destination", endpoint: homeA },
    ]);

    update = { ...dispatch(update.state, "endpoint-ready"), checkpoint: update.checkpoint };
    assert.equal(update.state.phase, "destination-beat");
    update = { ...dispatch(update.state, "beat-complete"), checkpoint: update.checkpoint };
    assert.equal(update.state.phase, "settled");
    assert.equal(update.state.settledAt, "destination");
    assert.equal(relationshipDepthTransitionInteractionLock(update.state), "none");
  });

  it("interrupts an active turn before any visual or route commit", () => {
    let update = start({
      source: homeA,
      destination: homeB,
      activeTurnRunning: true,
    });
    assert.equal(update.state.phase, "interrupting");
    assert.deepEqual(update.effects, [
      { type: "interrupt-active-turn", transitionId: "transition-1" },
    ]);
    const premature = dispatch(update.state, "beat-complete");
    assert.strictEqual(premature.state, update.state);
    assert.deepEqual(premature.effects, []);

    update = {
      ...dispatch(update.state, "active-turn-interrupted"),
      checkpoint: update.checkpoint,
    };
    assert.equal(update.state.phase, "source-beat");
    assert.deepEqual(update.effects, []);
  });

  it("reverses Back and Escape through the exact saved checkpoint", () => {
    for (const reason of ["back", "escape"] as const) {
      const started = start({ source: roomA });
      let state = settleForward(started.state);
      let update = reduceRelationshipDepthTransition(state, {
        type: "return",
        transitionId: state.id,
        reason,
      });
      assert.equal(update.state.direction, "reverse");
      assert.equal(update.state.phase, "destination-beat");
      assert.equal(update.state.returnReason, reason);

      update = dispatch(update.state, "beat-complete");
      assert.equal(update.state.phase, "handoff");
      assert.deepEqual(update.effects, [
        { type: "restore-checkpoint", checkpoint: started.checkpoint },
      ]);
      assert.strictEqual(update.state.checkpoint, started.checkpoint);

      update = dispatch(update.state, "endpoint-ready");
      assert.equal(update.state.phase, "source-beat");
      update = dispatch(update.state, "beat-complete");
      assert.equal(update.state.settledAt, "source");
      assert.deepEqual(update.effects, [
        { type: "restore-focus", focusKey: started.checkpoint.focusKey },
      ]);
      state = update.state;
      assert.equal(relationshipDepthTransitionInteractionLock(state), "none");
    }
  });

  it("returns during the source beat without ever committing the destination", () => {
    const started = start();
    let update = reduceRelationshipDepthTransition(started.state, {
      type: "return",
      transitionId: started.state.id,
      reason: "escape",
    });
    assert.equal(update.state.direction, "reverse");
    assert.equal(update.state.phase, "source-beat");
    assert.deepEqual(update.effects, []);

    update = dispatch(update.state, "beat-complete");
    assert.equal(update.state.settledAt, "source");
    assert.deepEqual(update.effects, [
      { type: "restore-focus", focusKey: started.checkpoint.focusKey },
    ]);
  });

  it("restores immediately when cancelled during handoff", () => {
    const started = start();
    let update = dispatch(started.state, "beat-complete");
    assert.equal(update.state.phase, "handoff");
    update = reduceRelationshipDepthTransition(update.state, {
      type: "return",
      transitionId: update.state.id,
      reason: "cancel",
    });
    assert.equal(update.state.direction, "reverse");
    assert.equal(update.state.mountedEndpoint, "source");
    assert.deepEqual(update.effects, [
      { type: "restore-checkpoint", checkpoint: started.checkpoint },
    ]);
    update = dispatch(update.state, "endpoint-ready");
    assert.equal(update.state.phase, "source-beat");
  });

  it("reverses a destination beat before restoring its checkpoint", () => {
    const started = start();
    let update = dispatch(started.state, "beat-complete");
    update = dispatch(update.state, "endpoint-ready");
    update = reduceRelationshipDepthTransition(update.state, {
      type: "return",
      transitionId: update.state.id,
      reason: "cancel",
    });
    assert.equal(update.state.phase, "destination-beat");
    assert.equal(update.state.direction, "reverse");
    assert.deepEqual(update.effects, []);
    update = dispatch(update.state, "beat-complete");
    assert.equal(update.state.phase, "handoff");
    assert.deepEqual(update.effects, [
      { type: "restore-checkpoint", checkpoint: started.checkpoint },
    ]);
  });

  it("cancels safely while an active turn is still being interrupted", () => {
    const started = start({
      source: homeA,
      destination: homeB,
      activeTurnRunning: true,
    });
    const update = reduceRelationshipDepthTransition(started.state, {
      type: "return",
      transitionId: started.state.id,
      reason: "cancel",
    });
    assert.equal(update.state.phase, "settled");
    assert.equal(update.state.settledAt, "source");
    assert.equal(update.state.mountedEndpoint, "source");
    assert.deepEqual(update.effects, [
      { type: "restore-focus", focusKey: started.checkpoint.focusKey },
    ]);
  });

  it("ignores stale, duplicate, and wrong-phase lifecycle events", () => {
    const started = start();
    const stale = reduceRelationshipDepthTransition(started.state, {
      type: "beat-complete",
      transitionId: "older-transition",
    });
    assert.strictEqual(stale.state, started.state);
    assert.deepEqual(stale.effects, []);

    const wrongPhase = dispatch(started.state, "endpoint-ready");
    assert.strictEqual(wrongPhase.state, started.state);

    const returning = reduceRelationshipDepthTransition(started.state, {
      type: "return",
      transitionId: started.state.id,
      reason: "back",
    });
    const duplicate = reduceRelationshipDepthTransition(returning.state, {
      type: "return",
      transitionId: returning.state.id,
      reason: "escape",
    });
    assert.strictEqual(duplicate.state, returning.state);
    assert.deepEqual(duplicate.effects, []);
  });

  it("locks only the necessary interaction scope", () => {
    const navigationOnly = start({ source: homeA, destination: transcriptA });
    assert.equal(
      relationshipDepthTransitionInteractionLock(navigationOnly.state),
      "navigation",
    );

    const surface = start({ source: libraryA, destination: homeA });
    assert.equal(
      relationshipDepthTransitionInteractionLock(surface.state),
      "surface",
    );
    assert.equal(
      relationshipDepthTransitionInteractionLock(settleForward(surface.state)),
      "none",
    );
  });

  it("exposes no narrative, guest-style, persistence, clock, or callback effects", () => {
    const update = start({
      source: homeA,
      destination: homeB,
      activeTurnRunning: true,
    });
    const serialized = JSON.stringify(update);
    assert.doesNotMatch(serialized, /message|send|guest|random|timestamp|createdAt/i);
    assert.deepEqual(
      update.effects.map((effect) => effect.type),
      ["interrupt-active-turn"],
    );
    assert.equal(
      Object.values(update.state).some((value) => typeof value === "function"),
      false,
    );
  });
});
