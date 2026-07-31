export type ParsedCoffeeDevCommand =
  | { kind: "none" }
  | { kind: "error"; error: string }
  | { kind: "toggleDev" };

/**
 * Coffee-only slash helpers that never leave the table composer as chat text.
 * Currently: `/dev` toggles Coffee debug mode.
 */
export function parseCoffeeDevCommand(text: string): ParsedCoffeeDevCommand {
  const trimmed = text.trim();
  if (/^\/dev(?:\s|$)/i.test(trimmed)) {
    return trimmed.replace(/^\/dev/i, "").trim().length === 0
      ? { kind: "toggleDev" }
      : {
          kind: "error",
          error: "Use `/dev` by itself to toggle Coffee debug mode.",
        };
  }
  return { kind: "none" };
}
