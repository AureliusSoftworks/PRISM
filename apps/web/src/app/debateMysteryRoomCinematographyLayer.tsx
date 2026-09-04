"use client";

import {
  MANSION_EFFECT_DEFAULT_BLEND_MODE_V1,
  mansionDirectionalGeometryIsPolygonV2,
  mansionDynamicLightFrameV2,
  mansionGodrayEdgesV2,
  type MansionDynamicLightV2,
  type MansionLightBlendModeV1,
  type MansionLightPointV2,
  type MansionRoomEffectV1,
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
  /** Atmospheric effects for this room. Steam, fog, and snow paint on a sibling
   * canvas with normal blending; rain and caustics share the light canvas. */
  effects?: readonly MansionRoomEffectV1[];
  templateLightingAligned: boolean;
  blurred: boolean;
  reducedMotion: boolean;
  artStyle?: "mosaic" | "illustrated";
  blendMode?: MansionLightBlendModeV1;
  sourceAspectRatio?: number;
  viewport?: boolean;
}

/** Stable empty list so a caller that omits effects does not re-group and re-init canvases each render. */
const EMPTY_EFFECTS: readonly MansionRoomEffectV1[] = Object.freeze([]);

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
  softness = 0,
): void {
  const points = light.geometry.points.map((point) => ({ x: point.x * width, y: point.y * height }));
  const [first, ...rest] = points;
  if (!first || rest.length < 2) return;
  const { origin, landing } = mansionGodrayEdgesV2(points);
  const from = lerpPoint(origin.start, origin.end, 0.5);
  const to = lerpPoint(landing.start, landing.end, 0.5);
  // Cloud cover diffuses the beam: its solid core shortens and its landing edge
  // spreads a little wider about the same center. Dust keeps the clear-sky edges.
  const spreadScale = 1 + 0.05 * softness;
  const veiledLanding = {
    start: lerpPoint(to, landing.start, spreadScale),
    end: lerpPoint(to, landing.end, spreadScale),
  };
  context.save();
  context.globalAlpha = intensity;
  const gradient = context.createLinearGradient(from.x, from.y, to.x, to.y);
  gradient.addColorStop(0, light.color);
  gradient.addColorStop(0.28 - 0.1 * softness, light.color);
  gradient.addColorStop(1, "transparent");
  // Trace the quad through its paired edges so a twisted point order never draws a bow-tie.
  context.beginPath();
  context.moveTo(origin.start.x, origin.start.y);
  context.lineTo(origin.end.x, origin.end.y);
  context.lineTo(veiledLanding.end.x, veiledLanding.end.y);
  context.lineTo(veiledLanding.start.x, veiledLanding.start.y);
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
  softness = 0,
): void {
  const geometry = light.geometry;
  if (mansionDirectionalGeometryIsPolygonV2(geometry)) {
    drawGodrayAuthoredLight(context, { ...light, geometry }, width, height, intensity, elapsedMs, softness);
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

/** A point inside an effect's quad by its bilinear coordinates: `across` along the
 * source edge, `along` from the source edge toward the far edge. */
function quadPoint(
  edges: ReturnType<typeof mansionGodrayEdgesV2>,
  across: number,
  along: number,
): MansionLightPointV2 {
  return lerpPoint(
    lerpPoint(edges.origin.start, edges.origin.end, across),
    lerpPoint(edges.landing.start, edges.landing.end, across),
    along,
  );
}

function effectEdges(effect: MansionRoomEffectV1, width: number, height: number): ReturnType<typeof mansionGodrayEdgesV2> {
  return mansionGodrayEdgesV2(effect.geometry.points.map((point) => ({ x: point.x * width, y: point.y * height })));
}

function softBlob(context: CanvasRenderingContext2D, point: MansionLightPointV2, radius: number, color: string, alpha: number): void {
  if (radius <= 0 || alpha <= 0) return;
  const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.55, color);
  gradient.addColorStop(1, "transparent");
  context.globalAlpha = alpha;
  context.fillStyle = gradient;
  context.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
}

/** Steam or smoke: motes leave the source edge, drift toward the far edge,
 * wander sideways more the farther they travel, and swell as they thin. */
function drawSteamEffect(context: CanvasRenderingContext2D, effect: MansionRoomEffectV1, width: number, height: number, elapsedMs: number): void {
  const edges = effectEdges(effect, width, height);
  const random = seededRandom(mysteryRoomCinematographySeed(effect.animationSeed));
  const seconds = elapsedMs / 1000;
  const count = Math.round(24 + 48 * effect.intensity);
  const baseRadius = width * 0.018 * (0.6 + effect.intensity);
  context.save();
  for (let index = 0; index < count; index += 1) {
    const across = random();
    const period = 6 + random() * 4;
    const along = (random() + seconds / period) % 1;
    const wander = Math.sin(seconds * 0.6 + random() * Math.PI * 2) * along * 0.3;
    const point = quadPoint(edges, across + wander, along);
    softBlob(context, point, baseRadius * (0.6 + along * 1.8), effect.color, effect.intensity * 0.26 * (1 - along) * (0.6 + 0.4 * random()));
  }
  context.restore();
}

/** Fog: a few large, slow, overlapping veils drifting along the quad. */
function drawFogEffect(context: CanvasRenderingContext2D, effect: MansionRoomEffectV1, width: number, height: number, elapsedMs: number): void {
  const edges = effectEdges(effect, width, height);
  const random = seededRandom(mysteryRoomCinematographySeed(effect.animationSeed));
  const seconds = elapsedMs / 1000;
  const count = 6 + Math.round(6 * effect.intensity);
  context.save();
  for (let index = 0; index < count; index += 1) {
    const across = random();
    const along = (random() + seconds / (34 + random() * 12)) % 1;
    const point = quadPoint(edges, across + 0.04 * Math.sin(seconds * 0.11 + random() * Math.PI * 2), along);
    softBlob(context, point, width * (0.1 + random() * 0.12), effect.color, effect.intensity * 0.13 * Math.sin(along * Math.PI));
  }
  context.restore();
}

/** Snow behind glass: slow tumbling flakes with a gentle sideways sway. */
function drawSnowEffect(context: CanvasRenderingContext2D, effect: MansionRoomEffectV1, width: number, height: number, elapsedMs: number): void {
  const edges = effectEdges(effect, width, height);
  const random = seededRandom(mysteryRoomCinematographySeed(effect.animationSeed));
  const seconds = elapsedMs / 1000;
  const count = Math.round(30 + 50 * effect.intensity);
  context.save();
  context.fillStyle = effect.color;
  for (let index = 0; index < count; index += 1) {
    const sway = random() * Math.PI * 2;
    const along = (random() + seconds / (10 + random() * 6)) % 1;
    const across = random() + 0.04 * Math.sin(seconds * 0.5 + sway);
    const point = quadPoint(edges, across, along);
    context.globalAlpha = effect.intensity * (0.5 + 0.4 * random());
    context.beginPath();
    context.arc(point.x, point.y, (0.8 + random() * 1.4) * (width / 800), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

/** Rain behind glass: a faint cool wash on the pane, fast streaks along the
 * fall direction, and a few slow drops crawling down. Drawn as light. */
function drawRainEffect(context: CanvasRenderingContext2D, effect: MansionRoomEffectV1, width: number, height: number, elapsedMs: number): void {
  const edges = effectEdges(effect, width, height);
  const random = seededRandom(mysteryRoomCinematographySeed(effect.animationSeed));
  const seconds = elapsedMs / 1000;
  const from = lerpPoint(edges.origin.start, edges.origin.end, 0.5);
  const to = lerpPoint(edges.landing.start, edges.landing.end, 0.5);
  const run = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  const direction = { x: (to.x - from.x) / run, y: (to.y - from.y) / run };
  const streak = height * 0.03;
  context.save();
  context.globalAlpha = effect.intensity * 0.05;
  context.fillStyle = effect.color;
  context.beginPath();
  context.moveTo(edges.origin.start.x, edges.origin.start.y);
  context.lineTo(edges.origin.end.x, edges.origin.end.y);
  context.lineTo(edges.landing.end.x, edges.landing.end.y);
  context.lineTo(edges.landing.start.x, edges.landing.start.y);
  context.closePath();
  context.fill();
  context.strokeStyle = effect.color;
  context.lineWidth = Math.max(1, width / 900);
  context.lineCap = "round";
  const streaks = Math.round(40 + 70 * effect.intensity);
  for (let index = 0; index < streaks; index += 1) {
    const across = random();
    const along = (random() + seconds / (0.7 + random() * 0.5)) % 1;
    const point = quadPoint(edges, across, along);
    context.globalAlpha = effect.intensity * (0.18 + 0.3 * random());
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + direction.x * streak, point.y + direction.y * streak);
    context.stroke();
  }
  for (let index = 0; index < 8; index += 1) {
    const across = random();
    const along = (random() + seconds / (12 + random() * 8)) % 1;
    const point = quadPoint(edges, across, along);
    softBlob(context, point, 2.2 * (width / 800), effect.color, effect.intensity * 0.55);
  }
  context.restore();
}

/** Water caustics: three interfering ripple fields sampled across the quad,
 * cubed so only the bright crossings show. Drawn as light. */
function drawCausticsEffect(context: CanvasRenderingContext2D, effect: MansionRoomEffectV1, width: number, height: number, elapsedMs: number): void {
  const edges = effectEdges(effect, width, height);
  const random = seededRandom(mysteryRoomCinematographySeed(effect.animationSeed));
  const phases = [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2];
  const seconds = elapsedMs / 1000;
  const columns = 22;
  const rows = 12;
  const cell = Math.hypot(edges.origin.end.x - edges.origin.start.x, edges.origin.end.y - edges.origin.start.y) / columns;
  context.save();
  context.fillStyle = effect.color;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const across = (column + 0.5) / columns;
      const along = (row + 0.5) / rows;
      const wave = (
        Math.sin(across * 9 + seconds * 0.9 + phases[0]!) +
        Math.sin(along * 7 - seconds * 0.7 + phases[1]!) +
        Math.sin((across + along) * 6 + seconds * 0.5 + phases[2]!)
      ) / 3;
      const bright = Math.max(0, (wave + 1) / 2);
      const alpha = effect.intensity * 0.5 * bright * bright * bright;
      if (alpha < 0.01) continue;
      const point = quadPoint(edges, across, along);
      context.globalAlpha = alpha;
      context.beginPath();
      context.arc(point.x, point.y, Math.max(1, cell * 0.65), 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

/** Occluding effects paint on the atmosphere canvas; light-like ones on the light canvas. */
const OCCLUDING_EFFECT_KINDS: ReadonlySet<MansionRoomEffectV1["kind"]> = new Set(["steam", "fog", "snow"]);

function drawRoomEffect(context: CanvasRenderingContext2D, effect: MansionRoomEffectV1, width: number, height: number, elapsedMs: number): void {
  if (effect.geometry.points.length < 3) return;
  if (effect.kind === "steam") drawSteamEffect(context, effect, width, height, elapsedMs);
  else if (effect.kind === "fog") drawFogEffect(context, effect, width, height, elapsedMs);
  else if (effect.kind === "snow") drawSnowEffect(context, effect, width, height, elapsedMs);
  else if (effect.kind === "rain") drawRainEffect(context, effect, width, height, elapsedMs);
  else drawCausticsEffect(context, effect, width, height, elapsedMs);
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
    drawDirectionalAuthoredLight(context, light, width, height, intensity, reducedMotion ? 0 : elapsedMs, frame.softness);
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
  const effects = props.effects ?? EMPTY_EFFECTS;
  const baseLightSource = mysteryRoomCinematographyLightSourceV1({
    authoredLightCount: props.lights.length,
    templateLightingAligned: props.templateLightingAligned,
    hasTemplateProfile: Boolean(templateProfile),
  });
  // A room with effects but no lights still needs the authored layer to draw them.
  const lightSource = baseLightSource === "none" && effects.length > 0 ? "authored" : baseLightSource;
  const profile = lightSource === "authored" ? AUTHORED_LIGHT_PROFILE_V1 : templateProfile;
  const hasOccludingEffects = effects.some((effect) => OCCLUDING_EFFECT_KINDS.has(effect.kind));
  // Rain and caustics are light, but they blend as effects, not as the room's lights:
  // they get a root of their own with the FX blend so the lights' pick never leaks onto them.
  const hasBlendedEffects = effects.some((effect) => !OCCLUDING_EFFECT_KINDS.has(effect.kind));
  const rootRef = useRef<HTMLDivElement>(null);
  const effectRootRef = useRef<HTMLDivElement>(null);
  const lightCanvasRef = useRef<HTMLCanvasElement>(null);
  const effectCanvasRef = useRef<HTMLCanvasElement>(null);
  const atmosphereCanvasRef = useRef<HTMLCanvasElement>(null);
  const grainCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!profile) return;
    const root = rootRef.current;
    const lightCanvas = lightCanvasRef.current;
    const grainCanvas = grainCanvasRef.current;
    const lightContext = lightCanvas?.getContext("2d");
    const grainContext = grainCanvas?.getContext("2d");
    if (!root || !lightCanvas || !grainCanvas || !lightContext || !grainContext) return;
    const atmosphereCanvas = hasOccludingEffects ? atmosphereCanvasRef.current : null;
    const atmosphereContext = atmosphereCanvas?.getContext("2d") ?? null;
    const effectCanvas = hasBlendedEffects ? effectCanvasRef.current : null;
    const effectContext = effectCanvas?.getContext("2d") ?? null;

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
      atmosphereContext?.clearRect(0, 0, width, height);
      effectContext?.clearRect(0, 0, width, height);
      for (const effect of effects) {
        const target = OCCLUDING_EFFECT_KINDS.has(effect.kind) ? atmosphereContext : effectContext;
        if (target) drawRoomEffect(target, effect, width, height, props.reducedMotion ? 0 : elapsedMs);
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
      root.style.setProperty("--room-light-blend", roomLightBlend(props.blendMode));
      if (effectRootRef.current) effectRootRef.current.dataset.artStyle = artStyle;
      if (lightCanvas.width !== width || lightCanvas.height !== height) {
        lightCanvas.width = width;
        lightCanvas.height = height;
      }
      if (effectCanvas && (effectCanvas.width !== width || effectCanvas.height !== height)) {
        effectCanvas.width = width;
        effectCanvas.height = height;
      }
      if (atmosphereCanvas && (atmosphereCanvas.width !== width || atmosphereCanvas.height !== height)) {
        atmosphereCanvas.width = width;
        atmosphereCanvas.height = height;
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
  }, [lightSource, profile, props.lights, effects, hasOccludingEffects, hasBlendedEffects, props.reducedMotion, props.room.id, props.artStyle, props.blendMode, props.sourceAspectRatio]);

  if (!profile) return null;
  const style = {
    "--room-cinema-grade-top": profile.gradeTop,
    "--room-cinema-grade-bottom": profile.gradeBottom,
    "--room-cinema-grain-opacity": profile.grainOpacity,
    "--room-cinema-vignette-opacity": profile.vignetteOpacity,
  } as CSSProperties;

  return (
    <>
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
      <canvas ref={lightCanvasRef} className={styles.lighting} data-room-light-canvas="lights" />
      <canvas ref={grainCanvasRef} className={styles.grain} />
      <div className={styles.vignette} />
    </div>
      {hasBlendedEffects ? (
        // Rain and caustics composite with the FX blend on their own root, beside the lights.
        <div
          ref={effectRootRef}
          className={styles.root}
          data-art-style="illustrated"
          data-effect-layer="true"
          data-blurred={props.blurred ? "true" : undefined}
          data-light-source="authored"
          data-viewport={props.viewport ? "true" : undefined}
          style={{ ...style, "--room-light-blend": MANSION_EFFECT_DEFAULT_BLEND_MODE_V1 } as CSSProperties}
          aria-hidden="true"
        >
          <canvas ref={effectCanvasRef} className={styles.lighting} data-room-light-canvas="effects" />
        </div>
      ) : null}
      {hasOccludingEffects ? (
        // Steam, fog, and snow sit on the plate with normal blending. The root isolates
        // its own stacking context and blends as a whole, so occluders live beside it.
        <canvas
          ref={atmosphereCanvasRef}
          className={styles.atmosphere}
          data-room-light-canvas="atmosphere"
          data-blurred={props.blurred ? "true" : undefined}
          data-viewport={props.viewport ? "true" : undefined}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
