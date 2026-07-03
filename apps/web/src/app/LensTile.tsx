import type { CSSProperties } from "react";

import styles from "./LensTile.module.css";
import type { MarketplaceLensEntry, MarketplaceLensKind } from "./botMarketplace";

type LensTileSize = "xs" | "sm" | "md" | "button" | "lg";

type LensTileLens = Pick<
  MarketplaceLensEntry,
  "id" | "seed" | "displayName" | "category" | "lensKind"
>;

interface LensTileProps {
  lens: LensTileLens;
  size?: LensTileSize;
  className?: string;
  title?: string;
}

interface LensPalette {
  bg: string;
  primary: string;
  secondary: string;
  accent: string;
}

const LENS_KIND_PALETTES: Record<MarketplaceLensKind, LensPalette> = {
  sacred_wisdom: {
    bg: "#111827",
    primary: "#f8d06b",
    secondary: "#6ee7b7",
    accent: "#93c5fd",
  },
  creative_style: {
    bg: "#17111f",
    primary: "#fb6fb3",
    secondary: "#67e8f9",
    accent: "#facc15",
  },
  roleplay: {
    bg: "#1f140b",
    primary: "#f59e0b",
    secondary: "#fb7185",
    accent: "#fde68a",
  },
  thinking_style: {
    bg: "#111322",
    primary: "#a78bfa",
    secondary: "#60a5fa",
    accent: "#c4b5fd",
  },
  civic_perspective: {
    bg: "#101827",
    primary: "#93c5fd",
    secondary: "#fca5a5",
    accent: "#e5e7eb",
  },
  research_persona: {
    bg: "#0b1f1f",
    primary: "#5eead4",
    secondary: "#c084fc",
    accent: "#a7f3d0",
  },
  utility: {
    bg: "#111827",
    primary: "#d1d5db",
    secondary: "#67e8f9",
    accent: "#a3e635",
  },
  other: {
    bg: "#18181b",
    primary: "#e5e7eb",
    secondary: "#a5b4fc",
    accent: "#f0abfc",
  },
};

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type CellTone = "primary" | "secondary" | "accent";

interface LensCellCandidate {
  x: number;
  y: number;
  value: number;
  rank: number;
}

function cellColorClass(tone: CellTone): string {
  if (tone === "accent") return styles.cellAccent;
  if (tone === "secondary") return styles.cellSecondary;
  return styles.cellPrimary;
}

function renderCell(
  key: string,
  x: number,
  y: number,
  origin: number,
  size: number,
  value: number,
  tone: CellTone
) {
  const gap = 1.65;
  const cellX = origin + x * size + gap / 2;
  const cellY = origin + y * size + gap / 2;
  const cellSize = size - gap;
  const opacity = tone === "accent" ? 0.96 : tone === "secondary" ? 0.9 : 0.84;

  return (
    <rect
      key={key}
      className={cellColorClass(tone)}
      x={cellX}
      y={cellY}
      width={cellSize}
      height={cellSize}
      rx={cellSize * 0.08}
      opacity={opacity}
    />
  );
}

export function LensTile({ lens, size = "md", className, title }: LensTileProps) {
  const seed = lens.seed?.trim() || lens.id;
  const palette = LENS_KIND_PALETTES[lens.lensKind] ?? LENS_KIND_PALETTES.other;
  const cells = [];
  const gridSize = 5;
  const gridInset = 16;
  const cellSize = (100 - gridInset * 2) / gridSize;
  const halfColumns = Math.ceil(gridSize / 2);
  const center = Math.floor(gridSize / 2);
  const baseHash = hashString(`${lens.category}:${seed}`);
  const candidates: LensCellCandidate[] = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < halfColumns; x += 1) {
      if (x === center && y === center) continue;
      const value = hashString(`${seed}:${x}:${y}:${baseHash}`);
      candidates.push({ x, y, value, rank: value % 997 });
    }
  }

  const centerValue = hashString(`${seed}:center:${baseHash}`);
  cells.push(renderCell("center", center, center, gridInset, cellSize, centerValue, "primary"));

  const activeTarget = 3 + (baseHash % 3);
  candidates
    .sort((left, right) => left.rank - right.rank)
    .slice(0, activeTarget)
    .forEach(({ x, y, value }, index) => {
      const mirrorX = gridSize - 1 - x;
      const tone = index === 0 ? "secondary" : "primary";
      cells.push(renderCell(`${x}-${y}`, x, y, gridInset, cellSize, value, tone));
      if (mirrorX !== x) {
        cells.push(
          renderCell(
            `${mirrorX}-${y}`,
            mirrorX,
            y,
            gridInset,
            cellSize,
            value >>> 1,
            tone
          )
        );
      }
    });

  const style = {
    "--lens-tile-bg": palette.bg,
    "--lens-tile-primary": palette.primary,
    "--lens-tile-secondary": palette.secondary,
    "--lens-tile-accent": palette.accent,
  } as CSSProperties;

  return (
    <span
      className={className ? `${styles.tile} ${className}` : styles.tile}
      data-size={size}
      style={style}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      title={title}
    >
      <svg className={styles.sigil} viewBox="0 0 100 100" focusable="false">
        {cells}
      </svg>
    </span>
  );
}
