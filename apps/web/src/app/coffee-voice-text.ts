import { botPowerResponseIsSilentV1 } from "@localai/shared";
import { extractStageDirections, getBotMentionDisplayText } from "./botMention.ts";

export type CoffeeVoiceMessageLike = {
  id: string;
  content: string;
};

export type CoffeeBotVoiceSynthesisSource = {
  messageId: string;
  spokenText: string;
};

export type CoffeeMessageDelivery = {
  /** Mention-preserving prose for the table and Table Talk. */
  displayText: string;
  /** Plain prose for speech synthesis and audio timing. */
  spokenText: string;
  hasDialogue: boolean;
};

function coffeeDialogueIsSubstantive(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/**
 * Give every Coffee surface the same delivery decision. Stage directions stay
 * visual-only. A canonical Power-mute ellipsis stays visible but never owns
 * speech; other punctuation-only artifacts own neither transcript nor speech.
 */
export function normalizeCoffeeMessageDelivery(
  text: string,
): CoffeeMessageDelivery {
  const displayText = extractStageDirections(text).mainText.trim();
  const spokenText = getBotMentionDisplayText(displayText).trim();
  const hasDialogue = coffeeDialogueIsSubstantive(spokenText);
  const isPowerMuteResponse = botPowerResponseIsSilentV1(text);
  return {
    displayText: hasDialogue || isPowerMuteResponse ? displayText : "",
    spokenText: hasDialogue ? spokenText : "",
    hasDialogue,
  };
}

/** Keep Coffee action cues visual while sending only dialogue to speech engines. */
export function coffeeVoiceSpokenText(text: string): string {
  return normalizeCoffeeMessageDelivery(text).spokenText;
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
