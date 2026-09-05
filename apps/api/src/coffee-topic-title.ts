import {
  cleanGeneratedCoffeeTopicTitle,
  heuristicCoffeeTopicTitle,
  isCleanCoffeeTopicTitle,
} from "@localai/shared";
import type { LlmProvider } from "./providers.ts";
import { recordDeveloperTranscriptEvent } from "./usage.ts";

const COFFEE_TOPIC_TITLE_INFER_MAX_TOKENS = 80;
const COFFEE_TOPIC_TITLE_INFER_TEMPERATURE = 0.2;

const COFFEE_TOPIC_TITLE_SYSTEM = [
  "You write short Coffee table titles.",
  "Return JSON only: {\"title\":\"...\"}.",
  "The title must be 2 to 8 words, Title Case or ordinary headline case.",
  "Name the subject, not the instruction. Keep proper names.",
  "No quotes, no question marks, no 'Ask', no 'Topic:', no trailing punctuation.",
  'Example: "Ask Harry Potter, what is the most memorable part of your story so far?" → "Harry Potter\'s Most Memorable Moment".',
].join(" ");

/**
 * Ask the auxiliary model for a short display title.
 * Already-clean seeds skip the model and stay as local cleanup.
 */
export async function summarizeCoffeeTopicTitle(args: {
  topic: string;
  provider: LlmProvider;
  model?: string | null;
}): Promise<string | null> {
  const topic = args.topic.replace(/\s+/gu, " ").trim();
  if (!topic) return null;
  if (isCleanCoffeeTopicTitle(topic, topic)) {
    return heuristicCoffeeTopicTitle(topic) || topic;
  }

  try {
    const raw = await args.provider.generateResponse(
      [
        { role: "system", content: COFFEE_TOPIC_TITLE_SYSTEM },
        { role: "user", content: `Opening prompt:\n${topic}` },
      ],
      {
        model: args.model ?? undefined,
        temperature: COFFEE_TOPIC_TITLE_INFER_TEMPERATURE,
        maxTokens: COFFEE_TOPIC_TITLE_INFER_MAX_TOKENS,
        jsonMode: true,
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["title"],
          properties: {
            title: { type: "string", minLength: 4, maxLength: 60 },
          },
        },
        jsonSchemaName: "coffee_topic_title",
        usagePurpose: "conversation_title",
      },
    );
    const title = cleanGeneratedCoffeeTopicTitle(raw, topic);
    recordDeveloperTranscriptEvent({
      kind: "tool",
      purpose: "conversation_title",
      provider: args.provider.name,
      model: args.model ?? args.provider.diagnosticModel ?? null,
      request: { topic },
      rawOutput: raw,
      parsedOutput: { title },
      streaming: false,
      fallback: title == null,
    });
    return title;
  } catch {
    return null;
  }
}

/** Persistable session title: model summary when available, else the local fallback. */
export async function persistableCoffeeTopicTitle(args: {
  topic: string;
  fallbackTitle: string;
  provider?: LlmProvider | null;
  model?: string | null;
}): Promise<string> {
  if (!args.provider) return args.fallbackTitle;
  const summarized = await summarizeCoffeeTopicTitle({
    topic: args.topic,
    provider: args.provider,
    model: args.model,
  });
  return summarized || args.fallbackTitle;
}
