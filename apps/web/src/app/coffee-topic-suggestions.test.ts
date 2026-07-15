import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  coffeeStarterTopicPoolFromByBotId,
  formatCoffeeStarterTopicsClipboardText,
  normalizeCoffeeStarterTopicPool,
  pickCoffeeStarterTopicOptions,
} from "./coffee-topic-suggestions.ts";

describe("coffee topic suggestions", () => {
  it("flattens four stored topics per seated bot into the group topic pool", () => {
    const topicsByBotId = Object.fromEntries(
      Array.from({ length: 5 }, (_, botIndex) => [
        `bot-${botIndex + 1}`,
        Array.from(
          { length: 4 },
          (_, topicIndex) => `Bot ${botIndex + 1} topic ${topicIndex + 1}`
        ),
      ])
    );

    const pool = coffeeStarterTopicPoolFromByBotId(topicsByBotId, [
      "bot-1",
      "bot-2",
      "bot-3",
      "bot-4",
      "bot-5",
    ]);

    assert.equal(pool.length, 20);
    assert.equal(pool[0], "Bot 1 topic 1");
    assert.equal(pool.at(-1), "Bot 5 topic 4");
  });

  it("draws four visible chips from the whole topic pool instead of slicing the first four", () => {
    const pool = Array.from({ length: 20 }, (_, index) => `Topic ${index + 1}`);
    const visible = pickCoffeeStarterTopicOptions(pool, {
      count: 4,
      seed: "conversation-session-a",
    });

    assert.equal(visible.length, 4);
    assert.notDeepEqual(visible, pool.slice(0, 4));
    assert.ok(visible.every((topic) => pool.includes(topic)));
  });

  it("keeps topic choices stable for a session but different across session seeds", () => {
    const pool = Array.from({ length: 20 }, (_, index) => `Topic ${index + 1}`);

    assert.deepEqual(
      pickCoffeeStarterTopicOptions(pool, { count: 4, seed: "session-one" }),
      pickCoffeeStarterTopicOptions(pool, { count: 4, seed: "session-one" })
    );
    assert.notDeepEqual(
      pickCoffeeStarterTopicOptions(pool, { count: 4, seed: "session-one" }),
      pickCoffeeStarterTopicOptions(pool, { count: 4, seed: "session-two" })
    );
  });

  it("normalizes duplicate or empty labels before sampling", () => {
    assert.deepEqual(normalizeCoffeeStarterTopicPool([" Alpha ", "", "alpha", "Beta  test "]), [
      "Alpha",
      "Beta test",
    ]);
  });

  it("formats stored starter topics grouped by bot for clipboard diagnostics", () => {
    const text = formatCoffeeStarterTopicsClipboardText({
      groupName: "Coffee with SpongeBob and Patrick",
      groupId: "group-1",
      orderedBotIds: ["patrick", "spongebob"],
      botNamesById: {
        patrick: "Patrick",
        spongebob: "SpongeBob",
      },
      topicsByBotId: {
        spongebob: ["Relentless optimism on shift", "A spatula worth defending"],
        patrick: ["Simple wisdom under pressure", "Being wrong with confidence"],
      },
    });

    assert.equal(
      text,
      [
        "PRISM Coffee Group starter topics",
        "Group: Coffee with SpongeBob and Patrick",
        "Group ID: group-1",
        "",
        "Patrick (patrick):",
        "1. Simple wisdom under pressure",
        "2. Being wrong with confidence",
        "",
        "SpongeBob (spongebob):",
        "1. Relentless optimism on shift",
        "2. A spatula worth defending",
      ].join("\n")
    );
  });

  it("formats canonical group topics without inventing per-bot ownership", () => {
    const text = formatCoffeeStarterTopicsClipboardText({
      groupName: "Canonical Table",
      groupId: "group-2",
      topics: [
        "When should evidence outrank tradition?",
        "Which promise survives a hard deadline?",
      ],
    });

    assert.equal(
      text,
      [
        "PRISM Coffee Group starter topics",
        "Group: Canonical Table",
        "Group ID: group-2",
        "",
        "1. When should evidence outrank tradition?",
        "2. Which promise survives a hard deadline?",
      ].join("\n"),
    );
  });

  it("returns no clipboard text when stored starter topics are empty", () => {
    assert.equal(
      formatCoffeeStarterTopicsClipboardText({
        topicsByBotId: {
          ada: [" ", ""],
        },
      }),
      null
    );
  });

  it("reuses canonical group topics without a session regeneration action", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(pageSource, /topics\/regenerate/);
    assert.doesNotMatch(pageSource, /Regenerate ideas/);
    assert.match(pageSource, /data-tutorial-target="coffee-topic-picker"/);
    assert.match(
      pageSource,
      /if \(!trimmed \|\| coffeeTopicRequestInFlightRef\.current\) return false;/,
    );
    assert.match(pageSource, /coffeeTopicRequestInFlightRef\.current = true;/);
    assert.match(pageSource, /coffeeTopicRequestInFlightRef\.current = false;/);
    assert.match(pageSource, /\.\.\.\(args\.group\.starterTopics \?\? \[\]\)/);
    assert.match(pageSource, /pool\.slice\(0, COFFEE_STARTER_TOPIC_OPTION_COUNT\)/);
  });
});
