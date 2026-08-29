import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("generation broker source contract", () => {
  it("keeps direct auxiliary LocalOllamaProvider construction in provider infrastructure", () => {
    const violations: string[] = [];
    for (const path of sourceFiles(sourceRoot)) {
      if (path.endsWith("/providers.ts")) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/new LocalOllamaProvider\s*\(/gu)) {
        const start = Math.max(0, (match.index ?? 0) - 320);
        const end = Math.min(source.length, (match.index ?? 0) + 320);
        if (/auxiliary|OLLAMA_AUXILIARY_MODEL/iu.test(source.slice(start, end))) {
          violations.push(path);
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it("keeps all concrete text providers behind generation-work context", () => {
    const providers = readFileSync(join(sourceRoot, "providers.ts"), "utf8");
    assert.match(providers, /providerGenerationWork\(this\.name, options\)/u);
    for (const provider of ["openai", "anthropic"] as const) {
      assert.match(
        providers,
        new RegExp(`providerGenerationWork\\(\\"${provider}\\", options\\)`),
      );
    }
    assert.match(providers, /schedulePrismAuxiliaryWork\s*\(/u);
  });
});
