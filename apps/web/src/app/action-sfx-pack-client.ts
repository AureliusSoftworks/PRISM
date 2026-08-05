/**
 * Client helpers for local Action SFX packs (bot + player Foley).
 */

import {
  ACTION_SFX_PACK_CLIP_COUNT,
  ACTION_SFX_PACK_PLAYER_OWNER_ID,
  ACTION_SFX_PACK_VERSION,
  isActionSfxPackKind,
  pickActionSfxPackVariantIndex,
  type ActionSfxPackKind,
  type ActionSfxPackOwnerKind,
  type ActionSfxPackSummaryV1,
  type ActionSfxPackVariantPickState,
} from "@localai/shared";

export type ActionSfxPackProgressEvent =
  | { type: "start"; total: number }
  | {
      type: "progress";
      done: number;
      total: number;
      kind: ActionSfxPackKind;
    }
  | { type: "done"; ok: true; pack: ActionSfxPackSummaryV1 }
  | { type: "error"; ok: false; error: string; status?: number };

let variantPickState: ActionSfxPackVariantPickState = {
  lastVariantByKind: {},
};

const packPresenceCache = new Map<string, boolean>();

function ownerCacheKey(
  ownerKind: ActionSfxPackOwnerKind,
  ownerId: string,
): string {
  return `${ownerKind}:${ownerId}`;
}

export function actionSfxPackClipUrl(args: {
  origin: string;
  ownerKind: ActionSfxPackOwnerKind;
  ownerId: string;
  kind: ActionSfxPackKind;
  variantIndex: number;
}): string {
  const url = new URL("/api/action-sfx-pack/clip", args.origin);
  url.searchParams.set("ownerKind", args.ownerKind);
  url.searchParams.set("ownerId", args.ownerId);
  url.searchParams.set("kind", args.kind);
  url.searchParams.set("variantIndex", String(args.variantIndex));
  return url.toString();
}

export function resolveActionSfxPackOwnerId(
  ownerKind: ActionSfxPackOwnerKind,
  ownerId?: string | null,
): string {
  if (ownerKind === "player") return ACTION_SFX_PACK_PLAYER_OWNER_ID;
  const id = ownerId?.trim() ?? "";
  if (!id) throw new Error("A bot id is required for a bot action SFX pack.");
  return id;
}

export async function fetchActionSfxPackSummary(args: {
  origin: string;
  ownerKind: ActionSfxPackOwnerKind;
  ownerId?: string | null;
  headers?: HeadersInit;
  fetchImpl?: typeof fetch;
}): Promise<ActionSfxPackSummaryV1 | null> {
  const ownerId = resolveActionSfxPackOwnerId(args.ownerKind, args.ownerId);
  const url = new URL("/api/action-sfx-pack", args.origin);
  url.searchParams.set("ownerKind", args.ownerKind);
  url.searchParams.set("ownerId", ownerId);
  const response = await (args.fetchImpl ?? fetch)(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: args.headers,
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    pack?: ActionSfxPackSummaryV1 | null;
  } | null;
  const pack = payload?.pack ?? null;
  if (
    pack &&
    pack.v === ACTION_SFX_PACK_VERSION &&
    pack.clipCount >= ACTION_SFX_PACK_CLIP_COUNT
  ) {
    packPresenceCache.set(ownerCacheKey(args.ownerKind, ownerId), true);
    return pack;
  }
  packPresenceCache.set(ownerCacheKey(args.ownerKind, ownerId), false);
  return null;
}

export function rememberActionSfxPackPresence(
  ownerKind: ActionSfxPackOwnerKind,
  ownerId: string,
  present: boolean,
): void {
  packPresenceCache.set(ownerCacheKey(ownerKind, ownerId), present);
}

export function actionSfxPackLikelyPresent(
  ownerKind: ActionSfxPackOwnerKind,
  ownerId: string,
): boolean | null {
  const key = ownerCacheKey(ownerKind, ownerId);
  if (!packPresenceCache.has(key)) return null;
  return packPresenceCache.get(key) === true;
}

/**
 * Resolves a playable pack clip URL with anti-repeat variant picking.
 * Returns null when the owner has no pack (caller should use bundled fallback).
 */
export async function resolveActionSfxPackPlayback(args: {
  origin: string;
  ownerKind: ActionSfxPackOwnerKind;
  ownerId?: string | null;
  kind: ActionSfxPackKind;
  headers?: HeadersInit;
  fetchImpl?: typeof fetch;
  random?: () => number;
}): Promise<{ source: string; variantIndex: number } | null> {
  if (!isActionSfxPackKind(args.kind)) return null;
  const ownerId = resolveActionSfxPackOwnerId(args.ownerKind, args.ownerId);
  const known = actionSfxPackLikelyPresent(args.ownerKind, ownerId);
  if (known === false) return null;

  const pick = pickActionSfxPackVariantIndex({
    kind: args.kind,
    state: variantPickState,
    random: args.random,
  });
  variantPickState = pick.state;

  const source = actionSfxPackClipUrl({
    origin: args.origin,
    ownerKind: args.ownerKind,
    ownerId,
    kind: args.kind,
    variantIndex: pick.variantIndex,
  });

  // Probe once when presence is unknown so silent vocal kinds do not 404 spam.
  if (known === null) {
    const response = await (args.fetchImpl ?? fetch)(source, {
      method: "GET",
      credentials: "include",
      cache: "force-cache",
      headers: args.headers,
    });
    if (!response.ok) {
      packPresenceCache.set(ownerCacheKey(args.ownerKind, ownerId), false);
      return null;
    }
    packPresenceCache.set(ownerCacheKey(args.ownerKind, ownerId), true);
    // URL still works for Audio element; browser will refetch/cache as needed.
    return { source, variantIndex: pick.variantIndex };
  }

  return { source, variantIndex: pick.variantIndex };
}

export async function generateActionSfxPackWithProgress(args: {
  origin: string;
  ownerKind: ActionSfxPackOwnerKind;
  ownerId?: string | null;
  ownerLabel?: string;
  personaSnippet?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  onEvent?: (event: ActionSfxPackProgressEvent) => void;
  fetchImpl?: typeof fetch;
}): Promise<ActionSfxPackSummaryV1> {
  const ownerId = resolveActionSfxPackOwnerId(args.ownerKind, args.ownerId);
  const response = await (args.fetchImpl ?? fetch)(
    new URL("/api/action-sfx-pack/generate", args.origin),
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        ...(args.headers ?? {}),
      },
      body: JSON.stringify({
        ownerKind: args.ownerKind,
        ownerId,
        ...(args.ownerLabel ? { ownerLabel: args.ownerLabel } : {}),
        ...(args.personaSnippet
          ? { personaSnippet: args.personaSnippet }
          : {}),
      }),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error?.trim() ||
        `Action SFX pack generation failed (${response.status}).`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Action SFX pack generation returned an empty stream.");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let summary: ActionSfxPackSummaryV1 | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: ActionSfxPackProgressEvent;
      try {
        event = JSON.parse(trimmed) as ActionSfxPackProgressEvent;
      } catch {
        continue;
      }
      args.onEvent?.(event);
      if (event.type === "done" && event.ok) {
        summary = event.pack;
      } else if (event.type === "error") {
        streamError = event.error;
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!summary) {
    throw new Error("Action SFX pack generation ended without a result.");
  }
  rememberActionSfxPackPresence(args.ownerKind, ownerId, true);
  return summary;
}

/** Test helper — reset anti-repeat + presence caches. */
export function resetActionSfxPackClientStateForTests(): void {
  variantPickState = { lastVariantByKind: {} };
  packPresenceCache.clear();
}
