import { extractStageDirections, getBotMentionDisplayText } from "./botMention.ts";

export type CoffeeVoiceMessageLike = {
  id: string;
  content: string;
};

export type CoffeeBotVoiceSynthesisSource = {
  messageId: string;
  spokenText: string;
};

/** Keep Coffee action cues visual while sending only dialogue to speech engines. */
export function coffeeVoiceSpokenText(text: string): string {
  return getBotMentionDisplayText(extractStageDirections(text).mainText).trim();
}

/**
 * The message id preserves provider/privacy provenance on the API, while the
 * derived spoken text is the only content the voice engine should receive.
 */
export function coffeeBotVoiceSynthesisSource(
  message: CoffeeVoiceMessageLike
): CoffeeBotVoiceSynthesisSource | null {
  const spokenText = coffeeVoiceSpokenText(message.content);
  return spokenText ? { messageId: message.id, spokenText } : null;
}
