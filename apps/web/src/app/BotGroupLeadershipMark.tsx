"use client";

import type { CSSProperties } from "react";
import { botGroupLeadershipIconPath } from "./botGroupLeadership";
import styles from "./BotGroupLeadershipMark.module.css";

export function BotGroupLeadershipMark({
  groupCount,
  surface,
  size,
}: {
  groupCount?: number;
  surface: "full" | "mini";
  size?: "badge" | "room" | "hero";
}): React.JSX.Element | null {
  const iconPath = botGroupLeadershipIconPath(groupCount ?? 0);
  if (!iconPath) return null;
  return (
    <span
      className={styles.mark}
      data-bot-group-leadership-mark="true"
      data-leadership-groups={String(Math.max(1, Math.floor(groupCount ?? 1)))}
      data-surface={surface}
      data-size={size}
      style={
        {
          "--bot-group-leader-mask": `url("${iconPath}")`,
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}
