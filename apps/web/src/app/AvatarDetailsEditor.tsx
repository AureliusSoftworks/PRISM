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
  type PointerEvent,
} from "react";
import type { BotFaceStyle } from "@localai/shared";
import {
  Brush,
  Circle,
  Eraser,
  Eye,
  EyeOff,
  Minus,
  Move,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";

import {
  AVATAR_DETAILS_BRUSH_SIZES,
  AVATAR_DETAILS_CANVAS_SIZE,
  AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
  AVATAR_DETAILS_INK_ROLE_COLORS,
  AVATAR_DETAILS_MAX_PAINT_PIXELS,
  avatarDetailsCirclePoints,
  avatarDetailsGridPointFromClient,
  avatarDetailsEqual,
  avatarDetailsKey,
  avatarDetailsPaintColorCoveragePercent,
  avatarDetailsPaintColorPixelCount,
  avatarDetailsWithPaintColorMap,
  avatarDetailsWritablePixel,
  cloneAvatarDetails,
  decodeAvatarDetailsPaintColorMap,
  interpolateAvatarDetailsGridLine,
  moveAvatarDetailsPaintColorMap,
  normalizeAvatarDetails,
  normalizeAvatarDetailsColor,
  paintAvatarDetailsColorMap,
  rasterizeAvatarDetailsSemanticRgba,
  type AvatarDetailsBrushSize,
  type AvatarDetailsGridPoint,
  type AvatarDetailsInkRole,
  type AvatarDetailsPaintMode,
  type AvatarDetailsTool,
  type AvatarDetailsV1,
} from "./avatar-details";
import {
  BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
  BOT_AVATAR_SCREEN_EDITOR_FACE_GLYPH_FRAME_RATIO,
  BOT_AVATAR_SCREEN_EDITOR_FACE_PLACEMENT,
} from "./bot-avatar-render-geometry";
import { CoffeeSeatPlateEmoji } from "./CoffeeSeatPlateEmoji";
import {
  commitAvatarDetailsHistory,
  redoAvatarDetailsHistory,
  undoAvatarDetailsHistory,
  type AvatarDetailsHistoryState,
} from "./avatar-details-history";
import { zenLiveActionPlateFace } from "./zenLiveActions";
import styles from "./avatar-details-editor.module.css";
import pageStyles from "./page.module.css";

const AVATAR_DETAILS_NEUTRAL_FACE = zenLiveActionPlateFace("neutral", "closed");
const AVATAR_DETAILS_EDITOR_ZOOM = 1.36;
const AVATAR_DETAILS_EDITOR_ZOOM_ORIGIN_Y_PCT = 45;
const AVATAR_DETAILS_INK_OPTIONS: ReadonlyArray<{
  role: AvatarDetailsInkRole;
  label: string;
  description: string;
}> = [
  {
    role: "blink",
    label: "Blink ink",
    description: "Hides while the bot blinks.",
  },
  {
    role: "talking",
    label: "Speech ink",
    description: "Hides while talking or sipping.",
  },
  {
    role: "effect",
    label: "Effect ink",
    description: "Hides only for full-screen face effects.",
  },
];

export interface AvatarDetailsEditorHandle {
  apply(): Promise<boolean>;
  cancel(): void;
  hasDirtyChanges(): boolean;
  undo(): boolean;
  redo(): boolean;
}

export interface AvatarDetailsEditorProps {
  value: AvatarDetailsV1 | null | undefined;
  accentColor: string;
  faceStyle: BotFaceStyle;
  theme: "light" | "dark";
  onApply: (details: AvatarDetailsV1) => void | Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPreviewChange?: (details: AvatarDetailsV1) => void;
  onEditStart?: () => void;
}

interface AvatarDetailsPointerStroke {
  pointerId: number;
  tool: AvatarDetailsTool;
  startPoint: AvatarDetailsGridPoint;
  lastPoint: AvatarDetailsGridPoint;
  before: AvatarDetailsV1;
  beforeColorMap: Uint8Array;
  changed: boolean;
}

function pointerGridPoint(
  event: Pick<
    PointerEvent<HTMLDivElement>,
    "clientX" | "clientY" | "currentTarget"
  >,
): AvatarDetailsGridPoint {
  return avatarDetailsGridPointFromClient(
    event.clientX,
    event.clientY,
    event.currentTarget.getBoundingClientRect(),
  );
}

const AvatarDetailsEditorSession = forwardRef<
  AvatarDetailsEditorHandle,
  AvatarDetailsEditorProps
>(function AvatarDetailsEditorSession(
  {
    value,
    accentColor,
    faceStyle,
    theme,
    onApply,
    onCancel,
    onDirtyChange,
    onPreviewChange,
    onEditStart,
  },
  ref,
): React.JSX.Element {
  const normalizedSource = useMemo(
    () => normalizeAvatarDetails(value),
    [value],
  );
  const [working, setWorking] = useState<AvatarDetailsV1>(() =>
    cloneAvatarDetails(normalizedSource),
  );
  const workingRef = useRef(working);
  const [undoHistory, setUndoHistory] = useState<AvatarDetailsV1[]>([]);
  const [redoHistory, setRedoHistory] = useState<AvatarDetailsV1[]>([]);
  const undoHistoryRef = useRef<readonly AvatarDetailsV1[]>(undoHistory);
  const redoHistoryRef = useRef<readonly AvatarDetailsV1[]>(redoHistory);
  const [paintMode, setPaintMode] = useState<AvatarDetailsTool>("brush");
  const [inkRole, setInkRole] = useState<AvatarDetailsInkRole>("effect");
  const [brushSize, setBrushSize] = useState<AvatarDetailsBrushSize>(3);
  const [pointerActive, setPointerActive] = useState(false);
  const [faceGuideVisible, setFaceGuideVisible] = useState(true);
  const [limitReached, setLimitReached] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenGuideRef = useRef<HTMLCanvasElement | null>(null);
  const pointerStrokeRef = useRef<AvatarDetailsPointerStroke | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<AvatarDetailsV1 | null>(null);
  const onPreviewChangeRef = useRef(onPreviewChange);
  const queuePreviewRef = useRef<(details: AvatarDetailsV1) => void>(() => {});
  onPreviewChangeRef.current = onPreviewChange;
  const normalizedAccentColor = normalizeAvatarDetailsColor(accentColor);
  const workingKey = avatarDetailsKey(working);
  const dirty = !avatarDetailsEqual(working, normalizedSource);
  const paintColorMap =
    decodeAvatarDetailsPaintColorMap(working.screen.paintColorMapBase64) ??
    new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
  const paintedPixels = avatarDetailsPaintColorPixelCount(paintColorMap);
  const coveragePercent =
    avatarDetailsPaintColorCoveragePercent(paintColorMap);
  const guideInk = theme === "light" ? "#050608" : "#ffffff";
  const zoomedFaceYPct =
    AVATAR_DETAILS_EDITOR_ZOOM_ORIGIN_Y_PCT +
    (BOT_AVATAR_SCREEN_EDITOR_FACE_PLACEMENT.yPct -
      AVATAR_DETAILS_EDITOR_ZOOM_ORIGIN_Y_PCT) *
      AVATAR_DETAILS_EDITOR_ZOOM;
  const faceGuideStyle = {
    "--zen-live-bot-face-x": `${BOT_AVATAR_SCREEN_EDITOR_FACE_PLACEMENT.xPct}%`,
    "--zen-live-bot-face-y": `${zoomedFaceYPct}%`,
    "--zen-live-bot-face-scale": BOT_AVATAR_SCREEN_EDITOR_FACE_PLACEMENT.scale,
    "--zen-live-bot-avatar-face-glyph-size": `${BOT_AVATAR_SCREEN_EDITOR_FACE_GLYPH_FRAME_RATIO * AVATAR_DETAILS_EDITOR_ZOOM * 100}cqw`,
    "--coffee-plate-emoji-face-scale-y": BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
    "--avatar-details-facing-scale-x": "1",
    "--zen-live-bot-face-ink": guideInk,
    "--zen-live-bot-face-crt-border-color": guideInk,
    "--coffee-bot-color": guideInk,
    "--coffee-seat-emotion-color": guideInk,
    zIndex: 1,
  } as CSSProperties;
  const runtimeColorPreviewStyle = {
    backgroundColor: normalizedAccentColor,
  } as CSSProperties;

  const drawWorkingCanvas = useCallback(
    (details: AvatarDetailsV1): void => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { alpha: true });
      if (!canvas || !context) return;
      const pixels = rasterizeAvatarDetailsSemanticRgba(details, faceStyle);
      const imageData = context.createImageData(
        AVATAR_DETAILS_CANVAS_SIZE,
        AVATAR_DETAILS_CANVAS_SIZE,
      );
      imageData.data.set(pixels);
      context.imageSmoothingEnabled = false;
      context.putImageData(imageData, 0, 0);
    },
    [faceStyle],
  );

  const updateWorking = useCallback(
    (
      next: AvatarDetailsV1,
      options: {
        publishPreview?: boolean;
        deferRender?: boolean;
      } = {},
    ): void => {
      const { publishPreview = true, deferRender = false } = options;
      const normalized = normalizeAvatarDetails(next);
      workingRef.current = normalized;
      if (deferRender) {
        drawWorkingCanvas(normalized);
      } else {
        setWorking(normalized);
      }
      if (publishPreview) queuePreviewRef.current(normalized);
    },
    [drawWorkingCanvas],
  );

  const resetHistory = useCallback((): void => {
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setUndoHistory([]);
    setRedoHistory([]);
  }, []);

  const applyHistoryTransition = useCallback(
    (next: AvatarDetailsHistoryState, publishPreview = true): void => {
      undoHistoryRef.current = next.undo;
      redoHistoryRef.current = next.redo;
      setUndoHistory([...next.undo]);
      setRedoHistory([...next.redo]);
      updateWorking(next.working, { publishPreview });
    },
    [updateWorking],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const publishPendingPreview = useCallback((): void => {
    previewFrameRef.current = null;
    const pending = pendingPreviewRef.current;
    pendingPreviewRef.current = null;
    if (pending) onPreviewChangeRef.current?.(pending);
  }, []);

  const queuePreview = useCallback(
    (details: AvatarDetailsV1): void => {
      if (!onPreviewChangeRef.current) return;
      pendingPreviewRef.current = cloneAvatarDetails(details);
      if (previewFrameRef.current !== null) return;
      previewFrameRef.current = window.requestAnimationFrame(
        publishPendingPreview,
      );
    },
    [publishPendingPreview],
  );

  const flushPreview = useCallback((details: AvatarDetailsV1): void => {
    const publish = onPreviewChangeRef.current;
    if (!publish) return;
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    pendingPreviewRef.current = null;
    publish(cloneAvatarDetails(details));
  }, []);
  queuePreviewRef.current = queuePreview;

  useEffect(
    () => () => {
      if (previewFrameRef.current !== null) {
        window.cancelAnimationFrame(previewFrameRef.current);
      }
    },
    [],
  );

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
    const canvas = screenGuideRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;
    const guideValue = theme === "light" ? 0 : 255;
    const imageData = context.createImageData(
      AVATAR_DETAILS_CANVAS_SIZE,
      AVATAR_DETAILS_CANVAS_SIZE,
    );
    for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
      for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
        const writable = avatarDetailsWritablePixel(x, y);
        const boundary =
          writable &&
          (!avatarDetailsWritablePixel(x - 1, y) ||
            !avatarDetailsWritablePixel(x + 1, y) ||
            !avatarDetailsWritablePixel(x, y - 1) ||
            !avatarDetailsWritablePixel(x, y + 1));
        const index = (y * AVATAR_DETAILS_CANVAS_SIZE + x) * 4;
        imageData.data[index] = guideValue;
        imageData.data[index + 1] = guideValue;
        imageData.data[index + 2] = guideValue;
        imageData.data[index + 3] = boundary ? 58 : 0;
      }
    }
    context.putImageData(imageData, 0, 0);
  }, [theme]);

  useEffect(() => {
    drawWorkingCanvas(workingRef.current);
  }, [drawWorkingCanvas, workingKey]);

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
          next,
        ),
      );
      setLimitReached(false);
    },
    [applyHistoryTransition],
  );

  const undo = useCallback((): boolean => {
    const current = {
      working: workingRef.current,
      undo: undoHistoryRef.current,
      redo: redoHistoryRef.current,
    };
    const next = undoAvatarDetailsHistory(current);
    if (next === current) return false;
    onEditStart?.();
    applyHistoryTransition(next);
    setLimitReached(false);
    return true;
  }, [applyHistoryTransition, onEditStart]);

  const redo = useCallback((): boolean => {
    const current = {
      working: workingRef.current,
      undo: undoHistoryRef.current,
      redo: redoHistoryRef.current,
    };
    const next = redoAvatarDetailsHistory(current);
    if (next === current) return false;
    onEditStart?.();
    applyHistoryTransition(next);
    setLimitReached(false);
    return true;
  }, [applyHistoryTransition, onEditStart]);

  const applyWorkingCopy = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    const next = cloneAvatarDetails(workingRef.current);
    flushPreview(next);
    setApplying(true);
    setApplyError(null);
    try {
      await onApply(next);
      resetHistory();
      onDirtyChange?.(false);
      return true;
    } catch (error) {
      setApplyError(
        error instanceof Error
          ? error.message
          : "Avatar details could not be saved.",
      );
      return false;
    } finally {
      setApplying(false);
    }
  }, [dirty, flushPreview, onApply, onDirtyChange, resetHistory]);

  const cancelWorkingCopy = useCallback((): void => {
    const next = cloneAvatarDetails(normalizedSource);
    updateWorking(next, { publishPreview: false });
    flushPreview(next);
    resetHistory();
    setLimitReached(false);
    setApplyError(null);
    onDirtyChange?.(false);
    onCancel?.();
  }, [
    flushPreview,
    normalizedSource,
    onCancel,
    onDirtyChange,
    resetHistory,
    updateWorking,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      apply: applyWorkingCopy,
      cancel: cancelWorkingCopy,
      undo,
      redo,
      hasDirtyChanges: () =>
        !avatarDetailsEqual(workingRef.current, normalizedSource),
    }),
    [applyWorkingCopy, cancelWorkingCopy, normalizedSource, redo, undo],
  );

  const paintPoints = useCallback(
    (points: readonly AvatarDetailsGridPoint[]): boolean => {
      if (paintMode !== "brush" && paintMode !== "eraser") return false;
      const current = workingRef.current;
      const currentColorMap =
        decodeAvatarDetailsPaintColorMap(
          current.screen.paintColorMapBase64,
        ) ?? new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
      const mode: AvatarDetailsPaintMode = paintMode;
      const result = paintAvatarDetailsColorMap(
        currentColorMap,
        points,
        brushSize,
        mode,
        inkRole,
      );
      setLimitReached(result.limitReached);
      if (!result.changed) return false;
      updateWorking(
        avatarDetailsWithPaintColorMap(current, result.colorMap),
        { publishPreview: false, deferRender: true },
      );
      return true;
    },
    [brushSize, inkRole, paintMode, updateWorking],
  );

  const previewCircleStroke = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      edge: AvatarDetailsGridPoint,
    ): boolean => {
      const result = paintAvatarDetailsColorMap(
        stroke.beforeColorMap,
        avatarDetailsCirclePoints(stroke.startPoint, edge),
        brushSize,
        "brush",
        inkRole,
      );
      setLimitReached(result.limitReached);
      updateWorking(
        avatarDetailsWithPaintColorMap(stroke.before, result.colorMap),
        { publishPreview: false, deferRender: true },
      );
      return result.changed;
    },
    [brushSize, inkRole, updateWorking],
  );

  const previewLineStroke = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      edge: AvatarDetailsGridPoint,
    ): boolean => {
      const result = paintAvatarDetailsColorMap(
        stroke.beforeColorMap,
        interpolateAvatarDetailsGridLine(stroke.startPoint, edge),
        brushSize,
        "brush",
        inkRole,
      );
      setLimitReached(result.limitReached);
      updateWorking(
        avatarDetailsWithPaintColorMap(stroke.before, result.colorMap),
        { publishPreview: false, deferRender: true },
      );
      return result.changed;
    },
    [brushSize, inkRole, updateWorking],
  );

  const previewMoveStroke = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      point: AvatarDetailsGridPoint,
    ): boolean => {
      const result = moveAvatarDetailsPaintColorMap(stroke.beforeColorMap, {
        x: point.x - stroke.startPoint.x,
        y: point.y - stroke.startPoint.y,
      });
      setLimitReached(false);
      updateWorking(
        avatarDetailsWithPaintColorMap(stroke.before, result.colorMap),
        { publishPreview: false, deferRender: true },
      );
      return result.changed;
    },
    [updateWorking],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (
      (event.button !== 0 && (event.buttons & 1) === 0) ||
      event.isPrimary === false
    )
      return;
    onEditStart?.();
    const point = pointerGridPoint(event);
    event.currentTarget.focus();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Safari standalone web apps can reject pointer capture even while the
      // pointer remains active. Painting must still begin in that case.
    }
    const before = cloneAvatarDetails(workingRef.current);
    const beforeColorMap =
      decodeAvatarDetailsPaintColorMap(before.screen.paintColorMapBase64) ??
      new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
    const stroke: AvatarDetailsPointerStroke = {
      pointerId: event.pointerId,
      tool: paintMode,
      startPoint: point,
      lastPoint: point,
      before,
      beforeColorMap,
      changed: false,
    };
    pointerStrokeRef.current = stroke;
    setPointerActive(true);
    if (stroke.tool === "brush" || stroke.tool === "eraser") {
      stroke.changed = paintPoints([point]);
    } else if (stroke.tool === "line") {
      stroke.changed = previewLineStroke(stroke, point);
    } else if (stroke.tool === "circle") {
      stroke.changed = previewCircleStroke(stroke, point);
    }
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const stroke = pointerStrokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    const samples =
      typeof event.nativeEvent.getCoalescedEvents === "function"
        ? event.nativeEvent.getCoalescedEvents()
        : [event.nativeEvent];
    const bounds = event.currentTarget.getBoundingClientRect();
    const sampledPoints = samples.map((sample) =>
      avatarDetailsGridPointFromClient(
        sample.clientX,
        sample.clientY,
        bounds,
      ),
    );
    const finalPoint = sampledPoints.at(-1);
    if (!finalPoint) return;
    if (stroke.tool === "brush" || stroke.tool === "eraser") {
      const paintPath: AvatarDetailsGridPoint[] = [];
      let previous = stroke.lastPoint;
      for (const point of sampledPoints) {
        paintPath.push(...interpolateAvatarDetailsGridLine(previous, point));
        previous = point;
      }
      stroke.changed = paintPoints(paintPath) || stroke.changed;
    } else if (stroke.tool === "line") {
      stroke.changed = previewLineStroke(stroke, finalPoint);
    } else if (stroke.tool === "circle") {
      stroke.changed = previewCircleStroke(stroke, finalPoint);
    } else {
      stroke.changed = previewMoveStroke(stroke, finalPoint);
    }
    stroke.lastPoint = finalPoint;
    event.preventDefault();
  };

  const finishPointerStroke = (event: PointerEvent<HTMLDivElement>): void => {
    const stroke = pointerStrokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    pointerStrokeRef.current = null;
    setPointerActive(false);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is optional in test and older browser environments.
    }
    if (
      stroke.changed &&
      !avatarDetailsEqual(stroke.before, workingRef.current)
    ) {
      applyHistoryTransition(
        commitAvatarDetailsHistory(
          {
            working: stroke.before,
            undo: undoHistoryRef.current,
            redo: redoHistoryRef.current,
          },
          workingRef.current,
        ),
        false,
      );
    }
    flushPreview(workingRef.current);
    event.preventDefault();
  };

  const clearPaint = (): void => {
    if (!workingRef.current.screen.paintColorMapBase64) return;
    onEditStart?.();
    commitMutation(
      avatarDetailsWithPaintColorMap(
        workingRef.current,
        new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH),
      ),
    );
  };

  const canvasInstruction =
    paintMode === "move"
      ? "Drag to move the illustration."
      : paintMode === "line"
        ? "Drag between two points to draw a straight line."
        : paintMode === "circle"
          ? "Drag from the center to draw a circle."
          : "Drag to paint on the screen.";

  return (
    <section
      className={styles.editor}
      data-editor-theme={theme}
      aria-label="Avatar details editor"
    >
      <section className={styles.paintSection} aria-label="Semantic screen ink">
        <header className={styles.paintHeader}>
          <div>
            <strong>Screen editor</strong>
            <small>128 × 128 · 5× preview</small>
          </div>
          <div className={styles.paintHeaderActions}>
            <button
              type="button"
              className={styles.guideToggleButton}
              aria-pressed={faceGuideVisible}
              onClick={() => setFaceGuideVisible((visible) => !visible)}
            >
              {faceGuideVisible ? (
                <Eye size={13} aria-hidden="true" />
              ) : (
                <EyeOff size={13} aria-hidden="true" />
              )}
              {faceGuideVisible ? "Hide face" : "Show face"}
            </button>
            <div className={styles.historyActions}>
              <button
                type="button"
                onClick={undo}
                disabled={undoHistory.length === 0}
                aria-label="Undo"
              >
                <Undo2 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={redoHistory.length === 0}
                aria-label="Redo"
              >
                <Redo2 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={clearPaint}
                disabled={!working.screen.paintColorMapBase64}
                aria-label="Clear pixel ink"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <div className={styles.paintTools}>
          <div
            role="group"
            aria-label="Paint tool"
            className={styles.segmentedControl}
          >
            <button
              type="button"
              aria-label="Brush tool"
              aria-pressed={paintMode === "brush"}
              data-selected={paintMode === "brush" ? "true" : undefined}
              data-glyph-tooltip="Brush"
              title="Brush"
              onClick={() => setPaintMode("brush")}
            >
              <Brush size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Eraser tool"
              aria-pressed={paintMode === "eraser"}
              data-selected={paintMode === "eraser" ? "true" : undefined}
              data-glyph-tooltip="Eraser"
              title="Eraser"
              onClick={() => setPaintMode("eraser")}
            >
              <Eraser size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Line tool"
              aria-pressed={paintMode === "line"}
              data-selected={paintMode === "line" ? "true" : undefined}
              data-glyph-tooltip="Line"
              title="Line"
              onClick={() => setPaintMode("line")}
            >
              <Minus size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Circle tool"
              aria-pressed={paintMode === "circle"}
              data-selected={paintMode === "circle" ? "true" : undefined}
              data-glyph-tooltip="Circle"
              title="Circle"
              onClick={() => setPaintMode("circle")}
            >
              <Circle size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Move ink tool"
              aria-pressed={paintMode === "move"}
              data-selected={paintMode === "move" ? "true" : undefined}
              data-glyph-tooltip="Move ink"
              title="Move ink"
              onClick={() => setPaintMode("move")}
            >
              <Move size={15} aria-hidden="true" />
            </button>
          </div>
          <div
            role="group"
            aria-label="Stroke size"
            className={styles.brushSizes}
          >
            {AVATAR_DETAILS_BRUSH_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-label={`${size} pixel stroke`}
                aria-pressed={brushSize === size}
                data-selected={brushSize === size ? "true" : undefined}
                disabled={paintMode === "move"}
                onClick={() => setBrushSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.inkPalette}>
          <div className={styles.inkPaletteHeader}>
            <span>Ink behavior</span>
            <small>Colors are editing labels—not final colors.</small>
          </div>
          <div
            className={styles.inkRoleOptions}
            role="radiogroup"
            aria-label="Semantic ink color"
          >
            {AVATAR_DETAILS_INK_OPTIONS.map((option) => (
              <button
                key={option.role}
                type="button"
                role="radio"
                aria-checked={inkRole === option.role}
                data-selected={inkRole === option.role ? "true" : undefined}
                data-ink-role={option.role}
                onClick={() => setInkRole(option.role)}
              >
                <span
                  className={styles.inkRoleSwatch}
                  style={{
                    backgroundColor: AVATAR_DETAILS_INK_ROLE_COLORS[option.role],
                  }}
                  aria-hidden="true"
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            ))}
          </div>
          <div className={styles.runtimeColorNote}>
            <span style={runtimeColorPreviewStyle} aria-hidden="true" />
            <small>
              On the bot, every ink color becomes its normalized bot color.
            </small>
          </div>
        </div>

        <div className={styles.canvasFrame}>
          <span
            className={`${pageStyles.zenLiveBotPresenceFaceRig} ${styles.faceGuide}`}
            style={faceGuideStyle}
            data-avatar-details-face-guide="true"
            data-visible={faceGuideVisible ? "true" : "false"}
            aria-hidden="true"
          >
            <CoffeeSeatPlateEmoji
              enabled={false}
              isTalking={false}
              scheduleKey="avatar-details-neutral-guide"
              baseText={AVATAR_DETAILS_NEUTRAL_FACE.text}
              rotateDeg={AVATAR_DETAILS_NEUTRAL_FACE.rotateDeg}
              voicePreset="warm"
              faceEyesFont={faceStyle.eyesFont}
              faceEyeCharacter={faceStyle.eyeCharacter}
              faceMouthFont={faceStyle.mouthFont}
              faceMouthCharacter={faceStyle.mouthCharacter}
              faceMouthAnimation={faceStyle.mouthAnimation}
              faceFontWeight={faceStyle.weight}
              faceEyeScale={faceStyle.eyeScale}
              faceEyeOffsetX={faceStyle.eyeOffsetX}
              faceEyeOffsetY={faceStyle.eyeOffsetY}
              faceEyeRotationDeg={faceStyle.eyeRotationDeg}
              faceEyeCount={faceStyle.eyeCount}
              faceMouthScale={faceStyle.mouthScale}
              faceMouthOffsetX={faceStyle.mouthOffsetX}
              faceMouthOffsetY={faceStyle.mouthOffsetY}
              faceMouthRotationDeg={faceStyle.mouthRotationDeg}
              faceBlinkBar={faceStyle.blinkBar}
              faceBlinkScale={faceStyle.blinkScale}
              faceBlinkOffsetX={faceStyle.blinkOffsetX}
              faceBlinkOffsetY={faceStyle.blinkOffsetY}
              faceThinkingFrames={faceStyle.thinkingFrames}
              forceBlinkPhase="open"
              className={`${pageStyles.coffeeSeatPlateEmoji} ${pageStyles.zenLiveBotPresenceFaceGlyph} ${styles.faceGuideGlyph}`}
            />
          </span>
          <div className={styles.canvasViewport}>
            <canvas
              ref={screenGuideRef}
              className={styles.screenBoundary}
              width={AVATAR_DETAILS_CANVAS_SIZE}
              height={AVATAR_DETAILS_CANVAS_SIZE}
              data-avatar-details-writable-guide="true"
              aria-hidden="true"
            />
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              width={AVATAR_DETAILS_CANVAS_SIZE}
              height={AVATAR_DETAILS_CANVAS_SIZE}
              data-avatar-details-editor-core="true"
              aria-hidden="true"
            />
            <div
              className={styles.inputSurface}
              data-tool={paintMode}
              data-dragging={pointerActive ? "true" : undefined}
              role="application"
              aria-label={`Avatar pixel canvas. ${inkRole} ink, ${paintMode}, ${brushSize} pixel size. ${canvasInstruction}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointerStroke}
              onPointerCancel={finishPointerStroke}
            />
          </div>
        </div>

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
            {paintedPixels.toLocaleString()} /{" "}
            {AVATAR_DETAILS_MAX_PAINT_PIXELS.toLocaleString()} pixels
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
          <button
            type="button"
            className={styles.cancelButton}
            onClick={cancelWorkingCopy}
            disabled={!dirty || applying}
          >
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
