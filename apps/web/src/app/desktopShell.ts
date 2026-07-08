export interface DesktopShellKeyEvent {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
}

type TauriCore = {
  invoke?: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
};

type TauriGlobal = {
  core?: TauriCore;
};

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

export function isDesktopFullscreenToggleShortcut(event: DesktopShellKeyEvent): boolean {
  if (event.defaultPrevented) return false;
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  return event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter";
}

export async function toggleDesktopFullscreen(): Promise<boolean | null> {
  if (typeof window === "undefined") return null;
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  return invoke<boolean>("toggle_fullscreen");
}
