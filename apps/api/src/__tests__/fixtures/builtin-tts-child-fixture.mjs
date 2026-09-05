let queue = Promise.resolve();
let ready = false;

process.on("message", (message) => {
  if (!message || message.type !== "generate") return;
  if (!ready) {
    process.send?.({
      type: "error",
      id: message.id,
      name: "Error",
      message: "request arrived before ready",
    });
    return;
  }
  queue = queue.then(async () => {
    if (message.text === "crash") process.exit(17);
    if (message.text === "hang") {
      process.on("SIGTERM", () => undefined);
      await new Promise(() => undefined);
    }
    const startedAt = Date.now();
    const busyMs = Number(message.text.match(/^busy:(\d+)$/)?.[1] ?? 0);
    const deadline = startedAt + busyMs;
    while (Date.now() < deadline) {
      // Deliberately block this child to model synchronous native ONNX work.
    }
    const payload = Buffer.from(
      JSON.stringify({
        text: message.text,
        pid: process.pid,
        startedAt,
        endedAt: Date.now(),
      }),
    );
    process.send?.({
      type: "result",
      id: message.id,
      waveBase64: payload.toString("base64"),
    });
  });
});

// Keep a real startup gap so the tests prove the parent waits for readiness.
setTimeout(() => {
  ready = true;
  process.send?.({ type: "ready" });
}, 35);

process.on("disconnect", () => process.exit(0));
