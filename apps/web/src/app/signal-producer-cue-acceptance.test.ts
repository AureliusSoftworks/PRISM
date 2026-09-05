import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

test("Signal durably accepts a live Host redirect before model readiness", () => {
  const sendCue = signalSource.slice(
    signalSource.indexOf("const sendCue = async"),
    signalSource.indexOf(
      "const interruptGuestWithQueuedCue",
      signalSource.indexOf("const sendCue = async") + 1,
    ),
  );
  const redirectStart = sendCue.indexOf(
    "botcastProducerCuePreemptsHostSpeech",
  );
  const redirectQueue = sendCue.indexOf(
    'if (cue.kind !== "present_image"',
    redirectStart,
  );
  const normalQueue = sendCue.indexOf(
    'if (cue.kind !== "present_image"',
    redirectQueue + 1,
  );
  const redirectBranch = sendCue.slice(redirectStart, normalQueue);
  const durableQueueAt = redirectBranch.indexOf("await queueProducerCue(cue)");
  const serverOwnedCueAt = redirectBranch.indexOf(
    "queuedProducerCueRef.current",
  );
  const invalidateAt = redirectBranch.indexOf("invalidateEpisodeOperation()");
  const redirectAt = redirectBranch.indexOf("advanceEpisode(\n        redirectCue");

  assert.ok(durableQueueAt >= 0, "live redirect queues the cue durably");
  assert.ok(
    serverOwnedCueAt > durableQueueAt,
    "the redirect reuses the server-owned cue instead of superseding it",
  );
  assert.ok(
    invalidateAt > durableQueueAt,
    "the accepted cue survives replacing the audible Host operation",
  );
  assert.ok(
    redirectAt > invalidateAt,
    "model preparation begins only after durable cue acceptance",
  );
});

test("Signal restarts an idle guest-next floor after accepting a Host cue", () => {
  const sendCue = signalSource.slice(
    signalSource.indexOf("const sendCue = async"),
    signalSource.indexOf(
      "const interruptGuestWithQueuedCue",
      signalSource.indexOf("const sendCue = async") + 1,
    ),
  );
  const acceptedCueAt = sendCue.lastIndexOf("await queueProducerCue(cue)");
  const idleAdvanceAt = sendCue.indexOf(
    "if (!busy && speakingMessageId === null)",
    acceptedCueAt,
  );
  const hostOnlyAdvanceAt = sendCue.indexOf(
    'if (!busy && speakingMessageId === null && nextRole === "host")',
    acceptedCueAt,
  );

  assert.ok(acceptedCueAt >= 0, "the ordinary cue is accepted durably");
  assert.ok(
    idleAdvanceAt > acceptedCueAt,
    "cue acceptance explicitly advances any idle next-speaker floor",
  );
  assert.equal(
    hostOnlyAdvanceAt,
    -1,
    "guest-next must not depend only on a later React auto-run effect",
  );
});
