"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  normalizeAccentForTheme,
  normalizeBotIdentityColor,
  type BotMoodKey,
} from "@localai/shared";

import { botAvatarMicroPresentationForSize } from "./avatarRenderedSizeQuality";
import styles from "./page.module.css";

/** Micro is a glyph-only identity fallback: color belongs to its orb only. */
export const BOT_AVATAR_MICRO_GLYPH_COLOR = "#ffffff";

/**
 * Shared micro LOD. A genuine micro bot is its identity glyph only: no facial
 * art, Avatar Details Ink, eyes, mouth, animation, or scheduled work.
 */
export function BotAvatarMicro(props: {
  moodKey?: BotMoodKey;
  placement?: "leading" | "trailing";
  color?: string | null;
  /** Identity glyph shown at every readable Micro size. */
  glyph?: ReactNode;
  renderSizePx?: number;
  className?: string;
}): React.JSX.Element {
  const moodKey = props.moodKey ?? "neutral";
  const placement = props.placement ?? "trailing";
  const color = props.color?.trim();
  const identityColor = normalizeBotIdentityColor(color) ?? "#7c6cff";
  const identityColorDark = normalizeAccentForTheme(identityColor, "dark");
  const identityColorLight = normalizeAccentForTheme(identityColor, "light");
  const presentation = botAvatarMicroPresentationForSize(props.renderSizePx);
  const showIdentityPixel = presentation === "block" || presentation === "pixel";

  return (
    <span
      className={`${styles.messageMoodBadge} ${props.className ?? ""}`}
      data-mood={moodKey}
      data-placement={placement}
      data-face="coffee"
      data-variant="micro"
      data-avatar-render-tier="micro"
      data-avatar-micro-presentation={presentation}
      style={
        {
          ...(color ? { ["--coffee-bot-color" as string]: color } : {}),
          ["--bot-avatar-micro-render-size" as string]:
            props.renderSizePx === undefined ? undefined : `${props.renderSizePx}px`,
          ["--bot-avatar-micro-identity-color-dark" as string]: identityColorDark,
          ["--bot-avatar-micro-identity-color-light" as string]: identityColorLight,
          ...(showIdentityPixel
            ? {
                width: presentation === "pixel" ? "1px" : "4px",
                height: presentation === "pixel" ? "1px" : "4px",
              }
            : {}),
          ["--bot-avatar-micro-glyph-color" as string]:
            BOT_AVATAR_MICRO_GLYPH_COLOR,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {showIdentityPixel ? (
        <span className={styles.botAvatarMicroIdentityPixel} />
      ) : (
        <span
          className={styles.botAvatarMicroScreen}
          data-bot-avatar-micro-screen="true"
        >
          <span className={styles.botAvatarMicroGlyph}>{props.glyph}</span>
        </span>
      )}
    </span>
  );
}
