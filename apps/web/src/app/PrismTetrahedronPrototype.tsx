"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  pickPrismTetrahedronFace,
  projectPrismTetrahedron,
  type PrismTetrahedronRotation,
} from "./prismTetrahedronModel";
import styles from "./PrismTetrahedronPrototype.module.css";

const RESTING_ROTATION: PrismTetrahedronRotation = { x: -18, y: 24 };
const DRAG_THRESHOLD_PX = 5;
const SVG_WIDTH = 260;
const SVG_HEIGHT = 202;

interface DragStart {
  x: number;
  y: number;
  rotation: PrismTetrahedronRotation;
}

/** Local-only companion-menu study; it deliberately has no application effects. */
export function PrismTetrahedronPrototype(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [rotation, setRotation] = useState(RESTING_ROTATION);
  const [selectedFacet, setSelectedFacet] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<DragStart | null>(null);
  const draggedRef = useRef(false);
  const stageRef = useRef<SVGSVGElement | null>(null);

  const faces = useMemo(() => projectPrismTetrahedron(rotation), [rotation]);
  const visibleFaces = faces.filter((face) => face.visible);
  const frontFace = visibleFaces.reduce(
    (front, face) => (!front || face.depth > front.depth ? face : front),
    visibleFaces[0] ?? null,
  );
  const selected = faces.find((face) => face.id === selectedFacet) ?? null;

  const reset = useCallback(() => {
    setOpen(false);
    setRotation(RESTING_ROTATION);
    setSelectedFacet(null);
    dragStartRef.current = null;
    draggedRef.current = false;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() =>
      stageRef.current?.focus({ preventScroll: true }),
    );
    const dismissForEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      reset();
    };
    window.addEventListener("keydown", dismissForEscape, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", dismissForEscape, true);
    };
  }, [open, reset]);

  const selectFacetAtPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const facet = pickPrismTetrahedronFace(
      {
        x: ((event.clientX - rect.left) / rect.width) * SVG_WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * SVG_HEIGHT,
      },
      faces,
    );
    if (facet) setSelectedFacet(facet.id);
  };

  const beginDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { x: event.clientX, y: event.clientY, rotation };
    draggedRef.current = false;
    setDragging(true);
  };

  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) draggedRef.current = true;
    setRotation({ x: start.rotation.x + dy * 0.7, y: start.rotation.y + dx * 0.7 });
  };

  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragStartRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
    setDragging(false);
    if (!draggedRef.current) selectFacetAtPointer(event);
  };

  const cancelDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
    draggedRef.current = false;
    setDragging(false);
  };

  if (!open) {
    return (
      <div className={styles.prototype}>
        <button
          type="button"
          className={styles.trigger}
          data-prism-tetrahedron-trigger="true"
          onClick={() => setOpen(true)}
        >
          Tetrahedron <small>prototype</small>
        </button>
      </div>
    );
  }

  return (
    <section
      className={styles.study}
      data-prism-tetrahedron-study="true"
      aria-label="Interactive tetrahedron prototype"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        reset();
      }}
    >
      <header className={styles.heading}>
        <span>Tetrahedron study</span>
        <button type="button" className={styles.returnButton} onClick={reset}>
          Return
        </button>
      </header>
      <small>Drag to rotate · click a lit face to select it</small>
      <svg
        ref={stageRef}
        className={styles.stage}
        data-dragging={dragging ? "true" : undefined}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="application"
        aria-label="Tetrahedron. Drag to rotate on two axes. Click a visible facet to select it."
        tabIndex={0}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={(event) => {
          if (!dragStartRef.current) return;
          cancelDrag(event);
        }}
      >
        {faces.map((face) => (
          <g key={face.id}>
            <path
              className={styles.face}
              data-prism-tetrahedron-face={face.id}
              data-front={frontFace?.id === face.id ? "true" : undefined}
              data-selected={selectedFacet === face.id ? "true" : undefined}
              d={face.path}
              fill={face.color}
              fillOpacity={face.visible ? 0.78 : 0.12}
              style={{ "--face-color": face.color } as CSSProperties}
              aria-label={`${face.label} facet`}
            />
            {face.visible && frontFace?.id === face.id ? (
              <text
                className={styles.faceLabel}
                data-prism-tetrahedron-face-label={face.id}
                x={face.labelPoint.x}
                y={face.labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                aria-hidden="true"
              >
                {face.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className={styles.facetChoices} aria-label="Tetrahedron facets">
        {visibleFaces.map((face) => (
          <button
            key={face.id}
            type="button"
            className={styles.facetButton}
            data-selected={selectedFacet === face.id ? "true" : undefined}
            style={{ "--facet-color": face.color } as CSSProperties}
            onClick={() => setSelectedFacet(face.id)}
          >
            {face.label}
          </button>
        ))}
      </div>
      <p className={styles.feedback} role="status" aria-live="polite">
        {selected ? `${selected.label} selected locally.` : "No facet selected."}
      </p>
    </section>
  );
}
