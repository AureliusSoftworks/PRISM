"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphicsQuality } from "@localai/shared";
import styles from "./page.module.css";
import { CoffeeAtmosphereController } from "./CoffeeAtmosphereController";
import { PrismSceneHost, type PrismSceneHostReadyContext } from "./PrismSceneHost";
import {
  coffeeAtmosphereActivity,
  type CoffeeAtmospherePhase,
  type CoffeeAtmosphereTheme,
} from "./coffeeAtmosphere";
import { prismSceneQualityCeilingForGraphicsQuality } from "./graphicsQuality";

declare global {
  interface Window {
    __PRISM_FORCE_WEBGL_FAILURE__?: boolean;
  }
}

export interface CoffeeAtmosphereSceneProps {
  phase: CoffeeAtmospherePhase;
  theme: CoffeeAtmosphereTheme;
  seed: string;
  activeSpeakerColor: string | null;
  replayActive: boolean;
  graphicsQuality: GraphicsQuality;
}

type CoffeeAtmosphereRendererStatus =
  | "initializing"
  | "webgl"
  | "context-lost"
  | "fallback";

export function CoffeeAtmosphereScene(
  props: CoffeeAtmosphereSceneProps,
): React.JSX.Element {
  const semanticState = useMemo(
    () => ({
      phase: props.phase,
      theme: props.theme,
      seed: props.seed,
      activeSpeakerColor: props.activeSpeakerColor,
      replayActive: props.replayActive,
    }),
    [
      props.phase,
      props.theme,
      props.seed,
      props.activeSpeakerColor,
      props.replayActive,
    ],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<PrismSceneHost | null>(null);
  const controllerRef = useRef<CoffeeAtmosphereController | null>(null);
  const readyContextRef = useRef<PrismSceneHostReadyContext | null>(null);
  const latestPropsRef = useRef(semanticState);
  const initialGraphicsQualityRef = useRef(props.graphicsQuality);
  const mountedRef = useRef(false);
  const [rendererStatus, setRendererStatus] =
    useState<CoffeeAtmosphereRendererStatus>("initializing");

  const updateRendererStatus = (
    status: CoffeeAtmosphereRendererStatus,
  ): void => {
    if (!mountedRef.current) return;
    const node = containerRef.current;
    if (node) node.dataset.rendererStatus = status;
    setRendererStatus(status);
  };

  const createController = (
    context: PrismSceneHostReadyContext,
  ): CoffeeAtmosphereController => {
    const current = latestPropsRef.current;
    const controller = new CoffeeAtmosphereController({
      pixi: context.pixi,
      app: context.app,
      quality: hostRef.current?.quality ?? context.quality,
      state: current,
      onObjectCount: (count) => hostRef.current?.setObjectCount(count),
    });
    controller.resize(context.app.screen.width, context.app.screen.height);
    return controller;
  };

  useEffect(() => {
    mountedRef.current = true;
    const container = containerRef.current;
    if (!container) return;
    const current = latestPropsRef.current;
    const forceFailure = window.__PRISM_FORCE_WEBGL_FAILURE__ === true;
    const host = new PrismSceneHost({
      sceneId: "coffee-atmosphere",
      container,
      activity: coffeeAtmosphereActivity(current),
      qualityCeiling: prismSceneQualityCeilingForGraphicsQuality(
        initialGraphicsQualityRef.current,
      ),
      ...(forceFailure
        ? {
            pixiLoader: async () => {
              throw new Error("Forced WebGL initialization failure");
            },
          }
        : {}),
      onReady: (context) => {
        readyContextRef.current = context;
        controllerRef.current = createController(context);
      },
      onTick: ({ deltaMs }) => controllerRef.current?.tick(deltaMs),
      onResize: (width, height) =>
        controllerRef.current?.resize(width, height),
      onQualityChange: (quality) => {
        controllerRef.current?.setQuality(quality);
        hostRef.current?.setObjectCount(
          controllerRef.current?.objectCount ?? 0,
        );
      },
      onContextLost: () => updateRendererStatus("context-lost"),
      onContextRestored: () => {
        const context = readyContextRef.current;
        if (!context) throw new Error("Coffee scene context was not retained");
        controllerRef.current?.destroy();
        controllerRef.current = createController(context);
      },
      onContextReady: () => updateRendererStatus("webgl"),
      onFallback: () => updateRendererStatus("fallback"),
    });
    hostRef.current = host;
    void host.initialize().then((ready) => {
      updateRendererStatus(ready ? "webgl" : "fallback");
    });

    return () => {
      mountedRef.current = false;
      controllerRef.current?.destroy();
      controllerRef.current = null;
      readyContextRef.current = null;
      host.destroy();
      hostRef.current = null;
    };
  }, []);

  useEffect(() => {
    hostRef.current?.setQualityCeiling(
      prismSceneQualityCeilingForGraphicsQuality(props.graphicsQuality),
    );
  }, [props.graphicsQuality]);

  useEffect(() => {
    latestPropsRef.current = semanticState;
    const host = hostRef.current;
    const controller = controllerRef.current;
    host?.setActivity(coffeeAtmosphereActivity(semanticState));
    controller?.setSemanticState(semanticState);
    host?.setObjectCount(controller?.objectCount ?? 0);
    host?.invalidate();
  }, [semanticState]);

  return (
    <div
      ref={containerRef}
      className={styles.coffeeAtmosphereScene}
      data-coffee-atmosphere="true"
      data-prism-expensive-effect="true"
      data-renderer-status={rendererStatus}
      data-coffee-phase={props.phase}
      data-theme={props.theme}
      data-replay-active={props.replayActive ? "true" : undefined}
      aria-hidden="true"
    />
  );
}
