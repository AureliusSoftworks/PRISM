"use client";

import {
  mansionDynamicLightFrameV2,
  type MansionDynamicLightV2,
} from "@localai/shared";
import {
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  mysteryRoomCinematographyArtStyleV1,
  mysteryRoomCinematographyCanvasSize,
  mysteryRoomCinematographyLightSourceV1,
  mysteryRoomCinematographyProfileV1,
  mysteryRoomCinematographySeed,
  mysteryRoomLightIntensityV1,
  type MysteryRoomLightEmitterV1,
} from "./debateMysteryRoomCinematography";
import styles from "./debateMysteryRoomCinematography.module.css";

interface DebateMysteryRoomCinematographyLayerProps {
  room: {
    id: string;
    templateId?: string | null;
    name?: string | null;
  };
  lights: readonly MansionDynamicLightV2[];
  templateLightingAligned: boolean;
  blurred: boolean;
  reducedMotion: boolean;
}

const AUTHORED_LIGHT_PROFILE_V1 = Object.freeze({
  version: 1 as const,
  id: "authored-room-lights-v2",
  gradeTop: "transparent",
  gradeBottom: "transparent",
  grainOpacity: 0,
  vignetteOpacity: 0,
  emitters: Object.freeze<MysteryRoomLightEmitterV1[]>([]),
});

function drawGlow(
  context: CanvasRenderingContext2D,
  emitter: MysteryRoomLightEmitterV1,
  width: number,
  height: number,
  intensity: number,
): void {
  context.save();
  context.translate(width * emitter.x, height * emitter.y);
  context.scale(width * emitter.radiusX, height * emitter.radiusY);
  const gradient = context.createRadialGradient(0, 0, 0.02, 0, 0, 1);
  const [red, green, blue] = emitter.color;
  gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${intensity})`);
  gradient.addColorStop(0.38, `rgba(${red}, ${green}, ${blue}, ${intensity * 0.54})`);
  gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
  context.fillStyle = gradient;
  context.fillRect(-1, -1, 2, 2);
  context.restore();
}

function drawRadialAuthoredLight(
  context: CanvasRenderingContext2D,
  light: Extract<MansionDynamicLightV2, { kind: "fire" | "omni" }>,
  width: number,
  height: number,
  intensity: number,
): void {
  const radius = width * light.geometry.radius;
  context.save();
  context.globalAlpha = intensity;
  context.translate(width * light.geometry.x, height * light.geometry.y);
  if (light.kind === "fire") {
    context.rotate(light.geometry.rotation * Math.PI / 180);
    context.scale(0.82, 1.18);
  }
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, light.color);
  gradient.addColorStop(light.kind === "fire" ? 0.22 : 0.12, light.color);
  gradient.addColorStop(1, "transparent");
  context.fillStyle = gradient;
  context.fillRect(-radius, -radius, radius * 2, radius * 2);
  context.restore();
}

function drawDirectionalAuthoredLight(
  context: CanvasRenderingContext2D,
  light: Extract<MansionDynamicLightV2, { kind: "directional" }>,
  width: number,
  height: number,
  intensity: number,
): void {
  const lightWidth = width * light.geometry.width;
  const lightHeight = height * light.geometry.height;
  context.save();
  context.globalAlpha = intensity;
  context.translate(width * light.geometry.x, height * light.geometry.y);
  context.rotate(light.geometry.rotation * Math.PI / 180);
  const gradient = context.createLinearGradient(-lightWidth / 2, 0, lightWidth / 2, 0);
  gradient.addColorStop(0, light.color);
  gradient.addColorStop(0.28, light.color);
  gradient.addColorStop(1, "transparent");
  context.fillStyle = gradient;
  context.fillRect(-lightWidth / 2, -lightHeight / 2, lightWidth, lightHeight);
  context.restore();
}

function drawNeonAuthoredLight(
  context: CanvasRenderingContext2D,
  light: Extract<MansionDynamicLightV2, { kind: "neon" }>,
  width: number,
  height: number,
  intensity: number,
): void {
  const [first, ...rest] = light.geometry.points;
  if (!first) return;
  context.save();
  context.globalAlpha = intensity;
  context.strokeStyle = light.color;
  context.shadowColor = light.color;
  context.shadowBlur = Math.max(4, light.geometry.width * Math.min(width, height) * 3);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(1, light.geometry.width * Math.min(width, height));
  context.beginPath();
  context.moveTo(first.x * width, first.y * height);
  for (const point of rest) context.lineTo(point.x * width, point.y * height);
  context.stroke();
  context.restore();
}

function drawAuthoredLight(
  context: CanvasRenderingContext2D,
  light: MansionDynamicLightV2,
  width: number,
  height: number,
  elapsedMs: number,
  reducedMotion: boolean,
): void {
  const intensity = mansionDynamicLightFrameV2(light, elapsedMs, reducedMotion).intensity;
  if (light.kind === "fire" || light.kind === "omni") {
    drawRadialAuthoredLight(context, light, width, height, intensity);
  } else if (light.kind === "directional") {
    drawDirectionalAuthoredLight(context, light, width, height, intensity);
  } else {
    drawNeonAuthoredLight(context, light, width, height, intensity);
  }
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function DebateMysteryRoomCinematographyLayer(
  props: DebateMysteryRoomCinematographyLayerProps,
): React.JSX.Element | null {
  const templateProfile = mysteryRoomCinematographyProfileV1(props.room);
  const lightSource = mysteryRoomCinematographyLightSourceV1({
    authoredLightCount: props.lights.length,
    templateLightingAligned: props.templateLightingAligned,
    hasTemplateProfile: Boolean(templateProfile),
  });
  const profile = templateProfile ?? (lightSource === "authored" ? AUTHORED_LIGHT_PROFILE_V1 : null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lightCanvasRef = useRef<HTMLCanvasElement>(null);
  const grainCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!profile) return;
    const root = rootRef.current;
    const lightCanvas = lightCanvasRef.current;
    const grainCanvas = grainCanvasRef.current;
    const lightContext = lightCanvas?.getContext("2d");
    const grainContext = grainCanvas?.getContext("2d");
    if (!root || !lightCanvas || !grainCanvas || !lightContext || !grainContext) return;

    const roomStage = root.closest<HTMLElement>('[data-mystery-room-stage="true"]');
    let artStyle = mysteryRoomCinematographyArtStyleV1(
      roomStage?.style.getPropertyValue("--room-image"),
    );
    let { width, height } = mysteryRoomCinematographyCanvasSize(artStyle);

    let animationFrame = 0;
    let lastLightAt = Number.NEGATIVE_INFINITY;
    let lastGrainFrame = -1;

    const drawLights = (elapsedMs: number): void => {
      lightContext.clearRect(0, 0, width, height);
      if (lightSource === "template") {
        for (const emitter of profile.emitters) {
          drawGlow(
            lightContext,
            emitter,
            width,
            height,
            mysteryRoomLightIntensityV1({
              emitter,
              elapsedSeconds: elapsedMs / 1000,
              reducedMotion: props.reducedMotion,
            }),
          );
        }
      } else if (lightSource === "authored") {
        for (const light of props.lights) {
          drawAuthoredLight(
            lightContext,
            light,
            width,
            height,
            elapsedMs,
            props.reducedMotion,
          );
        }
      }
    };

    const drawGrain = (frame: number): void => {
      const random = seededRandom(
        mysteryRoomCinematographySeed(props.room.id) + frame * 73 + (artStyle === "mosaic" ? 11 : 29),
      );
      const image = grainContext.createImageData(width, height);
      const density = artStyle === "mosaic" ? 0.12 : 0.18;
      const alpha = artStyle === "mosaic" ? 42 : 27;
      for (let index = 0; index < image.data.length; index += 4) {
        if (random() > density) continue;
        const value = random() > 0.5 ? 235 : 18;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = alpha;
      }
      grainContext.putImageData(image, 0, 0);
    };

    const configureArtStyle = (): void => {
      artStyle = mysteryRoomCinematographyArtStyleV1(
        roomStage?.style.getPropertyValue("--room-image"),
      );
      ({ width, height } = mysteryRoomCinematographyCanvasSize(artStyle));
      root.dataset.artStyle = artStyle;
      if (lightCanvas.width !== width || lightCanvas.height !== height) {
        lightCanvas.width = width;
        lightCanvas.height = height;
        grainCanvas.width = width;
        grainCanvas.height = height;
      }
      lastLightAt = Number.NEGATIVE_INFINITY;
      lastGrainFrame = -1;
      drawLights(props.reducedMotion ? 0 : performance.now());
      drawGrain(0);
    };

    const render = (time: number): void => {
      if (time - lastLightAt >= 1000 / 30) {
        drawLights(time);
        lastLightAt = time;
      }
      const grainFrame = props.reducedMotion ? 0 : Math.floor(time / 260);
      if (grainFrame !== lastGrainFrame) {
        drawGrain(grainFrame);
        lastGrainFrame = grainFrame;
      }
      if (!props.reducedMotion) animationFrame = window.requestAnimationFrame(render);
    };

    configureArtStyle();
    const stageObserver = roomStage ? new MutationObserver(configureArtStyle) : null;
    if (roomStage && stageObserver) {
      stageObserver.observe(roomStage, { attributes: true, attributeFilter: ["style"] });
    }
    render(props.reducedMotion ? 0 : performance.now());
    return () => {
      stageObserver?.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [lightSource, profile, props.lights, props.reducedMotion, props.room.id]);

  if (!profile) return null;
  const style = {
    "--room-cinema-grade-top": profile.gradeTop,
    "--room-cinema-grade-bottom": profile.gradeBottom,
    "--room-cinema-grain-opacity": profile.grainOpacity,
    "--room-cinema-vignette-opacity": profile.vignetteOpacity,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-art-style="illustrated"
      data-blurred={props.blurred ? "true" : undefined}
      data-cinematography-profile={profile.id}
      data-light-source={lightSource}
      data-light-motion={props.reducedMotion ? "frozen" : "live"}
      style={style}
      aria-hidden="true"
    >
      <div className={styles.grade} />
      <canvas ref={lightCanvasRef} className={styles.lighting} />
      <canvas ref={grainCanvasRef} className={styles.grain} />
      <div className={styles.vignette} />
    </div>
  );
}
