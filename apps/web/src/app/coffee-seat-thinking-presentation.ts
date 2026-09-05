export function coffeeSeatThinkingPresentationActive(args: {
  showThinkingSpinner: boolean;
  isTalking: boolean;
  thinkingSpinnerDisabled: boolean;
}): boolean {
  return (
    args.showThinkingSpinner &&
    !args.isTalking &&
    !args.thinkingSpinnerDisabled
  );
}
