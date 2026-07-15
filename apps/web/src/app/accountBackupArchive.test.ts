import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, zipSync } from "fflate";

import { unzipAccountBackupJsonEntries } from "./accountBackupArchive.ts";

describe("account backup archive bounds", () => {
  it("extracts bounded JSON-only archives", () => {
    const archive = zipSync({ "backup.json": strToU8('{"schema":"v1"}') });
    const entries = unzipAccountBackupJsonEntries(archive, {
      maxArchiveBytes: 1_024,
      maxExpandedJsonBytes: 1_024,
      maxJsonEntries: 2,
    });
    assert.deepEqual(Object.keys(entries), ["backup.json"]);
  });

  it("rejects oversized expanded JSON before extraction", () => {
    const archive = zipSync({
      "backup.json": strToU8(JSON.stringify({ payload: "x".repeat(2_000) })),
    });
    assert.throws(
      () =>
        unzipAccountBackupJsonEntries(archive, {
          maxArchiveBytes: 10_000,
          maxExpandedJsonBytes: 512,
          maxJsonEntries: 2,
        }),
      /payload is too large/u,
    );
  });

  it("rejects non-JSON entries without expanding them", () => {
    const archive = zipSync({
      "backup.json": strToU8("{}"),
      "assets/room.png": new Uint8Array([1, 2, 3]),
    });
    assert.throws(
      () => unzipAccountBackupJsonEntries(archive),
      /cannot contain PNG/u,
    );
  });
});
