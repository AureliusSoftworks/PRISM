"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  mysteryRoomCinematographyArtStyleV1,
  mysteryRoomCinematographyCanvasSize,
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
  blurred: boolean;
  reducedMotion: boolean;
}

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
  const profile = mysteryRoomCinematographyProfileV1(props.room);
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

    const drawLights = (elapsedSeconds: number): void => {
      lightContext.clearRect(0, 0, width, height);
      for (const emitter of profile.emitters) {
        drawGlow(
          lightContext,
          emitter,
          width,
          height,
          mysteryRoomLightIntensityV1({
            emitter,
            elapsedSeconds,
            reducedMotion: props.reducedMotion,
          }),
        );
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
      drawLights(props.reducedMotion ? 0 : performance.now() / 1000);
      drawGrain(0);
    };

    const render = (time: number): void => {
      if (time - lastLightAt >= 1000 / 30) {
        drawLights(time / 1000);
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
  }, [profile, props.reducedMotion, props.room.id]);

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
