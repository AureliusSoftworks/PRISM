export type FlytingRgbKeyRole = "pro" | "jarl" | "con";
export type FlytingRgbKeyScene = "wide" | "jarl" | "gallery";
export type FlytingRgbKeyTheme = "light" | "dark";

export interface FlytingRgbKeyCircleRegion {
  kind: "circle";
  cx: number;
  cy: number;
  radius: number;
}

export interface FlytingRgbKeyPolygonRegion {
  kind: "polygon";
  points: readonly (readonly [number, number])[];
}

export type FlytingRgbKeyRegion =
  FlytingRgbKeyCircleRegion | FlytingRgbKeyPolygonRegion;

export interface FlytingRgbKeyAsset {
  src: string;
  width: number;
  height: number;
  regions: Readonly<Record<FlytingRgbKeyRole, readonly FlytingRgbKeyRegion[]>>;
}

export type FlytingRgbKeyColors = Readonly<Record<FlytingRgbKeyRole, string>>;

export const FLYTING_RGB_KEY_HUES = {
  pro: 0,
  jarl: 120,
  con: 240,
} as const satisfies Record<FlytingRgbKeyRole, number>;

export const FLYTING_RGB_KEY_HUE_TOLERANCE_DEGREES = 3;
export const FLYTING_RGB_KEY_MIN_SATURATION = 0.025;

const WIDE_KEY_REGIONS = {
  pro: [
    { kind: "circle", cx: 506, cy: 393, radius: 39 },
    {
      kind: "polygon",
      points: [
        [572, 305],
        [612, 305],
        [612, 510],
        [572, 510],
      ],
    },
  ],
  jarl: [
    { kind: "circle", cx: 836, cy: 133, radius: 36 },
    {
      kind: "polygon",
      points: [
        [819, 160],
        [853, 160],
        [853, 220],
        [819, 220],
      ],
    },
  ],
  con: [
    { kind: "circle", cx: 1163, cy: 393, radius: 39 },
    {
      kind: "polygon",
      points: [
        [1060, 305],
        [1100, 305],
        [1100, 510],
        [1060, 510],
      ],
    },
  ],
} as const satisfies Record<FlytingRgbKeyRole, readonly FlytingRgbKeyRegion[]>;

const JARL_KEY_REGIONS = {
  pro: [
    { kind: "circle", cx: 297, cy: 483, radius: 61 },
    {
      kind: "polygon",
      points: [
        [394, 338],
        [460, 338],
        [460, 673],
        [394, 673],
      ],
    },
  ],
  jarl: [
    { kind: "circle", cx: 836, cy: 27, radius: 58 },
    {
      kind: "polygon",
      points: [
        [805, 70],
        [867, 70],
        [867, 184],
        [805, 184],
      ],
    },
  ],
  con: [
    { kind: "circle", cx: 1371, cy: 483, radius: 61 },
    {
      kind: "polygon",
      points: [
        [1196, 338],
        [1262, 338],
        [1262, 673],
        [1196, 673],
      ],
    },
  ],
} as const satisfies Record<FlytingRgbKeyRole, readonly FlytingRgbKeyRegion[]>;

const GALLERY_DARK_KEY_REGIONS = {
  pro: [
    {
      kind: "polygon",
      points: [
        [370, 195],
        [600, 195],
        [415, 565],
        [105, 565],
      ],
    },
  ],
  jarl: [
    {
      kind: "polygon",
      points: [
        [905, 185],
        [1210, 185],
        [1255, 575],
        [850, 575],
      ],
    },
  ],
  con: [
    {
      kind: "polygon",
      points: [
        [1560, 185],
        [1810, 185],
        [2080, 575],
        [1730, 575],
      ],
    },
  ],
} as const satisfies Record<FlytingRgbKeyRole, readonly FlytingRgbKeyRegion[]>;

const GALLERY_LIGHT_KEY_REGIONS = {
  pro: [
    {
      kind: "polygon",
      points: [
        [370, 195],
        [600, 195],
        [415, 565],
        [105, 565],
      ],
    },
  ],
  jarl: [
    {
      kind: "polygon",
      points: [
        [965, 195],
        [1210, 195],
        [1250, 575],
        [920, 575],
      ],
    },
  ],
  con: [
    {
      kind: "polygon",
      points: [
        [1560, 185],
        [1810, 185],
        [2080, 575],
        [1730, 575],
      ],
    },
  ],
} as const satisfies Record<FlytingRgbKeyRole, readonly FlytingRgbKeyRegion[]>;

export const FLYTING_RGB_KEY_ASSETS = {
  wide: {
    dark: {
      src: "/debate/flyting/mead-hall-keyed-base.webp",
      width: 1672,
      height: 941,
      regions: WIDE_KEY_REGIONS,
    },
    light: {
      src: "/debate/flyting/mead-hall-keyed-base-light.webp",
      width: 1672,
      height: 941,
      regions: WIDE_KEY_REGIONS,
    },
  },
  jarl: {
    dark: {
      src: "/debate/flyting/jarl-throne-keyed-base.webp",
      width: 1672,
      height: 941,
      regions: JARL_KEY_REGIONS,
    },
    light: {
      src: "/debate/flyting/jarl-throne-keyed-base-light.webp",
      width: 1672,
      height: 941,
      regions: JARL_KEY_REGIONS,
    },
  },
  gallery: {
    dark: {
      src: "/debate/flyting/mead-hall-gallery-floor.webp",
      width: 2172,
      height: 724,
      regions: GALLERY_DARK_KEY_REGIONS,
    },
    light: {
      src: "/debate/flyting/mead-hall-gallery-floor-light.webp",
      width: 2172,
      height: 724,
      regions: GALLERY_LIGHT_KEY_REGIONS,
    },
  },
} as const satisfies Record<
  FlytingRgbKeyScene,
  Record<FlytingRgbKeyTheme, FlytingRgbKeyAsset>
>;

interface HsvColor {
  h: number;
  s: number;
  v: number;
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export function flytingRgbKeyHueDistance(
  first: number,
  second: number,
): number {
  const distance = Math.abs(normalizeHue(first) - normalizeHue(second));
  return Math.min(distance, 360 - distance);
}

function flytingRgbKeyHueDelta(hue: number, keyHue: number): number {
  const clockwise = normalizeHue(hue - keyHue);
  return clockwise > 180 ? clockwise - 360 : clockwise;
}

export function flytingRgbToHsv(
  red: number,
  green: number,
  blue: number,
): HsvColor {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hue = 60 * ((b - r) / delta + 2);
    } else {
      hue = 60 * ((r - g) / delta + 4);
    }
  }

  return {
    h: normalizeHue(hue),
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

export function flytingHsvToRgb(
  hue: number,
  saturation: number,
  value: number,
) {
  const h = normalizeHue(hue);
  const s = Math.max(0, Math.min(1, saturation));
  const v = Math.max(0, Math.min(1, value));
  const chroma = v * s;
  const segment = h / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const offset = v - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) {
    red = chroma;
    green = secondary;
  } else if (segment < 2) {
    red = secondary;
    green = chroma;
  } else if (segment < 3) {
    green = chroma;
    blue = secondary;
  } else if (segment < 4) {
    green = secondary;
    blue = chroma;
  } else if (segment < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  return {
    red: Math.round((red + offset) * 255),
    green: Math.round((green + offset) * 255),
    blue: Math.round((blue + offset) * 255),
  };
}

function flytingHexColorHue(color: string): number {
  const normalized = color.trim().replace(/^#/u, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : normalized.slice(0, 6);

  if (!/^[0-9a-f]{6}$/iu.test(expanded)) {
    throw new TypeError(`Invalid Flyting RGB-key color: ${color}`);
  }

  return flytingRgbToHsv(
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ).h;
}

export function flytingRgbKeyRegionContains(
  region: FlytingRgbKeyRegion,
  x: number,
  y: number,
): boolean {
  if (region.kind === "circle") {
    return Math.hypot(x - region.cx, y - region.cy) <= region.radius;
  }

  let inside = false;
  for (
    let index = 0, previous = region.points.length - 1;
    index < region.points.length;
    previous = index, index += 1
  ) {
    const [currentX, currentY] = region.points[index]!;
    const [previousX, previousY] = region.points[previous]!;
    const crosses =
      currentY > y !== previousY > y &&
      x <
        ((previousX - currentX) * (y - currentY)) / (previousY - currentY) +
          currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function flytingRgbKeyRoleForPixel(
  red: number,
  green: number,
  blue: number,
): FlytingRgbKeyRole | null {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max === 0 || (max - min) / max < FLYTING_RGB_KEY_MIN_SATURATION) {
    return null;
  }
  if (red > green && green === blue) return "pro";
  if (green > red && red === blue) return "jarl";
  if (blue > red && red === green) return "con";
  return null;
}

export function remapFlytingRgbKeyPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  colors: FlytingRgbKeyColors,
): Uint8ClampedArray {
  if (source.length !== width * height * 4) {
    throw new RangeError("Flyting RGB-key pixel data must be RGBA");
  }

  const output = new Uint8ClampedArray(source);
  const targetHues = {
    pro: flytingHexColorHue(colors.pro),
    jarl: flytingHexColorHue(colors.jarl),
    con: flytingHexColorHue(colors.con),
  } satisfies Record<FlytingRgbKeyRole, number>;

  for (let offset = 0; offset < source.length; offset += 4) {
    const role = flytingRgbKeyRoleForPixel(
      source[offset]!,
      source[offset + 1]!,
      source[offset + 2]!,
    );
    if (!role) continue;
    const sourceKeyHue = FLYTING_RGB_KEY_HUES[role];
    const sourceColor = flytingRgbToHsv(
      source[offset]!,
      source[offset + 1]!,
      source[offset + 2]!,
    );
    const remapped = flytingHsvToRgb(
      targetHues[role] + flytingRgbKeyHueDelta(sourceColor.h, sourceKeyHue),
      sourceColor.s,
      sourceColor.v,
    );
    output[offset] = remapped.red;
    output[offset + 1] = remapped.green;
    output[offset + 2] = remapped.blue;
  }

  return output;
}
