export const BOT_BATCH_MIXED_VALUE = "__prism_batch_mixed__";
export const BOT_BATCH_MIXED_LABEL = "Multiple selected";

export type BotBatchEditField =
  | "color"
  | "glyph"
  | "localModel"
  | "onlineModel"
  | "localImageModel"
  | "openaiImageModel";

export interface BotBatchEditValues {
  color: string;
  glyph: string;
  localModel: string;
  onlineModel: string;
  localImageModel: string;
  openaiImageModel: string;
}

export type BotBatchEditFieldState =
  | { kind: "same"; value: string }
  | { kind: "mixed"; value: null };

export type BotBatchEditState = Record<BotBatchEditField, BotBatchEditFieldState>;
export type BotBatchEditDraft = Partial<Record<BotBatchEditField, string>>;
export type BotBatchEditPatch = Partial<Record<BotBatchEditField, string>>;

export const BOT_BATCH_EDIT_FIELDS: readonly BotBatchEditField[] = [
  "color",
  "glyph",
  "localModel",
  "onlineModel",
  "localImageModel",
  "openaiImageModel",
];

function fieldStateForValues(values: readonly string[]): BotBatchEditFieldState {
  if (values.length === 0) return { kind: "same", value: "" };
  const first = values[0] ?? "";
  return values.every((value) => value === first)
    ? { kind: "same", value: first }
    : { kind: "mixed", value: null };
}

export function resolveBotBatchEditState(
  values: readonly BotBatchEditValues[]
): BotBatchEditState {
  return {
    color: fieldStateForValues(values.map((value) => value.color)),
    glyph: fieldStateForValues(values.map((value) => value.glyph)),
    localModel: fieldStateForValues(values.map((value) => value.localModel)),
    onlineModel: fieldStateForValues(values.map((value) => value.onlineModel)),
    localImageModel: fieldStateForValues(values.map((value) => value.localImageModel)),
    openaiImageModel: fieldStateForValues(values.map((value) => value.openaiImageModel)),
  };
}

export function batchFieldDisplayValue(
  state: BotBatchEditFieldState,
  draftValue: string | undefined
): string {
  if (draftValue !== undefined) return draftValue;
  return state.kind === "same" ? state.value : BOT_BATCH_MIXED_VALUE;
}

export function batchFieldDisplayLabel(
  state: BotBatchEditFieldState,
  draftValue: string | undefined,
  fallbackLabel = ""
): string {
  if (draftValue !== undefined) return draftValue;
  if (state.kind === "same") return state.value || fallbackLabel;
  return BOT_BATCH_MIXED_LABEL;
}

export function buildBotBatchEditPatch(
  state: BotBatchEditState,
  draft: BotBatchEditDraft
): BotBatchEditPatch {
  const patch: BotBatchEditPatch = {};
  for (const field of BOT_BATCH_EDIT_FIELDS) {
    const draftValue = draft[field];
    if (draftValue === undefined) continue;
    const fieldState = state[field];
    if (fieldState.kind === "same" && draftValue === fieldState.value) continue;
    patch[field] = draftValue;
  }
  return patch;
}

export function botBatchEditPatchHasFields(patch: BotBatchEditPatch): boolean {
  return Object.keys(patch).length > 0;
}
