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
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  BOT_AVATAR_DETAILS_SPEECH_INK_ANIMATIONS,
  type BotAvatarDetailsSpeechInkAnimation,
  type BotFaceStyle,
} from "@localai/shared";
import {
  Brush,
  Check,
  Circle,
  Dices,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Minus,
  Move,
  PaintBucket,
  Play,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";

import {
  AVATAR_DETAILS_BRUSH_SIZES,
  AVATAR_DETAILS_CANVAS_SIZE,
  AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
  AVATAR_DETAILS_INK_ROLES,
  AVATAR_DETAILS_INK_ROLE_COLORS,
  AVATAR_DETAILS_MAX_PAINT_PIXELS,
  AVATAR_DETAILS_SYMMETRY_AXIS_X_DEFAULT,
  AVATAR_DETAILS_SYMMETRY_AXIS_X_MAX,
  AVATAR_DETAILS_SYMMETRY_AXIS_X_MIN,
  avatarDetailsCirclePoints,
  avatarDetailsGridPointFromClient,
  avatarDetailsEqual,
  avatarDetailsKey,
  avatarDetailsPaintColorCoveragePercent,
  avatarDetailsPaintColorPixelCount,
  avatarDetailsWithPaintColorMap,
  avatarDetailsWithSpeechInkAnimation,
  avatarDetailsWritablePixel,
  cloneAvatarDetails,
  decodeAvatarDetailsPaintColorMap,
  flattenLegacyAvatarDetailStampsToInk,
  interpolateAvatarDetailsGridLine,
  moveAvatarDetailsPaintColorMap,
  normalizeAvatarDetails,
  normalizeAvatarDetailsColor,
  normalizeAvatarDetailsSymmetryAxisX,
  paintAvatarDetailsColorMap,
  recolorAvatarDetailsPaintColorRegion,
  rasterizeAvatarDetailsSemanticRgba,
  symmetrizeAvatarDetailsGridPoints,
  type AvatarDetailsBrushSize,
  type AvatarDetailsGridPoint,
  type AvatarDetailsInkRole,
  type AvatarDetailsInkSelection,
  type AvatarDetailsTool,
  type AvatarDetailsV1,
} from "./avatar-details";
import {
  AVATAR_DETAIL_INK_TEMPLATE_LIMIT,
  AVATAR_DETAIL_INK_TEMPLATE_NAME_MAX_LENGTH,
  AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MAX,
  AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MIN,
  AVATAR_DETAIL_INK_TEMPLATE_SCALE_MAX,
  AVATAR_DETAIL_INK_TEMPLATE_SCALE_MIN,
  applyAvatarDetailInkTemplate,
  createAvatarDetailInkTemplate,
  filterAvatarDetailInkTemplates,
  loadAvatarDetailInkTemplates,
  rasterizeAvatarDetailInkTemplateRgba,
  renameAvatarDetailInkTemplate,
  saveAvatarDetailInkTemplates,
  type AvatarDetailInkTemplateV1,
} from "./avatar-detail-ink-templates";
import {
  BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
  BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE,
  BOT_AVATAR_DETAILS_INK_APERTURE_SCALE,
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
const AVATAR_DETAILS_INK_OPTIONS: ReadonlyArray<{
  role: AvatarDetailsInkSelection;
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
    description:
      "Uses its own animation below; Default hides while talking or sipping.",
  },
  {
    role: "effect",
    label: "Effect ink",
    description: "Hides only for full-screen face effects.",
  },
  {
    role: "erase",
    label: "Erase",
    description: "Removes ink with any drawing tool.",
  },
];

const AVATAR_DETAILS_SPEECH_INK_ANIMATION_LABELS: Record<
  BotAvatarDetailsSpeechInkAnimation,
  string
> = {
  none: "Default",
  pulsate: "Pulse",
  spin: "Spin",
  flicker: "Flicker",
  wobble: "Wobble",
};

export interface AvatarDetailsEditorHandle {
  apply(): Promise<boolean>;
  cancel(): void;
  hasDirtyChanges(): boolean;
  undo(): boolean;
  redo(): boolean;
  setEquippedStampPosition(next: Readonly<{ x: number; y: number }>): void;
  commitEquippedStamp(): boolean;
  cancelEquippedStamp(): boolean;
}

export interface AvatarDetailsEquippedStamp {
  templateId: string;
  name: string;
  offsetX: number;
  offsetY: number;
  scalePct: number;
}

export interface AvatarDetailsEditorProps {
  value: AvatarDetailsV1 | null | undefined;
  templateOwnerId: string;
  accentColor: string;
  faceStyle: BotFaceStyle;
  theme: "light" | "dark";
  onApply: (details: AvatarDetailsV1) => void | Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onPreviewChange?: (details: AvatarDetailsV1) => void;
  onLivePreview?: () => void;
  onEditStart?: () => void;
  onEquippedStampChange?: (stamp: AvatarDetailsEquippedStamp | null) => void;
  layout?: "panel" | "foundry";
  canvasPortalTarget?: HTMLElement | null;
  autoCommit?: boolean;
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

function AvatarDetailInkTemplatePreview({
  template,
}: {
  template: AvatarDetailInkTemplateV1;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;
    const imageData = context.createImageData(
      AVATAR_DETAILS_CANVAS_SIZE,
      AVATAR_DETAILS_CANVAS_SIZE,
    );
    imageData.data.set(rasterizeAvatarDetailInkTemplateRgba(template));
    context.imageSmoothingEnabled = false;
    context.putImageData(imageData, 0, 0);
  }, [template]);
  return (
    <canvas
      ref={canvasRef}
      width={AVATAR_DETAILS_CANVAS_SIZE}
      height={AVATAR_DETAILS_CANVAS_SIZE}
      aria-hidden="true"
    />
  );
}

const AvatarDetailsEditorSession = forwardRef<
  AvatarDetailsEditorHandle,
  AvatarDetailsEditorProps
>(function AvatarDetailsEditorSession(
  {
    value,
    templateOwnerId,
    accentColor,
    faceStyle,
    theme,
    onApply,
    onCancel,
    onDirtyChange,
    onPreviewChange,
    onLivePreview,
    onEditStart,
    onEquippedStampChange,
    layout = "panel",
    canvasPortalTarget = null,
    autoCommit = false,
  },
  ref,
): React.JSX.Element {
  const normalizedValue = useMemo(() => normalizeAvatarDetails(value), [value]);
  const legacyFlattenResult = useMemo(
    () => flattenLegacyAvatarDetailStampsToInk(normalizedValue, faceStyle),
    [faceStyle, normalizedValue],
  );
  const normalizedSource = legacyFlattenResult.details;
  const [working, setWorking] = useState<AvatarDetailsV1>(() =>
    cloneAvatarDetails(normalizedSource),
  );
  const workingRef = useRef(working);
  const [undoHistory, setUndoHistory] = useState<AvatarDetailsV1[]>([]);
  const [redoHistory, setRedoHistory] = useState<AvatarDetailsV1[]>([]);
  const undoHistoryRef = useRef<readonly AvatarDetailsV1[]>(undoHistory);
  const redoHistoryRef = useRef<readonly AvatarDetailsV1[]>(redoHistory);
  const [paintMode, setPaintMode] = useState<AvatarDetailsTool>("brush");
  const [inkRole, setInkRole] =
    useState<AvatarDetailsInkSelection>("effect");
  const [brushSize, setBrushSize] = useState<AvatarDetailsBrushSize>(3);
  const [symmetryEnabled, setSymmetryEnabled] = useState(false);
  const [symmetryAxisX, setSymmetryAxisX] = useState(
    AVATAR_DETAILS_SYMMETRY_AXIS_X_DEFAULT,
  );
  const [pointerActive, setPointerActive] = useState(false);
  const [faceGuideVisible, setFaceGuideVisible] = useState(true);
  const [limitReached, setLimitReached] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [inkTemplates, setInkTemplates] = useState<
    AvatarDetailInkTemplateV1[]
  >([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [equippedTemplateId, setEquippedTemplateId] = useState<string | null>(
    null,
  );
  const [templateOffsetX, setTemplateOffsetX] = useState(0);
  const [templateOffsetY, setTemplateOffsetY] = useState(0);
  const [templateScalePct, setTemplateScalePct] = useState(100);
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stampPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const screenGuideRef = useRef<HTMLCanvasElement | null>(null);
  const inputSurfaceRef = useRef<HTMLDivElement | null>(null);
  const pointerStrokeRef = useRef<AvatarDetailsPointerStroke | null>(null);
  const symmetryAxisPointerRef = useRef<number | null>(null);
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
  const faceGuideStyle = {
    ...BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE,
    "--coffee-plate-emoji-nudge-y": "clamp(-5px, -2.6%, -2px)",
    "--coffee-plate-emoji-face-scale-y": BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
    "--avatar-details-facing-scale-x": "1",
    "--zen-live-bot-face-ink": guideInk,
    "--zen-live-bot-face-crt-border-color": guideInk,
    "--coffee-bot-color": guideInk,
    "--coffee-seat-emotion-color": guideInk,
    zIndex: 1,
  } as CSSProperties;
  const inkApertureStyle = {
    "--avatar-details-ink-aperture-scale":
      BOT_AVATAR_DETAILS_INK_APERTURE_SCALE,
  } as CSSProperties;
  const symmetryGuideStyle = {
    "--avatar-details-symmetry-axis-left": `${
      ((symmetryAxisX + 0.5) / AVATAR_DETAILS_CANVAS_SIZE) * 100
    }%`,
  } as CSSProperties;
  const runtimeColorPreviewStyle = {
    backgroundColor: normalizedAccentColor,
  } as CSSProperties;
  const selectedTemplate =
    inkTemplates.find((template) => template.id === selectedTemplateId) ?? null;
  const equippedTemplate =
    inkTemplates.find((template) => template.id === equippedTemplateId) ?? null;
  const normalizedTemplateQuery = templateName.trim().toLowerCase();
  const filteredInkTemplates = filterAvatarDetailInkTemplates(
    inkTemplates,
    templateName,
  );
  const stampNameAlreadyExists = inkTemplates.some(
    (template) =>
      template.name.toLowerCase() === normalizedTemplateQuery,
  );
  const equippedStamp = useMemo<AvatarDetailsEquippedStamp | null>(
    () =>
      equippedTemplate
        ? {
            templateId: equippedTemplate.id,
            name: equippedTemplate.name,
            offsetX: templateOffsetX,
            offsetY: templateOffsetY,
            scalePct: templateScalePct,
          }
        : null,
    [
      equippedTemplate,
      templateOffsetX,
      templateOffsetY,
      templateScalePct,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loaded = loadAvatarDetailInkTemplates(
      templateOwnerId,
      window.localStorage,
    );
    setInkTemplates(loaded);
    setSelectedTemplateId((current) =>
      current && loaded.some((template) => template.id === current)
        ? current
        : null,
    );
  }, [templateOwnerId]);

  useEffect(() => {
    setSelectedTemplateName(selectedTemplate?.name ?? "");
  }, [selectedTemplate?.name]);

  useEffect(() => {
    onEquippedStampChange?.(equippedStamp);
  }, [equippedStamp, onEquippedStampChange]);

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

  useEffect(() => {
    // Foundry auto-commit mirrors the parent source into the editor. Never do
    // that while a pointer stroke is open: deferred single-click / bucket paint
    // lives in workingRef until pointerup, and a mid-stroke reset erases it.
    if (
      !autoCommit ||
      pointerStrokeRef.current ||
      avatarDetailsEqual(workingRef.current, normalizedSource)
    ) {
      return;
    }
    resetHistory();
    updateWorking(cloneAvatarDetails(normalizedSource));
    setLimitReached(false);
    setApplyError(null);
  }, [autoCommit, normalizedSource, resetHistory, updateWorking]);

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

  useEffect(() => {
    const canvas = stampPreviewRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!equippedTemplate) return;
    const preview = applyAvatarDetailInkTemplate(
      normalizeAvatarDetails(null),
      equippedTemplate,
      {
        offsetX: templateOffsetX,
        offsetY: templateOffsetY,
        scalePct: templateScalePct,
      },
    );
    const imageData = context.createImageData(
      AVATAR_DETAILS_CANVAS_SIZE,
      AVATAR_DETAILS_CANVAS_SIZE,
    );
    imageData.data.set(
      rasterizeAvatarDetailsSemanticRgba(preview.details, faceStyle),
    );
    context.imageSmoothingEnabled = false;
    context.putImageData(imageData, 0, 0);
  }, [
    equippedTemplate,
    faceStyle,
    templateOffsetX,
    templateOffsetY,
    templateScalePct,
  ]);

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
      if (autoCommit) {
        void Promise.resolve(onApply(cloneAvatarDetails(next))).catch(
          (error: unknown) => {
            setApplyError(
              error instanceof Error
                ? error.message
                : "Avatar details could not be updated.",
            );
          },
        );
      }
      setLimitReached(false);
    },
    [applyHistoryTransition, autoCommit, onApply],
  );

  const persistInkTemplates = useCallback(
    (nextTemplates: readonly AvatarDetailInkTemplateV1[]): boolean => {
      if (typeof window === "undefined") return false;
      try {
        setInkTemplates(
          saveAvatarDetailInkTemplates(
            templateOwnerId,
            nextTemplates,
            window.localStorage,
          ),
        );
        return true;
      } catch {
        setTemplateStatus("This device could not save the stamp library.");
        return false;
      }
    },
    [templateOwnerId],
  );

  const equipInkStamp = useCallback(
    (template: AvatarDetailInkTemplateV1): void => {
      setSelectedTemplateId(template.id);
      setEquippedTemplateId(template.id);
      setTemplateOffsetX(0);
      setTemplateOffsetY(0);
      setTemplateScalePct(100);
      setTemplateStatus(
        `Equipped “${template.name}”. Position it with the grid pad, then click the canvas or press Enter.`,
      );
      window.requestAnimationFrame(() => inputSurfaceRef.current?.focus());
    },
    [],
  );

  const setEquippedStampPosition = useCallback(
    (next: Readonly<{ x: number; y: number }>): void => {
      if (!equippedTemplateId) return;
      setTemplateOffsetX(
        Math.max(
          AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MIN,
          Math.min(AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MAX, Math.round(next.x)),
        ),
      );
      setTemplateOffsetY(
        Math.max(
          AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MIN,
          Math.min(AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MAX, Math.round(next.y)),
        ),
      );
    },
    [equippedTemplateId],
  );

  const adjustEquippedStampScale = useCallback(
    (step: number): void => {
      if (!equippedTemplateId) return;
      setTemplateScalePct((current) =>
        Math.max(
          AVATAR_DETAIL_INK_TEMPLATE_SCALE_MIN,
          Math.min(
            AVATAR_DETAIL_INK_TEMPLATE_SCALE_MAX,
            Math.round((current + step) / 5) * 5,
          ),
        ),
      );
    },
    [equippedTemplateId],
  );

  const cancelEquippedStamp = useCallback((): boolean => {
    if (!equippedTemplate) return false;
    setEquippedTemplateId(null);
    setTemplateStatus(`Canceled “${equippedTemplate.name}” placement.`);
    return true;
  }, [equippedTemplate]);

  const commitEquippedStamp = useCallback((): boolean => {
    if (!equippedTemplate) return false;
    const result = applyAvatarDetailInkTemplate(
      workingRef.current,
      equippedTemplate,
      {
        offsetX: templateOffsetX,
        offsetY: templateOffsetY,
        scalePct: templateScalePct,
      },
    );
    setLimitReached(result.limitReached);
    if (result.limitReached) {
      setTemplateStatus("Erase some ink before placing this stamp.");
      return false;
    }
    if (!result.changed) {
      setTemplateStatus("That stamp is already present at this position.");
      return false;
    }
    onEditStart?.();
    commitMutation(result.details);
    setEquippedTemplateId(null);
    setTemplateStatus(
      `Placed “${equippedTemplate.name}” as editable ink. Use Move if you want to reposition it.`,
    );
    return true;
  }, [
    commitMutation,
    equippedTemplate,
    onEditStart,
    templateOffsetX,
    templateOffsetY,
    templateScalePct,
  ]);

  const saveCurrentInkTemplate = (): void => {
    if (inkTemplates.length >= AVATAR_DETAIL_INK_TEMPLATE_LIMIT) {
      setTemplateStatus(
        `The stamp library can hold ${AVATAR_DETAIL_INK_TEMPLATE_LIMIT} stamps.`,
      );
      return;
    }
    const template = createAvatarDetailInkTemplate(
      workingRef.current,
      templateName,
    );
    if (!template) {
      setTemplateStatus(
        templateName.trim()
          ? "Draw some ink before saving a stamp."
          : "Name this stamp before saving it.",
      );
      return;
    }
    if (!persistInkTemplates([...inkTemplates, template])) return;
    setTemplateName("");
    equipInkStamp(template);
    setTemplateStatus(`Saved and equipped “${template.name}”.`);
  };

  const saveSelectedTemplateName = (): void => {
    if (!selectedTemplate) return;
    const renamed = renameAvatarDetailInkTemplate(
      selectedTemplate,
      selectedTemplateName,
    );
    if (
      !persistInkTemplates(
        inkTemplates.map((template) =>
          template.id === renamed.id ? renamed : template,
        ),
      )
    ) {
      return;
    }
    setSelectedTemplateName(renamed.name);
    setTemplateStatus(`Renamed the stamp to “${renamed.name}”.`);
  };

  const deleteSelectedInkTemplate = (): void => {
    if (!selectedTemplate) return;
    const nextTemplates = inkTemplates.filter(
      (template) => template.id !== selectedTemplate.id,
    );
    if (!persistInkTemplates(nextTemplates)) return;
    if (equippedTemplateId === selectedTemplate.id) {
      setEquippedTemplateId(null);
    }
    setSelectedTemplateId(nextTemplates[0]?.id ?? null);
    setTemplateStatus(`Removed “${selectedTemplate.name}” from your stamps.`);
  };

  const convertLegacyDetailsToInk = (): void => {
    const result = flattenLegacyAvatarDetailStampsToInk(
      workingRef.current,
      faceStyle,
    );
    if (result.limitReached) {
      setTemplateStatus(
        "Erase some authored ink before converting the older decoration.",
      );
      return;
    }
    if (!result.flattened) return;
    onEditStart?.();
    commitMutation(result.details);
    setTemplateStatus(
      "Converted the older decoration to ordinary editable ink.",
    );
  };

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
    if (autoCommit) void onApply(cloneAvatarDetails(next.working));
    setLimitReached(false);
    return true;
  }, [applyHistoryTransition, autoCommit, onApply, onEditStart]);

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
    if (autoCommit) void onApply(cloneAvatarDetails(next.working));
    setLimitReached(false);
    return true;
  }, [applyHistoryTransition, autoCommit, onApply, onEditStart]);

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
      setEquippedStampPosition,
      commitEquippedStamp,
      cancelEquippedStamp,
      hasDirtyChanges: () =>
        !avatarDetailsEqual(workingRef.current, normalizedSource),
    }),
    [
      applyWorkingCopy,
      cancelEquippedStamp,
      cancelWorkingCopy,
      commitEquippedStamp,
      normalizedSource,
      redo,
      setEquippedStampPosition,
      undo,
    ],
  );

  const paintPoints = useCallback(
    (points: readonly AvatarDetailsGridPoint[]): boolean => {
      if (paintMode !== "brush") return false;
      const current = workingRef.current;
      const currentColorMap =
        decodeAvatarDetailsPaintColorMap(
          current.screen.paintColorMapBase64,
        ) ?? new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
      const result = paintAvatarDetailsColorMap(
        currentColorMap,
        symmetryEnabled
          ? symmetrizeAvatarDetailsGridPoints(points, symmetryAxisX)
          : points,
        brushSize,
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
    [
      brushSize,
      inkRole,
      paintMode,
      symmetryAxisX,
      symmetryEnabled,
      updateWorking,
    ],
  );

  const previewCircleStroke = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      edge: AvatarDetailsGridPoint,
    ): boolean => {
      const result = paintAvatarDetailsColorMap(
        stroke.beforeColorMap,
        symmetryEnabled
          ? symmetrizeAvatarDetailsGridPoints(
              avatarDetailsCirclePoints(stroke.startPoint, edge),
              symmetryAxisX,
            )
          : avatarDetailsCirclePoints(stroke.startPoint, edge),
        brushSize,
        inkRole,
      );
      setLimitReached(result.limitReached);
      updateWorking(
        avatarDetailsWithPaintColorMap(stroke.before, result.colorMap),
        { publishPreview: false, deferRender: true },
      );
      return result.changed;
    },
    [brushSize, inkRole, symmetryAxisX, symmetryEnabled, updateWorking],
  );

  const previewLineStroke = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      edge: AvatarDetailsGridPoint,
    ): boolean => {
      const result = paintAvatarDetailsColorMap(
        stroke.beforeColorMap,
        symmetryEnabled
          ? symmetrizeAvatarDetailsGridPoints(
              interpolateAvatarDetailsGridLine(stroke.startPoint, edge),
              symmetryAxisX,
            )
          : interpolateAvatarDetailsGridLine(stroke.startPoint, edge),
        brushSize,
        inkRole,
      );
      setLimitReached(result.limitReached);
      updateWorking(
        avatarDetailsWithPaintColorMap(stroke.before, result.colorMap),
        { publishPreview: false, deferRender: true },
      );
      return result.changed;
    },
    [brushSize, inkRole, symmetryAxisX, symmetryEnabled, updateWorking],
  );

  const previewMoveStroke = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      point: AvatarDetailsGridPoint,
    ): boolean => {
      const result = moveAvatarDetailsPaintColorMap(stroke.beforeColorMap, {
        x: point.x - stroke.startPoint.x,
        y: point.y - stroke.startPoint.y,
      }, inkRole === "erase" ? "all" : inkRole);
      setLimitReached(false);
      updateWorking(
        avatarDetailsWithPaintColorMap(stroke.before, result.colorMap),
        { publishPreview: false, deferRender: true },
      );
      return result.changed;
    },
    [inkRole, updateWorking],
  );

  const applyBucket = useCallback(
    (
      stroke: AvatarDetailsPointerStroke,
      point: AvatarDetailsGridPoint,
    ): boolean => {
      const targets = symmetryEnabled
        ? symmetrizeAvatarDetailsGridPoints([point], symmetryAxisX)
        : [point];
      let colorMap = stroke.beforeColorMap;
      let changed = false;
      for (const target of targets) {
        const result = recolorAvatarDetailsPaintColorRegion(
          colorMap,
          target,
          inkRole,
        );
        colorMap = result.colorMap;
        changed ||= result.changed;
      }
      setLimitReached(false);
      if (!changed) return false;
      updateWorking(
        avatarDetailsWithPaintColorMap(stroke.before, colorMap),
        { publishPreview: false, deferRender: true },
      );
      return true;
    },
    [inkRole, symmetryAxisX, symmetryEnabled, updateWorking],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (
      (event.button !== 0 && (event.buttons & 1) === 0) ||
      event.isPrimary === false
    )
      return;
    if (equippedTemplate) {
      event.currentTarget.focus();
      commitEquippedStamp();
      event.preventDefault();
      return;
    }
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
    if (stroke.tool === "brush") {
      stroke.changed = paintPoints([point]);
    } else if (stroke.tool === "bucket") {
      stroke.changed = applyBucket(stroke, point);
    } else if (stroke.tool === "line") {
      stroke.changed = previewLineStroke(stroke, point);
    } else if (stroke.tool === "circle") {
      stroke.changed = previewCircleStroke(stroke, point);
    }
    event.preventDefault();
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>): void => {
    if (!equippedTemplate || event.deltaY === 0) return;
    adjustEquippedStampScale(event.deltaY < 0 ? 5 : -5);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!equippedTemplate) return;
    if (event.key === "Enter") {
      commitEquippedStamp();
    } else if (event.key === "Escape") {
      cancelEquippedStamp();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
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
    if (stroke.tool === "brush") {
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
    } else if (stroke.tool === "move") {
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
    if (
      autoCommit &&
      stroke.changed &&
      !avatarDetailsEqual(stroke.before, workingRef.current)
    ) {
      void onApply(cloneAvatarDetails(workingRef.current));
    }
    event.preventDefault();
  };

  const moveSymmetryAxisToClientX = useCallback((clientX: number): void => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const seamX = Math.round(
      ((clientX - bounds.left) / Math.max(1, bounds.width)) *
        AVATAR_DETAILS_CANVAS_SIZE,
    );
    setSymmetryAxisX(normalizeAvatarDetailsSymmetryAxisX(seamX - 0.5));
  }, []);

  const beginSymmetryAxisDrag = (
    event: PointerEvent<HTMLDivElement>,
  ): void => {
    if (
      !symmetryEnabled ||
      (event.button !== 0 && (event.buttons & 1) === 0) ||
      event.isPrimary === false
    ) {
      return;
    }
    symmetryAxisPointerRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // The axis remains usable without capture in older webviews.
    }
    moveSymmetryAxisToClientX(event.clientX);
    event.preventDefault();
    event.stopPropagation();
  };

  const moveSymmetryAxisDrag = (
    event: PointerEvent<HTMLDivElement>,
  ): void => {
    if (symmetryAxisPointerRef.current !== event.pointerId) return;
    moveSymmetryAxisToClientX(event.clientX);
    event.preventDefault();
    event.stopPropagation();
  };

  const finishSymmetryAxisDrag = (
    event: PointerEvent<HTMLDivElement>,
  ): void => {
    if (symmetryAxisPointerRef.current !== event.pointerId) return;
    symmetryAxisPointerRef.current = null;
    moveSymmetryAxisToClientX(event.clientX);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is optional in test and older browser environments.
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSymmetryAxisKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ): void => {
    const step = event.shiftKey ? 8 : 1;
    if (event.key === "ArrowLeft") {
      setSymmetryAxisX((axisX) =>
        normalizeAvatarDetailsSymmetryAxisX(axisX - step),
      );
    } else if (event.key === "ArrowRight") {
      setSymmetryAxisX((axisX) =>
        normalizeAvatarDetailsSymmetryAxisX(axisX + step),
      );
    } else if (event.key === "Home") {
      setSymmetryAxisX(AVATAR_DETAILS_SYMMETRY_AXIS_X_MIN);
    } else if (event.key === "End") {
      setSymmetryAxisX(AVATAR_DETAILS_SYMMETRY_AXIS_X_MAX);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
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

  const randomizeInkRecipe = (): void => {
    onEditStart?.();
    let colorMap: Uint8Array<ArrayBufferLike> = new Uint8Array(
      AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
    );
    const strokeCount = 3 + Math.floor(Math.random() * 3);
    for (let index = 0; index < strokeCount; index += 1) {
      const role: AvatarDetailsInkRole = AVATAR_DETAILS_INK_ROLES[
        Math.floor(Math.random() * AVATAR_DETAILS_INK_ROLES.length)
      ] ?? "effect";
      const brushSize = AVATAR_DETAILS_BRUSH_SIZES[
        Math.floor(Math.random() * AVATAR_DETAILS_BRUSH_SIZES.length)
      ] ?? 3;
      const start = {
        x: 25 + Math.floor(Math.random() * 78),
        y: 22 + Math.floor(Math.random() * 84),
      };
      const end = {
        x: 25 + Math.floor(Math.random() * 78),
        y: 22 + Math.floor(Math.random() * 84),
      };
      const points =
        index % 2 === 0
          ? interpolateAvatarDetailsGridLine(start, end)
          : avatarDetailsCirclePoints(start, end);
      colorMap = paintAvatarDetailsColorMap(
        colorMap,
        points,
        brushSize,
        role,
      ).colorMap;
    }
    commitMutation(avatarDetailsWithPaintColorMap(workingRef.current, colorMap));
  };

  const canvasInstruction = equippedTemplate
    ? `${equippedTemplate.name} stamp equipped at ${templateScalePct} percent. Use the grid pad to position it, scroll or use plus and minus to resize, click or press Enter to place, or press Escape to cancel.`
    : `${
        paintMode === "move"
          ? inkRole === "erase"
            ? "Drag to move all ink."
            : `Drag to move only ${AVATAR_DETAILS_INK_OPTIONS.find((option) => option.role === inkRole)?.label ?? "the selected ink"}.`
          : paintMode === "bucket"
            ? inkRole === "erase"
              ? "Click a painted region to erase it."
              : "Click a painted region to change its ink behavior."
          : paintMode === "line"
            ? "Drag between two points to draw a straight line."
            : paintMode === "circle"
              ? "Drag from the center to draw a circle."
              : "Drag to paint on the screen."
      }${
        symmetryEnabled
          ? ` Vertical symmetry is on at column ${Math.round(symmetryAxisX + 0.5)}.`
          : ""
      }`;

  const canvasEditor = (
    <div className={styles.canvasFrame} data-foundry-canvas={layout === "foundry" ? "true" : undefined}>
      <div
        className={styles.canvasViewport}
        style={inkApertureStyle}
        data-avatar-canonical-screen-size={AVATAR_DETAILS_CANVAS_SIZE}
      >
        <span
          className={`${pageStyles.zenLiveBotPresenceFaceRig} ${styles.faceGuide}`}
          style={faceGuideStyle}
          data-avatar-details-face-guide="true"
          data-visible={faceGuideVisible ? "true" : "false"}
          aria-hidden="true"
        >
          <CoffeeSeatPlateEmoji
            enabled={false}
            pixelated
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
            faceBlinkRotationDeg={faceStyle.blinkRotationDeg}
            faceThinkingFrames={faceStyle.thinkingFrames}
            faceThinkingScale={faceStyle.thinkingScale}
            faceThinkingOffsetX={faceStyle.thinkingOffsetX}
            faceThinkingOffsetY={faceStyle.thinkingOffsetY}
            forceBlinkPhase="open"
            className={`${pageStyles.coffeeSeatPlateEmoji} ${pageStyles.zenLiveBotPresenceFaceGlyph} ${styles.faceGuideGlyph}`}
          />
        </span>
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
        <canvas
          ref={stampPreviewRef}
          className={styles.stampPreview}
          width={AVATAR_DETAILS_CANVAS_SIZE}
          height={AVATAR_DETAILS_CANVAS_SIZE}
          data-avatar-details-stamp-preview="true"
          data-visible={equippedTemplate ? "true" : undefined}
          aria-hidden="true"
        />
        <span
          className={styles.pixelGrid}
          data-avatar-details-pixel-grid="true"
          aria-hidden="true"
        />
        <div
          className={styles.symmetryGuide}
          style={symmetryGuideStyle}
          data-visible={symmetryEnabled ? "true" : "false"}
          role="slider"
          tabIndex={symmetryEnabled ? 0 : -1}
          aria-label="Vertical symmetry axis"
          aria-orientation="horizontal"
          aria-valuemin={Math.round(AVATAR_DETAILS_SYMMETRY_AXIS_X_MIN + 0.5)}
          aria-valuemax={Math.round(AVATAR_DETAILS_SYMMETRY_AXIS_X_MAX + 0.5)}
          aria-valuenow={Math.round(symmetryAxisX + 0.5)}
          aria-valuetext={`${Math.round(symmetryAxisX + 0.5)} pixels from the left`}
          title="Drag either handle to move the symmetry axis"
          onPointerDown={beginSymmetryAxisDrag}
          onPointerMove={moveSymmetryAxisDrag}
          onPointerUp={finishSymmetryAxisDrag}
          onPointerCancel={finishSymmetryAxisDrag}
          onKeyDown={handleSymmetryAxisKeyDown}
        >
          <span
            className={`${styles.symmetryHandle} ${styles.symmetryHandleTop}`}
            aria-hidden="true"
          />
          <span
            className={`${styles.symmetryHandle} ${styles.symmetryHandleBottom}`}
            aria-hidden="true"
          />
        </div>
        <div
          ref={inputSurfaceRef}
          className={styles.inputSurface}
          data-tool={equippedTemplate ? "stamp" : paintMode}
          data-symmetry-enabled={symmetryEnabled ? "true" : undefined}
          data-dragging={pointerActive ? "true" : undefined}
          role="application"
          tabIndex={0}
          aria-label={`Avatar pixel canvas. ${equippedTemplate ? `${equippedTemplate.name} stamp equipped` : inkRole === "erase" ? "erase ink" : `${inkRole} ink`}, ${paintMode}, ${brushSize} pixel size. ${canvasInstruction}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerStroke}
          // Browsers (especially trackpad / touch) often fire pointercancel on a
          // tap. Reverting here wiped single-click brush stamps and bucket fills
          // before pointerup could commit them; treat cancel as stroke end.
          onPointerCancel={finishPointerStroke}
          onWheel={handleCanvasWheel}
          onKeyDown={handleCanvasKeyDown}
        />
      </div>
    </div>
  );

  return (
    <section
      className={styles.editor}
      data-editor-theme={theme}
      data-editor-layout={layout}
      aria-label="Avatar details editor"
    >
      <section className={styles.paintSection} aria-label="Semantic screen ink">
        <header className={styles.paintHeader}>
          <div>
            <strong>Screen editor</strong>
            <small>128 × 128 · Shell-scaled preview</small>
          </div>
          <div className={styles.paintHeaderActions}>
            {onLivePreview ? (
              <button
                type="button"
                className={styles.guideToggleButton}
                onClick={onLivePreview}
                aria-label="Preview animated avatar"
                title="Bring the avatar to life briefly without leaving Ink"
                data-avatar-details-live-preview="true"
              >
                <Play size={13} aria-hidden="true" />
                Preview live
              </button>
            ) : null}
            <button
              type="button"
              className={styles.guideToggleButton}
              onClick={randomizeInkRecipe}
              aria-label="Randomize ink recipe"
              title="Create a bounded random ink recipe"
            >
              <Dices size={13} aria-hidden="true" />
              Random ink
            </button>
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
              aria-label="Paint bucket tool"
              aria-pressed={paintMode === "bucket"}
              data-selected={paintMode === "bucket" ? "true" : undefined}
              data-glyph-tooltip="Paint bucket"
              title="Paint bucket"
              onClick={() => setPaintMode("bucket")}
            >
              <PaintBucket size={15} aria-hidden="true" />
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
              aria-label="Vertical symmetry tool"
              aria-pressed={symmetryEnabled}
              data-selected={symmetryEnabled ? "true" : undefined}
              data-glyph-tooltip="Vertical symmetry"
              title="Vertical symmetry"
              onClick={() => setSymmetryEnabled((enabled) => !enabled)}
            >
              <FlipHorizontal2 size={15} aria-hidden="true" />
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
                disabled={paintMode === "move" || paintMode === "bucket"}
                onClick={() => setBrushSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.inkPalette}>
          <div className={styles.inkPaletteHeader}>
            <span>{paintMode === "move" ? "Move ink" : "Ink behavior"}</span>
            <small>
              {paintMode === "move"
                ? "Choose one ink layer, or All."
                : "Colors are editing labels—not final colors."}
            </small>
          </div>
          <div
            className={styles.inkRoleOptions}
            role="radiogroup"
            aria-label={
              paintMode === "move" ? "Move ink selection" : "Semantic ink color"
            }
            data-move-selection={paintMode === "move" ? "true" : undefined}
          >
            {AVATAR_DETAILS_INK_OPTIONS.map((option) => {
              const isMoveAll =
                paintMode === "move" && option.role === "erase";
              return (
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
                      backgroundColor:
                        option.role === "erase"
                          ? "#ffffff"
                          : AVATAR_DETAILS_INK_ROLE_COLORS[option.role],
                    }}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{isMoveAll ? "All" : option.label}</strong>
                    <small>
                      {isMoveAll
                        ? "Moves every ink type together."
                        : option.description}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
          <label className={styles.speechInkAnimationControl}>
            <span>
              <strong>Speech ink animation</strong>
              <small>Independent from Mouth animation.</small>
            </span>
            <select
              value={working.screen.speechInkAnimation ?? "none"}
              aria-label="Speech ink animation"
              data-avatar-details-speech-ink-animation="true"
              onChange={(event) => {
                onEditStart?.();
                commitMutation(
                  avatarDetailsWithSpeechInkAnimation(
                    workingRef.current,
                    event.currentTarget
                      .value as BotAvatarDetailsSpeechInkAnimation,
                  ),
                );
              }}
            >
              {BOT_AVATAR_DETAILS_SPEECH_INK_ANIMATIONS.map((animation) => (
                <option key={animation} value={animation}>
                  {AVATAR_DETAILS_SPEECH_INK_ANIMATION_LABELS[animation]}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.runtimeColorNote}>
            <span style={runtimeColorPreviewStyle} aria-hidden="true" />
            <small>
              {paintMode === "move"
                ? "Only the selected ink layer moves. All moves the complete drawing."
                : "Painted ink becomes the bot color. Erase writes transparency."}
            </small>
          </div>
        </div>

        {canvasPortalTarget
          ? createPortal(canvasEditor, canvasPortalTarget)
          : canvasEditor}

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

      <section
        className={styles.templateSection}
        aria-label="Stamps"
      >
        <header>
          <strong>Stamps</strong>
          <small>
            Equip your drawings, position them with the grid pad, then place.
          </small>
        </header>
        <div className={styles.templateSaveRow}>
          <input
            type="text"
            value={templateName}
            maxLength={AVATAR_DETAIL_INK_TEMPLATE_NAME_MAX_LENGTH}
            placeholder="Find a stamp by name"
            aria-label="Search stamps"
            onChange={(event) => {
              setTemplateName(event.currentTarget.value);
              setTemplateStatus(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (filteredInkTemplates.length === 1) {
                equipInkStamp(filteredInkTemplates[0]!);
              } else if (filteredInkTemplates.length === 0) {
                saveCurrentInkTemplate();
              }
            }}
          />
          <button
            type="button"
            onClick={saveCurrentInkTemplate}
            aria-label="Save current ink as a stamp"
            title="Save current ink as a stamp"
            disabled={
              paintedPixels === 0 ||
              !templateName.trim() ||
              stampNameAlreadyExists ||
              filteredInkTemplates.length > 0 ||
              inkTemplates.length >= AVATAR_DETAIL_INK_TEMPLATE_LIMIT
            }
          >
            <Plus size={13} aria-hidden="true" />
          </button>
        </div>
        {working.screen.stamps.length > 0 ? (
          <div className={styles.legacyTemplateNotice} role="status">
            <span>
              This older face contains a retired decoration. Convert it to ink
              before editing it.
            </span>
            <button type="button" onClick={convertLegacyDetailsToInk}>
              Convert to ink
            </button>
          </div>
        ) : null}
        {filteredInkTemplates.length > 0 ? (
          <div
            className={styles.templateLibrary}
            role="listbox"
            aria-label="Personal stamps"
          >
            {filteredInkTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                role="option"
                aria-selected={selectedTemplateId === template.id}
                data-selected={
                  selectedTemplateId === template.id ? "true" : undefined
                }
                data-equipped={
                  equippedTemplateId === template.id ? "true" : undefined
                }
                onClick={() => {
                  equipInkStamp(template);
                }}
              >
                <AvatarDetailInkTemplatePreview template={template} />
                <span>
                  <strong>{template.name}</strong>
                  <small>{template.pixelCount.toLocaleString()} pixels</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.emptyTemplateLibrary}>
            {normalizedTemplateQuery
              ? `No stamps match “${templateName.trim()}”. Use + to save the current ink with that name.`
              : "No stamps yet. Type a name, then use + to save the current ink."}
          </p>
        )}
        {selectedTemplate ? (
          <div className={styles.templateControls}>
            <div className={styles.templateNameRow}>
              <input
                type="text"
                value={selectedTemplateName}
                maxLength={AVATAR_DETAIL_INK_TEMPLATE_NAME_MAX_LENGTH}
                aria-label="Rename selected stamp"
                onChange={(event) =>
                  setSelectedTemplateName(event.currentTarget.value)
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  saveSelectedTemplateName();
                }}
              />
              <button
                type="button"
                aria-label="Save stamp name"
                title="Save name"
                disabled={
                  !selectedTemplateName.trim() ||
                  selectedTemplateName.trim() === selectedTemplate.name
                }
                onClick={saveSelectedTemplateName}
              >
                <Check size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${selectedTemplate.name} stamp`}
                title="Delete stamp"
                onClick={deleteSelectedInkTemplate}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
            {equippedTemplate?.id === selectedTemplate.id ? (
              <div
                className={styles.equippedStampControls}
                data-stamp-equipped="true"
              >
                <span>
                  <strong>Equipped</strong>
                  <small>Position with the grid pad</small>
                </span>
                <div
                  className={styles.stampScaleChips}
                  role="group"
                  aria-label="Stamp size"
                >
                  <button
                    type="button"
                    aria-label="Make stamp smaller"
                    title="Make stamp smaller"
                    disabled={
                      templateScalePct <= AVATAR_DETAIL_INK_TEMPLATE_SCALE_MIN
                    }
                    onClick={() => adjustEquippedStampScale(-5)}
                  >
                    <Minus size={12} aria-hidden="true" />
                  </button>
                  <output aria-live="polite">{templateScalePct}%</output>
                  <button
                    type="button"
                    aria-label="Make stamp larger"
                    title="Make stamp larger"
                    disabled={
                      templateScalePct >= AVATAR_DETAIL_INK_TEMPLATE_SCALE_MAX
                    }
                    onClick={() => adjustEquippedStampScale(5)}
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                </div>
                <small>
                  Scroll to resize · Click the canvas or press Enter to place ·
                  Escape cancels
                </small>
                <button type="button" onClick={cancelEquippedStamp}>
                  Cancel placement
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {templateStatus ? (
          <p className={styles.templateStatus} role="status">
            {templateStatus}
          </p>
        ) : null}
      </section>

      {layout === "panel" ? <footer className={styles.footer}>
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
      </footer> : null}
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
      key={`${props.templateOwnerId}:${props.layout === "foundry" ? "foundry" : avatarDetailsKey(props.value)}`}
      {...props}
      ref={ref}
    />
  );
});

AvatarDetailsEditor.displayName = "AvatarDetailsEditor";
