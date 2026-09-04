import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  roomLightTuneVerdictFromJudgeV1,
  validateRoomLightTuneSheetV1,
} from "../debate-mystery-room-light-tune.ts";

const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const detectorSource = readFileSync(new URL("../debate-mystery-room-lights.ts", import.meta.url), "utf8");

// The smallest valid PNG header is enough: the validator checks magic and size, never pixels.
const tinyPng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]).toString("base64");
const lightIds = new Set(["light:lamp", "light:beam"]);
const sheet = {
  png: tinyPng, width: 1600, height: 900, columns: 2, tile: { width: 800, height: 450 },
  candidates: [{ label: "A", blend: "hard-light" }, { label: "B", blend: "overlay" }],
  markers: [{ label: "1", id: "light:lamp" }, { label: "2", id: "light:beam" }],
  pass: 1,
};

describe("bounded room light tuning route", () => {
  it("accepts a well-formed sheet and rejects the shapes that would waste a model call", () => {
    const valid = validateRoomLightTuneSheetV1(sheet, lightIds);
    assert.equal(valid.pass, 1);
    assert.equal(valid.png.length, 72);
    assert.deepEqual(valid.candidates.map((candidate) => candidate.blend), ["hard-light", "overlay"]);
    for (const [broken, reason] of [
      [{ ...sheet, png: Buffer.from("not a png at all").toString("base64") }, /PNG under 6 MB/u],
      [{ ...sheet, pass: 3 }, /pass must be 1 or 2/u],
      [{ ...sheet, candidates: [{ label: "A", blend: "multiply" }] }, /tuning shortlist/u],
      [{ ...sheet, candidates: [{ label: "A", blend: "screen" }, { label: "A", blend: "overlay" }] }, /unique letters/u],
      [{ ...sheet, markers: [{ label: "1", id: "light:ghost" }] }, /one of the room's lights/u],
      [{ ...sheet, columns: 3 }, /grid is invalid/u],
      [{ ...sheet, width: 10_000 }, /grid is invalid/u],
    ] as const) {
      assert.throws(() => validateRoomLightTuneSheetV1(broken, lightIds), reason);
    }
    // Pass 2 re-shows whatever pass 1 chose, which may be the room's saved pick.
    assert.equal(validateRoomLightTuneSheetV1({ ...sheet, pass: 2, candidates: [{ label: "A", blend: "screen" }] }, lightIds).pass, 2);
  });

  it("keys the judge's marker answers by light id and maps the chosen tile to its blend", () => {
    const verdict = roomLightTuneVerdictFromJudgeV1({
      candidate: " b ",
      lights: [
        { marker: "1", reading: "blown_out", intensity: 0.3, color: null },
        { marker: "9", reading: "ok", intensity: null, color: null },
        { marker: "2", reading: "ok", intensity: null, color: "#ffe0c0" },
      ],
      summary: "Warm and readable.",
    }, sheet);
    assert.equal(verdict.blend, "overlay");
    assert.deepEqual(verdict.lights, [
      { id: "light:lamp", reading: "blown_out", intensity: 0.3, color: null },
      { id: "light:beam", reading: "ok", intensity: null, color: "#ffe0c0" },
    ]);
    assert.equal(verdict.summary, "Warm and readable.");
    assert.deepEqual(roomLightTuneVerdictFromJudgeV1(null, sheet), { blend: null, lights: [], summary: null });
  });

  it("refuses LOCAL before any key lookup or model call, and shares the detector's eyes", () => {
    const route = serverSource.slice(serverSource.indexOf('"/api/debates/:id/mystery-room-lighting/tune"'));
    const refusal = route.indexOf('session.responseMode === "local"');
    const keyLookup = route.indexOf("getOpenAiApiKeyForUser(");
    const judge = route.indexOf("tuneDebateMysteryRoomLightingV1(");
    assert.ok(refusal > 0 && keyLookup > refusal && judge > keyLookup, "LOCAL refusal precedes the key lookup and the judge");
    assert.match(route.slice(0, judge), /validateRoomLightTuneSheetV1\(/u);
    assert.match(detectorSource, /export async function askVision</u);
  });
});
