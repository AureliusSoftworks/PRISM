"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type {
  SlateReviewCircleSession,
  SlateSourceShelfItem,
  SlateSourceShelfKind,
  SlateVisualReference,
  SlateVisualReferenceKind,
} from "../../../../packages/shared/src/slateCreativeStudios";
import styles from "./slateCreativeStudiosDesk.module.css";

type StudioDesk = "sources" | "visuals" | "review";

interface SlateStudioSection {
  id: string;
  title: string;
}

interface SlateStudioReviewer {
  id: string;
  name: string;
}

interface SlateCreativeStudiosDeskProps {
  projectId: string;
  currentSectionId: string | null;
  sections: SlateStudioSection[];
  onClose: () => void;
}

interface StudioResponse {
  sources?: SlateSourceShelfItem[];
  source?: SlateSourceShelfItem;
  visuals?: SlateVisualReference[];
  visual?: SlateVisualReference;
  rooms?: SlateReviewCircleSession[];
  room?: SlateReviewCircleSession;
  reviewers?: SlateStudioReviewer[];
}

async function studioRequest(
  path: string,
  init?: RequestInit,
): Promise<StudioResponse> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as StudioResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || "Slate could not open that creative desk.");
  }
  return body;
}

const VISUAL_KINDS: Array<[SlateVisualReferenceKind, string]> = [
  ["character_study", "Character"],
  ["expression", "Expression"],
  ["costume", "Costume"],
  ["location", "Location"],
  ["prop", "Prop"],
  ["motif", "Motif"],
  ["scene_keyframe", "Scene"],
  ["blocking", "Blocking"],
];

function DeskHeader({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}): React.JSX.Element {
  return (
    <header className={styles.deskHeader}>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
    </header>
  );
}

export function SlateCreativeStudiosDesk({
  projectId,
  currentSectionId,
  sections,
  onClose,
}: SlateCreativeStudiosDeskProps): React.JSX.Element {
  const base = `/api/slate/projects/${encodeURIComponent(projectId)}`;
  const [desk, setDesk] = useState<StudioDesk>("sources");
  const [sources, setSources] = useState<SlateSourceShelfItem[]>([]);
  const [visuals, setVisuals] = useState<SlateVisualReference[]>([]);
  const [rooms, setRooms] = useState<SlateReviewCircleSession[]>([]);
  const [reviewers, setReviewers] = useState<SlateStudioReviewer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceKind, setSourceKind] =
    useState<SlateSourceShelfKind>("note");
  const [sourceContent, setSourceContent] = useState("");
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSourceTitle, setEditingSourceTitle] = useState("");
  const [editingSourceContent, setEditingSourceContent] = useState("");
  const [visualKind, setVisualKind] =
    useState<SlateVisualReferenceKind>("character_study");
  const [visualPrompt, setVisualPrompt] = useState("");
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
  const [guestEnabled, setGuestEnabled] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestBrief, setGuestBrief] = useState("");

  const reload = useCallback(async () => {
    setError("");
    try {
      const [sourceBody, visualBody, roomBody, reviewerBody] = await Promise.all([
        studioRequest(`${base}/sources`),
        studioRequest(`${base}/visual-references`),
        studioRequest(`${base}/review-circle`),
        studioRequest(`${base}/review-circle/reviewers`),
      ]);
      setSources(sourceBody.sources ?? []);
      setVisuals(visualBody.visuals ?? []);
      setRooms(roomBody.rooms ?? []);
      setReviewers(reviewerBody.reviewers ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Studio data unavailable.");
    }
  }, [base]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = useCallback(
    async (operation: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        await operation();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That action failed.");
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const latestRoom = rooms[0] ?? null;
  const reviewSectionId =
    currentSectionId ?? sections.find((section) => section.id)?.id ?? null;
  const selectedCount = selectedReviewers.length + (guestEnabled ? 1 : 0);
  const pinnedVisuals = useMemo(
    () => visuals.filter((visual) => visual.status === "pinned"),
    [visuals],
  );

  return (
    <section
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="slate-creative-studios-title"
    >
      <div className={styles.focusedDesk}>
        <header className={styles.topbar}>
          <div>
            <span>Focused desk</span>
            <h1 id="slate-creative-studios-title">Creative Studios</h1>
          </div>
          <p>Material, images, and readers—without crowding the page.</p>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>
        <main className={styles.shell} aria-label="Slate creative studios">
      <nav
        className={styles.deskTabs}
        aria-label="Creative desks"
        role="tablist"
      >
        {(
          [
            ["sources", "Source Shelf"],
            ["visuals", "Visual Bible"],
            ["review", "Review Circle"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={desk === id}
            data-active={desk === id ? "true" : undefined}
            onClick={() => setDesk(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? <p className={styles.error}>{error}</p> : null}

      {desk === "sources" ? (
        <div className={styles.desk}>
          <DeskHeader
            eyebrow="Source Shelf"
            title="Material beside the manuscript"
            detail="Notes and research stay outside Canon and Mirror until you explicitly promote a snapshot."
          />
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                const body = await studioRequest(`${base}/sources`, {
                  method: "POST",
                  body: JSON.stringify({
                    title: sourceTitle,
                    kind: sourceKind,
                    content: sourceContent,
                  }),
                });
                if (body.source) setSources((items) => [body.source!, ...items]);
                setSourceTitle("");
                setSourceContent("");
              });
            }}
          >
            <div className={styles.inlineFields}>
              <input
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                placeholder="Source title"
                aria-label="Source title"
                required
              />
              <select
                value={sourceKind}
                onChange={(event) =>
                  setSourceKind(event.target.value as SlateSourceShelfKind)
                }
                aria-label="Source kind"
              >
                <option value="note">Note</option>
                <option value="research">Research</option>
              </select>
            </div>
            <textarea
              value={sourceContent}
              onChange={(event) => setSourceContent(event.target.value)}
              placeholder="Paste a reference, capture an idea, or leave yourself a trail."
              rows={4}
            />
            <button type="submit" disabled={busy || !sourceTitle.trim()}>
              Add to shelf
            </button>
          </form>
          <div className={styles.list}>
            {sources.length === 0 ? (
              <p className={styles.empty}>The shelf is clear.</p>
            ) : (
              sources.map((source) => (
                <article key={source.id} className={styles.sourceCard}>
                  <header>
                    <div>
                      <span>{source.kind}</span>
                      <h3>{source.title}</h3>
                    </div>
                    {source.promotedSourceId ? (
                      <small>Continuity snapshot</small>
                    ) : null}
                  </header>
                  {editingSourceId === source.id ? (
                    <div className={styles.sourceEditor}>
                      <input
                        value={editingSourceTitle}
                        onChange={(event) =>
                          setEditingSourceTitle(event.target.value)
                        }
                        aria-label="Edit source title"
                      />
                      <textarea
                        value={editingSourceContent}
                        onChange={(event) =>
                          setEditingSourceContent(event.target.value)
                        }
                        aria-label="Edit source content"
                        rows={4}
                      />
                      {source.promotedSourceId ? (
                        <small>
                          Saving starts a new shelf draft. The promoted snapshot
                          remains in Continuity.
                        </small>
                      ) : null}
                    </div>
                  ) : (
                    <p>{source.content || "No body text."}</p>
                  )}
                  <footer>
                    {editingSourceId === source.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy || !editingSourceTitle.trim()}
                          onClick={() =>
                            void act(async () => {
                              const body = await studioRequest(
                                `${base}/sources/${encodeURIComponent(source.id)}`,
                                {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    title: editingSourceTitle,
                                    content: editingSourceContent,
                                  }),
                                },
                              );
                              if (body.source) {
                                setSources((items) =>
                                  items.map((item) =>
                                    item.id === source.id ? body.source! : item,
                                  ),
                                );
                              }
                              setEditingSourceId(null);
                            })
                          }
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className={styles.quietAction}
                          disabled={busy}
                          onClick={() => setEditingSourceId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={styles.quietAction}
                        disabled={busy}
                        onClick={() => {
                          setEditingSourceId(source.id);
                          setEditingSourceTitle(source.title);
                          setEditingSourceContent(source.content);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={
                        busy ||
                        Boolean(source.promotedSourceId) ||
                        editingSourceId === source.id
                      }
                      onClick={() =>
                        void act(async () => {
                          const body = await studioRequest(
                            `${base}/sources/${encodeURIComponent(source.id)}/promote`,
                            { method: "POST", body: "{}" },
                          );
                          if (body.source) {
                            setSources((items) =>
                              items.map((item) =>
                                item.id === source.id ? body.source! : item,
                              ),
                            );
                          }
                        })
                      }
                    >
                      {source.promotedSourceId
                        ? "Promoted to Continuity"
                        : "Promote snapshot"}
                    </button>
                    <button
                      type="button"
                      className={styles.quietAction}
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await studioRequest(
                            `${base}/sources/${encodeURIComponent(source.id)}`,
                            { method: "DELETE" },
                          );
                          setSources((items) =>
                            items.filter((item) => item.id !== source.id),
                          );
                        })
                      }
                    >
                      Remove
                    </button>
                  </footer>
                </article>
              ))
            )}
          </div>
        </div>
      ) : null}

      {desk === "visuals" ? (
        <div className={styles.desk}>
          <DeskHeader
            eyebrow="Visual Bible"
            title="See the story without rewriting it"
            detail="Every image begins as a study. Pinning makes a visual reference authoritative, never textual Canon."
          />
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                const body = await studioRequest(`${base}/visual-references`, {
                  method: "POST",
                  body: JSON.stringify({
                    sectionId: currentSectionId,
                    kind: visualKind,
                    prompt: visualPrompt,
                  }),
                });
                if (body.visual) setVisuals((items) => [body.visual!, ...items]);
                setVisualPrompt("");
              });
            }}
          >
            <div className={styles.kindRail}>
              {VISUAL_KINDS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  data-active={visualKind === id ? "true" : undefined}
                  onClick={() => setVisualKind(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              value={visualPrompt}
              onChange={(event) => setVisualPrompt(event.target.value)}
              placeholder="Describe the visual study in natural language…"
              rows={3}
            />
            <button type="submit" disabled={busy || !visualPrompt.trim()}>
              Generate study
            </button>
          </form>
          {pinnedVisuals.length > 0 ? (
            <p className={styles.pinnedCount}>
              {pinnedVisuals.length} pinned visual{" "}
              {pinnedVisuals.length === 1 ? "reference" : "references"}
            </p>
          ) : null}
          <div className={styles.visualGrid}>
            {visuals
              .filter((visual) => visual.status !== "rejected")
              .map((visual) => (
                <article key={visual.id} data-status={visual.status}>
                  <Image
                    src={`/api/images/${encodeURIComponent(visual.assetId)}/file`}
                    alt={visual.prompt}
                    width={768}
                    height={480}
                    unoptimized
                  />
                  <div>
                    <span>{visual.kind.replaceAll("_", " ")}</span>
                    <p>{visual.prompt}</p>
                    <footer>
                      {visual.status === "study" ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                const body = await studioRequest(
                                  `${base}/visual-references/${encodeURIComponent(visual.id)}/pin`,
                                  { method: "POST", body: "{}" },
                                );
                                if (body.visual) {
                                  setVisuals((items) =>
                                    items.map((item) =>
                                      item.id === visual.id ? body.visual! : item,
                                    ),
                                  );
                                }
                              })
                            }
                          >
                            Pin reference
                          </button>
                          <button
                            type="button"
                            className={styles.quietAction}
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await studioRequest(
                                  `${base}/visual-references/${encodeURIComponent(visual.id)}/reject`,
                                  { method: "POST", body: "{}" },
                                );
                                setVisuals((items) =>
                                  items.filter((item) => item.id !== visual.id),
                                );
                              })
                            }
                          >
                            Dismiss
                          </button>
                        </>
                      ) : (
                        <small>Pinned visual authority</small>
                      )}
                    </footer>
                  </div>
                </article>
              ))}
          </div>
        </div>
      ) : null}

      {desk === "review" ? (
        <div className={styles.desk}>
          <DeskHeader
            eyebrow="Review Circle"
            title="One frozen page. Independent readers."
            detail="Invite up to three of your reviewers and one guest. The Room Note cannot alter prose or Canon."
          />
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              if (!reviewSectionId) return;
              void act(async () => {
                const body = await studioRequest(`${base}/review-circle`, {
                  method: "POST",
                  body: JSON.stringify({
                    sectionId: reviewSectionId,
                    reviewerBotIds: selectedReviewers,
                    guest: guestEnabled
                      ? { name: guestName, readerBrief: guestBrief }
                      : null,
                  }),
                });
                if (body.room) setRooms((items) => [body.room!, ...items]);
              });
            }}
          >
            <div className={styles.reviewerGrid}>
              {reviewers.map((reviewer) => {
                const selected = selectedReviewers.includes(reviewer.id);
                return (
                  <label key={reviewer.id} data-selected={selected || undefined}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!selected && selectedReviewers.length >= 3}
                      onChange={() =>
                        setSelectedReviewers((ids) =>
                          selected
                            ? ids.filter((id) => id !== reviewer.id)
                            : [...ids, reviewer.id],
                        )
                      }
                    />
                    <span>{reviewer.name}</span>
                  </label>
                );
              })}
              <label data-selected={guestEnabled || undefined}>
                <input
                  type="checkbox"
                  checked={guestEnabled}
                  onChange={(event) => setGuestEnabled(event.target.checked)}
                />
                <span>Guest reader</span>
              </label>
            </div>
            {guestEnabled ? (
              <div className={styles.guestFields}>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  placeholder="Guest name"
                  required
                />
                <input
                  value={guestBrief}
                  onChange={(event) => setGuestBrief(event.target.value)}
                  placeholder="What should this guest read for?"
                  required
                />
              </div>
            ) : null}
            <button
              type="submit"
              disabled={busy || !reviewSectionId || selectedCount === 0}
            >
              Open room · {selectedCount || 0}
            </button>
          </form>
          {latestRoom ? (
            <article className={styles.roomNote} data-verdict={latestRoom.roomNote.verdict}>
              <header>
                <span>Room Note · {latestRoom.roomNote.verdict.replace("_", " ")}</span>
                <small>
                  {latestRoom.reviews.length} independent{" "}
                  {latestRoom.reviews.length === 1 ? "reader" : "readers"}
                </small>
              </header>
              <h3>{latestRoom.roomNote.headline}</h3>
              <p>{latestRoom.roomNote.consensus}</p>
              {latestRoom.roomNote.tensions.length > 0 ? (
                <ul>
                  {latestRoom.roomNote.tensions.map((tension) => (
                    <li key={tension}>{tension}</li>
                  ))}
                </ul>
              ) : null}
              <footer>
                <strong>Next move</strong>
                <span>{latestRoom.roomNote.nextMove}</span>
              </footer>
            </article>
          ) : (
            <p className={styles.empty}>No room has read this project yet.</p>
          )}
        </div>
      ) : null}
        </main>
      </div>
    </section>
  );
}
