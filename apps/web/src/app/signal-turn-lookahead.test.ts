import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { PreparedTurnV1 } from "@localai/shared";
import { waitForSignalTurnPreparation } from "./signalTurnPreparationWait.ts";

const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const preparationWaitSource = readFileSync(
  new URL("./signalTurnPreparationWait.ts", import.meta.url),
  "utf8",
);

function sourceBlock(marker: string): string {
  const start = signalSource.indexOf(marker);
  assert.notEqual(start, -1, `${marker} is no longer in the Signal source`);
  const end = signalSource.indexOf("\n      };", start);
  assert.notEqual(end, -1, `${marker} no longer reads as a single block`);
  return signalSource.slice(start, end);
}

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = signalSource.indexOf(startMarker);
  const end = signalSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing Signal block: ${startMarker}`);
  return signalSource.slice(start, end);
}

function execute(source: string, scope: Record<string, unknown>): unknown {
  return runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, { Promise, AbortController, DOMException, ...scope });
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const openingEpisode = {
  id: "episode-1", hostBotId: "host-1", status: "active",
  playbackMode: "live", guestKind: "bot", provider: "openai", events: [],
};
const openingMessage = { id: "opening-1" };

// Run the actual startup handoff with independent release, ident and visual gates.
function startupHarness({
  episode = openingEpisode, activeImage = false, pendingImage = false,
  onPrepare = () => {}, onPlay = () => {},
} = {}) {
  const release = deferred();
  const intro = deferred();
  const visual = deferred();
  const controller = new AbortController();
  const calls: string[] = [];
  const ownership = { current: true };
  const finished = execute(`(async () => {
    ${sourceBetween("prepareEpisodeMessage(opening.message, opening.episode);", "    } catch (startError)")}
  })()`, {
    opening: { episode, message: openingMessage }, controller, runId: 1,
    episodeOperationIsCurrent: () => ownership.current && !controller.signal.aborted,
    prepareEpisodeMessage: () => calls.push("opening audio"),
    releaseSignalModelWarmup: async () => {
      calls.push("release");
      await release.promise;
      calls.push("released");
    },
    prepareGuestResponse: () => { calls.push("lookahead"); onPrepare(); },
    botcastActiveImageContextV1: () => activeImage,
    botcastPendingImageContextV1: () => pendingImage,
    introPlayback: { finished: intro.promise }, visualMinimum: visual.promise,
    revealOpeningStudio: async () => { calls.push("reveal"); },
    playPreparedEpisodeMessage: async () => { calls.push("play"); onPlay(); },
    setupImageUpload: null,
    setAutoRun: () => calls.push("auto run"),
  }) as Promise<void>;
  return { release, intro, visual, controller, calls, ownership, finished };
}

function readyPreparation(): PreparedTurnV1 {
  return {
    v: 1, id: "preparation-1", surface: "signal", sessionId: openingEpisode.id,
    stateCursor: {
      revision: 1, lastMessageId: openingMessage.id, lastEventId: "event-1",
      floorOwnerId: "host-1", castHash: "cast", powersHash: "powers", promptStateHash: "prompt",
    },
    phase: "ready", speakerBotId: "guest-1",
    provisionalUtterances: [{
      id: "message-2", speakerBotId: "guest-1", text: "A prepared follow-up.",
    }],
    createdAt: "2026-09-03T04:00:00Z", updatedAt: "2026-09-03T04:00:00Z",
    expiresAt: "2026-09-03T04:10:00Z", error: null, commitResult: null,
  };
}

function preparationHarness() {
  const created = deferred<{ preparation: PreparedTurnV1 }>();
  const polled = deferred<{ preparation: PreparedTurnV1 }>();
  const calls: string[] = [];
  const ref: { current: null | {
    controller: AbortController;
    preparationId: string | null;
    result: Promise<{ ok: boolean }>;
  } } = { current: null };
  const callbacks = execute(`(() => {
    ${sourceBetween("const discardPreparedAdvance =", "const invalidateEpisodeOperation =")}
    ${sourceBetween("const prepareGuestResponse =", "  prepareGuestResponseRef.current =")}
    return { prepareGuestResponse, discardPreparedAdvance };
  })()`, {
    useCallback: (callback: unknown) => callback,
    preparedAdvanceRef: ref,
    request: (path: string, options?: RequestInit) => {
      calls.push(`${options?.method ?? "GET"} ${path}`);
      if (options?.method === "DELETE") return Promise.resolve({});
      // Deliberately allow resolved responses through after abort: cancellation
      // must also win in the application callbacks, not just in fetch.
      return options?.method === "POST" ? created.promise : polled.promise;
    },
    waitForSignalTurnPreparation,
    botsById: new Map([["guest-1", { id: "guest-1", muted: false }]]),
    botWithIdentityBeforeMessage: (bot: unknown) => bot,
    botPowerResponseIsSilentV1: () => false,
    botcastActiveImageContextV1: () => null,
    botcastPendingImageContextV1: () => null,
    onPrefetchUtterance: () => calls.push("prefetch voice"),
    onPrefetchListenerReaction: () => calls.push("prefetch reaction"),
    onInvalidatePrefetchedUtterance: () => calls.push("invalidate voice"),
    theme: "dark",
  }) as {
    prepareGuestResponse: (episode: typeof openingEpisode, message: typeof openingMessage) => void;
    discardPreparedAdvance: (reason: string) => void;
  };
  return {
    ref, calls, created, polled,
    prepare: () => callbacks.prepareGuestResponse(openingEpisode, openingMessage),
    discard: callbacks.discardPreparedAdvance,
  };
}

describe("Signal turn lookahead", () => {
  it("records the wait it just measured before preparing the next turn", () => {
    const block = sourceBlock("const notifyPlaybackStart");
    const holdAt = block.indexOf("onPlaybackStart?.()");
    const prepareAt = block.indexOf("prepareNextTurn");
    assert.notEqual(holdAt, -1, "playback start no longer closes the hold");
    assert.notEqual(prepareAt, -1, "playback start no longer prepares ahead");
    assert.equal(
      holdAt < prepareAt,
      true,
      // A hold written after the preparation snapshot claims the same episode
      // event sequence, so the prepared turn is rejected at commit and the
      // audience sits through the generation the lookahead was hiding.
      "the session-clock hold must be recorded before the next turn is prepared",
    );
  });

  it("keeps the episode running when a prepared turn cannot commit", () => {
    assert.match(signalSource, /requestForegroundAdvance/u);
    assert.match(
      signalSource,
      /turn-preparations[\s\S]{0,400}?\/commit[\s\S]{0,400}?catch\(\s*\(commitError/u,
    );
  });

  it("waits on the server instead of polling speculative turns on the UI thread", () => {
    assert.match(
      preparationWaitSource,
      /SIGNAL_PREPARATION_POLL_WAIT_MS/u,
    );
    assert.doesNotMatch(signalSource, /SIGNAL_PREPARATION_POLL_MS/u);
  });

  it("gives speculative generation a bounded runway before foreground recovery", () => {
    assert.match(
      preparationWaitSource,
      /SIGNAL_PREPARATION_MAX_WAIT_MS = 30_000/u,
    );
    assert.match(signalSource, /preparationTimedOut/u);
    assert.match(signalSource, /preparation_timeout/u);
    assert.match(
      signalSource,
      /preparationTimedOut[\s\S]{0,260}?discardPreparedAdvance/u,
      "a timed-out speculative job must be cancelled before foreground recovery",
    );
  });

  it("authorizes voice prefetch against the exact prepared turn", () => {
    assert.match(
      signalSource,
      /onPrefetchUtterance\?\.\([\s\S]{0,900}?signalTurnPreparationId: preparation\.id/u,
    );
    assert.match(
      signalSource,
      /utterance\.signalListenerReactionPlan[\s\S]{0,900}?onPrefetchListenerReaction\?\.\([\s\S]{0,900}?signalTurnPreparationId: preparation\.id/u,
    );
  });

  it("invalidates prepared audio when a cue, stale commit, or reroute overtakes it", () => {
    assert.match(
      signalSource,
      /prepared\.prefetchedMessageId[\s\S]{0,180}?onInvalidatePrefetchedUtterance/u,
    );
    assert.match(
      signalSource,
      /catch\(\(commitError[\s\S]{0,500}?onInvalidatePrefetchedUtterance/u,
    );
    assert.match(
      signalSource,
      /response\.message\.content !== committedProvisional\.text[\s\S]{0,180}?onInvalidatePrefetchedUtterance/u,
    );
  });

  it("prefetches every known Watch line and waits for Premium readiness before playback", () => {
    assert.match(
      signalSource,
      /const prefetchKnownWatchEpisodeVoices = useCallback/u,
    );
    assert.match(
      signalSource,
      /for \(const message of currentEpisode\.messages\)[\s\S]{0,700}?onPrefetchUtterance\(message, bot\)/u,
    );
    assert.match(
      signalSource,
      /await prefetchKnownWatchEpisodeVoices\(bakedEpisode\);/u,
    );
    assert.match(
      signalSource,
      /await beginEpisodeIntroBookend\(watchBookend, presentationEpisode\.id\);[\s\S]{0,260}?setEpisodePreRoll\(null\)/u,
    );
  });

  it("releases a prepared turn a Producer cue has overtaken", () => {
    assert.match(
      signalSource,
      /discardPreparedAdvance\("A Producer cue redirects the host's next turn\."\)/u,
    );
  });

  it("releases warmup before ident lookahead and reuses the pending preparation at first playback", async () => {
    const preparation = preparationHarness();
    const startup = startupHarness({ onPrepare: preparation.prepare, onPlay: preparation.prepare });
    assert.deepEqual(startup.calls, ["opening audio", "release"]);
    assert.equal(preparation.ref.current === null, true);
    startup.release.resolve();
    await setImmediate();
    const pending = preparation.ref.current;
    assert.ok(pending);
    assert.deepEqual(startup.calls, ["opening audio", "release", "released", "lookahead"]);
    startup.intro.resolve();
    await setImmediate();
    assert.equal(startup.calls.includes("play"), false, "visual minimum still holds speech");
    startup.visual.resolve();
    await startup.finished;
    assert.equal(preparation.ref.current, pending, "speech start must keep the ident buffer");
    assert.equal(preparation.calls.length, 1, "only one preparation request, with no discard");
    assert.equal(startup.calls.filter((call) => call === "play").length, 1);
    preparation.created.resolve({ preparation: readyPreparation() });
    assert.equal((await pending.result).ok, true);
    assert.equal(preparation.calls.at(-1), "prefetch voice");
  });

  for (const cancellation of ["abort", "supersede"] as const) {
    it(`does not launch ident lookahead when ${cancellation} wins during warmup release`, async () => {
      const startup = startupHarness();
      if (cancellation === "abort") startup.controller.abort();
      else startup.ownership.current = false;
      startup.release.resolve();
      startup.intro.resolve();
      startup.visual.resolve();
      await startup.finished;
      assert.deepEqual(startup.calls, ["opening audio", "release", "released"]);
    });
  }

  it("keeps Watch, LOCAL, human guest and image episodes out of ident lookahead", async () => {
    for (const options of [
      { episode: { ...openingEpisode, playbackMode: "watch" } },
      { episode: { ...openingEpisode, provider: "local" } },
      { episode: { ...openingEpisode, guestKind: "producer" } },
      { activeImage: true }, { pendingImage: true },
    ]) {
      const startup = startupHarness(options);
      startup.release.resolve();
      startup.intro.resolve();
      startup.visual.resolve();
      await startup.finished;
      assert.equal(startup.calls.includes("lookahead"), false, JSON.stringify(options));
    }
  });

  it("discards a handle arriving after cancellation without polling or prefetching", async () => {
    const h = preparationHarness();
    h.prepare();
    const pending = h.ref.current!;
    h.created.resolve({ preparation: readyPreparation() });
    h.discard("exit before the resolved POST callback runs");
    assert.equal((await pending.result).ok, false);
    assert.equal(pending.controller.signal.aborted, true);
    assert.deepEqual(h.calls, [
      "POST /api/botcast/episodes/episode-1/turn-preparations",
      "DELETE /api/turn-preparations/preparation-1",
    ]);
  });

  it("does not prefetch a ready poll response overtaken by a Producer cue", async () => {
    const h = preparationHarness();
    h.prepare();
    const pending = h.ref.current!;
    h.created.resolve({ preparation: { ...readyPreparation(), phase: "preparing", provisionalUtterances: [] } });
    await setImmediate();
    assert.equal(h.calls.length, 2, "the status request is in flight");
    h.polled.resolve({ preparation: readyPreparation() });
    h.discard("Producer cue before the resolved poll callback runs");
    assert.equal((await pending.result).ok, false);
    assert.equal(h.calls.some((call) => call.startsWith("prefetch")), false);
    assert.equal(h.calls.at(-1), "DELETE /api/turn-preparations/preparation-1");
  });

  it("invalidates an already prefetched voice on exit and discards startup failures only while current", async () => {
    const h = preparationHarness();
    h.prepare();
    h.created.resolve({ preparation: readyPreparation() });
    await h.ref.current!.result;
    h.discard("exit");
    assert.equal(h.ref.current, null);
    assert.deepEqual(h.calls.slice(-2), ["invalidate voice", "DELETE /api/turn-preparations/preparation-1"]);
    assert.match(sourceBetween("const invalidateEpisodeOperation =", "const setPersistedSignalModelWarmupHold ="), /discardPreparedAdvance\(/u);
    assert.match(sourceBetween("} catch (startError)", "startEpisodeRef.current ="),
      /if \(episodeOperationIsCurrent\(controller, runId\)\) \{\s*discardPreparedAdvance\(/u);
  });
});
