import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fallbackSource = readFileSync(
  new URL("./PrismAppErrorFallback.tsx", import.meta.url),
  "utf8",
);
const routeErrorSource = readFileSync(
  new URL("./error.tsx", import.meta.url),
  "utf8",
);
const globalErrorSource = readFileSync(
  new URL("./global-error.tsx", import.meta.url),
  "utf8",
);

test("the shared app error screen copies sanitized diagnostics", () => {
  assert.match(fallbackSource, /buildWebDiagnosticReport\(\{/u);
  assert.match(fallbackSource, /writeDiagnosticClipboard\(/u);
  assert.match(fallbackSource, /operation: "render"/u);
  assert.match(fallbackSource, /stage: "error-boundary"/u);
  assert.match(fallbackSource, /"Copy error"/u);
  assert.match(fallbackSource, /"Error copied"/u);
  assert.match(fallbackSource, /"Copy failed — try again"/u);
});

test("route and global error boundaries provide their errors to the copy action", () => {
  assert.match(routeErrorSource, /error=\{error\}/u);
  assert.match(routeErrorSource, /surface="Route"/u);
  assert.match(globalErrorSource, /error=\{error\}/u);
  assert.match(globalErrorSource, /surface="Application shell"/u);
});
