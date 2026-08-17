import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeArrivalAutoplayCanScheduleNow,
  coffeeArrivalAutoplayRetryDelayMs,
  coffeeAwkwardSilencePressure,
  coffeeAutoplayForceTurnShouldRun,
  coffeeAutoplayWatchdogShouldWake,
  coffeeCenterFeedMessagesDuringPendingReveal,
  coffeeComposerUsesRichInput,
  coffeeDirectedMentionBotIds,
  coffeeEmptyTurnAutoplayRetryDelayMs,
  coffeeLoopTimerOwnsAutoplayTurn,
  coffeeMonotonicDeadlineRemainingMs,
  coffeePendingSubmittedUserLineVisible,
  coffeePersistedUserLineOwnsPendingReveal,
  coffeeRevealLineIsCutOffV1,
  coffeeRevealPreparationMayCommit,
  coffeeRevealVoiceEndSealsTableLineV1,
  coffeeSentenceCaseTableProse,
  coffeeShouldQueueAssistantRevealAfterUserTyping,
  coffeeShouldIgnoreStaleTurnResponse,
  coffeeShouldWaitForPendingBotRevealBeforeNextTurn,
  coffeeSubmittedUserMessageFromTurn,
  coffeeTableMessageContentIsVisible,
  coffeeUserTableTypingShouldRestart,
  coffeeVoicePlaybackOwnsAutoplayGate,
  coffeeVisibleDirectedMentionBotIds,
} from "./coffee-user-reveal-flow.ts";

describe("coffee user reveal flow", () => {
  it("keeps only the Coffee table composer rich by default", () => {
    assert.equal(
      coffeeComposerUsesRichInput({
        variant: "coffee-table",
        markdownEditorEnabled: false,
      }),
      true,
    );
    assert.equal(
      coffeeComposerUsesRichInput({
        variant: "chat",
        markdownEditorEnabled: false,
      }),
      false,
    );
    assert.equal(
      coffeeComposerUsesRichInput({
        variant: "coffee-global",
        markdownEditorEnabled: true,
      }),
      true,
    );
    assert.equal(
      coffeeComposerUsesRichInput({
        variant: "signal",
        markdownEditorEnabled: false,
      }),
      false,
    );
    assert.equal(
      coffeeComposerUsesRichInput({
        variant: "signal",
        markdownEditorEnabled: true,
      }),
      true,
    );
  });

  it("queues assistant reveal while the user line is still typing", () => {
    assert.equal(
      coffeeShouldQueueAssistantRevealAfterUserTyping("userTableTyping"),
      true,
    );
    assert.equal(
      coffeeShouldQueueAssistantRevealAfterUserTyping("botThinking"),
      false,
    );
  });

  it("waits before starting another bot turn while a bot line is still revealing", () => {
    assert.equal(
      coffeeShouldWaitForPendingBotRevealBeforeNextTurn("tableTyping"),
      true,
    );
    assert.equal(
      coffeeShouldWaitForPendingBotRevealBeforeNextTurn("userTableTyping"),
      false,
    );
    assert.equal(
      coffeeShouldWaitForPendingBotRevealBeforeNextTurn("botThinking"),
      false,
    );
  });

  it("prevents canceled voice preparation from reclaiming a newer Coffee reveal", () => {
    const interruptedRevealEpoch = 12;
    assert.equal(
      coffeeRevealPreparationMayCommit({
        preparedEpoch: interruptedRevealEpoch,
        currentEpoch: interruptedRevealEpoch,
      }),
      true,
    );
    assert.equal(
      coffeeRevealPreparationMayCommit({
        preparedEpoch: interruptedRevealEpoch,
        currentEpoch: interruptedRevealEpoch + 1,
      }),
      false,
    );
  });

  it("does not seal a table line when voice ends because the speaker was cut off", () => {
    assert.equal(
      coffeeRevealLineIsCutOffV1("line-1", "line-1"),
      true,
    );
    assert.equal(coffeeRevealLineIsCutOffV1("line-1", "line-2"), false);
    assert.equal(
      coffeeRevealVoiceEndSealsTableLineV1({
        messageId: "line-1",
        activeMessageId: "line-1",
        cutOffMessageId: null,
      }),
      true,
    );
    assert.equal(
      coffeeRevealVoiceEndSealsTableLineV1({
        messageId: "line-1",
        activeMessageId: "line-1",
        cutOffMessageId: "line-1",
      }),
      false,
    );
    assert.equal(
      coffeeRevealVoiceEndSealsTableLineV1({
        messageId: "line-1",
        activeMessageId: "line-2",
        cutOffMessageId: null,
      }),
      false,
    );
  });

  it("keeps arrival autoplay waking while the opener reveal is still busy", () => {
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("idle"), true);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("playerComposing"), true);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("tableTyping"), false);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("cooldown"), false);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("userTableTyping"), false);
    assert.equal(coffeeArrivalAutoplayCanScheduleNow("botThinking"), false);
    assert.equal(coffeeArrivalAutoplayRetryDelayMs("idle", 850), 0);
    assert.equal(coffeeArrivalAutoplayRetryDelayMs("tableTyping", 850), 420);
    assert.equal(coffeeArrivalAutoplayRetryDelayMs("cooldown", 0), 120);
    assert.equal(coffeeArrivalAutoplayRetryDelayMs("botThinking", 1100), 900);
  });

  it("keeps a submitted user line visible after typing while the bot is thinking", () => {
    assert.equal(
      coffeePendingSubmittedUserLineVisible({
        state: "botThinking",
        userRevealText: "Mr Krabs has not said anything yet.",
        sessionFinished: false,
      }),
      true,
    );
  });

  it("does not restart a finished player typewriter when pending reveal deps refresh", () => {
    assert.equal(
      coffeeUserTableTypingShouldRestart({
        settled: true,
        visibleLength: 0,
        fullDisplayLength: 24,
      }),
      false,
    );
    assert.equal(
      coffeeUserTableTypingShouldRestart({
        settled: false,
        visibleLength: 24,
        fullDisplayLength: 24,
      }),
      false,
    );
    assert.equal(
      coffeeUserTableTypingShouldRestart({
        settled: false,
        visibleLength: 12,
        fullDisplayLength: 24,
      }),
      true,
    );
    assert.equal(
      coffeeUserTableTypingShouldRestart({
        settled: false,
        visibleLength: 0,
        fullDisplayLength: 0,
      }),
      false,
    );
  });

  it("keeps the pending center feed seeded with the player line before the bot types", () => {
    const pendingMessages = [
      { id: "u1", role: "user", content: "Hello table." },
      { id: "a1", role: "assistant", content: "Hello back." },
    ];
    const feed = coffeeCenterFeedMessagesDuringPendingReveal({
      messages: pendingMessages,
      pendingMessageId: "a1",
      revealInProgress: true,
    });
    assert.deepEqual(
      feed.map((message) => message.id),
      ["u1"],
    );
  });

  it("hides the pending user line while it is actively typing or after finish", () => {
    assert.equal(
      coffeePendingSubmittedUserLineVisible({
        state: "userTableTyping",
        userRevealText: "Still typing.",
        sessionFinished: false,
      }),
      false,
    );
    assert.equal(
      coffeePendingSubmittedUserLineVisible({
        state: "botThinking",
        userRevealText: "Done.",
        sessionFinished: true,
      }),
      false,
    );
  });

  it("keeps tagged player message source intact for recall and follow-up flow", () => {
    const tagged = "[Boris](prism-bot://bot-boris), what do you think?";
    const message = coffeeSubmittedUserMessageFromTurn([
      { id: "user-1", role: "user", content: tagged },
      { id: "bot-1", role: "assistant", content: "I think it needs work." },
    ]);

    assert.equal(message?.id, "user-1");
    assert.equal(message?.content, tagged);
  });

  it("does not append a pending player line when its stored message is already visible", () => {
    assert.equal(
      coffeePendingSubmittedUserLineVisible({
        state: "botThinking",
        userRevealText: "One visible line.",
        sessionFinished: false,
        persistedUserMessageVisible: true,
      }),
      false,
    );
  });

  it("hands a pending player line to a matching persisted row during refresh", () => {
    const messages = [
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
      { role: "user", content: "  One visible   line.  " },
    ];

    assert.equal(
      coffeePersistedUserLineOwnsPendingReveal({
        messages,
        userRevealText: "One visible line.",
      }),
      true,
    );
    assert.equal(
      coffeePersistedUserLineOwnsPendingReveal({
        messages,
        userRevealText: "A different line.",
      }),
      false,
    );
  });

  it("keeps Power Mute ellipsis visible when asked", () => {
    assert.equal(
      coffeeTableMessageContentIsVisible("...", undefined, {
        keepPowerMuteEllipsis: true,
      }),
      true,
    );
    assert.equal(
      coffeeTableMessageContentIsVisible(" … ", undefined, {
        keepPowerMuteEllipsis: true,
      }),
      true,
    );
  });

  it("hides punctuation-only interruption pause rows from the table", () => {
    assert.equal(coffeeTableMessageContentIsVisible("..."), false);
    assert.equal(coffeeTableMessageContentIsVisible(" … "), false);
    assert.equal(
      coffeeTableMessageContentIsVisible("...", {
        v: 1,
        name: "socialSilence",
        provenance: "social",
        mode: "coffee",
        seed: "coffee:silence",
        volleyTurn: 2,
        holdMs: 1_600,
      }),
      true,
    );
    assert.equal(coffeeTableMessageContentIsVisible("*pauses*"), true);
    assert.equal(coffeeTableMessageContentIsVisible("Still here."), true);
  });

  it("sentence-cases player table prose without rewriting mention targets", () => {
    assert.equal(
      coffeeSentenceCaseTableProse("but krabby patties are yummy"),
      "But krabby patties are yummy",
    );
    assert.equal(
      coffeeSentenceCaseTableProse(
        "[SpongeBob](prism-bot://bot-sponge), what do you think?",
      ),
      "[SpongeBob](prism-bot://bot-sponge), what do you think?",
    );
    assert.equal(
      coffeeSentenceCaseTableProse("...already ready"),
      "...Already ready",
    );
  });

  it("gives a pending assistant message one center-table owner while it streams", () => {
    const messages = [
      { id: "earlier", content: "Earlier line." },
      { id: "first-bot-reply", content: "Streaming line." },
    ];

    assert.deepEqual(
      coffeeCenterFeedMessagesDuringPendingReveal({
        messages,
        pendingMessageId: "first-bot-reply",
        revealInProgress: true,
      }),
      [{ id: "earlier", content: "Earlier line." }],
    );
    assert.deepEqual(
      coffeeCenterFeedMessagesDuringPendingReveal({
        messages,
        pendingMessageId: "first-bot-reply",
        revealInProgress: false,
      }),
      messages,
    );
  });

  it("ignores stale Coffee turn responses without a visible speaker", () => {
    assert.equal(
      coffeeShouldIgnoreStaleTurnResponse({ stale: true, speakerBotId: null }),
      true,
    );
    assert.equal(
      coffeeShouldIgnoreStaleTurnResponse({ speakerBotId: null }),
      true,
    );
    assert.equal(
      coffeeShouldIgnoreStaleTurnResponse({ speakerBotId: "bot-vader" }),
      false,
    );
  });

  it("rearms autoplay after a stale or empty Coffee turn", () => {
    const activeTurn = {
      speakerBotId: null,
      autoplayPaused: false,
      sessionPhase: "live",
      sessionRemainingMs: 60_000,
    };
    assert.equal(
      coffeeEmptyTurnAutoplayRetryDelayMs({ ...activeTurn, stale: true }),
      360,
    );
    assert.equal(
      coffeeEmptyTurnAutoplayRetryDelayMs({ ...activeTurn, stale: false }),
      850,
    );
    assert.equal(
      coffeeEmptyTurnAutoplayRetryDelayMs({
        ...activeTurn,
        speakerBotId: "bot-jefferson",
        stale: false,
      }),
      null,
    );
    assert.equal(
      coffeeEmptyTurnAutoplayRetryDelayMs({
        ...activeTurn,
        autoplayPaused: true,
      }),
      null,
    );
    assert.equal(
      coffeeEmptyTurnAutoplayRetryDelayMs({
        ...activeTurn,
        sessionPhase: "finished",
      }),
      null,
    );
    assert.equal(
      coffeeEmptyTurnAutoplayRetryDelayMs({
        ...activeTurn,
        sessionRemainingMs: 0,
      }),
      null,
    );
  });

  it("wakes an active Coffee room when no timer or request owns the next turn", () => {
    const strandedRoom = {
      hasConversation: true,
      sessionPhase: "live",
      autoplayPaused: false,
      rhythmState: "idle" as const,
      loopScheduled: false,
      requestInFlight: false,
      sessionEndsAtMs: 70_000,
      nowMs: 10_000,
    };
    assert.equal(coffeeAutoplayWatchdogShouldWake(strandedRoom), true);
    assert.equal(
      coffeeAutoplayWatchdogShouldWake({
        ...strandedRoom,
        sessionEndsAtMs: null,
      }),
      true,
    );
    assert.equal(
      coffeeAutoplayWatchdogShouldWake({
        ...strandedRoom,
        sessionPhase: "arriving",
      }),
      true,
    );
    assert.equal(
      coffeeAutoplayWatchdogShouldWake({
        ...strandedRoom,
        loopScheduled: true,
      }),
      false,
    );
    assert.equal(
      coffeeAutoplayWatchdogShouldWake({
        ...strandedRoom,
        autoplayPaused: true,
      }),
      false,
    );
    assert.equal(
      coffeeAutoplayWatchdogShouldWake({
        ...strandedRoom,
        requestInFlight: true,
      }),
      false,
    );
    // A composing player never blocks the wake path; playerComposing stays
    // schedulable so bots keep talking while the user types.
    assert.equal(
      coffeeAutoplayWatchdogShouldWake({
        ...strandedRoom,
        rhythmState: "playerComposing",
      }),
      true,
    );
    assert.equal(
      coffeeAutoplayWatchdogShouldWake({
        ...strandedRoom,
        rhythmState: "tableTyping",
      }),
      false,
    );
    assert.equal(
      coffeeAutoplayWatchdogShouldWake({ ...strandedRoom, nowMs: 70_000 }),
      false,
    );
  });

  it("does not let an overdue Coffee loop timer mask a stranded table", () => {
    assert.equal(
      coffeeLoopTimerOwnsAutoplayTurn({
        timerPresent: true,
        scheduledForMs: 20_000,
        nowMs: 19_999,
      }),
      true,
    );
    assert.equal(
      coffeeLoopTimerOwnsAutoplayTurn({
        timerPresent: true,
        scheduledForMs: 20_000,
        nowMs: 20_000,
      }),
      false,
    );
    assert.equal(
      coffeeLoopTimerOwnsAutoplayTurn({
        timerPresent: false,
        scheduledForMs: null,
        nowMs: 20_000,
      }),
      false,
    );
  });

  it("lets only an active Coffee voice message hold the autoplay gate", () => {
    assert.equal(
      coffeeVoicePlaybackOwnsAutoplayGate({
        busy: true,
        activeMessageId: "message-live",
      }),
      true,
    );
    assert.equal(
      coffeeVoicePlaybackOwnsAutoplayGate({
        busy: true,
        activeMessageId: null,
      }),
      false,
    );
    assert.equal(
      coffeeVoicePlaybackOwnsAutoplayGate({
        busy: true,
        activeMessageId: "  ",
      }),
      false,
    );
    assert.equal(
      coffeeVoicePlaybackOwnsAutoplayGate({
        busy: false,
        activeMessageId: "message-finished",
      }),
      false,
    );
  });

  it("forces a turn when an owned deadline or the whole room has gone silent", () => {
    const activeRoom = {
      hasConversation: true,
      hasPresentBot: true,
      sessionPhase: "arriving",
      autoplayPaused: false,
      requestInFlight: false,
      pendingReveal: false,
      timerPresent: true,
      timerScheduledForMs: 10_000,
      sessionEndsAtMs: 100_000,
      lastAssistantAtMs: 5_000,
      sessionStartedAtMs: 0,
      lastForcedAtMs: 0,
      nowMs: 11_500,
    };
    assert.equal(coffeeAutoplayForceTurnShouldRun(activeRoom), true);
    assert.equal(
      coffeeAutoplayForceTurnShouldRun({
        ...activeRoom,
        sessionEndsAtMs: null,
      }),
      true,
    );
    assert.equal(
      coffeeAutoplayForceTurnShouldRun({ ...activeRoom, nowMs: 11_499 }),
      false,
    );
    assert.equal(
      coffeeAutoplayForceTurnShouldRun({
        ...activeRoom,
        timerPresent: false,
        timerScheduledForMs: null,
        lastAssistantAtMs: 20_000,
        nowMs: 55_000,
      }),
      true,
    );
    assert.equal(
      coffeeAutoplayForceTurnShouldRun({
        ...activeRoom,
        requestInFlight: true,
      }),
      false,
    );
    assert.equal(
      coffeeAutoplayForceTurnShouldRun({ ...activeRoom, pendingReveal: true }),
      false,
    );
    assert.equal(
      coffeeAutoplayForceTurnShouldRun({ ...activeRoom, hasPresentBot: false }),
      false,
    );
  });

  it("uses monotonic deadlines and bounded wall-clock silence pressure", () => {
    assert.equal(coffeeMonotonicDeadlineRemainingMs(12_000, 10_500), 1_500);
    assert.equal(coffeeMonotonicDeadlineRemainingMs(12_000, 13_000), 0);
    assert.deepEqual(
      coffeeAwkwardSilencePressure({
        lastActivityAtMs: 20_000,
        sessionStartedAtMs: 0,
        nowMs: 54_999,
        savedTopic: "Gratitude",
      }),
      { pressure: 0, focus: null },
    );
    const breaker = coffeeAwkwardSilencePressure({
      lastActivityAtMs: 20_000,
      sessionStartedAtMs: 0,
      nowMs: 60_000,
      savedTopic: "Gratitude",
    });
    assert.ok(breaker.pressure > 0 && breaker.pressure <= 1);
    assert.match(breaker.focus ?? "", /awkward silence/u);
    const pivot = coffeeAwkwardSilencePressure({
      lastActivityAtMs: 20_000,
      sessionStartedAtMs: 0,
      nowMs: 90_000,
      savedTopic: "Gratitude",
    });
    assert.equal(pivot.pressure, 0.875);
    assert.match(pivot.focus ?? "", /without renaming or rewriting/u);
  });

  it("returns ordered unique seated bot mentions for directed Coffee rounds", () => {
    const text = [
      "[SpongeBob](prism-bot://bot-sponge)",
      "and",
      "[Patrick Star](prism-bot://bot-patrick),",
      "haven't you guys gone to Weenie Hut General?",
      "[SpongeBob](prism-bot://bot-sponge)",
      "[Squidward](prism-bot://bot-squidward)",
    ].join(" ");

    assert.deepEqual(
      coffeeDirectedMentionBotIds(text, ["bot-patrick", "bot-sponge"]),
      ["bot-sponge", "bot-patrick"],
    );
  });

  it("reveals directed mention ids when the displayed bot name starts streaming", () => {
    const text = [
      "Hey",
      "[Patrick Star](prism-bot://bot-patrick),",
      "look at",
      "[SpongeBob](prism-bot://bot-sponge).",
    ].join(" ");
    const seatedBotIds = ["bot-patrick", "bot-sponge"];

    assert.deepEqual(
      coffeeVisibleDirectedMentionBotIds(text, seatedBotIds, "Hey ".length),
      [],
    );
    assert.deepEqual(
      coffeeVisibleDirectedMentionBotIds(text, seatedBotIds, "Hey P".length),
      ["bot-patrick"],
    );
    assert.deepEqual(
      coffeeVisibleDirectedMentionBotIds(
        text,
        seatedBotIds,
        "Hey Patrick Star, look at S".length,
      ),
      ["bot-patrick", "bot-sponge"],
    );
  });
});
