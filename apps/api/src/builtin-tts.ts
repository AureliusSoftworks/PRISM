import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BOT_AUDIO_VOICE_IDS,
  PRISM_BUILTIN_ENGLISH_VOICES,
  expandSpeechText,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAudioVoiceProfileForSynthesisV1,
  prismBuiltinEnglishVoice,
  type BotAudioVoiceId,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  PRISM_BUILTIN_TTS_MODEL_ID,
  prismBuiltinTtsModelRoot,
} from "./builtin-tts-assets.ts";
import { BuiltinTtsWorkerClient } from "./builtin-tts-worker-client.ts";

export {
  PRISM_BUILTIN_TTS_MODEL_ID,
  prismBuiltinTtsModelRoot,
} from "./builtin-tts-assets.ts";

type SupportedSystemTtsPlatform = "darwin" | "win32";

export interface SystemVoiceOption {
  name: string;
  locale: string;
}

const WINDOWS_LIST_VOICES_SCRIPT = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.GetInstalledVoices() |
    Where-Object { $_.Enabled } |
    ForEach-Object { "{0}{1}{2}" -f $_.VoiceInfo.Name, [char]9, $_.VoiceInfo.Culture.Name }
} finally {
  $synth.Dispose()
}
`;

const WINDOWS_SYNTHESIZE_SCRIPT = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled })
  if ($voices.Count -eq 0) { throw "No Windows speech voices are installed." }
  $preferred = $env:PRISM_TTS_VOICE
  if (-not [string]::IsNullOrWhiteSpace($preferred)) {
    $selected = $voices | Where-Object { $_.VoiceInfo.Name -eq $preferred } | Select-Object -First 1
    if ($null -ne $selected) {
      $synth.SelectVoice($selected.VoiceInfo.Name)
    }
  }
  $synth.Rate = [Math]::Max(-10, [Math]::Min(10, [int]$env:PRISM_TTS_RATE))
  $synth.SetOutputToWaveFile($env:PRISM_TTS_OUTPUT)
  $synth.Speak([IO.File]::ReadAllText($env:PRISM_TTS_INPUT))
} finally {
  $synth.Dispose()
}
`;

function windowsPowerShellPath(): string | null {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (systemRoot) {
    const candidate = join(
      systemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    );
    if (existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "powershell.exe" : null;
}

function encodedPowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

async function runCommand(args: {
  command: string;
  parameters: readonly string[];
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise<string>((resolve, reject) => {
    const child = spawn(args.command, [...args.parameters], {
      env: args.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      args.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(stdout);
    };
    const onAbort = () => {
      child.kill();
      finish(new DOMException("Aborted", "AbortError"));
    };
    args.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 64_000) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 8_000) stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (code === 0) finish();
      else finish(new Error(
        stderr.trim() || `System speech command stopped (${code ?? "unknown"}).`
      ));
    });
  });
}

export function parseMacSystemVoiceOptions(output: string): SystemVoiceOption[] {
  return output
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})\s+#/);
      return match ? [{ name: match[1]!.trim(), locale: match[2]! }] : [];
    });
}

export function parseMacSystemVoiceList(output: string): string[] {
  return parseMacSystemVoiceOptions(output)
    .filter((voice) => voice.locale.toLowerCase().startsWith("en_"))
    .map((voice) => voice.name);
}

function parseWindowsSystemVoiceOptions(output: string): SystemVoiceOption[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const [name, locale = ""] = line.split("\t");
    const normalizedName = name?.trim() ?? "";
    return normalizedName ? [{ name: normalizedName, locale: locale.trim() }] : [];
  });
}

export function selectSystemVoice(args: {
  platform: SupportedSystemTtsPlatform;
  voiceId: BotAudioVoiceId;
  voiceName?: string | null;
  installedVoices: readonly string[];
}): string | null {
  const requestedName = args.voiceName?.trim();
  if (!requestedName || args.installedVoices.length === 0) return null;
  const installedByLowercase = new Map(
    args.installedVoices.map((voice) => [voice.toLocaleLowerCase(), voice])
  );
  return installedByLowercase.get(requestedName.toLocaleLowerCase()) ?? null;
}

export function systemEnglishGenerationSettings(args: {
  profile: BotAudioVoiceProfileV1;
  platform: SupportedSystemTtsPlatform;
  installedVoices: readonly string[];
}): { voiceName: string | null; rate: number; slotIndex: number } {
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  return {
    voiceName: selectSystemVoice({
      platform: args.platform,
      voiceId: profile.baseVoiceId,
      voiceName: profile.systemVoiceName,
      installedVoices: args.installedVoices,
    }),
    rate: args.platform === "darwin"
      // Tempo is applied once, locally in the browser playback transform. This
      // keeps native synthesis neutral and stops pitch from altering duration.
      ? 175
      : 0,
    slotIndex: BOT_AUDIO_VOICE_IDS.indexOf(profile.baseVoiceId),
  };
}

let macVoiceListPromise: Promise<SystemVoiceOption[]> | null = null;
let windowsVoiceListPromise: Promise<SystemVoiceOption[]> | null = null;
const prismVoicePackWorker = new BuiltinTtsWorkerClient();

async function listInstalledSystemVoiceOptions(
  platform: SupportedSystemTtsPlatform,
  signal?: AbortSignal
): Promise<SystemVoiceOption[]> {
  if (platform === "darwin") {
    macVoiceListPromise ??= runCommand({
      command: "/usr/bin/say",
      parameters: ["-v", "?"],
      signal,
    }).then(parseMacSystemVoiceOptions).catch((error) => {
      macVoiceListPromise = null;
      throw error;
    });
    return macVoiceListPromise;
  }
  const powershell = windowsPowerShellPath();
  if (!powershell) return [];
  windowsVoiceListPromise ??= runCommand({
    command: powershell,
    parameters: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodedPowerShell(WINDOWS_LIST_VOICES_SCRIPT),
    ],
    signal,
  }).then(parseWindowsSystemVoiceOptions).catch((error) => {
    windowsVoiceListPromise = null;
    throw error;
  });
  return windowsVoiceListPromise;
}

async function listInstalledSystemVoices(
  platform: SupportedSystemTtsPlatform,
  signal?: AbortSignal
): Promise<string[]> {
  const options = await listInstalledSystemVoiceOptions(platform, signal);
  const english = options.filter((voice) => voice.locale.toLowerCase().startsWith("en"));
  return english.map((voice) => voice.name);
}

export function builtinEnglishAvailable(_platform = process.platform): boolean {
  return prismBuiltinTtsModelRoot() !== null;
}

export async function getSystemVoiceCapabilities(signal?: AbortSignal): Promise<{
  platform: string;
  installedVoices: string[];
  voices: SystemVoiceOption[];
  slots: Array<{ voiceId: BotAudioVoiceId; name: string | null }>;
  hasDistinctPackVoices: boolean;
  /** Compatibility flag retained for older clients. */
  hasFiveDistinctVoices: boolean;
  pack: typeof PRISM_BUILTIN_ENGLISH_VOICES;
}> {
  const platform = process.platform;
  const allVoices = platform === "darwin" || platform === "win32"
    ? await listInstalledSystemVoiceOptions(platform, signal).catch(() => [])
    : [];
  const englishVoices = allVoices.filter((voice) => voice.locale.toLowerCase().startsWith("en"));
  const voices = englishVoices;
  const installedVoices = voices.map((voice) => voice.name);
  const slots = BOT_AUDIO_VOICE_IDS.map((voiceId) => ({
    voiceId,
    name: prismBuiltinEnglishVoice(voiceId).name,
  }));
  const distinctVoiceCount = new Set(
    slots.map((slot) => slot.name).filter(Boolean),
  ).size;
  const packAvailable = builtinEnglishAvailable();
  return {
    platform,
    installedVoices,
    voices,
    slots,
    hasDistinctPackVoices: packAvailable &&
      distinctVoiceCount === PRISM_BUILTIN_ENGLISH_VOICES.length,
    hasFiveDistinctVoices: packAvailable && distinctVoiceCount >= 5,
    pack: PRISM_BUILTIN_ENGLISH_VOICES,
  };
}

/**
 * Validate that a RIFF/WAVE payload contains at least one non-silent frame of
 * uncompressed PCM audio. Speech tools can exit successfully with header-only
 * or effectively silent WAVE data, both of which browsers accept but cannot
 * be heard.
 */
export function isPlayablePcmWave(buffer: Buffer): boolean {
  if (
    buffer.length < 12 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    return false;
  }

  const riffEnd = buffer.readUInt32LE(4) + 8;
  if (riffEnd < 12 || riffEnd > buffer.length) return false;

  let audioFormat: number | null = null;
  let bitsPerSample: number | null = null;
  let blockAlign: number | null = null;
  let dataBytes = 0;
  const dataRanges: Array<{ start: number; end: number }> = [];
  for (let offset = 12; offset + 8 <= riffEnd; ) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkBytes = buffer.readUInt32LE(offset + 4);
    const valueOffset = offset + 8;
    const valueEnd = valueOffset + chunkBytes;
    const nextOffset = valueEnd + (chunkBytes % 2);
    if (valueEnd > riffEnd || nextOffset > riffEnd) return false;

    if (chunkId === "fmt ") {
      if (chunkBytes < 16) return false;
      const candidateAudioFormat = buffer.readUInt16LE(valueOffset);
      const channels = buffer.readUInt16LE(valueOffset + 2);
      const sampleRate = buffer.readUInt32LE(valueOffset + 4);
      const byteRate = buffer.readUInt32LE(valueOffset + 8);
      const candidateBlockAlign = buffer.readUInt16LE(valueOffset + 12);
      const candidateBitsPerSample = buffer.readUInt16LE(valueOffset + 14);
      const bytesPerSample = candidateBitsPerSample / 8;
      const supportedSampleFormat =
        candidateAudioFormat === 1 ||
        (candidateAudioFormat === 3 && candidateBitsPerSample === 32);
      if (
        !supportedSampleFormat ||
        channels === 0 ||
        sampleRate === 0 ||
        !Number.isInteger(bytesPerSample) ||
        bytesPerSample < 1 ||
        bytesPerSample > 4 ||
        candidateBlockAlign !== channels * bytesPerSample ||
        byteRate !== sampleRate * candidateBlockAlign
      ) {
        return false;
      }
      audioFormat = candidateAudioFormat;
      bitsPerSample = candidateBitsPerSample;
      blockAlign = candidateBlockAlign;
    } else if (chunkId === "data") {
      dataBytes += chunkBytes;
      dataRanges.push({ start: valueOffset, end: valueEnd });
    }

    offset = nextOffset;
  }

  if (
    audioFormat === null ||
    bitsPerSample === null ||
    blockAlign === null ||
    dataBytes < blockAlign
  ) {
    return false;
  }

  // A structurally valid, full-length WAVE can still be digital silence (or
  // contain only inaudible quantization dust). Browser decode/play lifecycle
  // succeeds for that payload, which used to reveal text and animate timing
  // without producing speech. Scan the complete payload so leading silence
  // remains valid while requiring meaningful peak and RMS energy overall.
  const minimumPeak = 1e-3;
  const minimumRms = 1e-4;
  let peak = 0;
  let squaredSignal = 0;
  let sampleCount = 0;
  let invalidSample = false;
  const observeSample = (sample: number): void => {
    sampleCount += 1;
    if (!Number.isFinite(sample)) {
      invalidSample = true;
      return;
    }
    const magnitude = Math.min(1, Math.abs(sample));
    peak = Math.max(peak, magnitude);
    squaredSignal += magnitude * magnitude;
  };

  for (const { start, end } of dataRanges) {
    if (audioFormat === 3) {
      for (let offset = start; offset + 4 <= end; offset += 4) {
        observeSample(buffer.readFloatLE(offset));
      }
      continue;
    }
    const bytesPerSample = bitsPerSample / 8;
    for (
      let offset = start;
      offset + bytesPerSample <= end;
      offset += bytesPerSample
    ) {
      if (bitsPerSample === 8) {
        observeSample((buffer[offset]! - 0x80) / 0x80);
      } else if (bitsPerSample === 16) {
        observeSample(buffer.readInt16LE(offset) / 0x8000);
      } else if (bitsPerSample === 24) {
        observeSample(buffer.readIntLE(offset, 3) / 0x800000);
      } else {
        observeSample(buffer.readInt32LE(offset) / 0x80000000);
      }
    }
  }

  if (invalidSample || sampleCount === 0 || peak < minimumPeak) return false;
  return Math.sqrt(squaredSignal / sampleCount) >= minimumRms;
}

async function generateSystemEnglishWave(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  signal?: AbortSignal;
}): Promise<Buffer> {
  if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (process.platform !== "darwin" && process.platform !== "win32") {
    throw new Error("Operating-system voices require PRISM Desktop on macOS or Windows.");
  }
  const platform = process.platform as SupportedSystemTtsPlatform;
  if (
    platform === "darwin" &&
    (!existsSync("/usr/bin/say") || !existsSync("/usr/bin/afconvert"))
  ) {
    throw new Error("macOS speech voices are unavailable on this device.");
  }
  if (platform === "win32" && windowsPowerShellPath() === null) {
    throw new Error("Windows speech voices are unavailable on this device.");
  }

  const installedVoices = await listInstalledSystemVoices(platform, args.signal);
  const settings = systemEnglishGenerationSettings({
    profile: args.profile,
    platform,
    installedVoices,
  });
  if (installedVoices.length === 0) {
    throw new Error("No compatible system English voices are installed.");
  }
  if (
    normalizeBotAudioVoiceProfileV1(args.profile).systemVoiceName &&
    !settings.voiceName
  ) {
    throw new Error("The selected operating-system voice is no longer installed.");
  }

  const directory = await mkdtemp(join(tmpdir(), "prism-system-tts-"));
  const inputPath = join(directory, "speech.txt");
  const outputPath = join(directory, "speech.wav");
  try {
    await writeFile(inputPath, args.text, "utf8");
    if (platform === "darwin") {
      const intermediatePath = join(directory, "speech.caf");
      const voiceParameters = settings.voiceName ? ["-v", settings.voiceName] : [];
      await runCommand({
        command: "/usr/bin/say",
        parameters: [
          ...voiceParameters,
          "-r",
          String(settings.rate),
          "--data-format=LEI16@24000",
          "-o",
          intermediatePath,
          "-f",
          inputPath,
        ],
        signal: args.signal,
      });
      await runCommand({
        command: "/usr/bin/afconvert",
        parameters: [intermediatePath, outputPath, "-f", "WAVE", "-d", "LEI16"],
        signal: args.signal,
      });
    } else {
      const powershell = windowsPowerShellPath();
      if (!powershell) throw new Error("Windows speech synthesis is unavailable.");
      await runCommand({
        command: powershell,
        parameters: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          encodedPowerShell(WINDOWS_SYNTHESIZE_SCRIPT),
        ],
        signal: args.signal,
        env: {
          ...process.env,
          PRISM_TTS_INPUT: inputPath,
          PRISM_TTS_OUTPUT: outputPath,
          PRISM_TTS_VOICE: settings.voiceName ?? "",
          PRISM_TTS_RATE: String(settings.rate),
          PRISM_TTS_SLOT: String(settings.slotIndex),
        },
      });
    }
    const wave = await readFile(outputPath);
    if (!isPlayablePcmWave(wave)) {
      throw new Error("System speech returned no playable PCM audio.");
    }
    return wave;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function generatePrismVoicePackWave(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  protectedPhrases?: readonly string[];
  deliveryMood?: string;
  signal?: AbortSignal;
}): Promise<Buffer> {
  if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const wave = await prismVoicePackWorker.generate(args);
  if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return requirePlayablePrismVoicePackWave(wave);
}

export function requirePlayablePrismVoicePackWave(wave: Buffer): Buffer {
  if (!isPlayablePcmWave(wave)) {
    throw new Error("PRISM Voice Pack returned no playable PCM audio.");
  }
  return wave;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function generateBuiltinEnglishWave(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  allowOperatingSystemVoices?: boolean;
  protectedPhrases?: readonly string[];
  /** Delivery mood realized as a style-space direction by the voice pack.
   * Operating-system voices ignore it: they have no style surface. */
  deliveryMood?: string;
  signal?: AbortSignal;
}): Promise<Buffer> {
  // Keep operating-system and packaged-local engines on the same private
  // speech projection, including direct callers outside the HTTP route.
  const speechArgs = {
    ...args,
    text: expandSpeechText(args.text),
  };
  const profile =
    normalizeBotAudioVoiceProfileForSynthesisV1(speechArgs.profile);
  if (speechArgs.allowOperatingSystemVoices && profile.systemVoiceName) {
    try {
      return await generateSystemEnglishWave({ ...speechArgs, profile });
    } catch (error) {
      if (isAbortError(error)) throw error;
      // A removed or broken host voice must not silence the bot. The portable
      // built-in identity remains the deterministic local fallback. Preserve
      // the explicit system-voice contract by keeping phoneme controls
      // suspended rather than changing pronunciation invisibly.
      profile.pronunciationBase = "follow-voice";
      profile.accentDefinitionId = null;
      profile.speechprintInfluence = "none";
      profile.speechprintVariationSeed = "natural-v1";
    }
  }

  try {
    return await generatePrismVoicePackWave({ ...speechArgs, profile });
  } catch (error) {
    if (isAbortError(error) || !speechArgs.allowOperatingSystemVoices) throw error;
    // If a packaged model is damaged, people who explicitly enabled OS voices
    // still retain a clean device-local recovery path.
    return generateSystemEnglishWave({
      ...speechArgs,
      profile: { ...profile, systemVoiceName: null },
    });
  }
}
