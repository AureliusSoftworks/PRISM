const AUTO_MODEL_CHOICE = "auto";

/**
 * Zen/Chat prompt shortcuts are text macros, so they follow the model shown in
 * the active header. Sandbox keeps the Command Center's dedicated run model.
 */
export function promptShortcutModelChoiceForSurface(
  surface: string,
  commandCenterPreferredModel: string
): string {
  if (surface !== "sandbox") return AUTO_MODEL_CHOICE;
  const preferredModel = commandCenterPreferredModel.trim();
  return preferredModel || AUTO_MODEL_CHOICE;
}
