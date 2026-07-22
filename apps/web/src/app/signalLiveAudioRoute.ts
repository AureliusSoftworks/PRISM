export interface SignalLiveAudioRoute {
  context: AudioContext;
  destination: AudioNode;
}

let activeRoute: SignalLiveAudioRoute | null = null;

export function setSignalLiveAudioRoute(
  route: SignalLiveAudioRoute | null,
): void {
  activeRoute = route;
}

export function signalLiveAudioContext(): AudioContext | null {
  return activeRoute?.context ?? null;
}

export function signalLiveAudioDestination(context: AudioContext): AudioNode {
  return activeRoute?.context === context
    ? activeRoute.destination
    : context.destination;
}

export function connectSignalLiveMediaElement(
  audio: HTMLAudioElement,
): (() => void) | null {
  const route = activeRoute;
  if (!route) return null;
  try {
    const source = route.context.createMediaElementSource(audio);
    source.connect(route.destination);
    return () => {
      try {
        source.disconnect();
      } catch {
        // The media source may already have been released by the browser.
      }
    };
  } catch {
    return null;
  }
}
