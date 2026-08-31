import { createHash } from "node:crypto";
import type {
  AccentMapPhonologySpanV1,
  AccentMapTargetIpaPlan,
} from "./builtin-tts-runtime.ts";

export interface ElevenLabsPronunciationDictionaryLocator {
  pronunciation_dictionary_id: string;
  version_id: string;
}

export interface ElevenLabsPronunciationRule {
  string_to_replace: string;
  type: "phoneme";
  phoneme: string;
  alphabet: "ipa";
  case_sensitive: false;
  word_boundaries: true;
}

export interface ElevenLabsPronunciationRulePlan {
  rules: ElevenLabsPronunciationRule[];
  conflictingSpans: AccentMapPhonologySpanV1[];
}

type DictionaryCacheEntry = {
  dictionaryId: string;
  versionId: string;
  rules: Map<string, ElevenLabsPronunciationRule>;
  touchedAt: number;
};

const CACHE_LIMIT = 64;
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const dictionaryCache = new Map<string, DictionaryCacheEntry>();
const dictionaryLocks = new Map<string, Promise<void>>();

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function elevenLabsCredentialFingerprint(apiKey: string): string {
  return sha256(apiKey.trim());
}

function ruleKey(rule: ElevenLabsPronunciationRule): string {
  return rule.string_to_replace.normalize("NFKC").toLocaleLowerCase("en-US");
}

function sameRule(
  left: ElevenLabsPronunciationRule | undefined,
  right: ElevenLabsPronunciationRule,
): boolean {
  return Boolean(left && left.phoneme === right.phoneme);
}

/** Build only the lexemes this utterance actually changes. A conflicting
 * grapheme stays out of the global dictionary and is projected inline at the
 * exact source occurrence instead. */
export function buildElevenLabsPronunciationRulePlan(
  plan: AccentMapTargetIpaPlan,
): ElevenLabsPronunciationRulePlan {
  const byGrapheme = new Map<string, AccentMapPhonologySpanV1[]>();
  for (const span of plan.spans) {
    if (!span.changed || span.protected || !span.targetIpa.trim()) continue;
    const group = byGrapheme.get(span.canonicalGrapheme) ?? [];
    group.push(span);
    byGrapheme.set(span.canonicalGrapheme, group);
  }
  const rules: ElevenLabsPronunciationRule[] = [];
  const conflictingSpans: AccentMapPhonologySpanV1[] = [];
  for (const [grapheme, spans] of [...byGrapheme].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const pronunciations = new Set(spans.map((span) => span.targetIpa));
    if (pronunciations.size !== 1) {
      conflictingSpans.push(...spans);
      continue;
    }
    rules.push({
      string_to_replace: grapheme,
      type: "phoneme",
      phoneme: spans[0]!.targetIpa,
      alphabet: "ipa",
      case_sensitive: false,
      word_boundaries: true,
    });
  }
  return {
    rules,
    conflictingSpans: conflictingSpans.sort(
      (left, right) => left.sourceStart - right.sourceStart,
    ),
  };
}

function scopeKey(args: {
  tenantId: string;
  apiKey: string;
  plan: AccentMapTargetIpaPlan;
}): string {
  return JSON.stringify({
    tenant: args.tenantId,
    credential: elevenLabsCredentialFingerprint(args.apiKey),
    field: args.plan.identity.field,
    accentDefinitionId: args.plan.identity.accentDefinitionId,
    strength: args.plan.identity.strength,
    ruleset: args.plan.rulesetSha256,
  });
}

function opaqueDictionaryName(key: string): string {
  return `prism-am-${sha256(key).slice(0, 24)}`;
}

function pruneCache(now = Date.now()): void {
  for (const [key, entry] of dictionaryCache) {
    if (now - entry.touchedAt > CACHE_TTL_MS) dictionaryCache.delete(key);
  }
  if (dictionaryCache.size <= CACHE_LIMIT) return;
  const oldest = [...dictionaryCache.entries()].sort(
    ([, left], [, right]) => left.touchedAt - right.touchedAt,
  );
  for (const [key] of oldest.slice(0, dictionaryCache.size - CACHE_LIMIT)) {
    dictionaryCache.delete(key);
  }
}

async function providerJson(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs pronunciation dictionary failed (${response.status}).`);
  }
  const value = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ElevenLabs pronunciation dictionary returned invalid JSON.");
  }
  return value as Record<string, unknown>;
}

function parseRule(value: unknown): ElevenLabsPronunciationRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rule = value as Record<string, unknown>;
  if (
    rule.type !== "phoneme" ||
    rule.alphabet !== "ipa" ||
    typeof rule.string_to_replace !== "string" ||
    typeof rule.phoneme !== "string"
  ) return null;
  return {
    string_to_replace: rule.string_to_replace,
    type: "phoneme",
    phoneme: rule.phoneme,
    alphabet: "ipa",
    case_sensitive: false,
    word_boundaries: true,
  };
}

async function loadOrCreateEntry(args: {
  key: string;
  name: string;
  apiKey: string;
  rules: ElevenLabsPronunciationRule[];
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<DictionaryCacheEntry> {
  let match: Record<string, unknown> | undefined;
  let cursor: string | null = null;
  const visitedCursors = new Set<string>();
  // One exact Accent Map point can own a remote dictionary. Paginate restart
  // discovery so accounts with more than 100 authored points reuse the opaque
  // resource instead of silently creating duplicates after a process restart.
  for (let page = 0; page < 20 && !match; page += 1) {
    const url = new URL("https://api.elevenlabs.io/v1/pronunciation-dictionaries");
    url.searchParams.set("page_size", "100");
    url.searchParams.set("include_archived", "false");
    if (cursor) url.searchParams.set("cursor", cursor);
    const list = await providerJson(
      args.fetchImpl,
      url.toString(),
      args.apiKey,
      { method: "GET", signal: args.signal },
    );
    match = Array.isArray(list.pronunciation_dictionaries)
      ? list.pronunciation_dictionaries.find((value) =>
          Boolean(
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            (value as Record<string, unknown>).name === args.name,
          ),
        ) as Record<string, unknown> | undefined
      : undefined;
    const nextCursor = typeof list.next_cursor === "string"
      ? list.next_cursor.trim()
      : "";
    if (
      match ||
      list.has_more !== true ||
      !nextCursor ||
      visitedCursors.has(nextCursor)
    ) {
      break;
    }
    visitedCursors.add(nextCursor);
    cursor = nextCursor;
  }
  if (match && typeof match.id === "string") {
    const detail = await providerJson(
      args.fetchImpl,
      `https://api.elevenlabs.io/v1/pronunciation-dictionaries/${encodeURIComponent(match.id)}`,
      args.apiKey,
      { method: "GET", signal: args.signal },
    );
    const loadedRules = new Map<string, ElevenLabsPronunciationRule>();
    if (Array.isArray(detail.rules)) {
      for (const value of detail.rules) {
        const rule = parseRule(value);
        if (rule) loadedRules.set(ruleKey(rule), rule);
      }
    }
    const versionId = typeof detail.latest_version_id === "string"
      ? detail.latest_version_id
      : typeof match.latest_version_id === "string"
        ? match.latest_version_id
        : "";
    if (!versionId) throw new Error("ElevenLabs dictionary has no version.");
    return {
      dictionaryId: match.id,
      versionId,
      rules: loadedRules,
      touchedAt: Date.now(),
    };
  }
  const created = await providerJson(
    args.fetchImpl,
    "https://api.elevenlabs.io/v1/pronunciation-dictionaries/add-from-rules",
    args.apiKey,
    {
      method: "POST",
      signal: args.signal,
      body: JSON.stringify({
        name: args.name,
        description: "PRISM Accent Map phonology",
        rules: args.rules,
      }),
    },
  );
  if (typeof created.id !== "string" || typeof created.version_id !== "string") {
    throw new Error("ElevenLabs dictionary creation returned no locator.");
  }
  return {
    dictionaryId: created.id,
    versionId: created.version_id,
    rules: new Map(args.rules.map((rule) => [ruleKey(rule), rule])),
    touchedAt: Date.now(),
  };
}

async function prepareWithinLock(args: {
  key: string;
  name: string;
  apiKey: string;
  rules: ElevenLabsPronunciationRule[];
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<ElevenLabsPronunciationDictionaryLocator | null> {
  let entry = dictionaryCache.get(args.key);
  if (!entry) {
    entry = await loadOrCreateEntry(args);
    dictionaryCache.set(args.key, entry);
    pruneCache();
  }
  const additions = args.rules.filter(
    (rule) => !sameRule(entry!.rules.get(ruleKey(rule)), rule),
  );
  if (additions.length > 0) {
    const updated = await providerJson(
      args.fetchImpl,
      `https://api.elevenlabs.io/v1/pronunciation-dictionaries/${encodeURIComponent(entry.dictionaryId)}/add-rules`,
      args.apiKey,
      {
        method: "POST",
        signal: args.signal,
        body: JSON.stringify({ rules: additions }),
      },
    );
    if (typeof updated.version_id !== "string") {
      throw new Error("ElevenLabs dictionary update returned no version.");
    }
    entry.versionId = updated.version_id;
    for (const rule of additions) entry.rules.set(ruleKey(rule), rule);
  }
  entry.touchedAt = Date.now();
  return args.rules.length > 0
    ? {
        pronunciation_dictionary_id: entry.dictionaryId,
        version_id: entry.versionId,
      }
    : null;
}

export async function prepareElevenLabsAccentDictionary(args: {
  tenantId: string;
  apiKey: string;
  plan: AccentMapTargetIpaPlan;
  rules: ElevenLabsPronunciationRule[];
  privacyMode: "online" | "local";
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ElevenLabsPronunciationDictionaryLocator | null> {
  if (args.privacyMode !== "online") {
    throw new Error("Pronunciation dictionaries are unavailable in LOCAL mode.");
  }
  if (args.rules.length === 0) return null;
  const key = scopeKey(args);
  const name = opaqueDictionaryName(key);
  const controller = new AbortController();
  const onAbort = () => controller.abort(args.signal?.reason);
  args.signal?.addEventListener("abort", onAbort, { once: true });
  let timeout: ReturnType<typeof setTimeout>;
  let ownedLock: Promise<void> | null = null;
  const timeoutFailure = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new Error("Pronunciation dictionary preparation timed out.");
      controller.abort(error);
      // Real fetch honors AbortSignal, but a custom/provider implementation
      // may not. Detach this timed-out queue node so later speech can retry
      // instead of inheriting an unresolved lock forever.
      if (ownedLock && dictionaryLocks.get(key) === ownedLock) {
        dictionaryLocks.delete(key);
      }
      reject(error);
    }, Math.max(50, args.timeoutMs ?? 1_200));
  });
  try {
    const previous = dictionaryLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const storedLock = previous.then(() => current);
    ownedLock = storedLock;
    dictionaryLocks.set(key, storedLock);
    const operation = (async () => {
      await previous;
      try {
        return await prepareWithinLock({
          key,
          name,
          apiKey: args.apiKey,
          rules: args.rules,
          fetchImpl: args.fetchImpl ?? fetch,
          signal: controller.signal,
        });
      } finally {
        release();
        if (dictionaryLocks.get(key) === storedLock) dictionaryLocks.delete(key);
      }
    })();
    return await Promise.race([operation, timeoutFailure]);
  } finally {
    clearTimeout(timeout!);
    args.signal?.removeEventListener("abort", onAbort);
  }
}

/** Test-only process-restart seam. Production restart policy is remote lookup
 * by the deterministic opaque scope name, so restarts reuse rather than create
 * a new provider resource. */
export function resetElevenLabsPronunciationDictionaryCacheForTests(): void {
  dictionaryCache.clear();
  dictionaryLocks.clear();
}
