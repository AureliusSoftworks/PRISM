"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./page.module.css";

/**
 * Network access is a server/machine-level setting that controls whether other
 * devices on the local network can reach this Prism. It is intentionally
 * separate from the LOCAL/ONLINE provider toggle (which controls *which AI*
 * Prism talks to, not *who can reach Prism*).
 */
interface NetworkInfo {
  lanAccessEnabled: boolean;
  active: boolean;
  restartRequired: boolean;
  canEdit: boolean;
  managedByEnv: boolean;
  apiPort: number;
  webPort: number;
  addresses: string[];
  lanUrls: { web: string[]; api: string[] };
}

type AuthedFetch = (path: string, init?: RequestInit) => Promise<Response>;

const NOTICE_DISMISSED_KEY = "prism.network.defaultNoticeDismissed";

export function NetworkAccessPanel({
  fetchAuthenticated,
}: {
  fetchAuthenticated: AuthedFetch;
}): React.ReactElement {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(true);
  const [primaryQrUrl, setPrimaryQrUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      setNoticeDismissed(
        window.localStorage.getItem(NOTICE_DISMISSED_KEY) === "1"
      );
    } catch {
      setNoticeDismissed(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuthenticated("/api/network");
      const data = (await res.json()) as { ok?: boolean; error?: string; network?: NetworkInfo };
      if (!res.ok || !data?.ok || !data.network) {
        throw new Error(data?.error ?? "Unable to load network settings.");
      }
      setInfo(data.network);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load network settings.");
    } finally {
      setLoading(false);
    }
  }, [fetchAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyToggle = useCallback(
    async (next: boolean) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetchAuthenticated("/api/network", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lanAccessEnabled: next }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error ?? "Unable to update network settings.");
        }
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update network settings.");
      } finally {
        setSaving(false);
      }
    },
    [fetchAuthenticated, load]
  );

  const copyUrl = useCallback((url: string) => {
    try {
      void navigator.clipboard?.writeText(url);
      setCopied(url);
      window.setTimeout(() => {
        setCopied((current) => (current === url ? null : current));
      }, 1500);
    } catch {
      /* clipboard unavailable; ignore */
    }
  }, []);

  const dismissNotice = useCallback(() => {
    setNoticeDismissed(true);
    try {
      window.localStorage.setItem(NOTICE_DISMISSED_KEY, "1");
    } catch {
      /* storage unavailable; ignore */
    }
  }, []);

  const enabled = info?.lanAccessEnabled ?? false;
  const canEdit = info?.canEdit ?? false;
  const restartRequired = info?.restartRequired ?? false;
  const webUrls = info?.lanUrls.web ?? [];
  const apiUrls = info?.lanUrls.api ?? [];
  const primaryWebUrl = webUrls[0] ?? null;
  const secondaryWebUrls = webUrls.slice(1);

  useEffect(() => {
    let cancelled = false;
    setPrimaryQrUrl(null);
    if (!primaryWebUrl) return;

    void QRCode.toDataURL(primaryWebUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 168,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (!cancelled) setPrimaryQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPrimaryQrUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [primaryWebUrl]);

  return (
    <section
      className={`${styles.settingsSection} ${styles.settingsSectionWide}`}
      data-settings-section="network"
      aria-labelledby="settings-network-title"
    >
      <header className={styles.settingsSectionHeader}>
        <div>
          <span className={styles.settingsEyebrow}>Network</span>
          <h4 id="settings-network-title">Access from other devices</h4>
        </div>
        <div className={styles.settingsSectionHeaderAside}>
          <small>Controls who can reach Prism — not which AI it uses.</small>
        </div>
      </header>

      {!noticeDismissed && !enabled && !loading && (
        <div className={styles.networkNotice} role="note">
          <p>
            Prism now stays on this computer by default. To reach it from your
            phone or another device, turn on <strong>Share on local network</strong> below.
          </p>
          <button
            type="button"
            className={styles.linkButton}
            onClick={dismissNotice}
          >
            Got it
          </button>
        </div>
      )}

      {loading ? (
        <p className={styles.networkMuted}>Checking network status…</p>
      ) : error ? (
        <div className={styles.networkNotice} role="alert">
          <p>{error}</p>
          <button type="button" className={styles.linkButton} onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <label
            className={styles.networkToggleRow}
            data-disabled={!canEdit || saving ? "true" : undefined}
          >
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEdit || saving}
              onChange={(event) => void applyToggle(event.target.checked)}
            />
            <span>
              <strong>Share on local network</strong>
              <small className={styles.networkMuted}>
                {enabled
                  ? "Other devices on this Wi-Fi/network can reach Prism."
                  : "Private to this computer. Nothing else on your network can connect."}
              </small>
            </span>
          </label>

          {!canEdit && (
            <p className={styles.networkMuted}>
              {info?.managedByEnv
                ? "Network access is set where Prism is launched (its environment), so it can't be changed here."
                : "For your safety, network access can only be switched from this computer (the Prism app or terminal on the host)."}
            </p>
          )}

          {restartRequired && (
            <div className={styles.networkNotice} role="status">
              <p>
                Saved. Restart Prism on this computer to apply the new network
                setting.
              </p>
            </div>
          )}

          {enabled && info?.active && (webUrls.length > 0 || apiUrls.length > 0) && (
            <div className={styles.networkUrls}>
              {primaryWebUrl && (
                <div className={styles.networkShareCard}>
                  <div className={styles.networkShareCopy}>
                    <strong>Open Prism on a phone or tablet</strong>
                    <p>
                      Scan this code or copy the web address, then save Prism to
                      your Home Screen or bookmarks.
                    </p>
                    <div className={styles.networkPrimaryUrlRow}>
                      <span className={styles.networkUrlValue}>{primaryWebUrl}</span>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => copyUrl(primaryWebUrl)}
                      >
                        {copied === primaryWebUrl ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div className={styles.networkQrFrame} aria-label="Prism web address QR code">
                    {primaryQrUrl ? (
                      <span
                        className={styles.networkQrImage}
                        style={{ backgroundImage: `url(${primaryQrUrl})` }}
                        aria-hidden="true"
                      />
                    ) : (
                      <span>QR</span>
                    )}
                  </div>
                </div>
              )}
              {secondaryWebUrls.length > 0 && (
                <>
                  <p className={styles.networkMuted}>
                    Other Prism web addresses for this computer:
                  </p>
                  <ul className={styles.networkUrlList}>
                    {secondaryWebUrls.map((url) => (
                      <li key={`web-${url}`} className={styles.networkUrlRow}>
                        <span className={styles.networkUrlValue}>{url}</span>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => copyUrl(url)}
                        >
                          {copied === url ? "Copied" : "Copy"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!primaryWebUrl && webUrls.length > 0 && (
                <ul className={styles.networkUrlList}>
                  {webUrls.map((url) => (
                    <li key={`web-${url}`} className={styles.networkUrlRow}>
                      <span className={styles.networkUrlValue}>{url}</span>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => copyUrl(url)}
                      >
                        {copied === url ? "Copied" : "Copy"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {apiUrls.length > 0 && (
                <details className={styles.networkApiDetails}>
                  <summary className={styles.networkMuted}>
                    Direct API address
                  </summary>
                  <ul className={styles.networkUrlList}>
                    {apiUrls.map((url) => (
                      <li key={`api-${url}`} className={styles.networkUrlRow}>
                        <span className={styles.networkUrlValue}>{url}</span>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => copyUrl(url)}
                        >
                          {copied === url ? "Copied" : "Copy"}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.networkMuted}>
                    Use this for direct API checks. The web address above is the
                    one to open and save on client devices.
                  </p>
                </details>
              )}
              <p className={styles.networkMuted}>
                Your computer may ask you to allow incoming connections the first
                time.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
