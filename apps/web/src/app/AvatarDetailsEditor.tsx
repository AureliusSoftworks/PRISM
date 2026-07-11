"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  Brush,
  Eraser,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";

import {
  AVATAR_DETAILS_BRUSH_SIZES,
  AVATAR_DETAILS_CANVAS_SIZE,
  AVATAR_DETAILS_MASK_BYTE_LENGTH,
  AVATAR_DETAILS_MAX_PAINT_PIXELS,
  AVATAR_DETAILS_VERSION,
  AVATAR_DETAIL_OFFSET_MAX,
  AVATAR_DETAIL_OFFSET_MIN,
  AVATAR_DETAIL_SCALE_MAX,
  AVATAR_DETAIL_SCALE_MIN,
  AVATAR_DETAIL_STAMP_DEFINITIONS,
  avatarDetailStampsForCategory,
  avatarDetailsEqual,
  avatarDetailsKey,
  avatarDetailsPaintCoveragePercent,
  avatarDetailsPaintPixelCount,
  cloneAvatarDetails,
  decodeAvatarDetailsPaintMask,
  encodeAvatarDetailsPaintMask,
  interpolateAvatarDetailsGridLine,
  normalizeAvatarDetails,
  normalizeAvatarDetailsColor,
  paintAvatarDetailsMask,
  rasterizeAvatarDetailsRgba,
  replaceAvatarDetailStampForCategory,
  toggleAvatarDetailStamp,
  updateAvatarDetailStamp,
  type AvatarDetailStampCategory,
  type AvatarDetailStampV1,
  type AvatarDetailsBrushSize,
  type AvatarDetailsFaceGeometry,
  type AvatarDetailsGridPoint,
  type AvatarDetailsPaintMode,
  type AvatarDetailsV1,
} from "./avatar-details";
import {
  commitAvatarDetailsHistory,
  redoAvatarDetailsHistory,
  undoAvatarDetailsHistory,
  type AvatarDetailsHistoryState,
} from "./avatar-details-history";
import styles from "./avatar-details-editor.module.css";

const AVATAR_DETAIL_STAMP_CATEGORIES = [
  { id: "eyewear", label: "Eyewear" },
  { id: "facial-hair", label: "Facial hair" },
  { id: "marking", label: "Marking" },
] as const satisfies readonly {
  id: AvatarDetailStampCategory;
  label: string;
}[];

export interface AvatarDetailsEditorHandle {
  apply(): Promise<boolean>;
  cancel(): void;
  hasDirtyChanges(): boolean;
}

export interface AvatarDetailsEditorProps {
  value: AvatarDetailsV1 | null | undefined;
  accentColor: string;
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null;
  onApply: (details: AvatarDetailsV1) => void | Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPreviewChange?: (details: AvatarDetailsV1) => void;
}

interface AvatarDetailsPointerStroke {
  pointerId: number;
  lastPoint: AvatarDetailsGridPoint;
  before: AvatarDetailsV1;
  changed: boolean;
}

function pointerGridPoint(
  event: Pick<PointerEvent<HTMLCanvasElement>, "clientX" | "clientY" | "currentTarget">
): AvatarDetailsGridPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = Math.floor(
    ((event.clientX - bounds.left) / Math.max(1, bounds.width)) *
      AVATAR_DETAILS_CANVAS_SIZE
  );
  const y = Math.floor(
    ((event.clientY - bounds.top) / Math.max(1, bounds.height)) *
      AVATAR_DETAILS_CANVAS_SIZE
  );
  return {
    x: Math.max(0, Math.min(AVATAR_DETAILS_CANVAS_SIZE - 1, x)),
    y: Math.max(0, Math.min(AVATAR_DETAILS_CANVAS_SIZE - 1, y)),
  };
}

function AvatarStampAdjustments({
  stamp,
  onChange,
}: {
  stamp: AvatarDetailStampV1;
  onChange: (stamp: AvatarDetailStampV1) => void;
}): React.JSX.Element {
  const definition = AVATAR_DETAIL_STAMP_DEFINITIONS.find(
    (candidate) => candidate.id === stamp.id
  );
  return (
    <div className={styles.stampAdjustmentSet}>
      <strong>{definition?.label ?? stamp.id}</strong>
      <div className={styles.stampAdjustments}>
        <label>
          <span>X offset <strong>{stamp.offsetX}</strong></span>
          <input
            type="range"
            min={AVATAR_DETAIL_OFFSET_MIN}
            max={AVATAR_DETAIL_OFFSET_MAX}
            step={1}
            value={stamp.offsetX}
            onChange={(event) =>
              onChange({ ...stamp, offsetX: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label>
          <span>Y offset <strong>{stamp.offsetY}</strong></span>
          <input
            type="range"
            min={AVATAR_DETAIL_OFFSET_MIN}
            max={AVATAR_DETAIL_OFFSET_MAX}
            step={1}
            value={stamp.offsetY}
            onChange={(event) =>
              onChange({ ...stamp, offsetY: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label>
          <span>Scale <strong>{stamp.scalePct}%</strong></span>
          <input
            type="range"
            min={AVATAR_DETAIL_SCALE_MIN}
            max={AVATAR_DETAIL_SCALE_MAX}
            step={1}
            value={stamp.scalePct}
            onChange={(event) =>
              onChange({
                ...stamp,
                scalePct: Number(event.currentTarget.value),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}

const AvatarDetailsEditorSession = forwardRef<
  AvatarDetailsEditorHandle,
  AvatarDetailsEditorProps
>(function AvatarDetailsEditorSession(
  {
    value,
    accentColor,
    faceGeometry,
    onApply,
    onCancel,
    onDirtyChange,
    onPreviewChange,
  },
  ref
): React.JSX.Element {
  const normalizedSource = useMemo(() => normalizeAvatarDetails(value), [value]);
  const [working, setWorking] = useState<AvatarDetailsV1>(() =>
    cloneAvatarDetails(normalizedSource)
  );
  const workingRef = useRef(working);
  const [undoHistory, setUndoHistory] = useState<AvatarDetailsV1[]>([]);
  const [redoHistory, setRedoHistory] = useState<AvatarDetailsV1[]>([]);
  const undoHistoryRef = useRef<readonly AvatarDetailsV1[]>(undoHistory);
  const redoHistoryRef = useRef<readonly AvatarDetailsV1[]>(redoHistory);
  const [paintMode, setPaintMode] = useState<AvatarDetailsPaintMode>("brush");
  const [brushSize, setBrushSize] = useState<AvatarDetailsBrushSize>(3);
  const [keyboardCursor, setKeyboardCursor] = useState<AvatarDetailsGridPoint>({
    x: 64,
    y: 64,
  });
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerStrokeRef = useRef<AvatarDetailsPointerStroke | null>(null);
  const normalizedAccentColor = normalizeAvatarDetailsColor(accentColor);
  const workingKey = avatarDetailsKey(working);
  const dirty = !avatarDetailsEqual(working, normalizedSource);
  const paintMask =
    decodeAvatarDetailsPaintMask(working.screen.paintMaskBase64) ??
    new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
  const paintedPixels = avatarDetailsPaintPixelCount(paintMask);
  const coveragePercent = avatarDetailsPaintCoveragePercent(paintMask);

  const updateWorking = useCallback((next: AvatarDetailsV1): void => {
    const normalized = normalizeAvatarDetails(next);
    workingRef.current = normalized;
    setWorking(normalized);
  }, []);

  const resetHistory = useCallback((): void => {
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setUndoHistory([]);
    setRedoHistory([]);
  }, []);

  const applyHistoryTransition = useCallback(
    (next: AvatarDetailsHistoryState): void => {
      undoHistoryRef.current = next.undo;
      redoHistoryRef.current = next.redo;
      setUndoHistory([...next.undo]);
      setRedoHistory([...next.redo]);
      updateWorking(next.working);
    },
    [updateWorking]
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onPreviewChange?.(cloneAvatarDetails(workingRef.current));
  }, [onPreviewChange, workingKey]);

  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;
    context.imageSmoothingEnabled = false;
    const pixels = rasterizeAvatarDetailsRgba(
      workingRef.current,
      normalizedAccentColor,
      faceGeometry
    );
    const imageData = context.createImageData(
      AVATAR_DETAILS_CANVAS_SIZE,
      AVATAR_DETAILS_CANVAS_SIZE
    );
    imageData.data.set(pixels);
    context.clearRect(0, 0, AVATAR_DETAILS_CANVAS_SIZE, AVATAR_DETAILS_CANVAS_SIZE);
    context.putImageData(imageData, 0, 0);
  }, [faceGeometry, normalizedAccentColor, workingKey]);

  const commitMutation = useCallback(
    (next: AvatarDetailsV1): void => {
      const current = workingRef.current;
      if (avatarDetailsEqual(current, next)) return;
      applyHistoryTransition(
        commitAvatarDetailsHistory(
          {
            working: current,
            undo: undoHistoryRef.current,
            redo: redoHistoryRef.current,
          },
          next
        )
      );
      setLimitReached(false);
    },
    [applyHistoryTransition]
  );

  const undo = useCallback((): void => {
    const current = {
      working: workingRef.current,
      undo: undoHistoryRef.current,
      redo: redoHistoryRef.current,
    };
    const next = undoAvatarDetailsHistory(current);
    if (next === current) return;
    applyHistoryTransition(next);
    setLimitReached(false);
  }, [applyHistoryTransition]);

  const redo = useCallback((): void => {
    const current = {
      working: workingRef.current,
      undo: undoHistoryRef.current,
      redo: redoHistoryRef.current,
    };
    const next = redoAvatarDetailsHistory(current);
    if (next === current) return;
    applyHistoryTransition(next);
    setLimitReached(false);
  }, [applyHistoryTransition]);

  const applyWorkingCopy = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    const next = cloneAvatarDetails(workingRef.current);
    setApplying(true);
    setApplyError(null);
    try {
      await onApply(next);
      resetHistory();
      onDirtyChange?.(false);
      return true;
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : "Avatar details could not be saved."
      );
      return false;
    } finally {
      setApplying(false);
    }
  }, [dirty, onApply, onDirtyChange, resetHistory]);

  const cancelWorkingCopy = useCallback((): void => {
    const next = cloneAvatarDetails(normalizedSource);
    updateWorking(next);
    resetHistory();
    setLimitReached(false);
    setApplyError(null);
    onDirtyChange?.(false);
    onCancel?.();
  }, [normalizedSource, onCancel, onDirtyChange, resetHistory, updateWorking]);

  useImperativeHandle(
    ref,
    () => ({
      apply: applyWorkingCopy,
      cancel: cancelWorkingCopy,
      hasDirtyChanges: () => !avatarDetailsEqual(workingRef.current, normalizedSource),
    }),
    [applyWorkingCopy, cancelWorkingCopy, normalizedSource]
  );

  const paintPoints = useCallback(
    (points: readonly AvatarDetailsGridPoint[]): boolean => {
      const current = workingRef.current;
      const currentMask =
        decodeAvatarDetailsPaintMask(current.screen.paintMaskBase64) ??
        new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
      const result = paintAvatarDetailsMask(currentMask, points, brushSize, paintMode);
      setLimitReached(result.limitReached);
      if (!result.changed) return false;
      updateWorking({
        ...current,
        screen: {
          ...current.screen,
          paintMaskBase64: encodeAvatarDetailsPaintMask(result.mask),
        },
      });
      return true;
    },
    [brushSize, paintMode, updateWorking]
  );

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const point = pointerGridPoint(event);
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerStrokeRef.current = {
      pointerId: event.pointerId,
      lastPoint: point,
      before: cloneAvatarDetails(workingRef.current),
      changed: paintPoints([point]),
    };
    setKeyboardCursor(point);
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const stroke = pointerStrokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    const samples =
      typeof event.nativeEvent.getCoalescedEvents === "function"
        ? event.nativeEvent.getCoalescedEvents()
        : [event.nativeEvent];
    let previous = stroke.lastPoint;
    for (const sample of samples) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const point = {
        x: Math.max(
          0,
          Math.min(
            AVATAR_DETAILS_CANVAS_SIZE - 1,
            Math.floor(
              ((sample.clientX - bounds.left) / Math.max(1, bounds.width)) *
                AVATAR_DETAILS_CANVAS_SIZE
            )
          )
        ),
        y: Math.max(
          0,
          Math.min(
            AVATAR_DETAILS_CANVAS_SIZE - 1,
            Math.floor(
              ((sample.clientY - bounds.top) / Math.max(1, bounds.height)) *
                AVATAR_DETAILS_CANVAS_SIZE
            )
          )
        ),
      };
      stroke.changed = paintPoints(interpolateAvatarDetailsGridLine(previous, point)) || stroke.changed;
      previous = point;
    }
    stroke.lastPoint = previous;
    setKeyboardCursor(previous);
    event.preventDefault();
  };

  const finishPointerStroke = (event: PointerEvent<HTMLCanvasElement>): void => {
    const stroke = pointerStrokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    pointerStrokeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is optional in test and older browser environments.
    }
    if (stroke.changed && !avatarDetailsEqual(stroke.before, workingRef.current)) {
      applyHistoryTransition(
        commitAvatarDetailsHistory(
          {
            working: stroke.before,
            undo: undoHistoryRef.current,
            redo: redoHistoryRef.current,
          },
          workingRef.current
        )
      );
    }
    event.preventDefault();
  };

  const paintKeyboardCursor = (): void => {
    const before = cloneAvatarDetails(workingRef.current);
    if (!paintPoints([keyboardCursor])) return;
    applyHistoryTransition(
      commitAvatarDetailsHistory(
        {
          working: before,
          undo: undoHistoryRef.current,
          redo: redoHistoryRef.current,
        },
        workingRef.current
      )
    );
  };

  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (event.key === "b" || event.key === "B") {
      setPaintMode("brush");
      event.preventDefault();
      return;
    }
    if (event.key === "e" || event.key === "E") {
      setPaintMode("eraser");
      event.preventDefault();
      return;
    }
    if (event.key === "1" || event.key === "3" || event.key === "5") {
      setBrushSize(Number(event.key) as AvatarDetailsBrushSize);
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      paintKeyboardCursor();
      event.preventDefault();
      return;
    }
    const movement = event.shiftKey ? 5 : 1;
    const next = { ...keyboardCursor };
    if (event.key === "ArrowLeft") next.x -= movement;
    else if (event.key === "ArrowRight") next.x += movement;
    else if (event.key === "ArrowUp") next.y -= movement;
    else if (event.key === "ArrowDown") next.y += movement;
    else return;
    setKeyboardCursor({
      x: Math.max(0, Math.min(AVATAR_DETAILS_CANVAS_SIZE - 1, next.x)),
      y: Math.max(0, Math.min(AVATAR_DETAILS_CANVAS_SIZE - 1, next.y)),
    });
    event.preventDefault();
  };

  const clearPaint = (): void => {
    if (workingRef.current.screen.paintMaskBase64 === null) return;
    commitMutation({
      ...workingRef.current,
      screen: { ...workingRef.current.screen, paintMaskBase64: null },
    });
  };

  const clearAllDetails = (): void => {
    if (
      workingRef.current.screen.stamps.length === 0 &&
      workingRef.current.screen.paintMaskBase64 === null
    ) {
      return;
    }
    commitMutation({
      version: AVATAR_DETAILS_VERSION,
      screen: { stamps: [], paintMaskBase64: null },
    });
  };

  const cursorStyle = {
    "--avatar-details-cursor-x": `${keyboardCursor.x + 0.5}`,
    "--avatar-details-cursor-y": `${keyboardCursor.y + 0.5}`,
    "--avatar-details-cursor-size": `${brushSize}`,
  } as CSSProperties;

  return (
    <section className={styles.editor} aria-label="Avatar details editor">
      <header className={styles.header}>
        <div>
          <strong>Details</strong>
          <small>Smart-anchored accessories and pixel ink</small>
        </div>
        <button
          type="button"
          className={styles.clearAllButton}
          onClick={clearAllDetails}
          disabled={
            working.screen.stamps.length === 0 &&
            working.screen.paintMaskBase64 === null
          }
        >
          <RotateCcw size={13} aria-hidden="true" />
          Reset details
        </button>
      </header>

      <div className={styles.stampStack}>
        {AVATAR_DETAIL_STAMP_CATEGORIES.map((category) => {
          const activeStamps = avatarDetailStampsForCategory(working, category.id);
          const activeStamp = activeStamps[0] ?? null;
          const definitions = AVATAR_DETAIL_STAMP_DEFINITIONS.filter(
            (definition) => definition.category === category.id
          );
          return (
            <fieldset key={category.id} className={styles.stampGroup}>
              <legend>{category.label}</legend>
              <div className={styles.stampOptions}>
                <button
                  type="button"
                  aria-pressed={activeStamps.length === 0}
                  data-selected={activeStamps.length === 0 ? "true" : undefined}
                  onClick={() =>
                    commitMutation(
                      replaceAvatarDetailStampForCategory(
                        workingRef.current,
                        category.id,
                        null
                      )
                    )
                  }
                >
                  None
                </button>
                {definitions.map((definition) => (
                  <button
                    key={definition.id}
                    type="button"
                    aria-pressed={activeStamps.some((stamp) => stamp.id === definition.id)}
                    data-selected={
                      activeStamps.some((stamp) => stamp.id === definition.id)
                        ? "true"
                        : undefined
                    }
                    disabled={
                      category.id === "marking" &&
                      activeStamps.length >= 2 &&
                      !activeStamps.some((stamp) => stamp.id === definition.id)
                    }
                    onClick={() =>
                      commitMutation(
                        category.id === "marking"
                          ? toggleAvatarDetailStamp(
                              workingRef.current,
                              definition.id
                            )
                          : replaceAvatarDetailStampForCategory(
                              workingRef.current,
                              category.id,
                              activeStamp?.id === definition.id
                                ? activeStamp
                                : {
                                    id: definition.id,
                                    offsetX: 0,
                                    offsetY: 0,
                                    scalePct: 100,
                                  }
                            )
                      )
                    }
                  >
                    {definition.label}
                  </button>
                ))}
              </div>
              {activeStamps.map((stamp) => (
                <AvatarStampAdjustments
                  key={stamp.id}
                  stamp={stamp}
                  onChange={(nextStamp) =>
                    commitMutation(
                      updateAvatarDetailStamp(workingRef.current, nextStamp)
                    )
                  }
                />
              ))}
            </fieldset>
          );
        })}
      </div>

      <section className={styles.paintSection} aria-label="Pixel paint mask">
        <header className={styles.paintHeader}>
          <div>
            <strong>Pixel ink</strong>
            <small>128 × 128 · nearest-neighbor</small>
          </div>
          <div className={styles.historyActions}>
            <button type="button" onClick={undo} disabled={undoHistory.length === 0} aria-label="Undo">
              <Undo2 size={14} aria-hidden="true" />
            </button>
            <button type="button" onClick={redo} disabled={redoHistory.length === 0} aria-label="Redo">
              <Redo2 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearPaint}
              disabled={working.screen.paintMaskBase64 === null}
              aria-label="Clear pixel ink"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={styles.paintTools}>
          <div role="group" aria-label="Paint tool" className={styles.segmentedControl}>
            <button
              type="button"
              aria-pressed={paintMode === "brush"}
              data-selected={paintMode === "brush" ? "true" : undefined}
              onClick={() => setPaintMode("brush")}
            >
              <Brush size={13} aria-hidden="true" />
              Brush
            </button>
            <button
              type="button"
              aria-pressed={paintMode === "eraser"}
              data-selected={paintMode === "eraser" ? "true" : undefined}
              onClick={() => setPaintMode("eraser")}
            >
              <Eraser size={13} aria-hidden="true" />
              Eraser
            </button>
          </div>
          <div role="group" aria-label="Brush size" className={styles.brushSizes}>
            {AVATAR_DETAILS_BRUSH_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-label={`${size} pixel brush`}
                aria-pressed={brushSize === size}
                data-selected={brushSize === size ? "true" : undefined}
                onClick={() => setBrushSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.canvasFrame} style={cursorStyle}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={AVATAR_DETAILS_CANVAS_SIZE}
            height={AVATAR_DETAILS_CANVAS_SIZE}
            tabIndex={0}
            role="application"
            aria-label={`Avatar pixel canvas. ${paintMode}, ${brushSize} pixel size. Arrow keys move the cursor; Space paints.`}
            aria-describedby="avatar-details-keyboard-help"
            onFocus={() => setCanvasFocused(true)}
            onBlur={() => setCanvasFocused(false)}
            onKeyDown={handleCanvasKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerStroke}
            onPointerCancel={finishPointerStroke}
          />
          <span
            className={styles.keyboardCursor}
            data-visible={canvasFocused ? "true" : undefined}
            aria-hidden="true"
          />
        </div>
        <p id="avatar-details-keyboard-help" className={styles.keyboardHelp}>
          Keyboard: arrows move, Shift moves 5, Space paints, B/E switch tools, 1/3/5 size.
        </p>

        <div className={styles.coverage} aria-live="polite">
          <div>
            <span>Paint coverage</span>
            <strong>{coveragePercent.toFixed(1)}% / 40%</strong>
          </div>
          <meter
            min={0}
            max={40}
            value={Math.min(40, coveragePercent)}
            aria-label={`Paint coverage ${coveragePercent.toFixed(1)} percent of 40 percent maximum`}
          />
          <small>
            {paintedPixels.toLocaleString()} / {AVATAR_DETAILS_MAX_PAINT_PIXELS.toLocaleString()} pixels
          </small>
          {limitReached ? (
            <span className={styles.limitMessage} role="status">
              Coverage limit reached. Erase pixels to keep drawing.
            </span>
          ) : null}
        </div>
      </section>

      <footer className={styles.footer}>
        <span data-dirty={dirty ? "true" : undefined}>
          {applying
            ? "Applying…"
            : dirty
              ? "Working copy · not applied"
              : "Applied recipe"}
        </span>
        <div>
          <button type="button" className={styles.cancelButton} onClick={cancelWorkingCopy} disabled={!dirty || applying}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.applyButton}
            onClick={() => void applyWorkingCopy()}
            disabled={!dirty || applying}
          >
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
      </footer>
      {applyError ? (
        <p className={styles.applyError} role="alert">
          {applyError}
        </p>
      ) : null}
    </section>
  );
});

AvatarDetailsEditorSession.displayName = "AvatarDetailsEditorSession";

export const AvatarDetailsEditor = forwardRef<
  AvatarDetailsEditorHandle,
  AvatarDetailsEditorProps
>(function AvatarDetailsEditor(props, ref): React.JSX.Element {
  return (
    <AvatarDetailsEditorSession
      key={avatarDetailsKey(props.value)}
      {...props}
      ref={ref}
    />
  );
});

AvatarDetailsEditor.displayName = "AvatarDetailsEditor";
