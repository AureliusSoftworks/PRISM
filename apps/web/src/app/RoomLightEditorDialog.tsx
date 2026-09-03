"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { MANSION_LAYOUT_V2_MAX_LIGHTS, MANSION_LIGHT_BLEND_MODES_V1, mansionGodrayParallelPointsV2, type MansionDynamicLightV2, type MansionLightBlendModeV1 } from "@localai/shared";
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
  const [error, setError] = useState<string | null>(null);
  const [samplingNotice, setSamplingNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<LightPoint | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; point: LightPoint; lightId?: string } | null>(null);
  const gesture = useRef<{ id: number; light: MansionDynamicLightV2; start: LightPoint; endpoint?: number } | null>(null);
  const selected = lights.find((light) => light.id === selectedId);

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

  const updateLight = (id: string, update: (light: MansionDynamicLightV2) => MansionDynamicLightV2) =>
    setLights((current) => current.map((light) => light.id === id ? update(light) : light));
  const remove = (id: string) => { setLights((current) => current.filter((light) => light.id !== id)); setSelectedId(null); setMenu(null); };
  const duplicateLight = (id: string) => {
    if (lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS) return;
    const source = lights.find((light) => light.id === id);
    if (!source) return;
    const light = cloneRoomLight(source, `light:${crypto.randomUUID()}`);
    setLights((current) => [...current, light]);
    setSelectedId(light.id);
    setMenu(null);
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
  };
  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    const point = pointFor(event);
    const light = active.light;
    if (light.kind === "neon" && active.endpoint !== undefined) {
      updateLight(light.id, () => ({ ...light, geometry: { ...light.geometry,
        points: light.geometry.points.map((old, index) => index === active.endpoint ? point : old) } }));
    } else if (light.kind === "directional" && active.endpoint !== undefined) {
      updateLight(light.id, () => setDirectionalRoomLightPoint(light, active.endpoint!, point, aspect));
    } else updateLight(light.id, () => moveRoomLight(light, { x: point.x - active.start.x, y: point.y - active.start.y }));
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
      onKeyDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()} data-tutorial-target="whodunnit-light-placement">
      <div className={styles.content} inert={Boolean(picker) || busy}>
        <header className={styles.toolbar}>
          <div><small>{props.room.name}</small><h2 id="room-light-editor-title">Lights &amp; FX</h2></div>
          <label>Room blend<select value={blendMode} onChange={(event) => setBlendMode(event.currentTarget.value as MansionLightBlendModeV1)}>
            {MANSION_LIGHT_BLEND_MODES_V1.map((mode) => <option key={mode} value={mode}>{BLEND_LABELS[mode]}</option>)}
          </select></label>
          <button type="button" aria-pressed={preview} onClick={() => { setPreview(!preview); setMenu(null); setLightsVisible(true); }}>{preview ? "Edit lights" : "Preview"}</button>
          {preview ? <label className={styles.switch}><input type="checkbox" checked={lightsVisible} onChange={(event) => setLightsVisible(event.currentTarget.checked)} />Lights on</label> : null}
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
                setMenu({ x: Math.min(window.innerWidth - 210, event.clientX), y: Math.min(window.innerHeight - 95, event.clientY), point: pointFor(event), lightId: marker?.dataset.lightId });
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
                  aria-label={`Move ${KINDS.find((kind) => kind.kind === light.kind)?.name} ${index + 1}`} title={`${light.kind} ${index + 1} · drag to move · right-click to clone or delete`}
                  onPointerDown={(event) => beginDrag(event, light)} onPointerMove={drag}
                  onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}
                  onClick={(event) => { event.stopPropagation(); setSelectedId(light.id); setMenu(null); }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 0.05 : 0.005;
                    const deltas: Record<string, LightPoint> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
                    if (deltas[event.key]) { event.preventDefault(); updateLight(light.id, (value) => moveRoomLight(value, deltas[event.key]!)); }
                    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(light.id); }
                  }}>{KINDS.find((kind) => kind.kind === light.kind)?.icon}<small>{index + 1}</small></button>;
              }) : null}
              {!preview && selected?.kind === "neon" ? selected.geometry.points.map((point, index) => (
                <button key={`point-${index}`} type="button" className={styles.endpoint} aria-label={`Move neon point ${index + 1}`}
                  data-light-id={selected.id} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  onPointerDown={(event) => beginDrag(event, selected, index)} onPointerMove={drag}
                  onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} />
              )) : null}
              {!preview && selected?.kind === "directional" ? directionalRoomLightPoints(selected, aspect).map((point, index) => (
                <button key={`corner-${index}`} type="button" className={styles.endpoint} data-godray-corner={index < 2 ? "window" : "floor"}
                  aria-label={index < 2 ? `Move window corner ${index + 1}` : `Move floor corner ${index - 1}`}
                  data-light-id={selected.id} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  onPointerDown={(event) => beginDrag(event, selected, index)} onPointerMove={drag}
                  onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} />
              )) : null}
            </div>
          </div>
          {!preview ? <aside className={styles.inspector}>
            <button type="button" disabled={!props.imageUrl || lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => setPicker({ x: 0.5, y: 0.5 })}>+ Place light</button>
            <small>Drag a marker to move it. Right-click the room to place a light with a sampled local color, or a marker to clone or delete it.</small>
            <div className={styles.lightList}>{lights.map((light, index) => <button key={light.id} type="button" aria-pressed={selectedId === light.id} onClick={() => setSelectedId(light.id)}>{index + 1} · {KINDS.find((kind) => kind.kind === light.kind)?.name}</button>)}</div>
            {selected ? <div className={styles.properties}>
              <label>Color<input type="color" value={/^#[0-9a-f]{6}$/i.test(selected.color) ? selected.color : "#ffb067"} onChange={(event) => { const color = event.currentTarget.value; updateLight(selected.id, (light) => ({ ...light, color })); }} /></label>
              {range("Intensity", selected.intensity, 0, 1, 0.01, (intensity) => updateLight(selected.id, (light) => ({ ...light, intensity })))}
              {selected.kind === "omni" || selected.kind === "fire" ? range("Radius", selected.geometry.radius, 0.01, 1, 0.005, (radius) => updateLight(selected.id, (light) => {
                if (light.kind === "omni") return { ...light, geometry: { ...light.geometry, radius } };
                if (light.kind === "fire") return { ...light, geometry: { ...light.geometry, radius } };
                return light;
              })) : null}
              {selected.kind === "fire" ? range("Rotation", selected.geometry.rotation, -360, 360, 1, (rotation) => updateLight(selected.id, (light) => light.kind === "fire" ? { ...light, geometry: { ...light.geometry, rotation } } : light)) : null}
              {selected.kind === "directional" ? <>
                <small>Drag the corners on the room: the first two sit on the window, the last two are where the ray lands on the floor.</small>
                <button type="button" onClick={() => updateLight(selected.id, (light) => light.kind === "directional"
                  ? { ...light, geometry: { points: mansionGodrayParallelPointsV2(directionalRoomLightPoints(light, aspect)) } } : light)}>Make rays parallel</button>
                <label>Dust<input type="checkbox" checked={selected.dust} onChange={(event) => { const dust = event.currentTarget.checked; updateLight(selected.id, (light) => light.kind === "directional" ? { ...light, dust } : light); }} /></label>
              </> : null}
              {selected.kind === "fire" ? <label>Flicker<input type="checkbox" checked={selected.animation === "flicker"} onChange={(event) => { const animation = event.currentTarget.checked ? "flicker" : "steady"; updateLight(selected.id, (light) => light.kind === "fire" ? { ...light, animation } : light); }} /></label> : null}
              {selected.kind === "neon" ? range("Stroke width", selected.geometry.width, 0.005, 0.25, 0.005, (width) => updateLight(selected.id, (light) => light.kind === "neon" ? { ...light, geometry: { ...light.geometry, width } } : light)) : null}
              <button type="button" onClick={() => remove(selected.id)}>Delete light</button>
            </div> : <p>{lights.length ? "Select a marker to adjust its glow." : "Place the first light in this room."}</p>}
            {props.onAutoPlace ? <>
              <button type="button" disabled={!props.imageUrl} onClick={() => void run(async () => {
                const placed = await props.onAutoPlace!({ lights, blendMode });
                setLights(placed); setSelectedId(placed[0]?.id ?? null);
              })}>Auto-place lights · ONLINE</button>
              <small>PRISM reads the room art for lit fireplaces, lamps, windows with light coming in, and neon, then adds, moves, or removes lights to match.</small>
            </> : null}
          </aside> : null}
        </div>
      </div>
      {menu ? <div className={styles.contextMenu} role="menu" style={{ left: menu.x, top: menu.y }}>
        {menu.lightId ? <>
          <button type="button" role="menuitem" autoFocus disabled={lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => duplicateLight(menu.lightId!)}>Clone light</button>
          <button type="button" role="menuitem" onClick={() => remove(menu.lightId!)}>Delete light</button>
        </>
          : <button type="button" role="menuitem" autoFocus disabled={lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => { setPicker(menu.point); setMenu(null); }}>Place light…</button>}
      </div> : null}
      {picker ? <div className={styles.pickerScrim}><section className={styles.picker} role="dialog" aria-modal="true" aria-labelledby="light-kind-title">
        <header><h3 id="light-kind-title">Place light</h3><button ref={pickerRef} type="button" onClick={() => setPicker(null)}>Cancel</button></header>
        {KINDS.map((kind) => <button key={kind.kind} type="button" onClick={() => placeLight(kind.kind)}>
          <span>{kind.icon}</span><strong>{kind.name}</strong><small>{kind.detail}</small>
        </button>)}
      </section></div> : null}
      {busy ? <div className={styles.pickerScrim} role="status">Working…</div> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!error && samplingNotice ? <p className={styles.notice} role="status">{samplingNotice}</p> : null}
    </dialog>, document.body,
  );
}
