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
      "Normalize a PRISM bot-frame paint mask.",
      "",
      "Usage:",
      "  node normalize_bot_frame_mask.mjs --input <png> --output <png> [options]",
      "",
      "Options:",
      "  --base <png>        Native frame geometry alpha mask",
      "  --threshold <1-255> Minimum source coverage to paint (default: 64)",
      "  --force             Replace an existing output file",
      "  --dry-run           Validate and print the planned conversion only",
      "",
    ].join("\n")
  );
  process.exit(0);
}

const inputValue = valueAfter(args, "--input");
const outputValue = valueAfter(args, "--output");
const baseValue =
  valueAfter(args, "--base") ??
  "apps/web/public/bot-frame/bot-frame-metal-mask.png";
const threshold = Number.parseInt(valueAfter(args, "--threshold") ?? "64", 10);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

if (!inputValue) fail("Missing required --input path.");
if (!outputValue) fail("Missing required --output path.");
if (!Number.isInteger(threshold) || threshold < 1 || threshold > 255) {
  fail("--threshold must be an integer from 1 through 255.");
}

const input = resolve(inputValue);
const output = resolve(outputValue);
const base = resolve(baseValue);
if (!existsSync(input)) fail(`Input does not exist: ${input}`);
if (!existsSync(base)) fail(`Frame base does not exist: ${base}`);
if (existsSync(output) && !force && !dryRun) {
  fail(`Output already exists; pass --force to replace it: ${output}`);
}

const ffmpegArgs = [
  "-loglevel",
  "error",
  "-i",
  input,
  "-vf",
  "scale=1000:1000:flags=lanczos",
  "-f",
  "rawvideo",
  "-pix_fmt",
  "rgba",
  "pipe:1",
];

if (dryRun) {
  process.stdout.write(
    `${JSON.stringify({ input, output, base, threshold, command: "ffmpeg", args: ffmpegArgs }, null, 2)}\n`
  );
  process.exit(0);
}

const geometryPng = PNG.sync.read(readFileSync(base));
if (geometryPng.width !== 1000 || geometryPng.height !== 1000) {
  fail("Native frame geometry must be 1000x1000.");
}

const scaled = spawnSync("ffmpeg", ffmpegArgs, {
  encoding: null,
  maxBuffer: 1000 * 1000 * 8,
});
if (scaled.error) fail(`Unable to run ffmpeg: ${scaled.error.message}`);
if (scaled.status !== 0) fail(`ffmpeg failed with exit code ${scaled.status}.`);
if (!scaled.stdout || scaled.stdout.length !== 1000 * 1000 * 4) {
  fail("ffmpeg returned an unexpected pixel buffer size.");
}

let usesAlpha = false;
for (let offset = 3; offset < scaled.stdout.length; offset += 4) {
  if ((scaled.stdout[offset] ?? 255) < 255) {
    usesAlpha = true;
    break;
  }
}

const outputPng = new PNG({ width: 1000, height: 1000 });
for (let offset = 0; offset < outputPng.data.length; offset += 4) {
  const red = scaled.stdout[offset] ?? 0;
  const green = scaled.stdout[offset + 1] ?? 0;
  const blue = scaled.stdout[offset + 2] ?? 0;
  const sourceAlpha = scaled.stdout[offset + 3] ?? 255;
  const sourceCoverage = usesAlpha
    ? sourceAlpha
    : Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
  const geometryAlpha = geometryPng.data[offset + 3] ?? 0;
  const painted = sourceCoverage >= threshold && geometryAlpha >= 128;
  const value = painted ? 255 : 0;
  outputPng.data[offset] = value;
  outputPng.data[offset + 1] = value;
  outputPng.data[offset + 2] = value;
  outputPng.data[offset + 3] = value;
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, PNG.sync.write(outputPng));

process.stdout.write(`${output}\n`);
