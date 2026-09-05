export type SignalAvatarSfxSurface = "dashboard" | "stage";

export function signalAvatarSfxShouldPlay(args: {
  surface: SignalAvatarSfxSurface;
  introActive: boolean;
  outroActive: boolean;
}): boolean {
  return (
    args.surface === "stage" && !args.introActive && !args.outroActive
  );
}
