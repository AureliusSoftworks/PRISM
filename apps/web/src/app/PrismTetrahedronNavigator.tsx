"use client";

import {
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
  type PrismTetrahedronFaceId,
  type PrismTetrahedronRotation,
} from "./prismTetrahedronModel";
import styles from "./PrismTetrahedronNavigator.module.css";

const SVG_WIDTH = 260;
const SVG_HEIGHT = 202;
const DRAG_THRESHOLD_PX = 5;

const CONTROL_ROTATIONS: Record<
  PrismTetrahedronFaceId,
  PrismTetrahedronRotation
> = {
  saved: { x: -18, y: 24 },
  private: { x: -12, y: 110 },
  focus: { x: -12, y: -110 },
  progress: { x: -80, y: 0 },
};

const CONTROLS: ReadonlyArray<{
  id: PrismTetrahedronFaceId;
  label: string;
}> = [
  { id: "saved", label: "Saved" },
  { id: "private", label: "Private" },
  { id: "focus", label: "Focus" },
  { id: "progress", label: "Progress" },
];

interface DragStart {
  x: number;
  y: number;
  rotation: PrismTetrahedronRotation;
}

export function PrismTetrahedronNavigator({
  privateMode,
  synthesisJobCount = 0,
  interactionLocked,
  focusedChatAvailable,
  onOpenSaved,
  onOpenPrivate,
  onContinueFocused,
  onOpenProgress,
}: {
  privateMode: boolean;
  synthesisJobCount?: number;
  interactionLocked: boolean;
  focusedChatAvailable: boolean;
  onOpenSaved: () => void;
  onOpenPrivate: () => void;
  onContinueFocused: () => void;
  onOpenProgress: () => void;
}): React.JSX.Element {
  const activeChatFace: PrismTetrahedronFaceId = privateMode
    ? "private"
    : "saved";
  const [rotation, setRotation] = useState(CONTROL_ROTATIONS[activeChatFace]);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<DragStart | null>(null);
  const draggedRef = useRef(false);
  const faces = useMemo(() => projectPrismTetrahedron(rotation), [rotation]);
  const frontFace = faces.reduce(
    (front, face) =>
      face.visible && (!front || face.depth > front.depth) ? face : front,
    faces.find((face) => face.visible) ?? null,
  );

  useEffect(() => {
    if (dragStartRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      setRotation(CONTROL_ROTATIONS[activeChatFace]);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeChatFace]);

  const controlDisabled = (id: PrismTetrahedronFaceId): boolean =>
    ((id === "saved" || id === "private" || id === "focus") &&
      interactionLocked) ||
    (id === "focus" && !focusedChatAvailable) ||
    (id === "progress" && synthesisJobCount === 0);

  const controlHint = (id: PrismTetrahedronFaceId): string => {
    if (id === "saved") return privateMode ? "Keep history" : "Current chat";
    if (id === "private") return privateMode ? "Current chat" : "No memory";
    if (id === "focus") return focusedChatAvailable ? "Full chat" : "Unavailable";
    return synthesisJobCount > 0
      ? `${synthesisJobCount} active`
      : "No active work";
  };

  const activateControl = (id: PrismTetrahedronFaceId): void => {
    if (controlDisabled(id)) return;
    setRotation(CONTROL_ROTATIONS[id]);
    if (id === "saved") onOpenSaved();
    else if (id === "private") onOpenPrivate();
    else if (id === "focus") onContinueFocused();
    else onOpenProgress();
  };

  const selectFaceAtPointer = (event: PointerEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const face = pickPrismTetrahedronFace(
      {
        x: ((event.clientX - rect.left) / rect.width) * SVG_WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * SVG_HEIGHT,
      },
      faces,
    );
    if (face) activateControl(face.id);
  };

  const beginDrag = (event: PointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { x: event.clientX, y: event.clientY, rotation };
    draggedRef.current = false;
    setDragging(true);
  };

  const moveDrag = (event: PointerEvent<SVGSVGElement>): void => {
    const start = dragStartRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) draggedRef.current = true;
    setRotation({
      x: start.rotation.x + dy * 0.7,
      y: start.rotation.y + dx * 0.7,
    });
  };

  const releaseDrag = (event: PointerEvent<SVGSVGElement>): void => {
    if (!dragStartRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
    setDragging(false);
  };

  const endDrag = (event: PointerEvent<SVGSVGElement>): void => {
    const dragged = draggedRef.current;
    releaseDrag(event);
    draggedRef.current = false;
    if (!dragged) selectFaceAtPointer(event);
  };

  const cancelDrag = (event: PointerEvent<SVGSVGElement>): void => {
    releaseDrag(event);
    draggedRef.current = false;
  };

  return (
    <nav
      className={styles.navigator}
      data-prism-tetrahedron-navigator="true"
      aria-label="Prism tools"
    >
      <div className={styles.instrument}>
        <svg
          className={styles.stage}
          data-dragging={dragging ? "true" : undefined}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          aria-hidden="true"
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
                data-current={activeChatFace === face.id ? "true" : undefined}
                data-disabled={controlDisabled(face.id) ? "true" : undefined}
                d={face.path}
                fill={face.color}
                fillOpacity={face.visible ? 0.8 : 0.1}
                style={{ "--face-color": face.color } as CSSProperties}
              />
              {face.visible && frontFace?.id === face.id ? (
                <text
                  className={styles.faceLabel}
                  x={face.labelPoint.x}
                  y={face.labelPoint.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {face.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
        <small>Drag to turn · choose a face</small>
      </div>
      <div className={styles.tools}>
        {CONTROLS.map((control) => (
          <button
            key={control.id}
            type="button"
            className={styles.tool}
            data-view={control.id}
            aria-current={activeChatFace === control.id ? "page" : undefined}
            disabled={controlDisabled(control.id)}
            onClick={() => activateControl(control.id)}
          >
            <span className={styles.toolMark} aria-hidden="true" />
            <span className={styles.toolCopy}>
              <strong>{control.label}</strong>
              <small>{controlHint(control.id)}</small>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
