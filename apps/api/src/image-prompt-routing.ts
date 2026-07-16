import { composeVerbatimFirstImagePrompt } from "@localai/shared";

export interface ImagePromptRoutingOptions {
  prompt: string;
  origin: string;
  sourceEditPrompt?: string;
  useSourceEdit?: boolean;
  botName?: string | null;
  botSystemPrompt?: string | null;
}

/**
 * Signal already authors complete persona-first art direction. Appending the
 * host's full persona again can make an edit reinterpret the set, so Signal
 * prompts stay verbatim. Other bot-owned image requests retain the lightweight
 * persona hint used by the Images panel.
 */
export function resolveImagePromptForGeneration(
  options: ImagePromptRoutingOptions,
): string {
  const prompt = options.prompt.trim();
  if (options.origin === "botcast") {
    const sourceEditPrompt = options.sourceEditPrompt?.trim() ?? "";
    return options.useSourceEdit && sourceEditPrompt ? sourceEditPrompt : prompt;
  }
  return composeVerbatimFirstImagePrompt({
    userPrompt: prompt,
    botName: options.botName,
    systemPrompt: options.botSystemPrompt,
    mode: "strict_verbatim",
  });
}
