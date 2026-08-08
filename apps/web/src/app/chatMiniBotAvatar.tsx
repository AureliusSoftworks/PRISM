"use client";

import { type CSSProperties, type ReactNode } from "react";
import styles from "./chatMiniBotAvatar.module.css";

export const CHAT_MINI_BOT_AVATAR_DARK_BASE_SRC =
  "/bot-frame/bot-frame-base.png?v=1001";
export const CHAT_MINI_BOT_AVATAR_LIGHT_BASE_SRC =
  "/bot-frame/bot-frame-light-base.png?v=1001";

/**
 * Compact bot avatar for Chat/Zen empty-hero previews. Mini avatars are static
 * identity portraits, so they deliberately omit the full avatar's talking LEDs.
 */
export function ChatMiniBotAvatar(props: {
  color?: string | null;
  alloyColor?: string | null;
  theme?: "light" | "dark";
  face: ReactNode;
  glyph: ReactNode;
  className?: string;
  /** `badge` is message-chip sized; `hero` is the empty-state preview. */
  size?: "badge" | "hero";
}): React.JSX.Element {
  const color = props.color?.trim() || null;
  const size = props.size ?? "badge";
  const theme = props.theme ?? "dark";
  const frameBaseSrc =
    theme === "light"
      ? CHAT_MINI_BOT_AVATAR_LIGHT_BASE_SRC
      : CHAT_MINI_BOT_AVATAR_DARK_BASE_SRC;

  const rootStyle = {
    ["--chat-mini-bot-color" as string]: color ?? "var(--accent)",
    ["--chat-mini-bot-alloy-color" as string]:
      props.alloyColor?.trim() || "#aeb8c1",
  } as CSSProperties;

  const rootClassName = [
    styles.root,
    size === "hero" ? styles.sizeHero : styles.sizeBadge,
    props.className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={rootClassName}
      data-chat-mini-bot-avatar="true"
      data-size={size}
      data-theme={theme}
      style={rootStyle}
      aria-hidden="true"
    >
      {/* The canonical chassis is deliberately raw so its material mask and
          measured mini-screen registration share one coordinate system. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`${styles.frame} ${styles.frameBase}`}
        src={frameBaseSrc}
        alt=""
        draggable={false}
      />
      <span className={styles.frameAlloy} aria-hidden="true" />
      <span className={styles.upperScreen}>{props.face}</span>
      <span className={styles.lowerScreen}>{props.glyph}</span>
    </span>
  );
}
