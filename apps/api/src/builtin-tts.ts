import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BOT_AUDIO_VOICE_IDS,
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceId,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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
  const pitchPlaybackRatio = 2 ** ((profile.pitch * 650) / 1200);
  return {
    voiceName: selectSystemVoice({
      platform: args.platform,
      voiceId: profile.baseVoiceId,
      voiceName: profile.systemVoiceName,
      installedVoices: args.installedVoices,
    }),
    rate: args.platform === "darwin"
      ? Math.round(clamp((175 + profile.pace * 55) / pitchPlaybackRatio, 90, 250))
      : Math.round(clamp(profile.pace * 4 - profile.pitch * 3, -6, 6)),
    slotIndex: Number(profile.baseVoiceId.slice(-1)) - 1,
  };
}

let macVoiceListPromise: Promise<SystemVoiceOption[]> | null = null;
let windowsVoiceListPromise: Promise<SystemVoiceOption[]> | null = null;

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
  return (english.length > 0 ? english : options).map((voice) => voice.name);
}

export function builtinEnglishAvailable(platform = process.platform): boolean {
  if (platform === "darwin") {
    return existsSync("/usr/bin/say") && existsSync("/usr/bin/afconvert");
  }
  if (platform === "win32") return windowsPowerShellPath() !== null;
  return false;
}

export async function getSystemVoiceCapabilities(signal?: AbortSignal): Promise<{
  platform: string;
  installedVoices: string[];
  voices: SystemVoiceOption[];
  slots: Array<{ voiceId: BotAudioVoiceId; name: string | null }>;
  hasFiveDistinctVoices: boolean;
}> {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return {
      platform: process.platform,
      installedVoices: [],
      voices: [],
      slots: BOT_AUDIO_VOICE_IDS.map((voiceId) => ({ voiceId, name: null })),
      hasFiveDistinctVoices: false,
    };
  }
  const platform = process.platform as SupportedSystemTtsPlatform;
  const allVoices = await listInstalledSystemVoiceOptions(platform, signal).catch(() => []);
  const englishVoices = allVoices.filter((voice) => voice.locale.toLowerCase().startsWith("en"));
  const voices = englishVoices.length > 0 ? englishVoices : allVoices;
  const installedVoices = voices.map((voice) => voice.name);
  const slots = BOT_AUDIO_VOICE_IDS.map((voiceId) => ({
    voiceId,
    name: null,
  }));
  return {
    platform,
    installedVoices,
    voices,
    slots,
    hasFiveDistinctVoices: new Set(slots.map((slot) => slot.name).filter(Boolean)).size >= 5,
  };
}

function isPcmWave(buffer: Buffer): boolean {
  return buffer.length >= 44 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE";
}

export async function generateBuiltinEnglishWave(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  signal?: AbortSignal;
}): Promise<Buffer> {
  if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (process.platform !== "darwin" && process.platform !== "win32") {
    throw new Error("System English voices require the Prism desktop app on macOS or Windows.");
  }
  if (!builtinEnglishAvailable()) {
    throw new Error("System English voices are unavailable on this device.");
  }

  const platform = process.platform as SupportedSystemTtsPlatform;
  const installedVoices = await listInstalledSystemVoices(platform, args.signal);
  const settings = systemEnglishGenerationSettings({
    profile: args.profile,
    platform,
    installedVoices,
  });
  if (installedVoices.length === 0) {
    throw new Error("No compatible system English voices are installed.");
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
    if (!isPcmWave(wave)) throw new Error("System speech returned an unsupported audio format.");
    return wave;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
