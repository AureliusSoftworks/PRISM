import type { DatabaseSync } from "node:sqlite";
import type {
  SlateLivingSummary,
  SlateProjectChatMessage,
  SlateProjectDetail,
} from "@localai/shared";
import type { SlateAiOperationInput } from "./slate.ts";
import { getSlateProject } from "./slate.ts";
import {
  getSlateProjectSection,
  listSlateProjectSections,
} from "./slate-continuity.ts";
import { compileSlateReturnSynopsis } from "./slate-return-sessions.ts";
import { randomId } from "./security.ts";

const CHAT_INPUT_MAX = 12_000;
const CHAT_OUTPUT_MAX = 24_000;
const PROJECT_CONTEXT_MAX = 48_000;
const TITLE_MAX = 180;

interface ChatRow {
  id: string;
  project_id: string;
  role: string;
  content: string;
  provider: string | null;
  model: string | null;
  created_at: string;
}

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new Error(`${label} must be ${maximum.toLocaleString()} characters or fewer.`);
  }
  return normalized;
}

function concise(value: string, maximum: number): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length <= maximum) return normalized;
  const cut = normalized.slice(0, maximum - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > maximum * 0.65 ? boundary : cut.length).trimEnd()}…`;
}

function summaryTail(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 560) return normalized;
  const candidate = normalized.slice(-560);
  const boundary = candidate.search(/(?<=[.!?])\s+/u);
  return boundary >= 0 ? candidate.slice(boundary + 1).trim() : candidate.trim();
}

export function refreshSlateLivingSummary(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  now = new Date(),
): SlateLivingSummary {
  const compiled = compileSlateReturnSynopsis(db, userId, projectId, now);
  const summary: SlateLivingSummary = {
    projectId,
    text: compiled.synopsis.storySoFar,
    tail: summaryTail(compiled.synopsis.storySoFar),
    sourceFingerprint: compiled.sourceFingerprint,
    updatedAt: now.toISOString(),
  };
  db.prepare(
    `INSERT INTO slate_living_summaries
      (project_id, user_id, source_fingerprint, summary, summary_tail, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       user_id = excluded.user_id,
       source_fingerprint = excluded.source_fingerprint,
       summary = excluded.summary,
       summary_tail = excluded.summary_tail,
       updated_at = excluded.updated_at`,
  ).run(
    projectId,
    userId,
    summary.sourceFingerprint,
    summary.text,
    summary.tail,
    summary.updatedAt,
  );
  return summary;
}

function chatMessageFromRow(row: ChatRow): SlateProjectChatMessage {
  const provider =
    row.provider === "local" ||
    row.provider === "openai" ||
    row.provider === "anthropic"
      ? row.provider
      : null;
  return {
    id: row.id,
    projectId: row.project_id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    provider,
    model: row.model,
    createdAt: row.created_at,
  };
}

export function listSlateProjectChatMessages(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  limit = 100,
): SlateProjectChatMessage[] {
  getSlateProject(db, userId, projectId);
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = db.prepare(
    `SELECT id, project_id, role, content, provider, model, created_at
       FROM slate_project_chat_messages
      WHERE project_id = ? AND user_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?`,
  ).all(projectId, userId, safeLimit) as unknown as ChatRow[];
  return rows.reverse().map(chatMessageFromRow);
}

function projectContext(
  db: DatabaseSync,
  userId: string,
  project: SlateProjectDetail,
): string {
  const summary = refreshSlateLivingSummary(db, userId, project.id);
  const lines = [
    `Title: ${project.title}`,
    `Premise: ${project.premise || project.spark}`,
    `Voice: ${project.voice || "Not fixed yet."}`,
    `Story so far: ${summary.text}`,
    `Non-negotiables: ${project.nonNegotiables.join("; ") || "None stated."}`,
    `Open threads: ${project.unresolvedThreads.filter((thread) => !thread.resolved).map((thread) => thread.label).join("; ") || "None recorded."}`,
    "Structure:",
    ...project.structure.map(
      (item, index) =>
        `${index + 1}. ${item.kind} \"${item.title}\" — ${item.summary} (${item.status})`,
    ),
    "Authoritative manuscript excerpts:",
  ];
  let used = lines.join("\n").length;
  for (const section of listSlateProjectSections(db, userId, project.id)) {
    if (used >= PROJECT_CONTEXT_MAX) break;
    const detail = getSlateProjectSection(
      db,
      userId,
      project.id,
      section.id,
    );
    if (!detail.prose.trim()) continue;
    const remaining = PROJECT_CONTEXT_MAX - used;
    const excerpt = concise(detail.prose, Math.min(8_000, remaining));
    const block = `\n[${detail.title}]\n${excerpt}`;
    lines.push(block);
    used += block.length;
  }
  return lines.join("\n").slice(0, PROJECT_CONTEXT_MAX);
}

export async function chatWithSlateProject(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  input: unknown,
  ai: SlateAiOperationInput,
): Promise<SlateProjectChatMessage[]> {
  const content = requiredText(input, "Project chat message", CHAT_INPUT_MAX);
  const project = getSlateProject(db, userId, projectId);
  const prior = listSlateProjectChatMessages(db, userId, projectId, 20);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO slate_project_chat_messages
      (id, user_id, project_id, role, content, created_at)
     VALUES (?, ?, ?, 'user', ?, ?)`,
  ).run(randomId(), userId, projectId, content, now);

  const response = requiredText(
    await ai.provider.generateResponse(
      [
        {
          role: "system",
          content:
            "You are Prism, the movable project companion inside Slate. Talk freely about the writing project in context: answer questions, brainstorm, diagnose, compare options, and help the writer think. Stay concise unless depth is requested. You may suggest document actions, but never claim that you edited prose, changed canon, renamed the project, or accepted a revision. The writer remains the author and must explicitly apply any suggestion.",
        },
        {
          role: "system",
          content: `Current Slate project context:\n\n${projectContext(db, userId, project)}`,
        },
        ...prior.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user" as const, content },
      ],
      {
        model: ai.model,
        temperature: 0.72,
        maxTokens: 2_000,
        usagePurpose: "slate_project_chat",
      },
    ),
    "Project chat reply",
    CHAT_OUTPUT_MAX,
  );
  db.prepare(
    `INSERT INTO slate_project_chat_messages
      (id, user_id, project_id, role, content, provider, model, created_at)
     VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?)`,
  ).run(
    randomId(),
    userId,
    projectId,
    response,
    ai.providerName,
    ai.model,
    new Date().toISOString(),
  );
  return listSlateProjectChatMessages(db, userId, projectId);
}

function parseTitleDecision(raw: string): {
  keep: boolean;
  title: string;
  reason: string;
} {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  const parsed = JSON.parse(
    first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed,
  ) as Record<string, unknown>;
  const keep = parsed.keep === true;
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
  return { keep, title, reason };
}

export async function suggestSlateProjectTitle(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  ai: SlateAiOperationInput,
): Promise<SlateProjectDetail> {
  const project = getSlateProject(db, userId, projectId);
  const decision = parseTitleDecision(
    await ai.provider.generateResponse(
      [
        {
          role: "system",
          content:
            "You are Prism acting as a restrained literary title editor. Recommend a replacement only when it is materially more specific, resonant, and faithful than the current working title. Return strict JSON: {\"keep\": boolean, \"title\": string, \"reason\": string}. If the current title should stay, set keep true and title to the current title.",
        },
        {
          role: "user",
          content: projectContext(db, userId, project),
        },
      ],
      {
        model: ai.model,
        temperature: 0.55,
        maxTokens: 500,
        jsonMode: true,
        usagePurpose: "slate_title_suggestion",
      },
    ),
  );
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE slate_title_suggestions
        SET status = 'dismissed', resolved_at = ?
      WHERE project_id = ? AND user_id = ? AND status = 'pending'`,
  ).run(now, projectId, userId);
  if (
    !decision.keep &&
    decision.title &&
    decision.title.length <= TITLE_MAX &&
    decision.title.toLocaleLowerCase() !== project.title.toLocaleLowerCase()
  ) {
    db.prepare(
      `INSERT INTO slate_title_suggestions
        (id, user_id, project_id, suggested_title, reason, provider, model,
         status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(
      randomId(),
      userId,
      projectId,
      decision.title,
      concise(decision.reason || "This title better reflects the manuscript as it now stands.", 1_000),
      ai.providerName,
      ai.model,
      now,
    );
  }
  return getSlateProject(db, userId, projectId);
}

export function resolveSlateProjectTitleSuggestion(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  suggestionId: string,
  resolution: "accepted" | "dismissed",
): SlateProjectDetail {
  const suggestion = db.prepare(
    `SELECT id, suggested_title FROM slate_title_suggestions
      WHERE id = ? AND project_id = ? AND user_id = ? AND status = 'pending'`,
  ).get(suggestionId, projectId, userId) as
    | { id: string; suggested_title: string }
    | undefined;
  if (!suggestion) throw new Error("Slate title suggestion not found.");
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      `UPDATE slate_title_suggestions SET status = ?, resolved_at = ?
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    ).run(resolution, now, suggestionId, projectId, userId);
    if (resolution === "accepted") {
      db.prepare(
        `UPDATE slate_projects SET title = ?, updated_at = ?
          WHERE id = ? AND user_id = ?`,
      ).run(suggestion.suggested_title, now, projectId, userId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSlateProject(db, userId, projectId);
}
