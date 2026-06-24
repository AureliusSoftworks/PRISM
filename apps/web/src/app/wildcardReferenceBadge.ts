import { parseBuiltInPromptWildcardReference } from "@localai/shared";

export function wildcardReferenceBadge(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const index = Number.parseInt(reference, 10);
  if (!Number.isFinite(index) || index < 1 || index > 26) return null;
  return String.fromCharCode("A".charCodeAt(0) + index - 1);
}

export function nextWildcardReferenceNumber(
  currentReference: string | null | undefined,
  direction: "up" | "down"
): number | null {
  const current = currentReference ? Number.parseInt(currentReference, 10) : 0;
  const safeCurrent = Number.isFinite(current) && current >= 1 && current <= 26 ? current : 0;
  if (safeCurrent === 0) return 1;
  if (direction === "up") return safeCurrent >= 26 ? null : safeCurrent + 1;
  return safeCurrent <= 1 ? null : safeCurrent - 1;
}

export function rewriteWildcardSlotTokenReference(
  token: string,
  direction: "up" | "down"
): string | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  const reference = parseBuiltInPromptWildcardReference(trimmed.slice(1, -1));
  if (!reference) return null;
  const next = nextWildcardReferenceNumber(reference.reference, direction);
  return `{${reference.slot.label}${next ?? ""}}`;
}
