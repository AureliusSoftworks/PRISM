import { stopBottishVoice } from "./bottishVoice.ts";
import { stopCoffeeActionSfx } from "./coffee-action-sfx.ts";
import { stopEnglishVoice } from "./englishVoice.ts";
import { stopSignalIntroAudio } from "./signalIntroAudio.ts";
import { stopReactionVoiceAudio } from "./voiceEffects.ts";
import { runPrismSceneAudioStopSequence } from "./scene-audio-stop-sequence.ts";

export interface PrismSceneAudioStopOptions {
  preservePreparedVoice?: boolean;
}

/** Halt every foreground/standalone audio source owned by the current scene. */
export function stopPrismSceneAudio(
  options: PrismSceneAudioStopOptions = {},
): void {
  const preservePreparedMedia = options.preservePreparedVoice === true;
  runPrismSceneAudioStopSequence(
    [
      () => stopBottishVoice({ preservePreparedMedia }),
      () => stopEnglishVoice({ preservePreparedMedia }),
      stopReactionVoiceAudio,
      stopCoffeeActionSfx,
      stopSignalIntroAudio,
    ],
  );
}
