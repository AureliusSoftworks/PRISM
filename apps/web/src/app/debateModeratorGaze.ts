import type { DebateForumRole } from "./DebateForumScene";

/** How long the Moderator holds each advocate side while monologuing. */
export const DEBATE_MODERATOR_MONOLOGUE_LOOK_SIDE_MS = 2_200;

/**
 * While the Moderator owns the floor and is speaking, scan both podiums so
 * they address the chamber instead of staring one direction. When someone
 * else holds the floor, keep looking at that speaker.
 */
export function debateModeratorLookAtRole(args: {
  turnOwnerRole: DebateForumRole | null;
  moderatorTalking: boolean;
  speechElapsedMs: number | null;
}): DebateForumRole | null {
  if (args.turnOwnerRole !== "moderator") {
    return args.turnOwnerRole;
  }
  if (!args.moderatorTalking) {
    return null;
  }
  const elapsed = Math.max(0, args.speechElapsedMs ?? 0);
  const phase =
    Math.floor(elapsed / DEBATE_MODERATOR_MONOLOGUE_LOOK_SIDE_MS) % 2;
  return phase === 0 ? "for" : "against";
}
