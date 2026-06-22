import type { PsychicThoughtPayload } from "@localai/shared";

export interface PsychicThoughtDisplayLine {
  label: "Psychic";
  summary: string;
  state: "summary" | "thinking";
  animated: boolean;
  ariaLabel: string;
}

export interface PsychicThoughtDisplayOptions {
  pendingThinking?: boolean;
  pendingDelayElapsed?: boolean;
  reducedMotion?: boolean;
}

export interface PsychicThoughtMessageLike {
  role: string;
  psychicThought?: PsychicThoughtPayload;
}

export function psychicThoughtDisplayLineForMessage(
  message: PsychicThoughtMessageLike,
  options: PsychicThoughtDisplayOptions = {}
): PsychicThoughtDisplayLine | null {
  if (message.role !== "user") return null;
  const summary = message.psychicThought?.summary.trim();
  if (summary) {
    return {
      label: "Psychic",
      summary,
      state: "summary",
      animated: false,
      ariaLabel: `Psychic summary: ${summary}`,
    };
  }
  if (!options.pendingThinking || !options.pendingDelayElapsed) return null;
  return {
    label: "Psychic",
    summary: "Considering what matters for this reply...",
    state: "thinking",
    animated: options.reducedMotion !== true,
    ariaLabel: "Psychic is considering the reply.",
  };
}
