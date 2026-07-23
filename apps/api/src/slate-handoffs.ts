import type { DatabaseSync } from "node:sqlite";
import {
  SLATE_HANDOFF_TEXT_MAX_LENGTH,
  type SlateHandoffCommitRequest,
  type SlateHandoffPrepareRequest,
  type SlateHandoffPreview,
} from "@localai/shared";
import { randomId } from "./security.ts";
import { createSlateProject } from "./slate.ts";

interface SlateHandoffRow {
  id: string;
  direction: SlateHandoffPreview["direction"];
  status: SlateHandoffPreview["status"];
  source_text: string;
  source_label: string;
  source_conversation_id: string | null;
  source_message_id: string | null;
  source_project_id: string | null;
  source_section_id: string | null;
  source_selection_start: number;
  source_selection_end: number;
  target_project_id: string | null;
  created_at: string;
  committed_at: string | null;
}

function handoffFromRow(row: SlateHandoffRow): SlateHandoffPreview {
  return {
    id: row.id,
    direction: row.direction,
    status: row.status,
    sourceText: row.source_text,
    sourceLabel: row.source_label,
    sourceConversationId: row.source_conversation_id,
    sourceMessageId: row.source_message_id,
    sourceProjectId: row.source_project_id,
    sourceSectionId: row.source_section_id,
    sourceSelectionStart: row.source_selection_start,
    sourceSelectionEnd: row.source_selection_end,
    targetProjectId: row.target_project_id,
    createdAt: row.created_at,
    committedAt: row.committed_at,
  };
}

function selectionBounds(
  source: string,
  startValue: unknown,
  endValue: unknown,
): { start: number; end: number; text: string } {
  if (
    typeof startValue !== "number" ||
    !Number.isInteger(startValue) ||
    typeof endValue !== "number" ||
    !Number.isInteger(endValue) ||
    startValue < 0 ||
    endValue <= startValue ||
    endValue > source.length
  ) {
    throw new Error("Select one exact source passage before continuing.");
  }
  const text = source.slice(startValue, endValue);
  if (!text.trim()) throw new Error("The selected source passage is empty.");
  if (text.length > SLATE_HANDOFF_TEXT_MAX_LENGTH) {
    throw new Error(
      `Keep the selected source under ${SLATE_HANDOFF_TEXT_MAX_LENGTH.toLocaleString()} characters.`,
    );
  }
  return { start: startValue, end: endValue, text };
}

function insertPreparedHandoff(
  db: DatabaseSync,
  userId: string,
  source: Omit<SlateHandoffPreview, "id" | "status" | "targetProjectId" | "createdAt" | "committedAt">,
): SlateHandoffPreview {
  const id = randomId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO slate_handoffs (
       id, user_id, direction, status, source_text, source_label,
       source_conversation_id, source_message_id, source_project_id,
       source_section_id, source_selection_start, source_selection_end,
       created_at
     ) VALUES (?, ?, ?, 'prepared', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    source.direction,
    source.sourceText,
    source.sourceLabel,
    source.sourceConversationId,
    source.sourceMessageId,
    source.sourceProjectId,
    source.sourceSectionId,
    source.sourceSelectionStart,
    source.sourceSelectionEnd,
    now,
  );
  return getSlateHandoff(db, userId, id);
}

export function prepareSlateHandoff(
  db: DatabaseSync,
  userId: string,
  input: SlateHandoffPrepareRequest,
): SlateHandoffPreview {
  if (
    !input ||
    (input.direction !== "zen-to-slate" && input.direction !== "slate-to-zen")
  ) {
    throw new Error("Choose a supported Slate handoff direction.");
  }
  if (input.direction === "zen-to-slate") {
    if (!input.conversationId || !input.messageId) {
      throw new Error("Choose a saved Zen message before continuing.");
    }
    const row = db
      .prepare(
        `SELECT messages.content, messages.role, conversations.title,
                bots.name AS bot_name
           FROM messages
           JOIN conversations
             ON conversations.id = messages.conversation_id
            AND conversations.user_id = messages.user_id
           LEFT JOIN bots ON bots.id = messages.bot_id
          WHERE messages.id = ?
            AND messages.conversation_id = ?
            AND messages.user_id = ?
            AND conversations.conversation_mode = 'zen'`,
      )
      .get(input.messageId, input.conversationId, userId) as
      | { content: string; role: string; title: string; bot_name: string | null }
      | undefined;
    if (!row) throw new Error("That Zen source is no longer available.");
    const selection = selectionBounds(
      row.content,
      input.selectionStart,
      input.selectionEnd,
    );
    return insertPreparedHandoff(db, userId, {
      direction: "zen-to-slate",
      sourceText: selection.text,
      sourceLabel: `${row.role === "user" ? "You" : row.bot_name ?? "Prism"} · ${row.title}`,
      sourceConversationId: input.conversationId,
      sourceMessageId: input.messageId,
      sourceProjectId: null,
      sourceSectionId: null,
      sourceSelectionStart: selection.start,
      sourceSelectionEnd: selection.end,
    });
  }

  if (!input.projectId || !input.sectionId) {
    throw new Error("Choose a saved Slate section before continuing.");
  }
  const row = db
    .prepare(
      `SELECT sections.prose, sections.title AS section_title,
              projects.title AS project_title
         FROM slate_sections sections
         JOIN slate_projects projects
           ON projects.id = sections.project_id
          AND projects.user_id = sections.user_id
        WHERE sections.id = ?
          AND sections.project_id = ?
          AND sections.user_id = ?`,
    )
    .get(input.sectionId, input.projectId, userId) as
    | { prose: string; section_title: string; project_title: string }
    | undefined;
  if (!row) throw new Error("That Slate source is no longer available.");
  const selection = selectionBounds(
    row.prose,
    input.selectionStart,
    input.selectionEnd,
  );
  return insertPreparedHandoff(db, userId, {
    direction: "slate-to-zen",
    sourceText: selection.text,
    sourceLabel: `${row.project_title} · ${row.section_title}`,
    sourceConversationId: null,
    sourceMessageId: null,
    sourceProjectId: input.projectId,
    sourceSectionId: input.sectionId,
    sourceSelectionStart: selection.start,
    sourceSelectionEnd: selection.end,
  });
}

export function getSlateHandoff(
  db: DatabaseSync,
  userId: string,
  handoffId: string,
): SlateHandoffPreview {
  const row = db
    .prepare("SELECT * FROM slate_handoffs WHERE id = ? AND user_id = ?")
    .get(handoffId, userId) as unknown as SlateHandoffRow | undefined;
  if (!row) throw new Error("Slate handoff not found.");
  return handoffFromRow(row);
}

export function commitSlateHandoff(
  db: DatabaseSync,
  userId: string,
  handoffId: string,
  input: SlateHandoffCommitRequest,
): { handoff: SlateHandoffPreview; projectId: string | null } {
  if (!input || typeof input.target !== "string") {
    throw new Error("Choose a handoff destination before continuing.");
  }
  const handoff = getSlateHandoff(db, userId, handoffId);
  if (handoff.status !== "prepared") {
    return { handoff, projectId: handoff.targetProjectId };
  }
  let projectId: string | null = null;
  if (handoff.direction === "zen-to-slate") {
    if (input.target === "new_project") {
      const title =
        typeof input.title === "string" && input.title.trim()
          ? input.title.trim().slice(0, 160)
          : "From Zen";
      projectId = createSlateProject(db, userId, {
        title,
        titleOrigin: "writer",
        spark: handoff.sourceText,
      }).id;
    } else if (input.target === "existing_project" && input.projectId) {
      const project = db
        .prepare("SELECT id FROM slate_projects WHERE id = ? AND user_id = ?")
        .get(input.projectId, userId) as { id?: string } | undefined;
      if (!project?.id) throw new Error("Choose an available Slate project.");
      projectId = project.id;
    } else {
      throw new Error("Choose New project or Add to project.");
    }
  } else if (input.target !== "zen") {
    throw new Error("Approve the Slate excerpt before opening Zen.");
  }
  const committedAt = new Date().toISOString();
  db.prepare(
    `UPDATE slate_handoffs
        SET status = 'committed', target_project_id = ?, committed_at = ?
      WHERE id = ? AND user_id = ? AND status = 'prepared'`,
  ).run(projectId, committedAt, handoffId, userId);
  return {
    handoff: getSlateHandoff(db, userId, handoffId),
    projectId,
  };
}

export function listSlateProjectHandoffs(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateHandoffPreview[] {
  const project = db
    .prepare("SELECT id FROM slate_projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as { id?: string } | undefined;
  if (!project?.id) throw new Error("Slate project not found.");
  return (db
    .prepare(
      `SELECT * FROM slate_handoffs
        WHERE user_id = ? AND target_project_id = ?
          AND direction = 'zen-to-slate' AND status = 'committed'
        ORDER BY created_at DESC`,
    )
    .all(userId, projectId) as unknown as SlateHandoffRow[]).map(
    handoffFromRow,
  );
}
