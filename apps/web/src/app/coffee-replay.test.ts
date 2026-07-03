import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COFFEE_SIP_ACTION_MIN_MESSAGE_GAP,
  clampCoffeeReplayMessageIndex,
  coffeeActionAnimationStartedAtMs,
  coffeeActionsForMessage,
  coffeeActionCanDisplayWhileSpeaking,
  coffeeActionIsSip,
  coffeeActionPassesSipCadence,
  coffeeActionSipMessageGapForDuration,
  coffeeReplayMessageHasStateEvent,
  coffeeReplayStateAt,
  coffeeReplayVisibleMessages,
  coffeeStageActionTimelineMessages,
  coffeeSystemSynopsisIsDisplayable,
  coffeeTranscriptVisibleMessages,
  collectCoffeeReplayActionsForBot,
  formatCoffeeReviewClipboardText,
  sanitizeCoffeeActionForBot,
} from "./coffee-replay.ts";

describe("coffee replay helpers", () => {
  it("clamps replay indexes to the saved transcript", () => {
    assert.equal(clampCoffeeReplayMessageIndex(4, -10), 0);
    assert.equal(clampCoffeeReplayMessageIndex(4, 2), 2);
    assert.equal(clampCoffeeReplayMessageIndex(4, 99), 3);
    assert.equal(clampCoffeeReplayMessageIndex(0, 99), 0);
  });

  it("returns the transcript visible at the current replay index", () => {
    const messages = ["a", "b", "c"];
    assert.deepEqual(coffeeReplayVisibleMessages(messages, 0), ["a"]);
    assert.deepEqual(coffeeReplayVisibleMessages(messages, 1), ["a", "b"]);
    assert.deepEqual(coffeeReplayVisibleMessages(messages, 20), ["a", "b", "c"]);
  });

  it("hides action timeline messages on the finished preview until replay starts", () => {
    const messages = ["first", "second", "third"];
    const replayMessages = coffeeReplayVisibleMessages(messages, 1);

    assert.deepEqual(
      coffeeStageActionTimelineMessages({
        messages,
        replayMessages,
        sessionFinished: true,
        replayActive: false,
      }),
      []
    );
    assert.deepEqual(
      coffeeStageActionTimelineMessages({
        messages,
        replayMessages,
        sessionFinished: true,
        replayActive: true,
      }),
      replayMessages
    );
    assert.deepEqual(
      coffeeStageActionTimelineMessages({
        messages,
        replayMessages,
        sessionFinished: false,
        replayActive: false,
      }),
      messages
    );
  });

  it("reconstructs hidden Coffee state events at the replay index", () => {
    const messages = [
      {
        id: "a1",
        role: "system",
        content: "",
        coffeeReplayEvents: [
          {
            v: 1 as const,
            name: "coffeeReplayEvent" as const,
            kind: "arrival" as const,
            botId: "bot-1",
            occurredAt: "2026-07-02T15:00:00.000Z",
          },
        ],
      },
      {
        id: "m1",
        role: "assistant",
        botName: "Nova",
        content: "Hello.",
        coffeeReplayEvents: [
          {
            v: 1 as const,
            name: "coffeeReplayEvent" as const,
            kind: "mood" as const,
            botId: "bot-1",
            occurredAt: "2026-07-02T15:00:04.000Z",
            social: {
              disposition: 0.8,
              valuesFriction: 0.1,
              restraint: 0.5,
              engagement: 0.7,
              leavePressure: 0.05,
            },
          },
        ],
      },
      {
        id: "t1",
        role: "system",
        content: "",
        coffeeReplayEvents: [
          {
            v: 1 as const,
            name: "coffeeReplayEvent" as const,
            kind: "topOff" as const,
            botId: "bot-1",
            occurredAt: "2026-07-02T15:01:00.000Z",
            progressBefore: 0.68,
            progressAfter: 0.18,
            toppedOffAt: "2026-07-02T15:01:00.000Z",
          },
        ],
      },
    ];

    const walking = coffeeReplayStateAt(messages, 0);
    assert.equal(walking.hasReplayEvents, true);
    assert.equal(walking.arrivedBotIds.has("bot-1"), true);
    assert.equal(walking.walkingInBotIds.has("bot-1"), true);
    assert.equal(coffeeReplayMessageHasStateEvent(messages[0]), true);

    const afterMood = coffeeReplayStateAt(messages, 1);
    assert.equal(afterMood.walkingInBotIds.has("bot-1"), false);
    assert.equal(afterMood.socialByBotId["bot-1"]?.disposition, 0.8);

    const afterTopOff = coffeeReplayStateAt(messages, 2);
    assert.equal(afterTopOff.activeTopOffEvent?.botId, "bot-1");
    assert.deepEqual(afterTopOff.topOffsByBotId["bot-1"], {
      progressBefore: 0.68,
      progressAfter: 0.18,
      toppedOffAt: "2026-07-02T15:01:00.000Z",
    });
  });

  it("hides action-only assistant turns from Table talk transcript rows", () => {
    const messages = [
      { id: "m1", role: "assistant", content: "*shifts in chair*" },
      { id: "m2", role: "assistant", content: "*leans in* Spoken line." },
      { id: "m3", role: "user", content: "What do you think?" },
      { id: "m4", role: "assistant", content: "nods slowly" },
      { id: "m5", role: "user", content: "*takes a quiet sip*" },
      { id: "m6", role: "system", content: "Session synopsis: The table ended." },
    ];

    assert.deepEqual(
      coffeeTranscriptVisibleMessages(messages).map((message) => message.id),
      ["m2", "m3", "m6"]
    );
  });

  it("hides stale account-metadata synopsis rows from Table talk", () => {
    const leakedSynopsis =
      "Session synopsis: The poll leans True (3-2), and the system noted your account display name is admin.";
    assert.equal(coffeeSystemSynopsisIsDisplayable(leakedSynopsis), false);

    const messages = [
      { id: "m1", role: "system", content: leakedSynopsis },
      {
        id: "m2",
        role: "system",
        content:
          "Session synopsis: The table stayed on the poll, with SpongeBob pulling the tangent back to crab meat.",
      },
    ];

    assert.deepEqual(
      coffeeTranscriptVisibleMessages(messages).map((message) => message.id),
      ["m2"]
    );
  });

  it("formats Coffee Review clipboard text with prose and replay context", () => {
    const text = formatCoffeeReviewClipboardText({
      context: {
        conversationId: "coffee-1",
        title: "Coffee with the crew",
        topic: "When helpful gets chaotic",
        phase: "finished",
        durationMinutes: 10,
        bots: [
          { id: "bot-sponge", name: "SpongeBob" },
          { id: "bot-krabs", name: "Mr. Krabs" },
        ],
        settings: {
          responseLength: "detailed",
          tableEnergy: "theatre",
          crossTalk: "chatty",
          stayOnThread: true,
        },
      },
      messages: [
        { id: "m1", role: "user", content: "Start with a concrete example." },
        {
          id: "m2",
          role: "assistant",
          botId: "bot-sponge",
          botName: "SpongeBob",
          provider: "local",
          model: "llama3.2",
          content: "*leans in* Help gets chaotic when nobody owns the limit.",
          coffeeReplayEvents: [
            {
              v: 1 as const,
              name: "coffeeReplayEvent" as const,
              kind: "mood" as const,
              botId: "bot-sponge",
              occurredAt: "2026-07-02T15:00:04.000Z",
              social: {
                disposition: 0.6,
                valuesFriction: 0.35,
                restraint: 0.65,
                engagement: 0.77,
                leavePressure: 0.02,
              },
            },
          ],
        },
        {
          id: "m3",
          role: "system",
          content: "",
          coffeeReplayEvents: [
            {
              v: 1 as const,
              name: "coffeeReplayEvent" as const,
              kind: "topOff" as const,
              botId: "bot-krabs",
              occurredAt: "2026-07-02T15:01:00.000Z",
              progressBefore: 0.62,
              progressAfter: 0.04,
              toppedOffAt: "2026-07-02T15:01:00.000Z",
            },
          ],
        },
      ],
    });

    assert.match(text, /^# PRISM Coffee Review Export/u);
    assert.match(text, /Topic: When helpful gets chaotic/u);
    assert.match(text, /Roster: SpongeBob \(bot-sponge\), Mr\. Krabs \(bot-krabs\)/u);
    assert.match(text, /Settings: .*responseLength=detailed.*stayOnThread=yes/u);
    assert.match(text, /Observed models\/providers: local:llama3\.2/u);
    assert.match(text, /Replay events: mood=1; topOff=1/u);
    assert.match(text, /You: Start with a concrete example\./u);
    assert.match(text, /SpongeBob: Help gets chaotic when nobody owns the limit\./u);
    assert.match(text, /topOff: Mr\. Krabs \(bot-krabs\) cup 62% -> 4%/u);
    assert.match(text, /mood: SpongeBob \(bot-sponge\).*engagement=0\.77/u);
    assert.doesNotMatch(text, /\*leans in\*/u);
  });

  it("collects bot actions only up to the provided visible transcript", () => {
    const messages = [
      { id: "m1", role: "assistant", botName: "Nova", content: "*sips coffee* Hello." },
      { id: "m2", role: "assistant", botName: "Orion", content: "*leans in* Sure." },
      { id: "m3", role: "assistant", botName: "Nova", content: "Good point. *nods*" },
    ];
    const visible = coffeeReplayVisibleMessages(messages, 1);
    const actions = collectCoffeeReplayActionsForBot(visible, "Nova");
    assert.deepEqual(actions.map((action) => action.action), []);
    assert.deepEqual(
      collectCoffeeReplayActionsForBot(coffeeReplayVisibleMessages(messages, 2), "Nova").map(
        (action) => action.action
      ),
      ["nods"]
    );
  });

  it("merges scripted ambient metadata with parsed stage actions", () => {
    const message = {
      id: "m1",
      role: "assistant",
      botName: "Nova",
      content: "*nods* That tracks.",
      coffeeAmbientAction: {
        v: 1 as const,
        name: "coffeeAmbientAction" as const,
        source: "scripted" as const,
        category: "cup" as const,
        action: "sets the cup down",
      },
    };

    assert.deepEqual(coffeeActionsForMessage(message), ["nods", "sets the cup down"]);
    assert.deepEqual(
      collectCoffeeReplayActionsForBot([message], "Nova").map((action) => action.action),
      ["nods", "sets the cup down"]
    );
  });

  it("hides visible cup-drinking action text while preserving other actions", () => {
    const message = {
      id: "m1",
      role: "assistant",
      botName: "Nova",
      content: "*takes a quiet sip* *nods* That tracks.",
      coffeeAmbientAction: {
        v: 1 as const,
        name: "coffeeAmbientAction" as const,
        source: "scripted" as const,
        category: "sip" as const,
        action: "drinks from the cup",
      },
    };

    assert.equal(sanitizeCoffeeActionForBot("sips coffee quietly"), "");
    assert.equal(sanitizeCoffeeActionForBot("raises the mug to his lips"), "");
    assert.equal(sanitizeCoffeeActionForBot("sets the cup down"), "sets the cup down");
    assert.deepEqual(
      collectCoffeeReplayActionsForBot([message], "Nova").map((action) => action.action),
      ["nods"]
    );
  });

  it("removes visible double quote marks from Coffee actions", () => {
    const message = {
      id: "m1",
      role: "assistant",
      botName: "Nova",
      content: '*stares at "truth"* That tracks.',
      coffeeAmbientAction: {
        v: 1 as const,
        name: "coffeeAmbientAction" as const,
        source: "scripted" as const,
        category: "cup" as const,
        action: 'sets the "cup" down',
      },
    };

    assert.deepEqual(coffeeActionsForMessage(message), [
      "stares at truth",
      "sets the cup down",
    ]);
    assert.equal(sanitizeCoffeeActionForBot('"strokes beard" thoughtfully'), "strokes beard thoughtfully");
  });

  it("removes internal bot mention hrefs from Coffee action text", () => {
    const message = {
      id: "m1",
      role: "assistant",
      botName: "Rowan",
      content: "*glances at [Pia](prism-bot://a3de14730ff7d98dd1d2b61c)* Interesting.",
    };

    assert.equal(
      sanitizeCoffeeActionForBot(
        "glances at [Pia](prism-bot://a3de14730ff7d98dd1d2b61c)"
      ),
      "glances at Pia"
    );
    assert.equal(
      sanitizeCoffeeActionForBot("nods to (prism-bot://a3de14730ff7d98dd1d2b61c)"),
      "nods"
    );
    assert.deepEqual(
      collectCoffeeReplayActionsForBot([message], "Rowan").map((action) => action.action),
      ["glances at Pia"]
    );
  });

  it("does not make metadata-only ambience a visible transcript row", () => {
    const messages = [
      {
        id: "m1",
        role: "assistant",
        content: "",
        coffeeAmbientAction: {
          v: 1 as const,
          name: "coffeeAmbientAction" as const,
          source: "scripted" as const,
          category: "cup" as const,
          action: "sets the cup down",
        },
      },
    ];

    assert.deepEqual(coffeeTranscriptVisibleMessages(messages), []);
  });

  it("rewrites impossible facial-hair actions for known beardless characters", () => {
    assert.equal(
      sanitizeCoffeeActionForBot("strokes beard thoughtfully, then chuckles", {
        name: "Mr. Krabs",
        systemPrompt: "Money-loving crab restaurant owner.",
      }),
      "taps the table thoughtfully, then chuckles"
    );
  });

  it("keeps facial-hair actions for characters where they can be valid", () => {
    assert.equal(
      sanitizeCoffeeActionForBot("strokes beard thoughtfully", {
        name: "Marcus Aurelius",
        systemPrompt: "Stoic Roman emperor with a beard.",
      }),
      "strokes beard thoughtfully"
    );
  });

  it("recognizes sip actions as occasional between-turn gestures", () => {
    assert.equal(coffeeActionIsSip("sips coffee quietly"), true);
    assert.equal(coffeeActionIsSip("raises the mug to his lips"), true);
    assert.equal(coffeeActionIsSip("nods slowly"), false);
  });

  it("prevents sip actions from displaying during spoken text", () => {
    assert.equal(coffeeActionCanDisplayWhileSpeaking("sips coffee", "That tracks."), false);
    assert.equal(coffeeActionCanDisplayWhileSpeaking("sips coffee", ""), true);
    assert.equal(coffeeActionCanDisplayWhileSpeaking("leans back", "That tracks."), true);
  });

  it("throttles repeated sip actions by message gap", () => {
    assert.equal(coffeeActionPassesSipCadence("sips coffee", 10, null), true);
    assert.equal(coffeeActionPassesSipCadence("sips coffee", 12, 10), false);
    assert.equal(
      coffeeActionPassesSipCadence(
        "sips coffee",
        10 + COFFEE_SIP_ACTION_MIN_MESSAGE_GAP,
        10
      ),
      true
    );
    assert.equal(coffeeActionPassesSipCadence("nods slowly", 11, 10), true);
  });

  it("prefers first-visible timestamps for Coffee action animations", () => {
    const firstVisibleAtMsByMessageId = new Map([["m1", 2_500]]);

    assert.equal(
      coffeeActionAnimationStartedAtMs(
        { id: "m1", createdAt: "1970-01-01T00:00:01.000Z" },
        firstVisibleAtMsByMessageId
      ),
      2_500
    );
    assert.equal(
      coffeeActionAnimationStartedAtMs({
        id: "m2",
        createdAt: "1970-01-01T00:00:01.000Z",
      }),
      1_000
    );
  });

  it("scales sip action throttling with Coffee session duration", () => {
    const shortGap = coffeeActionSipMessageGapForDuration(3);
    const defaultGap = coffeeActionSipMessageGapForDuration(10);
    const longGap = coffeeActionSipMessageGapForDuration(30);

    assert.equal(shortGap, COFFEE_SIP_ACTION_MIN_MESSAGE_GAP);
    assert.ok(defaultGap > shortGap);
    assert.ok(longGap > defaultGap);
    assert.equal(coffeeActionPassesSipCadence("sips coffee", 10 + longGap - 1, 10, longGap), false);
    assert.equal(coffeeActionPassesSipCadence("sips coffee", 10 + longGap, 10, longGap), true);
  });
});
