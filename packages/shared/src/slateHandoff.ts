export const SLATE_HANDOFF_TEXT_MAX_LENGTH = 8_000;

export const SLATE_HANDOFF_DIRECTIONS = [
  "zen-to-slate",
  "slate-to-zen",
] as const;
export type SlateHandoffDirection = (typeof SLATE_HANDOFF_DIRECTIONS)[number];
export type SlateHandoffStatus = "prepared" | "committed";

export interface SlateHandoffPreview {
  id: string;
  direction: SlateHandoffDirection;
  status: SlateHandoffStatus;
  sourceText: string;
  sourceLabel: string;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  sourceProjectId: string | null;
  sourceSectionId: string | null;
  sourceSelectionStart: number;
  sourceSelectionEnd: number;
  targetProjectId: string | null;
  createdAt: string;
  committedAt: string | null;
}

export interface SlateHandoffPrepareRequest {
  direction: SlateHandoffDirection;
  conversationId?: string;
  messageId?: string;
  projectId?: string;
  sectionId?: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface SlateHandoffCommitRequest {
  target: "new_project" | "existing_project" | "zen";
  projectId?: string;
  title?: string;
}
