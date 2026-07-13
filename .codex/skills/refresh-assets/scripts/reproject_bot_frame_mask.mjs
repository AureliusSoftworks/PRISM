#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "Reproject an untrusted paint pattern onto exact PRISM frame geometry.",
      "",
      "Usage:",
      "  node reproject_bot_frame_mask.mjs --input <png> --output <png> [options]",
      "",
      "Options:",
      "  --geometry <png>  Native frame geometry alpha mask",
      "  --threshold <n>   Minimum source coverage to paint (default: 64)",
      "  --bins <n>        Angular profile resolution (default: 1440)",
      "  --force           Replace an existing output file",
      "  --dry-run         Validate and print the planned reprojection only",
      "",
    ].join("\n")
  );
  process.exit(0);
}

const inputValue = valueAfter(args, "--input");
const outputValue = valueAfter(args, "--output");
const geometryValue =
  valueAfter(args, "--geometry") ??
  "apps/web/public/bot-frame/bot-frame-metal-mask.png";
const threshold = Number.parseInt(valueAfter(args, "--threshold") ?? "64", 10);
const binCount = Number.parseInt(valueAfter(args, "--bins") ?? "1440", 10);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

if (!inputValue) fail("Missing required --input path.");
if (!outputValue) fail("Missing required --output path.");
if (!Number.isInteger(threshold) || threshold < 1 || threshold > 255) {
  fail("--threshold must be an integer from 1 through 255.");
}
if (!Number.isInteger(binCount) || binCount < 360 || binCount > 7200) {
  fail("--bins must be an integer from 360 through 7200.");
}

const input = resolve(inputValue);
const output = resolve(outputValue);
const geometry = resolve(geometryValue);
if (!existsSync(input)) fail(`Input does not exist: ${input}`);
if (!existsSync(geometry)) fail(`Geometry mask does not exist: ${geometry}`);
if (existsSync(output) && !force && !dryRun) {
  fail(`Output already exists; pass --force to replace it: ${output}`);
}

const geometryPng = PNG.sync.read(readFileSync(geometry));
const { width, height } = geometryPng;
const plan = { input, output, geometry, width, height, threshold, binCount };
if (dryRun) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(0);
}

const scaled = spawnSync(
  "ffmpeg",
  [
    "-loglevel",
    "error",
    "-i",
    input,
    "-vf",
    `scale=${width}:${height}:flags=lanczos`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "pipe:1",
  ],
  { encoding: null, maxBuffer: width * height * 8 }
);
if (scaled.error) fail(`Unable to run ffmpeg: ${scaled.error.message}`);
if (scaled.status !== 0) fail(`ffmpeg failed with exit code ${scaled.status}.`);
if (!scaled.stdout || scaled.stdout.length !== width * height * 4) {
  fail("ffmpeg returned an unexpected pixel buffer size.");
}

let usesAlpha = false;
for (let offset = 3; offset < scaled.stdout.length; offset += 4) {
  if ((scaled.stdout[offset] ?? 255) < 255) {
    usesAlpha = true;
    break;
  }
}

const profile = new Uint8Array(binCount);
const sourceCenterX = (width - 1) / 2;
const sourceCenterY = (height - 1) / 2;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    const red = scaled.stdout[offset] ?? 0;
    const green = scaled.stdout[offset + 1] ?? 0;
    const blue = scaled.stdout[offset + 2] ?? 0;
    const alpha = scaled.stdout[offset + 3] ?? 255;
    const coverage = usesAlpha
      ? alpha
      : Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
    if (coverage <= 0) continue;
    const angle = Math.atan2(y - sourceCenterY, x - sourceCenterX);
    const normalized = (angle + Math.PI) / (Math.PI * 2);
    const bin = Math.min(binCount - 1, Math.floor(normalized * binCount));
    profile[bin] = Math.max(profile[bin] ?? 0, coverage);
  }
}

if (!profile.some((coverage) => coverage > 0)) {
  fail("Input contains no visible paint coverage.");
}

const outputPng = new PNG({ width, height });
const geometryCenterX = (width - 1) / 2;
const geometryCenterY = height * 0.47;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    const geometryAlpha = geometryPng.data[offset + 3] ?? 0;
    const angle = Math.atan2(y - geometryCenterY, x - geometryCenterX);
    const normalized = (angle + Math.PI) / (Math.PI * 2);
    const bin = Math.min(binCount - 1, Math.floor(normalized * binCount));
    const patternAlpha = profile[bin] ?? 0;
    const painted = patternAlpha >= threshold && geometryAlpha >= 128;
    const value = painted ? 255 : 0;
    outputPng.data[offset] = value;
    outputPng.data[offset + 1] = value;
    outputPng.data[offset + 2] = value;
    outputPng.data[offset + 3] = value;
  }
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, PNG.sync.write(outputPng));
process.stdout.write(`${output}\n`);
