import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requestPhosphorFontProbe } from "./phosphorFontProbe.ts";

test("identical glyphs share real font loads and warm mouth changes do not reload", async () => {
  let loads = 0;
  let resolve!: (faces: FontFace[]) => void;
  const fonts = { load: () => { loads++; return new Promise<FontFace[]>((done) => { resolve = done; }); } };
  const first = requestPhosphorFontProbe(fonts, '20px "Face"', "o");
  for (let index = 0; index < 50; index++) {
    assert.equal(requestPhosphorFontProbe(fonts, '20px "Face"', "o"), first);
  }
  assert.equal(loads, 1);
  assert.equal(first.status, "pending");
  resolve([]);
  await first.settled;
  assert.equal(first.status, "loaded");
  assert.equal(requestPhosphorFontProbe(fonts, '20px "Face"', "o").status, "loaded");
  assert.equal(loads, 1);
  requestPhosphorFontProbe(fonts, '20px "Face"', "●");
  requestPhosphorFontProbe(fonts, '20px "Other"', "o");
  assert.equal(loads, 3, "content/unicode ranges and authored family remain distinct");
});

test("font parser/rejection failures retain fallback and permit later retry", async () => {
  let calls = 0;
  const fonts = { load: () => { calls++; return Promise.reject(new Error("font unavailable")); } };
  const failed = requestPhosphorFontProbe(fonts, "font", "o");
  await failed.settled;
  assert.equal(failed.status, "unavailable");
  await requestPhosphorFontProbe(fonts, "font", "o").settled;
  assert.equal(calls, 2);
  assert.equal(requestPhosphorFontProbe({ load: () => { throw new SyntaxError("WebKit"); } }, "font", "o").status, "unavailable");
});

test("glyph integration paints immediately, observes cold fonts, and skips settled ready churn", () => {
  const source = readFileSync(new URL("./PhosphorPixelGlyph.tsx", import.meta.url), "utf8");
  assert.match(source, /requestPhosphorFontProbe\(document\.fonts, fontProbe, content\)/u);
  assert.match(source, /renderMask\(\);[\s\S]*if \(document\.fonts\?\.status !== "loaded"\)/u);
  assert.match(source, /document\.fonts\?\.addEventListener\("loadingdone", handleFontsLoaded\)/u);
  assert.doesNotMatch(source, /document\.fonts\??\.check/u);
});
