/**
 * Coffee mode — group chat for 2-5 reactive bots.
 *
 * v0 architecture (per the Hub Modes Roadmap, Phase 1):
 *   1. The user picks 2-5 bots from their library when starting a Coffee
 *      thread (per-thread one-off picker).
 *   2. Each user message triggers a small router LLM call that picks ONE
 *      bot from the group based on personality + recent conversation
 *      context. The router runs on the local auxiliary model so it does
 *      not consume online quota.
 *   3. The picked bot then replies through the user's selected provider
 *      using its own system prompt, identity, and generation overrides.
 *   4. Memory is thread-scoped only (no cross-thread bot memory writes
 *      in v0). The rolling history window IS the thread's memory, the
 *      same way Sandbox treats it.
 *
 * Coffee deliberately does NOT go through `processChatMessage`. That
 * function carries Chat- and Sandbox-specific logic (cross-session memory
 * writes, opinion tracking, starter prompts, AskQuestion tool detection,
 * mood signaling) that doesn't apply here. Reusing it would either
 * silently leak Coffee turns into the cross-thread `memories` table or
 * require many new branches inside an already-3.3k-line module. A leaner
 * sibling keeps the pipelines independent and easy to evolve separately.
 */

import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";
import {
  getAuxiliaryProvider,
  selectProvider,
  type GenerateOptions,
  type LlmProvider,
  type ProviderMessage,
} from "./providers.ts";
import { composeBotSystemPrompt } from "./bots.ts";
import type {
  ChatMessage,
  Conversation,
  CoffeeTurnResponse,
} from "@localai/shared";

/** Coffee groups must have at least 2 and at most 5 bots. */
export const COFFEE_GROUP_MIN_SIZE = 2;
export const COFFEE_GROUP_MAX_SIZE = 5;

/** Recent message window forwarded to the router and the speaker. */
const COFFEE_HISTORY_WINDOW = 24;

/** Router LLM call budget — keep low so latency stays acceptable. */
const ROUTER_TEMPERATURE = 0.2;
const ROUTER_MAX_TOKENS = 80;

/** Fallback when router output cannot be parsed. */
const ROUTER_FALLBACK_REASON = "Router fallback (unparseable response)";

/**
 * Bot row shape used internally by the router and speaker pipeline.
 * Subset of the `bots` table — only what Coffee needs for v0.
 */
export interface CoffeeBotProfile {
  id: string;
  name: string;
  systemPrompt: string;
  color: string | null;
  glyph: string | null;
  localModel: string | null;
  onlineModel: string | null;
  defaultModel: string | null;
  temperature: number | null;
  maxTokens: number | null;
  onlineEnabled: boolean;
}

/** Settings forwarded from the HTTP route. */
export interface CoffeeTurnSettings {
  preferredProvider: "local" | "openai";
  openAiApiKey?: string;
  secondaryOllamaHost?: string | null;
  userDisplayName?: string;
}

export interface CoffeeTurnInput {
  conversationId?: string;
  groupBotIds?: string[];
  message: string;
}

/**
 * Validate and normalize an incoming `groupBotIds` payload.
 *
 * - Trims, dedupes, and length-checks (min 2, max 5).
 * - Throws a user-readable error rather than silently truncating, since
 *   the picker UI on the client should surface the same constraint.
 */
export function normalizeCoffeeGroupBotIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      `Coffee groups need ${COFFEE_GROUP_MIN_SIZE}-${COFFEE_GROUP_MAX_SIZE} bots.`
    );
  }
  const trimmed: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    trimmed.push(id);
  }
  if (trimmed.length < COFFEE_GROUP_MIN_SIZE) {
    throw new Error(`Pick at least ${COFFEE_GROUP_MIN_SIZE} bots for a Coffee chat.`);
  }
  if (trimmed.length > COFFEE_GROUP_MAX_SIZE) {
    throw new Error(`Coffee groups max out at ${COFFEE_GROUP_MAX_SIZE} bots.`);
  }
  return trimmed;
}

/**
 * Look up the bots in `botIds` for `userId`. Throws when any bot is
 * missing so we never enter a Coffee turn with a half-resolved group.
 */
export function loadCoffeeGroupProfiles(
  db: DatabaseSync,
  userId: string,
  botIds: string[]
): CoffeeBotProfile[] {
  if (botIds.length === 0) return [];
  const placeholders = botIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, name, system_prompt, color, glyph, model, local_model, online_model,
              online_enabled, temperature, max_tokens
         FROM bots
        WHERE id IN (${placeholders})
          AND (user_id = ? OR visibility = 'public')`
    )
    .all(...botIds, userId) as Array<{
    id: string;
    name: string | null;
    system_prompt: string | null;
    color: string | null;
    glyph: string | null;
    model: string | null;
    local_model: string | null;
    online_model: string | null;
    online_enabled: number | null;
    temperature: number | null;
    max_tokens: number | null;
  }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Preserve the caller's ordering (matches the picker order).
  const profiles: CoffeeBotProfile[] = [];
  for (const id of botIds) {
    const row = byId.get(id);
    if (!row) {
      throw new Error("One or more bots in this Coffee group could not be found.");
    }
    profiles.push({
      id: row.id,
      name: typeof row.name === "string" && row.name.trim().length > 0 ? row.name.trim() : "Unnamed bot",
      systemPrompt: typeof row.system_prompt === "string" ? row.system_prompt : "",
      color: row.color ?? null,
      glyph: row.glyph ?? null,
      localModel: row.local_model ?? null,
      onlineModel: row.online_model ?? null,
      defaultModel: row.model ?? null,
      temperature: typeof row.temperature === "number" ? row.temperature : null,
      maxTokens: typeof row.max_tokens === "number" ? row.max_tokens : null,
      onlineEnabled: row.online_enabled !== 0,
    });
  }
  return profiles;
}

/**
 * Build the router LLM prompt that picks the next speaker.
 *
 * The router is asked to emit a single-line JSON object with `botId`
 * (must match one of the group ids) and `reason` (a short rationale).
 * We keep the schema tiny so even small local models can comply.
 */
export function buildRouterPrompt(args: {
  group: CoffeeBotProfile[];
  history: ChatMessage[];
  userMessage: string;
  lastSpeakerBotId: string | null;
}): ProviderMessage[] {
  const { group, history, userMessage, lastSpeakerBotId } = args;

  const personaLines = group.map((bot) => {
    const personaSnippet = summarizePersonaForRouter(bot.systemPrompt);
    return `- id="${bot.id}" name="${bot.name}"${personaSnippet ? ` persona=${personaSnippet}` : ""}`;
  });

  const recencyHint = lastSpeakerBotId
    ? `The last bot to speak was id="${lastSpeakerBotId}". Prefer variety unless the same bot is clearly the most natural next speaker.`
    : `No bot has spoken yet in this thread.`;

  const systemContent = [
    "You are the silent moderator of a casual group chat ('Coffee mode').",
    "There are several bots in this group, each with a distinct personality.",
    "After each user message you choose EXACTLY ONE bot from the group to respond next, based on which bot's personality and interests best match the conversation.",
    "Output requirements:",
    "  - Reply with a single line of valid JSON only.",
    `  - Schema: {"botId": "<one of the listed ids>", "reason": "<one short sentence>"}`,
    "  - Do not include any prose, code fences, comments, or extra fields.",
    "",
    "Bots in this group:",
    ...personaLines,
    "",
    recencyHint,
  ].join("\n");

  const messages: ProviderMessage[] = [
    { role: "system", content: systemContent },
  ];

  // Include only a tail of the history to keep the router cheap.
  const trimmedHistory = history.slice(-Math.min(history.length, 8));
  for (const item of trimmedHistory) {
    const speakerLabel =
      item.role === "assistant"
        ? item.botName
          ? `${item.botName} (assistant)`
          : "assistant"
        : item.role;
    messages.push({
      role: item.role === "assistant" ? "assistant" : "user",
      content: `[${speakerLabel}] ${item.content}`,
    });
  }
  messages.push({
    role: "user",
    content: `[user] ${userMessage}`,
  });
  messages.push({
    role: "system",
    content: "Choose the next speaker. Reply with the JSON object only.",
  });

  return messages;
}

/**
 * Parse the router LLM response into a `{ botId, reason }` pair.
 * Validates that `botId` is one of the allowed group ids; otherwise
 * returns null so the caller can fall back to the next bot in rotation.
 */
export function parseRouterResponse(
  raw: string,
  allowedBotIds: string[]
): { botId: string; reason: string } | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // The model sometimes wraps JSON in code fences or chatter despite the
  // schema instruction. Try a couple of progressively-tolerant parses.
  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (fenceMatch && fenceMatch[0] !== trimmed) {
    candidates.push(fenceMatch[0]);
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const obj = parsed as { botId?: unknown; reason?: unknown };
      const botId = typeof obj.botId === "string" ? obj.botId.trim() : "";
      if (!botId || !allowedBotIds.includes(botId)) continue;
      const reason =
        typeof obj.reason === "string" && obj.reason.trim().length > 0
          ? obj.reason.trim()
          : "Router pick (no reason provided)";
      return { botId, reason };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Pick a fallback speaker when the router fails — a deterministic
 * round-robin that just walks past the previous speaker. Mirrors the
 * "round-robin" alternative from the design discussion so the chat still
 * progresses gracefully without an extra LLM call.
 */
export function pickFallbackSpeaker(
  group: CoffeeBotProfile[],
  lastSpeakerBotId: string | null
): CoffeeBotProfile {
  if (group.length === 0) {
    throw new Error("Coffee group is empty; cannot pick a fallback speaker.");
  }
  if (!lastSpeakerBotId) return group[0]!;
  const index = group.findIndex((bot) => bot.id === lastSpeakerBotId);
  if (index < 0) return group[0]!;
  return group[(index + 1) % group.length]!;
}

/**
 * Build the speaker LLM prompt for the picked bot. Lighter than
 * `buildPromptMessages` in chat.ts — Coffee skips Prism tool appendix
 * (no AskQuestion in v0), opinion plumbing, dev memories, and starter
 * directives. Just identity + history + the new user message.
 */
function buildSpeakerPrompt(args: {
  speaker: CoffeeBotProfile;
  group: CoffeeBotProfile[];
  history: ChatMessage[];
  userMessage: string;
  userDisplayName?: string;
}): ProviderMessage[] {
  const { speaker, group, history, userMessage, userDisplayName } = args;
  const speakerSystemPrompt = composeBotSystemPrompt(
    speaker.name,
    speaker.systemPrompt
  );
  const peerLines = group
    .filter((bot) => bot.id !== speaker.id)
    .map((bot) => `- ${bot.name}`);

  const groupContextLines = [
    "You are participating in a casual group chat ('Coffee mode') with the user and the following other bots:",
    ...peerLines,
    "",
    "Stay in character. Respond as yourself only — do NOT speak on behalf of the other bots, do NOT include their names as speakers, and do NOT prefix your reply with your own name.",
    "Keep replies conversational and concise unless the user invites depth.",
  ];

  const messages: ProviderMessage[] = [];
  if (speakerSystemPrompt) {
    messages.push({ role: "system", content: speakerSystemPrompt });
  }
  messages.push({ role: "system", content: groupContextLines.join("\n") });
  if (userDisplayName && userDisplayName.trim().length > 0) {
    messages.push({
      role: "system",
      content: `The user's preferred name is "${userDisplayName.trim()}". Use it naturally when it helps, but do not overuse it.`,
    });
  }
  // Annotate every prior assistant message with its bot name so the
  // speaker knows who said what — without this, all assistants blur
  // together as "the same bot."
  for (const item of history) {
    const speakerLabel =
      item.role === "assistant"
        ? item.botName
          ? `${item.botName} (assistant)`
          : "assistant"
        : "user";
    messages.push({
      role: item.role === "assistant" ? "assistant" : "user",
      content: `[${speakerLabel}] ${item.content}`,
    });
  }
  messages.push({ role: "user", content: `[user] ${userMessage}` });
  return messages;
}

/**
 * Truncate a system prompt to a short snippet for the router. Keeps
 * personas distinguishable without ballooning the router prompt to
 * full system-prompt length.
 */
function summarizePersonaForRouter(systemPrompt: string): string {
  const trimmed = systemPrompt.trim();
  if (!trimmed) return "";
  const oneLine = trimmed.replace(/\s+/g, " ");
  return oneLine.length > 140 ? `"${oneLine.slice(0, 137)}..."` : `"${oneLine}"`;
}

interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  conversation_mode: string | null;
  bot_id: string | null;
  bot_group_ids: string | null;
  incognito: number;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  bot_id: string | null;
  created_at: string;
  bot_name: string | null;
  bot_color: string | null;
  bot_glyph: string | null;
}

function loadConversationRow(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): ConversationRow | undefined {
  return db
    .prepare(
      `SELECT id, user_id, title, conversation_mode, bot_id, bot_group_ids, incognito, created_at, updated_at
         FROM conversations
        WHERE id = ? AND user_id = ?`
    )
    .get(conversationId, userId) as ConversationRow | undefined;
}

function loadMessages(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  limit: number
): ChatMessage[] {
  const rowsDesc = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.model, m.bot_id, m.created_at,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
         FROM messages m
         LEFT JOIN bots b ON b.id = m.bot_id
        WHERE m.conversation_id = ? AND m.user_id = ?
        ORDER BY m.created_at DESC
        LIMIT ?`
    )
    .all(conversationId, userId, limit) as unknown as MessageRow[];
  return rowsDesc
    .slice()
    .reverse()
    .map((row): ChatMessage => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      provider: row.provider === "local" || row.provider === "openai" ? row.provider : undefined,
      model: row.model ?? undefined,
      botName: row.bot_name ?? undefined,
      botColor: row.bot_color ?? undefined,
      botGlyph: row.bot_glyph ?? undefined,
    }));
}

/**
 * Look up the bot_id of the most recent assistant message in this thread.
 * Used by the router to know "who spoke last" without us needing to leak
 * the internal bot_id field onto the public ChatMessage shape.
 */
function loadLastSpeakerBotId(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string | null {
  const row = db
    .prepare(
      `SELECT bot_id
         FROM messages
        WHERE conversation_id = ? AND user_id = ? AND role = 'assistant'
        ORDER BY created_at DESC
        LIMIT 1`
    )
    .get(conversationId, userId) as { bot_id: string | null } | undefined;
  return row?.bot_id ?? null;
}

function generateCoffeeTitle(message: string, group: CoffeeBotProfile[]): string {
  const trimmed = message.trim();
  if (trimmed.length > 0) {
    return trimmed.length > 42 ? `${trimmed.slice(0, 39)}...` : trimmed;
  }
  // Fall back to a participant list when the user starts with a blank message.
  const names = group.map((bot) => bot.name).join(", ");
  return names.length > 42 ? `${names.slice(0, 39)}...` : `Coffee with ${names}`;
}

function buildConversationResponse(args: {
  row: ConversationRow;
  messages: ChatMessage[];
  lastSpeakerBotId: string | null;
}): Conversation {
  const { row, messages, lastSpeakerBotId } = args;
  const groupIds = parseStoredBotGroupIds(row.bot_group_ids);
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mode: "coffee",
    botId: row.bot_id ?? null,
    ...(groupIds.length > 0 ? { botGroupIds: groupIds } : {}),
    incognito: row.incognito === 1,
    lastBotId: lastSpeakerBotId,
    lastBotColor: messages.length > 0 ? findLastAssistantColor(messages) : null,
    hasAssistantReply: messages.some((message) => message.role === "assistant"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  };
}

function findLastAssistantColor(history: ChatMessage[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "assistant" && typeof message.botColor === "string") {
      return message.botColor;
    }
  }
  return null;
}

function parseStoredBotGroupIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
  } catch {
    return [];
  }
}

/**
 * Build a `LlmProvider` for the speaker bot, honoring per-bot online
 * gating (a bot with `online_enabled = 0` always falls back to local).
 */
function pickSpeakerProvider(
  speaker: CoffeeBotProfile,
  preferred: "local" | "openai",
  openAiApiKey: string | undefined,
  secondaryOllamaHost: string | null | undefined
): { provider: LlmProvider; effectiveProvider: "local" | "openai" } {
  let effective: "local" | "openai" = preferred;
  if (preferred === "openai" && !speaker.onlineEnabled) {
    effective = "local";
  }
  const provider = selectProvider(effective, openAiApiKey, secondaryOllamaHost);
  return { provider, effectiveProvider: effective };
}

function pickSpeakerModel(
  speaker: CoffeeBotProfile,
  effectiveProvider: "local" | "openai"
): string | undefined {
  if (effectiveProvider === "local") {
    return speaker.localModel ?? speaker.defaultModel ?? undefined;
  }
  return speaker.onlineModel ?? speaker.defaultModel ?? undefined;
}

/**
 * Main Coffee turn entrypoint.
 *
 * Returns the updated conversation (including the new user + assistant
 * messages) and the speaker bot id chosen by the router.
 */
export async function processCoffeeTurn(
  db: DatabaseSync,
  userId: string,
  input: CoffeeTurnInput,
  settings: CoffeeTurnSettings
): Promise<CoffeeTurnResponse> {
  const message = typeof input.message === "string" ? input.message : "";
  if (message.trim().length === 0) {
    throw new Error("Coffee messages cannot be empty.");
  }

  const now = new Date().toISOString();
  let conversationRow: ConversationRow | undefined;
  let group: CoffeeBotProfile[];
  let groupIds: string[];

  if (input.conversationId) {
    conversationRow = loadConversationRow(db, userId, input.conversationId);
    if (!conversationRow) {
      throw new Error("Conversation not found for this user.");
    }
    if (conversationRow.conversation_mode !== "coffee") {
      throw new Error("This conversation is not a Coffee thread.");
    }
    groupIds = parseStoredBotGroupIds(conversationRow.bot_group_ids);
    if (groupIds.length < COFFEE_GROUP_MIN_SIZE) {
      throw new Error(
        "This Coffee thread is missing its bot group; please start a new chat."
      );
    }
    group = loadCoffeeGroupProfiles(db, userId, groupIds);
  } else {
    groupIds = normalizeCoffeeGroupBotIds(input.groupBotIds);
    group = loadCoffeeGroupProfiles(db, userId, groupIds);
    const newConversationId = randomId(12);
    db.prepare(
      `INSERT INTO conversations
         (id, user_id, title, conversation_mode, bot_id, bot_group_ids, incognito, created_at, updated_at)
       VALUES (?, ?, ?, 'coffee', NULL, ?, 0, ?, ?)`
    ).run(
      newConversationId,
      userId,
      generateCoffeeTitle(message, group),
      JSON.stringify(groupIds),
      now,
      now
    );
    conversationRow = loadConversationRow(db, userId, newConversationId);
    if (!conversationRow) {
      throw new Error("Failed to create Coffee conversation.");
    }
  }

  // 1. Persist the user message.
  const userMessageId = randomId(12);
  db.prepare(
    `INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at)
     VALUES (?, ?, ?, 'user', ?, NULL, ?)`
  ).run(userMessageId, conversationRow.id, userId, message, now);

  // 2. Load recent history (now includes the new user message).
  const history = loadMessages(
    db,
    userId,
    conversationRow.id,
    COFFEE_HISTORY_WINDOW
  );
  // Strip the new user message from the "prior history" window since the
  // prompt builders attach it explicitly as the latest turn.
  const priorHistory = history.slice(0, history.length - 1);
  // The router's "prefer variety" hint reads the most recent assistant
  // bot_id straight from the DB (it's not part of the public ChatMessage
  // shape, so we go to the source rather than smuggle it through).
  const lastSpeakerBotId = loadLastSpeakerBotId(db, userId, conversationRow.id);

  // 3. Router LLM picks the next speaker.
  const routerProvider = getAuxiliaryProvider();
  const routerMessages = buildRouterPrompt({
    group,
    history: priorHistory,
    userMessage: message,
    lastSpeakerBotId,
  });
  let pickedBotId: string;
  let routerReason: string;
  try {
    const routerRaw = await routerProvider.generateResponse(routerMessages, {
      temperature: ROUTER_TEMPERATURE,
      maxTokens: ROUTER_MAX_TOKENS,
    });
    const parsed = parseRouterResponse(
      routerRaw,
      group.map((bot) => bot.id)
    );
    if (parsed) {
      pickedBotId = parsed.botId;
      routerReason = parsed.reason;
    } else {
      const fallback = pickFallbackSpeaker(group, lastSpeakerBotId);
      pickedBotId = fallback.id;
      routerReason = ROUTER_FALLBACK_REASON;
    }
  } catch {
    const fallback = pickFallbackSpeaker(group, lastSpeakerBotId);
    pickedBotId = fallback.id;
    routerReason = "Router error (fell back to round-robin)";
  }

  const speaker = group.find((bot) => bot.id === pickedBotId) ?? group[0]!;

  // 4. Speaker LLM produces the reply.
  const { provider: speakerProvider, effectiveProvider } = pickSpeakerProvider(
    speaker,
    settings.preferredProvider,
    settings.openAiApiKey,
    settings.secondaryOllamaHost
  );
  const speakerOptions: GenerateOptions = {};
  const speakerModel = pickSpeakerModel(speaker, effectiveProvider);
  if (speakerModel) speakerOptions.model = speakerModel;
  if (typeof speaker.temperature === "number") {
    speakerOptions.temperature = speaker.temperature;
  }
  if (typeof speaker.maxTokens === "number") {
    speakerOptions.maxTokens = speaker.maxTokens;
  }
  const speakerMessages = buildSpeakerPrompt({
    speaker,
    group,
    history: priorHistory,
    userMessage: message,
    userDisplayName: settings.userDisplayName,
  });
  const speakerReply = await speakerProvider.generateResponse(
    speakerMessages,
    speakerOptions
  );
  const replyText = typeof speakerReply === "string" ? speakerReply.trim() : "";
  if (!replyText) {
    throw new Error("Speaker bot returned an empty reply.");
  }

  // 5. Persist the assistant message + bump the conversation timestamp.
  const assistantNow = new Date().toISOString();
  const assistantMessageId = randomId(12);
  db.prepare(
    `INSERT INTO messages
       (id, conversation_id, user_id, role, content, provider, model, bot_id, created_at)
     VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?)`
  ).run(
    assistantMessageId,
    conversationRow.id,
    userId,
    replyText,
    effectiveProvider,
    speakerModel ?? null,
    speaker.id,
    assistantNow
  );
  db.prepare(
    "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(assistantNow, conversationRow.id, userId);

  const refreshedRow = loadConversationRow(db, userId, conversationRow.id) ?? conversationRow;
  const finalHistory = loadMessages(db, userId, refreshedRow.id, COFFEE_HISTORY_WINDOW);
  const finalLastSpeakerBotId = loadLastSpeakerBotId(db, userId, refreshedRow.id);
  const conversation = buildConversationResponse({
    row: refreshedRow,
    messages: finalHistory,
    lastSpeakerBotId: finalLastSpeakerBotId,
  });

  return {
    conversation,
    speakerBotId: speaker.id,
    routerReason,
  };
}
