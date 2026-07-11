import type { EnglishVoiceEngine } from "@localai/shared";

export function coffeePlayerEnglishEngine(args: {
  accountProvider: "local" | "openai" | "anthropic";
  coffeeProvider: "local" | "openai" | "anthropic";
  offlineProtectedBotPresent: boolean;
  selectedEngine: EnglishVoiceEngine;
}): EnglishVoiceEngine {
  return args.accountProvider === "local" ||
    args.coffeeProvider === "local" ||
    args.offlineProtectedBotPresent
    ? "builtin"
    : args.selectedEngine;
}
