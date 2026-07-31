import {
  applyPromptShortcutVarPassthrough,
  promptContainsPassthroughBuiltInPromptWildcards,
  type PromptShortcutWildcardReplacement,
} from "@localai/shared";

export interface PromptShortcutVarPassthroughResolution {
  prompt: string;
  replacements: PromptShortcutWildcardReplacement[];
  /** Captured trailing text when the body contains `{VAR}`; otherwise null. */
  passthrough: string | null;
  /** When true, skip appending the trailing draft slice after the expanded body. */
  consumeTrailing: boolean;
}

/**
 * Fills `{VAR}` from text typed after a `/prompt`, and signals that the trailing
 * slice must be consumed so it is not appended again after the template.
 */
export function resolvePromptShortcutBodyVarPassthrough(
  bodyAfterLocalRandomization: string,
  trailingAfterCommand: string,
  existingReplacements: readonly PromptShortcutWildcardReplacement[] = []
): PromptShortcutVarPassthroughResolution {
  if (
    !promptContainsPassthroughBuiltInPromptWildcards(bodyAfterLocalRandomization)
  ) {
    return {
      prompt: bodyAfterLocalRandomization,
      replacements: [...existingReplacements],
      passthrough: null,
      consumeTrailing: false,
    };
  }
  const passthrough = trailingAfterCommand.replace(/^\s+/u, "");
  const applied = applyPromptShortcutVarPassthrough(
    bodyAfterLocalRandomization,
    passthrough,
    { existingReplacements }
  );
  return {
    prompt: applied.prompt,
    replacements: applied.replacements,
    passthrough,
    consumeTrailing: true,
  };
}

/** Clear any leftover `{VAR}` tokens (e.g. typed without a `/prompt`). */
export function clearLeftoverPromptShortcutVarPassthrough(
  source: string,
  existingReplacements: readonly PromptShortcutWildcardReplacement[] = []
): {
  prompt: string;
  replacements: PromptShortcutWildcardReplacement[];
} {
  const applied = applyPromptShortcutVarPassthrough(source, "", {
    existingReplacements,
  });
  return {
    prompt: applied.prompt,
    replacements: applied.replacements,
  };
}
