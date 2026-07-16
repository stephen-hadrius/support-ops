import { getMcpClient } from "./client";

interface ResolvedTools {
  search?: string;
}

const resolvedByBaseUrl = new Map<string, ResolvedTools>();

/**
 * Hadrius's MCP server tool names are resolved dynamically by looking for a tool matching 'search'.
 */
async function resolveTools(baseUrl: string): Promise<ResolvedTools> {
  const cached = resolvedByBaseUrl.get(baseUrl);
  if (cached) return cached;

  const client = await getMcpClient("hadrius", baseUrl);
  const { tools } = await client.listTools();
  const search = tools.find((tool) => /search/i.test(tool.name))?.name;

  const resolved: ResolvedTools = { search };
  resolvedByBaseUrl.set(baseUrl, resolved);
  return resolved;
}

export interface ComplianceResult {
  /** Matching Hadrius compliance content as plain text; empty when nothing matched or the search failed. */
  text: string;
  /** False when the search itself failed (disconnected, no search tool, upstream error). */
  ok: boolean;
}

/** Searches compliance rules/documentation shared with the Hadrius integration. Failures are non-fatal but reported via `ok`. */
export async function searchCompliance(baseUrl: string, query: string): Promise<ComplianceResult> {
  try {
    const { search } = await resolveTools(baseUrl);
    if (!search) return { text: "", ok: false };

    const client = await getMcpClient("hadrius", baseUrl);
    const result = await client.callTool({ name: search, arguments: { query, page_size: 5 } });
    const blocks = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = blocks
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n\n");
    return { text, ok: true };
  } catch (err) {
    console.error("Hadrius compliance search failed, continuing without grounding:", err);
    return { text: "", ok: false };
  }
}
