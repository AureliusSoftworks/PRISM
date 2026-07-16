import type { PrismSceneActivity } from "./prismSceneRuntime";

export type CoffeeAtmospherePhase =
  | "selecting"
  | "preview"
  | "topic"
  | "arriving"
  | "live"
  | "finished";

export type CoffeeAtmosphereTheme = "light" | "dark";

export interface CoffeeAtmosphereMoteSeed {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  speed: number;
  sway: number;
  rotation: number;
  rotationSpeed: number;
  phase: number;
  colorIndex: number;
}

const DARK_PALETTE = ["#ff5ea0", "#ffcc5c", "#46dcff", "#865eff"] as const;
const LIGHT_PALETTE = ["#77bdfc", "#9be7ff", "#9da9ff", "#d2a7ff"] as const;

export const COFFEE_ATMOSPHERE_SPEAKER_BLEND_MS = 700;

export function coffeeAtmospherePalette(
  theme: CoffeeAtmosphereTheme,
): readonly string[] {
  return theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;
}

export function coffeeAtmosphereActivity(options: {
  phase: CoffeeAtmospherePhase;
  replayActive: boolean;
  activeSpeakerColor: string | null;
}): PrismSceneActivity {
  const motionPhase =
    options.replayActive ||
    options.phase === "arriving" ||
    options.phase === "live";
  if (!motionPhase) return "settled";
  return options.activeSpeakerColor ? "interactive" : "ambient";
}

export function coffeeAtmosphereMotionEnabled(options: {
  phase: CoffeeAtmospherePhase;
  replayActive: boolean;
}): boolean {
  return (
    options.replayActive ||
    options.phase === "arriving" ||
    options.phase === "live"
  );
}

export function coffeeAtmosphereSpeakerLift(
  theme: CoffeeAtmosphereTheme,
): number {
  return theme === "light" ? 0.01 : 0.016;
}

export function coffeeAtmosphereSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function coffeeAtmosphereMotes(
  seed: string,
  count: number,
): CoffeeAtmosphereMoteSeed[] {
  const random = mulberry32(coffeeAtmosphereSeed(seed));
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => ({
    x: 0.16 + random() * 0.68,
    y: 0.16 + random() * 0.68,
    scale: 0.48 + random() * 0.82,
    alpha: 0.08 + random() * 0.16,
    speed: 0.006 + random() * 0.012,
    sway: 0.006 + random() * 0.012,
    rotation: random() * Math.PI * 2,
    rotationSpeed: (random() - 0.5) * 0.22,
    phase: random() * Math.PI * 2,
    colorIndex: Math.floor(random() * 4),
  }));
}

export function coffeeAtmosphereHexColor(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^#/u, "");
  if (!/^[0-9a-f]{6}$/iu.test(normalized)) return null;
  return Number.parseInt(normalized, 16);
}

export function coffeeAtmosphereMixColor(
  from: number,
  to: number,
  amount: number,
): number {
  const t = Math.max(0, Math.min(1, amount));
  const channel = (shift: number): number => {
    const start = (from >> shift) & 0xff;
    const end = (to >> shift) & 0xff;
    return Math.round(start + (end - start) * t);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
