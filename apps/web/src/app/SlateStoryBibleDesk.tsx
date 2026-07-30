"use client";

import { useMemo, useState } from "react";
import type {
  SlateCharacterArc,
  SlateCharacterProfile,
  SlateNarrativeThread,
} from "../../../../packages/shared/src/slateStoryBible";
import type { SlateMomentumSnapshot } from "../../../../packages/shared/src/slateCreativeStudios";
import type { SlateReviewStoryBibleV1 } from "../../../../packages/shared/src/slateReviewExport";
import styles from "./slateStoryBibleDesk.module.css";

type SlateStoryBibleDeskTab =
  | "cast"
  | "arcs"
  | "threads"
  | "timeline"
  | "world";

export interface SlateStoryBibleDeskData {
  projectId: string;
  seriesId: string;
  activeGeneration: number;
  storyBible: SlateReviewStoryBibleV1;
  momentum: SlateMomentumSnapshot;
}

interface SlateStoryBibleDeskProps {
  data: SlateStoryBibleDeskData | null;
  loading: boolean;
  onUpdateCharacterField?: (
    profileId: string,
    field: SlateCharacterEditableField,
    value: string | string[],
    writerLocked: boolean,
  ) => Promise<void>;
  onUpdateIntendedArc?: (
    profileId: string,
    input: {
      startState: string;
      destinationState: string;
      writerLocked: boolean;
    },
  ) => Promise<void>;
}

export type SlateCharacterEditableField =
  | "publicPersona"
  | "privatePressure"
  | "wants"
  | "needs"
  | "secrets"
  | "currentState";

const CHARACTER_FIELD_OPTIONS: ReadonlyArray<{
  id: SlateCharacterEditableField;
  label: string;
  list: boolean;
}> = [
  { id: "publicPersona", label: "Public face", list: false },
  { id: "privatePressure", label: "Private pressure", list: false },
  { id: "wants", label: "Wants", list: true },
  { id: "needs", label: "Needs", list: true },
  { id: "secrets", label: "Secrets", list: true },
  { id: "currentState", label: "Current state", list: false },
];

const EMPTY_STORY_BIBLE: SlateReviewStoryBibleV1 = {
  characters: [],
  arcs: [],
  threads: [],
  timeline: [],
  causalEdges: [],
  relationships: [],
  knowledge: [],
  world: [],
  concerns: [],
};

function listText(values: string[]): string {
  return values.filter(Boolean).join(" · ") || "Not established yet";
}

function CharacterCard({
  character,
  onUpdate,
}: {
  character: SlateCharacterProfile;
  onUpdate?: SlateStoryBibleDeskProps["onUpdateCharacterField"];
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [field, setField] =
    useState<SlateCharacterEditableField>("privatePressure");
  const [draft, setDraft] = useState(character.privatePressure.value);
  const [writerLocked, setWriterLocked] = useState(
    character.privatePressure.writerLocked,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = CHARACTER_FIELD_OPTIONS.find(
    (option) => option.id === field,
  )!;
  const fieldProjection = character[field];
  const beginField = (next: SlateCharacterEditableField): void => {
    const option = CHARACTER_FIELD_OPTIONS.find(
      (candidate) => candidate.id === next,
    )!;
    const projection = character[next];
    setField(next);
    setDraft(
      option.list
        ? (projection.value as string[]).join("\n")
        : String(projection.value),
    );
    setWriterLocked(projection.writerLocked);
    setError(null);
  };
  const save = (): void => {
    if (!onUpdate) return;
    setSaving(true);
    setError(null);
    const value = selected.list
      ? draft
          .split(/\n|·/u)
          .map((item) => item.trim())
          .filter(Boolean)
      : draft;
    void onUpdate(character.id, field, value, writerLocked)
      .then(() => setEditing(false))
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Character Studio could not save that field.",
        ),
      )
      .finally(() => setSaving(false));
  };
  return (
    <article className={styles.characterCard}>
      <header>
        <div>
          <h3>{character.identity.value || "Unnamed character"}</h3>
          <p>{listText(character.roles.value)}</p>
        </div>
        <small>{character.identity.layer}</small>
      </header>
      <dl>
        <div>
          <dt>Public face</dt>
          <dd>{character.publicPersona.value || "Not established yet"}</dd>
        </div>
        <div>
          <dt>Private pressure</dt>
          <dd>{character.privatePressure.value || "Not established yet"}</dd>
        </div>
        <div>
          <dt>Wants</dt>
          <dd>{listText(character.wants.value)}</dd>
        </div>
        <div>
          <dt>Needs</dt>
          <dd>{listText(character.needs.value)}</dd>
        </div>
        <div>
          <dt>Secrets</dt>
          <dd>{listText(character.secrets.value)}</dd>
        </div>
        <div>
          <dt>Now</dt>
          <dd>{character.currentState.value || "Not established yet"}</dd>
        </div>
      </dl>
      {onUpdate ? (
        <footer className={styles.curateFooter}>
          {!editing ? (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                beginField(field);
                setEditing(true);
              }}
            >
              Curate canon
            </button>
          ) : (
            <div className={styles.curateForm}>
              <label>
                Field
                <select
                  value={field}
                  onChange={(event) =>
                    beginField(
                      event.currentTarget
                        .value as SlateCharacterEditableField,
                    )
                  }
                >
                  {CHARACTER_FIELD_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {selected.label}
                <textarea
                  rows={selected.list ? 4 : 3}
                  value={draft}
                  placeholder={
                    selected.list
                      ? "One detail per line"
                      : "Writer-approved truth"
                  }
                  onChange={(event) => setDraft(event.currentTarget.value)}
                />
              </label>
              <label className={styles.lockToggle}>
                <input
                  type="checkbox"
                  checked={writerLocked}
                  onChange={(event) =>
                    setWriterLocked(event.currentTarget.checked)
                  }
                />
                Lock this field against inference
              </label>
              <small>
                {fieldProjection.layer} ·{" "}
                {fieldProjection.provenance.authority} authority
              </small>
              {error ? <p className={styles.formError}>{error}</p> : null}
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="button" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save as canon"}
                </button>
              </div>
            </div>
          )}
        </footer>
      ) : null}
    </article>
  );
}

function ArcCard({
  arc,
  profileId,
  onUpdate,
}: {
  arc: SlateCharacterArc;
  profileId: string | null;
  onUpdate?: SlateStoryBibleDeskProps["onUpdateIntendedArc"];
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [startState, setStartState] = useState(arc.intended.startState);
  const [destinationState, setDestinationState] = useState(
    arc.intended.destinationState,
  );
  const [writerLocked, setWriterLocked] = useState(
    arc.intended.writerLocked,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = (): void => {
    if (!onUpdate || !profileId) return;
    setSaving(true);
    setError(null);
    void onUpdate(profileId, {
      startState,
      destinationState,
      writerLocked,
    })
      .then(() => setEditing(false))
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Character Studio could not save that intended arc.",
        ),
      )
      .finally(() => setSaving(false));
  };
  return (
    <article className={styles.arcCard}>
      <header>
        <h3>{arc.intended.destinationState || "Character arc"}</h3>
        <small>{arc.characterEntityId}</small>
      </header>
      <div className={styles.trackPair}>
        <section>
          <span>Intended</span>
          <p>
            {arc.intended.startState || "Open"} →{" "}
            {arc.intended.destinationState || "Undecided"}
          </p>
          <ol>
            {arc.intended.beats.map((beat) => (
              <li key={beat.id} data-status={beat.status}>
                <strong>{beat.label}</strong>
                <small>{beat.status}</small>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <span>Observed in prose</span>
          <p>
            {arc.observed.startState || "Not observed"} →{" "}
            {arc.observed.destinationState || "Still unfolding"}
          </p>
          <ol>
            {arc.observed.beats.map((beat) => (
              <li key={beat.id} data-status={beat.status}>
                <strong>{beat.label}</strong>
                <small>{beat.status}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {arc.bridgeSuggestions.length > 0 ? (
        <footer>
          <strong>Possible bridge</strong>
          <span>{arc.bridgeSuggestions[0]?.summary}</span>
        </footer>
      ) : null}
      {onUpdate && profileId ? (
        <div className={styles.arcEditor}>
          {!editing ? (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setEditing(true)}
            >
              Set intended arc
            </button>
          ) : (
            <div className={styles.curateForm}>
              <label>
                Starting state
                <input
                  value={startState}
                  onChange={(event) =>
                    setStartState(event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Intended destination
                <input
                  value={destinationState}
                  onChange={(event) =>
                    setDestinationState(event.currentTarget.value)
                  }
                />
              </label>
              <label className={styles.lockToggle}>
                <input
                  type="checkbox"
                  checked={writerLocked}
                  onChange={(event) =>
                    setWriterLocked(event.currentTarget.checked)
                  }
                />
                Lock the intended track
              </label>
              <small>Observed prose remains evidence and cannot be edited.</small>
              {error ? <p className={styles.formError}>{error}</p> : null}
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="button" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save intended arc"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function ThreadCard({
  thread,
}: {
  thread: SlateNarrativeThread;
}): React.JSX.Element {
  return (
    <article className={styles.threadCard} data-status={thread.status}>
      <header>
        <div>
          <span>{thread.kind}</span>
          <h3>{thread.label}</h3>
        </div>
        <small>{thread.status}</small>
      </header>
      <p>{thread.description}</p>
    </article>
  );
}

export function SlateStoryBibleDesk({
  data,
  loading,
  onUpdateCharacterField,
  onUpdateIntendedArc,
}: SlateStoryBibleDeskProps): React.JSX.Element {
  const [tab, setTab] = useState<SlateStoryBibleDeskTab>("cast");
  const storyBible = data?.storyBible ?? EMPTY_STORY_BIBLE;
  const counts = useMemo(
    () => ({
      cast: storyBible.characters.length,
      arcs: storyBible.arcs.length,
      threads: storyBible.threads.length,
      timeline: storyBible.timeline.length + storyBible.causalEdges.length,
      world: storyBible.world.length,
    }),
    [storyBible],
  );

  return (
    <div className={styles.desk}>
      <section className={styles.liveWire} aria-label="Live Wire">
        <span>Live Wire</span>
        {loading ? (
          <p>Continuity is finding the pressure that still has heat.</p>
        ) : data?.momentum.liveWire ? (
          <>
            <h3>{data.momentum.liveWire.label}</h3>
            <p>{data.momentum.liveWire.summary}</p>
          </>
        ) : (
          <>
            <h3>No urgent pressure yet</h3>
            <p>
              As accepted prose establishes desire, obstacles, and promises,
              Continuity will keep one live thread within reach.
            </p>
          </>
        )}
        {data?.momentum.litMatch ? (
          <small>
            Next spark · {data.momentum.litMatch.intention}
          </small>
        ) : null}
      </section>

      <nav
        className={styles.tabs}
        aria-label="Story Bible views"
        role="tablist"
      >
        {(
          [
            ["cast", "Cast"],
            ["arcs", "Arcs"],
            ["threads", "Threads"],
            ["timeline", "Timeline"],
            ["world", "World"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-active={tab === id ? "true" : undefined}
            onClick={() => setTab(id)}
          >
            <span>{label}</span>
            <small>{counts[id]}</small>
          </button>
        ))}
      </nav>

      <div className={styles.content} aria-live="polite">
        {loading ? (
          <p className={styles.empty}>Curating the active generation…</p>
        ) : tab === "cast" ? (
          storyBible.characters.length > 0 ? (
            storyBible.characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onUpdate={onUpdateCharacterField}
              />
            ))
          ) : (
            <p className={styles.empty}>
              Cast appears here as accepted prose establishes people, pressure,
              relationships, and knowledge.
            </p>
          )
        ) : tab === "arcs" ? (
          storyBible.arcs.length > 0 ? (
            storyBible.arcs.map((arc) => (
              <ArcCard
                key={arc.id}
                arc={arc}
                profileId={
                  storyBible.characters.find(
                    (character) =>
                      character.entityId === arc.characterEntityId,
                  )?.id ?? null
                }
                onUpdate={onUpdateIntendedArc}
              />
            ))
          ) : (
            <p className={styles.empty}>
              Intended and observed arcs will remain separate here.
            </p>
          )
        ) : tab === "threads" ? (
          storyBible.threads.length > 0 ? (
            storyBible.threads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))
          ) : (
            <p className={styles.empty}>
              Setups, promises, mysteries, and obligations will gather here
              without interrupting the manuscript.
            </p>
          )
        ) : tab === "timeline" ? (
          storyBible.timeline.length > 0 ||
          storyBible.causalEdges.length > 0 ? (
            <div className={styles.timeline}>
              {storyBible.timeline.map((branch) => (
                <article key={branch.id}>
                  <span>{branch.kind.replaceAll("_", " ")}</span>
                  <h3>{branch.label}</h3>
                  <p>{branch.description}</p>
                </article>
              ))}
              {storyBible.causalEdges.map((edge) => (
                <article key={edge.id}>
                  <span>{edge.kind}</span>
                  <h3>
                    {edge.from.kind} → {edge.to.kind}
                  </h3>
                  <p>
                    {edge.from.id} → {edge.to.id}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              Story time, manuscript order, and alternate branches will remain
              visibly distinct here.
            </p>
          )
        ) : storyBible.world.length > 0 ? (
          storyBible.world.map((entry) => (
            <article key={entry.id} className={styles.worldCard}>
              <header>
                <h3>{entry.label}</h3>
                <small>{entry.layer}</small>
              </header>
              <p>{entry.description}</p>
            </article>
          ))
        ) : (
          <p className={styles.empty}>
            Writer-approved rules, places, objects, and facts will appear here.
          </p>
        )}
      </div>

      <footer className={styles.provenance}>
        <span>
          Active generation {data?.activeGeneration ?? "—"} · curated
          projections only
        </span>
        <small>
          Evidence, canon, plans, and AI interpretations never silently merge.
        </small>
      </footer>
    </div>
  );
}
