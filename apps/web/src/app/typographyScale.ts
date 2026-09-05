import {
  normalizePrismTypographyScale,
  PRISM_TYPOGRAPHY_SCALE_ROOT_PX,
  type PrismTypographyScale,
} from "@localai/shared";

export const PRISM_TYPOGRAPHY_SCALE_LABELS: Readonly<
  Record<PrismTypographyScale, { label: string; detail: string }>
> = {
  compact: {
    label: "Compact",
    detail: "More room for dense tools and smaller displays.",
  },
  small: {
    label: "Small",
    detail: "A modest step below the standard reading size.",
  },
  standard: {
    label: "Standard",
    detail: "PRISM's current size and the account default.",
  },
  large: {
    label: "Large",
    detail: "More comfortable reading with careful reflow.",
  },
  "extra-large": {
    label: "Extra large",
    detail: "Maximum legibility with the most text wrapping.",
  },
};

export function applyPrismTypographyScaleToDocument(
  target: { documentElement: { dataset: Record<string, string | undefined> } },
  value: unknown,
): PrismTypographyScale {
  const typographyScale = normalizePrismTypographyScale(value);
  target.documentElement.dataset.prismTypographyScale = typographyScale;
  return typographyScale;
}

export function prismTypographyScalePreviewPx(
  value: PrismTypographyScale,
): number {
  return PRISM_TYPOGRAPHY_SCALE_ROOT_PX[value];
}
