"use client";

import { type CSSProperties, type ReactNode } from "react";
import {
  BOT_AVATAR_CANONICAL_FACING,
  botAvatarScreenFacingScaleX,
  type BotAvatarFacing,
} from "./bot-avatar-render-geometry";
import styles from "./chatMiniBotAvatar.module.css";
import { BotGroupLeadershipMark } from "./BotGroupLeadershipMark";

export const CHAT_MINI_BOT_AVATAR_CANONICAL_SCREEN_SIZE = 128;
export const CHAT_MINI_BOT_AVATAR_DARK_BASE_SRC =
  "/bot-frame/bot-frame-mini-dark.png?v=2";
export const CHAT_MINI_BOT_AVATAR_LIGHT_BASE_SRC =
  "/bot-frame/bot-frame-mini-light.png?v=2";

/** Compact bot chassis for identity portraits. Mini screens are deliberately
 * flat LED pixels: the face owns blink + binary mouth state and the chassis
 * never adds speech glow, phosphor, or breathing lights. */
export function ChatMiniBotAvatar(props: {
  color?: string | null;
  alloyColor?: string | null;
  theme?: "light" | "dark";
  /** Authorable face art that sits behind the plate glyph. */
  behindFace?: ReactNode;
  /** Authorable face art that sits above the plate glyph. */
  aboveFace?: ReactNode;
  face: ReactNode;
  glyph: ReactNode;
  className?: string;
  /** `badge` is message-chip sized; `room` is aquarium sized; `hero` is the empty-state preview. */
  size?: "badge" | "room" | "hero";
  /** Visible direction for the mini face and Ink; the glyph stays readable. */
  facing?: BotAvatarFacing;
  /** Number of Library groups this bot represents as leader. */
  leadershipGroupCount?: number;
}): React.JSX.Element {
  const color = props.color?.trim() || null;
  const size = props.size ?? "badge";
  const theme = props.theme ?? "dark";
  const facing = props.facing ?? BOT_AVATAR_CANONICAL_FACING;
  const screenFacingScaleX = botAvatarScreenFacingScaleX(facing);
  const frameBaseSrc =
    theme === "light"
      ? CHAT_MINI_BOT_AVATAR_LIGHT_BASE_SRC
      : CHAT_MINI_BOT_AVATAR_DARK_BASE_SRC;

  const rootStyle = {
    ["--chat-mini-bot-color" as string]: color ?? "var(--accent)",
    ["--chat-mini-bot-alloy-color" as string]:
      props.alloyColor?.trim() || "#aeb8c1",
    // AvatarDetailsMask has its own mirror transform. The mini turns the
    // complete screen plane instead, so reset that inner transform and avoid
    // double-flipping custom Ink.
    ["--chat-mini-bot-upper-screen-facing-scale-x" as string]:
      screenFacingScaleX,
    // Cancel an ancestor that mirrors the complete chassis; ordinary
    // component-owned face turns resolve to 1.
    ["--chat-mini-bot-lower-screen-facing-scale-x" as string]:
      "var(--bot-avatar-external-facing-scale-x, 1)",
    ["--avatar-details-facing-scale-x" as string]: "1",
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
      data-avatar-facing={facing}
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
      <BotGroupLeadershipMark
        groupCount={props.leadershipGroupCount}
        surface="mini"
        size={size}
      />
      <span
        className={styles.upperScreen}
        data-chat-mini-upper-screen="true"
        data-avatar-canonical-screen-size={
          CHAT_MINI_BOT_AVATAR_CANONICAL_SCREEN_SIZE
        }
        data-avatar-face-coordinate-source="studio"
      >
        <span className={styles.upperScreenContent}>
          {props.behindFace}
          {props.face}
          {props.aboveFace}
        </span>
      </span>
      <span className={styles.lowerScreen}>
        <span className={styles.lowerScreenContent}>{props.glyph}</span>
      </span>
    </span>
  );
}
