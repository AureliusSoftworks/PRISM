import type { BotAudioVoiceProfileV1, WhodunnitSpeechType } from "@localai/shared";
import { normalizeBotAudioVoiceProfileV1 } from "@localai/shared";
import type { DebateUtterance } from "./DebateExperience";
import type { RoomAcousticsSend } from "./roomAcoustics";

export interface WhodunnitPremiumVoiceRequest {
  sessionId: string;
  lineId: string;
  localOnly: boolean;
  signal: AbortSignal;
  lifecycle: DebateUtterance["lifecycle"];
  roomAcoustics?: RoomAcousticsSend;
}

export interface WhodunnitSpokenPerformance {
  lineId: string;
  cacheKey: string;
  speakerBotId: string;
  spokenText: string;
  voiceProfile: BotAudioVoiceProfileV1;
}

export interface WhodunnitPremiumSelection {
  voiceMode: string;
  /** The Whodunnit navbar's Speech picker: English (built-in) or Premium (ElevenLabs). */
  whodunnitSpeechType: WhodunnitSpeechType;
  audioEnabled: boolean;
  volume: number;
  localOnly: boolean;
  hasKey: boolean;
}

/** Premium is the applet's own choice, independent of the account-wide English
 * engine: Whodunnit dialogue is always English, so only Mute, LOCAL, a missing
 * key, or the picker itself can keep the frozen ElevenLabs voice off the stage. */
export function whodunnitPremiumVoiceSelected(selection: WhodunnitPremiumSelection): boolean {
  return selection.audioEnabled && selection.volume > 0 && !selection.localOnly &&
    selection.hasKey && selection.voiceMode !== "mute" && selection.whodunnitSpeechType === "premium";
}

/** Invoked for one visible line only. False leaves the prepared local clip in
 * charge. Recheck selection after the read so a mode change cannot start a
 * stale paid request. Cancellation never falls through into another voice. */
export async function playWhodunnitPremiumVoice(args: WhodunnitPremiumVoiceRequest & {
  selection: () => WhodunnitPremiumSelection;
  read: (path: string, options: RequestInit) => Promise<{ performance: WhodunnitSpokenPerformance }>;
  play: (performance: WhodunnitSpokenPerformance) => Promise<boolean>;
  stop: () => void;
}): Promise<boolean> {
  const eligible = (): boolean => !args.signal.aborted && !args.localOnly &&
    whodunnitPremiumVoiceSelected(args.selection());
  if (!eligible()) return false;
  let playing = false;
  const stop = (): void => { if (playing) args.stop(); };
  try {
    const { performance } = await args.read(
      `/api/debates/${encodeURIComponent(args.sessionId)}/mystery-spoken-performance/${encodeURIComponent(args.lineId)}`,
      { signal: args.signal },
    );
    if (!eligible() || performance.lineId !== args.lineId ||
      !performance.speakerBotId || !performance.spokenText.trim() ||
      !normalizeBotAudioVoiceProfileV1(performance.voiceProfile).enabled) return false;
    args.signal.addEventListener("abort", stop, { once: true });
    playing = true;
    return await args.play(performance);
  } catch {
    return false;
  } finally {
    playing = false;
    args.signal.removeEventListener("abort", stop);
  }
}
