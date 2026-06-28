import QRCode from "qrcode";

interface ApiRootLandingInput {
  hostHeader: string | string[] | undefined;
  apiPort: number;
  webPort: number;
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.split(",")[0]?.trim() || null;
}

function safeHostHeader(value: string | string[] | undefined, fallbackPort: number): string {
  const candidate = firstHeaderValue(value);
  if (!candidate || /[/?#\\@]/.test(candidate)) {
    return `localhost:${fallbackPort}`;
  }
  try {
    const parsed = new URL(`http://${candidate}`);
    return parsed.host || `localhost:${fallbackPort}`;
  } catch {
    return `localhost:${fallbackPort}`;
  }
}

function formatHostnameForUrl(hostname: string): string {
  const stripped = hostname.replace(/^\[|\]$/g, "");
  return stripped.includes(":") ? `[${stripped}]` : stripped;
}

function safeHostname(value: string | string[] | undefined): string {
  const host = safeHostHeader(value, 80);
  try {
    const parsed = new URL(`http://${host}`);
    return parsed.hostname || "localhost";
  } catch {
    return "localhost";
  }
}

export function buildWebAppUrlFromApiHost(
  hostHeader: string | string[] | undefined,
  webPort: number
): string {
  return `http://${formatHostnameForUrl(safeHostname(hostHeader))}:${webPort}`;
}

export function buildApiHealthUrlFromHost(
  hostHeader: string | string[] | undefined,
  apiPort: number
): string {
  return `http://${safeHostHeader(hostHeader, apiPort)}/api/health`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderApiRootLandingHtml(args: {
  webUrl: string;
  healthUrl: string;
  qrDataUrl: string | null;
}): string {
  const webUrl = escapeHtml(args.webUrl);
  const healthUrl = escapeHtml(args.healthUrl);
  const qrImage = args.qrDataUrl
    ? `<img src="${escapeHtml(args.qrDataUrl)}" alt="" width="180" height="180">`
    : `<div class="qr-fallback">QR</div>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prism API</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #10151f;
      color: #f8fafc;
    }
    main {
      width: min(460px, 100%);
      padding: 22px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 8px;
      background: rgba(255,255,255,0.06);
      box-shadow: 0 24px 70px rgba(0,0,0,0.34);
    }
    h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.15; }
    p { margin: 0 0 16px; color: #cbd5e1; line-height: 1.5; }
    a { color: inherit; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
    .button {
      display: inline-flex;
      align-items: center;
      min-height: 38px;
      padding: 0 13px;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 7px;
      background: #f8fafc;
      color: #10151f;
      font-weight: 700;
      text-decoration: none;
    }
    .secondary {
      background: transparent;
      color: #f8fafc;
    }
    .qr {
      display: grid;
      place-items: center;
      width: 196px;
      height: 196px;
      padding: 8px;
      border-radius: 8px;
      background: #fff;
      color: #10151f;
    }
    .qr img { display: block; width: 180px; height: 180px; }
    .qr-fallback { display: grid; place-items: center; width: 180px; height: 180px; font-weight: 800; }
    code {
      display: block;
      overflow-wrap: anywhere;
      margin-top: 14px;
      color: #e2e8f0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main>
    <h1>Prism API is running</h1>
    <p>This address is the API. Open the Prism web app to chat from this device.</p>
    <div class="actions">
      <a class="button" href="${webUrl}">Open Prism</a>
      <a class="button secondary" href="${healthUrl}">API health</a>
    </div>
    <div class="qr">${qrImage}</div>
    <code>${webUrl}</code>
  </main>
</body>
</html>`;
}

export async function buildApiRootLandingHtml(input: ApiRootLandingInput): Promise<string> {
  const webUrl = buildWebAppUrlFromApiHost(input.hostHeader, input.webPort);
  const healthUrl = buildApiHealthUrlFromHost(input.hostHeader, input.apiPort);
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(webUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 180,
      color: {
        dark: "#10151f",
        light: "#ffffff",
      },
    });
  } catch {
    qrDataUrl = null;
  }
  return renderApiRootLandingHtml({ webUrl, healthUrl, qrDataUrl });
}
