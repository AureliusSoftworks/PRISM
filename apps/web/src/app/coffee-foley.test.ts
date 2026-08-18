import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  COFFEE_FOLEY_CUE_DURATION_MS,
  COFFEE_FOLEY_CUE_GAIN,
  COFFEE_FOLEY_CUE_POLICY,
  COFFEE_FOLEY_IDLE_CUE_POLICY,
  COFFEE_FOLEY_MIN_ACTIVE_INTERVAL_MS,
  COFFEE_FOLEY_MIN_IDLE_INTERVAL_MS,
  COFFEE_FOLEY_MURMUR_MIN_IDLE_GAP_MS,
  COFFEE_FOLEY_MURMUR_MIN_INTERVAL_MS,
  COFFEE_FOLEY_SPEECH_DUCK_DB,
  COFFEE_FOLEY_SPEECH_ONSET_GUARD_MS,
  coffeeFoleyCueForEvent,
  coffeeFoleyDuckedGain,
  createCoffeeFoleyEngine,
  createCoffeeFoleySchedulerState,
  type CoffeeFoleyCueDecision,
  type CoffeeFoleyCuePlayback,
  type CoffeeFoleyTableEvent,
} from "./coffee-foley.ts";

interface FoleyScriptStep {
  atMs: number;
  event: CoffeeFoleyTableEvent;
}

interface FoleyFiredCue {
  atMs: number;
  fireAtMs: number;
  cue: CoffeeFoleyCueDecision;
}

function runFoleyScript(
  seed: string,
  script: readonly FoleyScriptStep[],
): FoleyFiredCue[] {
  let state = createCoffeeFoleySchedulerState(seed);
  const fired: FoleyFiredCue[] = [];
  for (const step of script) {
    const result = coffeeFoleyCueForEvent({
      event: step.event,
      nowMs: step.atMs,
      seed,
      state,
    });
    state = result.state;
    if (result.cue) {
      fired.push({
        atMs: step.atMs,
        fireAtMs: step.atMs + result.cue.delayMs,
        cue: result.cue,
      });
    }
  }
  return fired;
}

function activeTableScript(totalMs: number): FoleyScriptStep[] {
  const cycle: CoffeeFoleyTableEvent[] = [
    "turnStart",
    "sip",
    "turnEnd",
    "crosstalk",
  ];
  const script: FoleyScriptStep[] = [{ atMs: 0, event: "arrival" }];
  for (let atMs = 1_000; atMs <= totalMs; atMs += 1_000) {
    script.push({ atMs, event: cycle[(atMs / 1_000 - 1) % cycle.length]! });
  }
  return script;
}

describe("Coffee foley and murmur ambience", () => {
  it("emits an identical cue stream for a fixed seed", () => {
    const script = activeTableScript(120_000);
    const first = runFoleyScript("table:alpha", script);
    const second = runFoleyScript("table:alpha", script);
    assert.ok(first.length > 0);
    assert.deepEqual(first, second);
    const other = runFoleyScript("table:beta", script);
    assert.notDeepEqual(first, other);
  });

  it("keeps one-shots sparse during a busy table", () => {
    const fired = runFoleyScript("density", activeTableScript(300_000));
    const oneShots = fired.filter((entry) => entry.cue.kind !== "murmur_swell");
    assert.ok(oneShots.length >= 10, `too few cues: ${oneShots.length}`);
    assert.ok(
      oneShots.length <= 300_000 / COFFEE_FOLEY_MIN_ACTIVE_INTERVAL_MS + 1,
      `too many cues: ${oneShots.length}`,
    );
    for (let index = 1; index < oneShots.length; index += 1) {
      const gapMs = oneShots[index]!.fireAtMs - oneShots[index - 1]!.fireAtMs;
      assert.ok(
        gapMs >= COFFEE_FOLEY_MIN_ACTIVE_INTERVAL_MS,
        `one-shot gap ${gapMs}ms below the active floor`,
      );
    }
  });

  it("spaces idle one-shots and murmur swells further apart", () => {
    const script: FoleyScriptStep[] = [];
    for (let atMs = 2_000; atMs <= 200_000; atMs += 2_000) {
      script.push({ atMs, event: "idleLullTick" });
    }
    const fired = runFoleyScript("lull", script);
    const murmurs = fired.filter((entry) => entry.cue.kind === "murmur_swell");
    const oneShots = fired.filter((entry) => entry.cue.kind !== "murmur_swell");
    assert.ok(murmurs.length >= 3, `too few murmurs: ${murmurs.length}`);
    for (let index = 1; index < murmurs.length; index += 1) {
      assert.ok(
        murmurs[index]!.fireAtMs - murmurs[index - 1]!.fireAtMs >=
          COFFEE_FOLEY_MURMUR_MIN_INTERVAL_MS,
      );
    }
    for (let index = 1; index < oneShots.length; index += 1) {
      assert.ok(
        oneShots[index]!.fireAtMs - oneShots[index - 1]!.fireAtMs >=
          COFFEE_FOLEY_MIN_IDLE_INTERVAL_MS,
      );
    }
    for (const entry of oneShots) {
      assert.ok(
        (COFFEE_FOLEY_IDLE_CUE_POLICY.kinds as readonly string[]).includes(
          entry.cue.kind,
        ),
      );
    }
  });

  it("holds murmur swells until the table has idled long enough", () => {
    const script: FoleyScriptStep[] = [{ atMs: 0, event: "turnEnd" }];
    for (
      let atMs = 2_000;
      atMs < COFFEE_FOLEY_MURMUR_MIN_IDLE_GAP_MS;
      atMs += 2_000
    ) {
      script.push({ atMs, event: "idleLullTick" });
    }
    for (let seedIndex = 0; seedIndex < 24; seedIndex += 1) {
      const fired = runFoleyScript(`early-idle-${seedIndex}`, script);
      assert.ok(
        fired.every((entry) => entry.cue.kind !== "murmur_swell"),
        `murmur before the idle gap for seed ${seedIndex}`,
      );
    }
  });

  it("never lands a cue inside the speech-onset guard window", () => {
    let pushedToGuardEdge = 0;
    for (let seedIndex = 0; seedIndex < 40; seedIndex += 1) {
      const fired = runFoleyScript(`guard-${seedIndex}`, [
        { atMs: 1_000, event: "turnStart" },
        { atMs: 1_050, event: "arrival" },
      ]);
      for (const entry of fired) {
        assert.ok(
          entry.fireAtMs >= 1_000 + COFFEE_FOLEY_SPEECH_ONSET_GUARD_MS,
          `cue at ${entry.fireAtMs}ms inside the onset guard`,
        );
        if (entry.fireAtMs === 1_000 + COFFEE_FOLEY_SPEECH_ONSET_GUARD_MS) {
          pushedToGuardEdge += 1;
        }
      }
    }
    assert.ok(pushedToGuardEdge > 0, "guard push branch never exercised");
  });

  it("refuses a one-shot while another is still audible", () => {
    const seed = "cap";
    const busyState = {
      ...createCoffeeFoleySchedulerState(seed),
      lastOneShotFiredAtMs: 1_000,
      oneShotIntervalUnit: 0,
      oneShotBusyUntilMs: 30_700,
    };
    const blocked = coffeeFoleyCueForEvent({
      event: "arrival",
      nowMs: 30_000,
      seed,
      state: busyState,
    });
    assert.equal(blocked.cue, null);
    const clear = coffeeFoleyCueForEvent({
      event: "arrival",
      nowMs: 30_000,
      seed,
      state: { ...busyState, oneShotBusyUntilMs: 30_000 },
    });
    assert.ok(clear.cue);
    assert.equal(clear.cue.kind, "chair_shift");
    assert.equal(
      clear.state.oneShotBusyUntilMs,
      30_000 + clear.cue.delayMs + clear.cue.durationMs,
    );
  });

  it("never overlaps murmur swells", () => {
    const seed = "murmur-cap";
    const state = {
      ...createCoffeeFoleySchedulerState(seed),
      murmurBusyUntilMs: 46_000,
    };
    const result = coffeeFoleyCueForEvent({
      event: "idleLullTick",
      nowMs: 40_000,
      seed,
      state,
    });
    assert.notEqual(result.cue?.kind, "murmur_swell");
  });

  it("draws kinds, delays, and gains from the event policy table", () => {
    const events = Object.keys(COFFEE_FOLEY_CUE_POLICY) as (keyof typeof COFFEE_FOLEY_CUE_POLICY)[];
    for (const event of events) {
      const policy = COFFEE_FOLEY_CUE_POLICY[event];
      let firedCount = 0;
      for (let seedIndex = 0; seedIndex < 60; seedIndex += 1) {
        const fired = runFoleyScript(`policy-${event}-${seedIndex}`, [
          { atMs: 10_000, event },
        ]);
        for (const entry of fired) {
          firedCount += 1;
          assert.ok(
            (policy.kinds as readonly string[]).includes(entry.cue.kind),
          );
          assert.ok(entry.cue.delayMs >= policy.delayMsRange[0]);
          assert.ok(entry.cue.delayMs <= policy.delayMsRange[1]);
          assert.equal(
            entry.cue.durationMs,
            COFFEE_FOLEY_CUE_DURATION_MS[entry.cue.kind],
          );
          const base = COFFEE_FOLEY_CUE_GAIN[entry.cue.kind];
          assert.ok(entry.cue.gain >= base * 0.8 - 1e-9);
          assert.ok(entry.cue.gain <= base * 1.2 + 1e-9);
        }
      }
      assert.ok(firedCount > 0, `no ${event} cue fired across seeds`);
    }
  });

  it("dips foley by eight decibels while a voice line plays", () => {
    assert.equal(COFFEE_FOLEY_SPEECH_DUCK_DB, -8);
    assert.equal(coffeeFoleyDuckedGain(0.5, false), 0.5);
    assert.ok(
      Math.abs(
        coffeeFoleyDuckedGain(0.5, true) - 0.5 * 10 ** (-8 / 20),
      ) < 1e-12,
    );
    assert.equal(coffeeFoleyDuckedGain(-1, true), 0);
    assert.equal(coffeeFoleyDuckedGain(Number.NaN, true), 0);
  });

  it("plays a scheduled cue through the engine seam and honors dispose", async () => {
    const played: CoffeeFoleyCuePlayback[] = [];
    const engine = createCoffeeFoleyEngine({
      seed: "engine-test",
      playCue: (cue) => played.push(cue),
      now: () => 0,
    });
    engine.handleTableEvent("arrival");
    engine.handleTableEvent("arrival");
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(played.length, 1);
    assert.equal(played[0]!.kind, "chair_shift");
    assert.ok(Number.isInteger(played[0]!.noiseSeed));
    engine.dispose();

    const afterDispose: CoffeeFoleyCuePlayback[] = [];
    const disposedEngine = createCoffeeFoleyEngine({
      seed: "engine-test",
      playCue: (cue) => afterDispose.push(cue),
      now: () => 0,
    });
    disposedEngine.handleTableEvent("arrival");
    disposedEngine.dispose();
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(afterDispose.length, 0);
  });

  it("routes through the shared PRISM output without frame-based work", () => {
    const source = readFileSync(
      new URL("./coffee-foley.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /prismAudioOutputNode/u);
    assert.match(source, /setTargetAtTime/u);
    assert.doesNotMatch(source, /requestAnimationFrame/u);
    assert.doesNotMatch(source, /Math\.random/u);
    assert.doesNotMatch(source, /fetch\(/u);
  });
});
