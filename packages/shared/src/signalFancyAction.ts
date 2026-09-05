/**
 * Signal Producer fancy-action cues — classify authored stage text into SFX,
 * avatar gesture, and whether the host should notice it in dialogue.
 *
 * Phrase matchers stay aligned with Coffee's bundled bodily-action cues.
 */

import type { ListenerReactionVisualAction } from "./listenerReaction.js";

export type SignalFancyActionSfxKind =
  | "fart"
  | "burp"
  | "cough"
  | "laugh"
  | "sigh"
  | "gasp"
  | "throat_clear";

export type SignalFancyActionHostNotice = "none" | "mild" | "disruptive";

export type SignalFancyActionVisual =
  | ListenerReactionVisualAction
  | "lean_back"
  | "shake_head";

export interface SignalFancyActionCueV1 {
  sfxKind: SignalFancyActionSfxKind | null;
  visualAction: SignalFancyActionVisual | null;
  /** Maps onto existing Signal listener-reaction CSS animations when possible. */
  avatarReaction: ListenerReactionVisualAction | null;
  hostNotice: SignalFancyActionHostNotice;
}

function normalizeFancyAction(action: string): string {
  return action.replace(/\s+/gu, " ").trim().toLowerCase();
}

function isFartAction(normalized: string): boolean {
  return (
    /\b(?:fart(?:s|ed|ing)?|flatulat(?:e|es|ed|ing)|toot(?:s|ed|ing)?)\b/u.test(
      normalized,
    ) ||
    /\b(?:pass(?:es|ed|ing)?\s+(?:some\s+)?gas|break(?:s|ing)?\s+wind|broke\s+wind|cut(?:s|ting)?\s+the\s+cheese|let(?:s|ting)?\s+(?:one|it|a\s+fart)\s+rip)\b/u.test(
      normalized,
    )
  );
}

function isBurpAction(normalized: string): boolean {
  return (
    /\b(?:burp(?:s|ed|ing)?|belch(?:es|ed|ing)?|eructat(?:e|es|ed|ing))\b/u.test(
      normalized,
    ) || /\bbring(?:s|ing)?\s+up\s+wind\b/u.test(normalized)
  );
}

function isCoughAction(normalized: string): boolean {
  return /\b(?:cough(?:s|ed|ing)?|hack(?:s|ed|ing)?|ahem(?:s|ed|ing)?)\b/u.test(
    normalized,
  );
}

function isThroatClearAction(normalized: string): boolean {
  return /\bclear(?:s|ed|ing)?\s+(?:(?:his|her|their|its)\s+)?throat\b/u.test(
    normalized,
  );
}

function isLaughAction(normalized: string): boolean {
  return /\b(?:laugh(?:s|ed|ing)?|chuckl(?:e|es|ed|ing)|giggle(?:s|d|ing)?|snicker(?:s|ed|ing)?)\b/u.test(
    normalized,
  );
}

function isSighAction(normalized: string): boolean {
  return /\bsigh(?:s|ed|ing)?\b/u.test(normalized);
}

function isGaspAction(normalized: string): boolean {
  return /\bgasp(?:s|ed|ing)?\b/u.test(normalized);
}

function isShakeHeadAction(normalized: string): boolean {
  return (
    (/(?:\bshak(?:e|es|ing)|\bshook)\b/u.test(normalized) &&
      /\b(?:(?:his|her|their|its)\s+)?head\b/u.test(normalized)) ||
    /\bheadshake(?:s)?\b/u.test(normalized)
  );
}

function isNodAction(normalized: string): boolean {
  if (isShakeHeadAction(normalized)) return false;
  return (
    /\bnod(?:s|ded|ding)?\b/u.test(normalized) ||
    /\b(?:bob(?:s|bed|bing)?|dip(?:s|ped|ping)?|incline(?:s|d|ing)?)\s+(?:(?:his|her|their|its)\s+)?(?:head|chin)\b/u.test(
      normalized,
    )
  );
}

function isLeanInAction(normalized: string): boolean {
  return /\blean(?:s|ed|ing)?\s+(?:in|closer|forward)\b/u.test(normalized);
}

function isLeanBackAction(normalized: string): boolean {
  return (
    /\blean(?:s|ed|ing)?\s+(?:back|away)\b/u.test(normalized) ||
    /\bfold(?:s|ed|ing)?\s+(?:(?:his|her|their|its)\s+)?arms\b/u.test(normalized)
  );
}

/**
 * Classifies a Producer-authored stage action for Signal presentation and
 * host-prompt guidance. Unknown freeform actions stay text+camera only.
 */
export function classifySignalFancyActionV1(
  action: string | null | undefined,
): SignalFancyActionCueV1 | null {
  const normalized = normalizeFancyAction(action ?? "");
  if (!normalized) return null;

  if (isFartAction(normalized)) {
    return {
      sfxKind: "fart",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "disruptive",
    };
  }
  if (isBurpAction(normalized)) {
    return {
      sfxKind: "burp",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "disruptive",
    };
  }
  if (isThroatClearAction(normalized)) {
    return {
      sfxKind: "throat_clear",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "mild",
    };
  }
  if (isCoughAction(normalized)) {
    return {
      sfxKind: "cough",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "mild",
    };
  }
  if (isLaughAction(normalized)) {
    return {
      sfxKind: "laugh",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "mild",
    };
  }
  if (isGaspAction(normalized)) {
    return {
      sfxKind: "gasp",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "mild",
    };
  }
  if (isSighAction(normalized)) {
    return {
      sfxKind: "sigh",
      visualAction: null,
      avatarReaction: null,
      hostNotice: "none",
    };
  }
  if (isShakeHeadAction(normalized)) {
    return {
      sfxKind: null,
      visualAction: "shake_head",
      avatarReaction: "head_tilt",
      hostNotice: "none",
    };
  }
  if (isNodAction(normalized)) {
    return {
      sfxKind: null,
      visualAction: "nod",
      avatarReaction: "nod",
      hostNotice: "none",
    };
  }
  if (isLeanInAction(normalized)) {
    return {
      sfxKind: null,
      visualAction: "lean_in",
      avatarReaction: "lean_in",
      hostNotice: "none",
    };
  }
  if (isLeanBackAction(normalized)) {
    return {
      sfxKind: null,
      visualAction: "lean_back",
      avatarReaction: "head_tilt",
      hostNotice: "none",
    };
  }
  return {
    sfxKind: null,
    visualAction: null,
    avatarReaction: null,
    hostNotice: "none",
  };
}

/** Cue text form expected by Coffee/Signal bundled SFX planners. */
export function signalFancyActionCueText(
  stageActionText: string | null | undefined,
): string | null {
  const action = stageActionText?.replace(/\s+/gu, " ").trim();
  return action ? `*${action}*` : null;
}

/**
 * Minimum camera / silent-reveal hold so viewers can read overhead action text.
 * Roughly 400ms per word with an action-only floor of 1.8s.
 */
export function signalFancyActionReadHoldMs(
  stageActionText: string | null | undefined,
): number {
  const action = stageActionText?.replace(/\s+/gu, " ").trim() ?? "";
  if (!action) return 1_400;
  const wordCount = Math.max(1, action.split(/\s+/u).length);
  return Math.min(8_000, Math.max(1_800, wordCount * 400));
}

export function signalFancyActionHostNoticeRuleV1(
  notice: SignalFancyActionHostNotice,
): string | null {
  switch (notice) {
    case "disruptive":
      return "The guest's latest on-air turn includes a socially disruptive audible bodily event (for example a fart or burp) saved as a visible physical action. Acknowledge it once briefly in character the way a live interviewer would — a wry aside, a suppressed laugh, or a short startled beat — then return to the interview. Do not invent motive, illness, or deeper meaning, and do not derail the episode topic.";
    case "mild":
      return "The guest's latest on-air turn includes a mild audible beat such as a cough, laugh, gasp, or throat clear. You may optionally offer one brief in-character notice, then continue the interview without dwelling on it. Do not invent illness or treat it as an answer.";
    case "none":
      return "The guest's latest on-air turn may include a subtle physical gesture such as a nod, lean, head shake, or quiet sigh. Leave it stage-only: do not narrate, acknowledge, or treat that gesture as a spoken answer, agreement, or refusal.";
    default: {
      const _exhaustive: never = notice;
      return _exhaustive;
    }
  }
}
