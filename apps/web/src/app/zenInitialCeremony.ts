export type ZenInitialAtmosphereStatus =
  | "idle"
  | "generating"
  | "ready"
  | "error"
  | undefined;

export function zenInitialCeremonyShouldStart({
  initialZenOpeningTurn,
  assistantOnlyTurn,
  editingMessage,
  pendingIncognito,
  conversationIncognito,
}: {
  initialZenOpeningTurn: boolean;
  assistantOnlyTurn: boolean;
  editingMessage: boolean;
  pendingIncognito: boolean;
  conversationIncognito: boolean | undefined;
}): boolean {
  return (
    initialZenOpeningTurn &&
    !assistantOnlyTurn &&
    !editingMessage &&
    !pendingIncognito &&
    conversationIncognito !== true
  );
}

export function zenInitialCeremonyCanReveal({
  responseStreamReady,
  waitForAtmosphere,
  atmosphereEnabled,
  atmosphereImageId,
  atmosphereStatus,
  imageLaneUnavailable,
}: {
  responseStreamReady: boolean;
  waitForAtmosphere: boolean;
  atmosphereEnabled: boolean | undefined;
  atmosphereImageId: string | null | undefined;
  atmosphereStatus: ZenInitialAtmosphereStatus;
  imageLaneUnavailable: boolean;
}): boolean {
  if (!responseStreamReady) return false;
  if (!waitForAtmosphere) return true;
  return (
    (atmosphereEnabled === true &&
      Boolean(atmosphereImageId) &&
      atmosphereStatus === "ready") ||
    atmosphereStatus === "error" ||
    atmosphereEnabled === false ||
    imageLaneUnavailable
  );
}
