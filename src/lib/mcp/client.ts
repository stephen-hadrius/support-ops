import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { z, ZodTypeAny } from "zod";
import { createOAuthProvider } from "./oauthProvider";

export const MCP_SERVER_URLS: Record<string, string> = {
  pylon: "https://mcp.usepylon.com",
  notion: "https://mcp.notion.com/mcp",
  hadrius: "https://mcp.hadriusapi.com/codebase",
  linear: "https://mcp.linear.app/mcp",
};

export async function mcpFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = typeof input === "string" ? input : (input as any).url || String(input);
  
  if (url.includes(".well-known/oauth-protected-resource")) {
    url = "https://mcp.hadriusapi.com/codebase/.well-known/oauth-protected-resource";
  } else if (url.includes(".well-known/oauth-authorization-server")) {
    url = "https://mcp.hadriusapi.com/codebase/.well-known/oauth-authorization-server";
  } else if (url.endsWith("/register") && !url.includes("/codebase/")) {
    url = "https://mcp.hadriusapi.com/codebase/register";
  } else if (url.endsWith("/token") && !url.includes("/codebase/")) {
    url = "https://mcp.hadriusapi.com/codebase/token";
  }

  return fetch(url, init);
}

export function getServerUrl(provider: string): string {
  const url = MCP_SERVER_URLS[provider];
  if (!url) throw new Error(`Unknown MCP provider: ${provider}`);
  return url;
}

const clients = new Map<string, Client>();

export function resetClient(provider: string): void {
  clients.delete(provider);
}

export async function getMcpClient(provider: string, baseUrl: string): Promise<Client> {
  const cached = clients.get(provider);
  if (cached) return cached;

  const authProvider = createOAuthProvider(provider, baseUrl);
  const transport = new StreamableHTTPClientTransport(new URL(getServerUrl(provider)), {
    authProvider,
    ...(provider === "hadrius" ? { fetch: mcpFetch } : {}),
  });
  const client = new Client({ name: "pylon-triage", version: "0.1.0" });
  await client.connect(transport);
  clients.set(provider, client);
  return client;
}

export interface McpTextResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pylon documents per-tool rate limits (e.g. search/messages ~20/min, single-record gets ~60/min).
// Space calls to the same tool apart proactively instead of just retrying after a 429.
const TOOL_MIN_INTERVAL_MS: Record<string, number> = {
  search_issues: 3200,
  get_issue_messages: 3200,
};
const DEFAULT_MIN_INTERVAL_MS = 1300;

const nextAllowedAt = new Map<string, number>();
const throttleChains = new Map<string, Promise<void>>();

function throttle(key: string, intervalMs: number): Promise<void> {
  const previous = throttleChains.get(key) ?? Promise.resolve();
  const next = previous.then(async () => {
    const waitMs = Math.max(0, (nextAllowedAt.get(key) ?? 0) - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    nextAllowedAt.set(key, Date.now() + intervalMs);
  });
  throttleChains.set(key, next.catch(() => undefined));
  return next;
}

const MAX_RETRIES = 5;

/** Tool results carrying a rate-limit message come back as plain text with isError: true, not a thrown error. */
function isRateLimited(result: McpTextResult): boolean {
  if (!result.isError) return false;
  const text = result.content?.find((block) => block.type === "text")?.text ?? "";
  return /rate limit/i.test(text);
}

export async function callTool(
  provider: string,
  baseUrl: string,
  name: string,
  args: Record<string, unknown>,
): Promise<McpTextResult> {
  const key = `${provider}:${name}`;
  const intervalMs = TOOL_MIN_INTERVAL_MS[name] ?? DEFAULT_MIN_INTERVAL_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle(key, intervalMs);

    try {
      const client = await getMcpClient(provider, baseUrl);
      const result = (await client.callTool({ name, arguments: args })) as McpTextResult;
      if (!isRateLimited(result)) {
        if (result.isError) {
          const text = result.content?.find((block) => block.type === "text")?.text ?? "Unknown tool error";
          throw new Error(`${provider}.${name} failed: ${text}`);
        }
        return result;
      }
      const backoffMs = 1000 * 2 ** attempt;
      console.warn(`${provider}.${name} rate limited, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(backoffMs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The cached client's access token expired mid-session (a long sync can outlast a short-lived
      // token). Drop the cached client so the next attempt reconnects and refreshes via refresh_token.
      if (/\b401\b|unauthorized/i.test(message) && attempt < MAX_RETRIES) {
        console.warn(`${provider}.${name} got 401, reconnecting (attempt ${attempt + 1}/${MAX_RETRIES})`);
        resetClient(provider);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`${provider}.${name} was rate limited after ${MAX_RETRIES} retries`);
}

/**
 * Parses and schema-validates a tool result's JSON payload, so malformed upstream responses fail
 * with a clear message at the boundary instead of surfacing as runtime errors deeper in the app.
 */
export function parseToolResult<Schema extends ZodTypeAny>(
  result: McpTextResult,
  schema: Schema,
  context: string,
): z.infer<Schema> {
  const text = result.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error(`${context}: MCP tool call returned no text content`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${context}: MCP tool returned invalid JSON`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? ` at ${issue.path.join(".")}` : "";
    throw new Error(`${context}: unexpected payload shape${where} — ${issue?.message ?? "validation failed"}`);
  }
  return parsed.data;
}

export function toolResultText(result: McpTextResult): string {
  return result.content?.find((block) => block.type === "text")?.text ?? "";
}
