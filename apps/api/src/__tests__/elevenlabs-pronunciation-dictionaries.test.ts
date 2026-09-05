import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AccentMapTargetIpaPlan } from "../builtin-tts-runtime.ts";
import {
  buildElevenLabsPronunciationRulePlan,
  prepareElevenLabsAccentDictionary,
  resetElevenLabsPronunciationDictionaryCacheForTests,
} from "../elevenlabs-pronunciation-dictionaries.ts";

function plan(
  entries: Array<{
    sourceText: string;
    targetIpa: string;
    baselineIpa?: string;
    protected?: boolean;
  }>,
): AccentMapTargetIpaPlan {
  let cursor = 0;
  const sourceText = entries.map((entry) => entry.sourceText).join(" ");
  const spans = entries.map((entry) => {
    const start = cursor;
    const end = start + entry.sourceText.length;
    cursor = end + 1;
    const baselineIpa = entry.baselineIpa ?? `base-${entry.sourceText}`;
    return {
      sourceStart: start,
      sourceEnd: end,
      sourceText: entry.sourceText,
      canonicalGrapheme: entry.sourceText.toLocaleLowerCase("en-US"),
      baselineIpa,
      targetIpa: entry.targetIpa,
      changed: baselineIpa !== entry.targetIpa,
      protected: entry.protected === true,
      appliedRuleIds: ["test-rule"],
    };
  });
  return {
    sourceText,
    targetLocale: "en-US",
    targetIpa: spans.map((span) => span.targetIpa).join(" "),
    identity: {
      accentDefinitionId: "northern-german-influenced-english",
      field: [{
        accentDefinitionId: "northern-german-influenced-english",
        pronunciationBase: "en-US",
        influence: "northern-german-influenced-english",
        weight: 1,
      }],
      strength: "balanced",
    },
    rulesetVersion: "test-v1",
    rulesetSha256: "a".repeat(64),
    planSha256: "b".repeat(64),
    spans,
  };
}

function remoteDictionaryFetch() {
  const dictionaries = new Map<string, {
    id: string;
    name: string;
    versionId: string;
    rules: unknown[];
  }>();
  const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  let nextId = 1;
  let version = 1;
  const fetchImpl = (async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string"
      ? JSON.parse(init.body) as Record<string, unknown>
      : null;
    requests.push({ url, body });
    if (url.includes("page_size=100")) {
      return Response.json({
        pronunciation_dictionaries: [...dictionaries.values()].map((entry) => ({
          id: entry.id,
          name: entry.name,
          latest_version_id: entry.versionId,
        })),
      });
    }
    if (url.endsWith("/add-from-rules")) {
      const id = `dictionary-${nextId++}`;
      const entry = {
        id,
        name: String(body?.name),
        versionId: `version-${version++}`,
        rules: Array.isArray(body?.rules) ? [...body.rules] : [],
      };
      dictionaries.set(id, entry);
      return Response.json({ id, version_id: entry.versionId });
    }
    const id = url.match(/pronunciation-dictionaries\/([^/]+)(?:\/|$)/u)?.[1];
    const entry = id ? dictionaries.get(decodeURIComponent(id)) : undefined;
    if (!entry) return new Response("missing", { status: 404 });
    if (url.endsWith("/add-rules")) {
      for (const next of Array.isArray(body?.rules) ? body.rules : []) {
        const nextRule = next as Record<string, unknown>;
        const existingIndex = entry.rules.findIndex((value) =>
          Boolean(
            value && typeof value === "object" &&
            (value as Record<string, unknown>).string_to_replace ===
              nextRule.string_to_replace,
          ));
        if (existingIndex >= 0) entry.rules.splice(existingIndex, 1, next);
        else entry.rules.push(next);
      }
      entry.versionId = `version-${version++}`;
      return Response.json({ id: entry.id, version_id: entry.versionId });
    }
    return Response.json({
      id: entry.id,
      latest_version_id: entry.versionId,
      rules: entry.rules,
    });
  }) as typeof fetch;
  return { fetchImpl, requests, dictionaries };
}

describe("ElevenLabs Accent Map pronunciation dictionaries", () => {
  it("emits normalized whole-word IPA rules and isolates conflicting/protected occurrences", () => {
    const result = buildElevenLabsPronunciationRulePlan(plan([
      { sourceText: "WHEN", targetIpa: "vˈɛn" },
      { sourceText: "when", targetIpa: "vˈɛn" },
      { sourceText: "walks", targetIpa: "vˈɔks" },
      { sourceText: "Walter", targetIpa: "vˈɔltəɹ", protected: true },
      { sourceText: "lead", targetIpa: "lˈiːd" },
      { sourceText: "lead", targetIpa: "lˈɛd" },
    ]));
    assert.deepEqual(result.rules.map((rule) => rule.string_to_replace), ["walks", "when"]);
    assert.ok(result.rules.every((rule) =>
      rule.alphabet === "ipa" &&
      rule.case_sensitive === false &&
      rule.word_boundaries === true));
    assert.deepEqual(result.conflictingSpans.map((span) => span.sourceText), ["lead", "lead"]);
  });

  it("isolates tenant and credential scopes, hits cache, and accumulates vocabulary by version", async () => {
    resetElevenLabsPronunciationDictionaryCacheForTests();
    const remote = remoteDictionaryFetch();
    const firstPlan = plan([{ sourceText: "when", targetIpa: "vˈɛn" }]);
    const firstRules = buildElevenLabsPronunciationRulePlan(firstPlan).rules;
    const first = await prepareElevenLabsAccentDictionary({
      tenantId: "tenant-a",
      apiKey: "raw-secret-a",
      plan: firstPlan,
      rules: firstRules,
      privacyMode: "online",
      fetchImpl: remote.fetchImpl,
    });
    const afterFirst = remote.requests.length;
    const hit = await prepareElevenLabsAccentDictionary({
      tenantId: "tenant-a",
      apiKey: "raw-secret-a",
      plan: firstPlan,
      rules: firstRules,
      privacyMode: "online",
      fetchImpl: remote.fetchImpl,
    });
    assert.deepEqual(hit, first);
    assert.equal(remote.requests.length, afterFirst);

    const expandedPlan = plan([
      { sourceText: "when", targetIpa: "vˈɛn" },
      { sourceText: "white", targetIpa: "vˈaɪt" },
    ]);
    const expanded = await prepareElevenLabsAccentDictionary({
      tenantId: "tenant-a",
      apiKey: "raw-secret-a",
      plan: expandedPlan,
      rules: buildElevenLabsPronunciationRulePlan(expandedPlan).rules,
      privacyMode: "online",
      fetchImpl: remote.fetchImpl,
    });
    assert.notEqual(expanded?.version_id, first?.version_id);
    assert.match(remote.requests.at(-1)?.url ?? "", /add-rules$/u);

    await prepareElevenLabsAccentDictionary({
      tenantId: "tenant-b",
      apiKey: "raw-secret-a",
      plan: firstPlan,
      rules: firstRules,
      privacyMode: "online",
      fetchImpl: remote.fetchImpl,
    });
    await prepareElevenLabsAccentDictionary({
      tenantId: "tenant-a",
      apiKey: "raw-secret-b",
      plan: firstPlan,
      rules: firstRules,
      privacyMode: "online",
      fetchImpl: remote.fetchImpl,
    });
    const strongPlan = {
      ...firstPlan,
      identity: { ...firstPlan.identity, strength: "strong" as const },
    };
    await prepareElevenLabsAccentDictionary({
      tenantId: "tenant-a",
      apiKey: "raw-secret-a",
      plan: strongPlan,
      rules: buildElevenLabsPronunciationRulePlan(strongPlan).rules,
      privacyMode: "online",
      fetchImpl: remote.fetchImpl,
    });
    const otherAccentPlan = {
      ...firstPlan,
      identity: {
        ...firstPlan.identity,
        accentDefinitionId: "german-influenced-english",
        field: [{
          accentDefinitionId: "german-influenced-english",
          pronunciationBase: "en-US",
          influence: "german-influenced-english",
          weight: 1,
        }],
      },
    };
    await prepareElevenLabsAccentDictionary({
      tenantId: "tenant-a",
      apiKey: "raw-secret-a",
      plan: otherAccentPlan,
      rules: buildElevenLabsPronunciationRulePlan(otherAccentPlan).rules,
      privacyMode: "online",
      fetchImpl: remote.fetchImpl,
    });
    const nextRulesetPlan = {
      ...firstPlan,
      rulesetSha256: "c".repeat(64),
    };
    await prepareElevenLabsAccentDictionary({
      tenantId: "tenant-a",
      apiKey: "raw-secret-a",
      plan: nextRulesetPlan,
      rules: buildElevenLabsPronunciationRulePlan(nextRulesetPlan).rules,
      privacyMode: "online",
      fetchImpl: remote.fetchImpl,
    });
    assert.equal(remote.dictionaries.size, 6);
    for (const request of remote.requests.filter((entry) => entry.body?.name)) {
      const metadata = `${request.body?.name} ${request.body?.description}`;
      assert.doesNotMatch(metadata, /raw-secret|when|white|tenant-a|tenant-b/iu);
      assert.match(String(request.body?.name), /^prism-am-[a-f0-9]{24}$/u);
    }

    const changedPlan = plan([{ sourceText: "when", targetIpa: "vˈɛn-alt" }]);
    const changed = await prepareElevenLabsAccentDictionary({
      tenantId: "tenant-a",
      apiKey: "raw-secret-a",
      plan: changedPlan,
      rules: buildElevenLabsPronunciationRulePlan(changedPlan).rules,
      privacyMode: "online",
      fetchImpl: remote.fetchImpl,
    });
    assert.notEqual(changed?.version_id, expanded?.version_id);
    const primaryDictionary = [...remote.dictionaries.values()][0]!;
    assert.equal(
      primaryDictionary.rules.filter((value) =>
        (value as Record<string, unknown>).string_to_replace === "when").length,
      1,
    );
    assert.equal(
      (primaryDictionary.rules.find((value) =>
        (value as Record<string, unknown>).string_to_replace === "when") as
          Record<string, unknown>).phoneme,
      "vˈɛn-alt",
    );
  });

  it("coalesces concurrent misses and reuses the opaque remote resource after a local restart", async () => {
    resetElevenLabsPronunciationDictionaryCacheForTests();
    const remote = remoteDictionaryFetch();
    const accentPlan = plan([{ sourceText: "whisk", targetIpa: "vˈɪsk" }]);
    const args = {
      tenantId: "tenant",
      apiKey: "secret",
      plan: accentPlan,
      rules: buildElevenLabsPronunciationRulePlan(accentPlan).rules,
      privacyMode: "online" as const,
      fetchImpl: remote.fetchImpl,
    };
    const [left, right] = await Promise.all([
      prepareElevenLabsAccentDictionary(args),
      prepareElevenLabsAccentDictionary(args),
    ]);
    assert.deepEqual(left, right);
    assert.equal(remote.dictionaries.size, 1);
    resetElevenLabsPronunciationDictionaryCacheForTests();
    const afterRestart = await prepareElevenLabsAccentDictionary(args);
    assert.deepEqual(afterRestart, left);
    assert.equal(remote.dictionaries.size, 1);
  });

  it("finds an opaque restart resource beyond the first provider page", async () => {
    resetElevenLabsPronunciationDictionaryCacheForTests();
    const accentPlan = plan([{ sourceText: "white", targetIpa: "vˈaɪt" }]);
    const rules = buildElevenLabsPronunciationRulePlan(accentPlan).rules;
    const credential = "paginated-secret";
    const tenantId = "paginated-tenant";
    const created = remoteDictionaryFetch();
    const first = await prepareElevenLabsAccentDictionary({
      tenantId,
      apiKey: credential,
      plan: accentPlan,
      rules,
      privacyMode: "online",
      fetchImpl: created.fetchImpl,
    });
    const remoteEntry = [...created.dictionaries.values()][0]!;
    resetElevenLabsPronunciationDictionaryCacheForTests();
    let listPage = 0;
    const paginatedFetch = (async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/pronunciation-dictionaries") {
        listPage += 1;
        if (!url.searchParams.has("cursor")) {
          return Response.json({
            pronunciation_dictionaries: [],
            has_more: true,
            next_cursor: "page-2",
          });
        }
        assert.equal(url.searchParams.get("cursor"), "page-2");
        return Response.json({
          pronunciation_dictionaries: [{
            id: remoteEntry.id,
            name: remoteEntry.name,
            latest_version_id: remoteEntry.versionId,
          }],
          has_more: false,
        });
      }
      return created.fetchImpl(input, init);
    }) as typeof fetch;
    const reused = await prepareElevenLabsAccentDictionary({
      tenantId,
      apiKey: credential,
      plan: accentPlan,
      rules,
      privacyMode: "online",
      fetchImpl: paginatedFetch,
    });
    assert.deepEqual(reused, first);
    assert.equal(listPage, 2);
    assert.equal(created.dictionaries.size, 1);
  });

  it("bounds failure latency and performs zero egress in LOCAL mode", async () => {
    resetElevenLabsPronunciationDictionaryCacheForTests();
    const accentPlan = plan([{ sourceText: "away", targetIpa: "ɐvˈeɪ" }]);
    const rules = buildElevenLabsPronunciationRulePlan(accentPlan).rules;
    let calls = 0;
    await assert.rejects(
      prepareElevenLabsAccentDictionary({
        tenantId: "tenant",
        apiKey: "secret",
        plan: accentPlan,
        rules,
        privacyMode: "local",
        fetchImpl: (async () => {
          calls += 1;
          return Response.json({});
        }) as typeof fetch,
      }),
      /LOCAL mode/u,
    );
    assert.equal(calls, 0);
    await assert.rejects(
      prepareElevenLabsAccentDictionary({
        tenantId: "tenant",
        apiKey: "secret",
        plan: accentPlan,
        rules,
        privacyMode: "online",
        timeoutMs: 50,
        fetchImpl: (() => new Promise<Response>(() => {})) as typeof fetch,
      }),
      /timed out/u,
    );
    const recovered = remoteDictionaryFetch();
    const locator = await prepareElevenLabsAccentDictionary({
      tenantId: "tenant",
      apiKey: "secret",
      plan: accentPlan,
      rules,
      privacyMode: "online",
      fetchImpl: recovered.fetchImpl,
    });
    assert.ok(locator);
    assert.equal(recovered.dictionaries.size, 1);
  });
});
