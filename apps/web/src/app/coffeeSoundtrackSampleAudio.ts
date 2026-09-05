import { routeAudioElementToPrismOutput } from "./replayAudioMasterCapture.ts";
import { COFFEE_SOUNDTRACK_SAMPLE_RELEASE_MS } from "./coffeeGroupSoundtrack.ts";

let activeSample: HTMLAudioElement | null = null;
let activeCleanup: (() => void) | null = null;
let activeRun = 0;

export async function stopCoffeeSoundtrackSampleAudio(
  releaseMs = COFFEE_SOUNDTRACK_SAMPLE_RELEASE_MS,
): Promise<void> {
  const audio = activeSample;
  if (!audio) return;
  activeRun += 1;
  activeSample = null;
  const cleanup = activeCleanup;
  activeCleanup = null;
  const startVolume = audio.volume;
  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / Math.max(1, releaseMs));
      audio.volume = startVolume * Math.cos(progress * Math.PI * 0.5);
      if (progress >= 1) {
        audio.pause();
        cleanup?.();
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
}

export async function playCoffeeSoundtrackSampleAudio(args: {
  url: string;
  volume: number;
  onEnded?: () => void;
}): Promise<void> {
  await stopCoffeeSoundtrackSampleAudio();
  if (typeof Audio === "undefined") return;
  const run = activeRun + 1;
  activeRun = run;
  const audio = new Audio(args.url);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = Math.max(0, Math.min(1, args.volume));
  activeSample = audio;
  activeCleanup = routeAudioElementToPrismOutput(audio);
  const finish = () => {
    if (activeRun !== run || activeSample !== audio) return;
    activeSample = null;
    activeCleanup?.();
    activeCleanup = null;
    args.onEnded?.();
  };
  audio.addEventListener("error", finish, { once: true });
  await audio.play().catch(finish);
}
