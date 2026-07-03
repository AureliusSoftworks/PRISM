export interface BotProfileEditorGateInput {
  draftName: string;
  editingBotId?: string | null;
  editingBotName?: string | null;
  editingOriginalName?: string | null;
}

export function botProfileDetailsUnlocked(input: BotProfileEditorGateInput): boolean {
  return input.draftName.trim().length > 0 || Boolean(input.editingBotId);
}

export function botProfileReferenceName(input: BotProfileEditorGateInput): string {
  const draftName = input.draftName.trim();
  if (draftName.length > 0) return draftName;
  if (!input.editingBotId) return "";
  return input.editingOriginalName?.trim() || input.editingBotName?.trim() || "";
}
