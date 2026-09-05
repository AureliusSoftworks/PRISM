import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  connectVoiceCensorTone,
  readVoiceCensorPlan,
  resolveVoiceCensorTimings,
  voiceCensorPlanWithinSourceRange,
} from "./voiceCensorTone.ts";

describe("Cursed Tongue censor tone", () => {
  const plan = {
    textLength: 22,
    ranges: [
      { start: 4, end: 9 },
      { start: 16, end: 21 },
    ],
  };

  it("reads bounded carrier ranges and ignores malformed metadata", () => {
    const headers = new Headers({
      "x-prism-voice-censors": encodeURIComponent(JSON.stringify({
        version: 1,
        textLength: 22,
        ranges: [{ start: 4, end: 9 }, { start: 16, end: 99 }],
      })),
    });
    assert.deepEqual(readVoiceCensorPlan(headers), {
      textLength: 22,
      ranges: [{ start: 4, end: 9 }, { start: 16, end: 22 }],
    });
    assert.equal(
      readVoiceCensorPlan(new Headers({ "x-prism-voice-censors": "%7Bbad" })),
      null,
    );
  });

  it("uses provider character alignment for exact mute and tone timing", () => {
    const characters = Array.from("Say bleep, then bleep!");
    assert.equal(characters.length, 22);
    const alignment = {
      characters,
      characterStartTimesSeconds: characters.map((_, index) => index * 0.05),
      characterEndTimesSeconds: characters.map((_, index) => (index + 1) * 0.05),
    };
    assert.deepEqual(
      resolveVoiceCensorTimings({ plan, alignment, durationMs: 1_100 }),
      [
        { startMs: 200, endMs: 450 },
        { startMs: 800, endMs: 1_050 },
      ],
    );
  });

  it("uses one deterministic bounded fallback for multiple masks", () => {
    const first = resolveVoiceCensorTimings({ plan, alignment: null, durationMs: 2_200 });
    const second = resolveVoiceCensorTimings({ plan, alignment: null, durationMs: 2_200 });
    assert.deepEqual(first, second);
    assert.equal(first.length, 2);
    assert.ok(first.every((timing) => timing.endMs - timing.startMs >= 160));
    assert.ok(first.every((timing) => timing.endMs - timing.startMs <= 650));
  });

  it("slices a global stream plan into the current speech chunk", () => {
    assert.deepEqual(voiceCensorPlanWithinSourceRange(plan, 10, 22), {
      textLength: 12,
      ranges: [{ start: 6, end: 11 }],
    });
    assert.equal(voiceCensorPlanWithinSourceRange(plan, 9, 15), null);
  });

  it("hard-mutes speech and generates local oscillator partials in the same output graph", () => {
    const connections: Array<[string, string]> = [];
    const starts: Array<[number, number]> = [];
    class FakeParam {
      value = 0;
      setValueAtTime(value: number): void { this.value = value; }
      linearRampToValueAtTime(value: number): void { this.value = value; }
    }
    class FakeNode {
      readonly name: string;
      constructor(name: string) { this.name = name; }
      connect(target: FakeNode): FakeNode {
        connections.push([this.name, target.name]);
        return target;
      }
      disconnect(): void {}
    }
    class FakeGain extends FakeNode { gain = new FakeParam(); }
    class FakeOscillator extends FakeNode {
      frequency = new FakeParam();
      type: OscillatorType = "sine";
      start(at: number): void { starts.push([this.frequency.value, at]); }
      stop(): void {}
    }
    let gainIndex = 0;
    let oscillatorIndex = 0;
    const context = {
      currentTime: 2,
      createGain: () => new FakeGain(`gain-${gainIndex++}`),
      createOscillator: () => new FakeOscillator(`osc-${oscillatorIndex++}`),
    } as unknown as BaseAudioContext;
    const speech = new FakeNode("speech") as unknown as AudioNode;
    const output = new FakeNode("voice-output") as unknown as AudioNode;
    const nodes = connectVoiceCensorTone({
      context,
      speechInput: speech,
      output,
      timings: [
        { startMs: 100, endMs: 350 },
        { startMs: 700, endMs: 940 },
      ],
      startAt: 2,
    });
    assert.equal(starts.length, 4);
    assert.deepEqual(starts.map(([frequency]) => frequency), [1_000, 2_000, 1_000, 2_000]);
    assert.ok(connections.some(([from]) => from === "speech"));
    assert.ok(connections.some(([, to]) => to === "voice-output"));
    assert.equal(nodes.length, 11);
  });

  it("wires buffered, streamed, captured, robot, reaction, and crosstalk playback through the tone plan", () => {
    const english = readFileSync(new URL("./englishVoice.ts", import.meta.url), "utf8");
    const effects = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const capture = readFileSync(
      new URL("./replayAudioMasterCapture.ts", import.meta.url),
      "utf8",
    );
    const bottish = readFileSync(new URL("./bottishVoice.ts", import.meta.url), "utf8");
    assert.match(english, /readVoiceCensorPlan\(response\.headers\)/u);
    assert.match(english, /voiceCensorPlanWithinSourceRange/u);
    assert.match(effects, /const channel = args\.channel \?\? "primary"/u);
    assert.match(
      effects,
      /playLivePerformanceVoice\([\s\S]{0,420}censorPlan: args\.censorPlan/u,
    );
    const livePerformanceStart = effects.indexOf(
      "async function playLivePerformanceVoice",
    );
    const decodedPerformanceStart = effects.indexOf(
      "async function playDecodedLivePerformanceVoice",
    );
    assert.ok(livePerformanceStart >= 0);
    assert.ok(decodedPerformanceStart > livePerformanceStart);
    assert.match(
      effects.slice(livePerformanceStart, decodedPerformanceStart),
      /connectVoiceCensorTone\([\s\S]{0,360}speechInput/u,
    );
    assert.match(effects, /connectVoiceCensorTone\([\s\S]{0,260}speechInput: speechGain/u);
    assert.match(effects, /destination: prismAudioOutputNode\(context\)/u);
    assert.match(capture, /connectVoiceCensorTone\([\s\S]{0,240}output: routeInput/u);
    assert.match(bottish, /censorPlan: plan\.censorPlan/u);
    const babbleStart = bottish.indexOf("async function playBabble");
    const chunkedBabbleStart = bottish.indexOf(
      "async function playChunkedBabbleResponse",
    );
    assert.ok(babbleStart >= 0);
    assert.ok(chunkedBabbleStart > babbleStart);
    assert.match(
      bottish.slice(babbleStart, chunkedBabbleStart),
      /voiceCensorPerformancePlan\([\s\S]{0,2200}censorPlan,/u,
    );
  });
});
