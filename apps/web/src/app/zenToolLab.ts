import type { SentGeneratedImagePayload, ZenDisplayMetadata } from "@localai/shared";

export type ZenToolLabToolId =
  | "ask-question"
  | "ask-question-binary"
  | "story-actions"
  | "generated-image-result"
  | "zen-display";

export interface ZenToolLabDefinition {
  id: ZenToolLabToolId;
  label: string;
  description: string;
}

export interface ZenToolLabMessageSample {
  content: string;
  askQuestion?: {
    v: 1;
    name: "AskQuestion";
    prompt: string;
    options: Array<{ id: string; label: string }>;
  };
  tellFictionalStory?: {
    v: 1;
    name: "tellFictionalStory";
    continueLabel?: string;
    bookmarkLabel?: string;
    finishLabel?: string;
  };
  sentGeneratedImage?: SentGeneratedImagePayload;
  zenDisplay?: ZenDisplayMetadata;
}

export const ZEN_TOOL_LAB_DEV_IMAGE_ID = "dev-tool-lab-generated-image";
export const ZEN_TOOL_LAB_DEV_IMAGE_URL =
  "/story-themes/prism_default/cutscene_reference.png";

export const ZEN_TOOL_LAB_TOOLS: readonly ZenToolLabDefinition[] = [
  {
    id: "ask-question",
    label: "AskQuestion",
    description: "Three-choice chip rail",
  },
  {
    id: "ask-question-binary",
    label: "Yes / No",
    description: "Binary AskQuestion chips",
  },
  {
    id: "story-actions",
    label: "Story actions",
    description: "Continue, bookmark, finish rail",
  },
  {
    id: "generated-image-result",
    label: "Image result",
    description: "Generated image attachment",
  },
  {
    id: "zen-display",
    label: "Zen display",
    description: "Placed Zen text metadata",
  },
] as const;

export function isZenToolLabDevImageId(imageId: string | null | undefined): boolean {
  return imageId?.startsWith("dev-tool-lab-") === true;
}

export function zenToolLabStoryLabel(
  label: string | null | undefined,
  fallback: string
): string {
  const cleaned = label?.replace(/\s+/g, " ").trim() ?? "";
  return cleaned.length > 0 ? cleaned : fallback;
}

function buildAskQuestionSample(binary: boolean): ZenToolLabMessageSample {
  return {
    content:
      binary
        ? "Binary **AskQuestion** preview from Tool Lab.\n\n_Ephemeral - this row only exists in this browser tab._"
        : "Sample **AskQuestion** rail preview from Tool Lab.\n\n_Ephemeral - this row only exists in this browser tab._",
    askQuestion: {
      v: 1,
      name: "AskQuestion",
      prompt: binary ? "Binary preview (tap a chip)" : "Dev preview (tap a chip)",
      options: binary
        ? [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
          ]
        : [
            { id: "a", label: "Smoke A" },
            { id: "b", label: "Smoke B" },
            { id: "c", label: "Smoke C" },
          ],
    },
  };
}

export function buildZenToolLabMessageSample(id: ZenToolLabToolId): ZenToolLabMessageSample {
  switch (id) {
    case "ask-question":
      return buildAskQuestionSample(false);
    case "ask-question-binary":
      return buildAskQuestionSample(true);
    case "story-actions":
      return {
        content:
          "A narrow door opens under the old observatory, and the stairs below are warm with impossible starlight.\n\n_Ephemeral Tool Lab story rail._",
        tellFictionalStory: {
          v: 1,
          name: "tellFictionalStory",
          continueLabel: zenToolLabStoryLabel("Follow the stairs", "Keep Going"),
          bookmarkLabel: zenToolLabStoryLabel("Mark this scene", "Bookmark"),
          finishLabel: zenToolLabStoryLabel("End the tale", "End Story"),
        },
      };
    case "generated-image-result":
      return {
        content:
          "Tool Lab generated-image result preview. This uses a static dev image and does not call the image pipeline.",
        sentGeneratedImage: {
          imageId: ZEN_TOOL_LAB_DEV_IMAGE_ID,
          prompt: "A luminous PRISM test scene for validating generated image rendering.",
          displayUrl: ZEN_TOOL_LAB_DEV_IMAGE_URL,
          imageModel: "dev/tool-lab",
        },
      };
    case "zen-display":
      return {
        content: "Center line.\n\nThen the thought lands lower, quieter.",
        zenDisplay: {
          v: 1,
          lines: [
            { index: 0, x: 0.5, y: 0.28, align: "center" },
            { index: 2, x: 0.5, y: 0.58, align: "center" },
          ],
        },
      };
  }
}
