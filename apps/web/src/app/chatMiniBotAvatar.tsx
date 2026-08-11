"use client";

import { type CSSProperties, type ReactNode } from "react";
import styles from "./chatMiniBotAvatar.module.css";

export const CHAT_MINI_BOT_AVATAR_CANONICAL_SCREEN_SIZE = 128;
export const CHAT_MINI_BOT_AVATAR_DARK_BASE_SRC =
  "/bot-frame/bot-frame-mini-dark.png?v=2";
export const CHAT_MINI_BOT_AVATAR_LIGHT_BASE_SRC =
  "/bot-frame/bot-frame-mini-light.png?v=2";

/** Compact bot chassis for identity portraits. Chassis lamps stay opt-in so
 * room and editor minis remain quiet while Home can present a living preview. */
export function ChatMiniBotAvatar(props: {
  color?: string | null;
  alloyColor?: string | null;
  theme?: "light" | "dark";
  face: ReactNode;
  glyph: ReactNode;
  className?: string;
  /** `badge` is message-chip sized; `room` is aquarium sized; `hero` is the empty-state preview. */
  size?: "badge" | "room" | "hero";
  /** `breathing` softly illuminates the authored chassis lamp apertures. */
  lightMode?: "off" | "breathing";
}): React.JSX.Element {
  const color = props.color?.trim() || null;
  const size = props.size ?? "badge";
  const theme = props.theme ?? "dark";
  const lightMode = props.lightMode ?? "off";
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
    size === "hero"
      ? styles.sizeHero
      : size === "room"
        ? styles.sizeRoom
        : styles.sizeBadge,
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
      data-light-mode={lightMode}
      style={rootStyle}
      aria-hidden="true"
    >
      {/* The pixel chassis is a mini-only derivative of the canonical body, so
          its material mask and measured screen registration stay aligned. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`${styles.frame} ${styles.frameBase}`}
        src={frameBaseSrc}
        alt=""
        draggable={false}
      />
      <span className={styles.frameAlloy} aria-hidden="true" />
      {lightMode === "breathing" ? (
        <>
          <span className={styles.frameLightAura} aria-hidden="true" />
          <span className={styles.frameLightEmitter} aria-hidden="true" />
          <span className={styles.frameLightCore} aria-hidden="true" />
        </>
      ) : null}
      <span
        className={styles.upperScreen}
        data-avatar-canonical-screen-size={
          CHAT_MINI_BOT_AVATAR_CANONICAL_SCREEN_SIZE
        }
        data-avatar-face-coordinate-source="studio"
      >
        {props.face}
      </span>
      <span className={styles.lowerScreen}>{props.glyph}</span>
    </span>
  );
}
