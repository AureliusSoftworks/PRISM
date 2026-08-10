export const PRISM_TYPOGRAPHY_SCALE_VALUES = [
  "compact",
  "small",
  "standard",
  "large",
  "extra-large",
] as const;

export type PrismTypographyScale =
  (typeof PRISM_TYPOGRAPHY_SCALE_VALUES)[number];

/** Standard intentionally preserves PRISM's existing 16px root size. */
export const DEFAULT_PRISM_TYPOGRAPHY_SCALE: PrismTypographyScale = "standard";

export const PRISM_TYPOGRAPHY_SCALE_ROOT_PX: Readonly<
  Record<PrismTypographyScale, number>
> = {
  compact: 14,
  small: 15,
  standard: 16,
  large: 17,
  "extra-large": 18,
};

export function isPrismTypographyScale(
  value: unknown,
): value is PrismTypographyScale {
  return (
    typeof value === "string" &&
    (PRISM_TYPOGRAPHY_SCALE_VALUES as readonly string[]).includes(value)
  );
}

export function normalizePrismTypographyScale(
  value: unknown,
  fallback: PrismTypographyScale = DEFAULT_PRISM_TYPOGRAPHY_SCALE,
): PrismTypographyScale {
  return isPrismTypographyScale(value) ? value : fallback;
}
