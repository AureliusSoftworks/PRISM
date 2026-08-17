import type { DatabaseSync } from "node:sqlite";
import type {
  CoffeeContextSpark,
  CoffeeContextSparkSourceApplet,
  CoffeeContextSparkState,
} from "@localai/shared";
import { getAuxiliaryProvider, type LlmProvider } from "./providers.ts";
import { randomId } from "./security.ts";

const APPLET_ORDER: CoffeeContextSparkSourceApplet[] = [
  "signal",
  "debate",
  "coffee",
];
const MAX_CANDIDATES_PER_APPLET = 24;

interface CoffeeConversationRow {
  id: string;
  user_id: string;
  conversation_mode: string | null;
  bot_group_ids: string | null;
  coffee_group_id: string | null;
  incognito: number;
}

interface BotIdentityRow {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
}

export interface CoffeeContextSparkCandidate {
  id: string;
  sourceApplet: CoffeeContextSparkSourceApplet;
  sourceSessionId: string;
  sourceTitle: string;
  sourceDate: string;
  sourceRole: string;
  sourceSynopsis: string;
  sourceParticipantBotIds: string[];
  inspiredBotId: string;
  inspiredBotName: string;
  score: number;
}

interface CoffeeContextSparkRow {
  id: string;
  conversation_id: string;
  source_applet: CoffeeContextSparkSourceApplet;
  source_session_id: string;
  source_title: string;
  source_date: string;
  source_role: string;
  source_participant_bot_ids: string;
  inspired_bot_id: string;
  display_prompt: string;
  state: CoffeeContextSparkState;
  created_at: string;
  color: string | null;
  glyph: string | null;
  bot_name: string;
}

export interface ResolvedCoffeeContextSpark {
  id: string;
  inspiredBotId: string;
  sourceParticipantBotIds: string[];
  privateContext: string;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function oneLine(value: unknown, maxLength = 280): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maxLength)
    : "";
}

function candidateId(
  applet: CoffeeContextSparkSourceApplet,
  sessionId: string,
  botId: string,
): string {
  return `${applet}:${sessionId}:${botId}`;
}

function ageScore(date: string, nowMs: number): number {
  const ageDays = Math.max(0, (nowMs - Date.parse(date || "")) / 86_400_000);
  return Math.max(0, 60 - Math.log2(ageDays + 1) * 9);
}

function currentConversation(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
): CoffeeConversationRow {
  const row = db
    .prepare(
      `SELECT id, user_id, conversation_mode, bot_group_ids, coffee_group_id, incognito
         FROM conversations
        WHERE id = ? AND user_id = ?`,
    )
    .get(conversationId, userId) as CoffeeConversationRow | undefined;
  if (!row || row.conversation_mode !== "coffee") {
    throw new Error("Coffee session not found.");
  }
  if (row.incognito === 1) {
    throw new Error("Context Sparks are unavailable in incognito Coffee sessions.");
  }
  return row;
}

function currentBotIdentities(
  db: DatabaseSync,
  userId: string,
  ids: readonly string[],
): Map<string, BotIdentityRow> {
  const identities = new Map<string, BotIdentityRow>();
  const query = db.prepare(
    "SELECT id, name, color, glyph FROM bots WHERE id = ? AND user_id = ?",
  );
  for (const id of ids) {
    const bot = query.get(id, userId) as BotIdentityRow | undefined;
    if (bot) identities.set(id, bot);
  }
  return identities;
}

function debateCastIds(raw: string): string[] {
  try {
    const session = JSON.parse(raw) as Record<string, unknown>;
    return [session.moderator, session.forAdvocate, session.againstAdvocate]
      .map((entry) =>
        entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
          ? (entry as { id: string }).id
          : "",
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

function debateSynopsis(raw: string): string {
  try {
    const session = JSON.parse(raw) as Record<string, unknown>;
    const synopsis = session.synopsis;
    return synopsis && typeof synopsis === "object"
      ? oneLine((synopsis as { text?: unknown }).text)
      : "";
  } catch {
    return "";
  }
}

function historicalUsePenalty(
  db: DatabaseSync,
  userId: string,
  applet: CoffeeContextSparkSourceApplet,
  sourceSessionId: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM coffee_context_sparks
        WHERE user_id = ? AND source_applet = ? AND source_session_id = ?
          AND state IN ('used', 'dismissed')`,
    )
    .get(userId, applet, sourceSessionId) as { n: number };
  return Math.min(45, Number(row.n || 0) * 15);
}

export function discoverCoffeeContextSparkCandidates(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
): CoffeeContextSparkCandidate[] {
  const conversation = currentConversation(db, userId, conversationId);
  const seatedIds = parseStringArray(conversation.bot_group_ids);
  const seated = currentBotIdentities(db, userId, seatedIds);
  if (seated.size === 0) return [];
  const seatedSet = new Set(seated.keys());
  const nowMs = Date.now();
  const candidates: CoffeeContextSparkCandidate[] = [];

  const signalRows = db
    .prepare(
      `SELECT id, host_bot_id, guest_bot_id, guest_kind, title, topic,
              outcome, completed_at, updated_at
         FROM botcast_episodes
        WHERE user_id = ? AND status = 'completed' AND completed_at IS NOT NULL
        ORDER BY completed_at DESC
        LIMIT ?`,
    )
    .all(userId, MAX_CANDIDATES_PER_APPLET) as Array<Record<string, unknown>>;
  for (const row of signalRows) {
    const hostId = oneLine(row.host_bot_id, 100);
    const guestId = row.guest_kind === "bot" ? oneLine(row.guest_bot_id, 100) : "";
    const participants = [hostId, guestId].filter(Boolean);
    for (const [botId, role] of [[hostId, "host"], [guestId, "guest"]] as const) {
      const bot = seated.get(botId);
      if (!bot) continue;
      const sourceSessionId = oneLine(row.id, 100);
      const sourceDate = oneLine(row.completed_at ?? row.updated_at, 100);
      const shared = participants.filter((id) => seatedSet.has(id)).length;
      candidates.push({
        id: candidateId("signal", sourceSessionId, botId),
        sourceApplet: "signal",
        sourceSessionId,
        sourceTitle: oneLine(row.title) || oneLine(row.topic) || "A Signal episode",
        sourceDate,
        sourceRole: role,
        sourceSynopsis: oneLine(row.outcome) || oneLine(row.topic),
        sourceParticipantBotIds: participants,
        inspiredBotId: botId,
        inspiredBotName: bot.name,
        score:
          230 + shared * 28 + ageScore(sourceDate, nowMs) -
          historicalUsePenalty(db, userId, "signal", sourceSessionId),
      });
    }
  }

  const debateRows = db
    .prepare(
      `SELECT id, motion, session_json, completed_at, updated_at
         FROM debate_sessions
        WHERE user_id = ? AND status = 'completed' AND completed_at IS NOT NULL
        ORDER BY completed_at DESC
        LIMIT ?`,
    )
    .all(userId, MAX_CANDIDATES_PER_APPLET) as Array<Record<string, unknown>>;
  for (const row of debateRows) {
    const rawSession = oneLine(row.session_json, 100_000);
    const participants = debateCastIds(rawSession);
    for (const [index, botId] of participants.entries()) {
      const bot = seated.get(botId);
      if (!bot) continue;
      const sourceSessionId = oneLine(row.id, 100);
      const sourceDate = oneLine(row.completed_at ?? row.updated_at, 100);
      const shared = participants.filter((id) => seatedSet.has(id)).length;
      candidates.push({
        id: candidateId("debate", sourceSessionId, botId),
        sourceApplet: "debate",
        sourceSessionId,
        sourceTitle: oneLine(row.motion) || "A completed debate",
        sourceDate,
        sourceRole: index === 0 ? "moderator" : index === 1 ? "for advocate" : "against advocate",
        sourceSynopsis: debateSynopsis(rawSession) || oneLine(row.motion),
        sourceParticipantBotIds: participants,
        inspiredBotId: botId,
        inspiredBotName: bot.name,
        score:
          220 + shared * 28 + ageScore(sourceDate, nowMs) -
          historicalUsePenalty(db, userId, "debate", sourceSessionId),
      });
    }
  }

  if (conversation.coffee_group_id) {
    const coffeeRows = db
      .prepare(
        `SELECT c.id, c.title, c.coffee_topic, c.coffee_group_id, c.updated_at,
                m.bot_id,
                (SELECT s.content
                   FROM messages s
                  WHERE s.user_id = c.user_id AND s.conversation_id = c.id
                    AND s.role = 'system' AND s.tool_payload LIKE '%"coffeeSynopsis":true%'
                  ORDER BY s.created_at DESC LIMIT 1) AS synopsis
           FROM conversations c
           JOIN messages m
             ON m.user_id = c.user_id AND m.conversation_id = c.id
            AND m.role = 'assistant' AND m.bot_id IS NOT NULL
          WHERE c.user_id = ? AND c.conversation_mode = 'coffee'
            AND c.id <> ? AND c.incognito = 0
            AND c.coffee_group_id IS NOT NULL AND c.coffee_group_id <> ?
            AND EXISTS (
              SELECT 1 FROM messages s
               WHERE s.user_id = c.user_id AND s.conversation_id = c.id
                 AND s.role = 'system' AND s.tool_payload LIKE '%"coffeeSynopsis":true%'
            )
          GROUP BY c.id, m.bot_id
          ORDER BY c.updated_at DESC
          LIMIT ?`,
      )
      .all(
        userId,
        conversationId,
        conversation.coffee_group_id,
        MAX_CANDIDATES_PER_APPLET * 5,
      ) as Array<Record<string, unknown>>;
    const participantCache = new Map<string, string[]>();
    for (const row of coffeeRows) {
      const botId = oneLine(row.bot_id, 100);
      const bot = seated.get(botId);
      if (!bot) continue;
      const sourceSessionId = oneLine(row.id, 100);
      let participants = participantCache.get(sourceSessionId);
      if (!participants) {
        participants = (
          db
            .prepare(
              `SELECT DISTINCT bot_id FROM messages
                WHERE user_id = ? AND conversation_id = ?
                  AND role = 'assistant' AND bot_id IS NOT NULL`,
            )
            .all(userId, sourceSessionId) as Array<{ bot_id: string }>
        ).map((entry) => entry.bot_id);
        participantCache.set(sourceSessionId, participants);
      }
      const sourceDate = oneLine(row.updated_at, 100);
      const shared = participants.filter((id) => seatedSet.has(id)).length;
      candidates.push({
        id: candidateId("coffee", sourceSessionId, botId),
        sourceApplet: "coffee",
        sourceSessionId,
        sourceTitle: oneLine(row.coffee_topic) || oneLine(row.title) || "An earlier Coffee table",
        sourceDate,
        sourceRole: "participant",
        sourceSynopsis: oneLine(row.synopsis) || oneLine(row.coffee_topic),
        sourceParticipantBotIds: participants,
        inspiredBotId: botId,
        inspiredBotName: bot.name,
        score:
          210 + shared * 32 + ageScore(sourceDate, nowMs) -
          historicalUsePenalty(db, userId, "coffee", sourceSessionId),
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function assignCoffeeContextSparkCandidates(
  candidates: readonly CoffeeContextSparkCandidate[],
): CoffeeContextSparkCandidate[] {
  const byApplet = new Map<CoffeeContextSparkSourceApplet, CoffeeContextSparkCandidate[]>();
  for (const applet of APPLET_ORDER) {
    byApplet.set(
      applet,
      candidates.filter((candidate) => candidate.sourceApplet === applet).slice(0, 18),
    );
  }
  let best: CoffeeContextSparkCandidate[] = [];
  let bestScore = -Infinity;
  const visit = (
    appletIndex: number,
    selected: CoffeeContextSparkCandidate[],
    usedBots: Set<string>,
    score: number,
  ): void => {
    if (appletIndex >= APPLET_ORDER.length) {
      const total = selected.length * 10_000 + score;
      const bestKey = best.map((entry) => entry.id).join("|");
      const selectedKey = selected.map((entry) => entry.id).join("|");
      if (total > bestScore || (total === bestScore && selectedKey < bestKey)) {
        best = [...selected];
        bestScore = total;
      }
      return;
    }
    visit(appletIndex + 1, selected, usedBots, score);
    for (const candidate of byApplet.get(APPLET_ORDER[appletIndex]!) ?? []) {
      if (usedBots.has(candidate.inspiredBotId)) continue;
      usedBots.add(candidate.inspiredBotId);
      selected.push(candidate);
      visit(appletIndex + 1, selected, usedBots, score + candidate.score);
      selected.pop();
      usedBots.delete(candidate.inspiredBotId);
    }
  };
  visit(0, [], new Set(), 0);
  return best.sort(
    (a, b) => APPLET_ORDER.indexOf(a.sourceApplet) - APPLET_ORDER.indexOf(b.sourceApplet),
  );
}

function promptWords(raw: string): string[] {
  return raw.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
}

export function normalizeCoffeeContextSparkPrompt(
  raw: unknown,
  candidate: CoffeeContextSparkCandidate,
): string | null {
  const prompt = oneLine(raw, 110).replace(/[.!]+$/u, "");
  const words = promptWords(prompt);
  if (words.length < 5 || words.length > 15) return null;
  if (!/^ask\b/iu.test(prompt)) return null;
  const nameTokens = promptWords(candidate.inspiredBotName.toLowerCase());
  const lower = prompt.toLowerCase();
  if (!nameTokens.some((token) => lower.includes(token))) return null;
  if (/\b(something|anything|a past session|their experience|some thoughts)\b/iu.test(prompt)) {
    return null;
  }
  return prompt;
}

function shortSubject(raw: string): string {
  const words = promptWords(raw)
    .filter((word) => !/^(the|a|an|is|are|was|were|should|can|could)$/iu.test(word))
    .slice(0, 7);
  return words.join(" ") || "what happened last time";
}

export function fallbackCoffeeContextSparkPrompt(
  candidate: CoffeeContextSparkCandidate,
): string {
  const firstName = promptWords(candidate.inspiredBotName)[0] || candidate.inspiredBotName;
  const subject = shortSubject(candidate.sourceTitle);
  const raw =
    candidate.sourceApplet === "coffee"
      ? `Ask ${firstName} what stayed with them from ${subject}`
      : `Ask ${firstName} about ${subject}`;
  const normalized = normalizeCoffeeContextSparkPrompt(raw, candidate);
  if (normalized) return normalized;
  return `Ask ${firstName} what surprised them in that ${candidate.sourceApplet}`;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function synthesizeCoffeeContextSparkPrompts(args: {
  candidates: readonly CoffeeContextSparkCandidate[];
  provider: LlmProvider;
  groupName?: string | null;
  groupEthos?: string | null;
}): Promise<Map<string, string>> {
  const fallback = new Map(
    args.candidates.map((candidate) => [candidate.id, fallbackCoffeeContextSparkPrompt(candidate)]),
  );
  if (args.candidates.length === 0) return fallback;
  const allowedIds = args.candidates.map((candidate) => candidate.id);
  try {
    const raw = await args.provider.generateResponse(
      [
        {
          role: "system",
          content:
            "Write short, specific Coffee conversation invitations grounded only in the supplied metadata. Every line must begin with Ask, name the assigned bot, and mention a concrete subject. Never invent facts or quote transcripts.",
        },
        {
          role: "user",
          content: JSON.stringify({
            currentTable: {
              name: oneLine(args.groupName, 80),
              ethos: oneLine(args.groupEthos, 220),
            },
            candidates: args.candidates.map((candidate) => ({
              candidateId: candidate.id,
              applet: candidate.sourceApplet,
              bot: candidate.inspiredBotName,
              role: candidate.sourceRole,
              title: candidate.sourceTitle,
              synopsis: oneLine(candidate.sourceSynopsis, 240),
              date: candidate.sourceDate,
            })),
          }),
        },
      ],
      {
        temperature: 0.68,
        maxTokens: 320,
        usagePurpose: "coffee_router",
        jsonMode: true,
        jsonSchemaName: "coffee_context_sparks",
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["sparks"],
          properties: {
            sparks: {
              type: "array",
              minItems: args.candidates.length,
              maxItems: args.candidates.length,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["candidateId", "prompt"],
                properties: {
                  candidateId: { type: "string", enum: allowedIds },
                  prompt: { type: "string", minLength: 8, maxLength: 110 },
                },
              },
            },
          },
        },
      },
    );
    const parsed = parseJsonObject(raw);
    const sparks = Array.isArray(parsed?.sparks) ? parsed.sparks : [];
    const seen = new Set<string>();
    for (const entry of sparks) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const id = typeof record.candidateId === "string" ? record.candidateId : "";
      const candidate = args.candidates.find((item) => item.id === id);
      if (!candidate || seen.has(id)) continue;
      const prompt = normalizeCoffeeContextSparkPrompt(record.prompt, candidate);
      if (!prompt) continue;
      fallback.set(id, prompt);
      seen.add(id);
    }
  } catch {
    // Local auxiliary work must never block the Coffee table. Deterministic,
    // grounded copy remains available if Ollama is cold or returns bad JSON.
  }
  return fallback;
}

function rowToSpark(row: CoffeeContextSparkRow): CoffeeContextSpark {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sourceApplet: row.source_applet,
    sourceSessionId: row.source_session_id,
    sourceTitle: row.source_title,
    sourceDate: row.source_date,
    inspiredBotId: row.inspired_bot_id,
    inspiredBotName: row.bot_name,
    inspiredBotColor: row.color,
    inspiredBotGlyph: row.glyph,
    prompt: row.display_prompt,
    state: row.state,
    createdAt: row.created_at,
  };
}

function loadSparkRows(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
): CoffeeContextSparkRow[] {
  return db
    .prepare(
      `SELECT s.*, b.name AS bot_name, b.color, b.glyph
         FROM coffee_context_sparks s
         JOIN bots b ON b.id = s.inspired_bot_id AND b.user_id = s.user_id
        WHERE s.user_id = ? AND s.conversation_id = ?
        ORDER BY CASE s.source_applet
          WHEN 'signal' THEN 1 WHEN 'debate' THEN 2 ELSE 3 END`,
    )
    .all(userId, conversationId) as unknown as CoffeeContextSparkRow[];
}

function sourceExists(
  db: DatabaseSync,
  userId: string,
  row: Pick<
    CoffeeContextSparkRow,
    "source_applet" | "source_session_id" | "inspired_bot_id"
  >,
): boolean {
  if (row.source_applet === "signal") {
    return Boolean(
      db
        .prepare(
          `SELECT 1 FROM botcast_episodes
            WHERE id = ? AND user_id = ? AND status = 'completed'
              AND (host_bot_id = ? OR (guest_kind = 'bot' AND guest_bot_id = ?))`,
        )
        .get(row.source_session_id, userId, row.inspired_bot_id, row.inspired_bot_id),
    );
  }
  if (row.source_applet === "debate") {
    const source = db
      .prepare(
        "SELECT session_json FROM debate_sessions WHERE id = ? AND user_id = ? AND status = 'completed'",
      )
      .get(row.source_session_id, userId) as { session_json: string } | undefined;
    return Boolean(source && debateCastIds(source.session_json).includes(row.inspired_bot_id));
  }
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM conversations c
          WHERE c.id = ? AND c.user_id = ? AND c.conversation_mode = 'coffee' AND c.incognito = 0
            AND EXISTS (
              SELECT 1 FROM messages m
               WHERE m.user_id = c.user_id AND m.conversation_id = c.id
                 AND m.role = 'assistant' AND m.bot_id = ?
            )
            AND EXISTS (
              SELECT 1 FROM messages s
               WHERE s.user_id = c.user_id AND s.conversation_id = c.id
                 AND s.role = 'system' AND s.tool_payload LIKE '%"coffeeSynopsis":true%'
            )`,
      )
      .get(row.source_session_id, userId, row.inspired_bot_id),
  );
}

function invalidateUnavailableSparks(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
): void {
  const now = new Date().toISOString();
  const seated = new Set(
    parseStringArray(currentConversation(db, userId, conversationId).bot_group_ids),
  );
  for (const row of loadSparkRows(db, userId, conversationId)) {
    if (row.state === "used" || row.state === "dismissed" || row.state === "stale") continue;
    if (!seated.has(row.inspired_bot_id) || !sourceExists(db, userId, row)) {
      db.prepare(
        `UPDATE coffee_context_sparks SET state = 'stale', updated_at = ?
          WHERE id = ? AND user_id = ? AND conversation_id = ?`,
      ).run(now, row.id, userId, conversationId);
    }
  }
}

export async function ensureCoffeeContextSparks(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  prismDefaultLlmModel?: string | null;
  secondaryOllamaHost?: string | null;
  experimentalDualOllamaEnabled?: boolean;
  provider?: LlmProvider;
}): Promise<CoffeeContextSpark[]> {
  const conversation = currentConversation(args.db, args.userId, args.conversationId);
  const existingRun = args.db
    .prepare(
      "SELECT 1 FROM coffee_context_spark_runs WHERE user_id = ? AND conversation_id = ?",
    )
    .get(args.userId, args.conversationId);
  if (!existingRun) {
    const selected = assignCoffeeContextSparkCandidates(
      discoverCoffeeContextSparkCandidates(args.db, args.userId, args.conversationId),
    );
    if (selected.length > 0) {
      const group = conversation.coffee_group_id
        ? (args.db
            .prepare("SELECT name, ethos FROM coffee_groups WHERE id = ? AND user_id = ?")
            .get(conversation.coffee_group_id, args.userId) as
            | { name: string; ethos: string }
            | undefined)
        : undefined;
      const provider =
        args.provider ??
        getAuxiliaryProvider(args.prismDefaultLlmModel, {
          secondaryOllamaHost: args.secondaryOllamaHost,
          experimentalDualOllama: args.experimentalDualOllamaEnabled === true,
        });
      const prompts = await synthesizeCoffeeContextSparkPrompts({
        candidates: selected,
        provider,
        groupName: group?.name,
        groupEthos: group?.ethos,
      });
      const now = new Date().toISOString();
      const insert = args.db.prepare(
        `INSERT OR IGNORE INTO coffee_context_sparks
          (id, user_id, conversation_id, source_applet, source_session_id,
           source_title, source_date, source_role, source_participant_bot_ids,
           inspired_bot_id, display_prompt, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
      );
      for (const candidate of selected) {
        insert.run(
          randomId(12),
          args.userId,
          args.conversationId,
          candidate.sourceApplet,
          candidate.sourceSessionId,
          candidate.sourceTitle,
          candidate.sourceDate,
          candidate.sourceRole,
          JSON.stringify(candidate.sourceParticipantBotIds),
          candidate.inspiredBotId,
          prompts.get(candidate.id) ?? fallbackCoffeeContextSparkPrompt(candidate),
          now,
          now,
        );
      }
    }
    args.db.prepare(
      `INSERT OR IGNORE INTO coffee_context_spark_runs
        (user_id, conversation_id, generated_at) VALUES (?, ?, ?)`,
    ).run(args.userId, args.conversationId, new Date().toISOString());
  }
  invalidateUnavailableSparks(args.db, args.userId, args.conversationId);
  return loadSparkRows(args.db, args.userId, args.conversationId)
    .filter((row) => row.state === "available" || row.state === "armed")
    .map(rowToSpark);
}

export function updateCoffeeContextSparkState(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  sparkId: string;
  state: "available" | "armed" | "dismissed";
}): CoffeeContextSpark[] {
  currentConversation(args.db, args.userId, args.conversationId);
  const row = loadSparkRows(args.db, args.userId, args.conversationId).find(
    (entry) => entry.id === args.sparkId,
  );
  if (!row || row.state === "used" || row.state === "stale") {
    throw new Error("Context Spark is no longer available.");
  }
  if (!sourceExists(args.db, args.userId, row)) {
    args.db.prepare(
      `UPDATE coffee_context_sparks SET state = 'stale', updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(new Date().toISOString(), args.sparkId, args.userId);
    throw new Error("Context Spark source is no longer available.");
  }
  const now = new Date().toISOString();
  args.db.exec("BEGIN IMMEDIATE");
  try {
    if (args.state === "armed") {
      args.db.prepare(
        `UPDATE coffee_context_sparks SET state = 'available', updated_at = ?
          WHERE user_id = ? AND conversation_id = ? AND state = 'armed' AND id <> ?`,
      ).run(now, args.userId, args.conversationId, args.sparkId);
    }
    args.db.prepare(
      `UPDATE coffee_context_sparks SET state = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND conversation_id = ?`,
    ).run(args.state, now, args.sparkId, args.userId, args.conversationId);
    args.db.exec("COMMIT");
  } catch (error) {
    args.db.exec("ROLLBACK");
    throw error;
  }
  return loadSparkRows(args.db, args.userId, args.conversationId)
    .filter((entry) => entry.state === "available" || entry.state === "armed")
    .map(rowToSpark);
}

export function resolveCoffeeContextSparkForTurn(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  sparkId?: string;
}): ResolvedCoffeeContextSpark | null {
  if (!args.sparkId) return null;
  const conversation = currentConversation(args.db, args.userId, args.conversationId);
  const seatedIds = new Set(parseStringArray(conversation.bot_group_ids));
  const row = loadSparkRows(args.db, args.userId, args.conversationId).find(
    (entry) => entry.id === args.sparkId,
  );
  if (!row || (row.state !== "available" && row.state !== "armed")) {
    throw new Error("Context Spark is no longer available.");
  }
  if (!seatedIds.has(row.inspired_bot_id)) {
    throw new Error("That Context Spark persona is no longer at this table.");
  }
  if (!sourceExists(args.db, args.userId, row)) {
    args.db.prepare(
      `UPDATE coffee_context_sparks SET state = 'stale', updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(new Date().toISOString(), row.id, args.userId);
    throw new Error("Context Spark source is no longer available.");
  }
  const participants = parseStringArray(row.source_participant_bot_ids);
  return {
    id: row.id,
    inspiredBotId: row.inspired_bot_id,
    sourceParticipantBotIds: participants,
    privateContext: [
      `Private context for ${row.bot_name}, who actually participated in this source:`,
      `${row.source_applet} — ${row.source_title} (${row.source_role}).`,
      `Answer the user's public invitation from your own remembered participation.`,
      `Do not claim that anyone outside the source session remembers it.`,
    ].join(" "),
  };
}

export function consumeCoffeeContextSpark(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  sparkId: string;
}): void {
  const now = new Date().toISOString();
  const result = args.db.prepare(
    `UPDATE coffee_context_sparks
        SET state = 'used', consumed_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND conversation_id = ?
        AND state IN ('available', 'armed')`,
  ).run(now, now, args.sparkId, args.userId, args.conversationId);
  if (Number(result.changes) !== 1) {
    throw new Error("Context Spark could not be consumed.");
  }
}
