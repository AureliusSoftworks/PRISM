"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  IMAGE_ASSET_KIND_LABELS,
  type ImageAssetCatalogPage,
  type ImageAssetKind,
  type ImageProviderName,
  type ImageAssetSet,
} from "@localai/shared";
import {
  PrismRefractTarget,
  requestPrismRefract,
  type PrismRefractMagicTarget,
} from "./prismRefract";
import sharedStyles from "./page.module.css";
import styles from "./AssetLibrary.module.css";
import { useViewportAssetSrc } from "./useViewportAssetSrc";

interface AssetApiResponse extends ImageAssetCatalogPage {
  ok: boolean;
}

interface DeleteAssetSetResponse {
  ok: boolean;
  result: {
    assetSetId: string;
    imageIds: string[];
    recoveryId: string;
    recoveryBytes: number;
  };
}

interface CleanupConfirmation {
  assetSetIds: string[];
  assetCount: number;
  storageBytes: number;
}

interface MagentaPassResponse {
  ok: boolean;
  asset: ImageAssetSet;
  result: {
    assetSetId: string;
    changedPixels: number;
    passCount: number;
    undoAvailable: boolean;
  };
}

export interface AssetRailProps {
  kind: ImageAssetKind;
  label?: string;
  viewAllLabel?: string;
  context?: string | null;
  currentImageIds?: readonly (string | null | undefined)[];
  refreshKey?: string | number | null;
  disabled?: boolean;
  synthesizeDisabled?: boolean;
  onOpenStorageSettings?: () => void;
  onUpload?: () => void;
  /** General Images owns its existing header picker; typed rails own this compact choice. */
  generation?: AssetRailGenerationControl;
  onSynthesize: (
    direction: string,
    selection?: AssetGenerationSelection,
  ) => void | Promise<void>;
  onSelect: (asset: ImageAssetSet) => void | Promise<void>;
}

export interface AssetGenerationSelection {
  provider: ImageProviderName;
  model: string;
}

export interface AssetGenerationOption extends AssetGenerationSelection {
  label: string;
}

export interface AssetRailGenerationControl {
  selection: AssetGenerationSelection | null;
  options: readonly AssetGenerationOption[];
  loading?: boolean;
  disabled?: boolean;
  onChange: (selection: AssetGenerationSelection) => void | Promise<void>;
}

function primaryMember(asset: ImageAssetSet) {
  return (
    asset.members.find((member) => member.role === "primary") ??
    asset.members.find((member) => member.role === "dark") ??
    asset.members[0] ??
    null
  );
}

function assetSourceLabel(asset: ImageAssetSet): string {
  return asset.source === "uploaded"
    ? "Uploaded"
    : asset.source === "legacy"
      ? "Legacy"
      : "Generated";
}

function assetDisplayTitle(asset: ImageAssetSet): string {
  if (asset.kind === "debate_exhibit") {
    for (const candidate of [asset.title, primaryMember(asset)?.prompt ?? ""]) {
      const match = candidate.match(
        /depicting exactly:\s*["“']([^"”']+)["”']/iu,
      );
      if (match?.[1]?.trim()) return match[1].trim();
    }
  }
  return asset.title.trim() || IMAGE_ASSET_KIND_LABELS[asset.kind].replace(/s$/u, "");
}

function formatStorageBytes(bytes: number): string {
  const bounded = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (bounded < 1024) return `${Math.round(bounded)} B`;
  if (bounded < 1024 * 1024) {
    return `${Math.max(1, Math.round(bounded / 1024))} KB`;
  }
  if (bounded < 1024 * 1024 * 1024) {
    return `${(bounded / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bounded / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? "The local asset library is unavailable.");
  }
  return payload;
}

function ViewportAssetThumb({
  src,
  fallbackSrc,
  className,
  kind,
}: {
  src: string;
  fallbackSrc?: string | null;
  className?: string;
  kind?: string;
}) {
  const [failedThumb, setFailedThumb] = useState(false);
  const preferred = failedThumb
    ? fallbackSrc?.trim() || src
    : src;
  const { src: activeSrc, imgRef } = useViewportAssetSrc(preferred);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={activeSrc}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      data-asset-preview-kind={kind}
      data-viewport-loaded={activeSrc ? "true" : "false"}
      onError={() => {
        if (!failedThumb && fallbackSrc?.trim() && fallbackSrc !== src) {
          setFailedThumb(true);
        }
      }}
    />
  );
}

function AssetPreview({ asset }: { asset: ImageAssetSet }) {
  const light = asset.members.find((member) => member.role === "light");
  const dark = asset.members.find((member) => member.role === "dark");
  if (asset.kind === "signal_studio" && light && dark) {
    return (
      <span className={styles.studioPreview} aria-hidden="true">
        <ViewportAssetThumb
          src={light.thumbnailUrl}
          fallbackSrc={light.url}
          kind={asset.kind}
        />
        <ViewportAssetThumb
          src={dark.thumbnailUrl}
          fallbackSrc={dark.url}
          kind={asset.kind}
        />
        <small>Light</small>
        <small>Dark</small>
      </span>
    );
  }
  const member = primaryMember(asset);
  return member ? (
    <ViewportAssetThumb
      src={member.thumbnailUrl}
      fallbackSrc={member.url}
      kind={asset.kind}
    />
  ) : (
    <span className={styles.missingPreview} aria-hidden="true">◇</span>
  );
}

export function AssetRail({
  kind,
  label,
  viewAllLabel = "View all",
  context,
  currentImageIds = [],
  refreshKey,
  disabled = false,
  synthesizeDisabled = false,
  onOpenStorageSettings,
  onUpload,
  generation,
  onSynthesize,
  onSelect,
}: AssetRailProps) {
  const reactId = useId().replaceAll(":", "");
  const targetId = `asset-add:${kind}:${reactId}`;
  const [assets, setAssets] = useState<ImageAssetSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const generationUnavailable = Boolean(
    generation && (generation.loading || generation.selection === null),
  );
  const currentIds = useMemo(
    () => new Set(currentImageIds.filter((value): value is string => Boolean(value))),
    [currentImageIds],
  );

  const loadRecent = useCallback(async (): Promise<void> => {
    setLoading(true);
    setUnavailable(false);
    try {
      const query = new URLSearchParams({ kind, limit: "5", sort: "recency" });
      if (context?.trim()) query.set("context", context.trim());
      const result = await readJson<AssetApiResponse>(
        await fetch(`/api/assets?${query.toString()}`),
      );
      setAssets(result.assets);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [context, kind]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent, refreshKey]);

  const synthesizeTarget = useMemo<PrismRefractMagicTarget>(
    () => ({
      id: targetId,
      kind: "magic",
      label: `Synthesize ${IMAGE_ASSET_KIND_LABELS[kind].replace(/s$/u, "")}`,
      disabled: () => disabled || synthesizeDisabled || generationUnavailable,
      run: async (direction) => {
        await onSynthesize(direction, generation?.selection ?? undefined);
        await loadRecent();
      },
    }),
    [
      disabled,
      generation?.selection,
      generationUnavailable,
      kind,
      loadRecent,
      onSynthesize,
      synthesizeDisabled,
      targetId,
    ],
  );

  return (
    <section
      className={styles.railShell}
      aria-label={label ?? IMAGE_ASSET_KIND_LABELS[kind]}
      data-asset-rail-kind={kind}
    >
      <header>
        <div>
          <strong>{label ?? IMAGE_ASSET_KIND_LABELS[kind]}</strong>
          <small>
            {onUpload
              ? "Upload, synthesize, or reuse an asset."
              : "Synthesize a new image or reuse a recent one."}
          </small>
        </div>
        <div className={styles.railHeaderActions}>
          {onOpenStorageSettings ? (
            <button
              type="button"
              className={sharedStyles.linkButton}
              data-asset-storage-settings-shortcut={kind}
              onClick={onOpenStorageSettings}
            >
              Storage Settings
            </button>
          ) : null}
          <button
            type="button"
            className={sharedStyles.linkButton}
            data-asset-library-shortcut={kind}
            onClick={() => setModalOpen(true)}
          >
            {viewAllLabel}
          </button>
        </div>
      </header>
      <div className={styles.rail}>
        {onUpload ? (
          <button
            type="button"
            className={`${styles.addTile} ${sharedStyles.imageThumbWrap}`}
            onClick={onUpload}
            disabled={disabled}
            aria-label={`Upload ${IMAGE_ASSET_KIND_LABELS[kind]}`}
          >
            <span aria-hidden="true">＋</span>
            <small>Upload</small>
          </button>
        ) : null}
        <div className={styles.synthesisControl}>
          <PrismRefractTarget target={synthesizeTarget}>
            {(binding) => (
              <button
                {...binding}
                type="button"
                className={`${styles.addTile} ${sharedStyles.imageThumbWrap}`}
                onClick={() =>
                  requestPrismRefract(targetId, "focused-shortcut")
                }
                disabled={disabled || synthesizeDisabled || generationUnavailable}
                data-tutorial-target={`asset-add-${kind}`}
                aria-label={`Synthesize ${IMAGE_ASSET_KIND_LABELS[kind]}`}
              >
                <span aria-hidden="true">◇</span>
                <small>Synthesize</small>
              </button>
            )}
          </PrismRefractTarget>
          {generation ? (
            <label className={styles.generationSelector}>
              <span>Model</span>
              <select
                aria-label={`${IMAGE_ASSET_KIND_LABELS[kind]} generation model`}
                value={
                  generation.selection
                    ? `${generation.selection.provider}:${generation.selection.model}`
                    : ""
                }
                disabled={
                  disabled ||
                  synthesizeDisabled ||
                  generation.disabled ||
                  generation.loading ||
                  generation.options.length === 0
                }
                onChange={(event) => {
                  const selected = generation.options.find(
                    (option) =>
                      `${option.provider}:${option.model}` === event.target.value,
                  );
                  if (selected) {
                    void generation.onChange({
                      provider: selected.provider,
                      model: selected.model,
                    });
                  }
                }}
              >
                {generation.selection === null ? (
                  <option value="">
                    {generation.loading ? "Loading models…" : "No image model"}
                  </option>
                ) : null}
                {generation.options.map((option) => (
                  <option
                    key={`${option.provider}:${option.model}`}
                    value={`${option.provider}:${option.model}`}
                  >
                    {option.provider === "local" ? "LOCAL · " : "ONLINE · "}
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {loading ? (
          <span className={styles.railStatus}>Loading…</span>
        ) : unavailable ? (
          <button
            type="button"
            className={`${styles.railStatus} ${sharedStyles.linkButton}`}
            onClick={() => void loadRecent()}
          >
            Retry library
          </button>
        ) : (
          assets.map((asset) => {
            const selected = asset.members.some((member) => currentIds.has(member.imageId));
            return (
              <button
                key={asset.id}
                type="button"
                className={`${styles.assetTile} ${sharedStyles.imageThumbWrap}`}
                aria-pressed={selected}
                title={asset.title}
                onClick={() => void onSelect(asset)}
                disabled={disabled || selected}
              >
                <AssetPreview asset={asset} />
                <span className={styles.badge} data-source={asset.source}>
                  {assetSourceLabel(asset)}
                </span>
                {selected ? <span className={styles.selected}>✓</span> : null}
              </button>
            );
          })
        )}
      </div>
      {modalOpen ? (
        <AssetLibraryModal
          kind={kind}
          context={context}
          currentImageIds={[...currentIds]}
          allowDelete
          onClose={() => {
            setModalOpen(false);
            void loadRecent();
          }}
          onSelect={async (asset) => {
            await onSelect(asset);
            setModalOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

export interface AssetLibraryModalProps {
  kind: ImageAssetKind;
  theme?: "light" | "dark";
  context?: string | null;
  currentImageIds?: readonly string[];
  includeIncomplete?: boolean;
  allowDelete?: boolean;
  onClose: () => void;
  onSelect?: (asset: ImageAssetSet) => void | Promise<void>;
}

export function AssetLibraryModal({
  kind,
  theme = "dark",
  context,
  currentImageIds = [],
  includeIncomplete = false,
  allowDelete = false,
  onClose,
  onSelect,
}: AssetLibraryModalProps) {
  const headingId = useId();
  const modalRootRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | "generated" | "uploaded">("all");
  const [usage, setUsage] = useState<"all" | "used" | "unused">("all");
  const [sort, setSort] = useState<"relevance" | "recency">("relevance");
  const [assets, setAssets] = useState<ImageAssetSet[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<ImageAssetSet | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [visibleStorageBytes, setVisibleStorageBytes] = useState<number | null>(
    null,
  );
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupConfirmation, setCleanupConfirmation] =
    useState<CleanupConfirmation | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<
    string | null
  >(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [magentaConfirmation, setMagentaConfirmation] = useState(false);
  const [magentaBusy, setMagentaBusy] = useState<"apply" | "undo" | null>(
    null,
  );
  const [compressBusy, setCompressBusy] = useState<"apply" | "undo" | null>(
    null,
  );
  const [compressConfirmation, setCompressConfirmation] = useState(false);
  const currentIds = useMemo(() => new Set(currentImageIds), [currentImageIds]);
  const detailIsCurrent =
    detail?.members.some((member) => currentIds.has(member.imageId)) ?? false;
  const clearableShownAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.source === "generated" &&
          asset.usageCount === 0 &&
          !asset.members.some((member) => currentIds.has(member.imageId)) &&
          asset.members.length > 0,
      ),
    [assets, currentIds],
  );

  const load = useCallback(
    async (cursor: string | null, append: boolean): Promise<void> => {
      setLoading(true);
      setError(null);
      if (!append) {
        setCleanupConfirmation(null);
        setNotice(null);
      }
      try {
        const params = new URLSearchParams({ kind, limit: "24", sort });
        if (query.trim()) params.set("q", query.trim());
        if (context?.trim()) params.set("context", context.trim());
        if (source !== "all") params.set("source", source);
        if (usage !== "all") params.set("usage", usage);
        if (includeIncomplete) params.set("includeIncomplete", "1");
        if (cursor) params.set("cursor", cursor);
        const result = await readJson<AssetApiResponse>(
          await fetch(`/api/assets?${params.toString()}`),
        );
        setAssets((current) => append ? [...current, ...result.assets] : result.assets);
        setNextCursor(result.nextCursor);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The library could not be opened.");
      } finally {
        setLoading(false);
      }
    },
    [context, includeIncomplete, kind, query, sort, source, usage],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(null, false), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (assets.length === 0) {
      setVisibleStorageBytes(0);
      return;
    }
    const controller = new AbortController();
    setVisibleStorageBytes(null);
    void fetch("/api/assets/storage/visible", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetSetIds: assets.map((asset) => asset.id) }),
        signal: controller.signal,
      })
      .then((response) => readJson<{ ok: boolean; bytes: number }>(response))
      .then((result) => setVisibleStorageBytes(result.bytes))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setVisibleStorageBytes(null);
      });
    return () => controller.abort();
  }, [assets]);

  useEffect(() => {
    const modalRoot = modalRootRef.current;
    if (!modalRoot) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const siblingStates = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== modalRoot,
      )
      .map((element) => ({
        element,
        wasInert: element.hasAttribute("inert"),
      }));
    siblingStates.forEach(({ element }) => element.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() =>
      (searchRef.current ?? modalRoot).focus({ preventScroll: true }),
    );
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        modalRoot.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        modalRoot.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !modalRoot.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !modalRoot.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      siblingStates.forEach(({ element, wasInert }) => {
        if (!wasInert) element.removeAttribute("inert");
      });
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [onClose]);

  const replaceAsset = (asset: ImageAssetSet): void => {
    setDetail(asset);
    setAssets((current) =>
      current.map((candidate) => (candidate.id === asset.id ? asset : candidate)),
    );
  };

  const openDetail = (asset: ImageAssetSet): void => {
    setDetail(asset);
    setTagDraft(asset.playerTags.join(", "));
    setMagentaConfirmation(false);
    setCompressConfirmation(false);
    setDeleteConfirmationId(null);
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollTo({ top: 0 });
    });
    if (asset.automaticTags.length < 3) {
      void (async () => {
        try {
          const response = await readJson<{ ok: boolean; asset: ImageAssetSet }>(
            await fetch(`/api/assets/${encodeURIComponent(asset.id)}/smart-tags`, {
              method: "POST",
              credentials: "include",
              body: "{}",
            }),
          );
          replaceAsset(response.asset);
        } catch {
          // Heuristic backfill is best-effort.
        }
      })();
    }
  };

  const applyMagentaPass = async (): Promise<void> => {
    if (!detail || !magentaConfirmation || magentaBusy) return;
    const target = detail;
    setMagentaBusy("apply");
    setError(null);
    setNotice(null);
    try {
      const response = await readJson<MagentaPassResponse>(
        await fetch(
          `/api/assets/${encodeURIComponent(target.id)}/magenta-pass`,
          { method: "POST", credentials: "include", body: "{}" },
        ),
      );
      replaceAsset(response.asset);
      setMagentaConfirmation(false);
      setNotice(
        response.result.changedPixels > 0
          ? `Magenta reduced. Pass ${response.result.passCount} can be undone or compounded with another pass.`
          : "No strong magenta remained to reduce.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The magenta pass could not be applied.",
      );
    } finally {
      setMagentaBusy(null);
    }
  };

  const undoMagentaPass = async (): Promise<void> => {
    if (!detail?.magentaUndoAvailable || magentaBusy) return;
    const target = detail;
    setMagentaBusy("undo");
    setError(null);
    setNotice(null);
    try {
      const response = await readJson<MagentaPassResponse>(
        await fetch(
          `/api/assets/${encodeURIComponent(target.id)}/magenta-pass/undo`,
          { method: "POST", credentials: "include", body: "{}" },
        ),
      );
      replaceAsset(response.asset);
      setMagentaConfirmation(false);
      setNotice(
        response.result.undoAvailable
          ? `Last magenta pass undone. ${response.result.passCount} earlier pass${response.result.passCount === 1 ? " remains" : "es remain"} undoable.`
          : "Last magenta pass undone.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The magenta pass could not be undone.",
      );
    } finally {
      setMagentaBusy(null);
    }
  };

  const applyCompress = async (): Promise<void> => {
    if (!detail || !compressConfirmation || compressBusy) return;
    const target = detail;
    setCompressBusy("apply");
    setError(null);
    setNotice(null);
    try {
      const response = await readJson<{ ok: boolean; asset: ImageAssetSet }>(
        await fetch(`/api/assets/${encodeURIComponent(target.id)}/compress`, {
          method: "POST",
          credentials: "include",
          body: "{}",
        }),
      );
      replaceAsset(response.asset);
      setCompressConfirmation(false);
      setNotice(
        "Compressed this asset for disk. Undo restores the previous resolution.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Compress could not be applied.",
      );
    } finally {
      setCompressBusy(null);
    }
  };

  const undoCompress = async (): Promise<void> => {
    if (!detail?.compressUndoAvailable || compressBusy) return;
    const target = detail;
    setCompressBusy("undo");
    setError(null);
    setNotice(null);
    try {
      const response = await readJson<{ ok: boolean; asset: ImageAssetSet }>(
        await fetch(
          `/api/assets/${encodeURIComponent(target.id)}/compress/undo`,
          { method: "POST", credentials: "include", body: "{}" },
        ),
      );
      replaceAsset(response.asset);
      setCompressConfirmation(false);
      setNotice("Compress Undo restored the previous resolution.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Compress could not be undone.",
      );
    } finally {
      setCompressBusy(null);
    }
  };

  const saveTags = async (): Promise<void> => {
    if (!detail) return;
    try {
      const result = await readJson<{ ok: boolean; asset: ImageAssetSet }>(
        await fetch(`/api/assets/${encodeURIComponent(detail.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tags: tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean) }),
        }),
      );
      setDetail(result.asset);
      setAssets((current) => current.map((asset) => asset.id === result.asset.id ? result.asset : asset));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tags could not be saved.");
    }
  };

  const deleteAsset = async (): Promise<void> => {
    if (
      !detail ||
      !allowDelete ||
      deleteConfirmationId !== detail.id ||
      deletingAssetId
    ) return;
    const deleting = detail;
    setDeletingAssetId(deleting.id);
    setError(null);
    setNotice(null);
    try {
      const { result } = await readJson<DeleteAssetSetResponse>(
        await fetch(`/api/assets/${encodeURIComponent(deleting.id)}`, {
          method: "DELETE",
          credentials: "include",
        }),
      );
      setAssets((current) =>
        current.filter((asset) => asset.id !== deleting.id),
      );
      setDetail(null);
      setDeleteConfirmationId(null);
      setNotice(
        `Moved 1 unused asset (${formatStorageBytes(result.recoveryBytes)}) to recovery trash.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The asset could not be deleted.");
    } finally {
      setDeletingAssetId(null);
    }
  };

  const prepareClearUnusedShown = async (): Promise<void> => {
    if (cleanupBusy || clearableShownAssets.length === 0) return;
    const shownAtStart = clearableShownAssets;
    setCleanupBusy(true);
    setError(null);
    setNotice(null);
    try {
      const assetSetIds = shownAtStart.map((asset) => asset.id);
      const { bytes } = await readJson<{
        ok: boolean;
        bytes: number;
      }>(
        await fetch("/api/assets/storage/visible", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assetSetIds }),
        }),
      );
      if (assetSetIds.length === 0) {
        setNotice("No safely clearable unused assets are currently shown.");
        return;
      }
      setCleanupConfirmation({
        assetSetIds,
        assetCount: shownAtStart.length,
        storageBytes: bytes,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unused assets could not be checked.",
      );
    } finally {
      setCleanupBusy(false);
    }
  };

  const confirmClearUnusedShown = async (): Promise<void> => {
    const confirmation = cleanupConfirmation;
    if (!confirmation || cleanupBusy) return;
    setCleanupBusy(true);
    setError(null);
    setNotice(null);
    try {
      const clearedSetIds = new Set<string>();
      let recoveryBytes = 0;
      const failures: string[] = [];
      for (const assetSetId of confirmation.assetSetIds) {
        try {
          const { result } = await readJson<DeleteAssetSetResponse>(
            await fetch(`/api/assets/${encodeURIComponent(assetSetId)}`, {
              method: "DELETE",
              credentials: "include",
            }),
          );
          clearedSetIds.add(result.assetSetId);
          recoveryBytes += result.recoveryBytes;
        } catch (caught) {
          failures.push(
            caught instanceof Error
              ? caught.message
              : "An asset became protected before it could be deleted.",
          );
        }
      }
      setDetail((current) =>
        current && clearedSetIds.has(current.id) ? null : current,
      );
      setCleanupConfirmation(null);
      await load(null, false);
      if (clearedSetIds.size > 0) {
        setNotice(
          `Moved ${clearedSetIds.size} unused asset${clearedSetIds.size === 1 ? "" : "s"} (${formatStorageBytes(recoveryBytes)}) to recovery trash.`,
        );
      }
      if (failures.length > 0) {
        setError(
          clearedSetIds.size > 0
            ? `${failures.length} asset${failures.length === 1 ? " was" : "s were"} kept because they became used or could not be safely verified.`
            : failures[0]!,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unused assets could not be moved to recovery trash.",
      );
    } finally {
      setCleanupBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={modalRootRef}
      className={`${styles.modalBackdrop} ${sharedStyles.imageLightboxBackdrop}`}
      data-theme={theme}
      role="presentation"
      tabIndex={-1}
      onClick={onClose}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-asset-library-kind={kind}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={`${styles.modalHeader} ${sharedStyles.panelHeader}`}>
          <div className={sharedStyles.panelHeaderTitleText}>
            <small>Local asset library</small>
            <h2 id={headingId}>{IMAGE_ASSET_KIND_LABELS[kind]}</h2>
          </div>
          <button
            type="button"
            className={sharedStyles.panelClose}
            onClick={onClose}
            aria-label="Close asset library"
          >
            ×
          </button>
        </header>
        <div
          className={`${styles.filters} ${sharedStyles.form} ${sharedStyles.formInModal}`}
        >
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={`Search ${IMAGE_ASSET_KIND_LABELS[kind].toLowerCase()}…`}
            aria-label="Search local assets"
          />
          <select value={source} onChange={(event) => setSource(event.currentTarget.value as typeof source)} aria-label="Asset source">
            <option value="all">Generated + uploaded</option>
            <option value="generated">Generated</option>
            <option value="uploaded">Uploaded</option>
          </select>
          <select value={usage} onChange={(event) => setUsage(event.currentTarget.value as typeof usage)} aria-label="Asset usage">
            <option value="all">Used + unused</option>
            <option value="used">Used</option>
            <option value="unused">Unused</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.currentTarget.value as typeof sort)} aria-label="Asset sorting">
            <option value="relevance">Relevance</option>
            <option value="recency">Most recent</option>
          </select>
        </div>
        {error ? (
          <p className={sharedStyles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.modalBody}>
          <div
            className={`${styles.assetGrid} ${sharedStyles.imageGrid}`}
            aria-live="polite"
          >
            {assets.map((asset) => {
              const selected = asset.members.some((member) => currentIds.has(member.imageId));
              const active = detail?.id === asset.id;
              return (
                <button
                  key={asset.id}
                  type="button"
                  className={`${styles.assetCard} ${sharedStyles.imageThumbWrap}`}
                  data-selected={selected ? "true" : undefined}
                  data-active={active ? "true" : undefined}
                  onClick={() => openDetail(asset)}
                  aria-label={`View details for ${assetDisplayTitle(asset)}`}
                >
                  <AssetPreview asset={asset} />
                  <span>
                    <strong>{assetDisplayTitle(asset)}</strong>
                    <small>
                      {assetSourceLabel(asset)} · {selected ? "Current" : asset.usageCount > 0 ? `Used ${asset.usageCount}` : "Unused"}
                    </small>
                  </span>
                  {asset.status !== "ready" ? <em>{asset.status}</em> : null}
                </button>
              );
            })}
            {!loading && assets.length === 0 ? (
              <p className={sharedStyles.muted}>
                No matching assets of this type.
              </p>
            ) : null}
          </div>
          {detail ? (
            <aside
              ref={detailRef}
              className={`${styles.detail} ${sharedStyles.settingsTutorialCard}`}
              aria-label="Asset details"
            >
              <header
                className={`${styles.detailHeader} ${sharedStyles.panelHeader}`}
              >
                <div className={sharedStyles.panelHeaderTitleText}>
                  <small>Asset details</small>
                  <h3>{assetDisplayTitle(detail)}</h3>
                </div>
                <button
                  type="button"
                  className={sharedStyles.panelClose}
                  onClick={() => setDetail(null)}
                  aria-label="Close asset details"
                >
                  ×
                </button>
              </header>
              <AssetPreview asset={detail} />
              <p>{detail.source === "legacy" ? "Protected legacy asset" : assetSourceLabel(detail)} · {new Date(detail.createdAt).toLocaleString()}</p>
              {detail.status === "ready" && primaryMember(detail) ? (
                <section
                  className={styles.magentaPass}
                  aria-label="Magenta cleanup"
                >
                  <div>
                    <strong>Magenta cleanup</strong>
                    <small>
                      Local and cumulative. Strong pinks or purples may also
                      soften, so each pass remains undoable.
                    </small>
                  </div>
                  {magentaConfirmation ? (
                    <div role="group" aria-label="Confirm magenta pass">
                      <span>
                        Apply one pass to this entire asset set?
                      </span>
                      <button
                        type="button"
                        className={sharedStyles.linkButton}
                        onClick={() => setMagentaConfirmation(false)}
                        disabled={magentaBusy !== null}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={sharedStyles.btnPrimary}
                        onClick={() => void applyMagentaPass()}
                        disabled={magentaBusy !== null}
                      >
                        {magentaBusy === "apply" ? "Applying…" : "Apply pass"}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        className={sharedStyles.accountLogoutButton}
                        onClick={() => setMagentaConfirmation(true)}
                        disabled={magentaBusy !== null}
                      >
                        Reduce magenta
                      </button>
                      {detail.magentaUndoAvailable ? (
                        <button
                          type="button"
                          className={sharedStyles.linkButton}
                          onClick={() => void undoMagentaPass()}
                          disabled={magentaBusy !== null}
                        >
                          {magentaBusy === "undo"
                            ? "Undoing…"
                            : `Undo last pass (${detail.magentaPassCount})`}
                        </button>
                      ) : null}
                    </div>
                  )}
                </section>
              ) : null}
              {detail.status === "ready" && primaryMember(detail) ? (
                <section
                  className={styles.magentaPass}
                  aria-label="Compress size"
                >
                  <div>
                    <strong>Compress size</strong>
                    <small>
                      Cuts resolution about in half when the longest edge is
                      large. Keeps a local Undo beside Magenta.
                    </small>
                  </div>
                  {compressConfirmation ? (
                    <div role="group" aria-label="Confirm compress">
                      <span>Compress this asset set for disk?</span>
                      <button
                        type="button"
                        className={sharedStyles.linkButton}
                        onClick={() => setCompressConfirmation(false)}
                        disabled={compressBusy !== null}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={sharedStyles.btnPrimary}
                        onClick={() => void applyCompress()}
                        disabled={compressBusy !== null}
                      >
                        {compressBusy === "apply" ? "Compressing…" : "Compress"}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        className={sharedStyles.accountLogoutButton}
                        onClick={() => setCompressConfirmation(true)}
                        disabled={compressBusy !== null}
                      >
                        Compress size
                      </button>
                      {detail.compressUndoAvailable ? (
                        <button
                          type="button"
                          className={sharedStyles.linkButton}
                          onClick={() => void undoCompress()}
                          disabled={compressBusy !== null}
                        >
                          {compressBusy === "undo" ? "Undoing…" : "Undo compress"}
                        </button>
                      ) : null}
                    </div>
                  )}
                </section>
              ) : null}
              {detail.usage.length > 0 ? (
                <div><strong>Used by</strong><ul>{detail.usage.map((item) => <li key={item.label}>{item.href ? <a href={item.href}>{item.label}</a> : item.label}</li>)}</ul></div>
              ) : <p>Not currently used.</p>}
              <div
                className={`${styles.tagEditor} ${sharedStyles.form} ${sharedStyles.formInModal}`}
              >
                <div className={styles.prismTags}>
                  <span>Prism tags</span>
                  {detail.automaticTags.length > 0 ? (
                    <ul>
                      {detail.automaticTags.map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                  ) : (
                    <small>Prism will label this asset when a local helper is available.</small>
                  )}
                </div>
                <label>
                  <span>Your tags</span>
                  <input
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.currentTarget.value)}
                    placeholder="character, project, mood"
                  />
                </label>
                <button
                  type="button"
                  className={sharedStyles.linkButton}
                  onClick={() => void saveTags()}
                >
                  Save tags
                </button>
              </div>
              {primaryMember(detail) ? (
                <details className={styles.generationDetails}>
                  <summary>Generation details</summary>
                  <div className={styles.generationDetailsBody}>
                    <dl className={styles.provenance}>
                      <div><dt>Provider</dt><dd>{primaryMember(detail)!.provider}</dd></div>
                      <div><dt>Model</dt><dd>{primaryMember(detail)!.model}</dd></div>
                      <div><dt>Prompt</dt><dd>{primaryMember(detail)!.prompt || "Not recorded"}</dd></div>
                    </dl>
                  </div>
                </details>
              ) : null}
              {detail.status !== "ready" && detail.kind === "signal_studio" ? (
                <p>
                  This studio set is incomplete. <Link href="/?view=botcast">Open Signal to retry synthesis</Link>,
                  or delete the unused partial set below.
                </p>
              ) : null}
              <div className={styles.detailActions}>
                {onSelect && detail.status === "ready" ? (
                  <button
                    type="button"
                    className={sharedStyles.btnPrimary}
                    onClick={() => void onSelect(detail)}
                    disabled={detailIsCurrent}
                  >
                    {detailIsCurrent ? "Already selected" : "Use this asset"}
                  </button>
                ) : null}
                {allowDelete && deleteConfirmationId !== detail.id ? (
                  <button
                    type="button"
                    className={sharedStyles.dangerButton}
                    onClick={() => setDeleteConfirmationId(detail.id)}
                    disabled={
                      detailIsCurrent ||
                      detail.usageCount > 0 ||
                      detail.source === "legacy" ||
                      deletingAssetId !== null
                    }
                  >
                    {detailIsCurrent
                      ? "Selected — protected"
                      : detail.usageCount > 0
                        ? "In use — protected"
                        : detail.source === "legacy"
                          ? "Legacy set — protected"
                          : "Delete unused asset"}
                  </button>
                ) : null}
              </div>
              {allowDelete && deleteConfirmationId === detail.id ? (
                <div
                  className={styles.cleanupConfirmation}
                  role="group"
                  aria-label="Confirm deleting unused asset"
                >
                  <span>
                    Move “{detail.title}” to recovery trash? You can restore it
                    from Storage.
                  </span>
                  <button
                    type="button"
                    className={sharedStyles.linkButton}
                    onClick={() => setDeleteConfirmationId(null)}
                    disabled={deletingAssetId !== null}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={sharedStyles.dangerButton}
                    onClick={() => void deleteAsset()}
                    disabled={deletingAssetId !== null}
                  >
                    {deletingAssetId === detail.id
                      ? "Moving…"
                      : "Move to recovery trash"}
                  </button>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
        <footer>
          <div className={styles.footerActions}>
            {nextCursor ? (
              <button
                type="button"
                className={sharedStyles.accountLogoutButton}
                onClick={() => void load(nextCursor, true)}
                disabled={loading}
              >
                Load more
              </button>
            ) : null}
            {notice ? (
              <span
                className={`${styles.footerNotice} ${sharedStyles.panelNotice}`}
                role="status"
              >
                {notice}
              </span>
            ) : null}
            {allowDelete && cleanupConfirmation ? (
              <div
                className={styles.cleanupConfirmation}
                role="group"
                aria-label="Confirm clearing unused assets"
              >
                <span>
                  Move {cleanupConfirmation.assetCount} unused asset
                  {cleanupConfirmation.assetCount === 1 ? "" : "s"} · {formatStorageBytes(cleanupConfirmation.storageBytes)}?
                </span>
                <button
                  type="button"
                  className={sharedStyles.linkButton}
                  onClick={() => setCleanupConfirmation(null)}
                  disabled={cleanupBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={sharedStyles.dangerButton}
                  onClick={() => void confirmClearUnusedShown()}
                  disabled={cleanupBusy}
                >
                  {cleanupBusy ? "Moving…" : "Move to recovery trash"}
                </button>
              </div>
            ) : allowDelete ? (
              <button
                type="button"
                className={`${styles.clearUnusedButton} ${sharedStyles.linkButton}`}
                onClick={() => void prepareClearUnusedShown()}
                disabled={cleanupBusy || clearableShownAssets.length === 0}
                title="Moves safely eligible unused generated assets currently shown to recovery trash."
              >
                {cleanupBusy ? "Checking unused…" : "Clear unused"}
              </button>
            ) : null}
          </div>
          {loading ? (
            <span>Loading local assets…</span>
          ) : (
            <span>
              {assets.length} shown · {visibleStorageBytes === null ? "Calculating storage…" : formatStorageBytes(visibleStorageBytes)}
            </span>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
