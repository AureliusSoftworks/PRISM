export {
  REQUIRED_LOCAL_MODELS,
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
  DISABLED_MODEL_CHOICE,
  MODEL_VISIBILITY_DEFAULTS_VERSION,
  defaultHiddenModelIdsForCatalog,
  isDisabledModelChoice,
  reconcileHiddenModelIdsForCatalog,
  sanitizeHiddenModelIds,
} from "@localai/shared";
export type { ResolvedAutoModel } from "@localai/shared";

import {
  resolveAutoModel as resolveSharedAutoModel,
  type ResolveAutoModelInput,
  type ResolvedAutoModel,
} from "@localai/shared";
import { routingTextPriceForModel } from "./usage.ts";

/** Adds the Settings-owned presentation flag without changing Auto inputs. */
export function catalogWithGlobalPickerVisibility<
  TLocal extends { id: string },
  TOnline extends { id: string },
  TRest extends object,
>(
  catalog: TRest & {
    local: readonly TLocal[];
    online: readonly TOnline[];
  },
  hiddenModelIds: readonly string[],
) {
  const hidden = new Set(hiddenModelIds.map((id) => id.trim()).filter(Boolean));
  return {
    ...catalog,
    local: catalog.local.map((entry) => ({
      ...entry,
      showInGlobalPicker: !hidden.has(entry.id),
    })),
    online: catalog.online.map((entry) => ({
      ...entry,
      showInGlobalPicker: !hidden.has(entry.id),
    })),
  };
}

/** API resolver adds the same pricing catalog used by Usage reporting. */
export function resolveAutoModel(input: ResolveAutoModelInput): ResolvedAutoModel {
  return resolveSharedAutoModel({
    ...input,
    priceForModel:
      input.priceForModel ??
      ((provider, modelId) => routingTextPriceForModel(provider, modelId)),
  });
}
