import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COFFEE_SIP_ACTION_MIN_MESSAGE_GAP,
  clampCoffeeReplayMessageIndex,
  coffeeActionsForMessage,
  coffeeActionCanDisplayWhileSpeaking,
  coffeeActionIsSip,
  coffeeActionPassesSipCadence,
  coffeeActionSipMessageGapForDuration,
  coffeeReplayVisibleMessages,
  coffeeSystemSynopsisIsDisplayable,
  coffeeTranscriptVisibleMessages,
  collectCoffeeReplayActionsForBot,
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

  it("collects bot actions only up to the provided visible transcript", () => {
    const messages = [
      { id: "m1", role: "assistant", botName: "Nova", content: "*sips coffee* Hello." },
      { id: "m2", role: "assistant", botName: "Orion", content: "*leans in* Sure." },
      { id: "m3", role: "assistant", botName: "Nova", content: "Good point. *nods*" },
    ];
    const visible = coffeeReplayVisibleMessages(messages, 1);
    const actions = collectCoffeeReplayActionsForBot(visible, "Nova");
    assert.deepEqual(actions.map((action) => action.action), ["sips coffee"]);
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
