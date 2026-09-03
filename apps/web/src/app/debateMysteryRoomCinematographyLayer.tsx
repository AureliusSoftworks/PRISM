"use client";

import {
  mansionDirectionalGeometryIsPolygonV2,
  mansionDynamicLightFrameV2,
  mansionGodrayEdgesV2,
  type MansionDynamicLightV2,
  type MansionLightBlendModeV1,
  type MansionLightPointV2,
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
  mysteryRoomLightCanvasSizeV1,
  mysteryRoomLightIntensityV1,
  type MysteryRoomLightEmitterV1,
} from "./debateMysteryRoomCinematography";
import styles from "./debateMysteryRoomCinematography.module.css";
import { roomLightBlend } from "./roomLightPlacement";

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
  artStyle?: "mosaic" | "illustrated";
  blendMode?: MansionLightBlendModeV1;
  sourceAspectRatio?: number;
  viewport?: boolean;
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
  radiusScale = 1,
): void {
  const radius = width * light.geometry.radius * radiusScale;
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

const lerpPoint = (
  from: MansionLightPointV2,
  to: MansionLightPointV2,
  amount: number,
): MansionLightPointV2 => ({
  x: from.x + (to.x - from.x) * amount,
  y: from.y + (to.y - from.y) * amount,
});

/** A godray polygon: the same falloff as the legacy beam, now running from the
 * window edge to the floor landing, with dust drifting down the ray. */
function drawGodrayAuthoredLight(
  context: CanvasRenderingContext2D,
  light: Extract<MansionDynamicLightV2, { kind: "directional" }> & {
    geometry: { points: MansionLightPointV2[] };
  },
  width: number,
  height: number,
  intensity: number,
  elapsedMs: number,
): void {
  const points = light.geometry.points.map((point) => ({ x: point.x * width, y: point.y * height }));
  const [first, ...rest] = points;
  if (!first || rest.length < 2) return;
  const { origin, landing } = mansionGodrayEdgesV2(points);
  const from = lerpPoint(origin.start, origin.end, 0.5);
  const to = lerpPoint(landing.start, landing.end, 0.5);
  context.save();
  context.globalAlpha = intensity;
  const gradient = context.createLinearGradient(from.x, from.y, to.x, to.y);
  gradient.addColorStop(0, light.color);
  gradient.addColorStop(0.28, light.color);
  gradient.addColorStop(1, "transparent");
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of rest) context.lineTo(point.x, point.y);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
  if (light.dust) {
    const random = seededRandom(mysteryRoomCinematographySeed(light.animationSeed));
    for (let index = 0; index < 36; index += 1) {
      // Bilinear sampling keeps every mote inside the polygon; `along` is the
      // seeded drift down the ray so dust falls from the window toward the floor.
      const across = random();
      const along = (random() + elapsedMs / 45_000) % 1;
      const mote = lerpPoint(
        lerpPoint(origin.start, origin.end, across),
        lerpPoint(landing.start, landing.end, across),
        along,
      );
      context.globalAlpha = intensity * (0.2 + random() * 0.45) * (1 - along * 0.5);
      context.fillStyle = light.color;
      context.beginPath();
      context.arc(mote.x, mote.y, Math.max(0.6, width / 900), 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function drawDirectionalAuthoredLight(
  context: CanvasRenderingContext2D,
  light: Extract<MansionDynamicLightV2, { kind: "directional" }>,
  width: number,
  height: number,
  intensity: number,
  elapsedMs: number,
): void {
  const geometry = light.geometry;
  if (mansionDirectionalGeometryIsPolygonV2(geometry)) {
    drawGodrayAuthoredLight(context, { ...light, geometry }, width, height, intensity, elapsedMs);
    return;
  }
  // Legacy rotated rectangle: unchanged so saved venues render exactly as before.
  const lightWidth = width * geometry.width;
  const lightHeight = height * geometry.height;
  context.save();
  context.globalAlpha = intensity;
  context.translate(width * geometry.x, height * geometry.y);
  context.rotate(geometry.rotation * Math.PI / 180);
  const gradient = context.createLinearGradient(-lightWidth / 2, 0, lightWidth / 2, 0);
  gradient.addColorStop(0, light.color);
  gradient.addColorStop(0.28, light.color);
  gradient.addColorStop(1, "transparent");
  context.fillStyle = gradient;
  context.fillRect(-lightWidth / 2, -lightHeight / 2, lightWidth, lightHeight);
  if (light.dust) {
    const random = seededRandom(mysteryRoomCinematographySeed(light.animationSeed));
    for (let index = 0; index < 36; index += 1) {
      const x = ((random() + elapsedMs / 45_000) % 1 - 0.5) * lightWidth;
      const y = (random() - 0.5) * lightHeight;
      context.globalAlpha = intensity * (0.2 + random() * 0.45);
      context.fillStyle = light.color;
      context.beginPath();
      context.arc(x, y, Math.max(0.6, width / 900), 0, Math.PI * 2);
      context.fill();
    }
  }
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
  const frame = mansionDynamicLightFrameV2(light, elapsedMs, reducedMotion);
  const intensity = frame.intensity;
  if (light.kind === "fire" || light.kind === "omni") {
    drawRadialAuthoredLight(context, light, width, height, intensity, frame.radiusScale);
  } else if (light.kind === "directional") {
    drawDirectionalAuthoredLight(context, light, width, height, intensity, reducedMotion ? 0 : elapsedMs);
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
  const profile = lightSource === "authored" ? AUTHORED_LIGHT_PROFILE_V1 : templateProfile;
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
    let artStyle = props.artStyle ?? mysteryRoomCinematographyArtStyleV1(
      roomStage?.style.getPropertyValue("--room-image"),
    );
    let { width, height } = mysteryRoomLightCanvasSizeV1();
    let { width: grainWidth, height: grainHeight } = mysteryRoomCinematographyCanvasSize(artStyle);

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
      const image = grainContext.createImageData(grainWidth, grainHeight);
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
      artStyle = props.artStyle ?? mysteryRoomCinematographyArtStyleV1(
        roomStage?.style.getPropertyValue("--room-image"),
      );
      ({ width, height } = mysteryRoomLightCanvasSizeV1());
      ({ width: grainWidth, height: grainHeight } = mysteryRoomCinematographyCanvasSize(artStyle));
      if (props.sourceAspectRatio) {
        height = Math.max(1, Math.round(width / props.sourceAspectRatio));
        grainHeight = Math.max(1, Math.round(grainWidth / props.sourceAspectRatio));
      }
      root.dataset.artStyle = artStyle;
      root.style.setProperty("--room-light-blend", roomLightBlend(props.blendMode, artStyle));
      if (lightCanvas.width !== width || lightCanvas.height !== height) {
        lightCanvas.width = width;
        lightCanvas.height = height;
      }
      if (grainCanvas.width !== grainWidth || grainCanvas.height !== grainHeight) {
        grainCanvas.width = grainWidth;
        grainCanvas.height = grainHeight;
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
  }, [lightSource, profile, props.lights, props.reducedMotion, props.room.id, props.artStyle, props.blendMode, props.sourceAspectRatio]);

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
      data-viewport={props.viewport ? "true" : undefined}
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
