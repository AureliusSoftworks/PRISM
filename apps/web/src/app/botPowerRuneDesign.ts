import {
  BOT_POWER_SIGIL_IDS_V1,
  botPowerSigilForPowerV1,
  type BotPowerV1,
} from "@localai/shared";

/** Portable authored fields that seed one visual Power signature. */
export type BotPowerRuneSource = Pick<
  BotPowerV1,
  "id" | "name" | "intent" | "sigil"
>;

export interface BotPowerRunePoint {
  x: number;
  y: number;
}

export interface BotPowerRuneNode extends BotPowerRunePoint {
  tone: "primary" | "secondary";
  shape: "diamond" | "square";
}

export interface BotPowerRuneDesign {
  runeId: ReturnType<typeof botPowerSigilForPowerV1>;
  seed: string;
  frameRotation: number;
  signalArcLength: number;
  coreShape: "diamond" | "hex" | "square";
  core: BotPowerRunePoint;
  traces: BotPowerRunePoint[][];
  nodes: BotPowerRuneNode[];
  tickAngles: number[];
}

function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function seededValue(seed: string, key: string): number {
  return hashString(`${seed}:${key}`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pointKey(point: BotPowerRunePoint): string {
  return `${point.x}:${point.y}`;
}

/**
 * Produces one stable, invented circuit-rune from the Power's authored identity.
 * The stored sigil remains a compact portable recipe selector; no font glyph is
 * rendered. Coordinates stay on a strict machine grid so the result reads as
 * synthetic circuitry rather than carved or handwritten mysticism.
 */
export function botPowerRuneDesign(
  power: BotPowerRuneSource,
): BotPowerRuneDesign {
  const runeId = botPowerSigilForPowerV1(power);
  const runeIndex = BOT_POWER_SIGIL_IDS_V1.indexOf(runeId);
  const seed = `${runeId}:${power.id}:${power.name}:${power.intent}`;
  const columns = [22, 36, 50, 64, 78] as const;
  const rows = [18, 34, 50, 66, 82] as const;
  const mainPoints: BotPowerRunePoint[] = [];
  let columnIndex = 1 + (seededValue(seed, "entry-column") % 3);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (rowIndex > 0) {
      const movement = (seededValue(seed, `spine:${rowIndex}`) % 3) - 1;
      columnIndex = clamp(columnIndex + movement, 1, 3);
    }
    mainPoints.push({ x: columns[columnIndex]!, y: rows[rowIndex]! });
  }

  const traces: BotPowerRunePoint[][] = [mainPoints];
  const nodes: BotPowerRuneNode[] = [];
  const usedRows = new Set<number>();
  const branchCount = 2 + (seededValue(seed, "branch-count") % 3);
  const bilateral = runeIndex % 5 === 0;

  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    let rowIndex = 1 + (seededValue(seed, `branch-row:${branchIndex}`) % 3);
    while (usedRows.has(rowIndex) && usedRows.size < 3) {
      rowIndex = rowIndex === 3 ? 1 : rowIndex + 1;
    }
    usedRows.add(rowIndex);
    const origin = mainPoints[rowIndex]!;
    const direction = seededValue(seed, `branch-side:${branchIndex}`) % 2 === 0
      ? -1
      : 1;
    const endpointY = clamp(
      origin.y + (seededValue(seed, `branch-rise:${branchIndex}`) % 3 - 1) * 8,
      14,
      86,
    );
    const elbowX = clamp(origin.x + direction * 14, 18, 82);
    const endpointX = direction < 0 ? 18 : 82;
    const branch = [
      origin,
      { x: elbowX, y: origin.y },
      { x: endpointX, y: endpointY },
    ];
    traces.push(branch);
    nodes.push({
      x: endpointX,
      y: endpointY,
      tone: branchIndex === 0 ? "secondary" : "primary",
      shape: branchIndex % 2 === 0 ? "diamond" : "square",
    });

    if (bilateral && branchIndex === 0) {
      const mirrored = branch.map((point) => ({ x: 100 - point.x, y: point.y }));
      if (mirrored.some((point, index) => point.x !== branch[index]?.x)) {
        traces.push(mirrored);
        const endpoint = mirrored.at(-1)!;
        nodes.push({
          ...endpoint,
          tone: "secondary",
          shape: "diamond",
        });
      }
    }
  }

  const capCandidates = [mainPoints[0]!, mainPoints.at(-1)!];
  for (const [index, point] of capCandidates.entries()) {
    if (!nodes.some((node) => pointKey(node) === pointKey(point))) {
      nodes.push({
        ...point,
        tone: index === 0 ? "secondary" : "primary",
        shape: index === 0 ? "diamond" : "square",
      });
    }
  }

  const core = mainPoints[2]!;
  const coreShapes = ["diamond", "hex", "square"] as const;
  const tickOffset = seededValue(seed, "tick-offset") % 8;
  const tickAngles = Array.from(
    new Set([
      tickOffset * 45,
      ((tickOffset + 2 + (runeIndex % 2)) % 8) * 45,
      ((tickOffset + 5) % 8) * 45,
    ]),
  );

  return {
    runeId,
    seed,
    frameRotation: seededValue(seed, "frame-rotation") % 360,
    signalArcLength: 11 + (runeIndex % 4) * 2,
    coreShape: coreShapes[runeIndex % coreShapes.length]!,
    core,
    traces,
    nodes,
    tickAngles,
  };
}

export function botPowerRuneTracePath(
  points: readonly BotPowerRunePoint[],
): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
}
