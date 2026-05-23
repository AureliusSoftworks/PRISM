export interface MemoryListQueryOptions {
  conversationId: string | null;
  botId: string | null;
  scope: string | null;
  inferBotMemories: boolean;
  limit: number;
}

const MEMORY_LIST_DEFAULT_LIMIT = 100;
const MEMORY_LIST_MIN_LIMIT = 1;
const MEMORY_LIST_MAX_LIMIT = 100;

function readOptionalString(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseMemoryListQueryOptions(query: URLSearchParams): MemoryListQueryOptions {
  const conversationId = readOptionalString(query.get("conversationId"));
  const botId = readOptionalString(query.get("botId"));
  const scope = readOptionalString(query.get("scope"));
  const inferRaw = readOptionalString(query.get("infer"));
  const limitRaw = readOptionalString(query.get("limit"));
  const inferBotMemories = inferRaw !== "false";

  let limit = MEMORY_LIST_DEFAULT_LIMIT;
  if (limitRaw) {
    const parsed = Number(limitRaw);
    if (Number.isFinite(parsed)) {
      limit = Math.max(MEMORY_LIST_MIN_LIMIT, Math.min(MEMORY_LIST_MAX_LIMIT, Math.floor(parsed)));
    }
  }

  return {
    conversationId,
    botId,
    scope,
    inferBotMemories,
    limit,
  };
}
