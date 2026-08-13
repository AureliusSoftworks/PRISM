import { MODEL_EFFORT_ICON_PATHS } from "./modelEffortControl.ts";

export const BOT_GROUP_LEADERSHIP_MAX_POINTS = 5;

export type BotGroupLeadershipEffort =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface BotGroupLeadershipSource {
  leaderBotId?: string | null;
}

export function botGroupLeadershipCount(
  groups: readonly BotGroupLeadershipSource[],
  botId: string | null | undefined,
): number {
  const normalizedBotId = botId?.trim() ?? "";
  if (!normalizedBotId) return 0;
  return groups.reduce(
    (count, group) => count + (group.leaderBotId === normalizedBotId ? 1 : 0),
    0,
  );
}

export function botGroupLeadershipEffort(
  groupCount: number,
): BotGroupLeadershipEffort | null {
  if (!Number.isFinite(groupCount) || groupCount < 1) return null;
  const points = Math.min(
    BOT_GROUP_LEADERSHIP_MAX_POINTS,
    Math.max(1, Math.floor(groupCount)),
  );
  return (["minimal", "low", "medium", "high", "xhigh"] as const)[
    points - 1
  ];
}

export function botGroupLeadershipIconPath(
  groupCount: number,
): string | null {
  const effort = botGroupLeadershipEffort(groupCount);
  return effort ? MODEL_EFFORT_ICON_PATHS[effort] : null;
}
