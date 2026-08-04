export const COFFEE_AUTO_MODEL_LABEL = "Auto";

export const COFFEE_AUTO_MODEL_META =
  "Prism chooses the model and Effort contextually";

export function coffeeModelPickerAriaLabel(
  provider: "local" | "online" | "auto",
): string {
  if (provider === "auto") {
    return "Coffee session model. Auto lets Prism choose the model and Effort inside the selected privacy lane.";
  }
  return `Coffee session model for ${provider} replies. Auto lets Prism choose the model and Effort contextually.`;
}
