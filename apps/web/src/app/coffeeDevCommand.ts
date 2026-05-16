export type ParsedCoffeeDevCommand =
  | { kind: "none" }
  | { kind: "error"; error: string }
  | {
      kind: "ok";
      message: string;
      waitSeconds: number;
    };

const COFFEE_COMMAND_USAGE =
  'Use `/echo "message"` or `/echo "a" + "b"` (supports `+ *action*`) with optional `--wait <seconds>` (also supports `-load`).';
const ECHO_WAIT_ARG_RE =
  /^(?:(?:[\t ]*)(?:--wait|--load|-load)[\t ]+([0-9]+(?:\.[0-9]+)?))?[\t ]*$/u;

function parseEchoStringExpression(source: string): { message: string; tail: string } | null {
  let cursor = 0;
  const chunks: string[] = [];
  const len = source.length;

  const consumeWhitespace = () => {
    while (cursor < len && /[\t ]/u.test(source[cursor] ?? "")) {
      cursor += 1;
    }
  };

  consumeWhitespace();
  while (cursor < len) {
    const ch = source[cursor] ?? "";
    if (ch === "\"") {
      cursor += 1;
      let chunk = "";
      let closed = false;
      while (cursor < len) {
        const inner = source[cursor] ?? "";
        if (inner === "\\") {
          const escaped = source[cursor + 1];
          if (typeof escaped === "string") {
            chunk += escaped;
            cursor += 2;
            continue;
          }
        }
        if (inner === "\"") {
          closed = true;
          cursor += 1;
          break;
        }
        chunk += inner;
        cursor += 1;
      }
      if (!closed) return null;
      chunks.push(chunk);
    } else if (ch === "*") {
      let end = cursor + 1;
      while (end < len && source[end] !== "*") {
        end += 1;
      }
      if (end >= len) return null;
      const action = source.slice(cursor, end + 1);
      chunks.push(action);
      cursor = end + 1;
    } else {
      break;
    }
    consumeWhitespace();
    if (source[cursor] !== "+") break;
    cursor += 1;
    consumeWhitespace();
    if (source[cursor] !== "\"" && source[cursor] !== "*") return null;
  }

  if (chunks.length === 0) return null;
  return {
    message: chunks.join(""),
    tail: source.slice(cursor),
  };
}

export function parseCoffeeDevCommand(
  text: string,
  _unusedBotsForBackCompat?: unknown,
  _unusedRandomForBackCompat?: unknown
): ParsedCoffeeDevCommand {
  const trimmed = text.trim();
  const match = /^\/echo(?:\s|$)/i.exec(trimmed);
  if (!match) return { kind: "none" };

  const rest = trimmed.slice(match[0].length).trim();
  if (!rest) return { kind: "error", error: COFFEE_COMMAND_USAGE };

  const expression = parseEchoStringExpression(rest);
  if (!expression) {
    return { kind: "error", error: COFFEE_COMMAND_USAGE };
  }

  const quoted = expression.message;
  const waitArgTail = expression.tail;
  const waitArgMatch = ECHO_WAIT_ARG_RE.exec(waitArgTail);
  if (!waitArgMatch) {
    return { kind: "error", error: COFFEE_COMMAND_USAGE };
  }
  const waitSeconds = waitArgMatch[1] ? Number(waitArgMatch[1]) : 0;
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0) {
    return { kind: "error", error: COFFEE_COMMAND_USAGE };
  }

  if (quoted.trim().length === 0) {
    return { kind: "error", error: "Quoted `/echo` messages cannot be empty." };
  }
  return {
    kind: "ok",
    message: quoted,
    waitSeconds,
  };
}
