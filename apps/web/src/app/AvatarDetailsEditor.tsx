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
  AVATAR_DETAILS_MASK_BYTE_LENGTH,
  AVATAR_DETAILS_MAX_PAINT_PIXELS,
  avatarDetailsCirclePoints,
  avatarDetailsGridPointFromClient,
  avatarDetailsEqual,
  avatarDetailsKey,
  avatarDetailsPhosphorCoreRgba,
  avatarDetailsWritablePixel,
  avatarDetailsPaintCoveragePercent,
  avatarDetailsPaintPixelCount,
  cloneAvatarDetails,
  decodeAvatarDetailsPaintMask,
  encodeAvatarDetailsPaintMask,
  interpolateAvatarDetailsGridLine,
  moveAvatarDetailsPaintMask,
  normalizeAvatarDetails,
  normalizeAvatarDetailsColor,
  paintAvatarDetailsMask,
  rasterizeAvatarDetailsRgba,
  setAvatarDetailsHideInkDuringBlink,
  type AvatarDetailsBrushSize,
  type AvatarDetailsGridPoint,
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

export interface AvatarDetailsEditorHandle {
  apply(): Promise<boolean>;
  cancel(): void;
  hasDirtyChanges(): boolean;
}

export interface AvatarDetailsEditorProps {
  value: AvatarDetailsV1 | null | undefined;
  accentColor: string;
  faceStyle: BotFaceStyle;
  onApply: (details: AvatarDetailsV1) => void | Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPreviewChange?: (details: AvatarDetailsV1) => void;
}

interface AvatarDetailsPointerStroke {
  pointerId: number;
  tool: AvatarDetailsTool;
  startPoint: AvatarDetailsGridPoint;
  lastPoint: AvatarDetailsGridPoint;
  before: AvatarDetailsV1;
  beforeMask: Uint8Array;
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

function avatarDetailsWithPaintMask(
  details: AvatarDetailsV1,
  mask: Uint8Array,
): AvatarDetailsV1 {
  return normalizeAvatarDetails({
    ...details,
    screen: {
      ...details.screen,
      paintMaskBase64: encodeAvatarDetailsPaintMask(mask),
    },
  });
}

const AvatarDetailsEditorSession = forwardRef<
  AvatarDetailsEditorHandle,
  AvatarDetailsEditorProps
>(function AvatarDetailsEditorSession(
  {
    value,
    accentColor,
    faceStyle,
    onApply,
    onCancel,
    onDirtyChange,
    onPreviewChange,
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
  const [brushSize, setBrushSize] = useState<AvatarDetailsBrushSize>(3);
  const [pointerActive, setPointerActive] = useState(false);
  const [faceGuideVisible, setFaceGuideVisible] = useState(true);
  const [limitReached, setLimitReached] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintHaloCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintBloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const paintMask =
    decodeAvatarDetailsPaintMask(working.screen.paintMaskBase64) ??
    new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
  const paintedPixels = avatarDetailsPaintPixelCount(paintMask);
  const coveragePercent = avatarDetailsPaintCoveragePercent(paintMask);
  const faceGuideStyle = {
    "--zen-live-bot-face-x": `${BOT_AVATAR_SCREEN_EDITOR_FACE_PLACEMENT.xPct}%`,
    "--zen-live-bot-face-y": `${BOT_AVATAR_SCREEN_EDITOR_FACE_PLACEMENT.yPct}%`,
    "--zen-live-bot-face-scale": BOT_AVATAR_SCREEN_EDITOR_FACE_PLACEMENT.scale,
    "--zen-live-bot-avatar-face-glyph-size": `${BOT_AVATAR_SCREEN_EDITOR_FACE_GLYPH_FRAME_RATIO * 100}cqw`,
    "--coffee-plate-emoji-face-scale-y": BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
    "--avatar-details-facing-scale-x": "1",
    zIndex: 1,
  } as CSSProperties;
  const phosphorGlowStyle = { color: normalizedAccentColor } as CSSProperties;

  const updateWorking = useCallback((next: AvatarDetailsV1): void => {
    const normalized = normalizeAvatarDetails(next);
    workingRef.current = normalized;
    setWorking(normalized);
    queuePreviewRef.current(normalized);
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
    const colorValue = Number.parseInt(normalizedAccentColor.slice(1), 16);
    const red = (colorValue >>> 16) & 255;
    const green = (colorValue >>> 8) & 255;
    const blue = colorValue & 255;
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
        imageData.data[index] = boundary ? red : writable ? 255 : 0;
        imageData.data[index + 1] = boundary ? green : writable ? 255 : 0;
        imageData.data[index + 2] = boundary ? blue : writable ? 255 : 0;
        imageData.data[index + 3] = boundary ? 86 : writable ? 7 : 92;
      }
    }
    context.putImageData(imageData, 0, 0);
  }, [normalizedAccentColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const haloCanvas = paintHaloCanvasRef.current;
    const bloomCanvas = paintBloomCanvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    const haloContext = haloCanvas?.getContext("2d", { alpha: true });
    const bloomContext = bloomCanvas?.getContext("2d", { alpha: true });
    if (!canvas || !context || !haloContext || !bloomContext) return;
    const pixels = rasterizeAvatarDetailsRgba(
      workingRef.current,
      normalizedAccentColor,
      faceStyle,
    );
    const glowImageData = context.createImageData(
      AVATAR_DETAILS_CANVAS_SIZE,
      AVATAR_DETAILS_CANVAS_SIZE,
    );
    glowImageData.data.set(pixels);
    const coreImageData = context.createImageData(
      AVATAR_DETAILS_CANVAS_SIZE,
      AVATAR_DETAILS_CANVAS_SIZE,
    );
    coreImageData.data.set(avatarDetailsPhosphorCoreRgba(pixels));
    for (const emissionContext of [haloContext, bloomContext]) {
      emissionContext.imageSmoothingEnabled = false;
      emissionContext.putImageData(glowImageData, 0, 0);
    }
    context.imageSmoothingEnabled = false;
    context.putImageData(coreImageData, 0, 0);
  }, [faceStyle, normalizedAccentColor, workingKey]);

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
    updateWorking(next);
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
      hasDirtyChanges: () =>
        !avatarDetailsEqual(workingRef.current, normalizedSource),
    }),
    [applyWorkingCopy, cancelWorkingCopy, normalizedSource],
  );

  const paintPoints = useCallback(
    (points: readonly AvatarDetailsGridPoint[]): boolean => {
      if (paintMode !== "brush" && paintMode !== "eraser") return false;
      const current = workingRef.current;
      const currentMask =
        decodeAvatarDetailsPaintMask(current.screen.paintMaskBase64) ??
        new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
      const mode: AvatarDetailsPaintMode = paintMode;
      const result = paintAvatarDetailsMask(
        currentMask,
        points,
        brushSize,
        mode,
      );
      setLimitReached(result.limitReached);
      if (!result.changed) return false;
      updateWorking(avatarDetailsWithPaintMask(current, result.mask));
      return true;
    },
    [brushSize, paintMode, updateWorking],
  );

  const previewCircleStroke = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      edge: AvatarDetailsGridPoint,
    ): boolean => {
      const result = paintAvatarDetailsMask(
        stroke.beforeMask,
        avatarDetailsCirclePoints(stroke.startPoint, edge),
        brushSize,
        "brush",
      );
      setLimitReached(result.limitReached);
      updateWorking(avatarDetailsWithPaintMask(stroke.before, result.mask));
      return result.changed;
    },
    [brushSize, updateWorking],
  );

  const previewLineStroke = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      edge: AvatarDetailsGridPoint,
    ): boolean => {
      const result = paintAvatarDetailsMask(
        stroke.beforeMask,
        interpolateAvatarDetailsGridLine(stroke.startPoint, edge),
        brushSize,
        "brush",
      );
      setLimitReached(result.limitReached);
      updateWorking(avatarDetailsWithPaintMask(stroke.before, result.mask));
      return result.changed;
    },
    [brushSize, updateWorking],
  );

  const previewMoveStroke = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      point: AvatarDetailsGridPoint,
    ): boolean => {
      const result = moveAvatarDetailsPaintMask(stroke.beforeMask, {
        x: point.x - stroke.startPoint.x,
        y: point.y - stroke.startPoint.y,
      });
      setLimitReached(false);
      updateWorking(avatarDetailsWithPaintMask(stroke.before, result.mask));
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
    const point = pointerGridPoint(event);
    event.currentTarget.focus();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Safari standalone web apps can reject pointer capture even while the
      // pointer remains active. Painting must still begin in that case.
    }
    const before = cloneAvatarDetails(workingRef.current);
    const beforeMask =
      decodeAvatarDetailsPaintMask(before.screen.paintMaskBase64) ??
      new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
    const stroke: AvatarDetailsPointerStroke = {
      pointerId: event.pointerId,
      tool: paintMode,
      startPoint: point,
      lastPoint: point,
      before,
      beforeMask,
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
    let previous = stroke.lastPoint;
    for (const sample of samples) {
      const point = avatarDetailsGridPointFromClient(
        sample.clientX,
        sample.clientY,
        bounds,
      );
      if (stroke.tool === "brush" || stroke.tool === "eraser") {
        stroke.changed =
          paintPoints(interpolateAvatarDetailsGridLine(previous, point)) ||
          stroke.changed;
      } else if (stroke.tool === "line") {
        stroke.changed = previewLineStroke(stroke, point);
      } else if (stroke.tool === "circle") {
        stroke.changed = previewCircleStroke(stroke, point);
      } else {
        stroke.changed = previewMoveStroke(stroke, point);
      }
      previous = point;
    }
    stroke.lastPoint = previous;
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
      );
    }
    flushPreview(workingRef.current);
    event.preventDefault();
  };

  const clearPaint = (): void => {
    if (workingRef.current.screen.paintMaskBase64 === null) return;
    commitMutation({
      ...workingRef.current,
      screen: { ...workingRef.current.screen, paintMaskBase64: null },
    });
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
    <section className={styles.editor} aria-label="Avatar details editor">
      <section className={styles.paintSection} aria-label="Pixel paint mask">
        <header className={styles.paintHeader}>
          <div>
            <strong>Screen editor</strong>
            <small>Front-facing · 128 × 128</small>
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
                disabled={working.screen.paintMaskBase64 === null}
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
            <button
              type="button"
              aria-pressed={paintMode === "line"}
              data-selected={paintMode === "line" ? "true" : undefined}
              onClick={() => setPaintMode("line")}
            >
              <Minus size={13} aria-hidden="true" />
              Line
            </button>
            <button
              type="button"
              aria-pressed={paintMode === "circle"}
              data-selected={paintMode === "circle" ? "true" : undefined}
              onClick={() => setPaintMode("circle")}
            >
              <Circle size={13} aria-hidden="true" />
              Circle
            </button>
            <button
              type="button"
              aria-pressed={paintMode === "move"}
              data-selected={paintMode === "move" ? "true" : undefined}
              onClick={() => setPaintMode("move")}
            >
              <Move size={13} aria-hidden="true" />
              Drag
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

        <label className={styles.blinkInkControl}>
          <input
            type="checkbox"
            checked={working.screen.hideInkDuringBlink === true}
            onChange={(event) => {
              commitMutation(
                setAvatarDetailsHideInkDuringBlink(
                  workingRef.current,
                  event.currentTarget.checked,
                ),
              );
            }}
          />
          <span>
            <strong>Hide ink while blinking</strong>
            <small>
              Temporarily hides drawn pupils, eyelashes, and other screen ink
              during the closed blink frame.
            </small>
          </span>
        </label>

        <div className={styles.canvasFrame}>
          <canvas
            ref={screenGuideRef}
            className={styles.screenBoundary}
            width={AVATAR_DETAILS_CANVAS_SIZE}
            height={AVATAR_DETAILS_CANVAS_SIZE}
            data-avatar-details-writable-guide="true"
            aria-hidden="true"
          />
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
          <canvas
            ref={paintHaloCanvasRef}
            className={`${styles.paintEmission} ${styles.paintHalo}`}
            width={AVATAR_DETAILS_CANVAS_SIZE}
            height={AVATAR_DETAILS_CANVAS_SIZE}
            style={phosphorGlowStyle}
            data-avatar-details-editor-emission="halo"
            aria-hidden="true"
          />
          <canvas
            ref={paintBloomCanvasRef}
            className={`${styles.paintEmission} ${styles.paintBloom}`}
            width={AVATAR_DETAILS_CANVAS_SIZE}
            height={AVATAR_DETAILS_CANVAS_SIZE}
            style={phosphorGlowStyle}
            data-avatar-details-editor-emission="bloom"
            aria-hidden="true"
          />
          <canvas
            ref={canvasRef}
            className={`${styles.canvas} ${styles.paintCore}`}
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
            aria-label={`Avatar pixel canvas. ${paintMode}, ${brushSize} pixel size. ${canvasInstruction}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerStroke}
            onPointerCancel={finishPointerStroke}
          />
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
