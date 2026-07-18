import type { SlateProjectDetail } from "@localai/shared";

function compactCoverContext(value: string, limit: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, limit);
}

export function composeSlateProjectCoverPrompt(
  project: Pick<SlateProjectDetail, "title" | "spark" | "premise" | "voice">,
): string {
  const title = compactCoverContext(project.title, 180) || "Untitled Story";
  const story =
    compactCoverContext(project.premise, 1_200) ||
    compactCoverContext(project.spark, 1_200) ||
    "An unwritten story waiting to take form.";
  const voice = compactCoverContext(project.voice, 500);
  return [
    "Create original portrait book-cover artwork for a private fiction-writing project.",
    `Working title: ${title}.`,
    `Story signal: ${story}.`,
    voice ? `Voice and tone: ${voice}.` : "Infer a distinctive literary tone from the story signal.",
    "Compose one iconic, emotionally specific image with confident negative space and a restrained cinematic finish.",
    "Subtly echo PRISM through refraction, spectral edge light, or divided color without using a literal rainbow logo.",
    "Artwork only: no title, letters, words, typography, borders, mock book, hands, shelves, or product photography.",
    "Portrait 2:3 composition, designed to remain legible as a small cover on a dark creative-production desk.",
  ].join(" ");
}
