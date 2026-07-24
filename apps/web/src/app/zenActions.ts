import {
  extractStageDirectionCues,
  extractStageDirections,
  type StageDirectionCue,
} from "./botMention.ts";

export type ZenActionMotion = "default" | "glance" | "nod" | "breath" | "tap" | "settle";

export interface ZenActionCue extends StageDirectionCue {
  action: string;
  revealAtDisplayLength: number;
  displayAtDisplayLength: number;
  motion: ZenActionMotion;
  key: string;
}

export interface ZenActionPresentation {
  mainText: string;
  cues: ZenActionCue[];
  hasActions: boolean;
  actionOnly: boolean;
}

const MAX_ZEN_ACTION_DISPLAY_LENGTH = 96;
const ZEN_ACTION_PRESENTATION_CACHE_MIN_LENGTH = 80;
const ZEN_ACTION_PRESENTATION_CACHE_LIMIT = 128;
export const ZEN_ACTION_REVEAL_LEAD_DISPLAY_LENGTH = 48;
export const ZEN_ACTION_TEXT_LAG_MS = 320;
const zenActionPresentationCache = new Map<string, ZenActionPresentation>();

export function sentenceCaseActionText(action: string): string {
  return action
    .toLocaleLowerCase()
    .replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

export const sentenceCaseZenActionText = sentenceCaseActionText;

export function normalizeZenActionText(action: string): string {
  let normalized = action.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/^\*+|\*+$/gu, "").trim();
  normalized = normalized.replace(/^[("'\u201c\u2018]+|[)"'\u201d\u2019]+$/gu, "").trim();
  normalized = normalized.replace(/[.!?\u2026;:,]+$/u, "").trim();
  if (Array.from(normalized).length <= MAX_ZEN_ACTION_DISPLAY_LENGTH) {
    return sentenceCaseZenActionText(normalized);
  }
  return sentenceCaseZenActionText(`${Array.from(normalized)
    .slice(0, MAX_ZEN_ACTION_DISPLAY_LENGTH - 3)
    .join("")
    .trimEnd()}...`);
}

export function classifyZenActionMotion(action: string): ZenActionMotion {
  const normalized = action.toLowerCase();
  if (/\b(?:glanc(?:e|es|ing)|look(?:s|ing)?|gaz(?:e|es|ing)|star(?:e|es|ing)|squint(?:s|ing)?|watch(?:es|ing)?|turn(?:s|ing)?)\b/u.test(normalized)) {
    return "glance";
  }
  if (/\b(?:nod(?:s|ding)?|smil(?:e|es|ing)|grin(?:s|ning)?|laugh(?:s|ing)?|chuckl(?:e|es|ing)|shrug(?:s|ging)?|wav(?:e|es|ing))\b/u.test(normalized)) {
    return "nod";
  }
  if (/\b(?:breath(?:e|es|ing)?|inhal(?:e|es|ing)|exhal(?:e|es|ing)|sigh(?:s|ing)?|paus(?:e|es|ing)|whisper(?:s|ing)?|murmur(?:s|ing)?)\b/u.test(normalized)) {
    return "breath";
  }
  if (/\b(?:tap(?:s|ping)?|touch(?:es|ing)?|set(?:s|ting)?|plac(?:e|es|ing)|pick(?:s|ing)?|reach(?:es|ing)?|press(?:es|ing)?|drum(?:s|ming)?|pat(?:s|ting)?)\b/u.test(normalized)) {
    return "tap";
  }
  if (/\b(?:lean(?:s|ing)?|settl(?:e|es|ing)|sit(?:s|ting)?|stand(?:s|ing)?|still|hesitat(?:e|es|ing))\b/u.test(normalized)) {
    return "settle";
  }
  return "default";
}

function zenActionKey(action: string): string {
  return action.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function normalizeZenActionCue(cue: StageDirectionCue, index: number): ZenActionCue | null {
  const action = normalizeZenActionText(cue.action);
  if (!action) return null;
  const revealAtDisplayLength = Math.max(0, Math.floor(cue.revealAtDisplayLength));
  const displayAtDisplayLength = Math.max(
    0,
    revealAtDisplayLength - ZEN_ACTION_REVEAL_LEAD_DISPLAY_LENGTH
  );
  const key = zenActionKey(action);
  return {
    action,
    revealAtDisplayLength,
    displayAtDisplayLength,
    motion: classifyZenActionMotion(action),
    key: `${revealAtDisplayLength}:${key || index}`,
  };
}

export function resolveZenActionPresentation(text: string): ZenActionPresentation {
  if (text.length >= ZEN_ACTION_PRESENTATION_CACHE_MIN_LENGTH) {
    const cached = zenActionPresentationCache.get(text);
    if (cached) {
      zenActionPresentationCache.delete(text);
      zenActionPresentationCache.set(text, cached);
      return cached;
    }
  }
  const cues: ZenActionCue[] = [];
  let previousActionKey: string | null = null;
  for (const [index, cue] of extractStageDirectionCues(text).entries()) {
    const normalizedCue = normalizeZenActionCue(cue, index);
    if (!normalizedCue) continue;
    const actionKey = zenActionKey(normalizedCue.action);
    if (actionKey && actionKey === previousActionKey) continue;
    previousActionKey = actionKey || null;
    cues.push(normalizedCue);
  }

  if (cues.length === 0) {
    const presentation = {
      mainText: text,
      cues: [],
      hasActions: false,
      actionOnly: false,
    };
    if (text.length >= ZEN_ACTION_PRESENTATION_CACHE_MIN_LENGTH) {
      zenActionPresentationCache.set(text, presentation);
      while (zenActionPresentationCache.size > ZEN_ACTION_PRESENTATION_CACHE_LIMIT) {
        const oldestKey = zenActionPresentationCache.keys().next().value;
        if (typeof oldestKey !== "string") break;
        zenActionPresentationCache.delete(oldestKey);
      }
    }
    return presentation;
  }

  const { mainText } = extractStageDirections(text);
  const presentation = {
    mainText,
    cues,
    hasActions: true,
    actionOnly: mainText.trim().length === 0,
  };
  if (text.length >= ZEN_ACTION_PRESENTATION_CACHE_MIN_LENGTH) {
    zenActionPresentationCache.set(text, presentation);
    while (zenActionPresentationCache.size > ZEN_ACTION_PRESENTATION_CACHE_LIMIT) {
      const oldestKey = zenActionPresentationCache.keys().next().value;
      if (typeof oldestKey !== "string") break;
      zenActionPresentationCache.delete(oldestKey);
    }
  }
  return presentation;
}

export function resolveCurrentZenActionCue(
  cues: readonly ZenActionCue[],
  visibleDisplayLength: number
): ZenActionCue | null {
  if (cues.length === 0) return null;
  const threshold = Number.isFinite(visibleDisplayLength)
    ? Math.max(0, visibleDisplayLength)
    : Number.POSITIVE_INFINITY;
  let current: ZenActionCue | null = null;
  for (const cue of cues) {
    if (cue.displayAtDisplayLength <= threshold) {
      current = cue;
      continue;
    }
    break;
  }
  return current;
}

export function resolveCanvasZenActionCue(
  cues: readonly ZenActionCue[]
): ZenActionCue | null {
  return cues[0] ?? null;
}

export function resolveZenActionPreview(text: string): ZenActionCue | null {
  const trimmed = text.trim();
  if (!trimmed || /^[!/]/u.test(trimmed)) return null;
  const presentation = resolveZenActionPresentation(trimmed);
  return presentation.cues[0] ?? null;
}

export function resolveLatestZenActionPreview(text: string): ZenActionCue | null {
  const trimmed = text.trim();
  if (!trimmed || /^[!/]/u.test(trimmed)) return null;
  const presentation = resolveZenActionPresentation(trimmed);
  return presentation.cues[presentation.cues.length - 1] ?? null;
}

export function resolvePersistentZenActionPreview(
  previousCue: ZenActionCue | null,
  text: string,
  options: { reset?: boolean } = {}
): ZenActionCue | null {
  if (options.reset === true) return null;
  return resolveLatestZenActionPreview(text) ?? previousCue;
}
