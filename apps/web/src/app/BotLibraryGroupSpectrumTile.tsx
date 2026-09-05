"use client";

import type { CSSProperties } from "react";
import { botLibraryGroupMonogram } from "./botLibraryGroupSpectrumTileUtils";
import styles from "./BotLibraryGroupSpectrumTile.module.css";

export interface BotLibraryGroupSpectrumTileProps {
  groupName: string;
  imageUrl?: string | null;
  className?: string;
  size?: number | string;
}

export function BotLibraryGroupSpectrumTile({
  groupName,
  imageUrl = null,
  className,
  size = 24,
}: BotLibraryGroupSpectrumTileProps): React.JSX.Element {
  const tileStyle = {
    width: size,
    height: size,
    fontSize: size,
    "--bot-library-group-spectrum-image": imageUrl
      ? `url(${JSON.stringify(imageUrl)})`
      : "none",
  } as CSSProperties;

  return (
    <span
      className={[styles.tile, className].filter(Boolean).join(" ")}
      data-has-atmosphere={imageUrl ? "true" : undefined}
      style={tileStyle}
      aria-hidden="true"
    >
      <span className={styles.monogram}>
        {botLibraryGroupMonogram(groupName)}
      </span>
    </span>
  );
}
