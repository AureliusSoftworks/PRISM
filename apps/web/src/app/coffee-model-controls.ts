export const COFFEE_ACCOUNT_DEFAULT_MODEL_LABEL = "Account default";

export const COFFEE_ACCOUNT_DEFAULT_MODEL_META =
  "uses the model saved in Settings";

export function coffeeModelPickerAriaLabel(
  provider: "local" | "online",
): string {
  return `Coffee session model for ${provider} replies. Account default uses the model saved in Settings.`;
}
