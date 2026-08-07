import { hexToHsl } from "@localai/shared";
import { PRISM_BRAND_COLORS } from "./prismBrand.ts";

/**
 * Cast hue-lens track follows P → R → I → S → M top-to-bottom.
 * Logical slider 0 = top / P; 359 = bottom / M. Each fifth of the track maps
 * to that letter’s brand hue so the thumb’s band matches the bots that rise
 * to the top of the grid.
 *
 * Native vertical range inputs (writing-mode: vertical-lr + direction: rtl)
 * put max at the top, so {@link debateCastLensSliderInputValue} flips the
 * value for the DOM control.
 */
export const DEBATE_CAST_LENS_PRISM_HUES = [
  hexToHsl(PRISM_BRAND_COLORS.p).h,
  hexToHsl(PRISM_BRAND_COLORS.r).h,
  hexToHsl(PRISM_BRAND_COLORS.i).h,
  hexToHsl(PRISM_BRAND_COLORS.s).h,
  hexToHsl(PRISM_BRAND_COLORS.m).h,
] as const;

/** Vertical native range: max sits at the top of the track. */
const DEBATE_CAST_LENS_NATIVE_VERTICAL_FLIP = true;

function circularHueDistance(left: number, right: number): number {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

function flipNativeVerticalSlider(sliderValue: number): number {
  return DEBATE_CAST_LENS_NATIVE_VERTICAL_FLIP ? 359 - sliderValue : sliderValue;
}

/** Map logical lens position (0 at top / P … 359 at bottom / M) to hue. */
export function debateCastHueFromLensSlider(sliderValue: number): number {
  const hues = DEBATE_CAST_LENS_PRISM_HUES;
  const clamped = Math.max(0, Math.min(359, sliderValue));
  const segmentWidth = 360 / hues.length;
  const index = Math.min(hues.length - 1, Math.floor(clamped / segmentWidth));
  return hues[index]!;
}

/** Inverse of {@link debateCastHueFromLensSlider} for logical slider positions. */
export function debateCastLensSliderFromHue(hue: number): number {
  const hues = DEBATE_CAST_LENS_PRISM_HUES;
  const wrapped = ((hue % 360) + 360) % 360;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hues.length; i += 1) {
    const distance = circularHueDistance(wrapped, hues[i]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  const segmentWidth = 360 / hues.length;
  return Math.round(bestIndex * segmentWidth + segmentWidth / 2);
}

/** Controlled `input[type=range]` value for the vertical cast lens. */
export function debateCastLensSliderInputValue(hue: number | null): number {
  const logical = hue === null ? 180 : debateCastLensSliderFromHue(hue);
  return flipNativeVerticalSlider(logical);
}

/** Hue from a vertical cast-lens `input[type=range]` change event. */
export function debateCastHueFromLensSliderInput(inputValue: number): number {
  return debateCastHueFromLensSlider(flipNativeVerticalSlider(inputValue));
}
