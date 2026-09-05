import { HttpError } from "./utils.http.ts";

export type MysteryItemTextRepairActionV1 = "repair_evidence_name" | "repair_evidence_description";

/** Remove only implementation boilerplate and exact repeated observations.
 * Distinct public facts, including negations and measurements, stay intact. */
export function cleanMysteryItemDescriptionV1(value: string): string {
  const sentences = value.replace(/\s+/gu, " ").trim()
    // Forge templates can echo a title's first word as its own adjective ("the
    // stained Stained Glass Fragment"); a repeat that differs only by case goes.
    .replace(/\b(\p{L}+) (\p{Lu}\p{L}*)\b/gu, (whole: string, first: string, second: string) =>
      first.toLocaleLowerCase() === second.toLocaleLowerCase() ? second : whole)
    .split(/(?<=[.!?])\s+/u);
  const seen = new Set<string>();
  return sentences.map((part) => part.trim()).filter((part) => {
    if (/\bPRISM\b.*\b(?:fallback|archetype|bundled|generic prop)\b|\b(?:fallback|bundled)\b.*\b(?:asset|artwork|sprite|prop identity)\b/iu.test(part)) return false;
    const key = part.replace(/[.!?]+$/u, "").trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(" ");
}

/** The model can approve only this bounded, extractive correction. It cannot
 * invent a name or omit a distinct admitted observation. No graph is input. */
export function mysteryItemTextRepairCandidateV1(args: {
  action: MysteryItemTextRepairActionV1;
  title: string;
  description: string;
  canonicalTitle: string;
  genericVisualFallback: boolean;
}): string {
  const description = cleanMysteryItemDescriptionV1(args.description);
  if (args.action === "repair_evidence_description") {
    if (!description || description.length > 6_000) throw new HttpError(409, "This item has no safely repairable public description.");
    return description;
  }
  // Old generic prop labels can disagree with the object already described to
  // the player. A literal opening noun phrase takes precedence over that art.
  const physicalSubject = args.genericVisualFallback
    ? description.match(/^(?:a|an|the)\s+([\p{L}\p{N} '-]{2,80}?)\s+(?:with|has|have|is|was|were|lies|rests|bears|shows|carries|contains|sits|stands|had)\b/iu)?.[1]
    : null;
  const title = (physicalSubject ?? args.canonicalTitle)
    .replace(/([a-z])([A-Z])/gu, "$1 $2").replace(/\s+/gu, " ").trim();
  if (!title || title.length > 120 || title.split(" ").length > 12 || /[\n{}<>]/u.test(title)) {
    throw new HttpError(409, "This item has no safely repairable public name.");
  }
  return title[0]!.toLocaleUpperCase() + title.slice(1);
}

export function validateMysteryItemTextRepairV1(raw: string, candidate: string): string {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("The item repair did not return valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    (value as { replacement?: unknown }).replacement !== candidate) {
    throw new Error("The replacement changed the admitted item facts.");
  }
  return candidate;
}
