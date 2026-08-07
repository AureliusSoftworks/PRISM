/**
 * Space Lens audio bins — synthesized or uploaded clips only.
 * Bundled runtime foley under the web public audio tree is product
 * infrastructure and must never appear here.
 */

export type AudioLibraryBin = "sound_effects" | "music";

export type AudioLibraryClip = {
  id: string;
  label: string;
  group: string;
  groupLabel: string;
  url: string;
  source: "synthesized" | "uploaded";
  /** Optional size hint from the library API. */
  bytes?: number;
};

export const AUDIO_LIBRARY_BIN_LABELS: Record<AudioLibraryBin, string> = {
  sound_effects: "Sound Effects",
  music: "Music",
};

/**
 * Static catalog is intentionally empty — Space Lens loads player-owned
 * synthesized/uploaded clips from `GET /api/audio-library`. Bundled runtime
 * foley must never be listed here.
 */
export const AUDIO_LIBRARY_SOUND_EFFECTS: readonly AudioLibraryClip[] = [];

/** @see AUDIO_LIBRARY_SOUND_EFFECTS */
export const AUDIO_LIBRARY_MUSIC: readonly AudioLibraryClip[] = [];

/** Static helper for unit tests — live UI loads from `/api/audio-library`. */
export function audioLibraryClipsForBin(
  bin: AudioLibraryBin,
): readonly AudioLibraryClip[] {
  return bin === "music" ? AUDIO_LIBRARY_MUSIC : AUDIO_LIBRARY_SOUND_EFFECTS;
}

export function filterAudioLibraryClips(
  clips: readonly AudioLibraryClip[],
  query: string,
): AudioLibraryClip[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...clips];
  return clips.filter((clip) => {
    const haystack =
      `${clip.label} ${clip.groupLabel} ${clip.url} ${clip.source}`.toLowerCase();
    return haystack.includes(needle);
  });
}
