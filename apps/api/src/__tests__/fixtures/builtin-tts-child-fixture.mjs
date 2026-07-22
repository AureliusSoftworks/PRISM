let queue = Promise.resolve();

process.on("message", (message) => {
  if (!message || message.type !== "generate") return;
  queue = queue.then(async () => {
    if (message.text === "crash") process.exit(17);
    const startedAt = Date.now();
    const busyMs = Number(message.text.match(/^busy:(\d+)$/)?.[1] ?? 0);
    const deadline = startedAt + busyMs;
    while (Date.now() < deadline) {
      // Deliberately block this child to model synchronous native ONNX work.
    }
    const payload = Buffer.from(
      JSON.stringify({
        text: message.text,
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

process.on("disconnect", () => process.exit(0));
