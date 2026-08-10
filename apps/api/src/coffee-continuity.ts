import type { DatabaseSync } from "node:sqlite";

const COFFEE_CONTINUITY_DEFAULT_LIMIT = 2;
const COFFEE_CONTINUITY_QUERY_LIMIT = 100;
const COFFEE_CONTINUITY_SUMMARY_MAX_CHARS = 700;
const COFFEE_SESSION_SYNOPSIS_PREFIX = "Session synopsis:";

export interface CoffeeContinuityContext {
  conversationId: string;
  title: string;
  topic: string | null;
  summary: string;
  updatedAt: string;
}

function parseCoffeeContinuityBotIds(raw: string | null | undefined): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

function coffeeContinuityMentionsInternalAccountMetadata(text: string): boolean {
  return /\b(?:your\s+)?account\s+(?:display\s+name\s+is|has\s+not\s+provided\s+a\s+display\s+name\s+yet)\b/i.test(
    text
  );
}

function normalizeCoffeeContinuityText(
  value: string | null | undefined,
  maxChars = COFFEE_CONTINUITY_SUMMARY_MAX_CHARS
): string | null {
  const collapsed = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!collapsed) return null;
  const withoutSynopsisPrefix = collapsed
    .replace(/^#{1,6}\s*session synopsis\s*[:\-]?\s*/i, "")
    .replace(/^\*\*session synopsis\*\*\s*[:\-]?\s*/i, "")
    .replace(/^session synopsis\s*[:\-]\s*/i, "")
    .trim();
  if (!withoutSynopsisPrefix) return null;
  if (coffeeContinuityMentionsInternalAccountMetadata(withoutSynopsisPrefix)) return null;
  if (withoutSynopsisPrefix.length <= maxChars) return withoutSynopsisPrefix;
  return `${withoutSynopsisPrefix.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function normalizeCoffeeContinuityTopic(value: string | null | undefined): string | null {
  return normalizeCoffeeContinuityText(value, 140);
}

/**
 * Load summary-level continuity for one bot from its latest non-private Coffee
 * sessions. A current Coffee conversation may be excluded to avoid feeding its
 * rolling summary back as cross-session memory.
 */
export function loadRecentCoffeeContinuityContexts(args: {
  db: DatabaseSync;
  userId: string;
  botId: string | null | undefined;
  limit?: number;
  excludeConversationId?: string | null;
}): CoffeeContinuityContext[] {
  const botId = typeof args.botId === "string" ? args.botId.trim() : "";
  if (!botId) return [];
  const excludedConversationId = args.excludeConversationId?.trim() || null;
  const limit = Math.max(
    0,
    Math.min(10, Math.floor(args.limit ?? COFFEE_CONTINUITY_DEFAULT_LIMIT))
  );
  if (limit === 0) return [];
  const rows = args.db
    .prepare(
      `SELECT c.id, c.title, c.bot_group_ids, c.coffee_topic, c.coffee_meeting_summary,
              c.updated_at,
              (SELECT m.content
                 FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.user_id = c.user_id
                  AND m.role = 'system'
                  AND m.content LIKE ?
                ORDER BY m.created_at DESC
                LIMIT 1) AS session_synopsis,
              EXISTS (
                SELECT 1
                  FROM messages m_spoke
                 WHERE m_spoke.conversation_id = c.id
                   AND m_spoke.user_id = c.user_id
                   AND m_spoke.role = 'assistant'
                   AND m_spoke.bot_id = ?
              ) AS bot_spoke
         FROM conversations c
        WHERE c.user_id = ?
          AND c.conversation_mode = 'coffee'
          AND COALESCE(c.incognito, 0) = 0
          AND (
            c.bot_group_ids LIKE ?
            OR EXISTS (
              SELECT 1
                FROM messages m_filter
               WHERE m_filter.conversation_id = c.id
                 AND m_filter.user_id = c.user_id
                 AND m_filter.role = 'assistant'
                 AND m_filter.bot_id = ?
            )
          )
          AND (
            COALESCE(c.coffee_meeting_summary, '') != ''
            OR EXISTS (
              SELECT 1
                FROM messages m_summary
               WHERE m_summary.conversation_id = c.id
                 AND m_summary.user_id = c.user_id
                 AND m_summary.role = 'system'
              AND m_summary.content LIKE ?
            )
          )
          AND NOT EXISTS (
            SELECT 1
              FROM messages m_hidden
             WHERE m_hidden.conversation_id = c.id
               AND m_hidden.user_id = c.user_id
               AND m_hidden.role = 'assistant'
               AND m_hidden.coffee_audience_bot_ids IS NOT NULL
               AND m_hidden.coffee_audience_bot_ids NOT LIKE ?
          )
        ORDER BY c.updated_at DESC
        LIMIT ?`
    )
    .all(
      `${COFFEE_SESSION_SYNOPSIS_PREFIX}%`,
      botId,
      args.userId,
      `%${botId}%`,
      botId,
      `${COFFEE_SESSION_SYNOPSIS_PREFIX}%`,
      `%"${botId}"%`,
      COFFEE_CONTINUITY_QUERY_LIMIT
    ) as Array<{
      id: string;
      title: string | null;
      bot_group_ids: string | null;
      coffee_topic: string | null;
      coffee_meeting_summary: string | null;
      session_synopsis: string | null;
      bot_spoke: number;
      updated_at: string;
    }>;

  const contexts: CoffeeContinuityContext[] = [];
  for (const row of rows) {
    if (row.id === excludedConversationId) continue;
    const groupBotIds = parseCoffeeContinuityBotIds(row.bot_group_ids);
    const participated = groupBotIds.includes(botId) || row.bot_spoke === 1;
    if (!participated) continue;
    const summary =
      normalizeCoffeeContinuityText(row.session_synopsis) ??
      normalizeCoffeeContinuityText(row.coffee_meeting_summary);
    if (!summary) continue;
    contexts.push({
      conversationId: row.id,
      title: normalizeCoffeeContinuityText(row.title, 90) ?? "Coffee Session",
      topic: normalizeCoffeeContinuityTopic(row.coffee_topic),
      summary,
      updatedAt: row.updated_at,
    });
    if (contexts.length >= limit) break;
  }
  return contexts;
}

export function buildCoffeeContinuityPromptContext(
  contexts: readonly CoffeeContinuityContext[]
): string | null {
  if (contexts.length === 0) return null;
  return [
    "Recent Coffee session context for this bot:",
    "These are summary-level notes from the most recent Coffee sessions this bot participated in. Use them only as lightweight continuity when the table revisits a prior remark or relationship. Do not invent exact quotes; if someone supplies a quote, use it as their reference point.",
    ...contexts.map((context, index) => {
      const label = context.topic
        ? `${context.title} - topic: ${context.topic}`
        : context.title;
      return `- ${index + 1}. ${label}: ${context.summary}`;
    }),
  ].join("\n");
}
