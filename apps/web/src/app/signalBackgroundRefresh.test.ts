import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual callbacks with controlled requests and lifecycle events.
// The full player shell and its model/audio services are unnecessary here.
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signal = readFileSync(new URL("./BotcastExperience.tsx", import.meta.url), "utf8");
const generationStart = page.indexOf("const requestHubAtmosphereGeneration =");
const generation = page.slice(generationStart, page.indexOf("async function uploadAssetLibraryImage", generationStart));
const autoStart = page.lastIndexOf("useEffect(() => {", page.indexOf("const hasCurrentStyleImage ="));
const automatic = page.slice(autoStart, page.indexOf("\n\n  useEffect", autoStart));
const pollStart = signal.indexOf("const replayEpisodeId =");
const polling = signal.slice(pollStart, signal.indexOf("const requestStudioCut =", pollStart));

function execute(source: string, scope: Record<string, unknown>): unknown {
  return runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, scope);
}

function atmosphereHarness() {
  let today = "2026-09-02";
  let requests = 0;
  const pending: Promise<void>[] = [];
  const settings = {
    hubAtmosphereEnabled: true,
    atmosphereStyle: "watercolor",
    hubAtmosphereImageId: "existing-wallpaper",
    hubAtmosphereImageStyle: "watercolor",
    hubAtmosphereGeneratedOn: "2026-09-01",
    preferredHomeAtmosphereImageProvider: "local",
    preferredHomeAtmosphereImageModel: "unavailable-model",
  };
  const scope: Record<string, unknown> = {
    settings,
    user: { id: "owner" },
    hubAtmosphereGenerationInFlightRef: { current: false },
    hubAtmosphereAttemptKeysRef: { current: new Set() },
    hubAtmosphereGenerationState: "idle",
    livingShellProgressHydratedUserRef: { current: "owner" },
    onboardingState: { stage: "complete" },
    panel: null,
    homeAtmosphereDayKey: today,
    HUB_ATMOSPHERE_IMAGE_PURPOSE: "hub_atmosphere",
    normalizeHubAtmosphereStyle: (style: string) => style,
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void) => effect(),
    setHubAtmosphereGenerationState: (state: string) => { scope.hubAtmosphereGenerationState = state; },
    api: async () => { requests += 1; throw new Error("Local image model unavailable"); },
    console: { warn() {} },
    Date: class { toISOString() { return `${today}T00:00:00Z`; } },
  };
  const request = execute(`(() => { ${generation}\nreturn requestHubAtmosphereGeneration; })()`, scope) as
    (style: string, options?: { force?: boolean }) => Promise<void>;
  scope.requestHubAtmosphereGeneration = (style: string, options?: { force?: boolean }) => {
    const result = request(style, options);
    pending.push(result);
    return result;
  };
  return {
    settings,
    requests: () => requests,
    render: async () => { execute(automatic, scope); await Promise.all(pending.splice(0)); },
    retry: () => request(settings.atmosphereStyle, { force: true }),
    nextDay: () => { today = "2026-09-03"; scope.homeAtmosphereDayKey = today; },
  };
}

function replayHarness(load: () => Promise<unknown>, detail = async () => ({ recording: { id: "recording" } })) {
  let refresh!: () => Promise<void>;
  let cleanup!: () => void;
  let interval!: () => void;
  let removed = false;
  let cleared = false;
  const published: unknown[] = [];
  execute(polling, {
    replayEpisode: { id: "episode" },
    REPLAY_RECORDING_CHANGED_EVENT: "changed",
    replayRecordingForSource: load,
    replayRecordingDetail: detail,
    setReplayRecording: (value: unknown) => published.push(value),
    useEffect: (effect: () => () => void) => { cleanup = effect(); },
    window: {
      addEventListener: (_name: string, listener: () => Promise<void>) => { refresh = listener; },
      removeEventListener: () => { removed = true; },
      setInterval: (listener: () => void) => { interval = listener; return 1; },
      clearInterval: () => { cleared = true; },
    },
  });
  return { refresh, cleanup, interval, published, released: () => removed && cleared };
}

describe("Signal background refresh recovery", () => {
  it("keeps a live show running while deletion confirmation is open", () => {
    let stops = 0;
    let target: { id: string } | null = null;
    const start = signal.indexOf("const openEpisodeDeletion =");
    const callback = signal.slice(start, signal.indexOf("const dismissDeletion =", start));
    const open = execute(`(() => { ${callback}\nreturn openEpisodeDeletion; })()`, {
      resetEpisodePlayback: () => { stops += 1; },
      deleteReturnFocusRef: { current: null },
      setDeleteError() {},
      setDeleteTarget: (value: { id: string }) => { target = value; },
    }) as (episode: { id: string; status: string }, opener: object) => void;
    open({ id: "on-air", status: "live" }, {});
    assert.equal(stops, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(target)), { kind: "episode", id: "on-air", status: "live" });
    open({ id: "archive", status: "completed" }, {});
    assert.equal(stops, 1, "archive playback still stops for deletion");
  });

  it("clears failed-turn recovery when a new episode operation starts", () => {
    const failure: (string | null)[] = [];
    const previous = new AbortController();
    const operation = { current: previous };
    const start = signal.indexOf("const beginEpisodeOperation =");
    const callback = signal.slice(start, signal.indexOf("const episodeOperationIsCurrent =", start));
    const begin = execute(`(() => { ${callback}\nreturn beginEpisodeOperation; })()`, {
      useCallback: (callback: unknown) => callback,
      setFailedAdvanceEpisodeId: (id: string | null) => failure.push(id),
      episodeOperationAbortRef: operation,
      episodeRunIdRef: { current: 1 },
      AbortController,
    }) as () => { controller: AbortController; runId: number };
    const next = begin();
    assert.equal(previous.signal.aborted, true);
    assert.equal(operation.current, next.controller);
    assert.equal(next.runId, 2);
    assert.deepEqual(failure, [null]);
  });

  it("continues image recovery automatically only after all required originals are attached", () => {
    const start = signal.indexOf("const reattaching = Boolean(reattachImageId);");
    const recovery = signal.slice(start, signal.indexOf("setNotice(reattaching", start));
    assert.ok(start > 0);
    const originals = new Map([["current", {}]]);
    const editor: boolean[] = [];
    let continues = 0;
    const scope = {
      reattachImageId: "current" as string | null,
      liveEpisodeRef: { current: { id: "episode" } },
      signalEpisodeOriginalIds: () => ["current", "previous"],
      signalEpisodeImagesRef: { current: originals },
      setProducerImageEditorOpen: (open: boolean) => editor.push(open),
      setFailedAdvanceEpisodeId() {},
      onPrepareUtterance() {},
      setAutoRun: (running: boolean) => { if (running) continues += 1; },
    };
    execute(`{ ${recovery} }`, scope);
    assert.deepEqual(editor, [true]);
    assert.equal(continues, 0);
    originals.set("previous", {});
    execute(`{ ${recovery} }`, scope);
    assert.deepEqual(editor, [true, false]);
    assert.equal(continues, 1);
    scope.reattachImageId = null;
    execute(`{ ${recovery} }`, scope);
    assert.equal(continues, 1, "a new upload must not restart or interrupt the turn loop");
  });

  it("does not schedule duplicate cue updates or replace an in-flight cue identity", () => {
    const cueWrites: unknown[] = [];
    const statusWrites: unknown[] = [];
    const cueRef: { current: unknown } = { current: null };
    const start = signal.indexOf("const assignQueuedProducerCue =");
    const callback = signal.slice(start, signal.indexOf("const rememberSignalEpisodeImage =", start));
    const assign = execute(`(() => { ${callback}\nreturn assignQueuedProducerCue; })()`, {
      useCallback: (callback: unknown) => callback,
      queuedProducerCueRef: cueRef,
      queuedCueStatusRef: { current: null },
      setQueuedProducerCue: (cue: unknown) => cueWrites.push(cue),
      setQueuedCueStatus: (status: unknown) => statusWrites.push(status),
    }) as (cue: unknown, status?: string | null) => void;
    assign(null);
    assert.equal(cueWrites.length + statusWrites.length, 0);
    const cue = { kind: "present_image", imageId: "picture-2" };
    assign(cue);
    for (let i = 0; i < 100; i += 1) assign({ ...cue });
    assert.equal(cueRef.current, cue);
    assert.deepEqual(cueWrites, [cue]);
    assert.deepEqual(statusWrites, ["queued"]);
    assign({ ...cue }, "dispatching");
    assert.deepEqual(statusWrites, ["queued", "dispatching"]);
    assign(null);
    assert.equal(cueRef.current, null);
    assert.deepEqual(cueWrites, [cue, null]);
    assert.deepEqual(statusWrites, ["queued", "dispatching", null]);
  });

  it("notifies the shell only when session activity changes, using its latest callback", () => {
    const marker = signal.indexOf("onLiveSessionActiveChangeRef.current?.(\n");
    const start = signal.lastIndexOf("useEffect(() => {", marker);
    const effect = signal.slice(start, signal.indexOf("\n  useEffect", marker));
    let previous: unknown[] | null = null;
    const notifications: string[] = [];
    const listenerRef = { current: (_active: boolean, _id: string | null) => {} };
    const scope = {
      episode: { id: "episode" },
      liveSessionActive: true,
      watchBakeActive: false,
      onLiveSessionActiveChangeRef: listenerRef,
      onLiveSessionActiveChange: listenerRef.current,
      useEffect: (callback: () => void, dependencies: unknown[]) => {
        if (!previous || dependencies.some((value, index) => !Object.is(value, previous![index]))) callback();
        previous = dependencies;
      },
    };
    for (let i = 0; i < 100; i += 1) {
      scope.onLiveSessionActiveChange = (_active, _id) => { notifications.push(`listener-${i}`); };
      listenerRef.current = scope.onLiveSessionActiveChange;
      execute(effect, scope);
    }
    assert.deepEqual(notifications, ["listener-0"]);
    scope.liveSessionActive = false;
    execute(effect, scope);
    assert.deepEqual(notifications, ["listener-0", "listener-99"]);
  });

  it("attempts stale wallpaper once after failure despite repeated shell renders", async () => {
    const h = atmosphereHarness();
    for (let i = 0; i < 100; i += 1) await h.render();
    assert.equal(h.requests(), 1);
    assert.equal(h.settings.hubAtmosphereImageId, "existing-wallpaper");
  });

  it("allows explicit retries, the next day, and a changed image model", async () => {
    const h = atmosphereHarness();
    await h.render();
    await h.retry();
    await h.render();
    assert.equal(h.requests(), 2);
    h.nextDay();
    await h.render();
    await h.render();
    assert.equal(h.requests(), 3);
    h.settings.preferredHomeAtmosphereImageModel = "replacement-model";
    await h.render();
    await h.render();
    assert.equal(h.requests(), 4);
  });

  it("does not generate disabled or fresh wallpaper", async () => {
    const h = atmosphereHarness();
    h.settings.hubAtmosphereEnabled = false;
    await h.render();
    h.settings.hubAtmosphereEnabled = true;
    h.settings.hubAtmosphereGeneratedOn = "2026-09-02";
    await h.render();
    assert.equal(h.requests(), 0);
  });

  it("handles an API outage and retries successfully on the next refresh", async () => {
    let attempts = 0;
    const h = replayHarness(async () => {
      if (++attempts === 1) throw new Error("Prism is waiting for its local API.");
      return { id: "recording" };
    });
    await assert.doesNotReject(h.refresh());
    assert.equal(h.published.length, 0);
    await h.refresh();
    assert.equal(h.published.length, 1);
    h.cleanup();
    assert.equal(h.released(), true);
  });

  it("coalesces timer and change events while a replay request is pending", async () => {
    let resolve!: (value: unknown) => void;
    let requests = 0;
    const h = replayHarness(() => {
      requests += 1;
      return new Promise((done) => { resolve = done; });
    });
    const first = h.refresh();
    h.interval();
    await h.refresh();
    assert.equal(requests, 1);
    resolve({ id: "recording" });
    await first;
    assert.equal(h.published.length, 1);
  });

  it("never publishes or starts a detail request after leaving the replay", async () => {
    let resolve!: (value: unknown) => void;
    let details = 0;
    const h = replayHarness(() => new Promise((done) => { resolve = done; }), async () => {
      details += 1;
      return { recording: { id: "recording" } };
    });
    const pending = h.refresh();
    h.cleanup();
    resolve({ id: "recording" });
    await pending;
    await h.refresh();
    assert.equal(details, 0);
    assert.equal(h.published.length, 0);
  });

  it("discards a late detail response after replay teardown", async () => {
    let resolve!: (value: { recording: { id: string } }) => void;
    const h = replayHarness(async () => ({ id: "recording" }), () => new Promise((done) => { resolve = done; }));
    const pending = h.refresh();
    await new Promise<void>((done) => setImmediate(done));
    h.cleanup();
    resolve({ recording: { id: "old-recording" } });
    await pending;
    assert.equal(h.published.length, 0);
  });
});
