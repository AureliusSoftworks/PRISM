type AskQuestionDisplayPayload = {
  prompt: string;
  options: readonly { label: string }[];
};

function normalizePromptFragment(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rejects legacy fallback payloads that split a conversational question at
 * its framing comma and then at an incidental "or" inside the question.
 */
export function askQuestionOptionsArePromptFragments(
  displayContent: string,
  askQuestion: AskQuestionDisplayPayload,
): boolean {
  const prompt = askQuestion.prompt.includes("?")
    ? askQuestion.prompt
    : displayContent;
  const commaIndex = prompt.indexOf(",");
  if (commaIndex < 0 || askQuestion.options.length < 2) return false;

  const leadingClause = normalizePromptFragment(prompt.slice(0, commaIndex));
  const firstOption = normalizePromptFragment(
    askQuestion.options[0]?.label ?? "",
  );
  if (!leadingClause || firstOption !== leadingClause) return false;

  const remainder = prompt.slice(commaIndex + 1);
  if (!/\sor\s/i.test(` ${remainder} `)) return false;

  const normalizedPrompt = normalizePromptFragment(prompt);
  let nextMatchIndex = 0;
  for (const option of askQuestion.options) {
    const label = normalizePromptFragment(option.label);
    if (!label) return false;
    const matchIndex = normalizedPrompt.indexOf(label, nextMatchIndex);
    if (matchIndex < 0) return false;
    nextMatchIndex = matchIndex + label.length;
  }
  return true;
}
