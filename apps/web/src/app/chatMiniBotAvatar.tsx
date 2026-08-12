"use client";

import { type CSSProperties, type ReactNode } from "react";
import {
  BOT_AVATAR_CANONICAL_FACING,
  botAvatarScreenFacingScaleX,
  type BotAvatarFacing,
} from "./bot-avatar-render-geometry";
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
  /** When true, suppress behind/above art layers while the avatar is thinking. */
  thinking: boolean;
  /** Authorable face art that sits behind the plate glyph. */
  behindFace?: ReactNode;
  /** Authorable face art that sits above the plate glyph. */
  aboveFace?: ReactNode;
  face: ReactNode;
  glyph: ReactNode;
  className?: string;
  /** `badge` is message-chip sized; `room` is aquarium sized; `hero` is the empty-state preview. */
  size?: "badge" | "room" | "hero";
  /** `breathing` softly illuminates the authored chassis lamp apertures. */
  lightMode?: "off" | "breathing";
  /** Visible direction for the mini face and Ink; the glyph stays readable. */
  facing?: BotAvatarFacing;
  /** Keep another full-screen face effect, such as Question, upright. */
  directionIndependentFace?: boolean;
}): React.JSX.Element {
  const color = props.color?.trim() || null;
  const size = props.size ?? "badge";
  const theme = props.theme ?? "dark";
  const lightMode = props.lightMode ?? "off";
  const facing = props.facing ?? BOT_AVATAR_CANONICAL_FACING;
  const screenFacingScaleX = botAvatarScreenFacingScaleX(facing);
  const directionIndependentFace =
    props.thinking || props.directionIndependentFace === true;
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
      directionIndependentFace ? "1" : screenFacingScaleX,
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
      data-light-mode={lightMode}
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
      {lightMode === "breathing" ? (
        <>
          <span
            className={styles.frameLightAura}
            data-chat-mini-frame-light="aura"
            aria-hidden="true"
          />
          <span
            className={styles.frameLightEmitter}
            data-chat-mini-frame-light="emitter"
            aria-hidden="true"
          />
          <span
            className={styles.frameLightCore}
            data-chat-mini-frame-light="core"
            aria-hidden="true"
          />
        </>
      ) : null}
      <span
        className={styles.upperScreen}
        data-chat-mini-upper-screen="true"
        data-avatar-canonical-screen-size={
          CHAT_MINI_BOT_AVATAR_CANONICAL_SCREEN_SIZE
        }
        data-avatar-face-coordinate-source="studio"
      >
        <span className={styles.upperScreenContent}>
          {props.thinking ? null : props.behindFace}
          {props.face}
          {props.thinking ? null : props.aboveFace}
        </span>
      </span>
      <span className={styles.lowerScreen}>
        <span className={styles.lowerScreenContent}>{props.glyph}</span>
      </span>
    </span>
  );
}
