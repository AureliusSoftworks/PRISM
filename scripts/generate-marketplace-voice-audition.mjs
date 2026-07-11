#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const MARKETPLACE = join(ROOT, "apps/web/public/bot-marketplace");
const OUTPUT = join(ROOT, ".codex/output/tts-gen/marketplace-voices");
const VOICES = ["Fred", "Zarvox", "Trinoids", "Junior", "Ralph"];
mkdirSync(OUTPUT, { recursive: true });

function stableUnit(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function writeBottishWave(text, profile, seed, outputPath) {
  const sampleRate = 24_000;
  const voiceIndex = Math.max(0, Number(profile.baseVoiceId?.slice(-1) ?? 1) - 1);
  const bases = [310, 235, 390, 180, 475];
  const waveforms = ["sine", "triangle", "sine", "square", "triangle"];
  const tone = profile.bottishTone ?? 0.45;
  const waveform = tone > 0.65 ? "square" : tone < -0.35 ? "sine" : waveforms[voiceIndex];
  const noteMs = Math.round(55 * (1 - (profile.pace ?? 0) * 0.38));
  const gapMs = Math.round(18 * (1 - (profile.pace ?? 0) * 0.42));
  const notes = [];
  let cursorMs = 0;
  let spokenIndex = 0;
  for (const character of Array.from(text)) {
    if (!/[\p{L}\p{N}]/u.test(character)) { cursorMs += /[.!?]/u.test(character) ? noteMs * 2.2 : gapMs * 1.4; continue; }
    const random = stableUnit(`${seed}:${spokenIndex}:${character}`);
    const step = [-5, -2, 0, 2, 4, 7][Math.floor(random * 6)] ?? 0;
    const lilt = Math.sin(spokenIndex * 0.82) * (profile.lilt ?? 0) * 4.5;
    const frequency = bases[voiceIndex] * (2 ** ((profile.pitch ?? 0) * 0.7)) * (2 ** ((step + lilt) / 12));
    notes.push({ startMs: cursorMs, frequency, durationMs: noteMs });
    cursorMs += noteMs + gapMs;
    spokenIndex += 1;
  }
  const sampleCount = Math.ceil(((cursorMs + 50) / 1000) * sampleRate);
  const samples = new Float32Array(sampleCount);
  for (const note of notes) {
    const start = Math.floor((note.startMs / 1000) * sampleRate);
    const length = Math.max(1, Math.floor((note.durationMs / 1000) * sampleRate));
    for (let offset = 0; offset < length && start + offset < samples.length; offset += 1) {
      const phase = (2 * Math.PI * note.frequency * offset) / sampleRate;
      const sine = Math.sin(phase);
      const raw = waveform === "square" ? (sine >= 0 ? 1 : -1) : waveform === "triangle" ? (2 / Math.PI) * Math.asin(sine) : sine;
      const envelope = Math.min(1, offset / (sampleRate * 0.008), (length - offset) / (sampleRate * 0.012));
      samples[start + offset] += raw * 0.3 * Math.max(0, envelope);
    }
  }
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + samples.length * 2, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2));
  writeFileSync(outputPath, buffer);
}

const manifest = JSON.parse(readFileSync(join(MARKETPLACE, "manifest.json"), "utf8"));
const byId = new Map(manifest.bots.map((bot) => [bot.id, bot]));
const themedBotIds = new Set(manifest.themes.flatMap((theme) => theme.botIds));
const auditionThemes = [
  ...manifest.themes,
  {
    name: "Retired Sacred Teacher Bundles",
    botIds: manifest.bots.filter((bot) => !themedBotIds.has(bot.id)).map((bot) => bot.id),
  },
];
const lines = ["# Marketplace Voice Audition", "", "English and Bottish dry identity previews for all marketplace bots. Texture presets are listed here and applied in realtime inside Prism.", ""];

for (const theme of auditionThemes) {
  lines.push(`## ${theme.name}`, "", "| Bot | Voice | Texture | English | Bottish |", "|---|---|---|---|---|");
  for (const id of theme.botIds) {
    const entry = byId.get(id);
    if (!entry) continue;
    const archive = join(MARKETPLACE, entry.bundlePath.replace(/^\/bot-marketplace\//u, ""));
    const work = mkdtempSync(join(tmpdir(), `prism-audition-${id}-`));
    try {
      execFileSync("unzip", ["-qq", archive, "bot.json", "-d", work]);
      const bundle = JSON.parse(readFileSync(join(work, "bot.json"), "utf8"));
      const profile = bundle.bot.authoredAudioVoiceProfile;
      const voiceIndex = Math.max(0, Number(profile.baseVoiceId.slice(-1)) - 1);
      const text = `Hello, I'm ${entry.name}. This is my Prism voice.`;
      const englishName = `${id}-english.wav`;
      const bottishName = `${id}-bottish.wav`;
      const caf = join(work, "english.caf");
      const pitchRatio = 2 ** (((profile.pitch ?? 0) * 650) / 1200);
      const rate = Math.round(Math.max(90, Math.min(250, (175 + (profile.pace ?? 0) * 55) / pitchRatio)));
      execFileSync("/usr/bin/say", ["-v", VOICES[voiceIndex], "-r", String(rate), "--data-format=LEI16@24000", "-o", caf, text]);
      execFileSync("/usr/bin/afconvert", [caf, join(OUTPUT, englishName), "-f", "WAVE", "-d", "LEI16"]);
      writeBottishWave(text, profile, id, join(OUTPUT, bottishName));
      const texture = profile.texture?.preset === "clean" ? "Clean" : `${profile.texture.preset} ${Math.round(profile.texture.amount * 100)}%`;
      lines.push(`| ${entry.name} | ${VOICES[voiceIndex]} | ${texture} | [Play](marketplace-voices/${englishName}) | [Play](marketplace-voices/${bottishName}) |`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  lines.push("");
}

writeFileSync(join(ROOT, ".codex/output/tts-gen/marketplace-voice-audition.md"), `${lines.join("\n")}\n`);
console.log(`Generated ${manifest.bots.length * 2} audition files and the marketplace report.`);
