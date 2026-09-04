"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import { composeRoomLightTuneSheet, type RoomLightTuneSheetV1 } from "./roomLightTuneSheet";
import { MANSION_LAYOUT_V2_MAX_EFFECTS, MANSION_LAYOUT_V2_MAX_LIGHTS, MANSION_LIGHT_BLEND_MODES_V1, MANSION_LIGHT_DEFAULT_BLEND_MODE_V1, ROOM_LIGHT_TUNE_BLEND_SHORTLIST_V1, mansionGodrayEdgesV2, mansionNaturalLightTintV2, type MansionDynamicLightV2, type MansionLightBlendModeV1, type MansionRoomEffectKindV1, type MansionRoomEffectV1 } from "@localai/shared";
import { DebateMysteryRoomCinematographyLayer } from "./debateMysteryRoomCinematographyLayer";
import {
  ROOM_EFFECT_KINDS,
  ROOM_LIGHT_DEFAULT_COLOR,
  cloneRoomLight,
  createRoomLight,
  directionalRoomLightPoints,
  moveRoomLight,
  roomLightCenter,
  roomLightPoint,
  sampleRoomLightColorFromImage,
  aimGodray,
  createRoomEffect,
  formatRoomLightData,
  godrayRoomLightDescription,
  isRoomEffect,
  naturalBeamColor,
  roomSunDirection,
  setGodrayAperturePoint,
  setGodrayLanding,
  setGodraySpread,
  type LightPoint,
  type RoomStageEntry,
} from "./roomLightPlacement";
import styles from "./roomLightEditor.module.css";

export interface RoomLightingDraft { lights: MansionDynamicLightV2[]; effects: MansionRoomEffectV1[]; blendMode: MansionLightBlendModeV1 }
export interface RoomLightTuneRequest { draft: RoomLightingDraft; sheet: RoomLightTuneSheetV1; pass: 1 | 2 }
export interface RoomLightTuneResponse { lights: MansionDynamicLightV2[]; blendMode: MansionLightBlendModeV1; tune?: unknown }
interface Props {
  room: { id: string; name: string };
  imageUrl: string | null;
  artStyle: "mosaic" | "illustrated";
  lights: readonly MansionDynamicLightV2[];
  /** Atmospheric effects for this room; older callers may omit them. */
  effects?: readonly MansionRoomEffectV1[];
  blendMode?: MansionLightBlendModeV1;
  theme: "light" | "dark";
  onClose: () => void;
  onSave: (draft: RoomLightingDraft) => Promise<void> | void;
  /** ONLINE only: detects the room's visible light sources and returns a fresh light set,
   * plus what each detection pass saw so a poor result can be reviewed. */
  onAutoPlace?: (draft: RoomLightingDraft) => Promise<{ lights: MansionDynamicLightV2[]; trace?: unknown }>;
  /** ONLINE only: judges a contact sheet of the lit room and returns bounded color,
   * intensity, and room-blend adjustments. Geometry is never changed. */
  onTune?: (args: RoomLightTuneRequest) => Promise<RoomLightTuneResponse>;
}

const KINDS = [
  { kind: "omni", name: "Lamp", detail: "A soft circular glow", icon: "◉" },
  { kind: "fire", name: "Fire", detail: "A warm, flickering source", icon: "△" },
  { kind: "directional", name: "Beam + dust", detail: "A window godray that lands on the floor", icon: "▱" },
  { kind: "neon", name: "Neon", detail: "A glowing line with movable ends", icon: "⌁" },
] as const;
const BLEND_LABELS: Record<MansionLightBlendModeV1, string> = {
  auto: "Automatic (Hard Light)", screen: "Screen", "plus-lighter": "Add", overlay: "Overlay", "soft-light": "Soft light",
  "hard-light": "Hard light", normal: "Normal", multiply: "Multiply",
};
const CONTEXT_MENU_WIDTH_PX = 210;
const EMPTY_CONTEXT_MENU_HEIGHT_PX = 185;
const LIGHT_CONTEXT_MENU_HEIGHT_PX = 245;
const HISTORY_LIMIT = 100;
/** Same-key edits inside this window extend the open undo step (one slider sweep, one arrow-key burst). */
const HISTORY_COALESCE_MS = 1000;

/** One undoable state of the draft. */
interface EditorSnapshot { lights: MansionDynamicLightV2[]; effects: MansionRoomEffectV1[]; blendMode: MansionLightBlendModeV1; selectedId: string | null }
type PlaceableKind = MansionDynamicLightV2["kind"] | MansionRoomEffectKindV1;
const kindInfo = (kind: string) => KINDS.find((entry) => entry.kind === kind) ?? ROOM_EFFECT_KINDS.find((entry) => entry.kind === kind);
/** Effects share the light blend when they are light, and only tint toward white when they are weather. */
const effectSampledColor = (kind: MansionRoomEffectKindV1, sampled: string): string =>
  kind === "snow" ? "#ffffff" : mansionNaturalLightTintV2(sampled, kind === "rain" || kind === "caustics" ? 0.6 : 0.85);
const CONTEXT_MENU_VIEWPORT_MARGIN_PX = 8;

/** A room-scoped draft. Native modal input isolation also protects the investigation underneath. */
export default function RoomLightEditorDialog(props: Props): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const roomImageRef = useRef<HTMLImageElement>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const [lights, setLights] = useState(() => structuredClone([...props.lights]));
  const [effects, setEffects] = useState(() => structuredClone([...(props.effects ?? [])]));
  // One blend for the whole room. A room that has never been lit starts on Hard Light.
  const [blendMode, setBlendMode] = useState<MansionLightBlendModeV1>(props.blendMode ?? MANSION_LIGHT_DEFAULT_BLEND_MODE_V1);
  const [selectedId, setSelectedId] = useState<string | null>(props.lights[0]?.id ?? null);
  const [preview, setPreview] = useState(false);
  const [lightsVisible, setLightsVisible] = useState(true);
  const [aspect, setAspect] = useState(16 / 9);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The blocking operation behind the fullscreen PRISM loader, if any. */
  const [work, setWork] = useState<{ kind: "save" | "auto-place" | "tune"; startedAt: number } | null>(null);
  const workToken = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samplingNotice, setSamplingNotice] = useState<string | null>(null);
  /** Placement picker: opened for one family at a time so lights and effects never share a menu. */
  const [picker, setPicker] = useState<{ point: LightPoint; family: "light" | "effect" } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; point: LightPoint; lightId?: string } | null>(null);
  const gesture = useRef<{ id: number; light: RoomStageEntry; start: LightPoint; endpoint?: number; recorded?: boolean } | null>(null);
  const entries: RoomStageEntry[] = [...lights, ...effects];
  const selected = entries.find((entry) => entry.id === selectedId);
  const history = useRef<{ past: EditorSnapshot[]; future: EditorSnapshot[]; lastKey: string | null; lastAt: number }>({ past: [], future: [], lastKey: null, lastAt: 0 });
  const clipboard = useRef<RoomStageEntry | null>(null);
  const [, setHistoryVersion] = useState(0);
  const [shortcutNotice, setShortcutNotice] = useState<string | null>(null);
  const [autoPlaceTrace, setAutoPlaceTrace] = useState<unknown>(null);
  const modifier = typeof navigator !== "undefined" && /Mac|iPhone|iPad/u.test(navigator.platform) ? "⌘" : "Ctrl+";
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;

  const snapshot = (): EditorSnapshot => ({ lights: structuredClone(lights), effects: structuredClone(effects), blendMode, selectedId });
  /** Captures the state before a change. Must run before the matching set-state call. */
  const record = (key: string, coalesceMs = 0) => {
    const entry = history.current; const now = performance.now();
    if (coalesceMs > 0 && entry.lastKey === key && now - entry.lastAt < coalesceMs) { entry.lastAt = now; return; }
    entry.past.push(snapshot()); if (entry.past.length > HISTORY_LIMIT) entry.past.shift();
    entry.future = []; entry.lastKey = key; entry.lastAt = now;
    setHistoryVersion((version) => version + 1);
  };
  const restore = (state: EditorSnapshot) => {
    setLights(structuredClone(state.lights)); setEffects(structuredClone(state.effects ?? [])); setBlendMode(state.blendMode); setSelectedId(state.selectedId); setMenu(null); setShortcutNotice(null);
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

  /** Adds an entry to whichever list owns its kind, honoring that list's cap. Returns false when full. */
  const addEntry = (entry: RoomStageEntry): boolean => {
    if (isRoomEffect(entry)) {
      if (effects.length >= MANSION_LAYOUT_V2_MAX_EFFECTS) return false;
      setEffects((current) => [...current, entry]);
    } else {
      if (lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS) return false;
      setLights((current) => [...current, entry]);
    }
    return true;
  };
  const capReached = (entry: RoomStageEntry): boolean => isRoomEffect(entry)
    ? effects.length >= MANSION_LAYOUT_V2_MAX_EFFECTS
    : lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS;
  /** `step` names the undo step for this entry; `null` records nothing (frames inside a drag already recorded at its start). */
  const updateEntry = (id: string, update: (entry: RoomStageEntry) => RoomStageEntry, step: string | null = "edit") => {
    if (step !== null) record(`${id}:${step}`, HISTORY_COALESCE_MS);
    if (effects.some((effect) => effect.id === id)) {
      setEffects((current) => current.map((effect) => effect.id === id ? update(effect) as MansionRoomEffectV1 : effect));
    } else {
      setLights((current) => current.map((light) => light.id === id ? update(light) as MansionDynamicLightV2 : light));
    }
  };
  const updateLight = (id: string, update: (light: MansionDynamicLightV2) => MansionDynamicLightV2, step: string | null = "edit") =>
    updateEntry(id, (entry) => isRoomEffect(entry) ? entry : update(entry), step);
  const updateEffect = (id: string, update: (effect: MansionRoomEffectV1) => MansionRoomEffectV1, step: string | null = "edit") =>
    updateEntry(id, (entry) => isRoomEffect(entry) ? update(entry) : entry, step);
  const remove = (id: string) => {
    record("delete");
    setLights((current) => current.filter((light) => light.id !== id));
    setEffects((current) => current.filter((effect) => effect.id !== id));
    setSelectedId(null); setMenu(null);
  };
  const duplicateLight = (id: string) => {
    const source = entries.find((entry) => entry.id === id);
    if (!source || capReached(source)) return;
    const light = cloneRoomLight(source, `light:${crypto.randomUUID()}`);
    record("clone");
    addEntry(light);
    setSelectedId(light.id);
    setMenu(null);
  };
  const copyLight = (id: string) => {
    const light = entries.find((entry) => entry.id === id);
    if (!light) return;
    clipboard.current = structuredClone(light); setMenu(null); setShortcutNotice(null);
  };
  const cutLight = (id: string) => { copyLight(id); remove(id); };
  /** Pastes at a point when given (context menu), otherwise offset from the last copy so repeated pastes cascade. */
  const pasteLight = (at?: LightPoint) => {
    const source = clipboard.current;
    setMenu(null);
    if (!source) { setShortcutNotice("Copy a light or effect first, then paste."); return; }
    if (capReached(source)) {
      setShortcutNotice(isRoomEffect(source)
        ? `Rooms hold at most ${MANSION_LAYOUT_V2_MAX_EFFECTS} effects. Delete one before pasting.`
        : `Rooms hold at most ${MANSION_LAYOUT_V2_MAX_LIGHTS} lights. Delete one before pasting.`);
      return;
    }
    let light = cloneRoomLight(source, `light:${crypto.randomUUID()}`);
    if (at) { const center = roomLightCenter(light); light = moveRoomLight(light, { x: at.x - center.x, y: at.y - center.y }); }
    clipboard.current = structuredClone(light);
    record("paste");
    addEntry(light); setSelectedId(light.id); setShortcutNotice(null);
  };
  /** Puts a full review dump on the clipboard: room, image, blend, every light, and the last auto-place trace. */
  const copyLightData = async () => {
    const image = roomImageRef.current;
    const text = formatRoomLightData({
      room: props.room, artStyle: props.artStyle, imageUrl: props.imageUrl,
      naturalWidth: image?.naturalWidth || null, naturalHeight: image?.naturalHeight || null,
      aspect, blendMode, lights, effects, trace: autoPlaceTrace,
    });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const scratch = document.createElement("textarea");
      scratch.value = text; scratch.setAttribute("readonly", ""); scratch.style.position = "fixed"; scratch.style.opacity = "0";
      document.body.append(scratch); scratch.select();
      const copied = document.execCommand("copy");
      scratch.remove();
      if (!copied) { setError("Light data could not be copied to the clipboard."); return; }
    }
    setError(null);
    setShortcutNotice(`Light data copied: ${lights.length} light${lights.length === 1 ? "" : "s"}, ${effects.length} effect${effects.length === 1 ? "" : "s"}${autoPlaceTrace ? ", with the last auto-place trace" : ""}. Paste it with a screenshot for review.`);
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
    const source = entries.find((entry) => entry.id === id);
    const rawSample = source && roomImageRef.current
      ? sampleRoomLightColorFromImage(roomImageRef.current, roomLightCenter(source))
      : null;
    // Daylight and weather stay mostly white; the sample only decides warm or cool.
    const sampledColor = rawSample && source
      ? isRoomEffect(source) ? effectSampledColor(source.kind, rawSample) : source.kind === "directional" ? naturalBeamColor(rawSample) : rawSample
      : null;
    setMenu(null);
    setSelectedId(id);
    setError(null);
    if (!sampledColor) {
      setSamplingNotice("PRISM could not sample this room image, so the light's existing color was preserved.");
      return;
    }
    updateEntry(id, (entry) => ({ ...entry, color: sampledColor }), "resample");
    setSamplingNotice(null);
  };
  const placeLight = (kind: PlaceableKind) => {
    if (!picker) return;
    const sampledColor = roomImageRef.current
      ? sampleRoomLightColorFromImage(roomImageRef.current, picker.point)
      : null;
    if (kind === "steam" || kind === "fog" || kind === "rain" || kind === "snow" || kind === "caustics") {
      const effect = createRoomEffect(props.room.id, kind, picker.point, `effect:${crypto.randomUUID()}`, sampledColor ?? undefined);
      record("place");
      if (!addEntry(effect)) return;
      setSelectedId(effect.id); setPicker(null); setError(null); setSamplingNotice(null);
      return;
    }
    const created = createRoomLight(
      props.room.id,
      kind,
      picker.point,
      `light:${crypto.randomUUID()}`,
      sampledColor ?? ROOM_LIGHT_DEFAULT_COLOR,
    );
    // A new beam inherits the room's sun so every window throws light the same way.
    const sun = created.kind === "directional" ? roomSunDirection(lights, aspect) : null;
    const light = sun && created.kind === "directional" ? aimGodray(created, sun, aspect) : created;
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
  const beginDrag = (event: PointerEvent<HTMLButtonElement>, light: RoomStageEntry, endpoint?: number) => {
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
    if (isRoomEffect(light) && active.endpoint !== undefined) {
      updateEffect(light.id, () => active.endpoint === 2
        ? setGodrayLanding(light, point, aspect)
        : setGodrayAperturePoint(light, active.endpoint === 0 ? 0 : 1, point, aspect), null);
    } else if (light.kind === "neon" && active.endpoint !== undefined) {
      updateLight(light.id, () => ({ ...light, geometry: { ...light.geometry,
        points: light.geometry.points.map((old, index) => index === active.endpoint ? point : old) } }), null);
    } else if (light.kind === "directional" && active.endpoint !== undefined) {
      if (active.endpoint === 2) {
        // Aiming one beam turns every beam that follows the room's sun with it.
        const aimed = setGodrayLanding(light, point, aspect);
        const sun = light.freeDirection ? null : godrayRoomLightDescription(aimed, aspect).direction;
        setLights((current) => current.map((entry) => entry.id === light.id
          ? aimed
          : sun && entry.kind === "directional" && !entry.freeDirection ? aimGodray(entry, sun, aspect) : entry));
      } else {
        updateLight(light.id, () => setGodrayAperturePoint(light, active.endpoint === 0 ? 0 : 1, point, aspect), null);
      }
    } else updateEntry(light.id, () => moveRoomLight(light, { x: point.x - active.start.x, y: point.y - active.start.y }), null);
  };
  /** Runs one blocking operation behind the fullscreen PRISM loader. A cancelled
   * run leaves the draft untouched: its late result is dropped, never applied. */
  const run = async (kind: "save" | "auto-place" | "tune", operation: (cancelled: () => boolean) => Promise<void> | void) => {
    const token = ++workToken.current;
    const cancelled = () => workToken.current !== token;
    setBusy(true); setWork({ kind, startedAt: Date.now() }); setError(null); setMenu(null);
    try { await operation(cancelled); }
    catch (cause) { if (!cancelled()) setError(cause instanceof Error ? cause.message : kind === "save" ? "Could not save these lights." : "Could not auto-place lights."); }
    finally { if (!cancelled()) { setBusy(false); setWork(null); } }
  };
  const cancelWork = () => {
    workToken.current += 1;
    setBusy(false); setWork(null);
    setShortcutNotice(work?.kind === "tune" ? "Tuning cancelled. Your lights are unchanged." : "Auto-place cancelled. Your lights are unchanged.");
  };
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const range = (label: string, value: number, min: number, max: number, step: number, change: (value: number) => void, format: (value: number) => string = percent) => (
    <label>{label}<span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => change(Number(event.currentTarget.value))} /><output aria-hidden="true">{format(value)}</output></span></label>
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
          <button type="button" onClick={() => void copyLightData()} title="Copy every light's data and the last auto-place trace for review">Copy light data</button>
          <div className={styles.toolbarGroup} role="group" aria-label="History">
            <button type="button" disabled={!canUndo || preview} onClick={undo} title={`Undo (${modifier}Z)`}>Undo</button>
            <button type="button" disabled={!canRedo || preview} onClick={redo} title={`Redo (⇧${modifier}Z)`}>Redo</button>
          </div>
          <button type="button" onClick={props.onClose}>Cancel</button>
          <button type="button" className={styles.primary} onClick={() => void run("save", () => props.onSave({ lights, effects, blendMode }))}>Save lights</button>
        </header>
        <div className={styles.workspace} data-preview={preview}>
          <div className={styles.sceneColumn}>
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
              {lightsVisible ? <DebateMysteryRoomCinematographyLayer room={props.room} lights={lights} effects={effects}
                blendMode={blendMode} artStyle={props.artStyle} sourceAspectRatio={aspect}
                templateLightingAligned={false} reducedMotion={reducedMotion} blurred={false} /> : null}
              {!preview ? entries.map((light, index) => {
                const point = roomLightCenter(light);
                const effect = isRoomEffect(light);
                const badge = effect ? `E${index - lights.length + 1}` : `${index + 1}`;
                return <button key={light.id} type="button" className={styles.marker} data-light-id={light.id} data-effect={effect ? "true" : undefined}
                  data-selected={selectedId === light.id} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, "--light-color": light.color } as CSSProperties}
                  aria-label={`Move ${kindInfo(light.kind)?.name} ${badge}`} title={`${light.kind} ${badge} · drag to move · right-click to resample, clone, or delete`}
                  onPointerDown={(event) => beginDrag(event, light)} onPointerMove={drag}
                  onPointerUp={endDrag} onPointerCancel={endDrag}
                  onClick={(event) => { event.stopPropagation(); setSelectedId(light.id); setMenu(null); }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 0.05 : 0.005;
                    const deltas: Record<string, LightPoint> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
                    if (deltas[event.key]) { event.preventDefault(); updateEntry(light.id, (value) => moveRoomLight(value, deltas[event.key]!), "nudge"); }
                    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(light.id); }
                  }}>{kindInfo(light.kind)?.icon}<small>{badge}</small></button>;
              }) : null}
              {!preview && selected?.kind === "neon" ? selected.geometry.points.map((point, index) => (
                <button key={`point-${index}`} type="button" className={styles.endpoint} aria-label={`Move neon point ${index + 1}`}
                  data-light-id={selected.id} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  onPointerDown={(event) => beginDrag(event, selected, index)} onPointerMove={drag}
                  onPointerUp={endDrag} onPointerCancel={endDrag} />
              )) : null}
              {!preview && selected && (selected.kind === "directional" || isRoomEffect(selected)) ? (() => {
                // The godray's own light can be faint against bright art, so the selected ray
                // wears a guide: its outline, both side rays, and its two edges told apart.
                const corners = directionalRoomLightPoints(selected, aspect);
                const { origin, landing } = mansionGodrayEdgesV2(corners);
                const at = (point: LightPoint) => ({ x: point.x * 100, y: point.y * 100 });
                const [o0, o1, l0, l1] = [at(origin.start), at(origin.end), at(landing.start), at(landing.end)];
                return <><svg className={styles.godrayGuide} data-dragging={dragging ? "true" : undefined} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polygon points={[o0, o1, l1, l0].map((point) => `${point.x},${point.y}`).join(" ")} vectorEffect="non-scaling-stroke" />
                  <line className={styles.godrayGuideRay} x1={o0.x} y1={o0.y} x2={l0.x} y2={l0.y} vectorEffect="non-scaling-stroke" />
                  <line className={styles.godrayGuideRay} x1={o1.x} y1={o1.y} x2={l1.x} y2={l1.y} vectorEffect="non-scaling-stroke" />
                  <line className={styles.godrayGuideWindow} x1={o0.x} y1={o0.y} x2={o1.x} y2={o1.y} vectorEffect="non-scaling-stroke" />
                  <line className={styles.godrayGuideFloor} x1={l0.x} y1={l0.y} x2={l1.x} y2={l1.y} vectorEffect="non-scaling-stroke" />
                </svg>
                {/* The floor edge's ends carry the number of the window corner each one meets. */}
                <span className={styles.godrayEdgeLabel} style={{ left: `${l0.x}%`, top: `${l0.y}%` }} aria-hidden="true">1</span>
                <span className={styles.godrayEdgeLabel} style={{ left: `${l1.x}%`, top: `${l1.y}%` }} aria-hidden="true">2</span>
                </>;
              })() : null}
              {!preview && selected && (selected.kind === "directional" || isRoomEffect(selected)) ? (() => {
                // Three handles: two on the source edge, one where it ends. The far edge is
                // derived, so a beam's sides always leave the window in parallel and an
                // effect's flow always follows one direction.
                const described = godrayRoomLightDescription(selected, aspect);
                const source = isRoomEffect(selected) ? "source" : "window";
                const handles = [
                  { key: "window-0", role: "window", tag: "1", label: `Move ${source} corner 1`, point: described.aperture[0], index: 0 },
                  { key: "window-1", role: "window", tag: "2", label: `Move ${source} corner 2`, point: described.aperture[1], index: 1 },
                  { key: "landing", role: "landing", tag: undefined, label: isRoomEffect(selected) ? "Drag where the effect ends" : "Aim where the ray lands", point: described.landing, index: 2 },
                ] as const;
                return handles.map((handle) => (
                  <button key={handle.key} type="button" className={styles.endpoint} data-godray-corner={handle.role} data-godray-label={handle.tag} aria-label={handle.label}
                    data-light-id={selected.id} style={{ left: `${handle.point.x * 100}%`, top: `${handle.point.y * 100}%` }}
                    onPointerDown={(event) => beginDrag(event, selected, handle.index)} onPointerMove={drag}
                    onPointerUp={endDrag} onPointerCancel={endDrag} />
                ));
              })() : null}
            </div>
          </div>
          {!preview ? <section className={styles.tray} aria-label="Selected marker">
            {selected ? <section className={`${styles.section} ${styles.properties}`} aria-label={isRoomEffect(selected) ? "Selected effect" : "Selected light"}>
              <header><strong>{isRoomEffect(selected) ? "Selected effect" : "Selected light"}</strong><small>{kindInfo(selected.kind)?.name} · {isRoomEffect(selected) ? `E${effects.findIndex((effect) => effect.id === selected.id) + 1}` : lights.findIndex((light) => light.id === selected.id) + 1}</small></header>
              <label>Color<input type="color" value={/^#[0-9a-f]{6}$/i.test(selected.color) ? selected.color : "#ffb067"} onChange={(event) => { const color = event.currentTarget.value; updateEntry(selected.id, (entry) => ({ ...entry, color }), "color"); }} /></label>
              {range("Intensity", selected.intensity, 0, 1, 0.01, (intensity) => updateEntry(selected.id, (entry) => ({ ...entry, intensity }), "intensity"))}
              {isRoomEffect(selected) ? <>
                <small>{kindInfo(selected.kind)?.detail}. Purple handles 1 and 2 mark the source edge; drag the blue handle to set where it ends. Spread widens the far edge.</small>
                {range("Spread", Math.max(0, godrayRoomLightDescription(selected, aspect).spread), 0, 1.5, 0.01, (spread) => updateEffect(selected.id, (effect) => setGodraySpread(effect, spread, aspect), "spread"), (value) => `${Math.round(value * 100)}%`)}
              </> : null}
              {selected.kind === "omni" || selected.kind === "fire" ? range("Radius", selected.geometry.radius, 0.01, 1, 0.005, (radius) => updateLight(selected.id, (light) => {
                if (light.kind === "omni") return { ...light, geometry: { ...light.geometry, radius } };
                if (light.kind === "fire") return { ...light, geometry: { ...light.geometry, radius } };
                return light;
              }, "radius")) : null}
              {selected.kind === "fire" ? range("Rotation", selected.geometry.rotation, -360, 360, 1, (rotation) => updateLight(selected.id, (light) => light.kind === "fire" ? { ...light, geometry: { ...light.geometry, rotation } } : light, "rotation"), (value) => `${Math.round(value)}°`) : null}
              {selected.kind === "directional" ? <>
                <small>Purple handles 1 and 2 sit on the window edge, at whatever angle the frame shows; the floor edge ends with the same numbers show where each corner lands. Drag the blue handle to aim the ray. Beams that follow the room's sun turn together.</small>
                {range("Spread", Math.max(0, godrayRoomLightDescription(selected, aspect).spread), 0, 1, 0.01, (spread) => updateLight(selected.id, (light) => light.kind === "directional" ? setGodraySpread(light, spread, aspect) : light, "spread"))}
                <label>Follows room sun<input type="checkbox" checked={!selected.freeDirection} onChange={(event) => {
                  const follows = event.currentTarget.checked;
                  updateLight(selected.id, (light) => {
                    if (light.kind !== "directional") return light;
                    const { freeDirection: _dropped, ...rest } = light;
                    const next = follows ? rest : { ...rest, freeDirection: true };
                    const sun = follows ? roomSunDirection(lights, aspect, light.id) : null;
                    return sun ? aimGodray(next, sun, aspect) : next;
                  }, "sun");
                }} /></label>
                <label>Dust<input type="checkbox" checked={selected.dust} onChange={(event) => { const dust = event.currentTarget.checked; updateLight(selected.id, (light) => light.kind === "directional" ? { ...light, dust } : light, "dust"); }} /></label>
              </> : null}
              {selected.kind === "fire" ? <label>Flicker<input type="checkbox" checked={selected.animation === "flicker"} onChange={(event) => { const animation = event.currentTarget.checked ? "flicker" : "steady"; updateLight(selected.id, (light) => light.kind === "fire" ? { ...light, animation } : light, "flicker"); }} /></label> : null}
              {selected.kind === "neon" ? range("Stroke width", selected.geometry.width, 0.005, 0.25, 0.005, (width) => updateLight(selected.id, (light) => light.kind === "neon" ? { ...light, geometry: { ...light.geometry, width } } : light, "stroke")) : null}
              <button type="button" className={styles.danger} onClick={() => remove(selected.id)}>{isRoomEffect(selected) ? "Delete effect" : "Delete light"}</button>
            </section> : <p className={styles.hint}>{entries.length ? "Select a marker on the room to adjust it here." : "Place a light or an effect, then adjust it here."}</p>}
          </section> : null}
          </div>
          {!preview ? <aside className={styles.inspector}>
            <section className={styles.section} aria-label="Lights">
              <header><strong>Lights</strong><small>{lights.length} of {MANSION_LAYOUT_V2_MAX_LIGHTS}</small></header>
              <button type="button" className={styles.place} disabled={!props.imageUrl || lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => setPicker({ point: { x: 0.5, y: 0.5 }, family: "light" })}>+ Place light</button>
              {lights.length ? <div className={styles.lightList}>{lights.map((light, index) => {
                const kind = KINDS.find((entry) => entry.kind === light.kind);
                return <button key={light.id} type="button" aria-pressed={selectedId === light.id} style={{ "--light-color": light.color } as CSSProperties} onClick={() => setSelectedId(light.id)}>
                  <span aria-hidden="true">{kind?.icon}</span><strong>{kind?.name}</strong><small>{index + 1}</small>
                </button>;
              })}</div> : <p className={styles.hint}>Place the first light, or right-click the art where one belongs.</p>}
              <small className={styles.tips}>Drag a marker to move it. Right-click the room to place a light with a sampled local color, or a marker to resample, clone, or delete it. {modifier}C copies the selected light, {modifier}V pastes, {modifier}X cuts, {modifier}Z undoes.</small>
            </section>
            <section className={styles.section} aria-label="Effects">
              <header><strong>Effects</strong><small>{effects.length} of {MANSION_LAYOUT_V2_MAX_EFFECTS}</small></header>
              <button type="button" className={styles.place} disabled={!props.imageUrl || effects.length >= MANSION_LAYOUT_V2_MAX_EFFECTS} onClick={() => setPicker({ point: { x: 0.5, y: 0.5 }, family: "effect" })}>+ Place effect</button>
              {effects.length ? <div className={styles.lightList}>{effects.map((effect, index) => {
                const kind = kindInfo(effect.kind);
                return <button key={effect.id} type="button" aria-pressed={selectedId === effect.id} style={{ "--light-color": effect.color } as CSSProperties} onClick={() => setSelectedId(effect.id)}>
                  <span aria-hidden="true">{kind?.icon}</span><strong>{kind?.name}</strong><small>E{index + 1}</small>
                </button>;
              })}</div> : <p className={styles.hint}>Steam, fog, rain, snow, and caustics are placed like a beam: a source edge and where it ends.</p>}
            </section>
            {props.onAutoPlace ? <section className={`${styles.section} ${styles.autoPlace}`} aria-label="Auto-place lights">
              <header><strong>Auto-place</strong><small className={styles.online}>ONLINE</small></header>
              <button type="button" className={styles.place} disabled={!props.imageUrl} onClick={() => void run("auto-place", async (cancelled) => {
                const placed = await props.onAutoPlace!({ lights, effects, blendMode });
                if (cancelled()) return;
                record("auto-place");
                setAutoPlaceTrace(placed.trace ?? null);
                setLights(placed.lights); setSelectedId(placed.lights[0]?.id ?? null);
              })}>Auto-place lights</button>
              <small>PRISM reads the room art for lit fireplaces, lamps, windows with light coming in, and neon, then adds, moves, or removes lights to match.</small>
              {props.onTune ? <>
                <button type="button" className={styles.place} disabled={!props.imageUrl || lights.length === 0} onClick={() => void run("tune", async (cancelled) => {
                  const plate = roomImageRef.current; const stage = stageRef.current;
                  if (!plate || !stage || !plate.naturalWidth) throw new Error("The room art has not finished loading.");
                  // Pass 1: every shortlisted blend on one sheet; the judge picks one and reads each light.
                  const first = await props.onTune!({ draft: { lights, effects, blendMode }, pass: 1, sheet: composeRoomLightTuneSheet({
                    plate, stage, lights, candidates: ROOM_LIGHT_TUNE_BLEND_SHORTLIST_V1.map((blend, index) => ({ label: "ABCD"[index]!, blend })),
                  }) });
                  if (cancelled()) return;
                  record("tune");
                  setAutoPlaceTrace(first.tune ?? null);
                  setLights(first.lights); setBlendMode(first.blendMode);
                  // Let the layer redraw with the applied values before the confirmation pass.
                  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
                  if (cancelled()) return;
                  const second = await props.onTune!({ draft: { lights: first.lights, effects, blendMode: first.blendMode }, pass: 2, sheet: composeRoomLightTuneSheet({
                    plate, stage, lights: first.lights, candidates: [{ label: "A", blend: first.blendMode }],
                  }) });
                  if (cancelled()) return;
                  setAutoPlaceTrace(second.tune ?? first.tune ?? null);
                  setLights(second.lights); setBlendMode(second.blendMode);
                })}>Tune with PRISM</button>
                <small>Place the geometry, then let PRISM study the lit room and set each light's color and intensity plus the room blend. Markers never move; every value stays editable.</small>
              </> : null}
            </section> : null}
          </aside> : null}
        </div>
      </div>
      {menu ? <div className={styles.contextMenu} role="menu" style={{ left: menu.x, top: menu.y }}>
        {menu.lightId ? <>
          <button type="button" role="menuitem" autoFocus onClick={() => resampleLightColor(menu.lightId!)}>Resample color</button>
          <button type="button" role="menuitem" disabled={(() => { const target = entries.find((entry) => entry.id === menu.lightId); return !target || capReached(target); })()} onClick={() => duplicateLight(menu.lightId!)}>Clone light</button>
          <button type="button" role="menuitem" onClick={() => copyLight(menu.lightId!)}>Copy <small>{modifier}C</small></button>
          <button type="button" role="menuitem" onClick={() => cutLight(menu.lightId!)}>Cut <small>{modifier}X</small></button>
          <button type="button" role="menuitem" onClick={() => remove(menu.lightId!)}>Delete</button>
        </> : <>
          <button type="button" role="menuitem" autoFocus disabled={lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => { setPicker({ point: menu.point, family: "light" }); setMenu(null); }}>Place light…</button>
          <button type="button" role="menuitem" disabled={effects.length >= MANSION_LAYOUT_V2_MAX_EFFECTS} onClick={() => { setPicker({ point: menu.point, family: "effect" }); setMenu(null); }}>Place effect…</button>
          <button type="button" role="menuitem" disabled={!clipboard.current || capReached(clipboard.current)} onClick={() => pasteLight(menu.point)}>Paste here <small>{modifier}V</small></button>
        </>}
      </div> : null}
      {picker ? <div className={styles.pickerScrim}><section className={styles.picker} role="dialog" aria-modal="true" aria-labelledby="light-kind-title">
        <header><h3 id="light-kind-title">{picker.family === "effect" ? "Place effect" : "Place light"}</h3><button ref={pickerRef} type="button" onClick={() => setPicker(null)}>Cancel</button></header>
        {picker.family === "light" ? KINDS.map((kind) => <button key={kind.kind} type="button" disabled={lights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => placeLight(kind.kind)}>
          <span>{kind.icon}</span><strong>{kind.name}</strong><small>{kind.detail}</small>
        </button>) : ROOM_EFFECT_KINDS.map((kind) => <button key={kind.kind} type="button" disabled={effects.length >= MANSION_LAYOUT_V2_MAX_EFFECTS} onClick={() => placeLight(kind.kind)}>
          <span>{kind.icon}</span><strong>{kind.name}</strong><small>{kind.detail}</small>
        </button>)}
      </section></div> : null}
      <PrismBlockingLoader
        open={work !== null}
        portalTarget={dialogRef.current}
        placement="fullscreen"
        theme={props.theme}
        {...(work?.kind === "auto-place"
          ? { operation: "refraction" as const, onCancel: cancelWork, cancelLabel: "Cancel auto-place", cancelConfirmTitle: "Cancel auto-place?", cancelConfirmDetail: "Your current lights stay exactly as they are." }
          : work?.kind === "tune"
            ? { operation: "refraction" as const, onCancel: cancelWork, cancelLabel: "Cancel tuning", cancelConfirmTitle: "Cancel tuning?", cancelConfirmDetail: "Your current lights stay exactly as they are." }
            : { operation: "preparation" as const })}
        operationId={work?.startedAt}
        eyebrow="PRISM / Lights & FX"
        title={work?.kind === "auto-place" ? "Reading the room for light" : work?.kind === "tune" ? "Studying the lit room" : "Saving these lights"}
        detail={work?.kind === "auto-place"
          ? "PRISM is studying the room art for lit fireplaces, lamps, windows with light coming in, and neon, then placing lights to match."
          : work?.kind === "tune"
            ? "PRISM is comparing blends and checking each light against the room, then setting color, intensity, and the room blend. Your markers stay exactly where you placed them."
            : `PRISM is writing this lighting into ${props.room.name}.`}
        stepLabel={work?.kind === "auto-place" ? "Detecting light sources" : work?.kind === "tune" ? "Judging the composite" : "Saving lights"}
        startedAt={work?.startedAt ?? null}
        footer={work?.kind === "auto-place" ? "Your current lights stay until the new set arrives." : work?.kind === "tune" ? "Only color, intensity, and blend change. Undo reverts the whole pass." : "Keep this window open for a moment."}
      />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!error && (shortcutNotice ?? samplingNotice) ? <p className={styles.notice} role="status">{shortcutNotice ?? samplingNotice}</p> : null}
    </dialog>, document.body,
  );
}
