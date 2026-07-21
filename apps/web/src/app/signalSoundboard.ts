import {
  botcastSoundboardCueFromEvent,
  type BotcastReplayEvent,
  type BotcastSoundboardCueKind,
} from "@localai/shared";

export interface SignalSoundboardCueDefinition {
  kind: BotcastSoundboardCueKind;
  label: string;
  glyph: string;
  src: string;
  volume: number;
}

export const SIGNAL_SOUNDBOARD_CUES: readonly SignalSoundboardCueDefinition[] = [
  {
    kind: "applause",
    label: "Applause",
    glyph: "👏",
    src: "/audio/signal/soundboard/applause.mp3",
    volume: 0.58,
  },
  {
    kind: "laughter",
    label: "Laughter",
    glyph: "◡",
    src: "/audio/signal/soundboard/laughter.mp3",
    volume: 0.72,
  },
  {
    kind: "gasp",
    label: "Gasp",
    glyph: "!",
    src: "/audio/signal/soundboard/gasp.mp3",
    volume: 0.7,
  },
  {
    kind: "rimshot",
    label: "Rimshot",
    glyph: "🥁",
    src: "/audio/signal/soundboard/rimshot.mp3",
    volume: 0.62,
  },
] as const;

interface SignalSoundboardAudio {
  currentTime: number;
  paused: boolean;
  preload: string;
  volume: number;
  addEventListener(
    type: "ended" | "error",
    listener: () => void,
    options?: { once?: boolean },
  ): void;
  pause(): void;
  play(): Promise<void>;
}

type SignalSoundboardAudioFactory = (src: string) => SignalSoundboardAudio;

const activeSoundboardAudio = new Set<SignalSoundboardAudio>();

function cueDefinition(
  kind: BotcastSoundboardCueKind,
): SignalSoundboardCueDefinition | null {
  return SIGNAL_SOUNDBOARD_CUES.find((cue) => cue.kind === kind) ?? null;
}

function releaseSoundboardAudio(audio: SignalSoundboardAudio): void {
  activeSoundboardAudio.delete(audio);
  audio.pause();
  audio.currentTime = 0;
}

export function playSignalSoundboardCue(
  kind: BotcastSoundboardCueKind,
  createAudio: SignalSoundboardAudioFactory = (src) => new Audio(src),
): boolean {
  const cue = cueDefinition(kind);
  if (!cue) return false;
  const audio = createAudio(cue.src);
  audio.preload = "auto";
  audio.volume = cue.volume;
  activeSoundboardAudio.add(audio);
  const release = (): void => releaseSoundboardAudio(audio);
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  void audio.play().catch(release);
  return true;
}

/** Short release fade for pause, seek, or teardown; audible cues otherwise finish. */
export function stopSignalSoundboardAudio(fadeMs = 180): void {
  for (const audio of [...activeSoundboardAudio]) {
    if (audio.paused || fadeMs <= 0) {
      releaseSoundboardAudio(audio);
      continue;
    }
    const initialVolume = audio.volume;
    const startedAt = Date.now();
    const timer = globalThis.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / fadeMs);
      audio.volume = initialVolume * (1 - progress);
      if (progress < 1) return;
      globalThis.clearInterval(timer);
      releaseSoundboardAudio(audio);
    }, 20);
  }
}

export function signalSoundboardEventsBetween(args: {
  events: readonly BotcastReplayEvent[];
  previousElapsedMs: number;
  elapsedMs: number;
}): Array<{ eventId: string; kind: BotcastSoundboardCueKind; atMs: number }> {
  if (args.elapsedMs < args.previousElapsedMs) return [];
  return args.events.flatMap((event) => {
    const cue = botcastSoundboardCueFromEvent(event);
    if (
      !cue ||
      cue.atMs <= args.previousElapsedMs ||
      cue.atMs > args.elapsedMs
    ) {
      return [];
    }
    return [{ eventId: event.id, ...cue }];
  });
}
