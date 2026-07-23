export const COFFEE_ACCOUNT_DEFAULT_MODEL_LABEL = "Account default";

export const COFFEE_ACCOUNT_DEFAULT_MODEL_META =
  "uses the model saved in Settings";

export function coffeeModelPickerAriaLabel(
  provider: "local" | "online" | "auto",
): string {
  if (provider === "auto") {
    return "Coffee session primary model for Auto replies. Includes all local and online models; Account default uses the model saved in Settings.";
  }
  return `Coffee session model for ${provider} replies. Account default uses the model saved in Settings.`;
}
