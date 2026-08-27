import {
  cancelAudibleAudioRelease,
  releaseAudibleAudioElement,
} from "./audibleAudioRelease.ts";

export interface WhodunnitDialogueAudioCancellation {
  media: HTMLMediaElement | null;
  outputCleanup: (() => void) | null;
  cancelSyntheticVoice: (() => void) | null;
}

/**
 * A player skip is a hard dialogue boundary: neither generated speech nor a
 * text-only synthetic voice may remain audible underneath the next line.
 * Natural completion and ordinary scene teardown keep their release fades.
 */
export function cancelWhodunnitDialogueAudioImmediately({
  media,
  outputCleanup,
  cancelSyntheticVoice,
}: WhodunnitDialogueAudioCancellation): void {
  cancelSyntheticVoice?.();
  if (!media) {
    outputCleanup?.();
    return;
  }
  cancelAudibleAudioRelease(media);
  void releaseAudibleAudioElement(media, {
    durationMs: 0,
    resetTime: true,
    clearSource: true,
    onReleased: outputCleanup ?? undefined,
  });
}
