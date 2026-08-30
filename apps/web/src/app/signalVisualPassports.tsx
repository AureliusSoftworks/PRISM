"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  SIGNAL_VISUAL_IDENTITY_MAX_CANDIDATES,
  SIGNAL_VISUAL_PASSPORT_PAGE_SIZE,
  SIGNAL_VISUAL_PASSPORTS_PER_PAGE,
  createBotVisualIdentitySignatureV1,
  type BotAvatarDetailsV1,
  type BotFaceStyle,
  type SignalVisualPassportBundleV1,
} from "@localai/shared";
import type { BotPickerGlyphRenderer } from "./BotPicker";
import {
  AVATAR_DETAILS_CANVAS_SIZE,
  rasterizeVisibleAvatarDetailsRgba,
} from "./avatar-details";

export interface SignalVisualPassportSourceV1 {
  botId: string;
  sourceRevision: string;
  color: string | null;
  glyph: string | null;
  face: BotFaceStyle;
  avatarDetails: BotAvatarDetailsV1 | null;
  recognitionEligible: boolean;
}

const CELL_SIZE = SIGNAL_VISUAL_PASSPORT_PAGE_SIZE / 4;
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function beforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = Math.max(0, deadline - performance.now());
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = window.setTimeout(
          () => reject(new DOMException("Signal visual identity deadline.", "TimeoutError")),
          remaining,
        );
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

function opaqueToken(used: Set<string>): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let token = "";
  for (const byte of bytes) token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
  if (used.has(token)) return opaqueToken(used);
  used.add(token);
  return token;
}

function fontFamily(font: BotFaceStyle["eyesFont"]): string {
  const variable = font === "concise"
    ? "--font-macondo-face"
    : font === "playful"
      ? "--font-playful-display"
      : font === "formal"
        ? "--font-formal-serif"
        : "--font-concise-rounded";
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return font === "warm"
    ? `"Segoe Print", ${resolved || "sans-serif"}`
    : resolved || (font === "formal" || font === "concise" ? "serif" : "sans-serif");
}

async function glyphImage(
  glyph: string,
  color: string,
  renderGlyph: BotPickerGlyphRenderer,
): Promise<HTMLImageElement> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:-10000px;color:${color}`;
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<>{renderGlyph(glyph, { size: 168, strokeWidth: 2.4 })}</>));
    const svg = host.querySelector("svg");
    if (!svg) throw new Error("The saved glyph could not be rendered exactly.");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "168");
    svg.setAttribute("height", "168");
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = "sync";
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  } finally {
    root.unmount();
    host.remove();
  }
}

function drawInk(
  context: CanvasRenderingContext2D,
  source: SignalVisualPassportSourceV1,
  x: number,
  y: number,
  size: number,
  variant: "neutral" | "blink" | "speech" | "thinking",
): void {
  if (!source.avatarDetails) return;
  const ink = document.createElement("canvas");
  ink.width = AVATAR_DETAILS_CANVAS_SIZE;
  ink.height = AVATAR_DETAILS_CANVAS_SIZE;
  const inkContext = ink.getContext("2d");
  if (!inkContext) throw new Error("Signal could not create an Ink reference.");
  inkContext.putImageData(
    new ImageData(
      new Uint8ClampedArray(
        rasterizeVisibleAvatarDetailsRgba(
          source.avatarDetails,
          source.color,
          source.face,
          {
            blinking: variant === "blink",
            talking: variant === "speech",
          },
        ),
      ),
      AVATAR_DETAILS_CANVAS_SIZE,
      AVATAR_DETAILS_CANVAS_SIZE,
    ),
    0,
    0,
  );
  context.drawImage(ink, x, y, size, size);
}

function drawFaceVariant(
  context: CanvasRenderingContext2D,
  source: SignalVisualPassportSourceV1,
  variant: "neutral" | "blink" | "speech" | "thinking",
  x: number,
  y: number,
  size: number,
): void {
  const face = source.face;
  const color = source.color ?? "#ffffff";
  context.save();
  context.fillStyle = "#090b12";
  context.strokeStyle = "#313647";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(x, y, size, size, 24);
  context.fill();
  context.stroke();
  drawInk(context, source, x, y, size, variant);

  const customEyes = face.eyeCharacter;
  const eyes = variant === "blink"
    ? face.blinkBar.repeat(face.blinkCount)
    : customEyes
      ? face.eyeCount === 2 ? `${customEyes} ${customEyes}` : customEyes
      : "•  •";
  const mouth = variant === "speech"
    ? face.mouthSpeechPoses?.[2] ?? "○"
    : variant === "thinking"
      ? face.thinkingFrames[0] ?? "·"
      : face.mouthCharacter ?? "—";
  const drawGlyph = (
    text: string,
    cx: number,
    cy: number,
    scale: number,
    rotation: number,
    font: BotFaceStyle["eyesFont"],
  ) => {
    if (!text.trim()) return;
    context.save();
    context.translate(cx, cy);
    context.rotate(rotation * Math.PI / 180);
    context.scale(scale, scale);
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${face.weight} 42px ${fontFamily(font)}`;
    context.fillText(text, 0, 0, size * 0.72);
    context.restore();
  };
  drawGlyph(
    eyes,
    x + size * (0.5 + face.eyeOffsetX * 0.18),
    y + size * (0.39 + face.eyeOffsetY * 0.18),
    variant === "blink" ? face.blinkScale : face.eyeScale,
    variant === "blink" ? face.blinkRotationDeg : face.eyeRotationDeg,
    face.eyesFont,
  );
  drawGlyph(
    mouth,
    x + size * (0.5 + face.mouthOffsetX * 0.18),
    y + size * (0.67 + face.mouthOffsetY * 0.18),
    variant === "thinking" ? face.thinkingScale : face.mouthScale,
    face.mouthRotationDeg,
    face.mouthFont,
  );
  context.restore();
}

async function drawPassportCell(args: {
  context: CanvasRenderingContext2D;
  source: SignalVisualPassportSourceV1;
  token: string;
  cellIndex: number;
  renderGlyph: BotPickerGlyphRenderer;
}): Promise<void> {
  const x = (args.cellIndex % 4) * CELL_SIZE;
  const y = Math.floor(args.cellIndex / 4) * CELL_SIZE;
  const context = args.context;
  context.fillStyle = "#151824";
  context.fillRect(x, y, CELL_SIZE, CELL_SIZE);
  context.strokeStyle = "#5d6478";
  context.lineWidth = 4;
  context.strokeRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
  context.fillStyle = "#f4f6ff";
  context.font = '700 27px ui-monospace, "SFMono-Regular", monospace';
  context.fillText(args.token, x + 24, y + 40);
  context.fillStyle = args.source.color ?? "#ffffff";
  context.fillRect(x + 24, y + 62, 96, 36);
  const glyph = await glyphImage(args.source.glyph!, args.source.color ?? "#ffffff", args.renderGlyph);
  context.drawImage(glyph, x + 320, y + 34, 144, 144);
  const variants = ["neutral", "blink", "speech", "thinking"] as const;
  variants.forEach((variant, index) => {
    drawFaceVariant(
      context,
      args.source,
      variant,
      x + 24 + (index % 2) * 236,
      y + 118 + Math.floor(index / 2) * 184,
      168,
    );
  });
}

export async function buildSignalVisualPassportBundleV1(args: {
  sources: readonly SignalVisualPassportSourceV1[];
  renderGlyph: BotPickerGlyphRenderer;
  presentedAt?: string;
  timeoutMs?: number;
}): Promise<SignalVisualPassportBundleV1> {
  if (args.sources.length > SIGNAL_VISUAL_IDENTITY_MAX_CANDIDATES) {
    return { v: 1, status: "unavailable", reason: "library_too_large" };
  }
  if (args.sources.some((source) => !source.botId || !source.sourceRevision || !source.color || !source.glyph)) {
    return { v: 1, status: "unavailable", reason: "render_failed" };
  }
  const presentedAt = args.presentedAt ?? new Date().toISOString();
  const deadline = performance.now() + (args.timeoutMs ?? 8_000);
  const assertWithinDeadline = () => {
    if (performance.now() > deadline) throw new DOMException("Signal visual identity deadline.", "TimeoutError");
  };
  try {
    await beforeDeadline(document.fonts.ready, deadline);
    assertWithinDeadline();
    const usedTokens = new Set<string>();
    const candidates = args.sources.map((source, index) => {
      const signature = createBotVisualIdentitySignatureV1({
        botId: source.botId,
        color: source.color,
        glyph: source.glyph,
        face: source.face,
        avatarDetails: source.avatarDetails,
        presentedAt,
      });
      if (!signature) throw new Error("Incomplete procedural appearance.");
      return {
        token: opaqueToken(usedTokens),
        botId: source.botId,
        sourceRevision: source.sourceRevision,
        pageIndex: Math.floor(index / SIGNAL_VISUAL_PASSPORTS_PER_PAGE),
        recognitionEligible: source.recognitionEligible,
        signature,
      };
    });
    const pages = [];
    for (let pageIndex = 0; pageIndex < Math.ceil(candidates.length / SIGNAL_VISUAL_PASSPORTS_PER_PAGE); pageIndex += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = SIGNAL_VISUAL_PASSPORT_PAGE_SIZE;
      canvas.height = SIGNAL_VISUAL_PASSPORT_PAGE_SIZE;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Signal could not create a visual reference atlas.");
      context.fillStyle = "#0b0d14";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const pageCandidates = candidates.slice(pageIndex * SIGNAL_VISUAL_PASSPORTS_PER_PAGE, (pageIndex + 1) * SIGNAL_VISUAL_PASSPORTS_PER_PAGE);
      for (let cellIndex = 0; cellIndex < pageCandidates.length; cellIndex += 1) {
        assertWithinDeadline();
        const candidate = pageCandidates[cellIndex]!;
        const source = args.sources[pageIndex * SIGNAL_VISUAL_PASSPORTS_PER_PAGE + cellIndex]!;
        await beforeDeadline(
          drawPassportCell({ context, source, token: candidate.token, cellIndex, renderGlyph: args.renderGlyph }),
          deadline,
        );
      }
      pages.push({
        pageIndex,
        mimeType: "image/png" as const,
        width: 2048 as const,
        height: 2048 as const,
        dataUrl: canvas.toDataURL("image/png"),
      });
      assertWithinDeadline();
    }
    return { v: 1, status: "ready", presentedAt, candidates, pages };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { v: 1, status: "unavailable", reason: "deadline" };
    }
    return { v: 1, status: "unavailable", reason: "render_failed" };
  }
}
