export type InstallCoachKind =
  | "ios-safari"
  | "ios-other"
  | "android-install"
  | "android-menu"
  | "desktop-bookmark";

export interface InstallCoachEnvironment {
  origin: string;
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone: boolean;
  dismissed: boolean;
  hasBeforeInstallPrompt: boolean;
}

export interface InstallCoachContent {
  kind: InstallCoachKind;
  title: string;
  body: string;
  actionLabel: string | null;
}

function normalizedHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return null;
  }
}

export function isLoopbackOrigin(origin: string): boolean {
  const hostname = normalizedHostname(origin);
  if (!hostname) return true;
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    /^127(?:\.\d{1,3}){0,3}$/.test(hostname)
  );
}

export function isIosLike(input: Pick<InstallCoachEnvironment, "platform" | "userAgent" | "maxTouchPoints">): boolean {
  const ua = input.userAgent;
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (input.platform === "MacIntel" && (input.maxTouchPoints ?? 0) > 1)
  );
}

export function isIosSafari(userAgent: string): boolean {
  return (
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent)
  );
}

export function shouldShowInstallCoach(env: InstallCoachEnvironment): boolean {
  return !env.dismissed && !env.standalone && !isLoopbackOrigin(env.origin);
}

export function resolveInstallCoachContent(env: InstallCoachEnvironment): InstallCoachContent | null {
  if (!shouldShowInstallCoach(env)) return null;

  const ios = isIosLike(env);
  if (ios && isIosSafari(env.userAgent)) {
    return {
      kind: "ios-safari",
      title: "Save Prism to Home Screen",
      body: "Tap Share, then Add to Home Screen for one-tap access from this device.",
      actionLabel: null,
    };
  }

  if (ios) {
    return {
      kind: "ios-other",
      title: "Save Prism from Safari",
      body: "Open this Prism address in Safari, then use Share and Add to Home Screen.",
      actionLabel: null,
    };
  }

  if (/Android/i.test(env.userAgent)) {
    return env.hasBeforeInstallPrompt
      ? {
          kind: "android-install",
          title: "Install Prism on this device",
          body: "Add Prism to your home screen so you can come back without typing the address.",
          actionLabel: "Install Prism",
        }
      : {
          kind: "android-menu",
          title: "Save Prism on this device",
          body: "Use your browser menu, then choose Install app or Add to Home screen.",
          actionLabel: null,
        };
  }

  return {
    kind: "desktop-bookmark",
    title: "Bookmark this Prism address",
    body: "Save this local Prism address in your browser for quick access from this device.",
    actionLabel: null,
  };
}
