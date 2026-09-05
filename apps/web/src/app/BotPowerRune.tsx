import type { CSSProperties } from "react";

import styles from "./BotPowerRune.module.css";
import {
  botPowerRuneDesign,
  botPowerRuneTracePath,
  type BotPowerRuneSource,
} from "./botPowerRuneDesign";

interface BotPowerRuneProps {
  power: BotPowerRuneSource;
  size?: number;
  className?: string;
}

function corePoints(
  shape: ReturnType<typeof botPowerRuneDesign>["coreShape"],
  x: number,
  y: number,
): string {
  if (shape === "hex") {
    return `${x - 6},${y} ${x - 3},${y - 5} ${x + 3},${y - 5} ${x + 6},${y} ${x + 3},${y + 5} ${x - 3},${y + 5}`;
  }
  if (shape === "square") {
    return `${x - 5},${y - 5} ${x + 5},${y - 5} ${x + 5},${y + 5} ${x - 5},${y + 5}`;
  }
  return `${x},${y - 7} ${x + 7},${y} ${x},${y + 7} ${x - 7},${y}`;
}

export function BotPowerRune({
  power,
  size = 64,
  className,
}: BotPowerRuneProps): React.JSX.Element {
  const design = botPowerRuneDesign(power);
  const style = {
    "--bot-power-rune-size": `${size}px`,
  } as CSSProperties;
  const orbitCircumference = 195;

  return (
    <span
      className={className ? `${styles.rune} ${className}` : styles.rune}
      style={style}
      data-power-rune={design.runeId}
      aria-hidden="true"
    >
      <svg
        className={styles.diagram}
        viewBox="0 0 100 100"
        focusable="false"
      >
        <circle className={styles.scopeRail} cx="50" cy="50" r="31" />
        <circle
          className={styles.calibrationArc}
          cx="50"
          cy="50"
          r="31"
          pathLength={orbitCircumference}
          strokeDasharray={`${design.signalArcLength} ${orbitCircumference - design.signalArcLength}`}
          transform={`rotate(${design.frameRotation} 50 50)`}
        />
        <g className={styles.calibrationTicks}>
          {design.tickAngles.map((angle) => (
            <path
              key={angle}
              d="M50 15 L50 19"
              transform={`rotate(${angle} 50 50)`}
            />
          ))}
        </g>
        <g className={styles.traceGlow}>
          {design.traces.map((trace, index) => (
            <path key={index} d={botPowerRuneTracePath(trace)} />
          ))}
        </g>
        <g className={styles.traces}>
          {design.traces.map((trace, index) => (
            <path key={index} d={botPowerRuneTracePath(trace)} />
          ))}
        </g>
        <polygon
          className={styles.core}
          points={corePoints(design.coreShape, design.core.x, design.core.y)}
        />
        <circle
          className={styles.coreAperture}
          cx={design.core.x}
          cy={design.core.y}
          r="1.65"
        />
        <g className={styles.nodes}>
          {design.nodes.map((node, index) => node.shape === "diamond" ? (
            <rect
              key={`${node.x}-${node.y}-${index}`}
              className={node.tone === "secondary" ? styles.nodeSecondary : undefined}
              x={node.x - 2.7}
              y={node.y - 2.7}
              width="5.4"
              height="5.4"
              transform={`rotate(45 ${node.x} ${node.y})`}
            />
          ) : (
            <rect
              key={`${node.x}-${node.y}-${index}`}
              className={node.tone === "secondary" ? styles.nodeSecondary : undefined}
              x={node.x - 2.4}
              y={node.y - 2.4}
              width="4.8"
              height="4.8"
            />
          ))}
        </g>
      </svg>
    </span>
  );
}
