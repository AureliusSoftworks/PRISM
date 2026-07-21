import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  BOT_AUDIO_VOICE_IDS,
  PRISM_BUILTIN_ENGLISH_VOICES,
  normalizeBotAudioVoiceProfileV1,
  prismBuiltinEnglishVoice,
  type BotAudioVoiceId,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";

type SupportedSystemTtsPlatform = "darwin" | "win32";

export interface SystemVoiceOption {
  name: string;
  locale: string;
}

export const PRISM_BUILTIN_TTS_MODEL_ID =
  "onnx-community/Kokoro-82M-v1.0-ONNX";

const PRISM_BUILTIN_TTS_REQUIRED_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
] as const;

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
let kokoroTtsPromise: Promise<import("kokoro-js").KokoroTTS> | null = null;
let kokoroModelRoot: string | null = null;

function normalizedModelRoot(path: string): string {
  const normalized = resolve(path);
  return normalized.endsWith(sep) ? normalized : `${normalized}${sep}`;
}

export function prismBuiltinTtsModelRoot(
  cwd = process.cwd(),
  configuredRoot = process.env.PRISM_BUILTIN_TTS_MODEL_DIR,
): string | null {
  const candidates = [
    configuredRoot,
    join(cwd, "models"),
    join(cwd, "runtime", "models"),
    join(cwd, ".cache", "prism-models"),
    // Workspace commands run from either the repo root or apps/api.
    join(cwd, "..", "..", ".cache", "prism-models"),
  ].filter((value): value is string => Boolean(value?.trim()));
  return candidates.find((root) =>
    PRISM_BUILTIN_TTS_REQUIRED_FILES.every((file) =>
      existsSync(join(root, PRISM_BUILTIN_TTS_MODEL_ID, file)),
    ),
  ) ?? null;
}

async function getKokoroTts(): Promise<import("kokoro-js").KokoroTTS> {
  const modelRoot = prismBuiltinTtsModelRoot();
  if (!modelRoot) {
    throw new Error(
      "PRISM's built-in voice pack is not installed. Re-run the runtime staging step.",
    );
  }
  if (kokoroTtsPromise && kokoroModelRoot === modelRoot) return kokoroTtsPromise;

  kokoroModelRoot = modelRoot;
  kokoroTtsPromise = (async () => {
    const [{ env }, { KokoroTTS }] = await Promise.all([
      import("@huggingface/transformers"),
      import("kokoro-js"),
    ]);
    // A LOCAL speech request must never turn a missing model into a download.
    // Installed desktop and Docker builds stage the pinned model ahead of time.
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = normalizedModelRoot(modelRoot);
    env.useFSCache = false;
    return KokoroTTS.from_pretrained(PRISM_BUILTIN_TTS_MODEL_ID, {
      dtype: "q8",
      device: "cpu",
    });
  })().catch((error) => {
    kokoroTtsPromise = null;
    kokoroModelRoot = null;
    throw error;
  });
  return kokoroTtsPromise;
}

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
  const voices = englishVoices.length > 0 ? englishVoices : allVoices;
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

function isPcmWave(buffer: Buffer): boolean {
  return buffer.length >= 44 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE";
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
    if (!isPcmWave(wave)) throw new Error("System speech returned an unsupported audio format.");
    return wave;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function generatePrismVoicePackWave(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  signal?: AbortSignal;
}): Promise<Buffer> {
  if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const voice = prismBuiltinEnglishVoice(profile.baseVoiceId);
  const tts = await getKokoroTts();
  if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const audio = await tts.generate(args.text, {
    voice: voice.engineVoiceId,
    // Pace is applied once by PRISM's formant-preserving playback worklet.
    speed: 1,
  });
  if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return Buffer.from(audio.toWav());
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function generateBuiltinEnglishWave(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  allowOperatingSystemVoices?: boolean;
  signal?: AbortSignal;
}): Promise<Buffer> {
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  if (args.allowOperatingSystemVoices && profile.systemVoiceName) {
    try {
      return await generateSystemEnglishWave({ ...args, profile });
    } catch (error) {
      if (isAbortError(error)) throw error;
      // A removed or broken host voice must not silence the bot. The portable
      // built-in identity remains the deterministic local fallback.
    }
  }

  try {
    return await generatePrismVoicePackWave({ ...args, profile });
  } catch (error) {
    if (isAbortError(error) || !args.allowOperatingSystemVoices) throw error;
    // If a packaged model is damaged, people who explicitly enabled OS voices
    // still retain a clean device-local recovery path.
    return generateSystemEnglishWave({
      ...args,
      profile: { ...profile, systemVoiceName: null },
    });
  }
}
