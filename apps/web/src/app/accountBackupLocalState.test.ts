import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

describe("account backup browser-local state", () => {
  it("exports Prompt Center state with the account archive", () => {
    const exportSource = sourceBetween(
      "async function exportAccountAsPrismArchive()",
      "function parseAccountBackupFromJson",
    );

    assert.match(exportSource, /commandCenter:\s*\{/u);
    assert.match(exportSource, /preferredModel:\s*commandCenterPreferredModel/u);
    assert.match(exportSource, /commands:\s*commandCenterCommands/u);
    assert.match(exportSource, /wildcardDecks:\s*commandCenterWildcardDecks/u);
  });

  it("normalizes and restores Prompt Center state after the server snapshot", () => {
    const parseSource = sourceBetween(
      "function parseAccountBackupFromJson",
      "function restoreAccountBotLibraryGroups",
    );
    const restoreSource = sourceBetween(
      "function restoreAccountCommandCenter",
      "async function importAccountFromPrismFile",
    );
    const importSource = sourceBetween(
      "async function importAccountFromPrismFile",
      "async function handleAccountImportFileSelection",
    );

    assert.match(parseSource, /normalizeCommandCenterState\(record\.commandCenter\)/u);
    assert.match(restoreSource, /setCommandCenterPreferredModel/u);
    assert.match(restoreSource, /setCommandCenterCommands/u);
    assert.match(restoreSource, /setCommandCenterWildcardDecks/u);
    assert.match(restoreSource, /commandCenterStateStorageKey\(user\.id\)/u);
    assert.ok(
      importSource.indexOf("await refreshAll()") <
        importSource.indexOf("restoreAccountCommandCenter(backup.commandCenter)"),
      "Prompt Center should be restored after the server snapshot refresh",
    );
  });

  it("keeps legacy backups without Prompt Center state compatible", () => {
    const parseSource = sourceBetween(
      "function parseAccountBackupFromJson",
      "function restoreAccountBotLibraryGroups",
    );

    assert.match(parseSource, /\("commandCenter" in record/u);
    assert.match(parseSource, /return \{ snapshot: record \};/u);
  });
});
