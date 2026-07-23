export function botPowerRuleLabelForDisplay(value: string): string {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ");
  if (!normalized) return "Power effect";
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}
