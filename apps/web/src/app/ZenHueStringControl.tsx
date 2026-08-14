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
import { createPortal } from "react-dom";

import {
  zenHueCableTraversalFrame,
  type ZenHueCableDragDirection,
  stepZenHueCableSpring,
  zenHueCableSpringHasSettled,
  zenHueTierAtIndex,
  zenHueTierForNormalizedPosition,
  zenHueTierIndex,
  type ZenHueCableSpringState,
  type ZenHueDirectoryTier,
} from "./zenHueStringNavigation";
import styles from "./ZenHueStringControl.module.css";

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 120;
const STRING_LEFT = 24;
const STRING_RIGHT = 976;
const STRING_CENTER_Y = 60;
const HUE_CYCLE_PULL_THRESHOLD_PX = 16;
const BREADTH_TRAVERSAL_DEAD_ZONE_PX = 34;
const BREADTH_TRAVERSAL_DIRECTION_LATCH_PX = 48;
const ZEN_HUE_CABLE_CURSOR_LOCK_STYLE_RULE =
  'html[data-zen-hue-cable-dragging="true"], html[data-zen-hue-cable-dragging="true"] * { cursor: none !important; }';

export interface ZenHueCableNavigationUpdate {
  sliderValue?: number;
  tier?: ZenHueDirectoryTier;
}

interface ZenHueCableControlProps {
  hueSliderValue: number | null;
  hueLabel: string;
  tier: ZenHueDirectoryTier;
  tiers: readonly number[];
  rootRows: number;
  visibleBotCount: number;
  totalBotCount: number;
  trackColors: readonly string[];
  disabled?: boolean;
  showCue?: boolean;
  onDismissCue?: () => void;
  onVerticalTraversal?: () => void;
  onNavigate: (update: ZenHueCableNavigationUpdate) => void;
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
  direction: ZenHueCableDragDirection;
  normalizedPosition: number;
  deltaY: number;
  deltaX: number;
  lastClientX: number;
  previousClientY: number;
  previousTime: number;
  velocityY: number;
}

export default function ZenHueCableControl({
  hueSliderValue,
  hueLabel,
  tier,
  tiers,
  rootRows,
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
}: ZenHueCableControlProps): React.JSX.Element {
  const instructionsId = useId();
  const gradientId = useId().replaceAll(":", "");
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const latestNavigateRef = useRef(onNavigate);
  const springFrameRef = useRef<number | null>(null);
  const traversalFrameRef = useRef<number | null>(null);
  const springRef = useRef<ZenHueCableSpringState>({
    displacement: 0,
    velocity: 0,
  });
  const springTimeRef = useRef(0);
  const curveOffsetRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [curveOffset, setCurveOffset] = useState(0);
  const [pullDeltaY, setPullDeltaY] = useState(0);

  useEffect(() => {
    latestNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    if (!dragging) return;
    // Pointer capture keeps the Hue Cable receiving the active drag. The
    // document flag guarantees nested controls cannot restore their own
    // cursor while the viewport shield makes every other mouse target inert.
    document.documentElement.dataset.zenHueCableDragging = "true";
    return () => {
      delete document.documentElement.dataset.zenHueCableDragging;
    };
  }, [dragging]);

  const scheduleNavigation = useCallback(
    (update: ZenHueCableNavigationUpdate) => {
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

  const setLiveCablePull = useCallback((deltaY: number) => {
    // The cable still physically follows the hand while held. This is direct
    // pointer feedback, not a traversal animation: it snaps back on release.
    const offset =
      Math.sign(deltaY) * Math.min(48, Math.pow(Math.abs(deltaY), 0.72) * 1.35);
    curveOffsetRef.current = offset;
    setCurveOffset(offset);
    setPullDeltaY(deltaY);
  }, []);

  const setCableCurveOffset = useCallback((next: number) => {
    curveOffsetRef.current = next;
    setCurveOffset(next);
  }, []);

  const cancelRecoil = useCallback(() => {
    if (springFrameRef.current !== null) {
      cancelAnimationFrame(springFrameRef.current);
      springFrameRef.current = null;
    }
    springRef.current = { displacement: 0, velocity: 0 };
    springTimeRef.current = 0;
  }, []);

  const cancelTraversal = useCallback(() => {
    if (traversalFrameRef.current !== null) {
      cancelAnimationFrame(traversalFrameRef.current);
      traversalFrameRef.current = null;
    }
  }, []);

  const startRecoil = useCallback(
    (initialVelocity: number) => {
      const displacement = curveOffsetRef.current;
      if (Math.abs(displacement) < 0.5) {
        setCableCurveOffset(0);
        return;
      }
      cancelRecoil();
      springRef.current = {
        displacement,
        velocity: Math.max(-500, Math.min(500, initialVelocity)),
      };
      springTimeRef.current = performance.now();
      const tick = (now: number) => {
        const elapsed = Math.max(0, Math.min(32, now - springTimeRef.current));
        springTimeRef.current = now;
        springRef.current = stepZenHueCableSpring(
          springRef.current,
          elapsed / 1000,
        );
        if (zenHueCableSpringHasSettled(springRef.current)) {
          springFrameRef.current = null;
          setCableCurveOffset(0);
          return;
        }
        setCableCurveOffset(springRef.current.displacement);
        springFrameRef.current = requestAnimationFrame(tick);
      };
      springFrameRef.current = requestAnimationFrame(tick);
    },
    [cancelRecoil, setCableCurveOffset],
  );

  const settleGesture = useCallback(
    (recoil: boolean) => {
      const drag = dragRef.current;
      if (!drag) return;
      cancelTraversal();
      dragRef.current = null;
      setDragging(false);
      setPullDeltaY(0);
      onInteractionChange?.(false);
      if (recoil) startRecoil(drag.velocityY);
      else {
        cancelRecoil();
        setCableCurveOffset(0);
      }
    },
    [cancelRecoil, cancelTraversal, onInteractionChange, setCableCurveOffset, startRecoil],
  );

  useEffect(() => {
    const settle = () => settleGesture(false);
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
      cancelRecoil();
      cancelTraversal();
    };
  }, [cancelRecoil, cancelTraversal, settleGesture]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) return;
      cancelRecoil();
      cancelTraversal();
      setCableCurveOffset(0);
      setPullDeltaY(0);
      event.currentTarget.setPointerCapture(event.pointerId);
      const untouchedRoot = hueSliderValue === null;
      const startTier = untouchedRoot && tiers.length > 0 ? tiers[0] : tier;
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startTier,
        previousTier: startTier,
        direction: 0,
        normalizedPosition: tiers.length === 0 ? 1 : zenHueTierIndex(startTier, tiers) / tiers.length,
        deltaY: 0,
        deltaX: 0,
        lastClientX: event.clientX,
        untouchedRoot,
        previousClientY: event.clientY,
        previousTime: event.timeStamp,
        velocityY: 0,
      };
      setDragging(true);
      onInteractionChange?.(true);

      if (untouchedRoot && tiers.length > 0) {
        scheduleNavigation({
          sliderValue: sliderForClientX(event.clientX),
          tier: tiers[0],
        });
      }

      // DOM event timestamps and animation-frame timestamps are not
      // guaranteed to share an epoch (notably in WebKit). Starting from the
      // rAF clock keeps a held vertical pull advancing on every browser.
      let previousFrameTime = performance.now();
      const traverse = (now: number) => {
        const heldDrag = dragRef.current;
        if (!heldDrag || heldDrag.pointerId !== event.pointerId) {
          traversalFrameRef.current = null;
          return;
        }
        const elapsedSeconds = Math.max(0, Math.min(0.05, now - previousFrameTime)) / 1000;
        previousFrameTime = now;
        const frame = zenHueCableTraversalFrame({
          deltaY: heldDrag.deltaY,
          deadZonePx: BREADTH_TRAVERSAL_DEAD_ZONE_PX,
          currentDirection: heldDrag.direction,
          directionLatchPx: BREADTH_TRAVERSAL_DIRECTION_LATCH_PX,
          normalizedPosition: heldDrag.normalizedPosition,
          elapsedSeconds,
          tierCount: tiers.length,
        });
        heldDrag.direction = frame.direction;
        heldDrag.normalizedPosition = frame.normalizedPosition;
        const nextTier = zenHueTierForNormalizedPosition(frame.normalizedPosition, tiers);
        if (nextTier !== heldDrag.previousTier) {
          heldDrag.previousTier = nextTier;
          onVerticalTraversal?.();
          const update: ZenHueCableNavigationUpdate = { tier: nextTier };
          const horizontalIntent =
            Math.abs(heldDrag.deltaX) > HUE_CYCLE_PULL_THRESHOLD_PX &&
            Math.abs(heldDrag.deltaX) >= Math.abs(heldDrag.deltaY) * 0.36;
          const allBotsDownwardPull =
            heldDrag.untouchedRoot && heldDrag.startTier === "root" && heldDrag.direction === 1;
          if (!allBotsDownwardPull && (!heldDrag.untouchedRoot || horizontalIntent || nextTier !== "root")) {
            update.sliderValue = sliderForClientX(heldDrag.lastClientX);
          }
          // This is the only tier publication path: one discrete transition
          // per animation frame, even while the pointer is completely still.
          scheduleNavigation(update);
        }
        traversalFrameRef.current = requestAnimationFrame(traverse);
      };
      traversalFrameRef.current = requestAnimationFrame(traverse);
    },
    [
      disabled,
      cancelRecoil,
      cancelTraversal,
      hueSliderValue,
      onInteractionChange,
      onVerticalTraversal,
      scheduleNavigation,
      sliderForClientX,
      tier,
      tiers,
      setCableCurveOffset,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.startClientX;
      const deltaY = event.clientY - drag.startClientY;
      const elapsed = Math.max(
        1,
        Math.min(32, event.timeStamp - drag.previousTime),
      );
      drag.velocityY =
        drag.velocityY * 0.72 +
        ((event.clientY - drag.previousClientY) / elapsed) * 280;
      drag.previousClientY = event.clientY;
      drag.previousTime = event.timeStamp;
      setLiveCablePull(deltaY);
      drag.deltaY = deltaY;
      drag.deltaX = deltaX;
      drag.lastClientX = event.clientX;

      const horizontalIntent =
        Math.abs(deltaX) > HUE_CYCLE_PULL_THRESHOLD_PX &&
        Math.abs(deltaX) >= Math.abs(deltaY) * 0.36;
      const update: ZenHueCableNavigationUpdate = {};
      const allBotsDownwardPull =
        drag.untouchedRoot && drag.startTier === "root" && deltaY > BREADTH_TRAVERSAL_DEAD_ZONE_PX;
      const shouldReportHue = !allBotsDownwardPull;
      if (shouldReportHue) {
        update.sliderValue = sliderForClientX(event.clientX);
      }
      // A deliberate sideways pull from All Bots enters the deepest hue
      // directory immediately. This also lets a remembered-hue root re-enter
      // directly without needing a vertical detent first.
      if (!allBotsDownwardPull && tier === "root" && horizontalIntent && tiers.length > 0) {
        update.tier = tiers[0];
        drag.startTier = tiers[0];
        drag.previousTier = tiers[0];
      }
      if (update.sliderValue !== undefined || update.tier !== undefined) {
        scheduleNavigation(update);
      }
    },
    [
      scheduleNavigation,
      setLiveCablePull,
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
      settleGesture(true);
    },
    [settleGesture],
  );

  const activeHueValue = hueSliderValue ?? 180;
  const beadX =
    STRING_LEFT + (activeHueValue / 359) * (STRING_RIGHT - STRING_LEFT);
  const beadY = STRING_CENTER_Y + curveOffset;
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
  const allBotsDownwardPull =
    dragging && tier === "root" && pullDeltaY > BREADTH_TRAVERSAL_DEAD_ZONE_PX;
  const whiteCablePullProgress = allBotsDownwardPull
    ? Math.min(
        1,
        (pullDeltaY - BREADTH_TRAVERSAL_DEAD_ZONE_PX) /
          (48 - BREADTH_TRAVERSAL_DEAD_ZONE_PX),
      )
    : 0;
  const showHandle = hueSliderValue !== null || dragging;
  const visibleRows = tier === "root" ? rootRows : tier;
  const breadthLabel = `${visibleRows} ${visibleRows === 1 ? "row" : "rows"}`;
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
    <>
      <div
        className={styles.root}
        data-tutorial-target="zen-hue-cable"
        data-disabled={disabled ? "true" : undefined}
        data-dragging={dragging ? "true" : undefined}
        aria-describedby={instructionsId}
      >
        {showCue ? (
          <div className={styles.cue} role="note">
            <span>
              Drag sideways for hue. Pull up or down to change breadth.
            </span>
            <button
              type="button"
              onClick={onDismissCue}
              aria-label="Dismiss Hue Cable tip"
            >
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
        onPointerCancel={() => settleGesture(false)}
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
          {whiteCablePullProgress > 0 ? (
            <path
              className={styles.whiteout}
              d={path}
              style={{ opacity: whiteCablePullProgress }}
            />
          ) : null}
          <circle className={styles.endpoint} cx={STRING_LEFT} cy={STRING_CENTER_Y} r="7" />
          <circle className={styles.endpoint} cx={STRING_RIGHT} cy={STRING_CENTER_Y} r="7" />
          {showHandle ? (
            <>
              <circle className={styles.beadHalo} cx={beadX} cy={beadY} r="17" />
              <circle className={styles.bead} cx={beadX} cy={beadY} r="10" />
            </>
          ) : null}
        </svg>
      </div>
      <span className={styles.status} aria-hidden="true">
        {visibleBotCount}/{totalBotCount} · {breadthLabel}
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
      {dragging
        ? createPortal(
            <>
              <style>{ZEN_HUE_CABLE_CURSOR_LOCK_STYLE_RULE}</style>
              <div
                className={styles.dragShield}
                data-zen-hue-cable-drag-shield="true"
                aria-hidden="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onContextMenu={(event) => event.preventDefault()}
                onWheel={(event) => event.preventDefault()}
              />
            </>,
            document.body,
          )
        : null}
    </>
  );
}
