import type {
  ReplayManifestV1,
  ReplayPremiumSegmentV1,
  ReplayRenderKindV1,
  ReplayRecordingV1,
  ReplayTimelineV1,
  ReplayVoiceTakeRecordV1,
  ReplayVoiceTakeV1,
} from "@localai/shared";

const NATIVE_SESSION_STORAGE_KEY = "prism_native_session_token";
const CLIENT_ACCESS_STORAGE_KEY = "prism_client_access_token";

export function replayAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const nativeSessionToken = window.localStorage.getItem(
      NATIVE_SESSION_STORAGE_KEY,
    );
    const clientAccessToken = window.localStorage.getItem(
      CLIENT_ACCESS_STORAGE_KEY,
    );
    return {
      ...(nativeSessionToken
        ? { authorization: `Bearer ${nativeSessionToken}` }
        : {}),
      ...(clientAccessToken
        ? { "x-prism-client-access": clientAccessToken }
        : {}),
    };
  } catch {
    return {};
  }
}

export async function replayFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(new URL(path, window.location.origin), {
    credentials: "include",
    ...init,
    headers: {
      ...replayAuthHeaders(),
      ...(init.headers ?? {}),
    },
  });
}

async function replayJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await replayFetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? `Replay request failed (${response.status}).`);
  }
  return payload;
}

const replayTakePromises = new Map<string, Promise<ReplayVoiceTakeRecordV1>>();

export function captureReplayVoiceTake(args: {
  surface: "signal" | "coffee";
  sourceId: string;
  snapshot: ReplayVoiceTakeV1;
}): Promise<ReplayVoiceTakeRecordV1> {
  const key = `${args.surface}:${args.sourceId}:${args.snapshot.sourceKey}`;
  const existing = replayTakePromises.get(key);
  if (existing) return existing;
  const pending = replayJson<{ ok: true; take: ReplayVoiceTakeRecordV1 }>(
    "/api/replays/takes",
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  ).then((result) => result.take);
  replayTakePromises.set(key, pending);
  void pending.catch(() => {
    if (replayTakePromises.get(key) === pending) replayTakePromises.delete(key);
  });
  return pending;
}

export async function updateCapturedReplayVoiceTake(
  takePromise: Promise<ReplayVoiceTakeRecordV1>,
  patch: {
    durationMs?: number | null;
    resolvedEngine?: string | null;
    alignment?: ReplayVoiceTakeV1["alignment"];
    sourceMessageId?: string | null;
  },
): Promise<ReplayVoiceTakeRecordV1> {
  const take = await takePromise;
  const result = await replayJson<{ ok: true; take: ReplayVoiceTakeRecordV1 }>(
    `/api/replays/${encodeURIComponent(take.recordingId)}/takes/${encodeURIComponent(take.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return result.take;
}

export async function storeCapturedReplayVoiceAudio(args: {
  takePromise: Promise<ReplayVoiceTakeRecordV1>;
  bytes: ArrayBuffer;
  contentType: string;
  durationMs?: number | null;
  resolvedEngine?: string | null;
  alignment?: ReplayVoiceTakeV1["alignment"];
}): Promise<ReplayVoiceTakeRecordV1> {
  let take = await args.takePromise;
  if (
    args.durationMs !== undefined ||
    args.resolvedEngine !== undefined ||
    args.alignment !== undefined
  ) {
    take = await updateCapturedReplayVoiceTake(Promise.resolve(take), {
      durationMs: args.durationMs,
      resolvedEngine: args.resolvedEngine,
      alignment: args.alignment,
    });
  }
  const response = await replayFetch(
    `/api/replays/${encodeURIComponent(take.recordingId)}/takes/${encodeURIComponent(take.id)}/audio`,
    {
      method: "POST",
      headers: { "content-type": args.contentType },
      body: args.bytes,
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok: true; take: ReplayVoiceTakeRecordV1; error?: string }
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? `Replay audio capture failed (${response.status}).`);
  }
  return payload.take;
}

export async function queueReplayManifest(
  manifest: ReplayManifestV1,
  options: { render?: boolean } = {},
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    "/api/replays/queue",
    {
      method: "POST",
      body: JSON.stringify({ manifest, render: options.render !== false }),
    },
  );
  return result.recording;
}

export async function replayRecordingForSource(
  surface: "signal" | "coffee",
  sourceId: string,
): Promise<ReplayRecordingV1 | null> {
  const result = await replayJson<{
    ok: true;
    recordings: ReplayRecordingV1[];
  }>(
    `/api/replays?surface=${surface}&sourceId=${encodeURIComponent(sourceId)}`,
  );
  return result.recordings[0] ?? null;
}

export async function replayRecordingDetail(recordingId: string): Promise<{
  recording: ReplayRecordingV1;
  takes: ReplayVoiceTakeRecordV1[];
  premiumSegments: ReplayPremiumSegmentV1[];
}> {
  const result = await replayJson<{
    ok: true;
    recording: ReplayRecordingV1;
    takes: ReplayVoiceTakeRecordV1[];
    premiumSegments: ReplayPremiumSegmentV1[];
  }>(`/api/replays/${encodeURIComponent(recordingId)}`);
  return {
    recording: result.recording,
    takes: result.takes,
    premiumSegments: result.premiumSegments,
  };
}

export async function startReplayPremiumProduction(args: {
  recordingId: string;
  preferredProvider: "openai" | "anthropic";
  regenerate?: boolean;
}): Promise<{
  recording: ReplayRecordingV1;
  premiumSegments: ReplayPremiumSegmentV1[];
}> {
  const result = await replayJson<{
    ok: true;
    recording: ReplayRecordingV1;
    premiumSegments: ReplayPremiumSegmentV1[];
  }>(`/api/replays/${encodeURIComponent(args.recordingId)}/premium`, {
    method: "POST",
    body: JSON.stringify({
      confirm: "send-to-elevenlabs",
      preferredProvider: args.preferredProvider,
      regenerate: args.regenerate === true,
    }),
  });
  return {
    recording: result.recording,
    premiumSegments: result.premiumSegments,
  };
}

export async function retryReplayPremiumProduction(
  recordingId: string,
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(recordingId)}/premium/retry`,
    { method: "POST", body: "{}" },
  );
  return result.recording;
}

export async function uploadReplayPremiumAudio(args: {
  recordingId: string;
  bytes: ArrayBuffer;
  contentType: "audio/wav" | "audio/webm";
}): Promise<ReplayRecordingV1> {
  const response = await replayFetch(
    `/api/replays/${encodeURIComponent(args.recordingId)}/premium/audio`,
    {
      method: "POST",
      headers: { "content-type": args.contentType },
      body: args.bytes,
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok: true; recording: ReplayRecordingV1; error?: string }
    | null;
  if (!response.ok || !payload) {
    throw new Error(
      payload?.error ?? `Premium audio upload failed (${response.status}).`,
    );
  }
  return payload.recording;
}

export async function storeReplayPremiumTimeline(args: {
  recordingId: string;
  timeline: ReplayTimelineV1;
}): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(args.recordingId)}/premium/timeline`,
    {
      method: "PATCH",
      body: JSON.stringify({ timeline: args.timeline }),
    },
  );
  return result.recording;
}

export async function deleteReplayPremiumMedia(
  recordingId: string,
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(recordingId)}/premium`,
    {
      method: "DELETE",
      body: JSON.stringify({ confirm: "delete-premium-media" }),
    },
  );
  return result.recording;
}

export async function claimReplayRecording(
  filters: {
    surface?: "signal" | "coffee";
    sourceId?: string;
  } = {},
): Promise<{
  recording: ReplayRecordingV1;
  takes: ReplayVoiceTakeRecordV1[];
  premiumSegments: ReplayPremiumSegmentV1[];
  renderToken: string;
  renderKind: ReplayRenderKindV1;
} | null> {
  const result = await replayJson<{
    ok: true;
    claimed: {
      recording: ReplayRecordingV1;
      takes: ReplayVoiceTakeRecordV1[];
      premiumSegments: ReplayPremiumSegmentV1[];
      renderToken: string;
      renderKind: ReplayRenderKindV1;
    } | null;
  }>("/api/replays/claim", {
    method: "POST",
    body: JSON.stringify(filters),
  });
  return result.claimed;
}

export async function updateReplayRenderProgress(args: {
  recordingId: string;
  renderToken: string;
  status: "preparing_audio" | "rendering";
  progress: number;
}): Promise<void> {
  await replayJson(
    `/api/replays/${encodeURIComponent(args.recordingId)}/progress`,
    {
      method: "PATCH",
      body: JSON.stringify(args),
    },
  );
}

export async function uploadReplayRenderChunk(args: {
  recordingId: string;
  renderToken: string;
  position: number;
  bytes: Uint8Array;
}): Promise<void> {
  const response = await replayFetch(
    `/api/replays/${encodeURIComponent(args.recordingId)}/render-chunk`,
    {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-prism-replay-token": args.renderToken,
        "x-prism-replay-position": String(args.position),
      },
      body: args.bytes.buffer.slice(
        args.bytes.byteOffset,
        args.bytes.byteOffset + args.bytes.byteLength,
      ) as ArrayBuffer,
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Replay upload failed (${response.status}).`);
  }
}

export async function completeReplayRender(args: {
  recordingId: string;
  renderToken: string;
  contentType: "video/mp4" | "video/webm";
  codec: string;
  durationMs: number;
  warning?: string | null;
  timeline?: ReplayTimelineV1 | null;
}): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(args.recordingId)}/complete`,
    { method: "POST", body: JSON.stringify(args) },
  );
  return result.recording;
}

export async function failReplayRender(args: {
  recordingId: string;
  renderToken: string;
  error: string;
}): Promise<void> {
  await replayJson(`/api/replays/${encodeURIComponent(args.recordingId)}/fail`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function retryReplayRecording(
  recordingId: string,
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(recordingId)}/retry`,
    { method: "POST", body: "{}" },
  );
  return result.recording;
}

export async function deleteReplayRecording(
  recordingId: string,
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(recordingId)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ confirm: "delete-recording" }),
    },
  );
  return result.recording;
}
