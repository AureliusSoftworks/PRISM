import type { DatabaseSync } from "node:sqlite";
import type { SlateContinuitySourceAnchor } from "@localai/shared";
import { hashContinuityText } from "./slate-continuity-index.ts";

interface SourceEvidenceRow {
  id: string;
  section_id: string | null;
  source_revision: number;
  content: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function anchorKey(anchor: SlateContinuitySourceAnchor): string {
  return [
    anchor.sourceId,
    anchor.sectionId ?? "",
    anchor.sectionRevision ?? "",
    anchor.start,
    anchor.end,
    anchor.quoteHash,
  ].join(":");
}

/**
 * Projects immutable Continuity evidence onto the latest authoritative prose.
 *
 * Earlier source rows remain useful history. Their derived records remain
 * current only while the exact quoted evidence still exists in the section's
 * newest source. Surviving evidence is re-anchored to that source so concern
 * previews never point at an obsolete manuscript revision.
 */
export class SlateContinuityCurrentCanonResolver {
  private readonly sourceById = new Map<string, SourceEvidenceRow | null>();
  private readonly latestSourceBySource = new Map<
    string,
    SourceEvidenceRow | null
  >();
  private readonly sourceStatement: ReturnType<DatabaseSync["prepare"]>;
  private readonly latestDescendantStatement: ReturnType<DatabaseSync["prepare"]>;
  private readonly userId: string;
  private readonly seriesId: string;

  constructor(
    db: DatabaseSync,
    userId: string,
    seriesId: string,
  ) {
    this.userId = userId;
    this.seriesId = seriesId;
    this.sourceStatement = db.prepare(
      `SELECT id, section_id, source_revision, content
         FROM slate_continuity_sources
        WHERE id = ? AND user_id = ? AND series_id = ?`,
    );
    this.latestDescendantStatement = db.prepare(
      `WITH RECURSIVE descendants(
         id, section_id, source_revision, content, created_at
       ) AS (
         SELECT id, section_id, source_revision, content, created_at
           FROM slate_continuity_sources
          WHERE id = ? AND user_id = ? AND series_id = ?
         UNION
         SELECT newer.id, newer.section_id, newer.source_revision,
                newer.content, newer.created_at
           FROM slate_continuity_sources AS newer
           JOIN descendants AS prior
             ON newer.supersedes_source_id = prior.id
          WHERE newer.user_id = ? AND newer.series_id = ?
       )
       SELECT id, section_id, source_revision, content
         FROM descendants
        ORDER BY source_revision DESC, created_at DESC, id DESC
        LIMIT 1`,
    );
  }

  fromJson(raw: string): SlateContinuitySourceAnchor[] {
    const values = this.anchorValues(raw);
    const byKey = new Map<string, SlateContinuitySourceAnchor>();
    for (const anchor of values) {
      const resolved = this.resolveAnchor(anchor);
      if (resolved) byKey.set(anchorKey(resolved), resolved);
    }
    return [...byKey.values()].sort(
      (left, right) =>
        left.sourceId.localeCompare(right.sourceId) ||
        left.start - right.start ||
        left.end - right.end,
    );
  }

  hasStaleAnchor(raw: string): boolean {
    const values = this.anchorValues(raw);
    return values.length > 0 && values.some((anchor) => !this.resolveAnchor(anchor));
  }

  recordIsCurrent(raw: string, fallbackSourceId: string | null): boolean {
    const values = this.anchorValues(raw);
    if (values.length > 0) {
      return values.some((anchor) => this.resolveAnchor(anchor) !== null);
    }
    return fallbackSourceId ? this.sourceIsLatest(fallbackSourceId) : false;
  }

  sourceEvidenceStillCurrent(sourceId: string, evidenceText?: string): boolean {
    const source = this.source(sourceId);
    if (!source) return false;
    const latest = this.latestDescendant(source.id);
    if (!latest) return false;
    if (latest.id === source.id) return true;
    return Boolean(evidenceText && latest.content.includes(evidenceText));
  }

  sourceIsLatest(sourceId: string): boolean {
    const source = this.source(sourceId);
    if (!source) return false;
    return this.latestDescendant(source.id)?.id === source.id;
  }

  private anchorValues(raw: string): SlateContinuitySourceAnchor[] {
    const parsed = parseJson<unknown>(raw, []);
    if (!Array.isArray(parsed)) return [];
    const anchors: SlateContinuitySourceAnchor[] = [];
    for (const value of parsed.slice(0, 64)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const candidate = value as Partial<SlateContinuitySourceAnchor>;
      if (
        typeof candidate.sourceId !== "string" ||
        (candidate.sectionId !== null &&
          typeof candidate.sectionId !== "string") ||
        (candidate.sectionRevision !== null &&
          !Number.isInteger(candidate.sectionRevision)) ||
        !Number.isInteger(candidate.start) ||
        !Number.isInteger(candidate.end) ||
        typeof candidate.quoteHash !== "string"
      ) {
        continue;
      }
      anchors.push(candidate as SlateContinuitySourceAnchor);
    }
    return anchors;
  }

  private resolveAnchor(
    anchor: SlateContinuitySourceAnchor,
  ): SlateContinuitySourceAnchor | null {
    const source = this.source(anchor.sourceId);
    if (
      !source ||
      anchor.sectionId !== source.section_id ||
      anchor.sectionRevision !== source.source_revision ||
      anchor.start < 0 ||
      anchor.end <= anchor.start ||
      anchor.end > source.content.length
    ) {
      return null;
    }
    const quote = source.content.slice(anchor.start, anchor.end);
    if (hashContinuityText(quote) !== anchor.quoteHash) return null;
    const latest = this.latestDescendant(source.id);
    if (!latest) return null;
    if (latest.id === source.id) return anchor;
    const start = latest.content.indexOf(quote);
    if (start < 0) return null;
    return {
      sourceId: latest.id,
      sectionId: latest.section_id,
      sectionRevision: latest.source_revision,
      start,
      end: start + quote.length,
      quoteHash: anchor.quoteHash,
    };
  }

  private source(sourceId: string): SourceEvidenceRow | null {
    if (this.sourceById.has(sourceId)) return this.sourceById.get(sourceId)!;
    const row = this.sourceStatement.get(
      sourceId,
      this.userId,
      this.seriesId,
    ) as SourceEvidenceRow | undefined;
    const resolved = row ?? null;
    this.sourceById.set(sourceId, resolved);
    return resolved;
  }

  private latestDescendant(sourceId: string): SourceEvidenceRow | null {
    if (this.latestSourceBySource.has(sourceId)) {
      return this.latestSourceBySource.get(sourceId)!;
    }
    const row = this.latestDescendantStatement.get(
      sourceId,
      this.userId,
      this.seriesId,
      this.userId,
      this.seriesId,
    ) as SourceEvidenceRow | undefined;
    const resolved = row ?? null;
    this.latestSourceBySource.set(sourceId, resolved);
    return resolved;
  }
}
