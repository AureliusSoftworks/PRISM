"use client";

import type { CSSProperties } from "react";
import { normalizedDebateForumAccentColor } from "./debateForumAccentKeys";
import styles from "./DebateExperience.module.css";

function ForumArchitectureAccent(props: {
  depth: "backdrop" | "foreground";
}): React.JSX.Element {
  if (props.depth === "foreground") {
    return (
      <svg
        className={styles.forumAccentArchitecture}
        viewBox="0 0 1672 941"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g className={styles.forumAccentRoleFor} data-role="for">
          <path d="M106 846 L438 746 L438 764 L106 862 Z" />
          <path d="M142 820 L405 741" />
          <path d="M132 799 L392 727" className={styles.forumAccentFineLine} />
        </g>
        <g className={styles.forumAccentRoleModerator} data-role="moderator">
          <path d="M645 642 L1027 642" />
          <path d="M679 617 L993 617" className={styles.forumAccentFineLine} />
          <path d="M739 492 L933 492" className={styles.forumAccentFineLine} />
        </g>
        <g className={styles.forumAccentRoleAgainst} data-role="against">
          <path d="M1234 746 L1566 846 L1566 862 L1234 764 Z" />
          <path d="M1267 741 L1530 820" />
          <path d="M1280 727 L1540 799" className={styles.forumAccentFineLine} />
        </g>
      </svg>
    );
  }

  return (
    <svg
      className={styles.forumAccentArchitecture}
      viewBox="0 0 1672 941"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g className={styles.forumAccentRoleFor} data-role="for">
        <path d="M0 58 L267 176 L267 594" />
        <path d="M266 177 L420 229 L420 590" className={styles.forumAccentFineLine} />
        <path d="M196 235 L196 614" className={styles.forumAccentFineLine} />
      </g>
      <g className={styles.forumAccentRoleModerator} data-role="moderator">
        <path d="M628 33 L835 0 L1044 33 L1001 154 L835 226 L669 154 Z" />
        <path d="M669 154 L835 143 L1001 154" className={styles.forumAccentFineLine} />
        <path d="M704 234 L704 596 M968 234 L968 596" />
      </g>
      <g className={styles.forumAccentRoleAgainst} data-role="against">
        <path d="M1672 58 L1405 176 L1405 594" />
        <path d="M1406 177 L1252 229 L1252 590" className={styles.forumAccentFineLine} />
        <path d="M1476 235 L1476 614" className={styles.forumAccentFineLine} />
      </g>
    </svg>
  );
}

/**
 * Role-owned architectural light for the Forum. It deliberately uses the
 * parliamentary room's prism seams and podium/step trim rather than repainting
 * each third of the chamber with a broad color wash.
 */
export function DebateForumAccentKeys(props: {
  againstColor: unknown;
  className?: string;
  depth: "backdrop" | "foreground";
  fallback?: boolean;
  forColor: unknown;
  moderatorColor: unknown;
  source?: string;
}): React.JSX.Element {
  const forColor = normalizedDebateForumAccentColor(props.forColor, "for");
  const moderatorColor = normalizedDebateForumAccentColor(
    props.moderatorColor,
    "moderator",
  );
  const againstColor = normalizedDebateForumAccentColor(
    props.againstColor,
    "against",
  );
  const foregroundFallbackClass =
    props.depth === "foreground" ? ` ${styles.lightMaskForeground}` : "";

  return (
    <div
      className={`${styles.forumAccentKeyStack}${props.className ? ` ${props.className}` : ""}`}
      data-depth={props.depth}
      data-ready="true"
      data-source={props.source ?? "forum-architecture"}
      style={
        {
          "--debate-for-color": forColor,
          "--debate-moderator-color": moderatorColor,
          "--debate-against-color": againstColor,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <ForumArchitectureAccent depth={props.depth} />
      {props.fallback === false ? null : (
        <span className={styles.forumAccentKeyFallback}>
          <span
            className={`${styles.lightMaskFor}${foregroundFallbackClass}`}
          />
          <span
            className={`${styles.lightMaskModerator}${foregroundFallbackClass}`}
          />
          <span
            className={`${styles.lightMaskAgainst}${foregroundFallbackClass}`}
          />
        </span>
      )}
    </div>
  );
}
