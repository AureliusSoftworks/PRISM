"use client";

import type { CSSProperties } from "react";
import styles from "./sceneMediaVignette.module.css";

export default function SceneMediaVignette(props: {
  theme: "light" | "dark";
  className?: string;
  style?: CSSProperties;
}): React.JSX.Element {
  return (
    <span
      className={`${styles.vignette}${props.className ? ` ${props.className}` : ""}`}
      data-theme={props.theme}
      style={props.style}
      aria-hidden="true"
    />
  );
}
