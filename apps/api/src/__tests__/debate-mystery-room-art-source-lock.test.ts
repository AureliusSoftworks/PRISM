import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { describe, it } from "node:test";
import { CURRENT_MANSION_ROOM_ART_CONTRACT } from "@localai/shared";
import {
  assertDebateMysteryRoomSourceUnchangedV1,
  DEBATE_MYSTERY_ROOM_ALIGNMENT_CONTRACT_V1,
  isDebateMysteryRoomArtPairReadyV1,
  locallyValidateLegacyDebateMysteryRoomPairV1,
  normalizeDebateMysteryRoomSourceLockV1,
  shouldPrepareDebateMysteryRoomUpgradeV1,
  type DebateMysteryRoomPairRowV1,
} from "../debate-mystery-room-art-source-lock.ts";
import { compactReviewJson } from "../debate-mystery-assets.ts";
import { debateMysteryIllustratedRoomSubjectIdV1 } from "../debate-mystery-room-art.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const lock = {
  version: DEBATE_MYSTERY_ROOM_ALIGNMENT_CONTRACT_V1.version,
  referenceVersion: DEBATE_MYSTERY_ROOM_ALIGNMENT_CONTRACT_V1.referenceVersion,
  baseSha256: hash("Mosaic"),
  referenceSha256: hash("normalized gridless Mosaic"),
  candidateSha256: hash("HD"),
  approved: true,
  frameMatches: true,
  correlation: 0.96,
  detailCorrelation: 0.91,
  landmarkCorrelation: 0.71,
};
const base: DebateMysteryRoomPairRowV1 = Object.freeze({ status: "ready", sha256: lock.baseSha256, review_json: "{}" });
const derivative = (sourceLock: unknown = lock): DebateMysteryRoomPairRowV1 => ({
  status: "ready", sha256: lock.candidateSha256,
  review_json: JSON.stringify({ sourceLock, vision: { approved: true } }),
});

// Exercise the real server entry points without importing its listening server,
// live database, accounts, secrets, or provider implementations. Dependencies
// are in-memory fakes; an unexpected SQL mutation or network path fails here.
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
function serverFunction(name: string, nextName: string, dependencies: Record<string, unknown>): (...args: any[]) => any {
  const start = server.indexOf(`function ${name}(`);
  const end = server.indexOf(nextName, start);
  assert.ok(start > 0 && end > start);
  const code = `${server.slice(start - 6, start).trim() === "async" ? "async " : ""}${server.slice(start, end)}`;
  return new Function(...Object.keys(dependencies), `${stripTypeScriptTypes(code)}; return ${name};`)(...Object.values(dependencies));
}

const commonDependencies = {
  isDebateMysteryRoomArtPairReadyV1,
  shouldPrepareDebateMysteryRoomUpgradeV1,
  assertDebateMysteryRoomSourceUnchangedV1,
  DEBATE_MYSTERY_ROOM_ALIGNMENT_CONTRACT_V1,
  debateMysteryIllustratedRoomSubjectIdV1,
  createHash,
  validateStoredMysteryRoomPairV1: async (_user: string, _session: string, _room: string,
    _base: DebateMysteryRoomPairRowV1, derivative: DebateMysteryRoomPairRowV1) => derivative,
  HttpError: class extends Error {
    constructor(_status: number, message: string) { super(message); }
  },
};

describe("Whodunnit room source pairing", () => {
  it("pins the normalization version and retains only bounded source evidence", () => {
    assert.equal(lock.referenceVersion, CURRENT_MANSION_ROOM_ART_CONTRACT.version);
    assert.deepEqual(normalizeDebateMysteryRoomSourceLockV1({ ...lock, secret: "discard" }), lock);
    assert.equal(isDebateMysteryRoomArtPairReadyV1(base, derivative()), true);
  });

  it("retains the alignment certificate through the real vault review serializer", () => {
    const review = JSON.parse(compactReviewJson({ sourceLock: { ...lock, privatePrompt: "discard" }, vision: { approved: true } }));
    assert.deepEqual(review.sourceLock, lock);
    assert.equal(isDebateMysteryRoomArtPairReadyV1(base, { ...derivative(), review_json: JSON.stringify(review) }), true);
    assert.equal(JSON.parse(compactReviewJson({ sourceLock: { ...lock, approved: false } })).sourceLock, null);
  });

  it("rechecks valid legacy bytes locally without rewriting the row or bypassing a stale certificate", async () => {
    const legacy = Object.freeze({ ...derivative(), review_json: JSON.stringify({ vision: { approved: true } }) });
    let checks = 0;
    const validate = async () => { checks += 1; return lock; };
    const checked = await locallyValidateLegacyDebateMysteryRoomPairV1({ base, derivative: legacy, validate });
    assert.equal(isDebateMysteryRoomArtPairReadyV1(base, checked), true);
    assert.equal(isDebateMysteryRoomArtPairReadyV1(base, legacy), false);
    const stale = derivative({ ...lock, baseSha256: hash("old") });
    assert.equal(await locallyValidateLegacyDebateMysteryRoomPairV1({ base, derivative: stale, validate }), stale);
    assert.equal(checks, 1);
    assert.equal(await locallyValidateLegacyDebateMysteryRoomPairV1({
      base, derivative: legacy, validate: async () => ({ ...lock, candidateSha256: hash("other") }),
    }), legacy);
  });

  it("caches local legacy comparisons by tenant, case and exact byte pair without writes or generation", async () => {
    let comparisons = 0;
    const legacy = { ...derivative(), review_json: JSON.stringify({ vision: { approved: true } }) };
    const check = serverFunction("validateStoredMysteryRoomPairV1", "async function debateMysteryRoomArtUpgradeStatusV1(", {
      ...commonDependencies,
      locallyValidateLegacyDebateMysteryRoomPairV1,
      normalizeDebateMysteryRoomSourceLockV1,
      mysteryLegacyRoomPairChecks: new Map(),
      db: {}, decryptUserKey: () => Buffer.alloc(32),
      getDebateMysteryAssetFileForPreparationV1: (_db: unknown, _key: unknown, _owner: string, _case: string, _kind: string, subject: string) =>
        subject.endsWith(":illustrated-v1")
          ? { bytes: Buffer.from("HD"), sha256: lock.candidateSha256 }
          : { bytes: Buffer.from("Mosaic"), sha256: lock.baseSha256 },
      renderDebateMysteryRoomArtV1: async () => ({ bytes: Buffer.from("normalized gridless Mosaic") }),
      validateDebateMysteryRoomArtSourceAlignmentV1: async () => { comparisons += 1; return lock; },
    });
    assert.equal(isDebateMysteryRoomArtPairReadyV1(base, await check("owner", "case", "room", base, legacy)), true);
    await check("owner", "case", "room", base, legacy);
    assert.equal(comparisons, 1);
    await check("another-owner", "case", "room", base, legacy);
    assert.equal(comparisons, 2);
    const changed = { ...base, sha256: hash("changed after query") };
    assert.equal(isDebateMysteryRoomArtPairReadyV1(changed, await check("owner", "case", "room", changed, legacy)), false);
    assert.equal(comparisons, 2, "changed bytes must be rejected before geometry approval");
  });

  it("withholds missing, malformed, stale and rejected source evidence", () => {
    for (const field of Object.keys(lock)) {
      const missing: Record<string, unknown> = { ...lock };
      delete missing[field];
      assert.equal(isDebateMysteryRoomArtPairReadyV1(base, derivative(missing)), false, field);
    }
    for (const changed of [
      { version: 1 }, { referenceVersion: 5 }, { baseSha256: hash("another room") },
      { referenceSha256: "" }, { candidateSha256: hash("another derivative") },
      { approved: false }, { frameMatches: false }, { correlation: 0.7 },
      { detailCorrelation: 0.7 }, { landmarkCorrelation: 0.2 }, { correlation: Infinity },
    ]) assert.equal(isDebateMysteryRoomArtPairReadyV1(base, derivative({ ...lock, ...changed })), false);
    for (const review_json of ["{}", "null", "[]", "bad json", JSON.stringify({ sourceLock: lock, vision: { approved: false } })]) {
      assert.equal(isDebateMysteryRoomArtPairReadyV1(base, { ...derivative(), review_json }), false);
    }
    assert.equal(isDebateMysteryRoomArtPairReadyV1({ ...base, sha256: null }, derivative()), false);
    assert.equal(isDebateMysteryRoomArtPairReadyV1({ ...base, sha256: hash("new Mosaic") }, derivative()), false);
    assert.equal(isDebateMysteryRoomArtPairReadyV1({ ...base, status: "pending" }, derivative()), false);
  });

  it("requires an explicit repair for a stale ready derivative, and reuses a matched pair", () => {
    const stale = derivative({ ...lock, baseSha256: hash("old Mosaic") });
    assert.equal(shouldPrepareDebateMysteryRoomUpgradeV1({ base, derivative: stale, explicitlyRequested: false }), false);
    assert.equal(shouldPrepareDebateMysteryRoomUpgradeV1({ base, derivative: stale, explicitlyRequested: true }), true);
    assert.equal(shouldPrepareDebateMysteryRoomUpgradeV1({ base, derivative: derivative(), explicitlyRequested: true }), false);
    assert.equal(shouldPrepareDebateMysteryRoomUpgradeV1({ base, derivative: undefined, explicitlyRequested: false }), true);
    assert.throws(() => assertDebateMysteryRoomSourceUnchangedV1({ ...base, sha256: hash("replaced") }, base.sha256!), /Mosaic changed/u);
    assert.throws(() => assertDebateMysteryRoomSourceUnchangedV1(undefined, base.sha256!), /Mosaic changed/u);
    assert.doesNotThrow(() => assertDebateMysteryRoomSourceUnchangedV1(base, base.sha256!));
  });

  it("polls actual status repeatedly without mutating rows or offering unproven art", async () => {
    const rows = Object.freeze([
      Object.freeze({ subject_id: "good", ...base }),
      Object.freeze({ subject_id: "good:illustrated-v1", ...derivative() }),
      Object.freeze({ subject_id: "stale", ...base, sha256: hash("replacement") }),
      Object.freeze({ subject_id: "stale:illustrated-v1", ...derivative() }),
      Object.freeze({ subject_id: "legacy", ...base }),
      Object.freeze({ subject_id: "legacy:illustrated-v1", ...derivative(), review_json: "{}" }),
    ]);
    const before = JSON.stringify(rows);
    let reads = 0;
    const status = serverFunction("debateMysteryRoomArtUpgradeStatusV1", "async function prepareDebateMysteryIllustratedRoomsV1(", {
      ...commonDependencies,
      mysteryRoomArtUpgradeRuns: new Map(),
      getDebateSession: () => ({ responseMode: "local", formatState: { format: "whodunnit", version: 2, rooms: ["good", "stale", "legacy"].map(id => ({ id })) } }),
      db: { prepare(sql: string) {
        assert.match(sql, /^SELECT/u);
        return { all(user: string, session: string) {
          assert.equal(user, "owner"); assert.equal(session, "case"); reads += 1; return rows;
        } };
      } },
    });
    const first = await status("owner", "case");
    assert.deepEqual(first.readyRoomIds, ["good"]);
    assert.deepEqual(first.failedRoomIds, ["stale", "legacy"]);
    assert.equal(first.canUpgrade, false);
    assert.deepEqual(await status("owner", "case"), first);
    assert.equal(reads, 2);
    assert.equal(JSON.stringify(rows), before);
  });
});

function preparationHarness(options: { local?: boolean; changeSource?: boolean; reject?: boolean } = {}) {
  const rows = new Map<string, DebateMysteryRoomPairRowV1>([
    ["selected", { ...base }], ["selected:illustrated-v1", { ...derivative(), review_json: "{}" }],
    ["unrelated", { ...base }], ["unrelated:illustrated-v1", derivative()],
  ]);
  const events: string[] = [];
  const prepare = serverFunction("prepareDebateMysteryIllustratedRoomsV1", "function queueDebateMysteryIllustratedRoomsV1(", {
    ...commonDependencies,
    console: { warn() {} },
    config: {},
    getUserRow: () => ({}),
    getDebateSession: () => ({ responseMode: options.local ? "local" : "online", formatState: {
      format: "whodunnit", version: 2, config: { houseStyle: { promptContract: "test" } },
      rooms: [{ id: "selected", name: "Lobby", floor: 1 }, { id: "unrelated", name: "Study", floor: 1 }],
    } }),
    decryptUserKey: () => { events.push("key"); return Buffer.alloc(32); },
    getOpenAiApiKeyForUser: () => "inert-test-value",
    debateMysteryRoomArtUpgradeStatusV1: () => ({ requiresUpgradeRoomIds: ["selected", "unrelated"] }),
    refractionSignal: (signal: AbortSignal) => signal,
    db: { prepare(sql: string) {
      assert.match(sql, /^SELECT/u);
      return { get(_user: string, _session: string, subject: string) { return rows.get(subject); } };
    } },
    setDebateMysteryAssetPendingV1: () => { events.push("pending"); },
    runMysteryAssetAttempt: (signal: AbortSignal, action: (signal: AbortSignal) => unknown) => action(signal),
    getDebateMysteryAssetFileForPreparationV1: () => ({ bytes: Buffer.from("Mosaic"), sha256: base.sha256 }),
    renderDebateMysteryRoomArtV1: async () => ({ bytes: Buffer.from("normalized gridless Mosaic") }),
    buildDebateMysteryIllustratedRoomUpgradePromptV1: () => "test",
    generateRawDebateMysteryCandidate: async () => {
      events.push("generate:selected");
      if (options.changeSource) rows.set("selected", { ...base, sha256: hash("replaced") });
      return { bytes: Buffer.from("HD"), model: "test" };
    },
    normalizeDebateMysteryUpgradedRoomArtV1: async (bytes: Buffer) => ({ bytes }),
    validateDebateMysteryRoomArtSourceAlignmentV1: async () => ({ ...lock, approved: !options.reject, minimumCorrelation: 0.78, minimumLandmarkCorrelation: 0.4 }),
    validateDebateMysteryAssetPixelsV1: async () => ({}),
    reviewDebateMysteryAssetWithVision: async () => ({ approved: true }),
    sealDebateMysteryAssetBytesV1: (_db: unknown, _key: unknown, args: { subjectId: string; review: unknown; bytes: Buffer }) => {
      events.push(`seal:${args.subjectId}`);
      rows.set(args.subjectId, { status: "ready", sha256: createHash("sha256").update(args.bytes).digest("hex"), review_json: JSON.stringify(args.review) });
    },
    setDebateMysteryAssetFallbackV1: () => { events.push("fallback"); },
    spoilerSafeMysteryAssetFailure: () => "rejected",
  });
  return { rows, events, prepare };
}

describe("bounded server room upgrade preparation", () => {
  it("does not repair unproven ready rows during background continuation", async () => {
    const { prepare, events, rows } = preparationHarness();
    const before = JSON.stringify([...rows]);
    await prepare("owner", "case");
    assert.deepEqual(events, ["key"]);
    assert.equal(JSON.stringify([...rows]), before);
  });

  it("explicitly repairs only the requested stale room and records its exact source", async () => {
    const { prepare, events, rows } = preparationHarness();
    const unrelated = rows.get("unrelated:illustrated-v1");
    await prepare("owner", "case", undefined, new Set(["selected"]));
    assert.deepEqual(events, ["key", "pending", "generate:selected", "seal:selected:illustrated-v1"]);
    assert.equal(isDebateMysteryRoomArtPairReadyV1(rows.get("selected"), rows.get("selected:illustrated-v1")), true);
    assert.deepEqual(JSON.parse(rows.get("selected:illustrated-v1")!.review_json).sourceLock.referenceSha256, lock.referenceSha256);
    assert.equal(rows.get("unrelated:illustrated-v1"), unrelated);
  });

  it("cannot seal a completion against a changed source, and preserves old bytes on rejection", async () => {
    for (const options of [{ changeSource: true }, { reject: true }]) {
      const { prepare, events, rows } = preparationHarness(options);
      const original = rows.get("selected:illustrated-v1");
      await prepare("owner", "case", undefined, new Set(["selected"]));
      assert.deepEqual(events, ["key", "pending", "generate:selected"]);
      assert.equal(rows.get("selected:illustrated-v1"), original);
      assert.equal(isDebateMysteryRoomArtPairReadyV1(rows.get("selected"), original), false);
    }
  });

  it("rejects LOCAL before keys, preparation or any generator call", async () => {
    const { prepare, events } = preparationHarness({ local: true });
    await assert.rejects(prepare("owner", "case", undefined, new Set(["selected"])), /LOCAL never sends/u);
    assert.deepEqual(events, []);
  });
});
