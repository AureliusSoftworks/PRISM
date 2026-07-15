export function messageHistoryMutationActionsAvailable({
  productChatSurface,
}: {
  productChatSurface: boolean;
}): boolean {
  return !productChatSurface;
}
