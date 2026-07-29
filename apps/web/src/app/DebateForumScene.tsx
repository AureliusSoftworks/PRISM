"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphicsQuality } from "@localai/shared";
import {
  PrismSceneHost,
  type PrismPixiApplication,
  type PrismPixiModule,
  type PrismSceneHostReadyContext,
} from "./PrismSceneHost";
import { prismSceneQualityCeilingForGraphicsQuality } from "./graphicsQuality";
import type { PrismSceneQualityConfig } from "./prismSceneRuntime";
import styles from "./DebateExperience.module.css";

export type DebateForumRole = "for" | "against" | "moderator";
export type DebateForumCameraView = "wide" | "left" | "moderator" | "right";

export interface DebateForumSceneProps {
  activeRole: DebateForumRole | null;
  cameraView: DebateForumCameraView;
  forColor: string | null;
  againstColor: string | null;
  moderatorColor: string | null;
  graphicsQuality: GraphicsQuality;
  live: boolean;
  theme: "light" | "dark";
}

type DebateForumSemanticState = Omit<DebateForumSceneProps, "graphicsQuality">;

type RendererStatus = "initializing" | "webgl" | "context-lost" | "fallback";

interface ForumLight {
  role: DebateForumRole;
  sprite: import("pixi.js").Sprite;
  mask: import("pixi.js").Graphics;
  targetAlpha: number;
}

function colorNumber(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const normalized = value.trim().replace(/^#/u, "");
  if (!/^[0-9a-f]{6}$/iu.test(normalized)) return fallback;
  return Number.parseInt(normalized, 16);
}

class DebateForumController {
  private readonly pixi: PrismPixiModule;
  private readonly app: PrismPixiApplication;
  private readonly root: import("pixi.js").Container;
  private readonly glowTexture: import("pixi.js").Texture;
  private readonly lights: ForumLight[];
  private state: DebateForumSemanticState;
  private quality: PrismSceneQualityConfig;
  private width = 1;
  private height = 1;

  constructor(options: {
    pixi: PrismPixiModule;
    app: PrismPixiApplication;
    state: DebateForumSemanticState;
    quality: PrismSceneQualityConfig;
  }) {
    this.pixi = options.pixi;
    this.app = options.app;
    this.state = options.state;
    this.quality = options.quality;
    this.root = new this.pixi.Container({ isRenderGroup: true });
    this.glowTexture = this.createGlowTexture();
    this.lights = (["for", "against", "moderator"] as const).map((role) => {
      const mask = new this.pixi.Graphics();
      const sprite = new this.pixi.Sprite({
        texture: this.glowTexture,
        anchor: 0.5,
        blendMode: "hard-light",
        alpha: 0.22,
      });
      sprite.mask = mask;
      this.root.addChild(mask, sprite);
      return { role, sprite, mask, targetAlpha: 0.22 };
    });
    this.app.stage.addChild(this.root);
    this.setSemanticState(this.state, true);
  }

  get objectCount(): number {
    return this.lights.length * 2 + 1;
  }

  setQuality(quality: PrismSceneQualityConfig): void {
    this.quality = quality;
    if (!quality.continuousMotion) this.applyTargetsImmediately();
  }

  setSemanticState(state: DebateForumSemanticState, immediate = false): void {
    this.state = state;
    this.applyLayout();
    const colors: Record<DebateForumRole, number> = {
      for: colorNumber(state.forColor, 0x42d9ff),
      against: colorNumber(state.againstColor, 0xff5f8f),
      moderator: colorNumber(state.moderatorColor, 0xd9d2ff),
    };
    for (const light of this.lights) {
      light.sprite.tint = colors[light.role];
      light.targetAlpha =
        state.activeRole === light.role ? 0.58 : state.live ? 0.24 : 0.16;
    }
    if (immediate || !this.quality.continuousMotion) {
      this.applyTargetsImmediately();
    }
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.applyLayout();
  }

  tick(deltaMs: number): void {
    if (!this.quality.continuousMotion) return;
    const easing = 1 - Math.exp(-Math.max(0, deltaMs) / 260);
    for (const light of this.lights) {
      light.sprite.alpha += (light.targetAlpha - light.sprite.alpha) * easing;
    }
  }

  destroy(): void {
    this.app.stage.removeChild(this.root);
    this.root.destroy({ children: true });
    this.glowTexture.destroy(true);
  }

  private createGlowTexture(): import("pixi.js").Texture {
    const graphics = new this.pixi.Graphics();
    for (let index = 18; index >= 1; index -= 1) {
      const radius = (index / 18) * 64;
      const alpha = 0.012 + ((18 - index) / 17) ** 2 * 0.08;
      graphics.circle(64, 64, radius).fill({ color: 0xffffff, alpha });
    }
    const texture = this.app.renderer.generateTexture({
      target: graphics,
      frame: new this.pixi.Rectangle(0, 0, 128, 128),
      resolution: 1,
    });
    graphics.destroy();
    return texture;
  }

  private applyTargetsImmediately(): void {
    for (const light of this.lights) {
      light.sprite.alpha = light.targetAlpha;
    }
  }

  private applyLayout(): void {
    const byRole = new Map(this.lights.map((light) => [light.role, light]));
    const forLight = byRole.get("for");
    const againstLight = byRole.get("against");
    const moderatorLight = byRole.get("moderator");
    if (!forLight || !againstLight || !moderatorLight) return;

    const moderatorCamera = this.state.cameraView === "moderator";

    forLight.sprite.position.set(
      this.width * (moderatorCamera ? 0.16 : 0.17),
      this.height * (moderatorCamera ? 0.54 : 0.58),
    );
    againstLight.sprite.position.set(
      this.width * (moderatorCamera ? 0.84 : 0.83),
      this.height * (moderatorCamera ? 0.54 : 0.58),
    );
    moderatorLight.sprite.position.set(
      this.width * 0.5,
      this.height * (moderatorCamera ? 0.4 : 0.34),
    );
    forLight.sprite.width = againstLight.sprite.width =
      this.width * (moderatorCamera ? 0.55 : 0.62);
    forLight.sprite.height = againstLight.sprite.height =
      this.height * (moderatorCamera ? 1.08 : 1.05);
    moderatorLight.sprite.width = this.width * (moderatorCamera ? 0.56 : 0.5);
    moderatorLight.sprite.height =
      this.height * (moderatorCamera ? 0.88 : 0.74);

    forLight.mask
      .clear()
      .poly(
        moderatorCamera
          ? [
              0,
              this.height * 0.02,
              this.width * 0.32,
              0,
              this.width * 0.29,
              this.height * 0.96,
              0,
              this.height,
            ]
          : [
              0,
              this.height * 0.06,
              this.width * 0.405,
              0,
              this.width * 0.36,
              this.height * 0.92,
              this.width * 0.04,
              this.height,
            ],
      )
      .fill(0xffffff);
    againstLight.mask
      .clear()
      .poly(
        moderatorCamera
          ? [
              this.width * 0.68,
              0,
              this.width,
              this.height * 0.02,
              this.width,
              this.height,
              this.width * 0.71,
              this.height * 0.96,
            ]
          : [
              this.width * 0.595,
              0,
              this.width,
              this.height * 0.06,
              this.width * 0.96,
              this.height,
              this.width * 0.64,
              this.height * 0.92,
            ],
      )
      .fill(0xffffff);
    moderatorLight.mask
      .clear()
      .poly(
        moderatorCamera
          ? [
              this.width * 0.305,
              0,
              this.width * 0.695,
              0,
              this.width * 0.66,
              this.height * 0.82,
              this.width * 0.34,
              this.height * 0.82,
            ]
          : [
              this.width * 0.34,
              0,
              this.width * 0.66,
              0,
              this.width * 0.6,
              this.height * 0.68,
              this.width * 0.4,
              this.height * 0.68,
            ],
      )
      .fill(0xffffff);
  }
}

export function DebateForumScene(
  props: DebateForumSceneProps,
): React.JSX.Element {
  const semanticState = useMemo<DebateForumSemanticState>(
    () => ({
      activeRole: props.activeRole,
      cameraView: props.cameraView,
      forColor: props.forColor,
      againstColor: props.againstColor,
      moderatorColor: props.moderatorColor,
      live: props.live,
      theme: props.theme,
    }),
    [
      props.activeRole,
      props.againstColor,
      props.cameraView,
      props.forColor,
      props.live,
      props.moderatorColor,
      props.theme,
    ],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<PrismSceneHost | null>(null);
  const controllerRef = useRef<DebateForumController | null>(null);
  const readyContextRef = useRef<PrismSceneHostReadyContext | null>(null);
  const latestStateRef = useRef(semanticState);
  const initialQualityRef = useRef(props.graphicsQuality);
  const initialLiveRef = useRef(semanticState.live);
  const mountedRef = useRef(false);
  const [rendererStatus, setRendererStatus] =
    useState<RendererStatus>("initializing");

  const updateStatus = (status: RendererStatus): void => {
    if (!mountedRef.current) return;
    setRendererStatus(status);
  };

  const createController = (
    context: PrismSceneHostReadyContext,
  ): DebateForumController => {
    const controller = new DebateForumController({
      pixi: context.pixi,
      app: context.app,
      quality: hostRef.current?.quality ?? context.quality,
      state: latestStateRef.current,
    });
    controller.resize(context.app.screen.width, context.app.screen.height);
    hostRef.current?.setObjectCount(controller.objectCount);
    return controller;
  };

  useEffect(() => {
    mountedRef.current = true;
    const container = containerRef.current;
    if (!container) return;
    const host = new PrismSceneHost({
      sceneId: "debate-forum",
      container,
      activity: initialLiveRef.current ? "interactive" : "settled",
      qualityCeiling: prismSceneQualityCeilingForGraphicsQuality(
        initialQualityRef.current,
      ),
      ...(window.__PRISM_FORCE_WEBGL_FAILURE__ === true
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
      onResize: (width, height) => controllerRef.current?.resize(width, height),
      onQualityChange: (quality) => controllerRef.current?.setQuality(quality),
      onContextLost: () => updateStatus("context-lost"),
      onContextRestored: () => {
        const context = readyContextRef.current;
        if (!context) throw new Error("Debate forum context was not retained");
        controllerRef.current?.destroy();
        controllerRef.current = createController(context);
      },
      onContextReady: () => updateStatus("webgl"),
      onFallback: () => updateStatus("fallback"),
    });
    hostRef.current = host;
    void host
      .initialize()
      .then((ready) => updateStatus(ready ? "webgl" : "fallback"));
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
    latestStateRef.current = semanticState;
    hostRef.current?.setActivity(
      semanticState.live ? "interactive" : "settled",
    );
    controllerRef.current?.setSemanticState(semanticState);
    hostRef.current?.invalidate();
  }, [semanticState]);

  return (
    <div
      ref={containerRef}
      className={styles.forumScene}
      data-prism-expensive-effect="true"
      data-renderer-status={rendererStatus}
      aria-hidden="true"
    />
  );
}
