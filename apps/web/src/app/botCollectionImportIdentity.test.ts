import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8"
);

describe("grouped bot import identity", () => {
  it("updates the progress card from each nested bot archive", () => {
    const importStart = pageSource.indexOf("async function importBotCollectionBundle");
    const importEnd = pageSource.indexOf("async function fetchMarketplaceBotBundle", importStart);
    assert.ok(importStart >= 0 && importEnd > importStart);
    const importSource = pageSource.slice(importStart, importEnd);

    assert.match(
      importSource,
      /const identityHint = parseImportBotLoadingHint\(entry\.archiveBytes\);/
    );
    assert.match(
      importSource,
      /subject: entry\.importedName,[\s\S]*?accentColor: identityHint\.color,[\s\S]*?glyph: identityHint\.glyph,/
    );
  });
});
