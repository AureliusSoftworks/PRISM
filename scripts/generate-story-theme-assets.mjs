import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const THEME_ID = "prism_default";
const DRAFT_DIR = join(ROOT, ".codex/output/story-mode", THEME_ID);
const MOCKUP_DIR = join(DRAFT_DIR, "mockups");
const PUBLIC_DIR = join(ROOT, "apps/web/public/story-themes", THEME_ID);
const PROMOTE_MOCKUPS = process.argv.includes("--promote-mockups");

const C = {
  pink: [244, 78, 126, 255],
  amber: [244, 185, 82, 255],
  green: [150, 210, 106, 255],
  cyan: [74, 211, 222, 255],
  violet: [126, 94, 226, 255],
  white: [248, 248, 244, 255],
  pearl: [218, 219, 214, 255],
  fog: [166, 168, 164, 255],
  ash: [112, 115, 114, 255],
  graphite: [48, 50, 52, 255],
  ink: [24, 25, 27, 255],
  transparent: [0, 0, 0, 0],
};

const PRISM_ACCENTS = [C.pink, C.amber, C.green, C.cyan, C.violet];

const ASSETS = [
  ["sprite_reference_sheet.png", 2048, 1536, drawSpriteReferenceSheet],
  ["sprite_fallback_silhouette.png", 1024, 1536, drawSpriteFallback],
  ["background_reference_exterior.png", 1920, 1080, drawExteriorReference],
  ["background_reference_interior.png", 1920, 1080, drawInteriorReference],
  ["background_reference_liminal.png", 1920, 1080, drawLiminalReference],
  ["cutscene_reference.png", 1920, 1080, drawCutsceneReference],
  ["projection_fallback.png", 1920, 1080, drawProjectionFallback],
  ["map_style_reference.png", 1920, 1080, drawMapStyleReference],
];

class Raster {
  constructor(width, height, fill = C.transparent) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height * 4);
    this.fill(fill);
  }

  fill(color) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) this.set(x, y, color);
    }
  }

  set(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    const a = color[3] / 255;
    const inv = 1 - a;
    this.pixels[i] = clampByte(color[0] * a + this.pixels[i] * inv);
    this.pixels[i + 1] = clampByte(color[1] * a + this.pixels[i + 1] * inv);
    this.pixels[i + 2] = clampByte(color[2] * a + this.pixels[i + 2] * inv);
    this.pixels[i + 3] = Math.min(255, Math.round(color[3] + this.pixels[i + 3] * inv));
  }

  rect(x, y, w, h, color) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) this.set(xx, yy, color);
    }
  }

  line(x0, y0, x1, y1, color, width = 1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.35));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, color);
    }
  }

  glowLine(x0, y0, x1, y1, color, width = 4, glow = 28) {
    this.line(x0, y0, x1, y1, withAlpha(color, 24), glow);
    this.line(x0, y0, x1, y1, withAlpha(color, 56), width * 2.5);
    this.line(x0, y0, x1, y1, withAlpha(color, color[3] ?? 255), width);
  }

  circle(cx, cy, radius, color) {
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, color);
      }
    }
  }

  ellipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, color);
      }
    }
  }

  softEllipse(cx, cy, rx, ry, color, inner = 0.58) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= 1) {
          const edge = 1 - smoothstep(inner, 1, d);
          this.set(x, y, withAlpha(color, Math.round(color[3] * edge)));
        }
      }
    }
  }

  polygon(points, color) {
    const ys = points.map((p) => p[1]);
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));
    for (let y = minY; y <= maxY; y += 1) {
      const intersections = [];
      for (let i = 0; i < points.length; i += 1) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length; i += 2) {
        this.rect(intersections[i], y, intersections[i + 1] - intersections[i], 1, color);
      }
    }
  }

  verticalGradient(top, bottom) {
    for (let y = 0; y < this.height; y += 1) {
      const t = y / Math.max(1, this.height - 1);
      this.rect(0, y, this.width, 1, mix(top, bottom, t));
    }
  }

  atmosphere(top, bottom, seed) {
    for (let y = 0; y < this.height; y += 1) {
      const t = y / Math.max(1, this.height - 1);
      for (let x = 0; x < this.width; x += 1) {
        const wave =
          Math.sin((x + seed * 17) * 0.007) * 0.5 +
          Math.sin((y - seed * 11) * 0.011) * 0.35 +
          Math.sin((x + y + seed * 23) * 0.003) * 0.45;
        const center = 1 - Math.min(1, Math.hypot(x / this.width - 0.5, y / this.height - 0.5) * 1.65);
        const shade = wave * 7 + center * 22;
        this.set(x, y, shiftColor(mix(top, bottom, t), shade));
      }
    }
  }

  vignette(strength = 0.62, color = [20, 21, 23, 255]) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const a = smoothstep(0.42, 1, d) * strength;
        this.set(x, y, withAlpha(color, Math.round(255 * a)));
      }
    }
  }
}

class LogicalRaster {
  constructor(target, width, height) {
    this.target = target;
    this.width = width;
    this.height = height;
    this.sx = target.width / width;
    this.sy = target.height / height;
    this.sw = (this.sx + this.sy) / 2;
  }

  set(x, y, color) {
    this.target.set(x * this.sx, y * this.sy, color);
  }

  rect(x, y, w, h, color) {
    this.target.rect(x * this.sx, y * this.sy, w * this.sx, h * this.sy, color);
  }

  line(x0, y0, x1, y1, color, width = 1) {
    this.target.line(x0 * this.sx, y0 * this.sy, x1 * this.sx, y1 * this.sy, color, width * this.sw);
  }

  glowLine(x0, y0, x1, y1, color, width = 4, glow = 28) {
    this.target.glowLine(
      x0 * this.sx,
      y0 * this.sy,
      x1 * this.sx,
      y1 * this.sy,
      color,
      width * this.sw,
      glow * this.sw
    );
  }

  circle(cx, cy, radius, color) {
    this.target.circle(cx * this.sx, cy * this.sy, radius * this.sw, color);
  }

  ellipse(cx, cy, rx, ry, color) {
    this.target.ellipse(cx * this.sx, cy * this.sy, rx * this.sx, ry * this.sy, color);
  }

  softEllipse(cx, cy, rx, ry, color, inner = 0.58) {
    this.target.softEllipse(cx * this.sx, cy * this.sy, rx * this.sx, ry * this.sy, color, inner);
  }

  polygon(points, color) {
    this.target.polygon(points.map(([x, y]) => [x * this.sx, y * this.sy]), color);
  }
}

function drawSpriteReferenceSheet(raster) {
  const r = new LogicalRaster(raster, 2048, 1536);
  const poses = ["idle", "speaking", "thinking", "action"];
  for (let i = 0; i < poses.length; i += 1) {
    const cx = 258 + i * 510;
    r.softEllipse(cx, 1400, 172, 34, [0, 0, 0, 72], 0.12);
    drawAndroid(r, cx, 1330, 1.5, poses[i]);
    r.glowLine(cx - 82, 488, cx + 82, 488, C.white, 5, 34);
  }
}

function drawSpriteFallback(raster) {
  const r = new LogicalRaster(raster, 1024, 1536);
  r.softEllipse(512, 1400, 210, 38, [0, 0, 0, 78], 0.1);
  drawAndroid(r, 512, 1328, 1.9, "idle", { silhouette: true });
  drawPrismRays(r, 512, 190, 1.0, 70);
}

function drawExteriorReference(raster) {
  raster.atmosphere([172, 176, 170, 255], [76, 80, 82, 255], 11);
  const r = new LogicalRaster(raster, 1920, 1080);
  drawProjectionWash(r);
  r.softEllipse(1540, 178, 250, 135, [244, 239, 220, 42], 0.1);
  ridge(r, [[0, 666], [250, 478], [490, 650], [760, 410], [1120, 662], [1460, 458], [1920, 684]], [60, 68, 70, 206]);
  ridge(r, [[0, 780], [310, 646], [620, 742], [970, 548], [1300, 755], [1580, 642], [1920, 775]], [48, 52, 54, 225]);
  r.rect(0, 790, 1920, 290, [69, 71, 70, 198]);
  r.glowLine(170, 850, 1740, 865, withAlpha(C.white, 122), 4, 38);
  r.glowLine(300, 925, 1600, 964, withAlpha(C.cyan, 88), 3, 30);
  sketchGrass(r, 90, 830, 1740, 180, 31);
  raster.vignette(0.5);
}

function drawInteriorReference(raster) {
  raster.atmosphere([154, 154, 151, 255], [66, 63, 66, 255], 23);
  const r = new LogicalRaster(raster, 1920, 1080);
  drawProjectionWash(r);
  r.polygon([[235, 218], [1670, 198], [1830, 882], [90, 882]], [86, 83, 84, 194]);
  r.polygon([[385, 318], [1530, 300], [1620, 804], [300, 804]], [116, 113, 112, 84]);
  r.rect(760, 330, 400, 270, [44, 45, 48, 160]);
  r.softEllipse(960, 465, 360, 170, [237, 235, 223, 34], 0.15);
  r.line(235, 218, 90, 882, [244, 243, 235, 68], 5);
  r.line(1670, 198, 1830, 882, [244, 243, 235, 58], 5);
  r.line(380, 772, 1545, 772, [245, 245, 240, 72], 4);
  r.glowLine(510, 850, 1430, 846, withAlpha(C.violet, 90), 5, 42);
  r.glowLine(615, 700, 1305, 690, withAlpha(C.amber, 70), 3, 30);
  drawPrismRays(r, 958, 458, 1.05, 80);
  raster.vignette(0.54);
}

function drawLiminalReference(raster) {
  raster.atmosphere([145, 146, 150, 255], [44, 45, 51, 255], 41);
  const r = new LogicalRaster(raster, 1920, 1080);
  drawProjectionWash(r);
  for (let i = 0; i < 9; i += 1) {
    const x = 190 + i * 194;
    r.line(x, 115, x + 64 * Math.sin(i * 1.7), 900, [245, 245, 236, 30], 16);
  }
  r.softEllipse(960, 610, 390, 130, [30, 31, 35, 206], 0.4);
  r.softEllipse(960, 606, 240, 66, [120, 111, 152, 92], 0.08);
  r.glowLine(665, 610, 1255, 610, withAlpha(C.cyan, 116), 5, 48);
  r.glowLine(770, 548, 1152, 677, withAlpha(C.pink, 78), 3, 36);
  r.glowLine(812, 684, 1090, 532, withAlpha(C.violet, 78), 3, 32);
  raster.vignette(0.68);
}

function drawCutsceneReference(raster) {
  raster.atmosphere([150, 151, 149, 255], [49, 50, 54, 255], 53);
  const r = new LogicalRaster(raster, 1920, 1080);
  drawProjectionWash(r);
  r.polygon([[0, 0], [730, 0], [500, 1080], [0, 1080]], [18, 19, 22, 106]);
  r.polygon([[1920, 0], [1195, 0], [1334, 1080], [1920, 1080]], [18, 19, 22, 112]);
  r.softEllipse(960, 430, 310, 210, [246, 240, 220, 46], 0.12);
  drawAndroid(r, 760, 946, 1.06, "speaking", { muted: true });
  drawAndroid(r, 1130, 954, 0.98, "thinking", { muted: true });
  r.glowLine(420, 830, 1500, 830, withAlpha(C.white, 86), 4, 34);
  r.glowLine(610, 875, 1335, 870, withAlpha(C.cyan, 68), 3, 28);
  raster.vignette(0.62);
}

function drawProjectionFallback(raster) {
  raster.atmosphere([160, 161, 158, 255], [58, 59, 63, 255], 67);
  const r = new LogicalRaster(raster, 1920, 1080);
  drawProjectionWash(r);
  r.softEllipse(960, 540, 620, 310, [246, 243, 232, 44], 0.08);
  drawPrismRays(r, 880, 520, 1.75, 120);
  for (let i = 0; i < 6; i += 1) {
    r.line(550 + i * 145, 245, 395 + i * 230, 855, [247, 247, 240, 28], 4);
  }
  r.glowLine(620, 800, 1320, 792, withAlpha(C.white, 76), 3, 40);
  raster.vignette(0.72);
}

function drawMapStyleReference(raster) {
  raster.atmosphere([176, 177, 172, 255], [86, 88, 90, 255], 79);
  const r = new LogicalRaster(raster, 1920, 1080);
  r.softEllipse(960, 535, 805, 420, [240, 239, 228, 28], 0.08);
  const regions = [
    { c: C.pink, p: [[392, 250], [618, 180], [805, 315], [746, 520], [506, 558], [340, 430]] },
    { c: C.cyan, p: [[1022, 170], [1352, 230], [1500, 470], [1324, 690], [1040, 628], [900, 382]] },
    { c: C.amber, p: [[592, 650], [860, 580], [1080, 754], [990, 948], [650, 938], [458, 792]] },
  ];
  for (const region of regions) {
    r.polygon(region.p, [92, 91, 91, 126]);
    scribblePath(r, region.p, region.c);
  }
  const routes = [
    [538, 370, 1168, 405],
    [538, 370, 756, 778],
    [1168, 405, 1388, 588],
  ];
  for (const [x0, y0, x1, y1] of routes) {
    r.line(x0, y0, x1, y1, [47, 48, 50, 116], 7);
    r.line(x0, y0, x1, y1, [239, 239, 231, 92], 3);
  }
  for (const [x, y, c] of [
    [538, 370, C.pink],
    [1168, 405, C.cyan],
    [756, 778, C.amber],
    [1388, 588, C.violet],
  ]) {
    r.softEllipse(x, y, 42, 42, withAlpha(c, 128), 0.05);
    r.circle(x, y, 13, [247, 247, 242, 196]);
  }
  raster.vignette(0.42);
}

function drawAndroid(r, cx, floorY, scale, pose, options = {}) {
  const muted = options.muted === true;
  const bodyDark = muted ? [42, 43, 45, 226] : [38, 40, 42, 242];
  const bodyMid = muted ? [88, 91, 92, 218] : [96, 99, 100, 232];
  const bodyLight = muted ? [145, 147, 144, 198] : [164, 166, 160, 216];
  const accent = [248, 248, 244, options.silhouette ? 230 : 246];
  const shadow = [0, 0, 0, options.silhouette ? 72 : 54];

  r.softEllipse(cx, floorY + 34 * scale, 108 * scale, 24 * scale, shadow, 0.08);
  drawLeg(r, cx - 39 * scale, floorY - 10 * scale, cx - 58 * scale, floorY + 112 * scale, scale, bodyDark, bodyMid, accent);
  drawLeg(r, cx + 39 * scale, floorY - 10 * scale, cx + 60 * scale, floorY + 112 * scale, scale, bodyDark, bodyMid, accent);

  r.polygon(
    [
      [cx - 70 * scale, floorY - 308 * scale],
      [cx + 70 * scale, floorY - 308 * scale],
      [cx + 98 * scale, floorY - 146 * scale],
      [cx + 52 * scale, floorY - 18 * scale],
      [cx - 52 * scale, floorY - 18 * scale],
      [cx - 98 * scale, floorY - 146 * scale],
    ],
    bodyDark
  );
  r.polygon(
    [
      [cx - 48 * scale, floorY - 278 * scale],
      [cx + 48 * scale, floorY - 278 * scale],
      [cx + 62 * scale, floorY - 138 * scale],
      [cx + 30 * scale, floorY - 58 * scale],
      [cx - 30 * scale, floorY - 58 * scale],
      [cx - 62 * scale, floorY - 138 * scale],
    ],
    bodyMid
  );
  r.softEllipse(cx, floorY - 204 * scale, 49 * scale, 86 * scale, [220, 222, 216, 32], 0.2);
  r.glowLine(cx - 42 * scale, floorY - 218 * scale, cx + 42 * scale, floorY - 218 * scale, accent, 4 * scale, 18 * scale);
  r.glowLine(cx - 34 * scale, floorY - 145 * scale, cx + 34 * scale, floorY - 145 * scale, accent, 3 * scale, 14 * scale);
  r.line(cx - 16 * scale, floorY - 278 * scale, cx + 18 * scale, floorY - 62 * scale, [28, 29, 31, 80], 2 * scale);

  const shoulders = {
    idle: [[-82, -290, -124, -180], [82, -290, 124, -180]],
    speaking: [[-82, -290, -154, -228], [82, -290, 154, -242]],
    thinking: [[-82, -290, -132, -174], [82, -290, 118, -352]],
    action: [[-82, -290, -176, -338], [82, -290, 190, -362]],
  }[pose];
  drawArm(r, cx + shoulders[0][0] * scale, floorY + shoulders[0][1] * scale, cx + shoulders[0][2] * scale, floorY + shoulders[0][3] * scale, scale, bodyDark, accent);
  drawArm(r, cx + shoulders[1][0] * scale, floorY + shoulders[1][1] * scale, cx + shoulders[1][2] * scale, floorY + shoulders[1][3] * scale, scale, bodyDark, accent);

  r.rect(cx - 32 * scale, floorY - 358 * scale, 64 * scale, 58 * scale, bodyDark);
  r.polygon(
    [
      [cx - 74 * scale, floorY - 478 * scale],
      [cx + 74 * scale, floorY - 478 * scale],
      [cx + 92 * scale, floorY - 404 * scale],
      [cx + 58 * scale, floorY - 338 * scale],
      [cx - 58 * scale, floorY - 338 * scale],
      [cx - 92 * scale, floorY - 404 * scale],
    ],
    [43, 45, 47, options.silhouette ? 246 : 240]
  );
  r.polygon(
    [
      [cx - 54 * scale, floorY - 454 * scale],
      [cx + 54 * scale, floorY - 454 * scale],
      [cx + 61 * scale, floorY - 404 * scale],
      [cx + 42 * scale, floorY - 370 * scale],
      [cx - 42 * scale, floorY - 370 * scale],
      [cx - 61 * scale, floorY - 404 * scale],
    ],
    [196, 198, 190, options.silhouette ? 216 : 226]
  );
  r.softEllipse(cx, floorY - 411 * scale, 46 * scale, 32 * scale, [248, 248, 244, 88], 0.3);
  r.glowLine(cx - 62 * scale, floorY - 466 * scale, cx + 62 * scale, floorY - 466 * scale, accent, 3 * scale, 14 * scale);
  r.glowLine(cx - 48 * scale, floorY - 352 * scale, cx + 48 * scale, floorY - 352 * scale, accent, 3 * scale, 12 * scale);

  if (pose === "action") {
    r.glowLine(cx + 146 * scale, floorY - 375 * scale, cx + 210 * scale, floorY - 438 * scale, accent, 5 * scale, 24 * scale);
  }
}

function drawLeg(r, x0, y0, x1, y1, scale, dark, mid, accent) {
  r.line(x0, y0, x1, y1, dark, 30 * scale);
  r.line(x0 + 9 * scale, y0 + 24 * scale, x1 + 5 * scale, y1 - 24 * scale, mid, 14 * scale);
  r.circle(x0, y0 + 58 * scale, 16 * scale, [34, 35, 37, 230]);
  r.line(x1 - 24 * scale, y1, x1 + 34 * scale, y1, dark, 22 * scale);
  r.line(x0 - 8 * scale, y0 + 8 * scale, x1 - 18 * scale, y1 - 22 * scale, withAlpha(accent, 112), 3 * scale);
}

function drawArm(r, x0, y0, x1, y1, scale, dark, accent) {
  r.line(x0, y0, x1, y1, dark, 28 * scale);
  r.circle(x0, y0, 22 * scale, [58, 60, 62, 220]);
  r.line(x0 + (x1 - x0) * 0.18, y0 + (y1 - y0) * 0.18, x1, y1, withAlpha(accent, 126), 4 * scale);
  r.circle(x1, y1, 18 * scale, [46, 47, 49, 232]);
}

function drawProjectionWash(r) {
  r.softEllipse(960, 500, 760, 420, [248, 247, 238, 34], 0.08);
  for (let i = 0; i < 5; i += 1) {
    const y = 140 + i * 172;
    r.line(130, y, 1790, y + Math.sin(i * 1.4) * 26, [248, 248, 244, 16], 3);
  }
}

function drawPrismRays(r, cx, cy, scale = 1, alpha = 170) {
  r.glowLine(cx - 114 * scale, cy, cx - 8 * scale, cy, [248, 248, 244, alpha], 7 * scale, 26 * scale);
  const tri = [
    [cx, cy - 82 * scale],
    [cx - 70 * scale, cy + 58 * scale],
    [cx + 78 * scale, cy + 58 * scale],
  ];
  r.polygon(tri, [35, 36, 38, 168]);
  for (let i = 0; i < tri.length; i += 1) {
    const a = tri[i];
    const b = tri[(i + 1) % tri.length];
    r.glowLine(a[0], a[1], b[0], b[1], [248, 248, 244, alpha], 4 * scale, 18 * scale);
  }
  for (let i = 0; i < PRISM_ACCENTS.length; i += 1) {
    r.glowLine(
      cx + 56 * scale,
      cy - 5 * scale,
      cx + (168 + i * 32) * scale,
      cy + (-64 + i * 31) * scale,
      withAlpha(PRISM_ACCENTS[i], alpha),
      6 * scale,
      24 * scale
    );
  }
}

function ridge(r, points, fill) {
  r.polygon([...points, [1920, 1080], [0, 1080]], fill);
  for (let i = 0; i < points.length - 1; i += 1) {
    r.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], [244, 244, 236, 38], 3);
  }
}

function sketchGrass(r, x, y, w, h, seed) {
  for (let i = 0; i < 75; i += 1) {
    const t = i / 75;
    const px = x + w * t;
    const py = y + h * (0.15 + 0.7 * fract(Math.sin(i * 17.12 + seed) * 43758.545));
    r.line(px, py, px + 18 * Math.sin(i), py - 26 - 15 * Math.cos(i * 1.7), [236, 237, 229, 32], 2);
  }
}

function scribblePath(r, points, color) {
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = Math.sin((i + pass) * 4.73) * 7;
      const dy = Math.cos((i - pass) * 3.31) * 7;
      r.line(a[0] + dx, a[1] + dy, b[0] - dy, b[1] + dx, withAlpha(color, pass === 0 ? 128 : 64), pass === 0 ? 5 : 2);
    }
  }
}

function mix(a, b, t) {
  return [
    clampByte(a[0] + (b[0] - a[0]) * t),
    clampByte(a[1] + (b[1] - a[1]) * t),
    clampByte(a[2] + (b[2] - a[2]) * t),
    clampByte(a[3] + (b[3] - a[3]) * t),
  ];
}

function withAlpha(color, alpha) {
  return [color[0], color[1], color[2], alpha];
}

function shiftColor(color, amount) {
  return [
    clampByte(color[0] + amount),
    clampByte(color[1] + amount),
    clampByte(color[2] + amount),
    color[3],
  ];
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function fract(value) {
  return value - Math.floor(value);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function pngEncode(r) {
  const scanlineLength = r.width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * r.height);
  for (let y = 0; y < r.height; y += 1) {
    const row = y * scanlineLength;
    raw[row] = 0;
    Buffer.from(r.pixels.buffer, y * r.width * 4, r.width * 4).copy(raw, row + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([u32(r.width), u32(r.height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function u32(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value);
  return b;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  return Buffer.concat([u32(data.length), name, data, u32(crc32(Buffer.concat([name, data])))]);
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

mkdirSync(MOCKUP_DIR, { recursive: true });
mkdirSync(PUBLIC_DIR, { recursive: true });

for (const [fileName, width, height, draw] of ASSETS) {
  const raster = new Raster(width, height);
  draw(raster);
  const draftPath = join(MOCKUP_DIR, fileName);
  const publicPath = join(PUBLIC_DIR, fileName);
  mkdirSync(dirname(draftPath), { recursive: true });
  writeFileSync(draftPath, pngEncode(raster));
  if (PROMOTE_MOCKUPS) copyFileSync(draftPath, publicPath);
}

console.log(
  PROMOTE_MOCKUPS
    ? `Generated and promoted ${ASSETS.length} PRISM story theme mockup assets.`
    : `Generated ${ASSETS.length} PRISM story theme mockups in ${MOCKUP_DIR}.`
);
