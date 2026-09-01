export type PrismResolvedDocumentTheme = "light" | "dark";
export type PrismStoredThemePreference = PrismResolvedDocumentTheme | "system";

export const PRISM_THEME_STORAGE_KEY = "prism_theme";

/**
 * Runs as the first child of `<body>` so document-owned recovery and portal
 * surfaces have the saved Light contract before their first paint. Keep this
 * dependency-free: it must also work when the React app shell cannot render.
 */
export const PRISM_DOCUMENT_THEME_BOOTSTRAP_SCRIPT = `(() => {
  let storedPreference = null;
  try {
    storedPreference = window.localStorage.getItem("${PRISM_THEME_STORAGE_KEY}");
  } catch {}
  const prefersDark =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true;
  const resolvedTheme =
    storedPreference === "light" || storedPreference === "dark"
      ? storedPreference
      : prefersDark
        ? "dark"
        : "light";
  document.body.dataset.prismTheme = resolvedTheme;
})();`;

export interface ResolvePrismDocumentThemeInput {
  documentTheme?: string | null;
  storedPreference?: string | null;
  prefersDark: boolean;
}

/** Resolve the best theme available to UI that can outlive the app shell. */
export function resolvePrismDocumentTheme({
  documentTheme,
  storedPreference,
  prefersDark,
}: ResolvePrismDocumentThemeInput): PrismResolvedDocumentTheme {
  if (documentTheme === "light" || documentTheme === "dark") {
    return documentTheme;
  }
  if (storedPreference === "light" || storedPreference === "dark") {
    return storedPreference;
  }
  return prefersDark ? "dark" : "light";
}

/**
 * Read the canonical body marker first, then the pre-auth preference/system
 * fallback. SSR callers use Dark; the synchronous body bootstrap owns browser
 * first paint before any recovery or portal surface is parsed.
 */
export function currentPrismDocumentTheme(): PrismResolvedDocumentTheme {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return "dark";
  }

  let storedPreference: string | null = null;
  try {
    storedPreference = window.localStorage.getItem(PRISM_THEME_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return resolvePrismDocumentTheme({
    documentTheme: document.body.dataset.prismTheme,
    storedPreference,
    prefersDark:
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  });
}
