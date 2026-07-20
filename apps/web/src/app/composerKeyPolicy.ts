export interface ComposerKeyPolicyInput {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
}

/** Enter submits; Shift+Enter stays multiline and IME confirmation stays local. */
export function shouldSubmitComposerOnEnter({
  key,
  shiftKey,
  isComposing = false,
}: ComposerKeyPolicyInput): boolean {
  return key === "Enter" && !shiftKey && !isComposing;
}
