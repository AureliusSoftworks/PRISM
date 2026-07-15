export interface ImageLibraryGroupingImage {
  id: string;
  botId?: string | null;
  botIds?: readonly string[] | null;
}

export interface ImageLibraryGroupingBot {
  id: string;
  name: string;
}

export interface ImageLibraryGroupingBotGroup {
  botIds: readonly string[];
  roomAtmosphere?: { imageId?: string | null } | null;
}

export interface ImageLibrarySection<TImage extends ImageLibraryGroupingImage> {
  key: string;
  label: string;
  botIds: string[];
  images: TImage[];
}

export function imageLibraryOwnerBotIds(
  image: ImageLibraryGroupingImage,
  groups: readonly ImageLibraryGroupingBotGroup[] = [],
): string[] {
  const ownerIds = [
    ...(image.botId?.trim() ? [image.botId.trim()] : []),
    ...(Array.isArray(image.botIds) ? image.botIds : []),
    ...groups
      .filter((group) => group.roomAtmosphere?.imageId?.trim() === image.id)
      .flatMap((group) => group.botIds),
  ];
  return Array.from(
    new Set(
      ownerIds
        .filter((botId): botId is string => typeof botId === "string")
        .map((botId) => botId.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function formatOwnerLabel(ownerNames: readonly string[]): string {
  if (ownerNames.length === 0) return "PRISM";
  if (ownerNames.length === 1) return ownerNames[0]!;
  if (ownerNames.length === 2) return `${ownerNames[0]} & ${ownerNames[1]}`;
  return `${ownerNames.slice(0, -1).join(", ")} & ${ownerNames.at(-1)}`;
}

export function buildImageLibrarySections<
  TImage extends ImageLibraryGroupingImage,
>(args: {
  images: readonly TImage[];
  bots: readonly ImageLibraryGroupingBot[];
  groups?: readonly ImageLibraryGroupingBotGroup[];
}): ImageLibrarySection<TImage>[] {
  const botNames = new Map(args.bots.map((bot) => [bot.id, bot.name] as const));
  const sections = new Map<string, ImageLibrarySection<TImage>>();
  for (const image of args.images) {
    const botIds = imageLibraryOwnerBotIds(image, args.groups);
    const key = botIds.length > 0 ? `bots:${botIds.join("|")}` : "prism";
    const existing = sections.get(key);
    if (existing) {
      existing.images.push(image);
      continue;
    }
    const ownerNames = botIds
      .map((botId) => botNames.get(botId) ?? "Bot")
      .sort((a, b) => a.localeCompare(b));
    sections.set(key, {
      key,
      label: formatOwnerLabel(ownerNames),
      botIds,
      images: [image],
    });
  }
  return [...sections.values()].sort((a, b) => {
    if (a.key === "prism") return -1;
    if (b.key === "prism") return 1;
    return a.label.localeCompare(b.label);
  });
}
