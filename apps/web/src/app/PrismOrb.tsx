"use client";

import type { CSSProperties } from "react";
import styles from "./prism-orb.module.css";

export interface PrismOrbProps {
  aura?: boolean;
  className?: string;
  size?: number | string;
}

export function PrismOrb({
  aura = true,
  className = "",
  size,
}: PrismOrbProps): React.JSX.Element {
  const style =
    size === undefined
      ? undefined
      : ({
          "--prism-orb-size":
            typeof size === "number" ? `${size}px` : size,
        } as CSSProperties);

  return (
    <span
      className={`${styles.orb} ${aura ? styles.aura : ""} ${className}`.trim()}
      data-prism-orb="true"
      style={style}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" focusable="false">
        <path d="M16 5.2 27 25H5Z" />
      </svg>
    </span>
  );
}
