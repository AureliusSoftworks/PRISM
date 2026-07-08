export interface BotAccessoryTintRgb {
  r: number;
  g: number;
  b: number;
}

const BOT_ACCESSORY_TINT_MAGENTA_HUE_DEG = 300;
const BOT_ACCESSORY_TINT_MAGENTA_HUE_TOLERANCE_DEG = 22;
const BOT_ACCESSORY_TINT_MAGENTA_MIN_VALUE = 72;
const BOT_ACCESSORY_TINT_MAGENTA_MIN_SATURATION = 0.28;

function cleanHex(rawHex: string | null | undefined): string | null {
  const raw = rawHex?.trim();
  if (!raw) return null;
  const clean = raw.replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return clean.toLowerCase();
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return clean
      .split("")
      .map((channel) => `${channel}${channel}`)
      .join("")
      .toLowerCase();
  }
  return null;
}

export function normalizeBotAccessoryTintHex(rawHex: string | null | undefined): string | null {
  const clean = cleanHex(rawHex);
  return clean ? `#${clean}` : null;
}

export function parseBotAccessoryTintRgb(
  rawHex: string | null | undefined
): BotAccessoryTintRgb | null {
  const clean = cleanHex(rawHex);
  if (!clean) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function hueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

function hueFromRgb(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) return 0;
  if (max === rn) return (60 * ((gn - bn) / delta) + 360) % 360;
  if (max === gn) return 60 * ((bn - rn) / delta + 2);
  return 60 * ((rn - gn) / delta + 4);
}

export function isBotAccessoryTintMagentaPixel(
  r: number,
  g: number,
  b: number,
  a = 255
): boolean {
  if (a <= 0) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < BOT_ACCESSORY_TINT_MAGENTA_MIN_VALUE) return false;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < BOT_ACCESSORY_TINT_MAGENTA_MIN_SATURATION) return false;
  if (r < BOT_ACCESSORY_TINT_MAGENTA_MIN_VALUE || b < BOT_ACCESSORY_TINT_MAGENTA_MIN_VALUE) {
    return false;
  }
  if (g > Math.max(r, b) * 0.72) return false;
  return (
    hueDistance(hueFromRgb(r, g, b), BOT_ACCESSORY_TINT_MAGENTA_HUE_DEG) <=
    BOT_ACCESSORY_TINT_MAGENTA_HUE_TOLERANCE_DEG
  );
}

export function tintBotAccessoryMagentaPixel(
  r: number,
  g: number,
  b: number,
  target: BotAccessoryTintRgb
): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const value = max / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  const whiteAtValue = 255 * value;
  const tintChannel = (channel: number): number =>
    Math.round(channel * value * saturation + whiteAtValue * (1 - saturation));
  return [tintChannel(target.r), tintChannel(target.g), tintChannel(target.b)];
}

export function applyBotAccessoryTintToImageData(
  data: Uint8ClampedArray,
  targetHex: string | null | undefined
): boolean {
  const target = parseBotAccessoryTintRgb(targetHex);
  if (!target) return false;
  let changed = false;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 255;
    if (!isBotAccessoryTintMagentaPixel(r, g, b, a)) continue;
    const [nextR, nextG, nextB] = tintBotAccessoryMagentaPixel(r, g, b, target);
    data[i] = nextR;
    data[i + 1] = nextG;
    data[i + 2] = nextB;
    changed = true;
  }
  return changed;
}

const botAccessoryTintUrlCache = new Map<string, Promise<string | null>>();

function loadAccessoryImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Accessory image could not be loaded."));
    image.src = src;
  });
}

async function renderTintedBotAccessoryUrl(
  accessoryUrl: string,
  targetHex: string
): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const image = await loadAccessoryImage(accessoryUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const changed = applyBotAccessoryTintToImageData(imageData.data, targetHex);
  if (!changed) return accessoryUrl;
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export function loadTintedBotAccessoryUrl(
  accessoryUrl: string,
  targetHex: string | null | undefined
): Promise<string | null> {
  const normalizedTarget = normalizeBotAccessoryTintHex(targetHex);
  if (!normalizedTarget) return Promise.resolve(null);
  const cacheKey = `${accessoryUrl}\n${normalizedTarget}`;
  const cached = botAccessoryTintUrlCache.get(cacheKey);
  if (cached) return cached;
  const rendered = renderTintedBotAccessoryUrl(accessoryUrl, normalizedTarget).catch(() => null);
  botAccessoryTintUrlCache.set(cacheKey, rendered);
  return rendered;
}
