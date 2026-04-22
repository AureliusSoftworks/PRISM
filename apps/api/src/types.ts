import type { IncomingMessage, ServerResponse } from "node:http";

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse<IncomingMessage>;
  body: unknown;
  params: Record<string, string>;
  query: URLSearchParams;
  userId?: string;
  sessionToken?: string;
}

export interface RouteDefinition {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: (ctx: RequestContext) => Promise<void>;
}
