"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { PrismIntroResolution } from "@localai/shared";
import {
  PRISM_INTRO_SCENES,
  clampPrismIntroSceneIndex,
  markPrismIntroSequenceSeen,
  prismIntroSceneAt,
  prismIntroSequenceWasSeen,
} from "./prismIntroSequenceData";
import styles from "./PrismIntroSequence.module.css";

type PrismIntroSequenceMode = "first-run" | "replay";

interface PrismIntroSequenceContextValue {
  requestFirstRunPrismIntro(options?: {
    force?: boolean;
    onResolved?: (resolution: Exclude<PrismIntroResolution, "pending">) => void;
  }): void;
  replayPrismIntro(): void;
}

const PrismIntroSequenceContext =
  createContext<PrismIntroSequenceContextValue | null>(null);

function prismIntroLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function usePrismIntroSequence(): PrismIntroSequenceContextValue {
  const value = useContext(PrismIntroSequenceContext);
  if (!value) {
    throw new Error(
      "usePrismIntroSequence must be used within PrismIntroSequenceProvider",
    );
  }
  return value;
}

export function PrismIntroSequenceProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [mode, setMode] = useState<PrismIntroSequenceMode | null>(null);
  const firstRunResolvedThisSessionRef = useRef(false);
  const firstRunResolutionRef = useRef<
    ((resolution: Exclude<PrismIntroResolution, "pending">) => void) | null
  >(null);

  const requestFirstRunPrismIntro = useCallback((options?: {
    force?: boolean;
    onResolved?: (resolution: Exclude<PrismIntroResolution, "pending">) => void;
  }) => {
    if (firstRunResolvedThisSessionRef.current && !options?.force) return;
    if (options?.force) firstRunResolvedThisSessionRef.current = false;
    const storage = prismIntroLocalStorage();
    if (!options?.force && storage && prismIntroSequenceWasSeen(storage)) {
      firstRunResolvedThisSessionRef.current = true;
      return;
    }
    firstRunResolutionRef.current = options?.onResolved ?? null;
    setMode((current) => current ?? "first-run");
  }, []);

  const replayPrismIntro = useCallback(() => {
    setMode("replay");
  }, []);

  const closePrismIntro = useCallback((
    resolution: Exclude<PrismIntroResolution, "pending">,
  ) => {
    if (mode === "first-run") {
      firstRunResolvedThisSessionRef.current = true;
      const storage = prismIntroLocalStorage();
      if (storage) {
        markPrismIntroSequenceSeen(storage);
      }
      firstRunResolutionRef.current?.(resolution);
      firstRunResolutionRef.current = null;
    }
    setMode(null);
  }, [mode]);

  const value = useMemo(
    () => ({ requestFirstRunPrismIntro, replayPrismIntro }),
    [requestFirstRunPrismIntro, replayPrismIntro],
  );

  return (
    <PrismIntroSequenceContext.Provider value={value}>
      {children}
      {mode ? (
        <PrismIntroSequenceDialog mode={mode} onClose={closePrismIntro} />
      ) : null}
    </PrismIntroSequenceContext.Provider>
  );
}

function PrismIntroSequenceDialog({
  mode,
  onClose,
}: {
  mode: PrismIntroSequenceMode;
  onClose: (
    resolution: Exclude<PrismIntroResolution, "pending">,
  ) => void;
}): React.JSX.Element | null {
  const [sceneIndex, setSceneIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const visualDescriptionId = useId();
  const scene = prismIntroSceneAt(sceneIndex);
  const finalSceneIndex = PRISM_INTRO_SCENES.length - 1;
  const isFinalScene = sceneIndex === finalSceneIndex;

  const goToScene = useCallback((index: number) => {
    setSceneIndex(clampPrismIntroSceneIndex(index));
  }, []);

  useEffect(() => {
    const nextScene = PRISM_INTRO_SCENES[sceneIndex + 1];
    if (!nextScene) return;
    const preload = new window.Image();
    preload.src = nextScene.imageSrc;
  }, [sceneIndex]);

  useEffect(() => {
    const overlay = rootRef.current;
    if (!overlay) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const siblingStates = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== overlay,
      )
      .map((element) => ({
        element,
        wasInert: element.hasAttribute("inert"),
      }));
    siblingStates.forEach(({ element }) => element.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlay.focus({ preventScroll: true });

    return () => {
      siblingStates.forEach(({ element, wasInert }) => {
        if (!wasInert) element.removeAttribute("inert");
      });
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  if (typeof document === "undefined") return null;

  const sceneStyle = {
    "--prism-intro-image-position": scene.imagePosition,
  } as CSSProperties;

  return createPortal(
    <div
      ref={rootRef}
      className={styles.backdrop}
      style={sceneStyle}
      data-prism-intro-sequence="true"
      data-prism-intro-mode={mode}
      data-prism-intro-scene={scene.id}
      data-final-scene={isFinalScene ? "true" : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${bodyId} ${visualDescriptionId}`}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose("skipped");
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          goToScene(sceneIndex + 1);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          goToScene(sceneIndex - 1);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          goToScene(0);
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          goToScene(finalSceneIndex);
          return;
        }
        if (event.key !== "Tab") return;

        const focusable = Array.from(
          rootRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        if (focusable.length === 0) {
          event.preventDefault();
          rootRef.current?.focus({ preventScroll: true });
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (
          event.shiftKey &&
          (active === first ||
            active === rootRef.current ||
            !rootRef.current?.contains(active))
        ) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }}
    >
      <div className={styles.imageLayer} aria-hidden="true">
        <Image
          key={scene.id}
          src={scene.imageSrc}
          alt=""
          fill
          priority={sceneIndex === 0}
          sizes="100vw"
          className={styles.sceneImage}
          draggable={false}
          unoptimized
        />
        <span className={styles.imageScrim} />
        <span className={styles.paperVeil} />
      </div>

      <div className={styles.topRail}>
        <div className={styles.sceneCount} aria-live="polite">
          <span>PRISM</span>
          <strong>
            {String(sceneIndex + 1).padStart(2, "0")} /{" "}
            {String(PRISM_INTRO_SCENES.length).padStart(2, "0")}
          </strong>
        </div>
        <button
          type="button"
          className={styles.skipButton}
          onClick={() => onClose("skipped")}
          aria-label={
            mode === "first-run"
              ? "Skip the PRISM introduction"
              : "Close the PRISM introduction"
          }
        >
          {mode === "first-run" ? "Skip introduction" : "Close"}
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className={styles.copyStage} aria-live="polite" aria-atomic="true">
        {scene.showBrandMark ? (
          <Image
            className={styles.brandMark}
            src="/refraction-emblem.svg"
            width={88}
            height={88}
            alt=""
            aria-hidden="true"
            unoptimized
          />
        ) : null}
        <p className={styles.eyebrow}>{scene.eyebrow}</p>
        <h1 id={titleId} key={`${scene.id}-title`}>
          {scene.title}
        </h1>
        <p id={bodyId} className={styles.bodyCopy} key={`${scene.id}-body`}>
          {scene.body}
        </p>
        <span id={visualDescriptionId} className={styles.visualDescription}>
          {scene.imageAlt}
        </span>
      </div>

      <div className={styles.bottomRail}>
        <div className={styles.progressDots} aria-label="Introduction scenes">
          {PRISM_INTRO_SCENES.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              className={styles.progressDot}
              data-active={index === sceneIndex ? "true" : undefined}
              onClick={() => goToScene(index)}
              aria-label={`Go to scene ${index + 1}: ${candidate.eyebrow.toLowerCase()}`}
              aria-current={index === sceneIndex ? "step" : undefined}
            />
          ))}
        </div>

        <div className={styles.navigation}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => goToScene(sceneIndex - 1)}
            disabled={sceneIndex === 0}
          >
            <span aria-hidden="true">←</span>
            Previous
          </button>
          <button
            type="button"
            className={styles.nextButton}
            onClick={() => {
              if (isFinalScene) {
                onClose("completed");
              } else {
                goToScene(sceneIndex + 1);
              }
            }}
          >
            {isFinalScene
              ? mode === "first-run"
                ? "Enter PRISM"
                : "Return to PRISM"
              : "Continue"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
