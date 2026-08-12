#!/usr/bin/env node

import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDir = join(repoRoot, "output", "steam-trailer-v2");
const segmentDir = join(outputDir, "segments");
const sourceDir = join(repoRoot, ".cursor", "output", "steam-trailer");
const musicFile = join(repoRoot, "apps", "web", "public", "audio", "prism-intro", "prism-threshold-ethereal-loop-v1.mp3");

const segments = [
  { name: "01-hook", duration: 6, source: "01-hook-ui.png" },
  { name: "02-companion", duration: 10, source: "output/steam-trailer-draft/frames/companion.png", sourceRoot: "repo" },
  { name: "03-spectrum", duration: 8, source: "03-spectrum.png", card: "Many ways to think" },
  { name: "04-signal", duration: 8, source: "03b-signal.webp", card: "Make the thought visible" },
  { name: "05-interplay", duration: 14, source: "04-interplay-coffee-live.png", card: "Voices in conversation" },
  { name: "06-local", duration: 8, source: "05-local.png", card: "Local-first. Your sanctum." },
  { name: "07-close", duration: 6, source: "06-close.png" },
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

async function writeCard(segment) {
  if (!segment.card) return null;
  const path = join(outputDir, `${segment.name}.png`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="210" viewBox="0 0 1920 210">
  <rect width="1920" height="210" fill="#050608" fill-opacity="0.72"/>
  <rect width="8" height="210" fill="#8b6cff"/>
  <text x="960" y="128" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="52" letter-spacing="1" fill="#ffffff">${escapeXml(segment.card)}</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path);
  return path;
}

async function renderSegment(segment) {
  const input = segment.sourceRoot === "repo"
    ? join(repoRoot, segment.source)
    : join(sourceDir, segment.source);
  const output = join(segmentDir, `${segment.name}.mp4`);
  if (!existsSync(input)) throw new Error(`Missing trailer source: ${input}`);

  const frameCount = segment.duration * 30;
  const card = await writeCard(segment);
  const filters = [
    "scale=1920:-2",
    "crop=1920:1080",
    `zoompan=z='min(zoom+0.00045,1.06)':x='min(on/${frameCount},1)*80':y='min(on/${frameCount},1)*36':d=1:s=1920x1080:fps=30`,
  ];

  filters.push(`fade=t=in:st=0:d=0.55,fade=t=out:st=${Math.max(0, segment.duration - 0.65)}:d=0.65`);

  const args = [
    "-y",
    "-loop", "1",
    "-framerate", "30",
    "-i", input,
  ];

  if (card) {
    args.push("-loop", "1", "-i", card);
    args.push(
      "-filter_complex",
      `[0:v]${filters.join(",")} [base];[1:v]format=rgba[card];[base][card]overlay=0:870:eof_action=repeat[v]`,
      "-map", "[v]",
    );
  } else {
    args.push("-vf", filters.join(","));
  }

  args.push(
    "-t", String(segment.duration),
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  );

  run("ffmpeg", args);
}

mkdirSync(segmentDir, { recursive: true });
for (const segment of segments) {
  const output = join(segmentDir, `${segment.name}.mp4`);
  if (existsSync(output)) rmSync(output);
  await renderSegment(segment);
}

const concatFile = join(outputDir, "segments.txt");
writeFileSync(
  concatFile,
  `${segments.map(({ name }) => `file 'segments/${name}.mp4'`).join("\n")}\n`,
  "utf8",
);

const videoOnly = join(outputDir, "prism-steam-trailer-v2-video.mp4");
const finalVideo = join(outputDir, "prism-steam-trailer-v2.mp4");

run("ffmpeg", [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", concatFile,
  "-c", "copy",
  "-movflags", "+faststart",
  videoOnly,
]);

run("ffmpeg", [
  "-y",
  "-i", videoOnly,
  "-stream_loop", "-1",
  "-i", musicFile,
  "-t", "60",
  "-filter_complex", "[1:a]volume=0.72,afade=t=in:st=0:d=1.2,afade=t=out:st=57.5:d=2.5[a]",
  "-map", "0:v:0",
  "-map", "[a]",
  "-c:v", "copy",
  "-c:a", "aac",
  "-b:a", "192k",
  "-shortest",
  "-movflags", "+faststart",
  finalVideo,
]);

run("ffmpeg", [
  "-y",
  "-i", finalVideo,
  "-vf", "fps=1/6,scale=480:-2,tile=5x2",
  "-frames:v", "1",
  join(outputDir, "contact-sheet.png"),
]);

console.log(`Steam trailer v2 written to ${finalVideo}`);
