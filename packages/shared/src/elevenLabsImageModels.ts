export const ELEVENLABS_IMAGE_MODEL_IDS = [
  "elevenlabs-image:gpt-image-2",
  "elevenlabs-image:nano-banana-2",
  "elevenlabs-image:krea-2-medium",
  "elevenlabs-image:krea-2-large",
  "elevenlabs-image:seedream-5-lite",
  "elevenlabs-image:gpt-image-1.5",
  "elevenlabs-image:seedream-4.5",
  "elevenlabs-image:kling-o1-image",
  "elevenlabs-image:flux-2-pro",
  "elevenlabs-image:nano-banana-pro",
  "elevenlabs-image:nano-banana",
  "elevenlabs-image:runway-gen-4-image",
  "elevenlabs-image:runway-gen-4-image-turbo",
  "elevenlabs-image:seedream-4",
  "elevenlabs-image:flux-1-kontext-pro",
] as const;

export type ElevenLabsImageModelId = (typeof ELEVENLABS_IMAGE_MODEL_IDS)[number];

export const ELEVENLABS_IMAGE_MODEL_OPTIONS_FOR_UI: ReadonlyArray<{
  id: ElevenLabsImageModelId;
  label: string;
}> = [
  { id: "elevenlabs-image:gpt-image-2", label: "GPT Image 2" },
  { id: "elevenlabs-image:nano-banana-2", label: "Nano Banana 2" },
  { id: "elevenlabs-image:krea-2-medium", label: "Krea 2 Medium" },
  { id: "elevenlabs-image:krea-2-large", label: "Krea 2 Large" },
  { id: "elevenlabs-image:seedream-5-lite", label: "Seedream 5 Lite" },
  { id: "elevenlabs-image:gpt-image-1.5", label: "GPT Image 1.5" },
  { id: "elevenlabs-image:seedream-4.5", label: "Seedream 4.5" },
  { id: "elevenlabs-image:kling-o1-image", label: "Kling O1 Image" },
  { id: "elevenlabs-image:flux-2-pro", label: "FLUX.2 [Pro]" },
  { id: "elevenlabs-image:nano-banana-pro", label: "Nano Banana Pro" },
  { id: "elevenlabs-image:nano-banana", label: "Nano Banana" },
  { id: "elevenlabs-image:runway-gen-4-image", label: "Runway Gen-4 Image" },
  {
    id: "elevenlabs-image:runway-gen-4-image-turbo",
    label: "Runway Gen-4 Image Turbo",
  },
  { id: "elevenlabs-image:seedream-4", label: "Seedream 4" },
  { id: "elevenlabs-image:flux-1-kontext-pro", label: "FLUX.1 Kontext [Pro]" },
];

export function isElevenLabsImageModelId(id: string): id is ElevenLabsImageModelId {
  return (ELEVENLABS_IMAGE_MODEL_IDS as readonly string[]).includes(id);
}
