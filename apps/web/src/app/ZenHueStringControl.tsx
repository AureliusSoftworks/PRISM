"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  zenHueTierAtIndex,
  zenHueTierForVerticalDrag,
  zenHueTierIndex,
  type ZenHueDirectoryTier,
} from "./zenHueStringNavigation";
import styles from "./ZenHueStringControl.module.css";

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 120;
const STRING_LEFT = 24;
const STRING_RIGHT = 976;
const STRING_CENTER_Y = 60;
const POINTER_DEAD_ZONE_PX = 7;

export interface ZenHueStringNavigationUpdate {
  sliderValue?: number;
  tier?: ZenHueDirectoryTier;
}

interface ZenHueStringControlProps {
  hueSliderValue: number | null;
  hueLabel: string;
  tier: ZenHueDirectoryTier;
  tiers: readonly number[];
  visibleBotCount: number;
  totalBotCount: number;
  trackColors: readonly string[];
  disabled?: boolean;
  showCue?: boolean;
  onDismissCue?: () => void;
  onVerticalTraversal?: () => void;
  onNavigate: (update: ZenHueStringNavigationUpdate) => void;
  onClear: () => void;
  onInteractionChange?: (active: boolean) => void;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startTier: ZenHueDirectoryTier;
  previousTier: ZenHueDirectoryTier;
  untouchedRoot: boolean;
}

export default function ZenHueStringControl({
  hueSliderValue,
  hueLabel,
  tier,
  tiers,
  visibleBotCount,
  totalBotCount,
  trackColors,
  disabled = false,
  showCue = false,
  onDismissCue,
  onVerticalTraversal,
  onNavigate,
  onClear,
  onInteractionChange,
}: ZenHueStringControlProps): React.JSX.Element {
  const instructionsId = useId();
  const gradientId = useId().replaceAll(":", "");
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const latestNavigateRef = useRef(onNavigate);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    latestNavigateRef.current = onNavigate;
  }, [onNavigate]);

  const scheduleNavigation = useCallback(
    (update: ZenHueStringNavigationUpdate) => {
      // Traversal commits synchronously: there is no deferred frame, spring,
      // or interpolation layer that could produce a visual flicker.
      latestNavigateRef.current(update);
    },
    [],
  );

  const sliderForClientX = useCallback((clientX: number): number => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 180;
    return Math.max(0, Math.min(359, ((clientX - rect.left) / rect.width) * 359));
  }, []);

  const settleGesture = useCallback(
    () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      onInteractionChange?.(false);
    },
    [onInteractionChange],
  );

  useEffect(() => {
    const settle = () => settleGesture();
    const settleOnVisibility = () => {
      if (document.visibilityState !== "visible") settle();
    };
    window.addEventListener("blur", settle);
    window.addEventListener("resize", settle);
    document.addEventListener("visibilitychange", settleOnVisibility);
    return () => {
      window.removeEventListener("blur", settle);
      window.removeEventListener("resize", settle);
      document.removeEventListener("visibilitychange", settleOnVisibility);
    };
  }, [settleGesture]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const untouchedRoot = hueSliderValue === null;
      const startTier = untouchedRoot && tiers.length > 0 ? tiers[0] : tier;
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startTier,
        previousTier: startTier,
        untouchedRoot,
      };
      setDragging(true);
      onInteractionChange?.(true);
      if (untouchedRoot && tiers.length > 0) {
        scheduleNavigation({
          sliderValue: sliderForClientX(event.clientX),
          tier: tiers[0],
        });
      }
    },
    [
      disabled,
      hueSliderValue,
      onInteractionChange,
      scheduleNavigation,
      sliderForClientX,
      tier,
      tiers,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.startClientX;
      const deltaY = event.clientY - drag.startClientY;
      const verticalIntent =
        Math.abs(deltaY) /
        Math.max(1, Math.abs(deltaY) + Math.abs(deltaX) * 0.55);
      const weightedDeltaY = deltaY * (0.35 + verticalIntent * 0.65);
      const nextTier = zenHueTierForVerticalDrag({
        startTier: drag.startTier,
        previousTier: drag.previousTier,
        tiers,
        deltaY: weightedDeltaY,
        travelPx: Math.max(120, surfaceRef.current?.clientHeight ?? 0) * 1.4,
      });
      const tierChanged = nextTier !== drag.previousTier;
      if (tierChanged) {
        drag.previousTier = nextTier;
        onVerticalTraversal?.();
      }

      const horizontalIntent =
        Math.abs(deltaX) > POINTER_DEAD_ZONE_PX &&
        Math.abs(deltaX) >= Math.abs(deltaY) * 0.36;
      const update: ZenHueStringNavigationUpdate = {};
      if (!drag.untouchedRoot || horizontalIntent) {
        update.sliderValue = sliderForClientX(event.clientX);
      }
      if (tierChanged) update.tier = nextTier;
      if (
        tier === "root" &&
        hueSliderValue !== null &&
        horizontalIntent &&
        tiers.length > 0
      ) {
        update.tier = tiers[0];
        drag.startTier = tiers[0];
        drag.previousTier = tiers[0];
      }
      if (update.sliderValue !== undefined || update.tier !== undefined) {
        scheduleNavigation(update);
      }
    },
    [
      hueSliderValue,
      onVerticalTraversal,
      scheduleNavigation,
      sliderForClientX,
      tier,
      tiers,
    ],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      settleGesture();
    },
    [settleGesture],
  );

  const activeHueValue = hueSliderValue ?? 180;
  const beadX =
    STRING_LEFT + (activeHueValue / 359) * (STRING_RIGHT - STRING_LEFT);
  const beadY = STRING_CENTER_Y;
  const leftSpan = Math.max(1, beadX - STRING_LEFT);
  const rightSpan = Math.max(1, STRING_RIGHT - beadX);
  const path = [
    `M ${STRING_LEFT} ${STRING_CENTER_Y}`,
    `C ${(STRING_LEFT + leftSpan * 0.32).toFixed(2)} ${STRING_CENTER_Y}`,
    `${(beadX - leftSpan * 0.24).toFixed(2)} ${beadY.toFixed(2)}`,
    `${beadX.toFixed(2)} ${beadY.toFixed(2)}`,
    `C ${(beadX + rightSpan * 0.24).toFixed(2)} ${beadY.toFixed(2)}`,
    `${(STRING_RIGHT - rightSpan * 0.32).toFixed(2)} ${STRING_CENTER_Y}`,
    `${STRING_RIGHT} ${STRING_CENTER_Y}`,
  ].join(" ");
  const breadthIndex = zenHueTierIndex(tier, tiers);
  const breadthLabel = tier === "root" ? "Full rainbow" : `${tier} rows`;
  const announcement =
    hueSliderValue === null
      ? `Full rainbow, ${totalBotCount} bots`
      : `${hueLabel}, ${breadthLabel.toLocaleLowerCase()}, ${visibleBotCount} of ${totalBotCount} bots`;
  // The string is the dimensional navigation affordance, but it must still
  // carry the Hue lens's identity: discrete PRISM bars, never a blended
  // spectrum. Duplicate SVG stops at each boundary create the same crisp
  // segments as the previous slider rail.
  const gradientStops = useMemo(() => {
    const colors = trackColors.length > 0
      ? trackColors
      : ["#ff3d71", "#24d8df"];
    return colors.flatMap((color, index) => {
      const start = (index / colors.length) * 100;
      const end = ((index + 1) / colors.length) * 100;
      return [
        { color, offset: `${start}%` },
        { color, offset: `${end}%` },
      ];
    });
  }, [trackColors]);

  const handleHueKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClear();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextSliderValue = (Math.round(activeHueValue) + delta + 360) % 360;
    onNavigate({
      sliderValue: nextSliderValue,
      tier: hueSliderValue === null && tiers.length > 0 ? tiers[0] : tier,
    });
  };

  const handleBreadthKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClear();
      return;
    }
    let nextIndex: number | null = null;
    if (event.key === "ArrowUp") nextIndex = breadthIndex - 1;
    if (event.key === "ArrowDown") nextIndex = breadthIndex + 1;
    if (event.key === "Home") nextIndex = tiers.length;
    if (event.key === "End") nextIndex = 0;
    if (nextIndex === null) return;
    event.preventDefault();
    onNavigate({ tier: zenHueTierAtIndex(nextIndex, tiers) });
  };

  return (
    <div
      className={styles.root}
      data-tutorial-target="zen-hue-string"
      data-disabled={disabled ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      aria-describedby={instructionsId}
    >
      {showCue ? (
        <div className={styles.cue} role="note">
          <span>Drag sideways for hue. Pull up or down to change breadth.</span>
          <button type="button" onClick={onDismissCue} aria-label="Dismiss hue string tip">
            ×
          </button>
        </div>
      ) : null}
      <div
        ref={surfaceRef}
        className={styles.surface}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={settleGesture}
      >
        <svg aria-hidden="true" className={styles.svg} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
          <defs>
            <linearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={STRING_LEFT}
              y1={STRING_CENTER_Y}
              x2={STRING_RIGHT}
              y2={STRING_CENTER_Y}
            >
              {gradientStops.map((stop) => (
                <stop key={`${stop.offset}-${stop.color}`} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
          <path className={styles.underlay} d={path} />
          <path
            className={styles.string}
            d={path}
            style={{ stroke: `url(#${gradientId})` }}
          />
          <circle className={styles.endpoint} cx={STRING_LEFT} cy={STRING_CENTER_Y} r="7" />
          <circle className={styles.endpoint} cx={STRING_RIGHT} cy={STRING_CENTER_Y} r="7" />
          {hueSliderValue !== null ? (
            <>
              <circle className={styles.beadHalo} cx={beadX} cy={beadY} r="17" />
              <circle className={styles.bead} cx={beadX} cy={beadY} r="10" />
            </>
          ) : null}
        </svg>
      </div>
      <span className={styles.status} aria-hidden="true">
        {hueSliderValue === null ? "Full rainbow" : `${visibleBotCount}/${totalBotCount} · ${breadthLabel}`}
      </span>
      <button type="button" className={styles.all} onClick={onClear} disabled={disabled || hueSliderValue === null}>
        All
      </button>
      <input
        className={styles.semanticRange}
        type="range"
        min={0}
        max={359}
        step={1}
        value={activeHueValue}
        disabled={disabled}
        aria-label="Hue"
        aria-valuetext={announcement}
        aria-describedby={instructionsId}
        onKeyDown={handleHueKeyDown}
        onChange={(event) =>
          onNavigate({
            sliderValue: Number(event.currentTarget.value),
            tier: hueSliderValue === null && tiers.length > 0 ? tiers[0] : tier,
          })
        }
      />
      <input
        className={styles.semanticRange}
        type="range"
        min={0}
        max={tiers.length}
        step={1}
        value={breadthIndex}
        disabled={disabled || hueSliderValue === null || tiers.length === 0}
        aria-label="Breadth"
        aria-valuetext={announcement}
        aria-describedby={instructionsId}
        onKeyDown={handleBreadthKeyDown}
        onChange={(event) =>
          onNavigate({
            tier: zenHueTierAtIndex(Number(event.currentTarget.value), tiers),
          })
        }
      />
      <span id={instructionsId} className={styles.instructions}>
        Drag sideways to choose hue. Pull up for a narrower directory or down for a broader directory. Keyboard users can adjust the separate Hue and Breadth ranges. Escape shows all bots.
      </span>
      <span className={styles.instructions} role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
