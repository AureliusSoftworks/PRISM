"use client";

import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DEBATE_MYSTERY_MANSION_EDITOR_GRID_COLUMNS_V1,
  DEBATE_MYSTERY_MANSION_EDITOR_GRID_ROWS_V1,
  DEBATE_MYSTERY_MANSION_EDITOR_MAX_FLOORS_V1,
  DEBATE_MYSTERY_MANSION_EDITOR_MAX_ROOMS_V1,
  DEBATE_MYSTERY_MANSION_EDITOR_MIN_ROOMS_V1,
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  resolveDebateMysteryMansionExteriorScaleClassV1,
  validateDebateMysteryMansionEditorTopologyV1,
  type DebateMysteryMansionBundleRoomV1,
  type DebateMysteryMansionBundleSummaryV1,
} from "@localai/shared";
import {
  installedMansionExteriorPreviewV1,
  resolveInstalledMansionPresentationV1,
} from "./installedMansionLibrary";
import WhodunnitSetupDialog from "./WhodunnitSetupDialog";
import styles from "./debateMystery.module.css";

interface MansionEditorDialogProps {
  theme: "light" | "dark";
  mansion: DebateMysteryMansionBundleSummaryV1;
  busy: boolean;
  onClose: () => void;
  onSave: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    rooms: DebateMysteryMansionBundleRoomV1[],
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
}

interface RoomDragV1 {
  id: string;
  offsetX: number;
  offsetY: number;
}

function cloneRooms(
  rooms: readonly DebateMysteryMansionBundleRoomV1[],
): DebateMysteryMansionBundleRoomV1[] {
  return rooms.map((room) => ({ ...room, neighborIds: [...room.neighborIds] }));
}

function roomsOverlap(
  first: Pick<DebateMysteryMansionBundleRoomV1, "x" | "y" | "width" | "height">,
  second: Pick<DebateMysteryMansionBundleRoomV1, "x" | "y" | "width" | "height">,
): boolean {
  return first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
}

function availableRoomPosition(
  rooms: readonly DebateMysteryMansionBundleRoomV1[],
  floor: number,
): { x: number; y: number } {
  const floorRooms = rooms.filter((room) => room.floor === floor);
  for (let y = 0; y <= DEBATE_MYSTERY_MANSION_EDITOR_GRID_ROWS_V1 - 2; y += 1) {
    for (let x = 0; x <= DEBATE_MYSTERY_MANSION_EDITOR_GRID_COLUMNS_V1 - 3; x += 1) {
      const candidate = { x, y, width: 3, height: 2 };
      if (!floorRooms.some((room) => roomsOverlap(candidate, room))) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

export default function MansionEditorDialog({
  theme,
  mansion,
  busy,
  onClose,
  onSave,
}: MansionEditorDialogProps): JSX.Element {
  const [rooms, setRooms] = useState(() => cloneRooms(mansion.rooms));
  const [floorCount, setFloorCount] = useState(() => Math.max(1, mansion.floors));
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [selectedRoomId, setSelectedRoomId] = useState(
    () => mansion.rooms.find((room) => room.floor === 1)?.id ?? mansion.rooms[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<RoomDragV1 | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const presentation = resolveInstalledMansionPresentationV1(mansion);
  const draftScaleClass = resolveDebateMysteryMansionExteriorScaleClassV1({
    floors: Math.max(1, ...rooms.map((room) => room.floor)),
    totalRooms: rooms.length,
  });
  const exterior = installedMansionExteriorPreviewV1({
    mansion,
    assetId: presentation.thumbnailAssetId,
    scaleClass: draftScaleClass,
  });
  const validationErrors = useMemo(
    () => validateDebateMysteryMansionEditorTopologyV1(rooms, mansion.suspectCount),
    [mansion.suspectCount, rooms],
  );

  const updateRoom = (
    roomId: string,
    update: Partial<DebateMysteryMansionBundleRoomV1>,
  ): void => {
    setRooms((current) => current.map((room) => room.id === roomId
      ? { ...room, ...update }
      : room));
  };

  const moveRoom = (roomId: string, x: number, y: number): void => {
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!room) return;
    updateRoom(roomId, {
      x: Math.max(0, Math.min(DEBATE_MYSTERY_MANSION_EDITOR_GRID_COLUMNS_V1 - room.width, x)),
      y: Math.max(0, Math.min(DEBATE_MYSTERY_MANSION_EDITOR_GRID_ROWS_V1 - room.height, y)),
    });
  };

  const beginRoomDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    room: DebateMysteryMansionBundleRoomV1,
  ): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const cellWidth = bounds.width / DEBATE_MYSTERY_MANSION_EDITOR_GRID_COLUMNS_V1;
    const cellHeight = bounds.height / DEBATE_MYSTERY_MANSION_EDITOR_GRID_ROWS_V1;
    setSelectedRoomId(room.id);
    setDrag({
      id: room.id,
      offsetX: (event.clientX - bounds.left) / cellWidth - room.x,
      offsetY: (event.clientY - bounds.top) / cellHeight - room.y,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueRoomDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!drag || drag.id !== event.currentTarget.dataset.roomId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const cellWidth = bounds.width / DEBATE_MYSTERY_MANSION_EDITOR_GRID_COLUMNS_V1;
    const cellHeight = bounds.height / DEBATE_MYSTERY_MANSION_EDITOR_GRID_ROWS_V1;
    moveRoom(
      drag.id,
      Math.round((event.clientX - bounds.left) / cellWidth - drag.offsetX),
      Math.round((event.clientY - bounds.top) / cellHeight - drag.offsetY),
    );
  };

  const toggleConnection = (otherId: string): void => {
    if (!selectedRoom) return;
    const connected = selectedRoom.neighborIds.includes(otherId);
    setRooms((current) => current.map((room) => {
      if (room.id === selectedRoom.id) {
        return {
          ...room,
          neighborIds: connected
            ? room.neighborIds.filter((id) => id !== otherId)
            : [...room.neighborIds, otherId],
        };
      }
      if (room.id === otherId) {
        return {
          ...room,
          neighborIds: connected
            ? room.neighborIds.filter((id) => id !== selectedRoom.id)
            : [...room.neighborIds, selectedRoom.id],
        };
      }
      return room;
    }));
  };

  const addRoom = (): void => {
    if (rooms.length >= DEBATE_MYSTERY_MANSION_EDITOR_MAX_ROOMS_V1) return;
    const hasFoyer = rooms.some((room) => room.templateId === "foyer");
    const template = hasFoyer
      ? DEBATE_MYSTERY_ROOM_TEMPLATES.find((candidate) => candidate.id === "parlor")!
      : DEBATE_MYSTERY_ROOM_TEMPLATES.find((candidate) => candidate.id === "foyer")!;
    const position = availableRoomPosition(rooms, selectedFloor);
    const id = `room-${crypto.randomUUID()}`;
    const room: DebateMysteryMansionBundleRoomV1 = {
      id,
      templateId: template.id,
      name: template.name,
      floor: selectedFloor,
      x: position.x,
      y: position.y,
      width: 3,
      height: 2,
      neighborIds: [],
      assignedSuspectSeatId: null,
      emoji: template.emoji,
      imageId: null,
      bundledAssetPath: template.bundledAssetPath ?? null,
    };
    setRooms((current) => [...current, room]);
    setSelectedRoomId(id);
  };

  const removeSelectedRoom = (): void => {
    if (!selectedRoom || rooms.length <= DEBATE_MYSTERY_MANSION_EDITOR_MIN_ROOMS_V1) return;
    setRooms((current) => current
      .filter((room) => room.id !== selectedRoom.id)
      .map((room) => ({
        ...room,
        neighborIds: room.neighborIds.filter((id) => id !== selectedRoom.id),
      })));
    setSelectedRoomId(rooms.find((room) => room.id !== selectedRoom.id)?.id ?? "");
  };

  const save = async (): Promise<void> => {
    if (validationErrors.length > 0) return;
    setSaving(true);
    const saved = await onSave(mansion, rooms);
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <WhodunnitSetupDialog
      open
      id="mansion-topology-editor"
      theme={theme}
      eyebrow="Mansion Editor"
      title={presentation.title}
      description={`Editing a local derivative of ${mansion.derivation?.sourceTitle ?? mansion.name}. The source remains unchanged.`}
      size="screen"
      busy={busy || saving}
      onClose={onClose}
    >
      <section className={styles.mansionTopologyEditor} data-tutorial-target="whodunnit-mansion-editor">
        <aside className={styles.mansionEditorExterior}>
          <div style={{ backgroundImage: `url("${exterior.url}")` }} role="img" aria-label={`${presentation.title} exterior`} />
          <span data-scale={draftScaleClass}>{draftScaleClass} silhouette</span>
          {exterior.stale ? (
            <p><strong>Exterior needs review</strong>The retained custom cover was accepted for a different mansion scale. It will not be overwritten.</p>
          ) : (
            <p><strong>{exterior.switchesWithTopology ? "Included family" : "Accepted exterior"}</strong>{exterior.switchesWithTopology ? "The cover follows the edited scale automatically." : "This protected cover stays with the derivative."}</p>
          )}
        </aside>

        <div className={styles.mansionEditorWorkspace}>
          <header className={styles.mansionEditorFloorBar}>
            <nav aria-label="Mansion floors">
              {Array.from({ length: floorCount }, (_, index) => index + 1).map((floor) => (
                <button key={floor} type="button" aria-pressed={selectedFloor === floor} onClick={() => setSelectedFloor(floor)}>
                  Floor {floor}<small>{rooms.filter((room) => room.floor === floor).length} rooms</small>
                </button>
              ))}
            </nav>
            <div>
              <button type="button" disabled={floorCount >= DEBATE_MYSTERY_MANSION_EDITOR_MAX_FLOORS_V1} onClick={() => { const next = floorCount + 1; setFloorCount(next); setSelectedFloor(next); }}>+ Add floor</button>
              <button type="button" disabled={floorCount <= 2 || rooms.some((room) => room.floor === floorCount)} onClick={() => { const next = floorCount - 1; setFloorCount(next); setSelectedFloor(Math.min(selectedFloor, next)); }}>Remove empty top floor</button>
            </div>
          </header>

          <div className={styles.mansionEditorCanvasShell}>
            <div ref={canvasRef} className={styles.mansionEditorCanvas} aria-label={`Floor ${selectedFloor} plan`}>
              {rooms.filter((room) => room.floor === selectedFloor).map((room) => (
                <button
                  key={room.id}
                  type="button"
                  data-room-id={room.id}
                  data-selected={room.id === selectedRoomId ? "true" : undefined}
                  style={{
                    gridColumn: `${room.x + 1} / span ${room.width}`,
                    gridRow: `${room.y + 1} / span ${room.height}`,
                  } as CSSProperties}
                  onClick={() => setSelectedRoomId(room.id)}
                  onPointerDown={(event) => beginRoomDrag(event, room)}
                  onPointerMove={continueRoomDrag}
                  onPointerUp={() => setDrag(null)}
                  onPointerCancel={() => setDrag(null)}
                >
                  <span aria-hidden="true">{room.emoji}</span>
                  <strong>{room.name}</strong>
                  <small>{room.neighborIds.length} connection{room.neighborIds.length === 1 ? "" : "s"}</small>
                </button>
              ))}
            </div>
            <div className={styles.mansionEditorCanvasActions}>
              <span>Drag rooms to the grid. Connections may cross floors as stairs or portals.</span>
              <button type="button" disabled={rooms.length >= DEBATE_MYSTERY_MANSION_EDITOR_MAX_ROOMS_V1} onClick={addRoom}>+ Add room</button>
            </div>
          </div>
        </div>

        <aside className={styles.mansionEditorInspector}>
          {selectedRoom ? (
            <>
              <header><span aria-hidden="true">{selectedRoom.emoji}</span><div><small>Selected room</small><strong>{selectedRoom.name}</strong></div></header>
              <label>Room type
                <select
                  value={selectedRoom.templateId}
                  onChange={(event) => {
                    const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((candidate) => candidate.id === event.currentTarget.value);
                    if (!template) return;
                    updateRoom(selectedRoom.id, {
                      templateId: template.id,
                      name: template.name,
                      emoji: template.emoji,
                      imageId: null,
                      bundledAssetPath: template.bundledAssetPath ?? null,
                    });
                  }}
                >
                  {!DEBATE_MYSTERY_ROOM_TEMPLATES.some((template) => template.id === selectedRoom.templateId) ? <option value={selectedRoom.templateId}>{selectedRoom.name} · imported type</option> : null}
                  {DEBATE_MYSTERY_ROOM_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              <label>Room name<input value={selectedRoom.name} maxLength={80} onChange={(event) => updateRoom(selectedRoom.id, { name: event.currentTarget.value })} /></label>
              <label>Floor
                <select value={selectedRoom.floor} disabled={selectedRoom.templateId === "foyer"} onChange={(event) => { const floor = Number(event.currentTarget.value); updateRoom(selectedRoom.id, { floor }); setSelectedFloor(floor); }}>
                  {Array.from({ length: floorCount }, (_, index) => index + 1).map((floor) => <option key={floor} value={floor}>Floor {floor}</option>)}
                </select>
              </label>

              <fieldset className={styles.mansionEditorGeometry}>
                <legend>Position and size</legend>
                <div><span>Horizontal</span><button type="button" onClick={() => moveRoom(selectedRoom.id, selectedRoom.x - 1, selectedRoom.y)}>←</button><output>{selectedRoom.x + 1}</output><button type="button" onClick={() => moveRoom(selectedRoom.id, selectedRoom.x + 1, selectedRoom.y)}>→</button></div>
                <div><span>Vertical</span><button type="button" onClick={() => moveRoom(selectedRoom.id, selectedRoom.x, selectedRoom.y - 1)}>↑</button><output>{selectedRoom.y + 1}</output><button type="button" onClick={() => moveRoom(selectedRoom.id, selectedRoom.x, selectedRoom.y + 1)}>↓</button></div>
                <div><span>Width</span><button type="button" disabled={selectedRoom.width <= 1} onClick={() => updateRoom(selectedRoom.id, { width: selectedRoom.width - 1 })}>−</button><output>{selectedRoom.width}</output><button type="button" disabled={selectedRoom.x + selectedRoom.width >= DEBATE_MYSTERY_MANSION_EDITOR_GRID_COLUMNS_V1} onClick={() => updateRoom(selectedRoom.id, { width: selectedRoom.width + 1 })}>+</button></div>
                <div><span>Depth</span><button type="button" disabled={selectedRoom.height <= 1} onClick={() => updateRoom(selectedRoom.id, { height: selectedRoom.height - 1 })}>−</button><output>{selectedRoom.height}</output><button type="button" disabled={selectedRoom.y + selectedRoom.height >= DEBATE_MYSTERY_MANSION_EDITOR_GRID_ROWS_V1} onClick={() => updateRoom(selectedRoom.id, { height: selectedRoom.height + 1 })}>+</button></div>
              </fieldset>

              <fieldset className={styles.mansionEditorConnections}>
                <legend>Doors, stairs, and portals</legend>
                {rooms.filter((room) => room.id !== selectedRoom.id).map((room) => (
                  <label key={room.id}>
                    <input type="checkbox" checked={selectedRoom.neighborIds.includes(room.id)} onChange={() => toggleConnection(room.id)} />
                    <span>{room.emoji}<strong>{room.name}</strong><small>{room.floor === selectedRoom.floor ? `Floor ${room.floor}` : `Stairs to floor ${room.floor}`}</small></span>
                  </label>
                ))}
              </fieldset>
              <button type="button" className={styles.mansionEditorRemoveRoom} disabled={rooms.length <= DEBATE_MYSTERY_MANSION_EDITOR_MIN_ROOMS_V1 || selectedRoom.templateId === "foyer"} onClick={removeSelectedRoom}>Remove room</button>
            </>
          ) : <p>Select a room from the plan.</p>}
        </aside>

        <footer className={styles.mansionEditorFooter}>
          <div>
            <strong>{rooms.length} rooms · {floorCount} floors · {draftScaleClass}</strong>
            {validationErrors.length > 0 ? <span role="alert">{validationErrors[0]}{validationErrors.length > 1 ? ` · ${validationErrors.length - 1} more` : ""}</span> : <span data-valid="true">Plan is connected and ready to save.</span>}
          </div>
          <button type="button" disabled={busy || saving} onClick={onClose}>Close</button>
          <button type="button" className={styles.installedMansionSave} disabled={busy || saving || validationErrors.length > 0} onClick={() => void save()}>{saving ? "Saving plan…" : "Save mansion plan"}</button>
        </footer>
      </section>
    </WhodunnitSetupDialog>
  );
}
