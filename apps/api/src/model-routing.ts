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

/** API resolver adds the same pricing catalog used by Usage reporting. */
export function resolveAutoModel(input: ResolveAutoModelInput): ResolvedAutoModel {
  return resolveSharedAutoModel({
    ...input,
    priceForModel:
      input.priceForModel ??
      ((provider, modelId) => routingTextPriceForModel(provider, modelId)),
  });
}
