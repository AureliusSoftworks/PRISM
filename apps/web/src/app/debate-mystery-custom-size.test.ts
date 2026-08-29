import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeWhodunnitCustomMansionRoomCount,
  whodunnitCustomMansionRoomMinimum,
} from "./debateMysterySetup.ts";

const experienceSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);

test("custom mansion room counts stay inside the playable topology range", () => {
  assert.equal(whodunnitCustomMansionRoomMinimum(4), 5);
  assert.equal(whodunnitCustomMansionRoomMinimum(8), 9);
  assert.equal(normalizeWhodunnitCustomMansionRoomCount(0, 4), 5);
  assert.equal(normalizeWhodunnitCustomMansionRoomCount("", 4), 5);
  assert.equal(normalizeWhodunnitCustomMansionRoomCount(6.9, 4), 6);
  assert.equal(normalizeWhodunnitCustomMansionRoomCount(19, 4), 18);
  assert.equal(normalizeWhodunnitCustomMansionRoomCount(5, 8), 9);
});

test("custom mansion controls normalize room edits and suspect changes", () => {
  assert.match(
    experienceSource,
    /min=\{mysteryCustomRoomMinimum\}/u,
  );
  assert.match(
    experienceSource,
    /normalizeWhodunnitCustomMansionRoomCount\(event\.currentTarget\.value, mysteryCustomSuspectCount\)/u,
  );
  assert.match(
    experienceSource,
    /normalizeWhodunnitCustomMansionRoomCount\(current, nextSuspectCount\)/u,
  );
  assert.match(
    experienceSource,
    /totalRooms: inspectedMysterySeed\?\.totalRooms \?\? normalizedMysteryTotalRooms/u,
  );
});
