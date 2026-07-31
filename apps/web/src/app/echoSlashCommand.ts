/**
 * Shared `/echo` system command parser.
 *
 * Forces an addressed bot to speak the following prose verbatim (after any
 * composer wildcard expansion). Supports:
 * - Unquoted prose: `/echo hello there`
 * - Quoted Coffee form: `/echo "hello" + *cheers*`
 * - Optional trailing `--wait` / `-load` seconds
 * - Leading bot mention chips used only for addressing
 */

export type ParsedEchoSlashCommand =
  | { kind: "none" }
  | { kind: "error"; error: string }
  | {
      kind: "ok";
      message: string;
      waitSeconds: number;
    };

export const ECHO_SLASH_COMMAND_USAGE =
  'Use `/echo your words` or `/echo "quoted words"` (supports `+ *action*`) with optional `--wait <seconds>` (also supports `-load`).';

const ECHO_WAIT_ARG_RE =
  /^(?:(?:[\t ]*)(?:--wait|--load|-load)[\t ]+([0-9]+(?:\.[0-9]+)?))?[\t ]*$/u;

const TRAILING_ECHO_WAIT_RE =
  /[\t ]+(?:--wait|--load|-load)[\t ]+([0-9]+(?:\.[0-9]+)?)\s*$/iu;

const LEADING_BOT_MENTION_RE =
  /^\[((?:[^\]]|\\.)*)\]\s*\(\s*prism-bot:\/\/([^)\s]+)\s*\)/i;

/**
 * Strip leading Prism bot mention chips (and surrounding spaces) so
 * `@Alice /echo hi` still parses as an echo command.
 */
export function stripLeadingBotMentionAddressing(text: string): string {
  let rest = text.trimStart();
  while (rest.length > 0) {
    LEADING_BOT_MENTION_RE.lastIndex = 0;
    const match = LEADING_BOT_MENTION_RE.exec(rest);
    if (!match) break;
    rest = rest.slice(match[0].length).trimStart();
  }
  return rest;
}

/** True when the draft is (or starts addressing) an `/echo` command. */
export function looksLikeEchoSlashCommand(text: string): boolean {
  const addressable = stripLeadingBotMentionAddressing(text.trim());
  return /^\/echo(?:\s|$)/i.test(addressable);
}

function parseEchoStringExpression(
  source: string,
): { message: string; tail: string } | null {
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
    if (ch === '"') {
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
        if (inner === '"') {
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
    if (source[cursor] !== '"' && source[cursor] !== "*") return null;
  }

  if (chunks.length === 0) return null;
  return {
    message: chunks.join(""),
    tail: source.slice(cursor),
  };
}

function parseWaitSeconds(raw: string | undefined): number | null {
  if (raw === undefined) return 0;
  const waitSeconds = Number(raw);
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0) return null;
  return waitSeconds;
}

/**
 * Parse a composer line as `/echo`. Returns `none` when the line is not an
 * echo command (including when non-mention prose precedes `/echo`).
 */
export function parseEchoSlashCommand(text: string): ParsedEchoSlashCommand {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "none" };

  const addressable = stripLeadingBotMentionAddressing(trimmed);
  const match = /^\/echo(?:\s|$)/i.exec(addressable);
  if (!match) return { kind: "none" };

  const rest = addressable.slice(match[0].length);
  const restTrimStart = rest.replace(/^[\t ]+/u, "");
  if (!restTrimStart) {
    return { kind: "error", error: ECHO_SLASH_COMMAND_USAGE };
  }

  // Quoted / stage-direction expression form (Coffee legacy).
  if (restTrimStart.startsWith('"') || restTrimStart.startsWith("*")) {
    const expression = parseEchoStringExpression(restTrimStart);
    if (!expression) {
      return { kind: "error", error: ECHO_SLASH_COMMAND_USAGE };
    }
    const waitArgMatch = ECHO_WAIT_ARG_RE.exec(expression.tail);
    if (!waitArgMatch) {
      return { kind: "error", error: ECHO_SLASH_COMMAND_USAGE };
    }
    const waitSeconds = parseWaitSeconds(waitArgMatch[1]);
    if (waitSeconds === null) {
      return { kind: "error", error: ECHO_SLASH_COMMAND_USAGE };
    }
    if (expression.message.trim().length === 0) {
      return {
        kind: "error",
        error: "Quoted `/echo` messages cannot be empty.",
      };
    }
    return {
      kind: "ok",
      message: expression.message,
      waitSeconds,
    };
  }

  // Unquoted prose: everything after `/echo`, minus a trailing wait flag.
  const waitOnly = ECHO_WAIT_ARG_RE.exec(restTrimStart);
  if (waitOnly && waitOnly[1] !== undefined) {
    // `/echo --wait 1` has no spoken prose.
    return { kind: "error", error: ECHO_SLASH_COMMAND_USAGE };
  }
  const trailingWait = TRAILING_ECHO_WAIT_RE.exec(restTrimStart);
  let message = restTrimStart;
  let waitSeconds = 0;
  if (trailingWait) {
    const parsedWait = parseWaitSeconds(trailingWait[1]);
    if (parsedWait === null) {
      return { kind: "error", error: ECHO_SLASH_COMMAND_USAGE };
    }
    waitSeconds = parsedWait;
    message = restTrimStart.slice(0, trailingWait.index).trimEnd();
  }

  if (message.trim().length === 0) {
    return { kind: "error", error: ECHO_SLASH_COMMAND_USAGE };
  }

  return {
    kind: "ok",
    message,
    waitSeconds,
  };
}
