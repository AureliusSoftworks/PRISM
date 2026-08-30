import { releaseAudibleAudioElement } from "./audibleAudioRelease.ts";
import {
  replayAudioMasterCaptureActive,
  routeAudioElementToPrismOutput,
} from "./replayAudioMasterCapture.ts";

export type SignalEpisodeTableAssetKind = "picture" | "item";
export type SignalEpisodeImageFoleyMoment = "place" | "remove";

export interface SignalEpisodeImageFoleyPresentation {
  episodeId: string;
  imageId: string;
  kind: SignalEpisodeTableAssetKind;
}

export interface SignalEpisodeImageFoleyPlan {
  kind: SignalEpisodeTableAssetKind;
  moment: SignalEpisodeImageFoleyMoment;
  src: string;
  gain: number;
}

interface SignalEpisodeImageFoleyAudio {
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

type SignalEpisodeImageFoleyAudioFactory = (
  src: string,
) => SignalEpisodeImageFoleyAudio;

const SIGNAL_EPISODE_IMAGE_FOLEY = {
  picture: {
    place: "/audio/debate/desk-paper-place-01.mp3",
    remove: "/audio/debate/desk-paper-pickup-01.mp3",
    placementGain: 0.44,
  },
  item: {
    place: "/audio/debate/exhibits/impact-wood.mp3",
    remove: "/audio/debate/exhibits/impact-wood.mp3",
    placementGain: 0.48,
  },
} as const satisfies Record<
  SignalEpisodeTableAssetKind,
  {
    place: string;
    remove: string;
    placementGain: number;
  }
>;

const activeImageFoleyAudio = new Set<SignalEpisodeImageFoleyAudio>();
const imageFoleyOutputCleanup = new WeakMap<
  SignalEpisodeImageFoleyAudio,
  () => void
>();

export function signalEpisodeImageFoleyPlan(
  kind: SignalEpisodeTableAssetKind,
  moment: SignalEpisodeImageFoleyMoment,
): SignalEpisodeImageFoleyPlan {
  const definition = SIGNAL_EPISODE_IMAGE_FOLEY[kind];
  return {
    kind,
    moment,
    src: definition[moment],
    gain:
      moment === "place"
        ? definition.placementGain
        : definition.placementGain * 0.5,
  };
}

function samePresentation(
  left: SignalEpisodeImageFoleyPresentation | null,
  right: SignalEpisodeImageFoleyPresentation | null,
): boolean {
  return Boolean(
    left &&
      right &&
      left.episodeId === right.episodeId &&
      left.imageId === right.imageId &&
      left.kind === right.kind,
  );
}

/**
 * Resolve only semantic table transitions. Reconciliation, camera cuts, and
 * other rerenders retain the same presentation identity and stay silent.
 */
export function signalEpisodeImageFoleyTransition(
  previous: SignalEpisodeImageFoleyPresentation | null,
  current: SignalEpisodeImageFoleyPresentation | null,
): SignalEpisodeImageFoleyPlan[] {
  if (samePresentation(previous, current) || (!previous && !current)) {
    return [];
  }
  if (!previous && current) {
    return [signalEpisodeImageFoleyPlan(current.kind, "place")];
  }
  if (previous && !current) {
    return [signalEpisodeImageFoleyPlan(previous.kind, "remove")];
  }
  return [
    signalEpisodeImageFoleyPlan(previous!.kind, "remove"),
    signalEpisodeImageFoleyPlan(current!.kind, "place"),
  ];
}

function releaseImageFoleyAudio(audio: SignalEpisodeImageFoleyAudio): void {
  activeImageFoleyAudio.delete(audio);
  imageFoleyOutputCleanup.get(audio)?.();
  imageFoleyOutputCleanup.delete(audio);
  audio.pause();
  audio.currentTime = 0;
}

export function playSignalEpisodeImageFoley(
  plan: SignalEpisodeImageFoleyPlan,
  options: {
    enabled?: boolean;
    masterVolume?: number;
    createAudio?: SignalEpisodeImageFoleyAudioFactory;
  } = {},
): boolean {
  if (options.enabled === false) return false;
  const masterVolume = Math.max(0, Math.min(1, options.masterVolume ?? 1));
  if (masterVolume <= 0) return false;
  if (!options.createAudio && typeof Audio === "undefined") return false;

  const createAudio = options.createAudio ?? ((src: string) => new Audio(src));
  const audio = createAudio(plan.src);
  if (!options.createAudio) {
    const cleanup = routeAudioElementToPrismOutput(
      audio as unknown as HTMLMediaElement,
    );
    if (cleanup) imageFoleyOutputCleanup.set(audio, cleanup);
    else if (replayAudioMasterCaptureActive()) return false;
  }
  audio.preload = "auto";
  audio.volume = Math.max(0, Math.min(1, masterVolume * plan.gain));
  activeImageFoleyAudio.add(audio);
  const release = (): void => releaseImageFoleyAudio(audio);
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  void audio.play().catch(release);
  return true;
}

export function stopSignalEpisodeImageFoley(fadeMs = 120): void {
  for (const audio of [...activeImageFoleyAudio]) {
    activeImageFoleyAudio.delete(audio);
    const cleanup = imageFoleyOutputCleanup.get(audio);
    imageFoleyOutputCleanup.delete(audio);
    void releaseAudibleAudioElement(audio as unknown as HTMLMediaElement, {
      durationMs: fadeMs,
      resetTime: true,
      onReleased: cleanup ?? undefined,
    });
  }
}
