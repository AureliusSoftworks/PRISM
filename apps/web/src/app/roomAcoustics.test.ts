import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_STUDIO_FOLEY_ROOM_SEND,
  SIGNAL_STUDIO_ROOM_PROFILE,
  SIGNAL_STUDIO_VOICE_ROOM_SEND,
  buildRoomImpulseChannels,
  connectRoomAcoustics,
} from "./roomAcoustics.ts";

describe("Signal studio room acoustics", () => {
  it("builds a deterministic stereo room response with a fading tail", () => {
    const first = buildRoomImpulseChannels(SIGNAL_STUDIO_ROOM_PROFILE, 48_000);
    const second = buildRoomImpulseChannels(SIGNAL_STUDIO_ROOM_PROFILE, 48_000);
    assert.equal(first[0].length, Math.round(48_000 * 0.48));
    assert.equal(first[0].length, first[1].length);
    assert.deepEqual(first, second);
    assert.notDeepEqual(first[0], first[1]);

    const earlyPeak = Math.max(
      ...first[0].slice(0, Math.round(48_000 * 0.09)).map(Math.abs),
    );
    const tailPeak = Math.max(
      ...first[0].slice(Math.round(first[0].length * 0.8)).map(Math.abs),
    );
    assert.ok(earlyPeak > 0.5);
    assert.ok(tailPeak < earlyPeak * 0.05);
    assert.equal(first[0].at(-1), 0);
    assert.equal(first[1].at(-1), 0);
  });

  it("keeps the studio response short, damped, and more present on Foley", () => {
    assert.ok(SIGNAL_STUDIO_ROOM_PROFILE.durationSeconds < 0.6);
    assert.ok(SIGNAL_STUDIO_ROOM_PROFILE.preDelaySeconds < 0.02);
    assert.ok(SIGNAL_STUDIO_ROOM_PROFILE.lowCutHz >= 120);
    assert.ok(SIGNAL_STUDIO_ROOM_PROFILE.highCutHz <= 3_500);
    assert.ok(SIGNAL_STUDIO_VOICE_ROOM_SEND.wet <= 0.07);
    assert.ok(
      SIGNAL_STUDIO_FOLEY_ROOM_SEND.wet > SIGNAL_STUDIO_VOICE_ROOM_SEND.wet,
    );
  });

  it("connects a parallel dry path and a filtered stereo room send", () => {
    class FakeNode {
      readonly connections: FakeNode[] = [];
      disconnected = false;
      connect<T extends FakeNode>(node: T): T {
        this.connections.push(node);
        return node;
      }
      disconnect(): void {
        this.disconnected = true;
      }
    }
    class FakeGain extends FakeNode {
      gain = { value: 0 };
    }
    class FakeDelay extends FakeNode {
      delayTime = { value: 0 };
    }
    class FakeConvolver extends FakeNode {
      buffer: AudioBuffer | null = null;
      normalize = false;
    }
    class FakeFilter extends FakeNode {
      type: BiquadFilterType = "lowpass";
      frequency = { value: 0 };
      Q = { value: 0 };
    }
    class FakeBuffer {
      readonly channels: Float32Array[];
      constructor(channelCount: number, length: number) {
        this.channels = Array.from(
          { length: channelCount },
          () => new Float32Array(length),
        );
      }
      getChannelData(channelNumber: number): Float32Array {
        return this.channels[channelNumber]!;
      }
    }
    class FakeContext {
      sampleRate = 48_000;
      readonly gains: FakeGain[] = [];
      readonly filters: FakeFilter[] = [];
      readonly convolvers: FakeConvolver[] = [];
      bufferCreateCount = 0;
      createGain(): FakeGain {
        const node = new FakeGain();
        this.gains.push(node);
        return node;
      }
      createDelay(): FakeDelay {
        return new FakeDelay();
      }
      createConvolver(): FakeConvolver {
        const node = new FakeConvolver();
        this.convolvers.push(node);
        return node;
      }
      createBiquadFilter(): FakeFilter {
        const node = new FakeFilter();
        this.filters.push(node);
        return node;
      }
      createBuffer(channelCount: number, length: number): FakeBuffer {
        this.bufferCreateCount += 1;
        return new FakeBuffer(channelCount, length);
      }
    }

    const context = new FakeContext();
    const input = new FakeNode();
    const destination = new FakeNode();
    const connection = connectRoomAcoustics({
      context: context as unknown as BaseAudioContext,
      input: input as unknown as AudioNode,
      destination: destination as unknown as AudioNode,
      send: SIGNAL_STUDIO_VOICE_ROOM_SEND,
    });

    assert.equal(input.connections.length, 2);
    assert.equal(context.gains[0]?.gain.value, 1);
    assert.equal(
      context.gains[1]?.gain.value,
      SIGNAL_STUDIO_VOICE_ROOM_SEND.wet,
    );
    assert.deepEqual(
      context.filters.map((filter) => ({
        type: filter.type,
        frequency: filter.frequency.value,
      })),
      [
        { type: "highpass", frequency: SIGNAL_STUDIO_ROOM_PROFILE.lowCutHz },
        { type: "lowpass", frequency: SIGNAL_STUDIO_ROOM_PROFILE.highCutHz },
      ],
    );
    assert.equal(context.convolvers[0]?.normalize, false);
    assert.equal(context.bufferCreateCount, 1);
    connection.disconnect();
    assert.equal(input.disconnected, true);
    assert.ok(context.filters.every((filter) => filter.disconnected));
  });
});
