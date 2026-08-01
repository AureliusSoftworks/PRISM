/**
 * On-stage Debate evidence prop helpers.
 * Source documents render as small paper props; title/snippet live in the click drawer.
 */

/**
 * Stable tilt for a table prop. Seeded by evidence id so re-renders keep the
 * same resting angle (about −14°…+14°, never perfectly upright).
 */
export function debateEvidencePropRotationDeg(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unit = ((hash >>> 0) % 1000) / 1000;
  let degrees = -14 + unit * 28;
  if (Math.abs(degrees) < 3.5) {
    degrees = degrees <= 0 ? -6 : 6;
  }
  return Math.round(degrees * 10) / 10;
}
