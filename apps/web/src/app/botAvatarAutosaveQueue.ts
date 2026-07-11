import type { BotCustomizerSavePatch } from "./botCustomizerSavePatch";

export type BotAvatarAutosaveQueue = Map<string, BotCustomizerSavePatch>;

export interface BotAvatarAutosaveRequest {
  botId: string;
  endpoint: string;
  patch: BotCustomizerSavePatch;
  body: string;
}

export function botAvatarAutosavePatchHasFields(
  patch: BotCustomizerSavePatch
): boolean {
  return Object.keys(patch).length > 0;
}

export function queueBotAvatarAutosavePatch(
  queue: BotAvatarAutosaveQueue,
  botId: string,
  patch: BotCustomizerSavePatch
): void {
  if (!botAvatarAutosavePatchHasFields(patch)) return;
  queue.set(botId, {
    ...(queue.get(botId) ?? {}),
    ...patch,
  });
}

export function hasQueuedBotAvatarAutosavePatch(
  queue: BotAvatarAutosaveQueue,
  botId: string
): boolean {
  const patch = queue.get(botId);
  return patch !== undefined && botAvatarAutosavePatchHasFields(patch);
}

export function takeBotAvatarAutosaveRequest(
  queue: BotAvatarAutosaveQueue,
  botId: string
): BotAvatarAutosaveRequest | null {
  const patch = queue.get(botId);
  if (!patch || !botAvatarAutosavePatchHasFields(patch)) return null;
  queue.delete(botId);
  return {
    botId,
    endpoint: `/api/bots/${encodeURIComponent(botId)}`,
    patch,
    body: JSON.stringify(patch),
  };
}

export function clearBotAvatarAutosaveQueue(
  queue: BotAvatarAutosaveQueue,
  botId: string
): void {
  queue.delete(botId);
}

export function updateOwnedBotAvatarSnapshot<T extends { botId: string | null }>(
  snapshot: T | null,
  botId: string,
  update: (snapshot: T) => T
): T | null {
  return snapshot?.botId === botId ? update(snapshot) : snapshot;
}
