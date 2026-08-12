"use client";

import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { BotGeneratedDraftV1 } from "@localai/shared";
import {
  botAvatarFoundryAtmosphere,
  botAvatarFoundryPopulationFrame,
  botAvatarFoundryRadialRayGeometry,
  botAvatarFoundryStatus,
  BOT_AVATAR_FOUNDRY_ALL_MODULES_POPULATED,
  BOT_AVATAR_FOUNDRY_PRISM_ANCHOR,
  type BotAvatarFoundryFaceCandidate,
  type BotAvatarFoundryModulePopulation,
  type BotAvatarFoundryPhase,
  type BotAvatarFoundryTheme,
} from "./botAvatarFoundry";
import {
  BOT_AVATAR_FOUNDRY_PHYSICS,
  botAvatarFoundryDraggedBody,
  botAvatarFoundryInitialPhysicsBody,
  botAvatarFoundryThrowVelocity,
  clampBotAvatarFoundryPhysicsBody,
  normalizeBotAvatarFoundryPhysicsBounds,
  stepBotAvatarFoundryPhysics,
  type BotAvatarFoundryPhysicsBody,
  type BotAvatarFoundryPhysicsBounds,
} from "./botAvatarFoundryPhysics";
import { playSpatialUiSfx } from "./spatialUiSfx";
import { PrismOrb } from "./PrismOrb";
import styles from "./BotCreationRitual.module.css";

const EMPTY_PHYSICS_BOUNDS: BotAvatarFoundryPhysicsBounds = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  rollRadius: 120,
};

const EMPTY_PHYSICS_BODY: BotAvatarFoundryPhysicsBody = {
  x: 0,
  y: 0,
  velocityX: 0,
  velocityY: 0,
  angle: 0,
  angularVelocity: 0,
  sleeping: true,
};

interface FoundryDragState {
  pointerId: number;
  lastX: number;
  lastY: number;
  lastTimeMs: number;
  velocityX: number;
  velocityY: number;
}

export interface BotCreationRitualProps {
  phase: BotAvatarFoundryPhase;
  prompt: string;
  responseMode: "local" | "online" | "auto";
  completedDraft: BotGeneratedDraftV1 | null;
  renderBotPreview: (state: BotCreationRitualPreviewState) => ReactNode;
  theme: BotAvatarFoundryTheme;
  onShellLanded?: () => void;
}

export interface BotCreationRitualPreviewState {
  screenOverlay: ReactNode;
  screenOverlayVisible: boolean;
  screenFinalizing: boolean;
  screenCrest: boolean;
  faceCandidate: BotAvatarFoundryFaceCandidate;
  buckleGlyph: string;
  buckleFill: number;
  modulePopulation: BotAvatarFoundryModulePopulation;
  lightLevel: number;
  screenMaterialSeed: string;
  frameWearSeed: string;
}

function foundryBodyTransform(body: BotAvatarFoundryPhysicsBody): string {
  return `translate3d(${body.x.toFixed(2)}px, ${body.y.toFixed(2)}px, 0) rotate(${body.angle.toFixed(4)}rad)`;
}

export function BotCreationRitual({
  phase,
  prompt,
  responseMode,
  completedDraft,
  renderBotPreview,
  theme,
  onShellLanded,
}: BotCreationRitualProps): React.JSX.Element {
  const atmosphere = botAvatarFoundryAtmosphere(completedDraft?.color, theme);
  const sceneRef = useRef<HTMLDivElement>(null);
  const platformRef = useRef<HTMLDivElement>(null);
  const shellRigRef = useRef<HTMLDivElement>(null);
  const shellHitTargetRef = useRef<HTMLButtonElement>(null);
  const physicsBoundsRef = useRef(EMPTY_PHYSICS_BOUNDS);
  const physicsBodyRef = useRef(EMPTY_PHYSICS_BODY);
  const physicsFrameRef = useRef<number | null>(null);
  const physicsLastFrameAtRef = useRef<number | null>(null);
  const dragRef = useRef<FoundryDragState | null>(null);
  const shellLandedRef = useRef(false);
  const impactTextureEpochRef = useRef(0);
  const onShellLandedRef = useRef(onShellLanded);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [impactPulse, setImpactPulse] = useState(0);
  const [materialImpactSeed, setMaterialImpactSeed] = useState(
    "bot-avatar-foundry-arrival",
  );
  const [physicsWakeEpoch, setPhysicsWakeEpoch] = useState(0);
  const [populationElapsedMs, setPopulationElapsedMs] = useState(0);

  useEffect(() => {
    onShellLandedRef.current = onShellLanded;
  }, [onShellLanded]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const publish = (): void => setReducedMotion(query.matches);
    publish();
    query.addEventListener?.("change", publish);
    return () => query.removeEventListener?.("change", publish);
  }, []);

  const publishPhysicsBody = useCallback(
    (body: BotAvatarFoundryPhysicsBody): void => {
      physicsBodyRef.current = body;
      shellRigRef.current?.style.setProperty(
        "--foundry-shell-transform",
        foundryBodyTransform(body),
      );
    },
    [],
  );

  const measurePhysicsBounds = useCallback((): BotAvatarFoundryPhysicsBounds => {
    const scene = sceneRef.current;
    const hitTarget = shellHitTargetRef.current;
    const platform = platformRef.current;
    if (!scene || !hitTarget || !platform) return physicsBoundsRef.current;
    const sceneRect = scene.getBoundingClientRect();
    const platformRect = platform.getBoundingClientRect();
    const sceneCenterX = sceneRect.left + sceneRect.width / 2;
    const sceneCenterY = sceneRect.top + sceneRect.height / 2;
    const shellHalfWidth = hitTarget.offsetWidth / 2;
    // The hit target is centered 5% below the rig's origin. Its lower edge,
    // rather than the scene edge, meets the measured dais top.
    const shellFloorOffset = hitTarget.offsetHeight * 0.55;
    const platformInset = 6;
    const left = platformRect.left - sceneCenterX + shellHalfWidth + platformInset;
    const right = platformRect.right - sceneCenterX - shellHalfWidth - platformInset;
    const bottom =
      platformRect.top - sceneCenterY - shellFloorOffset + platformInset;
    const top = Math.min(
      bottom,
      -Math.max(hitTarget.offsetHeight, sceneRect.height * 0.46),
    );
    const next = normalizeBotAvatarFoundryPhysicsBounds({
      left,
      right,
      top,
      bottom,
      rollRadius: Math.max(72, hitTarget.offsetWidth * 0.42),
    });
    physicsBoundsRef.current = next;
    return next;
  }, []);

  const announceLanding = useCallback((): void => {
    if (shellLandedRef.current) return;
    shellLandedRef.current = true;
    onShellLandedRef.current?.();
  }, []);

  const registerMeaningfulFloorImpact = useCallback((): void => {
    impactTextureEpochRef.current += 1;
    const randomFragment = Math.floor(Math.random() * 0x1_0000_0000)
      .toString(36)
      .padStart(7, "0");
    setMaterialImpactSeed(
      `bot-avatar-foundry-impact:${impactTextureEpochRef.current}:${randomFragment}`,
    );
    setImpactPulse((current) => current + 1);
    void playSpatialUiSfx("foundry-clank", {
      anchor: shellHitTargetRef.current,
    });
  }, []);

  useLayoutEffect(() => {
    if (phase !== "arrival") return;
    shellLandedRef.current = false;
    const bounds = measurePhysicsBounds();
    publishPhysicsBody(
      botAvatarFoundryInitialPhysicsBody(bounds, reducedMotion),
    );
    if (reducedMotion) {
      const timer = window.setTimeout(announceLanding, 80);
      return () => window.clearTimeout(timer);
    }
    const fallback = window.setTimeout(announceLanding, 1_650);
    return () => window.clearTimeout(fallback);
  }, [announceLanding, measurePhysicsBounds, phase, publishPhysicsBody, reducedMotion]);

  useLayoutEffect(() => {
    const onResize = (): void => {
      const bounds = measurePhysicsBounds();
      publishPhysicsBody(
        clampBotAvatarFoundryPhysicsBody(physicsBodyRef.current, bounds),
      );
    };
    const observer = new ResizeObserver(onResize);
    for (const target of [
      sceneRef.current,
      shellHitTargetRef.current,
      platformRef.current,
    ]) {
      if (target) observer.observe(target);
    }
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [measurePhysicsBounds, publishPhysicsBody]);

  const interactivePhase =
    phase === "arrival" || phase === "brief" || phase === "error";
  const shellInteractive = interactivePhase && !reducedMotion;

  useEffect(() => {
    if (!shellInteractive || dragging) return;
    const step = (now: number): void => {
      const previous = physicsLastFrameAtRef.current ?? now;
      physicsLastFrameAtRef.current = now;
      const result = stepBotAvatarFoundryPhysics(
        physicsBodyRef.current,
        physicsBoundsRef.current,
        (now - previous) / 1_000,
      );
      publishPhysicsBody(result.body);
      const meaningfulFloorImpact =
        result.collision === "floor" &&
        result.impactSpeed >= BOT_AVATAR_FOUNDRY_PHYSICS.minimumClankSpeed;
      if (meaningfulFloorImpact) {
        registerMeaningfulFloorImpact();
        if (phase === "arrival") announceLanding();
      } else if (
        result.collision &&
        result.impactSpeed >= BOT_AVATAR_FOUNDRY_PHYSICS.minimumClankSpeed
      ) {
        void playSpatialUiSfx("foundry-clank", {
          anchor: shellHitTargetRef.current,
        });
      }
      if (!result.body.sleeping) {
        physicsFrameRef.current = window.requestAnimationFrame(step);
      } else {
        physicsFrameRef.current = null;
      }
    };
    physicsLastFrameAtRef.current = null;
    physicsFrameRef.current = window.requestAnimationFrame(step);
    return () => {
      if (physicsFrameRef.current !== null) {
        window.cancelAnimationFrame(physicsFrameRef.current);
      }
      physicsFrameRef.current = null;
      physicsLastFrameAtRef.current = null;
    };
  }, [
    announceLanding,
    dragging,
    phase,
    physicsWakeEpoch,
    publishPhysicsBody,
    registerMeaningfulFloorImpact,
    shellInteractive,
  ]);

  useEffect(() => {
    if (interactivePhase) return;
    const activeDrag = dragRef.current;
    const target = shellHitTargetRef.current;
    if (
      activeDrag &&
      target?.hasPointerCapture(activeDrag.pointerId)
    ) {
      try {
        target.releasePointerCapture(activeDrag.pointerId);
      } catch {
        // The browser may have already released capture during the phase change.
      }
    }
    dragRef.current = null;
    const resetFrame = window.requestAnimationFrame(() => setDragging(false));
    publishPhysicsBody({
      ...EMPTY_PHYSICS_BODY,
      x: Math.max(
        physicsBoundsRef.current.left,
        Math.min(physicsBoundsRef.current.right, 0),
      ),
      y: physicsBoundsRef.current.bottom,
    });
    return () => window.cancelAnimationFrame(resetFrame);
  }, [interactivePhase, publishPhysicsBody]);

  useEffect(() => {
    if (phase !== "generation") return;
    const startedAt = performance.now();
    const update = (): void => {
      setPopulationElapsedMs(performance.now() - startedAt);
    };
    const firstFrame = window.requestAnimationFrame(update);
    const timer = window.setInterval(update, 180);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearInterval(timer);
    };
  }, [phase]);

  const effectivePopulationElapsedMs =
    phase === "awakening"
      ? 8_000
      : phase === "generation"
        ? populationElapsedMs
        : 0;
  const populationFrame = botAvatarFoundryPopulationFrame(
    effectivePopulationElapsedMs,
    reducedMotion,
  );
  const screenOverlay = (
    <span
      className={styles.synthesisScreen}
      data-synthesis-active={phase === "generation" ? "true" : undefined}
      data-draft-resolved={
        phase === "generation" && completedDraft ? "true" : undefined
      }
      data-synthesis-complete={phase === "awakening" ? "true" : undefined}
      style={
        {
          "--foundry-screen-fill":
            phase === "awakening" ? 1 : populationFrame.fill,
          "--foundry-screen-unfilled": `${
            (1 - (phase === "awakening" ? 1 : populationFrame.fill)) * 100
          }%`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className={styles.synthesisFill} />
      <span className={styles.synthesisScanline} />
    </span>
  );
  const status =
    phase === "generation"
      ? populationFrame.notice
      : botAvatarFoundryStatus(phase, completedDraft?.name);
  const radialRay = botAvatarFoundryRadialRayGeometry(
    BOT_AVATAR_FOUNDRY_PRISM_ANCHOR,
  );
  const crestActive = phase === "awakening";
  const previewModulePopulation = crestActive
    ? BOT_AVATAR_FOUNDRY_ALL_MODULES_POPULATED
    : populationFrame.population;
  const previewState: BotCreationRitualPreviewState = {
    screenOverlay,
    screenOverlayVisible: phase === "generation" || crestActive,
    screenFinalizing: phase === "generation" && completedDraft !== null,
    screenCrest: crestActive,
    faceCandidate: populationFrame.face,
    buckleGlyph: populationFrame.glyph,
    buckleFill: crestActive ? 1 : populationFrame.fill,
    modulePopulation:
      completedDraft || crestActive
        ? BOT_AVATAR_FOUNDRY_ALL_MODULES_POPULATED
        : previewModulePopulation,
    lightLevel: crestActive
      ? 1
      : phase === "generation"
        ? 0.18 + populationFrame.fill * 0.54
        : 0,
    screenMaterialSeed: materialImpactSeed,
    frameWearSeed: materialImpactSeed,
  };
  const ritualStyle = {
    "--creation-bot-color": atmosphere.color,
    "--prism-origin-x": `${BOT_AVATAR_FOUNDRY_PRISM_ANCHOR.x * 100}%`,
    "--prism-origin-y": `${BOT_AVATAR_FOUNDRY_PRISM_ANCHOR.y * 100}%`,
  } as CSSProperties;

  const beginShellDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!shellInteractive || event.button !== 0 || event.isPrimary === false) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTimeMs: event.timeStamp || performance.now(),
      velocityX: 0,
      velocityY: 0,
    };
    setDragging(true);
  };

  const moveShellDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const now = event.timeStamp || performance.now();
    const delta = {
      x: event.clientX - drag.lastX,
      y: event.clientY - drag.lastY,
    };
    const velocity = botAvatarFoundryThrowVelocity(delta, now - drag.lastTimeMs);
    drag.velocityX = drag.velocityX * 0.38 + velocity.x * 0.62;
    drag.velocityY = drag.velocityY * 0.38 + velocity.y * 0.62;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTimeMs = now;
    publishPhysicsBody(
      botAvatarFoundryDraggedBody(
        physicsBodyRef.current,
        delta,
        physicsBoundsRef.current,
      ),
    );
    event.preventDefault();
  };

  const endShellDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already have ended at the browser boundary.
    }
    const body = physicsBodyRef.current;
    publishPhysicsBody({
      ...body,
      velocityX: drag.velocityX,
      velocityY: drag.velocityY,
      angularVelocity: Math.max(
        -BOT_AVATAR_FOUNDRY_PHYSICS.maximumAngularSpeed,
        Math.min(
          BOT_AVATAR_FOUNDRY_PHYSICS.maximumAngularSpeed,
          drag.velocityX / physicsBoundsRef.current.rollRadius,
        ),
      ),
      sleeping: false,
    });
    setDragging(false);
  };

  const handleShellKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void => {
    if (!shellInteractive) return;
    const body = physicsBodyRef.current;
    let velocityX = body.velocityX;
    let velocityY = body.velocityY;
    if (event.key === "ArrowLeft") velocityX = -720;
    else if (event.key === "ArrowRight") velocityX = 720;
    else if (event.key === "ArrowUp") velocityY = -880;
    else if (event.key === "ArrowDown") velocityY = 360;
    else if (event.key === " " || event.key === "Enter") {
      velocityX = body.x > 0 ? -480 : 480;
      velocityY = -820;
    } else return;
    event.preventDefault();
    publishPhysicsBody({
      ...body,
      velocityX,
      velocityY,
      angularVelocity: velocityX / physicsBoundsRef.current.rollRadius,
      sleeping: false,
    });
    setPhysicsWakeEpoch((current) => current + 1);
  };

  return (
    <div
      className={styles.ritual}
      data-foundry-phase={phase}
      data-completed={completedDraft ? "true" : undefined}
      data-atmosphere-source={atmosphere.source}
      data-theme={theme}
      data-prism-anchor="authored"
      data-shell-dragging={dragging ? "true" : undefined}
      style={ritualStyle}
      aria-busy={phase === "handoff" || phase === "generation"}
    >
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.foundryGrid} aria-hidden="true" />
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Avatar Foundry</span>
          <h3 id="bot-generator-title">
            {phase === "brief" || phase === "error"
              ? "Give the shell a spark"
              : phase === "awakening"
                ? `${completedDraft?.name ?? "A new bot"} is waking`
                : "Creation chamber"}
          </h3>
        </div>
        <span className={styles.modeBadge} data-mode={responseMode}>
          {responseMode.toUpperCase()}
        </span>
      </header>

      <div className={styles.chute} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <svg
        className={styles.prismRadialLight}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="bot-foundry-radial-ray-gradient"
            gradientUnits="userSpaceOnUse"
            x1={BOT_AVATAR_FOUNDRY_PRISM_ANCHOR.x * 1_000}
            y1={BOT_AVATAR_FOUNDRY_PRISM_ANCHOR.y * 1_000}
            x2="500"
            y2="520"
          >
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="0.24" stopColor="#2fd3e3" stopOpacity="0.74" />
            <stop offset="0.68" stopColor="#7b5cff" stopOpacity="0.58" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        <polygon
          points={radialRay.points}
          fill="url(#bot-foundry-radial-ray-gradient)"
          data-source-width={radialRay.sourceWidth.toFixed(2)}
          data-target-width={radialRay.targetWidth.toFixed(2)}
        />
      </svg>
      <span className={styles.prismAnchor} aria-hidden="true">
        <PrismOrb aura size="100%" />
      </span>

      <div ref={sceneRef} className={styles.scene}>
        <div className={styles.refractionStation} aria-hidden="true">
          <span className={styles.refractionRing} data-ring="outer" />
          <span className={styles.refractionRing} data-ring="inner" />
          <span className={styles.refractionBeam} data-beam="left" />
          <span className={styles.refractionBeam} data-beam="right" />
        </div>

        <div
          ref={shellRigRef}
          className={styles.botDropRig}
          data-aligning={!interactivePhase ? "true" : undefined}
          style={
            {
              "--foundry-shell-transform": foundryBodyTransform(
                EMPTY_PHYSICS_BODY,
              ),
            } as CSSProperties
          }
        >
          <div className={styles.botPreview}>
            {renderBotPreview(previewState)}
          </div>
          <button
            ref={shellHitTargetRef}
            type="button"
            className={styles.shellHitTarget}
            data-shell-interactive={shellInteractive ? "true" : undefined}
            aria-label="Loose avatar shell"
            aria-describedby="bot-foundry-shell-instructions"
            disabled={!shellInteractive}
            onPointerDown={beginShellDrag}
            onPointerMove={moveShellDrag}
            onPointerUp={endShellDrag}
            onPointerCancel={endShellDrag}
            onKeyDown={handleShellKeyDown}
          />
        </div>
        {impactPulse > 0 ? (
          <div
            key={impactPulse}
            className={styles.collisionPulse}
            aria-hidden="true"
          />
        ) : null}
        <div
          ref={platformRef}
          className={styles.cradle}
          data-avatar-foundry-platform="true"
          aria-hidden="true"
        >
          <span data-side="left" />
          <span data-side="right" />
        </div>
        <span className={styles.floorGlow} aria-hidden="true" />
        <div className={styles.moduleReadouts} aria-hidden="true">
          {populationFrame.modules.map((module) => (
            <span
              key={module.id}
              className={styles.moduleReadout}
              data-module={module.id}
              data-state={
                crestActive || completedDraft || module.populated
                  ? "populated"
                  : module.active && phase === "generation"
                    ? "populating"
                    : "waiting"
              }
            >
              <i />
              <strong>{module.label}</strong>
              <small>
                {crestActive || completedDraft || module.populated
                  ? "populated"
                  : module.active && phase === "generation"
                    ? "populating"
                    : "waiting"}
              </small>
            </span>
          ))}
        </div>
        {crestActive ? (
          <div className={styles.awakeningDischarge} aria-hidden="true">
            <span data-effect="spark" />
            <span data-effect="smoke" />
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        <div
          className={styles.statusLine}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span aria-hidden="true" />
          <strong>{status}</strong>
        </div>
        <p className={styles.privacyNote}>
          {prompt.trim()
            ? "Nothing is saved until you choose Create bot."
            : "The shell remains dark until you give it direction."}
        </p>
        <p id="bot-foundry-shell-instructions" className={styles.srOnly}>
          {shellInteractive
            ? "Drag and release to fling the shell. Arrow keys or Space also move it."
            : "The shell is locked in the center while synthesis runs."}
        </p>
      </div>
    </div>
  );
}
