import {
  PORTABLE_CASE_PACKAGE_MIME_V1,
  type MansionPackageHeaderV1,
  type PortableCaseLibrarySummaryV1,
  type PortableCasePackagePreviewV1,
} from "@localai/shared";

export type CasePackageInspectionV1 =
  | { locked: true; header: MansionPackageHeaderV1 }
  | { locked: false; preview: PortableCasePackagePreviewV1 & { header: MansionPackageHeaderV1 } };

async function responseError(response: Response): Promise<Error> {
  try {
    const payload = await response.json() as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) return new Error(payload.error);
  } catch {
    // Binary uploads can be rejected before JSON routing.
  }
  return new Error(`Case package request failed (${response.status}).`);
}

function packageHeaders(password?: string): HeadersInit {
  return {
    "content-type": PORTABLE_CASE_PACKAGE_MIME_V1,
    ...(password ? { "x-prism-package-password": password } : {}),
  };
}

export async function inspectCasePackageFileV1(
  file: File,
  password?: string,
): Promise<CasePackageInspectionV1> {
  const response = await fetch("/api/debates/mystery-cases/inspect", {
    method: "POST",
    headers: packageHeaders(password),
    body: await file.arrayBuffer(),
  });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as {
    locked?: boolean;
    header?: MansionPackageHeaderV1;
    preview?: PortableCasePackagePreviewV1 & { header: MansionPackageHeaderV1 };
  };
  if (payload.locked && payload.header) return { locked: true, header: payload.header };
  if (!payload.preview) throw new Error("Case package preview is incomplete.");
  return { locked: false, preview: payload.preview };
}

export async function installCasePackageFileV1(
  file: File,
  password?: string,
): Promise<PortableCaseLibrarySummaryV1> {
  const response = await fetch("/api/debates/mystery-cases/import", {
    method: "POST",
    headers: packageHeaders(password),
    body: await file.arrayBuffer(),
  });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { case?: PortableCaseLibrarySummaryV1 };
  if (!payload.case) throw new Error("Imported case response is incomplete.");
  return payload.case;
}

export async function downloadCasePackageV1(args: {
  sessionId: string;
  caseTitle: string;
  password?: string;
  creatorName?: string;
}): Promise<void> {
  const response = await fetch(
    `/api/debates/${encodeURIComponent(args.sessionId)}/mystery-case/export`,
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
    anchor.download = `${args.caseTitle.trim() || "PRISM-Case"}.case`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
