type FontLoader = Pick<FontFaceSet, "load">;
type FontProbe = {
  status: "pending" | "loaded" | "unavailable";
  settled: Promise<void>;
};

const probesByFontSet = new WeakMap<FontLoader, Map<string, FontProbe>>();
const MAX_PROBES = 256;

/**
 * A real authored-font load, shared across mouths, eyes, and effect restarts.
 * Do not use FontFaceSet.check: fallback fonts can pass it, and WebKit can
 * throw while parsing an otherwise usable font shorthand.
 */
export function requestPhosphorFontProbe(
  fonts: FontLoader,
  font: string,
  text: string,
): FontProbe {
  let probes = probesByFontSet.get(fonts);
  if (!probes) {
    probes = new Map();
    probesByFontSet.set(fonts, probes);
  }
  const key = JSON.stringify([font, text]);
  const existing = probes.get(key);
  if (existing) return existing;
  const probe: FontProbe = { status: "pending", settled: Promise.resolve() };
  // Start immediately, but preserve visible fallback even on synchronous
  // parser failure. A rejected probe is retried by a later effect/mount.
  try {
    probe.settled = fonts.load(font, text).then(
      () => { probe.status = "loaded"; },
      () => {
        probe.status = "unavailable";
        if (probes.get(key) === probe) probes.delete(key);
      },
    );
  } catch {
    probe.status = "unavailable";
    return probe;
  }
  if (probes.size >= MAX_PROBES) probes.delete(probes.keys().next().value!);
  probes.set(key, probe);
  return probe;
}
