export const SOFT_ASSET_JOB_SCHEMA_VERSION = 1 as const;

export type SoftAssetJobAppletV1 = "debate";

export type SoftAssetJobDestinationV1 = {
  kind: "debate_exhibit_sprite";
  sessionId: string;
  exhibitId: string;
};

export type SoftAssetJobStatusV1 =
  | "queued"
  | "generating"
  | "attaching"
  | "cancelling"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface SoftAssetJobSnapshotV1 {
  version: typeof SOFT_ASSET_JOB_SCHEMA_VERSION;
  id: string;
  requestId: string;
  applet: SoftAssetJobAppletV1;
  title: string;
  destinationLabel: string;
  destination: SoftAssetJobDestinationV1;
  status: SoftAssetJobStatusV1;
  imageId: string | null;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export function softAssetJobIsActive(
  job: Pick<SoftAssetJobSnapshotV1, "status"> | null | undefined,
): boolean {
  return (
    job?.status === "queued" ||
    job?.status === "generating" ||
    job?.status === "attaching" ||
    job?.status === "cancelling"
  );
}
