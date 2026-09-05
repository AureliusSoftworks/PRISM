import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSignalLuckyLaunchRunner } from "./signalLuckyLaunch.ts";

const shows = [
  { id: "show-a", hostBotId: "host-a", hasActiveHost: true },
  { id: "show-b", hostBotId: "host-b", hasActiveHost: true },
];
const bots = [
  { id: "host-a" },
  { id: "host-b" },
  { id: "guest-a" },
  { id: "guest-b" },
];

describe("Signal I Feel Lucky launch", () => {
  it("resolves the ordered booking payload before starting exactly once", async () => {
    const events: unknown[] = [];
    const randomValues = [0.75, 0.9];
    const runner = createSignalLuckyLaunchRunner();

    const result = await runner.run({
      shows,
      bots,
      random: () => randomValues.shift() ?? 0,
      suggestBooking: async (payload) => {
        events.push(["suggest", payload]);
        return {
          generated: true,
          guestBotId: "guest-a",
          topic: "  The Beautiful Detour  ",
          producerBrief: "  Why productive wandering changes the work.  ",
          guestBrief:
            "  You privately fear the useful detour has become an excuse.  ",
        };
      },
      launch: async (setup) => {
        events.push(["launch", setup]);
      },
    });

    assert.equal(result, "launched");
    assert.deepEqual(events, [
      [
        "suggest",
        { showId: "show-b", guestBotId: "guest-b" },
      ],
      [
        "launch",
        {
          show: shows[1],
          guestBotId: "guest-a",
          topic: "The Beautiful Detour",
          producerBrief: "Why productive wandering changes the work.",
          guestBrief:
            "You privately fear the useful detour has become an excuse.",
        },
      ],
    ]);
  });

  it("guards a loading launch from a second click", async () => {
    let releaseSuggestion = (): void => undefined;
    let suggestionCount = 0;
    let launchCount = 0;
    const runner = createSignalLuckyLaunchRunner();
    const first = runner.run({
      shows,
      bots,
      random: () => 0,
      suggestBooking: async () => {
        suggestionCount += 1;
        await new Promise<void>((resolve) => {
          releaseSuggestion = resolve;
        });
        return {
          generated: true,
          topic: "A Fresh Signal",
          producerBrief: "A coherent private premise.",
          guestBrief: "A coherent private guest motive.",
        };
      },
      launch: async () => {
        launchCount += 1;
      },
    });

    const second = await runner.run({
      shows,
      bots,
      suggestBooking: async () => {
        throw new Error("should not run");
      },
      launch: async () => {
        launchCount += 1;
      },
    });
    assert.equal(second, "busy");
    assert.equal(suggestionCount, 1);
    releaseSuggestion();
    assert.equal(await first, "launched");
    assert.equal(launchCount, 1);
  });

  it("does not start when generation is incomplete", async () => {
    let launchCount = 0;
    const runner = createSignalLuckyLaunchRunner();

    await assert.rejects(
      runner.run({
        shows,
        bots,
        random: () => 0,
        suggestBooking: async () => ({
          generated: false,
          topic: "Partial title",
          producerBrief: "",
          guestBrief: "",
        }),
        launch: async () => {
          launchCount += 1;
        },
      }),
      /could not produce this lucky booking/u,
    );
    assert.equal(launchCount, 0);
  });

  it("does not start when the private guest briefing is missing", async () => {
    let launchCount = 0;
    const runner = createSignalLuckyLaunchRunner();

    await assert.rejects(
      runner.run({
        shows,
        bots,
        random: () => 0,
        suggestBooking: async () => ({
          generated: true,
          topic: "A Complete Public Title",
          producerBrief: "A complete private host briefing.",
          guestBrief: "   ",
        }),
        launch: async () => {
          launchCount += 1;
        },
      }),
      /could not produce this lucky booking/u,
    );
    assert.equal(launchCount, 0);
  });
});
