import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

function productionSources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    if (!/\.(?:ts|tsx)$/u.test(entry.name) || /\.test\.tsx?$/u.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

describe("production diagnostic traffic guard", () => {
  it("keeps hard-coded local ingest traffic out of web and API sources", () => {
    const appDir = dirname(fileURLToPath(import.meta.url));
    const roots = [appDir, resolve(appDir, "../../../api/src")];
    const offenders = roots.flatMap((root) =>
      productionSources(root).filter((path) =>
        readFileSync(path, "utf8").includes("127.0.0.1:7914"),
      ),
    );
    assert.deepEqual(offenders, []);
  });
});
