/** Exact, reusable non-voice audio categories. */
export const AUDIO_LIBRARY_BINS = ["music", "effects", "ambience"] as const;
export type AudioLibraryBin = (typeof AUDIO_LIBRARY_BINS)[number];

export type AudioLibraryClip = {
  id: string;
  label: string;
  description?: string;
  group: string;
  groupLabel: string;
  url: string;
  category: AudioLibraryBin;
  scope: "universal" | "theme" | "identity";
  status: "candidate" | "accepted" | "discarded";
  source: "generated" | "uploaded" | "legacy" | "prism";
  semanticRole: string;
  automaticTags: string[];
  playerTags: string[];
  context: Record<string, string>;
  safety: "nonsemantic" | "stage_cue_required";
  /** Optional size hint from the library API. */
  bytes?: number;
  durationMs: number | null;
  loopable: boolean;
  applet: string;
  provider: string | null;
  model: string | null;
  usageCount: number;
  usageRefs: Array<{
    version: 1;
    assetId: string;
    ownerType: string;
    ownerId: string;
    role: string;
    active: boolean;
    createdAt: string;
  }>;
  lastAccessedAt: string | null;
  readOnly: boolean;
};

export const AUDIO_LIBRARY_BIN_LABELS: Record<AudioLibraryBin, string> = {
  music: "Music",
  effects: "Effects",
  ambience: "Ambience",
};

export const AUDIO_LIBRARY_BIN_DESCRIPTIONS: Record<AudioLibraryBin, string> = {
  music: "Themes, investigation beds, musical cells, and stingers.",
  effects: "Reusable foley, interactions, materials, and one-shots.",
  ambience: "World beds, room stems, weather, and environmental emitters.",
};

/**
 * Static catalog is intentionally empty — Space Lens loads player-owned
 * synthesized/uploaded clips from `GET /api/audio-library`. Bundled runtime
 * foley must never be listed here.
 */
export const AUDIO_LIBRARY_SOUND_EFFECTS: readonly AudioLibraryClip[] = [];

/** @see AUDIO_LIBRARY_SOUND_EFFECTS */
export const AUDIO_LIBRARY_MUSIC: readonly AudioLibraryClip[] = [];

/** @see AUDIO_LIBRARY_SOUND_EFFECTS */
export const AUDIO_LIBRARY_AMBIENCE: readonly AudioLibraryClip[] = [];

/** Static helper for unit tests — live UI loads from `/api/audio-library`. */
export function audioLibraryClipsForBin(
  bin: AudioLibraryBin,
): readonly AudioLibraryClip[] {
  if (bin === "music") return AUDIO_LIBRARY_MUSIC;
  if (bin === "ambience") return AUDIO_LIBRARY_AMBIENCE;
  return AUDIO_LIBRARY_SOUND_EFFECTS;
}

export function filterAudioLibraryClips(
  clips: readonly AudioLibraryClip[],
  query: string,
): AudioLibraryClip[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...clips];
  return clips.filter((clip) => {
    const haystack = [
      clip.label,
      clip.description ?? "",
      clip.groupLabel,
      clip.url,
      clip.source,
      clip.scope,
      clip.semanticRole,
      clip.applet,
      ...clip.automaticTags,
      ...clip.playerTags,
      ...Object.values(clip.context),
    ].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}
