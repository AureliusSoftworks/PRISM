"use client";

import {
  softAssetJobIsActive,
  type SoftAssetJobSnapshotV1,
} from "@localai/shared";

export const PRISM_SOFT_ASSET_JOB_EVENT = "prism:soft-asset-job";

export type PrismSoftAssetJobSnapshot = SoftAssetJobSnapshotV1;

export function announcePrismSoftAssetJob(
  job: PrismSoftAssetJobSnapshot,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PrismSoftAssetJobSnapshot>(PRISM_SOFT_ASSET_JOB_EVENT, {
      detail: job,
    }),
  );
}

export { softAssetJobIsActive };
