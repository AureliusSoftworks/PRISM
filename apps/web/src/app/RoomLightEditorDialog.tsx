"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { MANSION_LAYOUT_V2_MAX_LIGHTS, MANSION_LIGHT_BLEND_MODES_V1, mansionGodrayEdgesV2, mansionGodrayParallelPointsV2, type MansionDynamicLightV2, type MansionLightBlendModeV1 } from "@localai/shared";
import { DebateMysteryRoomCinematographyLayer } from "./debateMysteryRoomCinematographyLayer";
import {
  ROOM_LIGHT_DEFAULT_COLOR,
  cloneRoomLight,
  createRoomLight,
  directionalRoomLightPoints,
  moveRoomLight,
  roomLightCenter,
  roomLightPoint,
  sampleRoomLightColorFromImage,
  setDirectionalRoomLightPoint,
  type LightPoint,
} from "./roomLightPlacement";
import styles from "./roomLightEditor.module.css";

export interface RoomLightingDraft { lights: MansionDynamicLightV2[]; blendMode: MansionLightBlendModeV1 }
interface Props {
  room: { id: string; name: string };
  imageUrl: string | null;
  artStyle: "mosaic" | "illustrated";
  lights: readonly MansionDynamicLightV2[];
  blendMode?: MansionLightBlendModeV1;
  theme: "light" | "dark";
  onClose: () => void;
  onSave: (draft: RoomLightingDraft) => Promise<void> | void;
  /** ONLINE only: detects the room's visible light sources and returns a fresh light set. */
  onAutoPlace?: (draft: RoomLightingDraft) => Promise<MansionDynamicLightV2[]>;
}

const KINDS = [
  { kind: "omni", name: "Lamp", detail: "A soft circular glow", icon: "◉" },
  { kind: "fire", name: "Fire", detail: "A warm, flickering source", icon: "△" },
  { kind: "directional", name: "Beam + dust", detail: "A window godray that lands on the floor", icon: "▱" },
  { kind: "neon", name: "Neon", detail: "A glowing line with movable ends", icon: "⌁" },
] as const;
const BLEND_LABELS: Record<MansionLightBlendModeV1, string> = {
  auto: "Automatic", screen: "Screen", "plus-lighter": "Add", overlay: "Overlay", "soft-light": "Soft light",
  "hard-light": "Hard light", normal: "Normal", multiply: "Multiply",
};
const CONTEXT_MENU_WIDTH_PX = 210;
const EMPTY_CONTEXT_MENU_HEIGHT_PX = 140;
const LIGHT_CONTEXT_MENU_HEIGHT_PX = 245;
const HISTORY_LIMIT = 100;
/** Same-key edits inside this window extend the open undo step (one slider sweep, one arrow-key burst). */
const HISTORY_COALESCE_MS = 1000;

/** One undoable state of the draft. */
interface EditorSnapshot { lights: MansionDynamicLightV2[]; blendMode: MansionLightBlendModeV1; selectedId: string | null }
const CONTEXT_MENU_VIEWPORT_MARGIN_PX = 8;

/** A room-scoped draft. Native modal input isolation also protects the investigation underneath. */
export default function RoomLightEditorDialog(props: Props): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const roomImageRef = useRef<HTMLImageElement>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const [lights, setLights] = useState(() => structuredClone([...props.lights]));
  const [blendMode, setBlendMode] = useState(props.blendMode ?? "auto");
  const [selectedId, setSelectedId] = useState<string | null>(props.lights[0]?.id ?? null);
  const [preview, setPreview] = useState(false);
  const [lightsVisible, setLightsVisible] = useState(true);
  const [aspect, setAspect] = useState(16 / 9);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samplingNotice, setSamplingNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<LightPoint | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; point: LightPoint; lightId?: string } | null>(null);
  const gesture = useRef<{ id: number; light: MansionDynamicLightV2; start: LightPoint; endpoint?: number; recorded?: boolean } | null>(null);
  const selected = lights.find((light) => light.id === selectedId);
  const history = useRef<{ past: EditorSnapshot[]; future: EditorSnapshot[]; lastKey: string | null; lastAt: number }>({ past: [], future: [], lastKey: null, lastAt: 0 });
  const clipboard = useRef<MansionDynamicLightV2 | null>(null);
  const [, setHistoryVersion] = useState(0);
  const [shortcutNotice, setShortcutNotice] = useState<string | null>(null);
  const modifier = typeof navigator !== "undefined" && /Mac|iPhone|iPad/u.test(navigator.platform) ? "⌘" : "Ctrl+";
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;

  const snapshot = (): EditorSnapshot => ({ lights: structuredClone(lights), blendMode, selectedId });
  /** Captures the state before a change. Must run before the matching set-state call. */
  const record = (key: string, coalesceMs = 0) => {
    const entry = history.current; const now = performance.now();
    if (coalesceMs > 0 && entry.lastKey === key && now - entry.lastAt < coalesceMs) { entry.lastAt = now; return; }
    entry.past.push(snapshot()); if (entry.past.length > HISTORY_LIMIT) entry.past.shift();
    entry.future = []; entry.lastKey = key; entry.lastAt = now;
    setHistoryVersion((version) => version + 1);
  };
  const restore = (state: EditorSnapshot) => {
    setLights(structuredClone(state.lights)); setBlendMode(state.blendMode); setSelectedId(state.selectedId); setMenu(null); setShortcutNotice(null);
  };
  const undo = () => {
    const entry = history.current; const previous = entry.past.pop();
    if (!previous) return;
    entry.future.push(snapshot()); entry.lastKey = null; restore(previous); setHistoryVersion((version) => version + 1);
  };
  const redo = () => {
    const entry = history.current; const next = entry.future.pop();
    if (!next) return;
    entry.past.push(snapshot()); entry.lastKey = null; restore(next); setHistoryVersion((version) => version + 1);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog?.showModal();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => { dialog?.close(); media.removeEventListener("change", update); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => { if (picker) pickerRef.current?.focus(); }, [picker]);

  /** `step` names the undo step for this light; `null` records nothing (frames inside a drag already recorded at its start). */
  const updateLight = (id: string, update: (light: MansionDynamicLightV2) => MansionDynamicLightV2, step: string | null = "edit") => {
    if (step !== null) record(`${id}:${step}`, HISTORY_COALESCE_MS);
    setLights((current) => current.map((light) => light.id === id ? update(light) : light));
  };
  const remove = (id: string) => { record("delete"); setLights((current) => current.filter((light) => light.id !== id)); setSelectedId(null); setMenu(null); };
  const duplicateLight = (id: string) => {
    if (lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS) return;
    const source = lights.find((light) => light.id === id);
    if (!source) return;
    const light = cloneRoomLight(source, `light:${crypto.randomUUID()}`);
    record("clone");
    setLights((current) => [...current, light]);
    setSelectedId(light.id);
    setMenu(null);
  };
  const copyLight = (id: string) => {
    const light = lights.find((entry) => entry.id === id);
    if (!light) return;
    clipboard.current = structuredClone(light); setMenu(null); setShortcutNotice(null);
  };
  const cutLight = (id: string) => { copyLight(id); remove(id); };
  /** Pastes at a point when given (context menu), otherwise offset from the last copy so repeated pastes cascade. */
  const pasteLight = (at?: LightPoint) => {
    const source = clipboard.current;
    setMenu(null);
    if (!source) { setShortcutNotice("Copy a light first, then paste."); return; }
    if (lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS) {
      setShortcutNotice(`Rooms hold at most ${MANSION_LAYOUT_V2_MAX_LIGHTS} lights. Delete one before pasting.`); return;
    }
    let light = cloneRoomLight(source, `light:${crypto.randomUUID()}`);
    if (at) { const center = roomLightCenter(light); light = moveRoomLight(light, { x: at.x - center.x, y: at.y - center.y }); }
    clipboard.current = structuredClone(light);
    record("paste");
    setLights((current) => [...current, light]); setSelectedId(light.id); setShortcutNotice(null);
  };
  const handleShortcut = (event: KeyboardEvent<HTMLDialogElement>) => {
    event.stopPropagation();
    if (event.defaultPrevented || preview || busy || picker) return;
    const target = event.target as HTMLElement;
    // Text-like fields keep their native editing keys; sliders, checkboxes, and color wells do not need them.
    if (target.closest('textarea, [contenteditable="true"], input:not([type="range"]):not([type="checkbox"]):not([type="color"])')) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      if (key === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if (key === "y") { event.preventDefault(); redo(); }
      else if (key === "c" && selected) { event.preventDefault(); copyLight(selected.id); }
      else if (key === "x" && selected) { event.preventDefault(); cutLight(selected.id); }
      else if (key === "v") { event.preventDefault(); pasteLight(); }
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selected && !target.closest("input, select")) {
      event.preventDefault(); remove(selected.id);
    }
  };
  const resampleLightColor = (id: string) => {
    const source = lights.find((light) => light.id === id);
    const sampledColor = source && roomImageRef.current
      ? sampleRoomLightColorFromImage(roomImageRef.current, roomLightCenter(source))
      : null;
    setMenu(null);
    setSelectedId(id);
    setError(null);
    if (!sampledColor) {
      setSamplingNotice("PRISM could not sample this room image, so the light's existing color was preserved.");
      return;
    }
    updateLight(id, (light) => ({ ...light, color: sampledColor }), "resample");
    setSamplingNotice(null);
  };
  const placeLight = (kind: MansionDynamicLightV2["kind"]) => {
    if (!picker) return;
    const sampledColor = roomImageRef.current
      ? sampleRoomLightColorFromImage(roomImageRef.current, picker)
      : null;
    const light = createRoomLight(
      props.room.id,
      kind,
      picker,
      `light:${crypto.randomUUID()}`,
      sampledColor ?? ROOM_LIGHT_DEFAULT_COLOR,
    );
    record("place");
    setLights((current) => [...current, light]);
    setSelectedId(light.id);
    setPicker(null);
    setError(null);
    setSamplingNotice(sampledColor
      ? null
      : "PRISM could not sample this room image, so the new light uses neutral warm white.");
  };
  const pointFor = (event: { clientX: number; clientY: number }) => roomLightPoint(
    { x: event.clientX, y: event.clientY }, stageRef.current!.getBoundingClientRect(),
  );
  const beginDrag = (event: PointerEvent<HTMLButtonElement>, light: MansionDynamicLightV2, endpoint?: number) => {
    if (event.button !== 0 || busy || picker) return;
    event.preventDefault(); event.stopPropagation(); setMenu(null); setSelectedId(light.id);
    gesture.current = { id: event.pointerId, light, start: pointFor(event), endpoint };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const endDrag = () => { gesture.current = null; setDragging(false); };
  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    const point = pointFor(event);
    const light = active.light;
    // One undo step per gesture, captured on the first frame that actually moves.
    if (!active.recorded) { record(`${light.id}:drag`); active.recorded = true; }
    if (light.kind === "neon" && active.endpoint !== undefined) {
      updateLight(light.id, () => ({ ...light, geometry: { ...light.geometry,
        points: light.geometry.points.map((old, index) => index === active.endpoint ? point : old) } }), null);
    } else if (light.kind === "directional" && active.endpoint !== undefined) {
      updateLight(light.id, () => setDirectionalRoomLightPoint(light, active.endpoint!, point, aspect), null);
    } else updateLight(light.id, () => moveRoomLight(light, { x: point.x - active.start.x, y: point.y - active.start.y }), null);
  };
  const run = async (operation: () => Promise<void> | void) => {
    setBusy(true); setError(null); setMenu(null);
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save these lights."); }
    finally { setBusy(false); }
  };
  const range = (label: string, value: number, min: number, max: number, step: number, change: (value: number) => void) => (
    <label>{label}<input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => change(Number(event.currentTarget.value))} /></label>
  );
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog ref={dialogRef} className={styles.dialog} data-theme={props.theme} aria-labelledby="room-light-editor-title"
      onCancel={(event) => { event.preventDefault(); if (picker) setPicker(null); else if (menu) setMenu(null); else if (!busy) props.onClose(); }}
      onKeyDown={handleShortcut} onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()} data-tutorial-target="whodunnit-light-placement">
      <div className={styles.content} inert={Boolean(picker) || busy}>
        <header className={styles.toolbar}>
          <div><small>{props.room.name}</small><h2 id="room-light-editor-title">Lights &amp; FX</h2></div>
          <label>Room blend<select value={blendMode} onChange={(event) => { record("blend"); setBlendMode(event.currentTarget.value as MansionLightBlendModeV1); }}>
            {MANSION_LIGHT_BLEND_MODES_V1.map((mode) => <option key={mode} value={mode}>{BLEND_LABELS[mode]}</option>)}
          </select></label>
          <button type="button" aria-pressed={preview} onClick={() => { setPreview(!preview); setMenu(null); setLightsVisible(true); }}>{preview ? "Edit lights" : "Preview"}</button>
          {preview ? <label className={styles.switch}><input type="checkbox" checked={lightsVisible} onChange={(event) => setLightsVisible(event.currentTarget.checked)} />Lights on</label> : null}
          <button type="button" disabled={!canUndo || preview} onClick={undo} title={`Undo (${modifier}Z)`}>Undo</button>
          <button type="button" disabled={!canRedo || preview} onClick={redo} title={`Redo (⇧${modifier}Z)`}>Redo</button>
          <button type="button" onClick={props.onClose}>Cancel</button>
          <button type="button" className={styles.primary} onClick={() => void run(() => props.onSave({ lights, blendMode }))}>Save lights</button>
        </header>
        <div className={styles.workspace} data-preview={preview}>
          <div className={styles.sceneWell}>
            <div ref={stageRef} className={styles.stage} style={{ "--scene-aspect": aspect } as CSSProperties}
              data-art-style={props.artStyle} data-light-editor-stage="true"
              onClick={() => setMenu(null)}
              onContextMenu={(event) => {
                event.preventDefault(); if (preview || !props.imageUrl) return;
                const marker = (event.target as HTMLElement).closest<HTMLElement>("[data-light-id]");
                const lightId = marker?.dataset.lightId;
                const menuHeight = lightId ? LIGHT_CONTEXT_MENU_HEIGHT_PX : EMPTY_CONTEXT_MENU_HEIGHT_PX;
                setMenu({
                  x: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN_PX, Math.min(window.innerWidth - CONTEXT_MENU_WIDTH_PX, event.clientX)),
                  y: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN_PX, Math.min(window.innerHeight - menuHeight, event.clientY)),
                  point: pointFor(event),
                  lightId,
                });
              }}>
              {props.imageUrl ? <img ref={roomImageRef} src={props.imageUrl} alt={`${props.room.name} lighting preview`} draggable={false}
                onLoad={(event) => setAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} /> : <p>Room art is unavailable.</p>}
              {lightsVisible ? <DebateMysteryRoomCinematographyLayer room={props.room} lights={lights}
                blendMode={blendMode} artStyle={props.artStyle} sourceAspectRatio={aspect}
                templateLightingAligned={false} reducedMotion={reducedMotion} blurred={false} /> : null}
              {!preview ? lights.map((light, index) => {
                const point = roomLightCenter(light);
                return <button key={light.id} type="button" className={styles.marker} data-light-id={light.id}
                  data-selected={selectedId === light.id} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, "--light-color": light.color } as CSSProperties}
                  aria-label={`Move ${KINDS.find((kind) => kind.kind === light.kind)?.name} ${index + 1}`} title={`${light.kind} ${index + 1} · drag to move · right-click to resample, clone, or delete`}
                  onPointerDown={(event) => beginDrag(event, light)} onPointerMove={drag}
                  onPointerUp={endDrag} onPointerCancel={endDrag}
                  onClick={(event) => { event.stopPropagation(); setSelectedId(light.id); setMenu(null); }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 0.05 : 0.005;
                    const deltas: Record<string, LightPoint> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
                    if (deltas[event.key]) { event.preventDefault(); updateLight(light.id, (value) => moveRoomLight(value, deltas[event.key]!), "nudge"); }
                    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(light.id); }
                  }}>{KINDS.find((kind) => kind.kind === light.kind)?.icon}<small>{index + 1}</small></button>;
              }) : null}
              {!preview && selected?.kind === "neon" ? selected.geometry.points.map((point, index) => (
                <button key={`point-${index}`} type="button" className={styles.endpoint} aria-label={`Move neon point ${index + 1}`}
                  data-light-id={selected.id} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  onPointerDown={(event) => beginDrag(event, selected, index)} onPointerMove={drag}
                  onPointerUp={endDrag} onPointerCancel={endDrag} />
              )) : null}
              {!preview && selected?.kind === "directional" ? (() => {
                // The godray's own light can be faint against bright art, so the selected ray
                // wears a guide: its outline, both side rays, and its two edges told apart.
                const corners = directionalRoomLightPoints(selected, aspect);
                const { origin, landing } = mansionGodrayEdgesV2(corners);
                const at = (point: LightPoint) => ({ x: point.x * 100, y: point.y * 100 });
                const [o0, o1, l0, l1] = [at(origin.start), at(origin.end), at(landing.start), at(landing.end)];
                return <svg className={styles.godrayGuide} data-dragging={dragging ? "true" : undefined} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polygon points={corners.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} vectorEffect="non-scaling-stroke" />
                  <line className={styles.godrayGuideRay} x1={o0.x} y1={o0.y} x2={l0.x} y2={l0.y} vectorEffect="non-scaling-stroke" />
                  <line className={styles.godrayGuideRay} x1={o1.x} y1={o1.y} x2={l1.x} y2={l1.y} vectorEffect="non-scaling-stroke" />
                  <line className={styles.godrayGuideWindow} x1={o0.x} y1={o0.y} x2={o1.x} y2={o1.y} vectorEffect="non-scaling-stroke" />
                  <line className={styles.godrayGuideFloor} x1={l0.x} y1={l0.y} x2={l1.x} y2={l1.y} vectorEffect="non-scaling-stroke" />
                </svg>;
              })() : null}
              {!preview && selected?.kind === "directional" ? directionalRoomLightPoints(selected, aspect).map((point, index) => (
                <button key={`corner-${index}`} type="button" className={styles.endpoint} data-godray-corner={index < 2 ? "window" : "floor"}
                  aria-label={index < 2 ? `Move window corner ${index + 1}` : `Move floor corner ${index - 1}`}
                  data-light-id={selected.id} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  onPointerDown={(event) => beginDrag(event, selected, index)} onPointerMove={drag}
                  onPointerUp={endDrag} onPointerCancel={endDrag} />
              )) : null}
            </div>
          </div>
          {!preview ? <aside className={styles.inspector}>
            <button type="button" disabled={!props.imageUrl || lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => setPicker({ x: 0.5, y: 0.5 })}>+ Place light</button>
            <small>Drag a marker to move it. Right-click the room to place a light with a sampled local color, or a marker to resample, clone, or delete it. {modifier}C copies the selected light, {modifier}V pastes, {modifier}X cuts, {modifier}Z undoes.</small>
            <div className={styles.lightList}>{lights.map((light, index) => <button key={light.id} type="button" aria-pressed={selectedId === light.id} onClick={() => setSelectedId(light.id)}>{index + 1} · {KINDS.find((kind) => kind.kind === light.kind)?.name}</button>)}</div>
            {selected ? <div className={styles.properties}>
              <label>Color<input type="color" value={/^#[0-9a-f]{6}$/i.test(selected.color) ? selected.color : "#ffb067"} onChange={(event) => { const color = event.currentTarget.value; updateLight(selected.id, (light) => ({ ...light, color }), "color"); }} /></label>
              {range("Intensity", selected.intensity, 0, 1, 0.01, (intensity) => updateLight(selected.id, (light) => ({ ...light, intensity }), "intensity"))}
              {selected.kind === "omni" || selected.kind === "fire" ? range("Radius", selected.geometry.radius, 0.01, 1, 0.005, (radius) => updateLight(selected.id, (light) => {
                if (light.kind === "omni") return { ...light, geometry: { ...light.geometry, radius } };
                if (light.kind === "fire") return { ...light, geometry: { ...light.geometry, radius } };
                return light;
              }, "radius")) : null}
              {selected.kind === "fire" ? range("Rotation", selected.geometry.rotation, -360, 360, 1, (rotation) => updateLight(selected.id, (light) => light.kind === "fire" ? { ...light, geometry: { ...light.geometry, rotation } } : light, "rotation")) : null}
              {selected.kind === "directional" ? <>
                <small>Drag the corners on the room: purple corners sit on the window, blue corners are where the ray lands on the floor. Corners on one edge share a column.</small>
                <button type="button" onClick={() => updateLight(selected.id, (light) => light.kind === "directional"
                  ? { ...light, geometry: { points: mansionGodrayParallelPointsV2(directionalRoomLightPoints(light, aspect)) } } : light, "parallel")}>Make rays parallel</button>
                <label>Dust<input type="checkbox" checked={selected.dust} onChange={(event) => { const dust = event.currentTarget.checked; updateLight(selected.id, (light) => light.kind === "directional" ? { ...light, dust } : light, "dust"); }} /></label>
              </> : null}
              {selected.kind === "fire" ? <label>Flicker<input type="checkbox" checked={selected.animation === "flicker"} onChange={(event) => { const animation = event.currentTarget.checked ? "flicker" : "steady"; updateLight(selected.id, (light) => light.kind === "fire" ? { ...light, animation } : light, "flicker"); }} /></label> : null}
              {selected.kind === "neon" ? range("Stroke width", selected.geometry.width, 0.005, 0.25, 0.005, (width) => updateLight(selected.id, (light) => light.kind === "neon" ? { ...light, geometry: { ...light.geometry, width } } : light, "stroke")) : null}
              <button type="button" onClick={() => remove(selected.id)}>Delete light</button>
            </div> : <p>{lights.length ? "Select a marker to adjust its glow." : "Place the first light in this room."}</p>}
            {props.onAutoPlace ? <>
              <button type="button" disabled={!props.imageUrl} onClick={() => void run(async () => {
                const placed = await props.onAutoPlace!({ lights, blendMode });
                record("auto-place");
                setLights(placed); setSelectedId(placed[0]?.id ?? null);
              })}>Auto-place lights · ONLINE</button>
              <small>PRISM reads the room art for lit fireplaces, lamps, windows with light coming in, and neon, then adds, moves, or removes lights to match.</small>
            </> : null}
          </aside> : null}
        </div>
      </div>
      {menu ? <div className={styles.contextMenu} role="menu" style={{ left: menu.x, top: menu.y }}>
        {menu.lightId ? <>
          <button type="button" role="menuitem" autoFocus onClick={() => resampleLightColor(menu.lightId!)}>Resample color</button>
          <button type="button" role="menuitem" disabled={lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => duplicateLight(menu.lightId!)}>Clone light</button>
          <button type="button" role="menuitem" onClick={() => copyLight(menu.lightId!)}>Copy <small>{modifier}C</small></button>
          <button type="button" role="menuitem" onClick={() => cutLight(menu.lightId!)}>Cut <small>{modifier}X</small></button>
          <button type="button" role="menuitem" onClick={() => remove(menu.lightId!)}>Delete light</button>
        </> : <>
          <button type="button" role="menuitem" autoFocus disabled={lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => { setPicker(menu.point); setMenu(null); }}>Place light…</button>
          <button type="button" role="menuitem" disabled={!clipboard.current || lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => pasteLight(menu.point)}>Paste here <small>{modifier}V</small></button>
        </>}
      </div> : null}
      {picker ? <div className={styles.pickerScrim}><section className={styles.picker} role="dialog" aria-modal="true" aria-labelledby="light-kind-title">
        <header><h3 id="light-kind-title">Place light</h3><button ref={pickerRef} type="button" onClick={() => setPicker(null)}>Cancel</button></header>
        {KINDS.map((kind) => <button key={kind.kind} type="button" onClick={() => placeLight(kind.kind)}>
          <span>{kind.icon}</span><strong>{kind.name}</strong><small>{kind.detail}</small>
        </button>)}
      </section></div> : null}
      {busy ? <div className={styles.pickerScrim} role="status">Working…</div> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!error && (shortcutNotice ?? samplingNotice) ? <p className={styles.notice} role="status">{shortcutNotice ?? samplingNotice}</p> : null}
    </dialog>, document.body,
  );
}
