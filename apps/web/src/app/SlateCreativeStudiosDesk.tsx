"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BOT_PERSON_NAME_MAX_LENGTH,
  TEXT_ENTRY_LONG_FORM_MAX_LENGTH,
  TEXT_ENTRY_PARAGRAPH_MAX_LENGTH,
  TEXT_ENTRY_SHORT_MAX_LENGTH,
  TEXT_ENTRY_TITLE_MAX_LENGTH,
} from "@localai/shared";
import Image from "next/image";
import type {
  SlateReviewCircleSession,
  SlateSourceShelfItem,
  SlateSourceShelfKind,
  SlateVisualReference,
  SlateVisualReferenceKind,
} from "../../../../packages/shared/src/slateCreativeStudios";
import styles from "./slateCreativeStudiosDesk.module.css";
import { AssetRail, type AssetGenerationSelection, type AssetRailGenerationControl } from "./AssetLibrary";
import { prismRefractionRequestInit, waitForRefraction } from "./prismRefractionRun.ts";

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
  assetRailGeneration?: (kind: "slate_visual_study") => AssetRailGenerationControl;
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
  init = prismRefractionRequestInit(init);
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as StudioResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || "Slate could not open that creative desk.");
  }
  return body;
}

function readVisualStudyFile(file: File): Promise<string> {
  if (!/^image\/(?:png|jpe?g|webp|gif|avif)$/iu.test(file.type)) {
    return Promise.reject(new Error("Choose a PNG, JPEG, WebP, GIF, or AVIF image."));
  }
  if (file.size > 20 * 1024 * 1024) {
    return Promise.reject(new Error("Choose an image smaller than 20 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Slate could not read that image."));
    reader.onerror = () => reject(new Error("Slate could not read that image."));
    reader.readAsDataURL(file);
  });
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
  assetRailGeneration,
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
  const visualUploadRef = useRef<HTMLInputElement | null>(null);

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
    async (operation: () => Promise<void>, signal?: AbortSignal) => {
      if (busy) return;
      signal?.throwIfAborted();
      setBusy(true);
      setError("");
      try {
        await (signal ? waitForRefraction(signal, operation) : operation());
      } catch (caught) {
        if (signal?.aborted) return;
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

  const createVisualStudy = (
    direction = "",
    selection?: AssetGenerationSelection,
    signal?: AbortSignal,
  ): Promise<void> => {
    if (!visualPrompt.trim()) return Promise.resolve();
    return act(async () => {
      const body = await studioRequest(`${base}/visual-references`, {
        method: "POST",
        signal,
        body: JSON.stringify({
          sectionId: currentSectionId,
          kind: visualKind,
          prompt: visualPrompt,
          direction,
          ...(selection
            ? { preferredProvider: selection.provider, model: selection.model }
            : {}),
        }),
      });
      signal?.throwIfAborted();
      if (body.visual) setVisuals((items) => [body.visual!, ...items]);
      setVisualPrompt("");
    }, signal);
  };

  const reuseVisualStudy = (assetSetId: string): void => {
    void act(async () => {
      const body = await studioRequest(`${base}/visual-references/reuse`, {
        method: "POST",
        body: JSON.stringify({
          assetSetId,
          sectionId: currentSectionId,
          kind: visualKind,
          prompt: visualPrompt,
        }),
      });
      if (body.visual) setVisuals((items) => [body.visual!, ...items]);
      setVisualPrompt("");
    });
  };

  const uploadVisualStudy = (file: File): void => {
    void act(async () => {
      const dataUrl = await readVisualStudyFile(file);
      const body = await studioRequest(`${base}/visual-references/upload`, {
        method: "POST",
        body: JSON.stringify({
          dataUrl,
          sectionId: currentSectionId,
          kind: visualKind,
          prompt: visualPrompt.trim() || file.name,
        }),
      });
      if (body.visual) setVisuals((items) => [body.visual!, ...items]);
      setVisualPrompt("");
      if (visualUploadRef.current) visualUploadRef.current.value = "";
    });
  };

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
                maxLength={TEXT_ENTRY_TITLE_MAX_LENGTH}
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
                maxLength={TEXT_ENTRY_LONG_FORM_MAX_LENGTH}
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
                maxLength={TEXT_ENTRY_TITLE_MAX_LENGTH}
                        onChange={(event) =>
                          setEditingSourceTitle(event.target.value)
                        }
                        aria-label="Edit source title"
                      />
              <textarea
                value={editingSourceContent}
                maxLength={TEXT_ENTRY_LONG_FORM_MAX_LENGTH}
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
              createVisualStudy();
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
              maxLength={TEXT_ENTRY_PARAGRAPH_MAX_LENGTH}
              onChange={(event) => setVisualPrompt(event.target.value)}
              placeholder="Describe the visual study in natural language…"
              rows={3}
            />
            <input
              ref={visualUploadRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) uploadVisualStudy(file);
              }}
            />
            <AssetRail
              kind="slate_visual_study"
              generation={assetRailGeneration?.("slate_visual_study")}
              label="Visual studies"
              context={projectId}
              currentImageIds={pinnedVisuals.map((visual) => visual.assetId)}
              refreshKey={visuals[0]?.assetId}
              disabled={busy}
              synthesizeDisabled={!visualPrompt.trim()}
              onUpload={() => visualUploadRef.current?.click()}
              onSynthesize={createVisualStudy}
              onSelect={(asset) => reuseVisualStudy(asset.id)}
            />
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
                maxLength={BOT_PERSON_NAME_MAX_LENGTH}
                  onChange={(event) => setGuestName(event.target.value)}
                  placeholder="Guest name"
                  required
                />
              <input
                value={guestBrief}
                maxLength={TEXT_ENTRY_SHORT_MAX_LENGTH}
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
