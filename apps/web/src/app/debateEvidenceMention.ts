/**
 * Debate Participant @-mention helpers for frozen evidence.
 *
 * Picker shows human titles; commit inserts `[[exhibit:id]]` / `[[source:id]]`
 * so the citation still stages on the table. Queries may filter by provenance
 * (`@exhibit`, `@brave`, `@scholar`, `@url`) or id (`@brave-1`).
 */

import {
  debateEvidenceItems,
  type DebateEvidenceItemV1,
  type DebateEvidencePacketV1,
} from "@localai/shared";
import { findAtMentionTokenPlain } from "./botMention.ts";
import { debateEvidenceSourcePropKind } from "./debateExperienceState.ts";

export type DebateEvidenceMentionPropKind =
  | "exhibit"
  | "brave"
  | "scholar"
  | "url";

export interface DebateEvidenceMentionPick {
  id: string;
  /** Wire marker kind for [[source|exhibit:id]]. */
  markerKind: "source" | "exhibit";
  propKind: DebateEvidenceMentionPropKind;
  title: string;
  /** Picker row primary label. */
  pickerLabel: string;
  /** Short provenance chip under the title. */
  kindLabel: string;
  glyph: string | null;
}

const PROP_KIND_ALIASES: Record<string, DebateEvidenceMentionPropKind> = {
  exhibit: "exhibit",
  exhibits: "exhibit",
  exibit: "exhibit",
  exibits: "exhibit",
  source: "brave",
  sources: "brave",
  brave: "brave",
  web: "brave",
  scholar: "scholar",
  scholarly: "scholar",
  crossref: "scholar",
  url: "url",
  link: "url",
  links: "url",
};

const PROP_KIND_LABEL: Record<DebateEvidenceMentionPropKind, string> = {
  exhibit: "Exhibit",
  brave: "Brave",
  scholar: "Scholar",
  url: "URL",
};

export function debateEvidenceMentionPropKindForItem(
  item: DebateEvidenceItemV1,
): DebateEvidenceMentionPropKind {
  if (item.kind === "exhibit") return "exhibit";
  return debateEvidenceSourcePropKind(item.value);
}

export function debateEvidenceMentionPicks(
  evidence: DebateEvidencePacketV1,
): DebateEvidenceMentionPick[] {
  return debateEvidenceItems(evidence).map((item) => {
    const propKind = debateEvidenceMentionPropKindForItem(item);
    const title = item.value.title.trim() || item.value.id;
    return {
      id: item.value.id,
      markerKind: item.kind,
      propKind,
      title,
      pickerLabel: title,
      kindLabel: PROP_KIND_LABEL[propKind],
      glyph: item.kind === "exhibit" ? item.value.emoji || "📦" : "📄",
    };
  });
}

export function formatDebateEvidenceMentionMarker(
  pick: Pick<DebateEvidenceMentionPick, "markerKind" | "id">,
): string {
  return `[[${pick.markerKind}:${pick.id}]]`;
}

/**
 * Normalize `@` query text: allow `[exhibit/brave]` path filters and mild typos.
 */
export function normalizeDebateEvidenceMentionQuery(query: string): string {
  return query
    .trim()
    .replace(/^\[+/u, "")
    .replace(/\]+/gu, "")
    .replace(/-#+$/u, "")
    .replace(/#+$/u, "")
    .trim()
    .toLocaleLowerCase();
}

export function parseDebateEvidenceMentionQuery(query: string): {
  propKinds: ReadonlySet<DebateEvidenceMentionPropKind> | null;
  text: string;
} {
  const normalized = normalizeDebateEvidenceMentionQuery(query);
  if (!normalized) {
    return { propKinds: null, text: "" };
  }

  const slashParts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (slashParts.length > 1) {
    const kinds = new Set<DebateEvidenceMentionPropKind>();
    const remainder: string[] = [];
    for (const part of slashParts) {
      const alias = PROP_KIND_ALIASES[part];
      if (alias) kinds.add(alias);
      else remainder.push(part);
    }
    return {
      propKinds: kinds.size > 0 ? kinds : null,
      text: remainder.join(" ").trim(),
    };
  }

  const alias = PROP_KIND_ALIASES[normalized];
  if (alias) {
    return { propKinds: new Set([alias]), text: "" };
  }

  // `@brave-` / `@scholar-2` keep id text while also biasing that prop kind.
  const idPrefix = normalized.match(/^(exhibit|brave|scholar|url|source)(?:-|$)/u);
  if (idPrefix) {
    const kindAlias = PROP_KIND_ALIASES[idPrefix[1]!] ?? null;
    return {
      propKinds: kindAlias ? new Set([kindAlias]) : null,
      text: normalized,
    };
  }

  return { propKinds: null, text: normalized };
}

export function filterEvidenceForMentionQuery(
  picks: readonly DebateEvidenceMentionPick[],
  query: string,
  limit = 8,
): DebateEvidenceMentionPick[] {
  const { propKinds, text } = parseDebateEvidenceMentionQuery(query);
  let pool = picks.filter((pick) => pick.title.length > 0 || pick.id.length > 0);
  if (propKinds && propKinds.size > 0) {
    pool = pool.filter((pick) => propKinds.has(pick.propKind));
  }
  if (text.length > 0) {
    pool = pool.filter((pick) => {
      const haystack = [
        pick.title,
        pick.id,
        pick.propKind,
        pick.kindLabel,
        pick.markerKind,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(text) || pick.id.toLocaleLowerCase().startsWith(text);
    });
  }
  return pool.slice(0, Math.max(1, limit));
}

export type DebateEvidenceMentionTabAction =
  | { kind: "none" }
  | { kind: "insert"; replacement: string; caret: number };

export function composeEvidenceMentionTabPlainTextAction(
  text: string,
  caret: number,
  picks: readonly DebateEvidenceMentionPick[],
  highlightedIndex: number,
): DebateEvidenceMentionTabAction {
  const token = findAtMentionTokenPlain(text, caret);
  if (!token) return { kind: "none" };
  const filtered = filterEvidenceForMentionQuery(picks, token.query);
  if (filtered.length === 0) return { kind: "none" };
  const hi =
    ((highlightedIndex % filtered.length) + filtered.length) % filtered.length;
  const pick = filtered[hi]!;
  const marker = formatDebateEvidenceMentionMarker(pick);
  const replacement =
    text.slice(0, token.atIndex) + marker + text.slice(token.endIndex);
  return {
    kind: "insert",
    replacement,
    caret: token.atIndex + marker.length,
  };
}

export function commitDebateEvidenceMentionAtCaret(
  text: string,
  caret: number,
  pick: DebateEvidenceMentionPick,
): DebateEvidenceMentionTabAction {
  const token = findAtMentionTokenPlain(text, caret);
  if (!token) return { kind: "none" };
  const marker = formatDebateEvidenceMentionMarker(pick);
  const replacement =
    text.slice(0, token.atIndex) + marker + text.slice(token.endIndex);
  return {
    kind: "insert",
    replacement,
    caret: token.atIndex + marker.length,
  };
}
