/**
 * Coffee Session "offline-only" protection helpers.
 *
 * A bot can be locked to "Offline only" in the bot editor (the toggle
 * commits to a 🔒 protected state). Whenever the player drops one or more
 * protected bots into a Coffee Session, the entire session is forced
 * offline — no online provider is reached for any speaker, regardless of
 * the global ONLINE/LOCAL toggle (the API enforces this in
 * `effectiveCoffeeSpeakerProvider`).
 *
 * The picker UI surfaces that fact via a clear notice that names the
 * protected bots, so the player can never be surprised by which bot
 * "made" the session offline. This module owns the message-building
 * helper so it can be unit-tested in isolation, mirroring the pattern of
 * the other small Coffee helpers (e.g. `coffee-seat-gaze.ts`).
 */

/**
 * Build the plain-language picker notice. Returns `null` when no protected
 * bots are present so the caller can short-circuit rendering the notice.
 *
 * The sentence keeps up to two protected names visible inline and folds
 * any remaining names into "and N other(s)" so the line never grows
 * unbounded for large groups.
 */
export function buildCoffeeOfflineProtectionMessage(
  protectedBotNames: readonly string[]
): string | null {
  const cleaned = protectedBotNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (cleaned.length === 0) return null;
  const head = cleaned.slice(0, 2);
  const rest = cleaned.length - head.length;
  let names: string;
  if (rest > 0) {
    names = `${head.join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
  } else if (head.length === 2) {
    names = `${head[0]} and ${head[1]}`;
  } else {
    names = head[0]!;
  }
  const verb = cleaned.length === 1 ? "is" : "are";
  return `🔒 This session will run fully offline. ${names} ${verb} protected as offline-only.`;
}
