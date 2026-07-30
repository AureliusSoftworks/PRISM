"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  SlateMirrorBinding,
  SlateMirrorProfile,
  SlateMirrorProfileVersion,
  SlateMirrorVoiceCard,
} from "../../../../packages/shared/src/slateMirror.ts";
import styles from "./slateMirrorDesk.module.css";

interface MirrorProfileDetailResponse {
  profile: SlateMirrorProfile;
  versions: SlateMirrorProfileVersion[];
}

interface MirrorProfilesResponse {
  profiles: SlateMirrorProfile[];
}

interface MirrorBindingResponse {
  binding: SlateMirrorBinding | null;
  profile?: SlateMirrorProfile;
  profileVersion?: SlateMirrorProfileVersion;
}

interface MirrorPublishResponse {
  profile: SlateMirrorProfile;
  version: SlateMirrorProfileVersion;
}

interface SlateMirrorDeskProps {
  projectId: string;
  onClose: () => void;
  onPinned?: (binding: SlateMirrorBinding) => void;
}

interface ExerciseState {
  sample: string;
  description: string;
  dialogue: string;
  interiorityAction: string;
}

const EMPTY_EXERCISES: ExerciseState = {
  sample: "",
  description: "",
  dialogue: "",
  interiorityAction: "",
};

const VOICE_CARD_ROWS: ReadonlyArray<{
  key: Exclude<keyof SlateMirrorVoiceCard, "narrativeDistance">;
  label: string;
}> = [
  { key: "diction", label: "Diction" },
  { key: "rhythm", label: "Rhythm" },
  { key: "imagery", label: "Imagery" },
  { key: "dialogueHabits", label: "Dialogue" },
  { key: "exposition", label: "Exposition" },
  { key: "humor", label: "Humor" },
  { key: "density", label: "Density" },
  { key: "preferences", label: "Keep" },
  { key: "avoidances", label: "Avoid" },
  { key: "exemplars", label: "Voice marks" },
] as const;

async function mirrorRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || "Mirror could not complete that request.");
  }
  return body as T;
}

function shortVersionLabel(version: SlateMirrorProfileVersion): string {
  return `v${version.version}`;
}

export function SlateMirrorDesk({
  projectId,
  onClose,
  onPinned,
}: SlateMirrorDeskProps): React.JSX.Element {
  const [profiles, setProfiles] = useState<SlateMirrorProfile[]>([]);
  const [versions, setVersions] = useState<SlateMirrorProfileVersion[]>([]);
  const [selectedProfile, setSelectedProfile] =
    useState<SlateMirrorProfile | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [binding, setBinding] = useState<SlateMirrorBinding | null>(null);
  const [profileName, setProfileName] = useState("");
  const [penName, setPenName] = useState("");
  const [exercises, setExercises] =
    useState<ExerciseState>(EMPTY_EXERCISES);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [projectOverlay, setProjectOverlay] = useState("");
  const [povCharacterId, setPovCharacterId] = useState("");
  const [povLabel, setPovLabel] = useState("");
  const [povOverlay, setPovOverlay] = useState("");
  const [confirmRepin, setConfirmRepin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  );
  const isRepin = Boolean(
    binding &&
      selectedVersion &&
      binding.profileVersionId !== selectedVersion.id,
  );
  const exercisesReady = Object.values(exercises).every(
    (value) => value.trim().length >= 24,
  );

  async function openProfile(profile: SlateMirrorProfile): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const detail = await mirrorRequest<MirrorProfileDetailResponse>(
        `/api/slate/mirror/profiles/${encodeURIComponent(profile.id)}`,
      );
      setSelectedProfile(detail.profile);
      setVersions(detail.versions);
      setSelectedVersionId(
        detail.profile.currentVersionId ?? detail.versions[0]?.id ?? null,
      );
      setConfirmRepin(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Mirror profile could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      mirrorRequest<MirrorProfilesResponse>("/api/slate/mirror/profiles"),
      mirrorRequest<MirrorBindingResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/mirror`,
      ),
    ])
      .then(async ([profileResponse, bindingResponse]) => {
        if (!active) return;
        setProfiles(profileResponse.profiles);
        setBinding(bindingResponse.binding);
        if (bindingResponse.binding && bindingResponse.profile) {
          const detail = await mirrorRequest<MirrorProfileDetailResponse>(
            `/api/slate/mirror/profiles/${encodeURIComponent(bindingResponse.profile.id)}`,
          );
          if (!active) return;
          setSelectedProfile(detail.profile);
          setVersions(detail.versions);
          setSelectedVersionId(bindingResponse.binding.profileVersionId);
          setProjectOverlay(
            bindingResponse.binding.projectOverlay?.direction ?? "",
          );
          const firstPov = bindingResponse.binding.povOverlays[0];
          setPovCharacterId(firstPov?.povCharacterId ?? "");
          setPovLabel(firstPov?.label ?? "");
          setPovOverlay(firstPov?.direction ?? "");
        }
      })
      .catch((nextError: unknown) => {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Mirror could not be opened.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  async function synthesizeVoiceCard(): Promise<void> {
    if (!exercisesReady || !rightsConfirmed || !profileName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await mirrorRequest<{ profile: SlateMirrorProfile }>(
        "/api/slate/mirror/profiles",
        {
          method: "POST",
          body: JSON.stringify({
            name: profileName.trim(),
            penName: penName.trim() || null,
          }),
        },
      );
      const sample = (
        sourceKind:
          | "writer_owned_sample"
          | "description_exercise"
          | "dialogue_exercise"
          | "interiority_action_exercise",
        text: string,
      ) => ({
        sourceKind,
        text: text.trim(),
        explicitlyIncluded: true,
        writerOwnsRights: rightsConfirmed,
        containsThirdPartyMaterial: false,
      });
      const published = await mirrorRequest<MirrorPublishResponse>(
        `/api/slate/mirror/profiles/${encodeURIComponent(created.profile.id)}/versions`,
        {
          method: "POST",
          body: JSON.stringify({
            projectId,
            samples: [
              sample("writer_owned_sample", exercises.sample),
              sample("description_exercise", exercises.description),
              sample("dialogue_exercise", exercises.dialogue),
              sample(
                "interiority_action_exercise",
                exercises.interiorityAction,
              ),
            ],
          }),
        },
      );
      setSelectedProfile(published.profile);
      setVersions([published.version]);
      setSelectedVersionId(published.version.id);
      setProfiles((current) => [
        published.profile,
        ...current.filter((profile) => profile.id !== published.profile.id),
      ]);
      setExercises(EMPTY_EXERCISES);
      setRightsConfirmed(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Mirror could not synthesize the Voice Card.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleFrozen(): Promise<void> {
    if (!selectedProfile) return;
    setBusy(true);
    setError(null);
    try {
      const response = await mirrorRequest<{ profile: SlateMirrorProfile }>(
        `/api/slate/mirror/profiles/${encodeURIComponent(selectedProfile.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ frozen: !selectedProfile.frozen }),
        },
      );
      setSelectedProfile(response.profile);
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === response.profile.id ? response.profile : profile,
        ),
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Mirror profile could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function pinVersion(): Promise<void> {
    if (!selectedVersion || (isRepin && !confirmRepin)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await mirrorRequest<MirrorBindingResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/mirror`,
        {
          method: "PATCH",
          body: JSON.stringify({
            profileVersionId: selectedVersion.id,
            projectOverlay: projectOverlay.trim()
              ? {
                  label: "Project voice",
                  direction: projectOverlay.trim(),
                }
              : null,
            povOverlays:
              povCharacterId.trim() && povLabel.trim() && povOverlay.trim()
                ? [
                    {
                      label: povLabel.trim(),
                      povCharacterId: povCharacterId.trim(),
                      direction: povOverlay.trim(),
                    },
                  ]
                : [],
            repin: isRepin,
            expectedCurrentVersionId: binding?.profileVersionId ?? null,
          }),
        },
      );
      if (!response.binding) {
        throw new Error("Mirror did not return the project binding.");
      }
      setBinding(response.binding);
      setConfirmRepin(false);
      onPinned?.(response.binding);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Mirror could not pin this Voice Card.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="slate-mirror-title"
    >
      <div className={styles.desk}>
        <header className={styles.topbar}>
          <div>
            <span>Focused desk</span>
            <h1 id="slate-mirror-title">Mirror</h1>
          </div>
          <p>Voice and prose density, never output length.</p>
          <button type="button" onClick={onClose} aria-label="Close Mirror">
            Done
          </button>
        </header>

        {error ? (
          <div className={styles.error} role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        <aside className={styles.rail} aria-label="Mirror profiles">
          <div className={styles.railHeading}>
            <span>Pen voices</span>
            <strong>{profiles.length}</strong>
          </div>
          <button
            type="button"
            className={styles.newProfile}
            data-active={!selectedProfile ? "true" : undefined}
            onClick={() => {
              setSelectedProfile(null);
              setVersions([]);
              setSelectedVersionId(null);
            }}
          >
            <span>＋</span>
            Shape a new voice
          </button>
          <nav>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                data-active={
                  selectedProfile?.id === profile.id ? "true" : undefined
                }
                onClick={() => void openProfile(profile)}
              >
                <strong>{profile.penName || profile.name}</strong>
                <span>
                  {profile.penName ? profile.name : "Account voice"}
                  {profile.frozen ? " · Frozen" : ""}
                </span>
              </button>
            ))}
          </nav>
          <p>
            Projects pin an exact Voice Card version. Improving an account
            voice never changes a book behind your back.
          </p>
        </aside>

        <main className={styles.main}>
          {loading ? (
            <div className={styles.loading}>
              <span />
              <p>Opening the desk…</p>
            </div>
          ) : selectedProfile && selectedVersion ? (
            <div className={styles.voiceWorkspace}>
              <header className={styles.voiceHeader}>
                <div>
                  <span>{selectedProfile.name}</span>
                  <h2>{selectedProfile.penName || "Voice Card"}</h2>
                </div>
                <div className={styles.versionPicker}>
                  <span>Version</span>
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      aria-pressed={version.id === selectedVersion.id}
                      data-active={
                        version.id === selectedVersion.id ? "true" : undefined
                      }
                      onClick={() => {
                        setSelectedVersionId(version.id);
                        setConfirmRepin(false);
                      }}
                    >
                      {shortVersionLabel(version)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.freeze}
                  disabled={busy}
                  aria-pressed={selectedProfile.frozen}
                  onClick={() => void toggleFrozen()}
                >
                  {selectedProfile.frozen ? "Frozen" : "Freeze voice"}
                </button>
              </header>

              <article className={styles.voiceCard}>
                <div className={styles.distance}>
                  <span>Narrative distance</span>
                  <p>{selectedVersion.voiceCard.narrativeDistance}</p>
                </div>
                <dl>
                  {VOICE_CARD_ROWS.map(({ key, label }) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        {selectedVersion.voiceCard[key].length
                          ? selectedVersion.voiceCard[key].join(" · ")
                          : "No strong signal yet"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>

              <section className={styles.projectFit}>
                <header>
                  <span>Project overlay</span>
                  <p>
                    Refine this book without changing the account voice. Scope
                    and word targets stay with the Director.
                  </p>
                </header>
                <label>
                  <span>For this project</span>
                  <textarea
                    rows={3}
                    value={projectOverlay}
                    placeholder="Keep the restraint, but let machinery and drought shape the imagery…"
                    onChange={(event) => setProjectOverlay(event.target.value)}
                  />
                </label>
                <details>
                  <summary>Optional POV layer</summary>
                  <div className={styles.povFields}>
                    <label>
                      <span>Character id</span>
                      <input
                        value={povCharacterId}
                        placeholder="mara-vale"
                        onChange={(event) =>
                          setPovCharacterId(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>POV label</span>
                      <input
                        value={povLabel}
                        placeholder="Mara"
                        onChange={(event) => setPovLabel(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>What shifts in this POV?</span>
                      <textarea
                        rows={2}
                        value={povOverlay}
                        placeholder="She notices weight, pressure, and what hands conceal…"
                        onChange={(event) => setPovOverlay(event.target.value)}
                      />
                    </label>
                  </div>
                </details>
                {isRepin ? (
                  <label className={styles.repin}>
                    <input
                      type="checkbox"
                      checked={confirmRepin}
                      onChange={(event) =>
                        setConfirmRepin(event.target.checked)
                      }
                    />
                    <span>
                      Replace this project’s pinned{" "}
                      {binding ? "Voice Card" : "version"} with{" "}
                      {shortVersionLabel(selectedVersion)}.
                    </span>
                  </label>
                ) : null}
                <button
                  type="button"
                  className={styles.pin}
                  disabled={busy || (isRepin && !confirmRepin)}
                  onClick={() => void pinVersion()}
                >
                  {busy
                    ? "Saving…"
                    : binding?.profileVersionId === selectedVersion.id
                      ? "Update project overlay"
                      : isRepin
                        ? "Replace pinned Voice Card"
                        : "Use for this project"}
                </button>
              </section>
            </div>
          ) : (
            <div className={styles.setup}>
              <header>
                <span>Quick setup</span>
                <h2>Write four small things.</h2>
                <p>
                  Mirror reads how you answer—not what genre you choose. These
                  samples create an inspectable Voice Card you can revise,
                  freeze, or ignore.
                </p>
              </header>
              <div className={styles.identity}>
                <label>
                  <span>Voice name</span>
                  <input
                    value={profileName}
                    placeholder="Lyrical restraint"
                    onChange={(event) => setProfileName(event.target.value)}
                  />
                </label>
                <label>
                  <span>Pen name · optional</span>
                  <input
                    value={penName}
                    placeholder="M. Vale"
                    onChange={(event) => setPenName(event.target.value)}
                  />
                </label>
              </div>
              <div className={styles.exercises}>
                <label>
                  <span>
                    <strong>01</strong>
                    A piece of your writing
                  </span>
                  <small>Something you own that sounds unmistakably like you.</small>
                  <textarea
                    rows={5}
                    value={exercises.sample}
                    placeholder="Paste a compact passage…"
                    onChange={(event) =>
                      setExercises((current) => ({
                        ...current,
                        sample: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>
                    <strong>02</strong>
                    Description
                  </span>
                  <small>Describe a place just after someone has left it.</small>
                  <textarea
                    rows={5}
                    value={exercises.description}
                    placeholder="The cup was still warm…"
                    onChange={(event) =>
                      setExercises((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>
                    <strong>03</strong>
                    Dialogue
                  </span>
                  <small>
                    Two people want the same thing but cannot name it.
                  </small>
                  <textarea
                    rows={5}
                    value={exercises.dialogue}
                    placeholder="Write the exchange…"
                    onChange={(event) =>
                      setExercises((current) => ({
                        ...current,
                        dialogue: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>
                    <strong>04</strong>
                    Interiority in action
                  </span>
                  <small>
                    A character performs a simple task while avoiding a thought.
                  </small>
                  <textarea
                    rows={5}
                    value={exercises.interiorityAction}
                    placeholder="Let the action carry the thought…"
                    onChange={(event) =>
                      setExercises((current) => ({
                        ...current,
                        interiorityAction: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <footer className={styles.setupFooter}>
                <label>
                  <input
                    type="checkbox"
                    checked={rightsConfirmed}
                    onChange={(event) =>
                      setRightsConfirmed(event.target.checked)
                    }
                  />
                  <span>
                    I wrote these samples and want Mirror to use them.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !profileName.trim() ||
                    !rightsConfirmed ||
                    !exercisesReady
                  }
                  onClick={() => void synthesizeVoiceCard()}
                >
                  {busy ? "Listening for your voice…" : "Create Voice Card"}
                </button>
              </footer>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
