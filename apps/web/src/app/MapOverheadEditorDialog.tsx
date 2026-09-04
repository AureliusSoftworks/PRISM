"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  MANSION_OVERHEAD_PLACEMENT_IDENTITY_V1,
  MANSION_OVERHEAD_PLACEMENT_LIMITS_V1,
  type MansionOverheadPlacementV1,
} from "@localai/shared";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import shell from "./roomLightEditor.module.css";
import styles from "./mapOverheadEditor.module.css";

/** One board block drawn as an outline over the plate, in percent of the stage. */
export interface MapOverheadBoardTileV1 {
  id: string;
  label: string;
  kind: "room" | "corridor" | "ambient" | "side";
  left: number;
  top: number;
  width: number;
  height: number;
  current?: boolean;
}

interface Props {
  /** "ship", "mansion": what the overhead shows. */
  placeNoun: string;
  levelLabel: string;
  imageUrl: string | null;
  /** Where the stored plate sits before any hand placement, in percent of the stage. */
  frame: { left: number; top: number; width: number; height: number };
  /** One envelope cell in percent of the stage width and height, so pans stay in cells. */
  cell: { width: number; height: number };
  tiles: readonly MapOverheadBoardTileV1[];
  placement: MansionOverheadPlacementV1 | null;
  theme: "light" | "dark";
  /** Drawing a plate needs ONLINE mode; placement works in either. */
  online: boolean;
  onClose: () => void;
  onSave: (placement: MansionOverheadPlacementV1 | null) => Promise<void> | void;
  /** Draws a fresh plate; the parent hands back a new imageUrl when it lands. */
  onGenerate: () => Promise<void>;
}

type GestureMode = "pan" | "rotate" | "scale";
interface Gesture {
  id: number;
  mode: GestureMode;
  start: MansionOverheadPlacementV1;
  startPoint: { x: number; y: number };
  startAngle: number;
  startDistance: number;
  rect: DOMRect;
  recorded: boolean;
}

const STAGE_ASPECT = 2;
const HISTORY_LIMIT = 100;
/** Same-key edits inside this window extend the open undo step (one slider sweep, one key burst). */
const HISTORY_COALESCE_MS = 1000;
/** The knob ring's radius as a share of the stage height. */
const RING_RADIUS = 0.38;

function clampPlacement(placement: MansionOverheadPlacementV1): MansionOverheadPlacementV1 {
  const limits = MANSION_OVERHEAD_PLACEMENT_LIMITS_V1;
  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
  // A full turn of the knob wraps instead of stopping at the stored range.
  const rotation = ((((placement.rotation + 180) % 360) + 360) % 360) - 180;
  return {
    rotation: clamp(rotation, -limits.rotation, limits.rotation),
    scale: clamp(placement.scale, limits.minScale, limits.maxScale),
    x: clamp(placement.x, -limits.pan, limits.pan),
    y: clamp(placement.y, -limits.pan, limits.pan),
  };
}

const isIdentity = (placement: MansionOverheadPlacementV1): boolean =>
  placement.rotation === 0 && placement.scale === 1 && placement.x === 0 && placement.y === 0;

/** Where a knob sits on the ring for an angle, in percent of the stage; the ring is a circle on a 2:1 stage. */
function ringPoint(angleDegrees: number): { left: number; top: number } {
  const radians = (angleDegrees * Math.PI) / 180;
  return { left: 50 + (RING_RADIUS * 100 / STAGE_ASPECT) * Math.cos(radians), top: 50 + RING_RADIUS * 100 * Math.sin(radians) };
}

/** Places the venue's overhead plate by hand: pan, rotate, and zoom over an outline of the board,
 * with undo history, then save it to the venue. Same shell and controls as the Lights & FX editor. */
export default function MapOverheadEditorDialog(props: Props): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<MansionOverheadPlacementV1>(() => ({ ...(props.placement ?? MANSION_OVERHEAD_PLACEMENT_IDENTITY_V1) }));
  const [showTiles, setShowTiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [work, setWork] = useState<{ kind: "save" | "generate"; startedAt: number } | null>(null);
  const workToken = useRef(0);
  const [drag, setDrag] = useState<GestureMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const history = useRef<{ past: MansionOverheadPlacementV1[]; future: MansionOverheadPlacementV1[]; lastKey: string | null; lastAt: number }>({ past: [], future: [], lastKey: null, lastAt: 0 });
  const [, setHistoryVersion] = useState(0);
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  const modifier = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  const hasImage = Boolean(props.imageUrl);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  const record = (key: string, coalesceMs = 0, snapshot: MansionOverheadPlacementV1 = placement): void => {
    const entry = history.current;
    const now = performance.now();
    if (coalesceMs > 0 && entry.lastKey === key && now - entry.lastAt < coalesceMs) { entry.lastAt = now; return; }
    entry.past.push({ ...snapshot });
    if (entry.past.length > HISTORY_LIMIT) entry.past.shift();
    entry.future = [];
    entry.lastKey = key;
    entry.lastAt = now;
    setHistoryVersion((version) => version + 1);
  };
  const undo = (): void => {
    const entry = history.current;
    const previous = entry.past.pop();
    if (!previous) return;
    entry.future.push({ ...placement });
    entry.lastKey = null;
    setPlacement(previous);
    setHistoryVersion((version) => version + 1);
  };
  const redo = (): void => {
    const entry = history.current;
    const next = entry.future.pop();
    if (!next) return;
    entry.past.push({ ...placement });
    entry.lastKey = null;
    setPlacement(next);
    setHistoryVersion((version) => version + 1);
  };
  const apply = (
    key: string,
    change: (current: MansionOverheadPlacementV1) => Partial<MansionOverheadPlacementV1>,
    coalesceMs = HISTORY_COALESCE_MS,
  ): void => {
    record(key, coalesceMs);
    setPlacement((current) => clampPlacement({ ...current, ...change(current) }));
  };
  // The wheel listener is attached once and reads the latest editing state through these refs.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const lockedRef = useRef(false);
  lockedRef.current = busy || !hasImage;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Scroll zooms about the board center; with Shift it rotates. Passive listeners cannot stop the page from scrolling.
    const onWheel = (event: WheelEvent): void => {
      if (lockedRef.current) return;
      event.preventDefault();
      const step = event.deltaMode === 1 ? event.deltaY * 18 : event.deltaY;
      if (event.shiftKey) applyRef.current("wheel-rotate", (current) => ({ rotation: current.rotation + step * 0.05 }));
      else applyRef.current("wheel-zoom", (current) => ({ scale: current.scale * Math.exp(-step * 0.0015) }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const run = async (kind: "save" | "generate", operation: (cancelled: () => boolean) => Promise<void> | void): Promise<void> => {
    const token = ++workToken.current;
    const cancelled = (): boolean => workToken.current !== token;
    setBusy(true); setWork({ kind, startedAt: Date.now() }); setError(null); setNotice(null);
    try { await operation(cancelled); }
    catch (cause) { if (!cancelled()) setError(cause instanceof Error ? cause.message : kind === "save" ? "Could not save this placement." : "Could not draw the overhead."); }
    finally { if (!cancelled()) { setBusy(false); setWork(null); } }
  };
  const cancelWork = (): void => {
    workToken.current += 1;
    setBusy(false); setWork(null);
    setNotice("PRISM keeps drawing in the background; the plate appears here when it lands.");
  };
  const generate = async (cancelled: () => boolean): Promise<void> => {
    await props.onGenerate();
    if (cancelled()) return;
    // A fresh plate starts where PRISM put it; the previous framing waits in Undo.
    record("generate");
    setPlacement({ ...MANSION_OVERHEAD_PLACEMENT_IDENTITY_V1 });
    setNotice("A fresh overhead is in, sitting where PRISM placed it. Undo brings back your framing.");
  };

  const beginGesture = (event: ReactPointerEvent<HTMLElement>, mode: GestureMode): void => {
    if (event.button !== 0 || busy || !hasImage) return;
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    gesture.current = {
      id: event.pointerId,
      mode,
      start: { ...placement },
      startPoint: { x: event.clientX, y: event.clientY },
      startAngle: (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI,
      startDistance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
      rect,
      recorded: false,
    };
    stage.setPointerCapture(event.pointerId);
    setDrag(mode);
  };
  const moveGesture = (event: ReactPointerEvent<HTMLElement>): void => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    if (!active.recorded) { record(active.mode, 0, active.start); active.recorded = true; }
    const { rect, start } = active;
    if (active.mode === "pan") {
      const dxCells = (((event.clientX - active.startPoint.x) / rect.width) * 100) / Math.max(0.01, props.cell.width);
      const dyCells = (((event.clientY - active.startPoint.y) / rect.height) * 100) / Math.max(0.01, props.cell.height);
      setPlacement(clampPlacement({ ...start, x: start.x + dxCells, y: start.y + dyCells }));
      return;
    }
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (active.mode === "rotate") {
      const angle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI;
      setPlacement(clampPlacement({ ...start, rotation: start.rotation + (angle - active.startAngle) }));
    } else {
      const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
      setPlacement(clampPlacement({ ...start, scale: start.scale * (distance / active.startDistance) }));
    }
  };
  const endGesture = (event: ReactPointerEvent<HTMLElement>): void => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    gesture.current = null;
    setDrag(null);
    try { stageRef.current?.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  const handleShortcut = (event: KeyboardEvent<HTMLDialogElement>): void => {
    event.stopPropagation();
    if (event.defaultPrevented || busy) return;
    const target = event.target as HTMLElement;
    if (target.closest('textarea, [contenteditable="true"], input:not([type="range"]):not([type="checkbox"])')) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      if (key === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if (key === "y") { event.preventDefault(); redo(); }
      return;
    }
    // Sliders keep their own arrow keys; everywhere else the keys nudge the plate.
    if (!hasImage || target.closest("input, select")) return;
    const nudge = event.shiftKey ? 1 : 0.25;
    const turn = event.shiftKey ? 5 : 0.5;
    switch (event.key) {
      case "ArrowLeft": apply("key-pan", (current) => ({ x: current.x - nudge })); break;
      case "ArrowRight": apply("key-pan", (current) => ({ x: current.x + nudge })); break;
      case "ArrowUp": apply("key-pan", (current) => ({ y: current.y - nudge })); break;
      case "ArrowDown": apply("key-pan", (current) => ({ y: current.y + nudge })); break;
      case "[": apply("key-rotate", (current) => ({ rotation: current.rotation - turn })); break;
      case "]": apply("key-rotate", (current) => ({ rotation: current.rotation + turn })); break;
      case "-": case "_": apply("key-zoom", (current) => ({ scale: current.scale / 1.02 })); break;
      case "=": case "+": apply("key-zoom", (current) => ({ scale: current.scale * 1.02 })); break;
      default: return;
    }
    event.preventDefault();
  };

  const range = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    change: (value: number) => void,
    format: (value: number) => string,
  ): React.JSX.Element => (
    <label>{label}<span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={!hasImage} onChange={(event) => change(Number(event.currentTarget.value))} />
      <output aria-hidden="true">{format(value)}</output>
    </span></label>
  );
  const rotateKnob = ringPoint(placement.rotation - 90);
  const scaleKnob = ringPoint(placement.rotation);
  const plateTransform = `translate(${placement.x * props.cell.width}%, ${placement.y * props.cell.height}%) rotate(${placement.rotation}deg) scale(${placement.scale})`;

  return createPortal(
    <dialog ref={dialogRef} className={shell.dialog} data-theme={props.theme} aria-labelledby="map-overhead-editor-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) props.onClose(); }}
      onKeyDown={handleShortcut} onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}>
      <div className={shell.content} inert={busy}>
        <header className={shell.toolbar}>
          <div><small>The {props.placeNoun} from above · {props.levelLabel}</small><h2 id="map-overhead-editor-title">Overhead view</h2></div>
          <label><input type="checkbox" checked={showTiles} onChange={(event) => setShowTiles(event.currentTarget.checked)} />Show rooms</label>
          <div className={shell.toolbarGroup} role="group" aria-label="History">
            <button type="button" disabled={!canUndo} onClick={undo} title={`Undo (${modifier}Z)`}>Undo</button>
            <button type="button" disabled={!canRedo} onClick={redo} title={`Redo (⇧${modifier}Z)`}>Redo</button>
          </div>
          <button type="button" onClick={props.onClose}>Cancel</button>
          <button type="button" className={shell.primary} disabled={!hasImage}
            onClick={() => void run("save", () => props.onSave(isIdentity(placement) ? null : placement))}>Save placement</button>
        </header>
        <div className={shell.workspace}>
          <div className={shell.sceneColumn}>
            <div className={shell.sceneWell}>
              <div ref={stageRef} className={`${shell.stage} ${styles.board}`} style={{ "--scene-aspect": STAGE_ASPECT } as CSSProperties}
                data-dragging={drag ?? undefined}
                onPointerDown={(event) => beginGesture(event, "pan")} onPointerMove={moveGesture}
                onPointerUp={endGesture} onPointerCancel={endGesture}>
                {props.imageUrl ? (
                  <div className={styles.plate} style={{ transform: plateTransform }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={props.imageUrl} alt="" draggable={false}
                      style={{ left: `${props.frame.left}%`, top: `${props.frame.top}%`, width: `${props.frame.width}%`, height: `${props.frame.height}%` }} />
                  </div>
                ) : (
                  <div className={styles.empty}>
                    <strong>No overhead yet</strong>
                    <small>Draw one from the panel on the right, then place it over the rooms.</small>
                  </div>
                )}
                {showTiles ? (
                  <div className={styles.tiles} aria-hidden="true">
                    {props.tiles.map((tile) => (
                      <span key={tile.id} className={styles.tile} data-kind={tile.kind} data-current={tile.current ? "true" : undefined}
                        style={{ left: `${tile.left}%`, top: `${tile.top}%`, width: `${tile.width}%`, height: `${tile.height}%` }}>
                        {tile.kind === "room" || tile.kind === "side" ? tile.label : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                {hasImage ? (
                  <>
                    <svg className={styles.ring} viewBox="0 0 200 100" aria-hidden="true" data-dragging={drag === "rotate" || drag === "scale" ? "true" : undefined}>
                      <circle cx="100" cy="50" r={RING_RADIUS * 100} />
                      <line x1="100" y1="50" x2={rotateKnob.left * 2} y2={rotateKnob.top} />
                    </svg>
                    <button type="button" className={styles.knob} data-role="rotate" data-label="Rotate"
                      style={{ left: `${rotateKnob.left}%`, top: `${rotateKnob.top}%` }}
                      aria-label="Rotate the overhead: drag around the ring"
                      onPointerDown={(event) => beginGesture(event, "rotate")} />
                    <button type="button" className={styles.knob} data-role="scale" data-label="Resize"
                      style={{ left: `${scaleKnob.left}%`, top: `${scaleKnob.top}%` }}
                      aria-label="Resize the overhead: drag toward or away from the center"
                      onPointerDown={(event) => beginGesture(event, "scale")} />
                  </>
                ) : null}
              </div>
            </div>
            <div className={shell.tray}>
              <p className={shell.hint}>
                Drag the picture to pan. Scroll to zoom, Shift+scroll to rotate. The round knob turns it, the square knob resizes it.
                Arrow keys nudge, [ and ] turn, + and − zoom; hold Shift for bigger steps. Undo with {modifier}Z.
              </p>
            </div>
          </div>
          <aside className={shell.inspector}>
            <section className={`${shell.section} ${shell.autoPlace}`}>
              <header><strong>Overhead picture</strong>{props.online ? <small className={shell.online}>Online</small> : null}</header>
              <small className={shell.hint}>
                {hasImage
                  ? `PRISM drew this from the ${props.placeNoun}'s exterior and set it over the rooms. Drawing again replaces the picture; your framing waits in Undo.`
                  : `Nothing has been drawn for this ${props.placeNoun} yet.`}
              </small>
              <button type="button" className={shell.place} disabled={!props.online} onClick={() => void run("generate", generate)}>
                {hasImage ? "Draw it again" : "Draw the overhead"}
              </button>
              {!props.online ? <small className={shell.tips}>Drawing the picture needs ONLINE mode. Placing it works in either.</small> : null}
            </section>
            <section className={`${shell.section} ${shell.properties}`}>
              <header><strong>Placement</strong><small>{isIdentity(placement) ? "As drawn" : "Hand placed"}</small></header>
              {range("Rotate", placement.rotation, -180, 180, 0.1, (value) => apply("rotate", () => ({ rotation: value })), (value) => `${value.toFixed(1)}°`)}
              {range("Zoom", placement.scale, MANSION_OVERHEAD_PLACEMENT_LIMITS_V1.minScale, MANSION_OVERHEAD_PLACEMENT_LIMITS_V1.maxScale, 0.01, (value) => apply("zoom", () => ({ scale: value })), (value) => `${Math.round(value * 100)}%`)}
              {range("Across", placement.x, -16, 16, 0.05, (value) => apply("pan-x", () => ({ x: value })), (value) => `${value.toFixed(2)}`)}
              {range("Down", placement.y, -16, 16, 0.05, (value) => apply("pan-y", () => ({ y: value })), (value) => `${value.toFixed(2)}`)}
              <small>Across and Down are in map cells, so the placement holds on every level.</small>
              <button type="button" disabled={!hasImage || isIdentity(placement)}
                onClick={() => { record("reset"); setPlacement({ ...MANSION_OVERHEAD_PLACEMENT_IDENTITY_V1 }); }}>Back to where PRISM placed it</button>
            </section>
            <p className={shell.tips}>Save writes the placement into the venue, so it comes back with the case. The field tool's Undo takes the last save back.</p>
          </aside>
        </div>
      </div>
      <PrismBlockingLoader
        open={work !== null}
        portalTarget={dialogRef.current}
        placement="fullscreen"
        theme={props.theme}
        {...(work?.kind === "generate"
          ? { operation: "refraction" as const, onCancel: cancelWork, cancelLabel: "Stop waiting", cancelConfirmTitle: "Stop waiting?", cancelConfirmDetail: "PRISM keeps drawing in the background; the picture appears when it lands." }
          : { operation: "preparation" as const })}
        operationId={work?.startedAt}
        eyebrow="PRISM / Overhead view"
        title={work?.kind === "generate" ? `Drawing the ${props.placeNoun} from above` : "Saving the placement"}
        detail={work?.kind === "generate"
          ? `PRISM is painting the ${props.placeNoun}'s exterior seen from directly above, then setting it over the rooms.`
          : "PRISM is writing this placement into the venue."}
        stepLabel={work?.kind === "generate" ? "Drawing the overhead" : "Saving placement"}
        startedAt={work?.startedAt ?? null}
        footer={work?.kind === "generate" ? "Your current picture stays until the new one arrives." : "Keep this window open."}
      />
      {error ? <p className={shell.error} role="alert">{error}</p> : null}
      {!error && notice ? <p className={shell.notice} role="status">{notice}</p> : null}
    </dialog>,
    document.body,
  );
}
