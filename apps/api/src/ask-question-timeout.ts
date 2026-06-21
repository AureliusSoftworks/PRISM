import { parseStoredToolPayload } from "@localai/shared";

export type AskQuestionTimeoutMessage = {
  id: string;
  role: string;
  created_at: string;
  tool_payload: string | null;
};

export type AskQuestionTimeoutLaterMessage = {
  id: string;
  role: string;
  created_at: string;
};

export type AskQuestionTimeoutApplicability =
  | { applies: true; messageId: string }
  | { applies: false; reason: "not_askquestion" | "answered" | "stale" };

export function resolveAskQuestionTimeoutApplicability(
  message: AskQuestionTimeoutMessage | undefined,
  laterMessage: AskQuestionTimeoutLaterMessage | undefined
): AskQuestionTimeoutApplicability {
  if (!message || message.role !== "assistant" || !parseStoredToolPayload(message.tool_payload)) {
    return { applies: false, reason: "not_askquestion" };
  }
  if (laterMessage?.role === "user") {
    return { applies: false, reason: "answered" };
  }
  if (laterMessage) {
    return { applies: false, reason: "stale" };
  }
  return { applies: true, messageId: message.id };
}
