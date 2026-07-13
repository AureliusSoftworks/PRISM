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
import type { BotFaceStyle } from "@localai/shared";
import { Brush, Eraser, Eye, EyeOff, Redo2, Trash2, Undo2 } from "lucide-react";

import {
  AVATAR_DETAILS_BRUSH_SIZES,
  AVATAR_DETAILS_CANVAS_SIZE,
  AVATAR_DETAILS_MASK_BYTE_LENGTH,
  AVATAR_DETAILS_MAX_PAINT_PIXELS,
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
  normalizeAvatarDetails,
  normalizeAvatarDetailsColor,
  paintAvatarDetailsMask,
  rasterizeAvatarDetailsRgba,
  type AvatarDetailsBrushSize,
  type AvatarDetailsGridPoint,
  type AvatarDetailsPaintMode,
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
  lastPoint: AvatarDetailsGridPoint;
  before: AvatarDetailsV1;
  changed: boolean;
}

function pointerGridPoint(
  event: Pick<
    PointerEvent<HTMLCanvasElement>,
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
  const [paintMode, setPaintMode] = useState<AvatarDetailsPaintMode>("brush");
  const [brushSize, setBrushSize] = useState<AvatarDetailsBrushSize>(3);
  const [keyboardCursor, setKeyboardCursor] = useState<AvatarDetailsGridPoint>({
    x: 64,
    y: 64,
  });
  const [canvasFocused, setCanvasFocused] = useState(false);
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
      const current = workingRef.current;
      const currentMask =
        decodeAvatarDetailsPaintMask(current.screen.paintMaskBase64) ??
        new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
      const result = paintAvatarDetailsMask(
        currentMask,
        points,
        brushSize,
        paintMode,
      );
      setLimitReached(result.limitReached);
      if (!result.changed) return false;
      const next = normalizeAvatarDetails({
        ...current,
        screen: {
          ...current.screen,
          paintMaskBase64: encodeAvatarDetailsPaintMask(result.mask),
        },
      });
      updateWorking(next);
      return true;
    },
    [brushSize, paintMode, updateWorking],
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
      const point = avatarDetailsGridPointFromClient(
        sample.clientX,
        sample.clientY,
        bounds,
      );
      stroke.changed =
        paintPoints(interpolateAvatarDetailsGridLine(previous, point)) ||
        stroke.changed;
      previous = point;
    }
    stroke.lastPoint = previous;
    setKeyboardCursor(previous);
    event.preventDefault();
  };

  const finishPointerStroke = (
    event: PointerEvent<HTMLCanvasElement>,
  ): void => {
    const stroke = pointerStrokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    pointerStrokeRef.current = null;
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
        workingRef.current,
      ),
    );
  };

  const handleCanvasKeyDown = (
    event: KeyboardEvent<HTMLCanvasElement>,
  ): void => {
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

  const cursorStyle = {
    "--avatar-details-cursor-x": `${keyboardCursor.x + 0.5}`,
    "--avatar-details-cursor-y": `${keyboardCursor.y + 0.5}`,
    "--avatar-details-cursor-size": `${brushSize}`,
  } as CSSProperties;

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
          </div>
          <div
            role="group"
            aria-label="Brush size"
            className={styles.brushSizes}
          >
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
          Keyboard: arrows move, Shift moves 5, Space paints, B/E switch tools,
          1/3/5 size.
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
