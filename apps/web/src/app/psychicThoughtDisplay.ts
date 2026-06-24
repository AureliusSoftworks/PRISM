import type { PsychicThoughtPayload } from "@localai/shared";

export interface PsychicCanvasScratchpadPayload {
  v: 1;
  scratchpad: string;
  effort: PsychicThoughtPayload["effort"];
  provider: PsychicThoughtPayload["provider"];
  model?: string;
  simulated: boolean;
  passCount?: number;
  guidanceChars?: number;
  createdAt: string;
}

export interface PsychicThoughtDisplayLine {
  label: "Psychic";
  summary: string;
  state: "summary" | "thinking";
  animated: boolean;
  ariaLabel: string;
  scratchpad?: string;
  scratchpadMeta?: string;
}

export interface PsychicThoughtDisplayOptions {
  pendingThinking?: boolean;
  pendingDelayElapsed?: boolean;
  reducedMotion?: boolean;
  showScratchpad?: boolean;
}

export interface PsychicThoughtMessageLike {
  role: string;
  psychicThought?: PsychicThoughtPayload;
  psychicScratchpad?: PsychicCanvasScratchpadPayload;
}

export function psychicThoughtDisplayLineForMessage(
  message: PsychicThoughtMessageLike,
  options: PsychicThoughtDisplayOptions = {}
): PsychicThoughtDisplayLine | null {
  if (message.role !== "user") return null;
  const summary = message.psychicThought?.summary.trim();
  const scratchpad =
    options.showScratchpad === true
      ? message.psychicScratchpad?.scratchpad.trim()
      : undefined;
  const scratchpadMeta = scratchpad && message.psychicScratchpad
    ? [
        message.psychicScratchpad.provider,
        message.psychicScratchpad.model,
        `effort ${message.psychicScratchpad.effort}`,
        typeof message.psychicScratchpad.passCount === "number"
          ? `${message.psychicScratchpad.passCount} passes`
          : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · ")
    : undefined;
  if (summary) {
    return {
      label: "Psychic",
      summary,
      state: "summary",
      animated: false,
      ariaLabel: `Psychic summary: ${summary}`,
      ...(scratchpad ? { scratchpad } : {}),
      ...(scratchpad && scratchpadMeta ? { scratchpadMeta } : {}),
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
