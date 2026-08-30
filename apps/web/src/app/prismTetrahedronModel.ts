export interface PrismTetrahedronRotation {
  x: number;
  y: number;
}

interface PrismTetrahedronPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface ProjectedPrismTetrahedronFace {
  id: string;
  label: string;
  color: string;
  points: readonly { x: number; y: number }[];
  labelPoint: { x: number; y: number };
  path: string;
  depth: number;
  visible: boolean;
}

const TETRAHEDRON_VERTICES: readonly PrismTetrahedronPoint3D[] = [
  { x: 0, y: 1.05, z: 0 },
  { x: -1, y: -0.62, z: 0.75 },
  { x: 1, y: -0.62, z: 0.75 },
  { x: 0, y: -0.62, z: -1.1 },
];

const TETRAHEDRON_FACES = [
  { id: "rose", label: "Rose", color: "#ff7b8f", indices: [0, 1, 2] },
  { id: "amber", label: "Amber", color: "#ffbf69", indices: [0, 3, 1] },
  { id: "cyan", label: "Cyan", color: "#55ddea", indices: [0, 2, 3] },
  { id: "violet", label: "Violet", color: "#9f83ff", indices: [1, 3, 2] },
] as const;

function rotate(point: PrismTetrahedronPoint3D, rotation: PrismTetrahedronRotation): PrismTetrahedronPoint3D {
  const xRadians = (rotation.x * Math.PI) / 180;
  const yRadians = (rotation.y * Math.PI) / 180;
  const afterX = {
    x: point.x,
    y: point.y * Math.cos(xRadians) - point.z * Math.sin(xRadians),
    z: point.y * Math.sin(xRadians) + point.z * Math.cos(xRadians),
  };
  return {
    x: afterX.x * Math.cos(yRadians) + afterX.z * Math.sin(yRadians),
    y: afterX.y,
    z: -afterX.x * Math.sin(yRadians) + afterX.z * Math.cos(yRadians),
  };
}

function outwardNormal(points: readonly PrismTetrahedronPoint3D[]): PrismTetrahedronPoint3D {
  const [a, b, c] = points;
  const normal = {
    x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
    y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
    z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
  };
  const center = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length,
      z: sum.z + point.z / points.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return normal.x * center.x + normal.y * center.y + normal.z * center.z >= 0
    ? normal
    : { x: -normal.x, y: -normal.y, z: -normal.z };
}

export function projectPrismTetrahedron(
  rotation: PrismTetrahedronRotation,
): ProjectedPrismTetrahedronFace[] {
  const vertices = TETRAHEDRON_VERTICES.map((point) => rotate(point, rotation));
  return TETRAHEDRON_FACES.map((face) => {
    const points3d = face.indices.map((index) => vertices[index]!);
    const points = points3d.map((point) => {
      const perspective = 4.2 / (4.2 - point.z);
      return {
        x: 130 + point.x * 67 * perspective,
        y: 101 - point.y * 67 * perspective,
      };
    });
    const normal = outwardNormal(points3d);
    const depth = points3d.reduce((sum, point) => sum + point.z, 0) / points3d.length;
    const labelPoint = points.reduce(
      (center, point) => ({
        x: center.x + point.x / points.length,
        y: center.y + point.y / points.length,
      }),
      { x: 0, y: 0 },
    );
    return {
      id: face.id,
      label: face.label,
      color: face.color,
      points,
      labelPoint,
      path: `M ${points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" L ")} Z`,
      depth,
      visible: normal.z > 0.04,
    };
  }).sort((left, right) => left.depth - right.depth);
}

function pointInTriangle(
  point: { x: number; y: number },
  triangle: readonly { x: number; y: number }[],
): boolean {
  const [a, b, c] = triangle;
  const denominator =
    (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (denominator === 0) return false;
  const first =
    ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) /
    denominator;
  const second =
    ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) /
    denominator;
  const third = 1 - first - second;
  return first >= 0 && second >= 0 && third >= 0;
}

/** Returns the front-most visible facet at an SVG-space point. */
export function pickPrismTetrahedronFace(
  point: { x: number; y: number },
  faces: readonly ProjectedPrismTetrahedronFace[],
): ProjectedPrismTetrahedronFace | null {
  return [...faces]
    .filter((face) => face.visible)
    .sort((left, right) => right.depth - left.depth)
    .find((face) => pointInTriangle(point, face.points)) ?? null;
}
