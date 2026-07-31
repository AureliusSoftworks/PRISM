import {
  ECHO_SLASH_COMMAND_USAGE,
  parseEchoSlashCommand,
} from "./echoSlashCommand.ts";

export type ParsedCoffeeDevCommand =
  | { kind: "none" }
  | { kind: "error"; error: string }
  | { kind: "toggleDev" }
  | {
      kind: "ok";
      message: string;
      waitSeconds: number;
    };

export function parseCoffeeDevCommand(text: string): ParsedCoffeeDevCommand {
  const trimmed = text.trim();
  if (/^\/dev(?:\s|$)/i.test(trimmed)) {
    return trimmed.replace(/^\/dev/i, "").trim().length === 0
      ? { kind: "toggleDev" }
      : {
          kind: "error",
          error: "Use `/dev` by itself to toggle Coffee debug mode.",
        };
  }

  const echo = parseEchoSlashCommand(trimmed);
  if (echo.kind === "none") return { kind: "none" };
  if (echo.kind === "error") {
    return {
      kind: "error",
      error: echo.error.includes("`/echo")
        ? echo.error
        : ECHO_SLASH_COMMAND_USAGE,
    };
  }
  return {
    kind: "ok",
    message: echo.message,
    waitSeconds: echo.waitSeconds,
  };
}
