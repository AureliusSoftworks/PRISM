import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./DebateExperience.tsx", import.meta.url)),
  "utf8",
);

test("Spectator live HUD shows the For/Against favor bar from heard turns", () => {
  assert.match(source, /debateChairFavorabilityAtPlayhead/u);
  assert.match(
    source,
    /session\.playerRole === "spectator" &&[\s\S]{0,220}!spectatorAwaitingFirstWatch/u,
  );
  assert.match(source, /!debateIdentPlaying/u);
  assert.match(
    source,
    /session\.status === "paused" &&[\s\S]{0,80}!presenting &&[\s\S]{0,80}titleCardHolding/u,
  );
  assert.match(source, /aria-label="Moderator favor"/u);
  assert.match(source, /meterRole="spectator"/u);
  assert.match(source, /playerLabel=\{session\.forAdvocate\.name\}/u);
  assert.match(source, /opponentLabel=\{session\.againstAdvocate\.name\}/u);
  assert.match(
    source,
    /juryEnabled=\{false\}[\s\S]{0,80}detail=\{spectatorChairFavorability\.latestReason\}/u,
  );
});
