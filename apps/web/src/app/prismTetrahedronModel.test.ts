import assert from "node:assert/strict";
import test from "node:test";
import {
  pickPrismTetrahedronFace,
  projectPrismTetrahedron,
} from "./prismTetrahedronModel.ts";

test("projects multiple visible tetrahedron facets and rotates across both axes", () => {
  const resting = projectPrismTetrahedron({ x: -18, y: 24 });
  const rotated = projectPrismTetrahedron({ x: 30, y: 75 });

  assert.equal(resting.length, 4);
  assert.ok(resting.filter((face) => face.visible).length >= 2);
  assert.ok(resting.every((face) => Number.isFinite(face.labelPoint.x)));
  assert.ok(resting.every((face) => Number.isFinite(face.labelPoint.y)));
  assert.notDeepEqual(resting[0]?.points, rotated[0]?.points);
});

test("picks a deterministic visible facet from its projected center", () => {
  const face = projectPrismTetrahedron({ x: -18, y: 24 }).find(
    (candidate) => candidate.visible,
  );
  assert.ok(face);
  const center = face.points.reduce(
    (sum, point) => ({ x: sum.x + point.x / 3, y: sum.y + point.y / 3 }),
    { x: 0, y: 0 },
  );

  assert.equal(
    pickPrismTetrahedronFace(
      center,
      projectPrismTetrahedron({ x: -18, y: 24 }),
    )?.id,
    face.id,
  );
});
