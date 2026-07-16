"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  PromptWildcardRunMetadata,
  SlateLockedRange,
  SlateProjectDetail,
  SlateProjectListResponse,
  SlateProjectPatchRequest,
  SlateProjectResponse,
  SlateProjectSummary,
  SlateRevisionAction,
  SlateResolveSparkWildcardsResponse,
  SlateStructureItem,
} from "@localai/shared";
import {
  latestPendingSlateRevision,
  reorderSlateStructure,
  slateRevisionScopeForWorkspace,
} from "./slateWorkspaceState";
import styles from "./slateWorkspace.module.css";

interface SlateWorkspaceProps {
  className?: string;
  sidebarHeader: ReactNode;
  navigationHeader: ReactNode;
  theme: "light" | "dark";
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface SlateWildcardPreview {
  template: string;
  spark: string;
  sparkWildcards: PromptWildcardRunMetadata;
}

const SLATE_WILDCARD_SUGGESTIONS = [
  "{PERSON}",
  "{PLACE}",
  "{OBJECT}",
  "{PROBLEM}",
  "{GENRE}",
  "{STYLE}",
] as const;

const SLATE_SUPPORTED_WILDCARD_RE = /\{[A-Z][A-Z0-9_ ]{1,63}\}/u;

async function slateApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "Slate could not complete that action.",
    );
  }
  return payload as T;
}

function readableUpdatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Saved";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function revisionLabel(action: SlateRevisionAction): string {
  return `${action[0]?.toUpperCase() ?? ""}${action.slice(1)}`;
}

export default function SlateWorkspace({
  className = "",
  sidebarHeader,
  navigationHeader,
  theme,
}: SlateWorkspaceProps): React.JSX.Element {
  const [projects, setProjects] = useState<SlateProjectSummary[]>([]);
  const [project, setProject] = useState<SlateProjectDetail | null>(null);
  const projectRef = useRef<SlateProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [title, setTitle] = useState("");
  const [spark, setSpark] = useState("");
  const [wildcardMode, setWildcardMode] = useState(false);
  const [wildcardResolving, setWildcardResolving] = useState(false);
  const [wildcardPreview, setWildcardPreview] = useState<SlateWildcardPreview | null>(null);
  const [existingMaterial, setExistingMaterial] = useState("");
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [revisionAction, setRevisionAction] = useState<SlateRevisionAction>("deepen");
  const [revisionDirection, setRevisionDirection] = useState("");
  const [draftDirection, setDraftDirection] = useState("");
  const lastSavedManuscriptRef = useRef("");
  const autosaveTimerRef = useRef<number | null>(null);
  const manuscriptSaveInFlightRef = useRef<Promise<void> | null>(null);
  const sparkTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const adoptProject = useCallback((next: SlateProjectDetail): void => {
    projectRef.current = next;
    lastSavedManuscriptRef.current = next.manuscript;
    setProject(next);
    setSelectedStructureId((current) =>
      current && next.structure.some((item) => item.id === current)
        ? current
        : (next.structure[0]?.id ?? null),
    );
    setSelection({ start: 0, end: 0 });
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const refreshProjects = useCallback(async (): Promise<SlateProjectSummary[]> => {
    const response = await slateApi<SlateProjectListResponse>("/api/slate/projects");
    setProjects(response.projects);
    return response.projects;
  }, []);

  const flushPendingManuscriptSave = useCallback(async (): Promise<void> => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (manuscriptSaveInFlightRef.current) {
      await manuscriptSaveInFlightRef.current;
    }
    const current = projectRef.current;
    if (!current || current.manuscript === lastSavedManuscriptRef.current) return;
    const projectId = current.id;
    const manuscript = current.manuscript;
    setSaveState("saving");
    const save = slateApi<SlateProjectResponse>(
      `/api/slate/projects/${encodeURIComponent(projectId)}`,
      { method: "PATCH", body: JSON.stringify({ manuscript }) },
    )
      .then((response) => {
        lastSavedManuscriptRef.current = manuscript;
        if (
          projectRef.current?.id === projectId &&
          projectRef.current.manuscript === manuscript
        ) {
          adoptProject(response.project);
          setSaveState("saved");
          void refreshProjects();
        }
      })
      .catch((cause) => {
        setSaveState("error");
        setError(cause instanceof Error ? cause.message : "Slate could not autosave.");
        throw cause;
      })
      .finally(() => {
        if (manuscriptSaveInFlightRef.current === save) {
          manuscriptSaveInFlightRef.current = null;
        }
      });
    manuscriptSaveInFlightRef.current = save;
    await save;
  }, [adoptProject, refreshProjects]);

  const openProject = useCallback(
    async (projectId: string): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const response = await slateApi<SlateProjectResponse>(
          `/api/slate/projects/${encodeURIComponent(projectId)}`,
        );
        adoptProject(response.project);
        setSaveState("saved");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not open this project.");
      } finally {
        setBusy(false);
      }
    },
    [adoptProject, flushPendingManuscriptSave],
  );

  useEffect(() => {
    let cancelled = false;
    void refreshProjects()
      .then(async (items) => {
        if (!cancelled && items[0]) await openProject(items[0].id);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Slate could not load projects.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openProject, refreshProjects]);

  const patchProject = useCallback(
    async (patch: SlateProjectPatchRequest): Promise<SlateProjectDetail> => {
      const current = projectRef.current;
      if (!current) throw new Error("Open a Slate project first.");
      const response = await slateApi<SlateProjectResponse>(
        `/api/slate/projects/${encodeURIComponent(current.id)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      adoptProject(response.project);
      setSaveState("saved");
      void refreshProjects();
      return response.project;
    },
    [adoptProject, refreshProjects],
  );

  useEffect(() => {
    if (!project || project.manuscript === lastSavedManuscriptRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void flushPendingManuscriptSave().catch(() => undefined);
    }, 650);
    autosaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
    };
  }, [flushPendingManuscriptSave, project]);

  const runProjectOperation = useCallback(
    async (path: string, body: Record<string, unknown> = {}): Promise<void> => {
      const current = projectRef.current;
      if (!current) return;
      setBusy(true);
      setError(null);
      try {
        const response = await slateApi<SlateProjectResponse>(
          `/api/slate/projects/${encodeURIComponent(current.id)}${path}`,
          { method: "POST", body: JSON.stringify(body) },
        );
        adoptProject(response.project);
        setSaveState("saved");
        void refreshProjects();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not complete that action.");
      } finally {
        setBusy(false);
      }
    },
    [adoptProject, refreshProjects],
  );

  const resolveSparkWildcards = async (force = false): Promise<SlateWildcardPreview> => {
    const template = spark.trim();
    if (!SLATE_SUPPORTED_WILDCARD_RE.test(template)) {
      throw new Error("Add an uppercase wildcard such as {PERSON}, {PLACE}, or {PROBLEM} first.");
    }
    if (!force && wildcardPreview?.template === template) return wildcardPreview;
    const response = await slateApi<SlateResolveSparkWildcardsResponse>(
      "/api/slate/wildcards/resolve",
      {
        method: "POST",
        body: JSON.stringify({ template }),
      },
    );
    const preview = {
      template,
      spark: response.spark,
      sparkWildcards: response.sparkWildcards,
    };
    setWildcardPreview(preview);
    return preview;
  };

  const rollSparkWildcards = async (): Promise<void> => {
    setWildcardResolving(true);
    setError(null);
    try {
      await resolveSparkWildcards(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not roll those wildcards.");
    } finally {
      setWildcardResolving(false);
    }
  };

  const insertSparkWildcard = (token: string): void => {
    const textarea = sparkTextareaRef.current;
    const start = textarea?.selectionStart ?? spark.length;
    const end = textarea?.selectionEnd ?? start;
    const before = spark.slice(0, start);
    const after = spark.slice(end);
    const prefix = before && !/\s$/u.test(before) ? " " : "";
    const suffix = after && !/^\s/u.test(after) ? " " : "";
    const insertion = `${prefix}${token}${suffix}`;
    const nextSpark = `${before}${insertion}${after}`;
    const nextCaret = before.length + insertion.length;
    setSpark(nextSpark);
    setWildcardPreview(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const createProject = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const wildcardCreation =
        wildcardMode && SLATE_SUPPORTED_WILDCARD_RE.test(spark)
          ? await resolveSparkWildcards()
          : null;
      let response = await slateApi<SlateProjectResponse>("/api/slate/projects", {
        method: "POST",
        body: JSON.stringify({
          title,
          spark: wildcardCreation?.spark ?? spark,
          ...(wildcardCreation
            ? { sparkWildcards: wildcardCreation.sparkWildcards }
            : {}),
        }),
      });
      if (existingMaterial.trim()) {
        response = await slateApi<SlateProjectResponse>(
          `/api/slate/projects/${encodeURIComponent(response.project.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              manuscript: existingMaterial,
              phase: "shape",
            }),
          },
        );
      }
      adoptProject(response.project);
      setTitle("");
      setSpark("");
      setWildcardMode(false);
      setWildcardPreview(null);
      setExistingMaterial("");
      setSaveState("saved");
      await refreshProjects();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not create the project.");
    } finally {
      setBusy(false);
    }
  };

  const saveStructure = async (structure: SlateStructureItem[]): Promise<void> => {
    if (!projectRef.current) return;
    setProject((current) => (current ? { ...current, structure } : current));
    setBusy(true);
    setError(null);
    try {
      await patchProject({ structure });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not save the structure.");
    } finally {
      setBusy(false);
    }
  };

  const mutateStructureItem = (
    itemId: string,
    patch: Partial<SlateStructureItem>,
  ): void => {
    setProject((current) =>
      current
        ? {
            ...current,
            structure: current.structure.map((item) =>
              item.id === itemId ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  };

  const addScene = (): void => {
    if (!project) return;
    const item: SlateStructureItem = {
      id: crypto.randomUUID(),
      kind: "scene",
      title: `Scene ${project.structure.filter((candidate) => candidate.kind === "scene").length + 1}`,
      summary: "Describe what changes in this scene.",
      direction: "",
      status: "planned",
      locked: false,
    };
    const next = [...project.structure, item];
    setSelectedStructureId(item.id);
    void saveStructure(next);
  };

  const lockSelection = (): void => {
    if (!project || selection.end <= selection.start) return;
    const lockedRanges: SlateLockedRange[] = [
      ...project.lockedRanges,
      {
        id: crypto.randomUUID(),
        start: selection.start,
        end: selection.end,
        label: project.manuscript.slice(selection.start, selection.end).slice(0, 48),
      },
    ];
    setBusy(true);
    void patchProject({ lockedRanges })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Slate could not lock that passage."),
      )
      .finally(() => setBusy(false));
  };

  const selectedStructureItem = useMemo(
    () => project?.structure.find((item) => item.id === selectedStructureId) ?? null,
    [project?.structure, selectedStructureId],
  );
  const pendingRevision = useMemo(
    () => latestPendingSlateRevision(project?.revisions ?? []),
    [project?.revisions],
  );
  const revisionScope = slateRevisionScopeForWorkspace({
    selectionStart: selection.start,
    selectionEnd: selection.end,
    selectedStructureItem,
  });

  const requestRevision = (): void => {
    const body: Record<string, unknown> = {
      action: revisionAction,
      scope: revisionScope,
      direction: revisionDirection,
    };
    if (revisionScope === "selection") {
      body.selectionStart = selection.start;
      body.selectionEnd = selection.end;
    } else if (revisionScope === "scene" && selectedStructureItem) {
      body.structureItemId = selectedStructureItem.id;
    }
    void runProjectOperation("/revisions", body);
  };

  if (loading) {
    return (
      <main className={`${styles.shell} ${className}`} data-theme={theme}>
        <div className={styles.sidebarNavigation}>{sidebarHeader}</div>
        <div className={styles.mainNavigation}>{navigationHeader}</div>
        <p className={styles.loading}>Opening the writing desk…</p>
      </main>
    );
  }

  return (
    <main
      className={`${styles.shell} ${className}`}
      data-slate-workspace="true"
      data-theme={theme}
    >
      <div className={styles.sidebarNavigation}>{sidebarHeader}</div>
      <div className={styles.mainNavigation}>{navigationHeader}</div>

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss Slate error">
            ×
          </button>
        </div>
      ) : null}

      {!project ? (
        <section className={styles.welcome}>
          <div className={styles.welcomeCopy}>
            <p className={styles.eyebrow}>A quiet creative-production desk</p>
            <h1>Bring the spark. Direct the work.</h1>
            <p>
              Shape the story, let Slate carry the drafting labor, then approve only
              the prose that earns its place.
            </p>
          </div>
          <form
            className={styles.createCard}
            data-tutorial-target="slate-create-project"
            onSubmit={(event) => {
              event.preventDefault();
              void createProject();
            }}
          >
            <label>
              Project title
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required />
            </label>
            <label>
              Creative spark
              <textarea
                ref={sparkTextareaRef}
                value={spark}
                onChange={(event) => {
                  setSpark(event.target.value);
                  setWildcardPreview(null);
                }}
                placeholder="A promise, an image, a problem, a voice…"
                rows={4}
                required
              />
            </label>
            <div className={styles.wildcardBuilder} data-enabled={wildcardMode ? "true" : undefined}>
              <button
                type="button"
                className={styles.wildcardToggle}
                aria-pressed={wildcardMode}
                onClick={() => {
                  setWildcardMode((current) => !current);
                  setWildcardPreview(null);
                }}
              >
                Use {"{wildcards}"} <span>optional</span>
              </button>
              {wildcardMode ? (
                <div className={styles.wildcardControls}>
                  <p>
                    Place uppercase slots in the spark. Slate will roll them before
                    the project is created, and keep the original template.
                  </p>
                  <div className={styles.wildcardChips} aria-label="Slate wildcard suggestions">
                    {SLATE_WILDCARD_SUGGESTIONS.map((token) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => insertSparkWildcard(token)}
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.quietButton}
                    disabled={busy || wildcardResolving || !SLATE_SUPPORTED_WILDCARD_RE.test(spark)}
                    onClick={() => void rollSparkWildcards()}
                  >
                    {wildcardResolving
                      ? "Rolling…"
                      : wildcardPreview
                        ? "Reroll wildcards"
                        : "Preview wildcard roll"}
                  </button>
                  {wildcardPreview ? (
                    <div className={styles.wildcardPreview} role="status">
                      <span>Resolved spark</span>
                      <p>{wildcardPreview.spark}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <label>
              Bring existing material <span>optional</span>
              <textarea
                value={existingMaterial}
                onChange={(event) => setExistingMaterial(event.target.value)}
                placeholder="Paste notes or prose to begin from what already exists."
                rows={6}
              />
            </label>
            <button type="submit" className={styles.primaryButton} disabled={busy || wildcardResolving || !title.trim() || !spark.trim()}>
              {wildcardMode && wildcardPreview ? "Create from this roll" : "Create project"}
            </button>
          </form>
          {projects.length > 0 ? (
            <div className={styles.projectShelf}>
              <h2>Projects</h2>
              {projects.map((item) => (
                <button key={item.id} type="button" onClick={() => void openProject(item.id)}>
                  <strong>{item.title}</strong>
                  <span>{readableUpdatedAt(item.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.structureRail} data-tutorial-target="slate-structure">
            <div className={styles.railHeader}>
              <div>
                <p className={styles.eyebrow}>Structure</p>
                <h2>{project.title}</h2>
              </div>
              <button
                type="button"
                className={styles.quietButton}
                onClick={() => {
                  void flushPendingManuscriptSave()
                    .then(() => setProject(null))
                    .catch(() => undefined);
                }}
              >
                Projects
              </button>
            </div>
            <div className={styles.projectSelect}>
              <select
                aria-label="Open Slate project"
                value={project.id}
                onChange={(event) => void openProject(event.target.value)}
              >
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={styles.shapeButton}
              data-tutorial-target="slate-shape"
              disabled={busy || saveState === "saving"}
              onClick={() => {
                if (project.structure.length > 0 && !window.confirm("Replace the current plan with a newly shaped one? The manuscript will stay untouched.")) return;
                void runProjectOperation("/shape");
              }}
            >
              {project.structure.length > 0 ? "Reshape plan" : "Shape with Slate"}
            </button>
            <div className={styles.structureList}>
              {project.structure.map((item, index) => (
                <article
                  key={item.id}
                  className={styles.structureCard}
                  data-selected={item.id === selectedStructureId ? "true" : undefined}
                  data-locked={item.locked ? "true" : undefined}
                  onClick={() => setSelectedStructureId(item.id)}
                >
                  <div className={styles.structureCardTop}>
                    <span>{item.kind} · {item.status}</span>
                    <div>
                      <button
                        type="button"
                        aria-label={`Move ${item.title} up`}
                        disabled={busy || index === 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          void saveStructure(reorderSlateStructure(project.structure, item.id, -1));
                        }}
                      >↑</button>
                      <button
                        type="button"
                        aria-label={`Move ${item.title} down`}
                        disabled={busy || index === project.structure.length - 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          void saveStructure(reorderSlateStructure(project.structure, item.id, 1));
                        }}
                      >↓</button>
                      <button
                        type="button"
                        aria-label={item.locked ? `Unlock ${item.title}` : `Lock ${item.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void saveStructure(project.structure.map((candidate) => candidate.id === item.id ? { ...candidate, locked: !candidate.locked } : candidate));
                        }}
                      >{item.locked ? "◆" : "◇"}</button>
                    </div>
                  </div>
                  <input
                    value={item.title}
                    aria-label="Structure item title"
                    onChange={(event) => mutateStructureItem(item.id, { title: event.target.value })}
                    onBlur={() => void saveStructure(projectRef.current?.structure ?? project.structure)}
                  />
                  <textarea
                    value={item.summary}
                    aria-label={`${item.title} summary`}
                    rows={3}
                    onChange={(event) => mutateStructureItem(item.id, { summary: event.target.value })}
                    onBlur={() => void saveStructure(projectRef.current?.structure ?? project.structure)}
                  />
                  {item.id === selectedStructureId ? (
                    <textarea
                      className={styles.sceneDirection}
                      value={item.direction}
                      aria-label={`${item.title} direction`}
                      placeholder="Direction for this section"
                      rows={2}
                      onChange={(event) => mutateStructureItem(item.id, { direction: event.target.value })}
                      onBlur={() => void saveStructure(projectRef.current?.structure ?? project.structure)}
                    />
                  ) : null}
                  <button
                    type="button"
                    className={styles.removeStructureButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      void saveStructure(project.structure.filter((candidate) => candidate.id !== item.id));
                    }}
                  >Remove</button>
                </article>
              ))}
            </div>
            <button type="button" className={styles.addButton} onClick={addScene}>+ Add scene</button>
            <div className={styles.railFacts}>
              <section>
                <h3>Characters</h3>
                {project.characters.length > 0 ? project.characters.map((character) => (
                  <p key={character.id}><strong>{character.name}</strong><span>{character.role}</span></p>
                )) : <span>Shape the project to establish the cast.</span>}
              </section>
              <section>
                <h3>Unresolved threads</h3>
                {project.unresolvedThreads.length > 0 ? project.unresolvedThreads.map((thread) => (
                  <p key={thread.id}>{thread.label}</p>
                )) : <span>Open questions will collect here.</span>}
              </section>
            </div>
          </aside>

          <section className={styles.manuscriptPane}>
            <div className={styles.manuscriptHeader}>
              <div>
                <p className={styles.eyebrow}>{project.phase}</p>
                <h1>{project.title}</h1>
              </div>
              <div className={styles.saveStatus} data-state={saveState} role="status" aria-live="polite">
                {saveState === "saving" ? "Saving…" : saveState === "error" ? "Autosave needs attention" : `Saved · ${project.manuscriptLength.toLocaleString()} characters`}
              </div>
            </div>
            {project.premise ? <p className={styles.premise}>{project.premise}</p> : null}
            {project.sparkWildcards ? (
              <details className={styles.wildcardOrigin}>
                <summary>Created from {"{wildcards}"}</summary>
                <span>Original spark</span>
                <p>{project.sparkWildcards.template}</p>
                <span>Resolved spark</span>
                <p>{project.spark}</p>
              </details>
            ) : null}
            <textarea
              className={styles.manuscript}
              data-tutorial-target="slate-manuscript"
              value={project.manuscript}
              onChange={(event) => {
                const manuscript = event.target.value;
                setProject((current) => current ? { ...current, manuscript, manuscriptLength: manuscript.length } : current);
              }}
              onSelect={(event) => setSelection({
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              })}
              placeholder="Shape a plan, select a scene, and let Slate draft—or begin writing directly."
              spellCheck
            />
            <div className={styles.manuscriptFooter}>
              <button type="button" className={styles.quietButton} disabled={busy || selection.end <= selection.start} onClick={lockSelection}>
                Lock selection
              </button>
              {project.lockedRanges.map((range) => (
                <button
                  key={range.id}
                  type="button"
                  className={styles.lockChip}
                  title="Remove this manuscript lock"
                  onClick={() => {
                    setBusy(true);
                    void patchProject({ lockedRanges: project.lockedRanges.filter((candidate) => candidate.id !== range.id) })
                      .catch((cause) => setError(cause instanceof Error ? cause.message : "Slate could not remove the lock."))
                      .finally(() => setBusy(false));
                  }}
                >◆ {range.label || "Locked prose"} ×</button>
              ))}
            </div>
          </section>

          <aside className={styles.directionPanel} data-tutorial-target="slate-direction">
            <p className={styles.eyebrow}>Direction</p>
            <h2>What happens next?</h2>
            <p className={styles.directionScope}>
              {selectedStructureItem ? `Selected: ${selectedStructureItem.title}` : "Select a structural card or manuscript passage."}
            </p>
            <textarea
              value={draftDirection}
              onChange={(event) => setDraftDirection(event.target.value)}
              placeholder="One concise instruction for the next draft…"
              rows={5}
            />
            <button
              type="button"
              className={styles.primaryButton}
              data-tutorial-target="slate-draft"
              disabled={busy || saveState === "saving" || !selectedStructureItem || selectedStructureItem.status === "drafted"}
              onClick={() => selectedStructureItem && void runProjectOperation("/draft", {
                structureItemId: selectedStructureItem.id,
                direction: draftDirection,
              })}
            >
              {selectedStructureItem?.status === "drafted" ? "Scene drafted" : "Draft selected section"}
            </button>

            <div className={styles.refineBlock} data-tutorial-target="slate-revision">
              <div className={styles.refineHeader}>
                <h3>Refine</h3>
                <span>{revisionScope}</span>
              </div>
              <div className={styles.actionGrid}>
                {(["deepen", "condense", "rewrite", "reframe", "cut"] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    data-selected={revisionAction === action ? "true" : undefined}
                    onClick={() => setRevisionAction(action)}
                  >{revisionLabel(action)}</button>
                ))}
              </div>
              <textarea
                value={revisionDirection}
                onChange={(event) => setRevisionDirection(event.target.value)}
                placeholder="Optional nuance for this revision…"
                rows={3}
              />
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy || saveState === "saving" || !project.manuscript.trim() || !!pendingRevision}
                onClick={requestRevision}
              >{pendingRevision ? "Resolve current proposal" : `Preview ${revisionLabel(revisionAction)}`}
              </button>

              {pendingRevision ? (
                <div className={styles.revisionPreview}>
                  <p>Proposed {pendingRevision.action}</p>
                  <div>
                    <section><span>Current</span><pre>{pendingRevision.originalText}</pre></section>
                    <section><span>Proposed</span><pre>{pendingRevision.proposedText || "Cut this passage."}</pre></section>
                  </div>
                  <footer>
                    <button type="button" className={styles.quietButton} disabled={busy} onClick={() => void runProjectOperation(`/revisions/${encodeURIComponent(pendingRevision.id)}/reject`)}>Reject</button>
                    <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void runProjectOperation(`/revisions/${encodeURIComponent(pendingRevision.id)}/accept`)}>Accept revision</button>
                  </footer>
                </div>
              ) : null}
            </div>

            <p className={styles.providerNote}>
              Slate uses your current account provider and model defaults. Locked
              material and newer human edits remain authoritative.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
