import type { PsychicThoughtPayload } from "@localai/shared";

export interface PsychicThoughtDisplayLine {
  label: "Psychic";
  summary: string;
}

export interface PsychicThoughtMessageLike {
  role: string;
  psychicThought?: PsychicThoughtPayload;
}

export function psychicThoughtDisplayLineForMessage(
  message: PsychicThoughtMessageLike
): PsychicThoughtDisplayLine | null {
  if (message.role !== "user") return null;
  const summary = message.psychicThought?.summary.trim();
  if (!summary) return null;
  return { label: "Psychic", summary };
}
