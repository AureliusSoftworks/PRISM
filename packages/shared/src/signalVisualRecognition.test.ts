import assert from "node:assert/strict";
import test from "node:test";
import {
  createBotVisualIdentitySignatureV1,
  resolveSignalVisualRecognitionSubjectsV1,
  signalVisualAppearanceHash,
  signalVisualColorDeltaE2000,
  signalVisualColorsMatch,
  type SignalVisualPassportCandidateV1,
  type SignalVisualRawSubjectEvidenceV1,
} from "./signalVisualRecognition.ts";

const presentedAt = "2026-08-29T20:00:00.000Z";

function candidate(
  token: string,
  botId: string,
  color: string,
  glyph = "star",
  eyeCharacter = "o",
): SignalVisualPassportCandidateV1 {
  const signature = createBotVisualIdentitySignatureV1({
    botId,
    color,
    glyph,
    face: { faceEyeCharacter: eyeCharacter, faceMouthCharacter: "—" },
    presentedAt,
  });
  assert.ok(signature);
  return {
    token,
    botId,
    sourceRevision: "rev-1",
    pageIndex: 0,
    recognitionEligible: true,
    signature,
  };
}

function subject(
  candidates: SignalVisualRawSubjectEvidenceV1["candidates"],
  observedColor = "#ff0000",
): SignalVisualRawSubjectEvidenceV1 {
  return {
    region: { x: 0.1, y: 0.1, width: 0.3, height: 0.5 },
    colorEvidenceRegion: { x: 0.12, y: 0.12, width: 0.2, height: 0.2 },
    observedColor,
    candidates,
  };
}

test("appearance hashes are stable across key order and change with face or Ink", () => {
  assert.equal(signalVisualAppearanceHash({ b: 2, a: 1 }), signalVisualAppearanceHash({ a: 1, b: 2 }));
  assert.notEqual(signalVisualAppearanceHash({ face: "o_o" }), signalVisualAppearanceHash({ face: "x_x" }));
  assert.notEqual(signalVisualAppearanceHash({ ink: null }), signalVisualAppearanceHash({ ink: { version: 1 } }));
});

test("signature creation normalizes visible color and legacy face fields", () => {
  const signature = createBotVisualIdentitySignatureV1({
    botId: "bot-1",
    color: "#884422",
    glyph: "moon",
    face: {},
    presentedAt,
  });
  assert.ok(signature);
  assert.match(signature.color, /^#[0-9a-f]{6}$/u);
  assert.equal(signature.allowedVariants.join(","), "neutral,blink,speech,thinking");
  assert.equal(signature.appearanceHash.length, 16);
});

test("CIEDE2000 threshold accepts a narrow perceptual neighbor and rejects a different hue", () => {
  assert.equal(signalVisualColorDeltaE2000("#ff0000", "#fa0805") < 12, true);
  assert.equal(signalVisualColorsMatch("#ff0000", "#fa0805"), true);
  assert.equal(signalVisualColorsMatch("#ff0000", "#00ff00"), false);
  assert.equal(signalVisualColorsMatch("#ff0000", "#ffffff"), false);
});

test("one subject needs color AND glyph AND face from one candidate", () => {
  const red = candidate("AAAABBBB", "red", "#ff0000");
  const [resolved] = resolveSignalVisualRecognitionSubjectsV1({
    candidates: [red],
    rawSubjects: [subject([{ token: red.token, color: "match", glyph: "match", face: "missing" }])],
  });
  assert.equal(resolved?.recognizedBotId, null);
  assert.deepEqual(resolved?.cueStates, { color: "match", glyph: "match", face: "missing" });
});

test("cues cannot be combined across candidates in the same region", () => {
  const red = candidate("AAAABBBB", "red", "#ff0000");
  const blue = candidate("CCCCDDDD", "blue", "#0000ff");
  const [resolved] = resolveSignalVisualRecognitionSubjectsV1({
    candidates: [red, blue],
    rawSubjects: [subject([
      { token: red.token, color: "match", glyph: "match", face: "missing" },
      { token: blue.token, color: "conflict", glyph: "missing", face: "match" },
    ])],
  });
  assert.equal(resolved?.recognizedBotId, null);
});

test("a unique 3-of-3 match resolves while duplicate signatures remain anonymous", () => {
  const unique = candidate("AAAABBBB", "unique", "#ff0000", "star", "o");
  const [resolved] = resolveSignalVisualRecognitionSubjectsV1({
    candidates: [unique],
    rawSubjects: [subject([{ token: unique.token, color: "match", glyph: "match", face: "match" }])],
  });
  assert.equal(resolved?.recognizedBotId, "unique");

  const duplicate = candidate("CCCCDDDD", "duplicate", "#ff0000", "star", "o");
  const [ambiguous] = resolveSignalVisualRecognitionSubjectsV1({
    candidates: [unique, duplicate],
    rawSubjects: [subject([{ token: unique.token, color: "match", glyph: "match", face: "match" }])],
  });
  assert.equal(ambiguous?.recognizedBotId, null);
});

test("missing same-subject color evidence blocks a model-declared match", () => {
  const red = candidate("AAAABBBB", "red", "#ff0000");
  const raw = subject([{ token: red.token, color: "match", glyph: "match", face: "match" }]);
  raw.colorEvidenceRegion = null;
  const [resolved] = resolveSignalVisualRecognitionSubjectsV1({ candidates: [red], rawSubjects: [raw] });
  assert.equal(resolved?.recognizedBotId, null);
});
