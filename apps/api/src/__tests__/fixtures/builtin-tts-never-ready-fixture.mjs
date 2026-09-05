// Models a child that spawned successfully but never completed its bootstrap.
process.on("message", () => undefined);
process.on("disconnect", () => process.exit(0));
