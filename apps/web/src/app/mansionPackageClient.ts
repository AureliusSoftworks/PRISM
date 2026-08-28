import {
  PORTABLE_MANSION_PACKAGE_MIME_V1,
  type DebateMysteryMansionBundleSummaryV1,
  type MansionPackageHeaderV1,
  type PortableMansionPackagePreviewV1,
} from "@localai/shared";

export type MansionPackageInspectionV1 =
  | {
      locked: true;
      header: MansionPackageHeaderV1;
      duplicateBundleId: string | null;
    }
  | {
      locked: false;
      preview: PortableMansionPackagePreviewV1;
    };

async function responseError(response: Response): Promise<Error> {
  try {
    const payload = await response.json() as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) return new Error(payload.error);
  } catch {
    // The API can reject before JSON routing when the binary body is too large.
  }
  return new Error(`Mansion package request failed (${response.status}).`);
}

function passwordHeaders(password?: string): HeadersInit {
  return {
    "content-type": PORTABLE_MANSION_PACKAGE_MIME_V1,
    ...(password ? { "x-prism-package-password": password } : {}),
  };
}

export async function inspectMansionPackageFileV1(
  file: File,
  password?: string,
): Promise<MansionPackageInspectionV1> {
  const response = await fetch("/api/debates/mystery-mansions/inspect", {
    method: "POST",
    headers: passwordHeaders(password),
    body: await file.arrayBuffer(),
  });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as {
    locked?: boolean;
    header?: MansionPackageHeaderV1;
    duplicateBundleId?: string | null;
    preview?: PortableMansionPackagePreviewV1;
  };
  if (payload.locked && payload.header) {
    return {
      locked: true,
      header: payload.header,
      duplicateBundleId: payload.duplicateBundleId ?? null,
    };
  }
  if (!payload.preview) throw new Error("Mansion package preview is incomplete.");
  return { locked: false, preview: payload.preview };
}

export async function installMansionPackageFileV1(
  file: File,
  password?: string,
): Promise<DebateMysteryMansionBundleSummaryV1> {
  const response = await fetch("/api/debates/mystery-mansions/import", {
    method: "POST",
    headers: passwordHeaders(password),
    body: await file.arrayBuffer(),
  });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as {
    mansion?: DebateMysteryMansionBundleSummaryV1;
  };
  if (!payload.mansion) throw new Error("Imported mansion response is incomplete.");
  return payload.mansion;
}

export async function downloadMansionPackageV1(args: {
  mansionId: string;
  mansionName: string;
  password?: string;
  creatorName?: string;
}): Promise<void> {
  const response = await fetch(
    `/api/debates/mystery-mansions/${encodeURIComponent(args.mansionId)}/export`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: args.password ? "password" : "spoiler_seal",
        password: args.password || undefined,
        creatorName: args.creatorName || undefined,
      }),
    },
  );
  if (!response.ok) throw await responseError(response);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${args.mansionName.trim() || "PRISM-Mansion"}.mansion`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function portableMansionByteLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
