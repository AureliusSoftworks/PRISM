import {
  actionSfxPackOwnerIdFor,
  normalizeEnglishPacingProfileV1,
  type ActionSfxPackOwnerKind,
  type EnglishPacingProfileV1,
} from "@localai/shared";

const profileCache = new Map<string, EnglishPacingProfileV1 | null>();

export function englishPacingProfileCacheKey(
  ownerKind: ActionSfxPackOwnerKind,
  ownerId?: string | null,
): string {
  return `${ownerKind}:${actionSfxPackOwnerIdFor(ownerKind, ownerId)}`;
}

export function rememberEnglishPacingProfile(
  ownerKind: ActionSfxPackOwnerKind,
  ownerId: string | null | undefined,
  profile: EnglishPacingProfileV1 | null,
): void {
  profileCache.set(englishPacingProfileCacheKey(ownerKind, ownerId), profile);
}

export function peekEnglishPacingProfile(
  ownerKind: ActionSfxPackOwnerKind,
  ownerId?: string | null,
): EnglishPacingProfileV1 | null {
  return (
    profileCache.get(englishPacingProfileCacheKey(ownerKind, ownerId)) ?? null
  );
}

export async function fetchEnglishPacingProfile(args: {
  origin: string;
  ownerKind: ActionSfxPackOwnerKind;
  ownerId?: string | null;
}): Promise<EnglishPacingProfileV1 | null> {
  const ownerId = actionSfxPackOwnerIdFor(args.ownerKind, args.ownerId);
  const url = new URL("/api/english-pacing-profile", args.origin);
  url.searchParams.set("ownerKind", args.ownerKind);
  url.searchParams.set("ownerId", ownerId);
  const response = await fetch(url, {
    credentials: "include",
  });
  if (!response.ok) {
    rememberEnglishPacingProfile(args.ownerKind, ownerId, null);
    return null;
  }
  const payload = (await response.json()) as {
    ok?: boolean;
    profile?: unknown;
  };
  const profile = normalizeEnglishPacingProfileV1(payload.profile);
  rememberEnglishPacingProfile(args.ownerKind, ownerId, profile);
  return profile;
}

export async function calibrateEnglishPacingProfileRequest(args: {
  origin: string;
  ownerKind: ActionSfxPackOwnerKind;
  ownerId?: string | null;
}): Promise<EnglishPacingProfileV1> {
  const ownerId = actionSfxPackOwnerIdFor(args.ownerKind, args.ownerId);
  const response = await fetch(
    new URL("/api/english-pacing-profile/calibrate", args.origin),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ownerKind: args.ownerKind,
        ownerId,
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    profile?: unknown;
  } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error?.trim() ||
        "Could not calibrate English pacing from Premium voice.",
    );
  }
  const profile = normalizeEnglishPacingProfileV1(payload.profile);
  if (!profile) {
    throw new Error("Calibrate returned an unusable pacing profile.");
  }
  rememberEnglishPacingProfile(args.ownerKind, ownerId, profile);
  return profile;
}
