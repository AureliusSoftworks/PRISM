import { releaseBottishVoice } from "./bottishVoice.ts";
import { stopAllBotAvatarSfxAudio } from "./botAvatarSfx.ts";
import { stopCoffeeActionSfx } from "./coffee-action-sfx.ts";
import { stopCoffeeSoundtrackSampleAudio } from "./coffeeSoundtrackSampleAudio.ts";
import { stopDebateIdentAudio } from "./debateIdentAudio.ts";
import { releaseEnglishVoice } from "./englishVoice.ts";
import { stopPrismCompanionGlassTapAudio } from "./prismCompanionSfx.ts";
import { releaseSignalIntroAudio } from "./signalIntroAudio.ts";
import { stopSignalSoundboardAudio } from "./signalSoundboard.ts";
import { releaseReactionVoiceAudio } from "./voiceEffects.ts";
import { runPrismSceneAudioStopSequence } from "./scene-audio-stop-sequence.ts";

export interface PrismSceneAudioStopOptions {
  preservePreparedVoice?: boolean;
}

/** Release every foreground/standalone audio source owned by the current scene. */
export function stopPrismSceneAudio(
  options: PrismSceneAudioStopOptions = {},
): void {
  const preservePreparedMedia = options.preservePreparedVoice === true;
  runPrismSceneAudioStopSequence(
    [
      () => releaseBottishVoice({ preservePreparedMedia }),
      () => releaseEnglishVoice({ preservePreparedMedia }),
      releaseReactionVoiceAudio,
      stopCoffeeActionSfx,
      () => { void stopCoffeeSoundtrackSampleAudio(); },
      () => { void stopDebateIdentAudio(); },
      stopSignalSoundboardAudio,
      stopAllBotAvatarSfxAudio,
      stopPrismCompanionGlassTapAudio,
      releaseSignalIntroAudio,
    ],
  );
}
